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
  readonly attributes?: Record<string, string>;
};

function person(identity: string, options: PersonOptions = {}): Participant {
  return {
    identity,
    name: options.name,
    isLocal: options.isLocal ?? false,
    isSpeaking: options.isSpeaking ?? false,
    lastSpokeAt: options.lastSpokeAt,
    joinedAt: options.joinedAt,
    // `Participant.attributes` est un getter qui rend toujours un objet ; le
    // double, lui, peut l'omettre — et c'est justement ce que la projection
    // doit tolérer.
    attributes: options.attributes,
    getTrackPublication: (source: Track.Source) => options.publications?.[source],
  } as unknown as Participant;
}

function microphone(overrides: Partial<FakePublication> = {}): FakePublication {
  return {
    trackSid: 'ts-mic',
    source: Track.Source.Microphone,
    isMuted: false,
    track: { id: 'audio' },
    ...overrides,
  };
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

// `screenSince` (`src/call/participants.ts:70`) vit au niveau MODULE : Jest ne
// recharge le module qu'une fois par FICHIER, jamais par `it`, donc tous les
// tests ci-dessous partagent la même table. Sans purge structurelle,
// l'isolation ne tenait qu'à des trackSid choisis uniques à la main — un `it`
// qui en recopierait un déjà employé hériterait silencieusement de son
// horodatage. `readRoomView` sur une Room sans aucun partage vide la table via
// `forgetAbsent(présent vide)` : la façon la plus simple de la purger sans
// exposer `screenSince` hors du module.
beforeEach(() => {
  readRoomView(fakeRoom(ME).room);
});

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

  it("projette l'horodatage de main levée de chaque participant", () => {
    // Deux distants, deux horodatages distincts : avec un seul, une valeur
    // codée en dur passerait.
    const { room } = fakeRoom(
      person('me', { isLocal: true, attributes: { handRaisedAt: '2026-07-30T10:00:03Z' } }),
      [
        person('bob', { attributes: { handRaisedAt: '2026-07-30T10:00:01Z' } }),
        person('cid', { attributes: { handRaisedAt: '2026-07-30T10:00:02Z' } }),
      ],
    );

    const view = readRoomView(room);

    expect(view.local.handRaisedAt).toBe('2026-07-30T10:00:03Z');
    expect(view.remotes.map((p) => p.handRaisedAt)).toEqual([
      '2026-07-30T10:00:01Z',
      '2026-07-30T10:00:02Z',
    ]);
  });

  it('lit une main baissée et un double sans attributs comme null', () => {
    // Le contrat backend écrit la chaîne vide pour une main baissée ; et tous
    // les doubles de `Participant` du dépôt sont écrits à la main, donc
    // incomplets. Les deux doivent donner `null`, jamais une exception.
    const { room } = fakeRoom(person('me', { isLocal: true, attributes: { handRaisedAt: '' } }), [
      person('bob'),
    ]);

    const view = readRoomView(room);

    expect(view.local.handRaisedAt).toBeNull();
    expect(view.remotes[0]?.handRaisedAt).toBeNull();
  });

  it('lit aussi la caméra du participant local', () => {
    const { room } = fakeRoom(
      person('me', { isLocal: true, publications: { [Track.Source.Camera]: camera() } }),
      [],
    );

    expect(readRoomView(room).local.camera).not.toBeNull();
  });
});

function screenPub(sid: string): FakePublication {
  return camera({ trackSid: sid, source: Track.Source.ScreenShare });
}

