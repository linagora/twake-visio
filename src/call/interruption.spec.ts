import { renderHook } from '@testing-library/react-native';
import { Track } from 'livekit-client';
import type { LocalTrackPublication, Room } from 'livekit-client';
import { AppState, type AppStateStatus } from 'react-native';

import { restartLocalCapture, useInterruptionRecovery } from 'src/call/interruption';

// Un double de publication réduit à ce que `restartLocalCapture` lit : l'état
// coupé, la piste qui porte `restartTrack`, et l'état de la capture sous-jacente.
// Le reste de l'API de LiveKit n'est pas touché, donc pas simulé.
type FakeTrack = { restartTrack: jest.Mock; mediaStreamTrack: unknown };

// Par défaut la capture est PERDUE (`readyState: 'ended'`) : c'est le cas qui
// demande une reprise, et celui que la plupart des tests veulent.
function fakeTrack(
  capture: { readyState?: string; muted?: boolean; enabled?: boolean } = {},
): FakeTrack {
  const { readyState = 'ended', muted = false, enabled = true } = capture;
  return {
    restartTrack: jest.fn(async () => undefined),
    mediaStreamTrack: { readyState, muted, enabled },
  };
}

function fakePublication(
  overrides: { isMuted?: boolean; track?: FakeTrack | undefined } = {},
): LocalTrackPublication {
  const { isMuted = false, track = fakeTrack() } = overrides;
  return { isMuted, track } as unknown as LocalTrackPublication;
}

function fakeRoom(
  publications: Partial<Record<Track.Source, LocalTrackPublication | undefined>>,
): Room {
  return {
    localParticipant: {
      getTrackPublication: (source: Track.Source): LocalTrackPublication | undefined =>
        publications[source],
    },
  } as unknown as Room;
}

function trackOf(publication: LocalTrackPublication): jest.Mock {
  return (publication.track as unknown as { restartTrack: jest.Mock }).restartTrack;
}

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('restartLocalCapture', () => {
  it('redémarre la capture de la caméra publiée', async () => {
    const camera = fakePublication();
    await restartLocalCapture(fakeRoom({ [Track.Source.Camera]: camera }));

    // `setCameraEnabled(true)` ne ferait qu'un `unmute()` tant que la
    // publication existe (`livekit-client.esm.mjs`, `setTrackEnabled`) : il ne
    // rappelle jamais `getUserMedia`, donc il ne rattrape pas une caméra
    // retirée par Android. Seul `restartTrack()` recapture.
    expect(trackOf(camera)).toHaveBeenCalledTimes(1);
  });

  it('redémarre aussi la capture du micro publié', async () => {
    // Mesuré sur appareil : `Recording active` passe à `false` en arrière-plan,
    // exactement comme la caméra est retirée. Les deux sources sont donc à
    // reprendre, pas seulement celle qui se voit.
    const mic = fakePublication();
    await restartLocalCapture(fakeRoom({ [Track.Source.Microphone]: mic }));

    expect(trackOf(mic)).toHaveBeenCalledTimes(1);
  });

  it("ne redémarre rien pour une source qui n'est pas publiée", async () => {
    const mic = fakePublication();
    // Caméra absente de la table : entrer en séance caméra coupée ne publie
    // aucune piste vidéo, et `getTrackPublication` rend alors `undefined`.
    await restartLocalCapture(fakeRoom({ [Track.Source.Microphone]: mic }));

    expect(trackOf(mic)).toHaveBeenCalledTimes(1);
  });

  it('ne redémarre pas une piste que la personne a délibérément coupée', async () => {
    // La reprise rejoue l'état DÉSIRÉ. Redémarrer une caméra coupée exprès la
    // rallumerait dans le dos de la personne — et `restart()` recapture sans
    // regarder l'état coupé, donc la garde doit être ici.
    const camera = fakePublication({ isMuted: true });
    await restartLocalCapture(fakeRoom({ [Track.Source.Camera]: camera }));

    expect(trackOf(camera)).not.toHaveBeenCalled();
  });

  it('ne redémarre pas une publication sans piste', async () => {
    const camera = fakePublication({ track: undefined });
    const mic = fakePublication();
    await restartLocalCapture(
      fakeRoom({ [Track.Source.Camera]: camera, [Track.Source.Microphone]: mic }),
    );

    expect(trackOf(mic)).toHaveBeenCalledTimes(1);
  });

  it('redémarre même quand la capture se DIT encore vivante', async () => {
    // Ce test garde une DÉCISION, pas un détail : ne pas conditionner la
    // reprise à l'état apparent de la capture.
    //
    // La garde a été écrite puis retirée le 2026-08-02, mesurée aveugle. Dans
    // `react-native-webrtc`, `readyState` reste `'live'`, `muted` reste faux et
    // `enabled` reste vrai APRÈS qu'une autre application a évincé le client
    // caméra — `dumpsys media.camera` journalisait pourtant le `DISCONNECT`.
    // Deux cycles de retour n'ont alors rien repris.
    //
    // Voir le bloc encadré de `src/call/interruption.ts`.
    const camera = fakePublication({
      track: fakeTrack({ readyState: 'live', muted: false, enabled: true }),
    });
    await restartLocalCapture(fakeRoom({ [Track.Source.Camera]: camera }));

    expect(trackOf(camera)).toHaveBeenCalledTimes(1);
  });

  it("un échec sur une source n'empêche pas la reprise de l'autre", async () => {
    // La caméra est traitée avant le micro : sans isolation, une permission
    // retirée sur l'une laisserait l'autre définitivement muette.
    const camera = fakePublication({
      track: {
        restartTrack: jest.fn(async () => Promise.reject(new Error('caméra refusée'))),
        mediaStreamTrack: { readyState: 'ended', muted: false, enabled: true },
      },
    });
    const mic = fakePublication();

    await expect(
      restartLocalCapture(
        fakeRoom({ [Track.Source.Camera]: camera, [Track.Source.Microphone]: mic }),
      ),
    ).resolves.toBeUndefined();

    expect(trackOf(mic)).toHaveBeenCalledTimes(1);
  });
});

