import type { ApiError } from 'src/api/types';
import type { RoomAccess } from 'src/call/types';
import type { InstanceFeatures } from 'src/instance/types';

export type RecordingMode = 'screen_recording' | 'transcript';

// Le vocabulaire des métadonnées LiveKit, pas celui du modèle `Recording` du
// backend — lequel n'est jamais exposé au client en séance. `mode` vaut `null`
// quand un enregistrement tourne sous un nom que ce code ne connaît pas : on
// signale l'activité sans mentir sur sa nature.
export type RecordingState =
  | { readonly phase: 'idle'; readonly mode: null }
  | { readonly phase: 'starting'; readonly mode: RecordingMode | null }
  | { readonly phase: 'recording'; readonly mode: RecordingMode | null }
  | { readonly phase: 'saving'; readonly mode: RecordingMode | null }
  | { readonly phase: 'aborted'; readonly mode: RecordingMode | null };

// Les deux seules choses que la Room apporte. Les prendre en paramètres plutôt
// que de lire la Room garde ce module hors du SDK.
export type RoomRecordingSignal = {
  readonly metadata: string | undefined;
  readonly isRecording: boolean;
};

// Un littéral frais à chaque appel, jamais un objet partagé : `readonly`
// bloque la mutation au typage, pas à l'exécution, et un appelant qui
// contournerait le typage empoisonnerait tous les repos suivants s'il
// recevait toujours la même référence. Le coût est nul : `getSnapshot()`
// (`src/call/recordingStore.ts`) mémorise déjà sa propre valeur entre deux
// appels tant que rien n'a changé, ce qui suffit à la stabilité
// référentielle qu'exige `useSyncExternalStore`.
function makeIdleState(): RecordingState {
  return { phase: 'idle', mode: null };
}