describe('lecture du partage d’écran', () => {
  it('rend la piste de partage, distincte de la caméra', () => {
    const alice = person('u-alice', {
      publications: {
        [Track.Source.Camera]: camera({ trackSid: 'cam-1' }),
        [Track.Source.ScreenShare]: screenPub('scr-distinct'),
      },
    });

    const view = readRoomView(fakeRoom(ME, [alice]).room);

    const seen = view.remotes[0];
    expect(seen?.camera?.publication.trackSid).toBe('cam-1');
    expect(seen?.screen?.publication.trackSid).toBe('scr-distinct');
  });

  // Les deux sid sont distincts par construction : une implémentation qui
  // rendrait la caméra dans les deux champs passerait un test qui les
  // confondrait.
  it('rend null quand la personne ne partage pas, sans confondre avec sa caméra', () => {
    const bob = person('u-bob', {
      publications: { [Track.Source.Camera]: camera({ trackSid: 'cam-2' }) },
    });

    const view = readRoomView(fakeRoom(ME, [bob]).room);

    expect(view.remotes[0]?.camera).not.toBeNull();
    expect(view.remotes[0]?.screen).toBeNull();
    expect(view.remotes[0]?.screenSince).toBeNull();
  });

  // La mémoire est bâtie sur la LECTURE, pas sur un événement : un partage déjà
  // en cours à la jonction n'émet rien, et une mémoire événementielle le
  // manquerait. Deux lectures successives doivent donc rendre le même instant.
  it('retient le même instant à travers deux lectures', () => {
    const alice = person('u-alice', {
      publications: { [Track.Source.ScreenShare]: screenPub('scr-memo') },
    });
    const { room } = fakeRoom(ME, [alice]);

    const first = readRoomView(room).remotes[0]?.screenSince;
    const second = readRoomView(room).remotes[0]?.screenSince;

    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  // Le test ci-dessus peut passer par hasard : deux `Date.now()` synchrones
  // tombent presque toujours sur la même milliseconde, donc un `sinceFor` qui
  // écraserait la table à chaque lecture au lieu de la consulter le passerait
  // aussi. Forcer l'horloge à avancer entre les deux lectures retire ce
  // hasard : seule une vraie mémorisation peut alors rendre le même instant.
  it('rend le premier instant même quand l’horloge avance entre deux lectures', () => {
    const alice = person('u-alice', {
      publications: { [Track.Source.ScreenShare]: screenPub('scr-clock') },
    });
    const { room } = fakeRoom(ME, [alice]);
    const now = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);

    const first = readRoomView(room).remotes[0]?.screenSince;
    const second = readRoomView(room).remotes[0]?.screenSince;

    now.mockRestore();
    expect(first).toBe(1_000);
    expect(second).toBe(1_000);
  });

  it('oublie un partage terminé, pour qu’un nouveau soit vu comme nouveau', () => {
    const partage = person('u-alice', {
      publications: { [Track.Source.ScreenShare]: screenPub('scr-ended') },
    });
    const arrete = person('u-alice');

    readRoomView(fakeRoom(ME, [partage]).room);
    readRoomView(fakeRoom(ME, [arrete]).room);

    expect(readRoomView(fakeRoom(ME, [arrete]).room).remotes[0]?.screenSince).toBeNull();
  });

  // Le test ci-dessus ne fait jamais réapparaître son sid : il ne peut donc
  // pas prouver que la piste est purgée de la table, seulement que
  // `sinceFor(null)` rend `null` — vrai même sans purge. La purge n'est
  // observable que si le MÊME trackSid revient après une absence : sans elle,
  // la reprise retomberait sur l'instant de son ancienne vie plutôt que sur
  // un instant frais.
  it('donne un instant frais à un trackSid qui réapparaît après une interruption', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);
    const partage = person('u-alice', {
      publications: { [Track.Source.ScreenShare]: screenPub('scr-reappear') },
    });
    const arrete = person('u-alice');
    const repris = person('u-alice', {
      publications: { [Track.Source.ScreenShare]: screenPub('scr-reappear') },
    });

    const debut = readRoomView(fakeRoom(ME, [partage]).room).remotes[0]?.screenSince;
    readRoomView(fakeRoom(ME, [arrete]).room);
    const relance = readRoomView(fakeRoom(ME, [repris]).room).remotes[0]?.screenSince;

    now.mockRestore();
    expect(debut).toBe(1_000);
    expect(relance).toBe(2_000);
  });

  // I-3 : une coupure (isMuted) n'est pas un arrêt. LiveKit ne réattribue pas
  // de trackSid à une pause — seul `isMuted` bascule sur la même publication
  // — donc l'instant d'origine doit survivre à la coupure. Sans ce test, une
  // personne qui partage en continu depuis t=1000 perdrait sa priorité face à
  // quelqu'un qui a commencé après elle, seulement parce qu'elle a coupé puis
  // repris son partage.
  it('garde l’instant d’origine d’un partage à travers une coupure, sans lui voler sa priorité', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(9_999);
    const sharing = (isMuted: boolean): Participant =>
      person('u-alice', {
        publications: {
          [Track.Source.ScreenShare]: camera({
            trackSid: 'scr-pause',
            source: Track.Source.ScreenShare,
            isMuted,
          }),
        },
      });

    const before = readRoomView(fakeRoom(ME, [sharing(false)]).room).remotes[0]?.screenSince;
    readRoomView(fakeRoom(ME, [sharing(true)]).room); // coupe : la publication reste
    const after = readRoomView(fakeRoom(ME, [sharing(false)]).room).remotes[0]?.screenSince;

    now.mockRestore();
    expect(before).toBe(1_000);
    // Le second horodatage bouchonné (9_999) ne doit jamais être consommé :
    // le reprendre prouverait qu'une coupure a été confondue avec un arrêt.
    expect(after).toBe(1_000);
  });

  // Garde contre la fuite que le `beforeEach` du fichier referme : ces deux
  // `it` sont délibérément ADJACENTS et réutilisent le MÊME trackSid. Sans la
  // purge, le second hériterait silencieusement de l'horodatage posé par le
  // premier au lieu d'en lire un frais — démontré ci-dessous, et exactement le
  // risque que ce fichier courait avant que l'isolation ne devienne
  // structurelle plutôt que conventionnelle. Même précédent que la garde
  // finale de `stage.spec.tsx` contre la fuite de `jest.restoreAllMocks()` :
  // une paire qui s'appuie sur l'ordre de déclaration par défaut de Jest pour
  // mordre de façon fiable si la purge disparaît.
  it('lit un premier instant pour un sid que le `it` suivant va réutiliser', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const alice = person('u-partage-adjacent-1', {
      publications: { [Track.Source.ScreenShare]: screenPub('sid-partage-adjacent') },
    });

    expect(readRoomView(fakeRoom(ME, [alice]).room).remotes[0]?.screenSince).toBe(1_000);

    now.mockRestore();
  });

  it('ne mord pas l’instant laissé par le `it` précédent pour ce même sid, purgé par le `beforeEach`', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(2_000);
    const bob = person('u-partage-adjacent-2', {
      publications: { [Track.Source.ScreenShare]: screenPub('sid-partage-adjacent') },
    });

    expect(readRoomView(fakeRoom(ME, [bob]).room).remotes[0]?.screenSince).toBe(2_000);

    now.mockRestore();
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
        'participantAttributesChanged',
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

  it('relit la vue sur un changement d’attributs', () => {
    // Sans cet événement dans la liste, une main levée par quelqu'un d'autre
    // n'arriverait jamais à l'écran : le backend meet ne pousse rien, c'est le
    // serveur LiveKit qui diffuse l'attribut.
    const { room, remotes, emit } = fakeRoom(ME);
    remotes.set('bob', person('bob'));
    const store = createRoomViewStore(room);
    const listener = jest.fn();
    store.subscribe(listener);
    expect(store.getSnapshot().remotes[0]?.handRaisedAt).toBeNull();

    remotes.set('bob', person('bob', { attributes: { handRaisedAt: '2026-07-30T10:00:01Z' } }));
    emit('participantAttributesChanged');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().remotes[0]?.handRaisedAt).toBe('2026-07-30T10:00:01Z');
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

// `mute-participant` du serveur meet exige un `track_sid` en plus de
// l'identité — mesuré : sans lui son sérialiseur refuse la requête. La vue est
// le seul endroit qui puisse le porter, puisque c'est elle qui lit le SDK.
describe('trackSid du micro', () => {
  it('rend le sid du micro publié', async () => {
    const room = fakeRoom(person('u-local', { name: 'Ada', isLocal: true }), [
      person('u-bob', {
        name: 'Bob',
        publications: { [Track.Source.Microphone]: microphone({ trackSid: 'ts-bob-mic' }) },
      }),
    ]);

    const view = readRoomView(room.room);

    expect(view.remotes[0]?.micTrackSid).toBe('ts-bob-mic');
  });

  it('rend null quand aucun micro n’est publié', async () => {
    // La condition doit être vraie ET fausse : sans ce second cas,
    // `micTrackSid` pourrait être une constante et le premier test passerait.
    const room = fakeRoom(person('u-local', { name: 'Ada', isLocal: true }), [
      person('u-bob', { name: 'Bob' }),
    ]);

    const view = readRoomView(room.room);

    expect(view.remotes[0]?.micTrackSid).toBeNull();
  });

  it('garde le sid d’un micro que son émetteur a coupé', async () => {
    // Distinct de `camera`/`screen`, qui rendent `null` sur `isMuted` : une
    // publication coupée garde son sid, et couper côté serveur reste possible.
    // C'est l'ABSENCE de publication, et elle seule, qui rend l'action vide.
    const room = fakeRoom(person('u-local', { name: 'Ada', isLocal: true }), [
      person('u-bob', {
        name: 'Bob',
        publications: {
          [Track.Source.Microphone]: microphone({ trackSid: 'ts-muted', isMuted: true }),
        },
      }),
    ]);

    const view = readRoomView(room.room);

    expect(view.remotes[0]?.micTrackSid).toBe('ts-muted');
  });
});