describe('useInterruptionRecovery', () => {
  // `AppState` est un OBJET exporté : espionner une de ses méthodes mute
  // l'objet lui-même, que l'import nommé du module sous test partage. C'est ce
  // qui distingue ce cas du piège documenté sur `import * as RN` — là, `spyOn`
  // redéfinit la propriété sur une COPIE de namespace que le composant ne lit
  // jamais.
  function captureListener(): { emit: (status: AppStateStatus) => void; remove: jest.Mock } {
    const remove = jest.fn();
    let listener: ((status: AppStateStatus) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listener = handler as (status: AppStateStatus) => void;
      return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    return {
      emit: (status: AppStateStatus): void => listener?.(status),
      remove,
    };
  }

  it("redémarre la capture au retour à l'avant-plan", async () => {
    const camera = fakePublication();
    const room = fakeRoom({ [Track.Source.Camera]: camera });
    const app = captureListener();

    await renderHook(() => useInterruptionRecovery(room));
    app.emit('background');
    app.emit('active');

    expect(trackOf(camera)).toHaveBeenCalledTimes(1);
  });

  it("ne redémarre rien tant que l'application n'a pas quitté l'avant-plan", async () => {
    // Sans cette garde, tout `active` reçu à froid recapturerait pour rien —
    // une coupure de capture visible à chaque événement.
    const camera = fakePublication();
    const room = fakeRoom({ [Track.Source.Camera]: camera });
    const app = captureListener();

    await renderHook(() => useInterruptionRecovery(room));
    app.emit('active');

    expect(trackOf(camera)).not.toHaveBeenCalled();
  });

  it("ne compte pas un passage par 'inactive' comme une interruption", async () => {
    // `'inactive'` est émis par iOS SEULEMENT, et pour des interactions
    // passagères : centre de contrôle, volet de notifications, aperçu du
    // sélecteur d'applications, bandeau d'appel entrant. Aucune ne retire la
    // capture — c'est `'background'` qui le fait, et lui seul.
    //
    // Sans cette distinction, chaque glissement du centre de contrôle
    // recapturerait au retour : une coupure d'une seconde pour un geste qui
    // n'a rien interrompu.
    const camera = fakePublication();
    const room = fakeRoom({ [Track.Source.Camera]: camera });
    const app = captureListener();

    await renderHook(() => useInterruptionRecovery(room));
    app.emit('inactive');
    app.emit('active');

    expect(trackOf(camera)).not.toHaveBeenCalled();
  });

  it("compte un 'inactive' qui MÈNE à 'background' comme une interruption", async () => {
    // iOS passe par `'inactive'` avant `'background'`. La seconde polarité :
    // ignorer `'inactive'` ne doit pas faire manquer l'arrière-plan qui suit.
    const camera = fakePublication();
    const room = fakeRoom({ [Track.Source.Camera]: camera });
    const app = captureListener();

    await renderHook(() => useInterruptionRecovery(room));
    app.emit('inactive');
    app.emit('background');
    app.emit('inactive');
    app.emit('active');

    expect(trackOf(camera)).toHaveBeenCalledTimes(1);
  });

  it('se désabonne au démontage', async () => {
    const room = fakeRoom({});
    const app = captureListener();

    const view = await renderHook(() => useInterruptionRecovery(room));
    // `unmount()` est asynchrone comme tout RNTL 14 : sans ce `await`, le
    // nettoyage de l'effet n'a pas encore tourné quand l'assertion lit l'espion.
    await view.unmount();

    expect(app.remove).toHaveBeenCalledTimes(1);
  });
});
