import { Track } from 'livekit-client';
import type { Participant, Room } from 'livekit-client';

import { createRoomViewStore, readRoomView } from 'src/call/participants';

type FakePublication = {
  readonly trackSid: string;
  readonly source: Track.Source;
  readonly isMuted: boolean;
  readonly track?: object;
};

type PersonOptions = {
  readonly name?: string;
  readonly isLocal?: boolean;
  readonly isSpeaking?: boolean;
  readonly lastSpokeAt?: Date;
  readonly joinedAt?: Date;
  readonly publications?: Partial<Record<Track.Source, FakePublication>>;
};

function person(identity: string, options: PersonOptions = {}): Participant {
  return {
    identity,
    name: options.name,
    isLocal: options.isLocal ?? false,
    isSpeaking: options.isSpeaking ?? false,
    lastSpokeAt: options.lastSpokeAt,
    joinedAt: options.joinedAt,
    getTrackPublication: (source: Track.Source) => options.publications?.[source],
  } as unknown as Participant;
}

function camera(overrides: Partial<FakePublication> = {}): FakePublication {
  return {
    trackSid: 'ts-1',
    source: Track.Source.Camera,
    isMuted: false,
    track: { id: 'media' },
    ...overrides,
  };
}

// Un double de `Room` qui enregistre réellement ses gestionnaires par nom
// d'événement : c'est la seule façon de vérifier à quoi le magasin s'abonne, et
// qu'il détache exactement ce qu'il a attaché.
//
// Les gestionnaires sont rangés dans une liste, pas dans un ensemble, parce que
// c'est ce que fait un `EventEmitter` : le même gestionnaire attaché deux fois
// est appelé deux fois, et `off` n'en retire qu'une occurrence. Un ensemble
// masquerait précisément la fuite qu'une double attache provoque. `off` ne
// retire que si la référence correspond — le piège du gestionnaire anonyme.
type RoomProbe = {
  readonly room: Room;
  readonly remotes: Map<string, Participant>;
  readonly subscribedEvents: () => string[];
  readonly handlerCount: (event: string) => number;
  readonly emit: (event: string) => void;
};

function fakeRoom(local: Participant, remotes: readonly Participant[] = []): RoomProbe {
  const handlers = new Map<string, (() => void)[]>();
  const remoteParticipants = new Map<string, Participant>(remotes.map((p) => [p.identity, p]));

  const room = {
    localParticipant: local,
    remoteParticipants,
    on(event: string, handler: () => void): unknown {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return room;
    },
    off(event: string, handler: () => void): unknown {
      const attached = handlers.get(event) ?? [];
      const index = attached.indexOf(handler);
      if (index !== -1) attached.splice(index, 1);
      if (attached.length === 0) handlers.delete(event);
      return room;
    },
  };

  return {
    room: room as unknown as Room,
    remotes: remoteParticipants,
    subscribedEvents: () => Array.from(handlers.keys()).sort(),
    handlerCount: (event: string) => (handlers.get(event) ?? []).length,
    emit: (event: string) => {
      for (const handler of Array.from(handlers.get(event) ?? [])) handler();
    },
  };
}

const ME = person('me', { isLocal: true, name: 'Ada' });

describe('readRoomView', () => {
  it('distingue le participant local des distants', () => {
    const { room } = fakeRoom(ME, [person('bob'), person('cid')]);

    const view = readRoomView(room);

    expect(view.local.identity).toBe('me');
    expect(view.local.isLocal).toBe(true);
    expect(view.remotes.map((p) => p.identity)).toEqual(['bob', 'cid']);
    expect(view.remotes.map((p) => p.isLocal)).toEqual([false, false]);
  });

  it('convertit les dates du SDK en millisecondes, et leur absence en null', () => {
    // `lastSpokeAt` et `joinedAt` sont facultatifs côté SDK : le module de
    // sélection reçoit des nombres ou `null`, jamais un `Date` qu'il faudrait
    // comparer.
    const { room } = fakeRoom(
      person('me', {
        isLocal: true,
        lastSpokeAt: new Date(1_700_000_000_000),
        joinedAt: new Date(1_600_000_000_000),
      }),
      [person('bob')],
    );

    const view = readRoomView(room);

    expect(view.local.lastSpokeAt).toBe(1_700_000_000_000);
    expect(view.local.joinedAt).toBe(1_600_000_000_000);
    expect(view.remotes[0]?.lastSpokeAt).toBeNull();
    expect(view.remotes[0]?.joinedAt).toBeNull();
  });

  it('reporte la parole en cours', () => {
    const { room } = fakeRoom(ME, [person('bob', { isSpeaking: true })]);

    expect(readRoomView(room).remotes[0]?.isSpeaking).toBe(true);
  });

  it('remplace un nom absent par une chaîne vide', () => {
    // Le SDK laisse `name` indéfini. La sélection nettoie, la coquille n'a
    // qu'un seul cas d'absence à traiter : jamais `undefined` à l'écran.
    const { room } = fakeRoom(person('me', { isLocal: true }), []);

    expect(readRoomView(room).local.name).toBe('');
  });

  it('bâtit la référence de piste que VideoTrack attend', () => {
    const publication = camera();
    const bob = person('bob', { publications: { [Track.Source.Camera]: publication } });
    const { room } = fakeRoom(ME, [bob]);

    const view = readRoomView(room);

    expect(view.remotes[0]?.camera).toEqual({
      participant: bob,
      publication,
      source: Track.Source.Camera,
    });
  });

  it('ne prend pas le partage d’écran pour une caméra', () => {
    // Poser le partage d'écran de quelqu'un à la place de son visage est une
    // confusion silencieuse : les deux sont des pistes vidéo.
    const { room } = fakeRoom(ME, [
      person('bob', {
        publications: {
          [Track.Source.ScreenShare]: camera({ source: Track.Source.ScreenShare }),
        },
      }),
    ]);

    expect(readRoomView(room).remotes[0]?.camera).toBeNull();
  });

  it('n’annonce pas de caméra tant que la piste n’est pas souscrite', () => {
    // Une publication existe dès l'annonce du serveur ; la piste n'arrive
    // qu'à la souscription. Rendre l'une sans l'autre donne un cadre vide.
    const { room } = fakeRoom(ME, [
      person('bob', { publications: { [Track.Source.Camera]: camera({ track: undefined }) } }),
    ]);

    expect(readRoomView(room).remotes[0]?.camera).toBeNull();
  });

  it('n’annonce pas de caméra quand elle est coupée', () => {
    // Une caméra coupée garde sa piste mais n'émet plus rien : sans ce test,
    // la vignette est un rectangle noir qu'on ne distingue pas d'une panne.
    const { room } = fakeRoom(ME, [
      person('bob', { publications: { [Track.Source.Camera]: camera({ isMuted: true }) } }),
    ]);

    expect(readRoomView(room).remotes[0]?.camera).toBeNull();
  });

  it('lit aussi la caméra du participant local', () => {
    const { room } = fakeRoom(
      person('me', { isLocal: true, publications: { [Track.Source.Camera]: camera() } }),
      [],
    );

    expect(readRoomView(room).local.camera).not.toBeNull();
  });
});

