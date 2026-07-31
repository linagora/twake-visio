import type { ApiError } from 'src/api/types';
import type { RoomAccess } from 'src/call/types';
import type { InstanceFeatures } from 'src/instance/types';

import {
  canStartRecording,
  deriveRecordingState,
  recordingErrorMessage,
  recordingLabelKey,
  type RecordingState,
} from 'src/call/recording';

function meta(fields: Record<string, string>): string {
  return JSON.stringify(fields);
}

describe('deriveRecordingState', () => {
  it('rend idle quand la Room ne porte aucune métadonnée', () => {
    expect(deriveRecordingState({ metadata: undefined, isRecording: false })).toEqual({
      phase: 'idle',
      mode: null,
    });
  });

  it('rend idle sur une métadonnée vide', () => {
    expect(deriveRecordingState({ metadata: '', isRecording: false })).toEqual({
      phase: 'idle',
      mode: null,
    });
  });

  it('rend idle sur une métadonnée qui n’est pas du JSON', () => {
    expect(deriveRecordingState({ metadata: 'pas du json', isRecording: false })).toEqual({
      phase: 'idle',
      mode: null,
    });
  });

  it('rend idle sur un JSON scalaire', () => {
    expect(deriveRecordingState({ metadata: '42', isRecording: false })).toEqual({
      phase: 'idle',
      mode: null,
    });
  });

  it('rend idle sur un JSON tableau', () => {
    expect(deriveRecordingState({ metadata: '[1,2]', isRecording: false })).toEqual({
      phase: 'idle',
      mode: null,
    });
  });

  it('rend idle sur un JSON qui vaut null', () => {
    // `typeof null === 'object'` en JavaScript : sans la garde explicite sur
    // `parsed === null`, cette valeur franchirait le test `typeof parsed !==
    // 'object'` et l'indexage qui suit lèverait au lieu de rendre idle
    // proprement. Aucun autre cas ci-dessus ne passe par cette branche : le
    // scalaire (`42`) et le tableau (`[1,2]`) l'évitent chacun pour une raison
    // différente.
    expect(deriveRecordingState({ metadata: 'null', isRecording: false })).toEqual({
      phase: 'idle',
      mode: null,
    });
  });

  it('rend idle quand le champ partagé porte autre chose que nos deux clés', () => {
    // `metadata` est une chaîne libre partagée avec d'autres fonctionnalités :
    // le parse est défensif, comme celui du web.
    expect(
      deriveRecordingState({ metadata: meta({ autre_fonctionnalite: 'vrai' }), isRecording: true }),
    ).toEqual({ phase: 'idle', mode: null });
  });

  it('rend starting sur le statut starting', () => {
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'screen_recording', recording_status: 'starting' }),
        isRecording: false,
      }),
    ).toEqual({ phase: 'starting', mode: 'screen_recording' });
  });

  it('rend recording quand started et isRecording concordent', () => {
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'screen_recording', recording_status: 'started' }),
        isRecording: true,
      }),
    ).toEqual({ phase: 'recording', mode: 'screen_recording' });
  });

  it('reste starting quand started arrive avant isRecording', () => {
    // L'egress est accepté mais LiveKit ne l'a pas encore signalé. C'est la
    // règle exacte du bundle déployé : `isRecording` départage le libellé, il
    // ne décide jamais qu'il se passe quelque chose.
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'screen_recording', recording_status: 'started' }),
        isRecording: false,
      }),
    ).toEqual({ phase: 'starting', mode: 'screen_recording' });
  });

  it('rend saving', () => {
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'transcript', recording_status: 'saving' }),
        isRecording: true,
      }),
    ).toEqual({ phase: 'saving', mode: 'transcript' });
  });

  it('rend aborted', () => {
    // L'egress est mort ; le taire rendrait un échec indiscernable d'un
    // non-démarrage.
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'transcript', recording_status: 'aborted' }),
        isRecording: false,
      }),
    ).toEqual({ phase: 'aborted', mode: 'transcript' });
  });

  it('sur-signale un statut inconnu', () => {
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'screen_recording', recording_status: 'quelque_chose' }),
        isRecording: false,
      }),
    ).toEqual({ phase: 'recording', mode: 'screen_recording' });
  });

  it('sur-signale un mode sans statut', () => {
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'transcript' }),
        isRecording: false,
      }),
    ).toEqual({ phase: 'recording', mode: 'transcript' });
  });

  it('signale l’activité sans mentir sur un mode inconnu', () => {
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'holographie', recording_status: 'starting' }),
        isRecording: false,
      }),
    ).toEqual({ phase: 'starting', mode: null });
  });

  it('rend idle sur un statut sans mode', () => {
    // `egress_ended` supprime les deux clés : l'absence de mode est l'état de
    // repos, quel que soit ce qui reste à côté.
    expect(
      deriveRecordingState({
        metadata: meta({ recording_status: 'started' }),
        isRecording: true,
      }),
    ).toEqual({ phase: 'idle', mode: null });
  });

  it('ne modifie pas le signal reçu', () => {
    // Le module est pur : `readonly` sur `RoomRecordingSignal` empêche
    // l'affectation au typage, mais pas une assertion locale qui la
    // réintroduirait — la non-mutation vaut donc d'être vérifiée, pas
    // seulement supposée par le type. `metadata` et `isRecording` sont des
    // primitives ; une copie superficielle suffit à en garder la trace.
    const signal = {
      metadata: meta({ recording_mode: 'transcript', recording_status: 'saving' }),
      isRecording: true,
    };
    const snapshot = { ...signal };

    deriveRecordingState(signal);

    expect(signal).toEqual(snapshot);
  });
});

