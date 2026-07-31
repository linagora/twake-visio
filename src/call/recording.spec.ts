import { deriveRecordingState, recordingLabelKey, type RecordingState } from 'src/call/recording';

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
