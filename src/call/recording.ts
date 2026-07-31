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

const IDLE: RecordingState = { phase: 'idle', mode: null };

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
  if (metadata === null) return IDLE;

  // `egress_ended` supprime les deux clés : l'absence de mode est l'état de
  // repos.
  const rawMode = metadata['recording_mode'];
  if (typeof rawMode !== 'string') return IDLE;
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