describe('recordingLabelKey', () => {
  const state = (phase: RecordingState['phase'], mode: RecordingState['mode']): RecordingState =>
    ({ phase, mode }) as RecordingState;

  it('ne dit rien au repos', () => {
    expect(recordingLabelKey(state('idle', null))).toBe(null);
  });

  it('annonce le démarrage', () => {
    expect(recordingLabelKey(state('starting', 'screen_recording'))).toBe('recording.starting');
  });

  it('annonce un enregistrement d’écran', () => {
    expect(recordingLabelKey(state('recording', 'screen_recording'))).toBe('recording.active');
  });

  it('annonce une transcription sous son propre nom', () => {
    expect(recordingLabelKey(state('recording', 'transcript'))).toBe('recording.transcriptActive');
  });

  it('annonce la sauvegarde', () => {
    expect(recordingLabelKey(state('saving', 'screen_recording'))).toBe('recording.saving');
  });

  it('annonce l’interruption', () => {
    expect(recordingLabelKey(state('aborted', 'screen_recording'))).toBe('recording.aborted');
  });
});

const FEATURES = (recording: boolean): InstanceFeatures => ({
  recording,
  subtitle: true,
  telephony: false,
});

const ACCESS = (isAdministrable: boolean): RoomAccess => ({
  room: { id: 'r-1', slug: 'reunion', name: 'R', accessLevel: 'trusted' },
  livekitUrl: 'wss://lk',
  token: 'lk',
  isAdministrable,
});

describe('canStartRecording', () => {
  it('ouvre la commande à un administrateur sur une instance qui enregistre', () => {
    expect(canStartRecording(FEATURES(true), ACCESS(true))).toBe(true);
  });

  it('la ferme sans droit d’administration', () => {
    expect(canStartRecording(FEATURES(true), ACCESS(false))).toBe(false);
  });

  it('la ferme quand l’instance n’enregistre pas', () => {
    // Sans `recording.is_enabled`, l'instance répond 404 : le bouton serait un
    // geste voué à échouer.
    expect(canStartRecording(FEATURES(false), ACCESS(true))).toBe(false);
  });

  it('la ferme quand ni l’un ni l’autre', () => {
    expect(canStartRecording(FEATURES(false), ACCESS(false))).toBe(false);
  });
});

describe('recordingErrorMessage', () => {
  const server = (status: number): ApiError => ({ kind: 'server', status });

  it('traduit le 409 du démarrage en « déjà en cours »', () => {
    // `mapStatus` ne traite spécialement que 403 et 404 : le 409 arrive en
    // `{ kind: 'server', status: 409 }`, donc lisible.
    expect(recordingErrorMessage('start', server(409))).toBe('recording.errorBusy');
  });

  it('ne traduit pas le 409 de l’arrêt de la même façon', () => {
    expect(recordingErrorMessage('stop', server(409))).toBe('recording.errorStopFailed');
  });

  it('distingue le 404 du démarrage de celui de l’arrêt', () => {
    // Sur `start` il est ambigu (fonctionnalité coupée ou salon inconnu) ; sur
    // `stop` il veut dire « aucun enregistrement au statut actif ».
    expect(recordingErrorMessage('start', { kind: 'not-found' })).toBe(
      'recording.errorUnavailable',
    );
    expect(recordingErrorMessage('stop', { kind: 'not-found' })).toBe('recording.errorNotActive');
  });

  it('dit le refus de permission dans les deux sens', () => {
    expect(recordingErrorMessage('start', { kind: 'forbidden' })).toBe('recording.errorForbidden');
    expect(recordingErrorMessage('stop', { kind: 'forbidden' })).toBe('recording.errorForbidden');
  });

  it('garde les deux messages généraux du socle', () => {
    expect(recordingErrorMessage('start', { kind: 'network' })).toBe('error.network');
    expect(recordingErrorMessage('stop', { kind: 'unauthorized' })).toBe('error.unauthorized');
  });

  it('retombe sur l’échec de l’action pour les autres statuts serveur', () => {
    expect(recordingErrorMessage('start', server(502))).toBe('recording.errorStartFailed');
    expect(recordingErrorMessage('stop', server(500))).toBe('recording.errorStopFailed');
    expect(recordingErrorMessage('start', server(400))).toBe('recording.errorStartFailed');
  });

  it('traite validation et lobby comme un échec d’action', () => {
    // `lobby` n'est jamais produit par `authedFetch` — seul `fetchRoomAccess`
    // le fabrique. Il est traité parce que l'union doit l'être exhaustivement.
    expect(
      recordingErrorMessage('start', { kind: 'validation', fields: { mode: ['invalide'] } }),
    ).toBe('recording.errorStartFailed');
    expect(recordingErrorMessage('stop', { kind: 'lobby', participantId: 'p-1' })).toBe(
      'recording.errorStopFailed',
    );
  });
});