describe('createRoomViewStore', () => {
  it('rend la même vue tant que rien ne bouge', () => {
    // `useSyncExternalStore` compare par identité : une vue reconstruite à
    // chaque lecture ferait boucler le rendu à l'infini.
    const { room } = fakeRoom(ME, [person('bob')]);
    const store = createRoomViewStore(room);

    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('s’abonne à tout ce qui change ce qui s’affiche', () => {
    // La liste est écrite en clair : en retirer un événement doit coûter un
    // test rouge, pas une vignette figée que personne ne peut voir.
    const { room, subscribedEvents } = fakeRoom(ME);
    const store = createRoomViewStore(room);

    store.subscribe(() => undefined);

    expect(subscribedEvents()).toEqual(
      [
        'activeSpeakersChanged',
        'localTrackPublished',
        'localTrackUnpublished',
        'participantConnected',
        'participantDisconnected',
        'participantNameChanged',
        'reconnected',
        'trackMuted',
        'trackPublished',
        'trackSubscribed',
        'trackUnmuted',
        'trackUnpublished',
        'trackUnsubscribed',
      ].sort(),
    );
  });

  it('prévient et relit à chaque événement', () => {
    const { room, remotes, emit } = fakeRoom(ME);
    const store = createRoomViewStore(room);
    const listener = jest.fn();
    store.subscribe(listener);
    const before = store.getSnapshot();

    remotes.set('bob', person('bob'));
    emit('participantConnected');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot().remotes.map((p) => p.identity)).toEqual(['bob']);
  });

  it('relit à l’abonnement ce qui a changé depuis le rendu', () => {
    // Entre la lecture faite pendant le rendu et l'attache des gestionnaires,
    // une piste peut arriver sans que personne n'écoute. Sans cette relecture,
    // l'écran resterait sur une vue périmée jusqu'au prochain événement — qui
    // peut ne jamais venir si la séance se stabilise là.
    const { room, remotes } = fakeRoom(ME);
    const store = createRoomViewStore(room);
    expect(store.getSnapshot().remotes).toEqual([]);

    remotes.set('bob', person('bob'));
    store.subscribe(() => undefined);

    expect(store.getSnapshot().remotes.map((p) => p.identity)).toEqual(['bob']);
  });

  it('détache exactement ce qu’il a attaché', () => {
    // Une Room garde ses gestionnaires : un écran quitté qui laisse les siens
    // derrière lui rappelle un composant démonté à chaque événement.
    const { room, subscribedEvents, emit } = fakeRoom(ME);
    const store = createRoomViewStore(room);
    const listener = jest.fn();

    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    expect(subscribedEvents()).toEqual([]);
    emit('participantConnected');
    expect(listener).not.toHaveBeenCalled();
  });

  it('ne détache pas tant qu’un abonné reste', () => {
    const { room, subscribedEvents, emit } = fakeRoom(ME);
    const store = createRoomViewStore(room);
    const staying = jest.fn();

    const leaving = store.subscribe(() => undefined);
    store.subscribe(staying);
    leaving();

    expect(subscribedEvents()).not.toEqual([]);
    emit('participantConnected');
    expect(staying).toHaveBeenCalledTimes(1);
  });

  it('n’attache qu’un seul jeu de gestionnaires, quel que soit le nombre d’abonnés', () => {
    // Une Room attache par liste, pas par ensemble : le même gestionnaire posé
    // deux fois est appelé deux fois, et `off` n'en retire qu'une occurrence.
    // Un second abonnement qui réattacherait laisserait donc un gestionnaire
    // derrière lui à la fermeture de l'écran — une Room qui survit à sa page.
    const { room, handlerCount, subscribedEvents } = fakeRoom(ME);
    const store = createRoomViewStore(room);

    const first = store.subscribe(() => undefined);
    const second = store.subscribe(() => undefined);

    expect(handlerCount('participantConnected')).toBe(1);
    first();
    second();
    expect(subscribedEvents()).toEqual([]);
  });
});