// `metadata` est une chaîne libre, partagée avec d'autres fonctionnalités et
// écrite par un serveur que nous ne contrôlons pas : tout ce qui n'est pas un
// objet JSON est traité comme une absence, jamais comme une erreur.
function readMetadata(metadata: string | undefined): Record<string, unknown> | null {
  if (metadata === undefined || metadata.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function readMode(raw: unknown): RecordingMode | null {
  return raw === 'screen_recording' || raw === 'transcript' ? raw : null;
}

// `isRecording` ne sert qu'à départager `starting` de `recording` sur le statut
// `started` — jamais à décider qu'il se passe quelque chose. C'est la règle
// vérifiée du bundle web déployé : la respecter garantit qu'un participant
// mobile et un participant web ne voient jamais deux indicateurs
// contradictoires, ce qui, sur un signal de consentement, est une valeur en soi.
export function deriveRecordingState(signal: RoomRecordingSignal): RecordingState {
  const metadata = readMetadata(signal.metadata);
  if (metadata === null) return makeIdleState();

  // `egress_ended` supprime les deux clés : l'absence de mode est l'état de
  // repos.
  const rawMode = metadata['recording_mode'];
  if (typeof rawMode !== 'string') return makeIdleState();
  const mode = readMode(rawMode);

  const status = metadata['recording_status'];
  if (status === 'starting') return { phase: 'starting', mode };
  if (status === 'saving') return { phase: 'saving', mode };
  if (status === 'aborted') return { phase: 'aborted', mode };
  if (status === 'started') return { phase: signal.isRecording ? 'recording' : 'starting', mode };

  // Sur-signaler, jamais sous-signaler. Le web ferme sa liste de statuts et
  // exclurait un statut inconnu ; nous faisons l'inverse. Annoncer un
  // enregistrement qui n'a pas lieu est embarrassant, taire un enregistrement
  // qui a lieu est une trahison.
  return { phase: 'recording', mode };
}

export type RecordingLabelKey =
  | 'recording.starting'
  | 'recording.active'
  | 'recording.transcriptActive'
  | 'recording.saving'
  | 'recording.aborted';

// La table libellé/phase vit ici, pas dans la coquille : c'est la seule façon
// de l'éprouver ligne à ligne. `null` signifie « rien à afficher », le seul cas
// où l'indicateur ne rend rien.
export function recordingLabelKey(state: RecordingState): RecordingLabelKey | null {
  switch (state.phase) {
    case 'idle':
      return null;
    case 'starting':
      return 'recording.starting';
    case 'recording':
      return state.mode === 'transcript' ? 'recording.transcriptActive' : 'recording.active';
    case 'saving':
      return 'recording.saving';
    case 'aborted':
      return 'recording.aborted';
  }
}

// FRONTIÈRE DE DIVERGENCE `main` / déployé — tout ce qui suit vit ici et nulle
// part ailleurs.
//
//   `main`   : HasPrivilegesOnRoom  → is_administrator_or_owner exigé.
//   déployé  : HasRecordingPermission → niveau par mode, "authenticated" sur
//              meet.linagora.com aujourd'hui, donc strictement plus large.
//
// `isAdministrable` vaut exactement `is_administrator_or_owner`
// (src/call/types.ts:14-19). C'est l'intersection des deux contrats : tout
// appel que cette porte laisse passer est accepté par les deux serveurs.
//
// Pour élargir (arbitrage qui appartient au partenaire) : lire
// `recording_permissions` dans la réponse salon — le champ y est déjà sur le
// déployé, `src/api/rooms.ts` l'ignore — et le brancher ici. Rien d'autre à
// toucher.
//
// `features.recording` en fait partie : sans lui, l'instance répond 404, et la
// commande serait un geste voué à échouer.
export function canStartRecording(features: InstanceFeatures, access: RoomAccess): boolean {
  return features.recording && access.isAdministrable;
}

export type RecordingAction = 'start' | 'stop';

export type RecordingMessageKey =
  | 'recording.errorBusy'
  | 'recording.errorNotActive'
  | 'recording.errorUnavailable'
  | 'recording.errorForbidden'
  | 'recording.errorStartFailed'
  | 'recording.errorStopFailed'
  | 'error.network'
  | 'error.unauthorized';

function failed(action: RecordingAction): RecordingMessageKey {
  return action === 'start' ? 'recording.errorStartFailed' : 'recording.errorStopFailed';
}

// Le module d'API ne retraduit rien : c'est ici, et ici seulement, qu'un
// `ApiError` devient une phrase. Le `switch` est exhaustif sans `default` :
// un membre ajouté à `ApiError` casse la compilation plutôt que de tomber
// silencieusement dans un message générique.
//
// Le 400 de ces endpoints n'est pas une `validation` : son corps est
// `{"detail": "Invalid request."}`, une chaîne et non une liste, ce que
// `readValidation` exige. Il arrive donc en `{ kind: 'server', status: 400 }`,
// et signale de toute façon un bogue de l'application, pas une situation
// d'utilisateur.
export function recordingErrorMessage(
  action: RecordingAction,
  error: ApiError,
): RecordingMessageKey {
  switch (error.kind) {
    case 'network':
      return 'error.network';
    case 'unauthorized':
      return 'error.unauthorized';
    case 'forbidden':
      return 'recording.errorForbidden';
    // Sur `start`, le 404 est ambigu : une instance dont l'enregistrement est
    // coupé répond 404, pas 403. Le message reste au niveau de cette
    // ambiguïté — jamais « salon introuvable », qui serait faux une fois sur
    // deux. Sur `stop`, il veut dire « aucun enregistrement au statut actif ».
    case 'not-found':
      return action === 'start' ? 'recording.errorUnavailable' : 'recording.errorNotActive';
    case 'server':
      return action === 'start' && error.status === 409 ? 'recording.errorBusy' : failed(action);
    case 'validation':
      return failed(action);
    case 'lobby':
      return failed(action);
  }
}
