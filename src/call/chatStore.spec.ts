import type { Room, TextStreamReader } from 'livekit-client';

import { CHAT_TOPIC } from 'src/call/chat';
import { CHAT_LOG_MAX_MESSAGES, createChatStore } from 'src/call/chatStore';

type StreamHandler = (reader: TextStreamReader, info: { identity: string }) => void;

// Un double de `Room` qui tient réellement la carte d'un gestionnaire par
// topic, et qui JETTE sur un second enregistrement — comme le vrai
// `IncomingDataStreamManager`. Sans ce jet, l'invariant « un seul
// enregistrement pour lk.chat » ne serait gardé par aucun test.
//
// `__mocks__/@livekit/react-native.ts` ne stubbe PAS `Room` : c'est
// précisément pour cela que `createChatStore` REÇOIT la Room en paramètre au
// lieu d'aller la chercher.
type RoomProbe = {
  readonly room: Room;
  readonly handlerFor: (topic: string) => StreamHandler | undefined;
  readonly registeredTopics: () => string[];
  readonly sendText: jest.Mock;
  readonly setLocalName: (name: string | undefined) => void;
};

function fakeRoom(remoteNames: Readonly<Record<string, string>> = {}): RoomProbe {
  const handlers = new Map<string, StreamHandler>();
  const sendText = jest.fn();
  let localName: string | undefined = 'Ada';

  const room = {
    localParticipant: {
      identity: 'me',
      get name(): string | undefined {
        return localName;
      },
      sendText,
    },
    getParticipantByIdentity(identity: string): unknown {
      const name = remoteNames[identity];
      return name === undefined ? undefined : { identity, name };
    },
    registerTextStreamHandler(topic: string, handler: StreamHandler): void {
      if (handlers.has(topic)) throw new Error(`handler already registered for ${topic}`);
      handlers.set(topic, handler);
    },
    unregisterTextStreamHandler(topic: string): void {
      handlers.delete(topic);
    },
  };

  return {
    room: room as unknown as Room,
    handlerFor: (topic: string) => handlers.get(topic),
    registeredTopics: () => Array.from(handlers.keys()),
    sendText,
    setLocalName: (name: string | undefined) => {
      localName = name;
    },
  };
}

// Un lecteur de flux minimal, du contrat exact que le gestionnaire lit :
// `info.id`, `info.timestamp`, et un `readAll()` qui rend le texte COMPLET.
function reader(id: string, timestamp: number, body: string): TextStreamReader {
  return {
    info: { id, timestamp },
    readAll: async () => body,
  } as unknown as TextStreamReader;
}

function failingReader(id: string, timestamp: number): TextStreamReader {
  return {
    info: { id, timestamp },
    readAll: async () => {
      throw new Error('flux tronqué');
    },
  } as unknown as TextStreamReader;
}

// Le gestionnaire lance une promesse et ne l'attend pas : sans ce vidage,
// l'assertion regarde le fil d'avant.
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.restoreAllMocks();
  // Un message entrant illisible est journalisé, pas affiché : on garde la
  // sortie de test propre tout en pouvant asserter l'appel.
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('createChatStore', () => {
  it('enregistre lk.chat dès la construction, avant tout abonnement', () => {
    // Un message est un ÉVÉNEMENT, pas un état : rien ne le porte après son
    // passage. Un magasin qui n'écouterait qu'au premier abonné perdrait
    // définitivement ce qui arrive entre-temps — c'est LA différence avec
    // `createRoomViewStore`, qui peut périmer sa valeur et relire la Room.
    const probe = fakeRoom();

    createChatStore(probe.room);

    expect(probe.registeredTopics()).toEqual([CHAT_TOPIC]);
  });

  it('désenregistre avant d’enregistrer, donc deux constructions ne jettent pas', () => {
    // `registerTextStreamHandler` jette sur un doublon ;
    // `unregisterTextStreamHandler` ne jette jamais. Les deux dans cet ordre
    // rendent l'invariant vrai PAR CONSTRUCTION — y compris quand React
    // appelle deux fois l'initialiseur d'un `useState` en mode strict.
    const probe = fakeRoom();

    createChatStore(probe.room);

    expect(() => createChatStore(probe.room)).not.toThrow();
    expect(probe.registeredTopics()).toEqual([CHAT_TOPIC]);
  });

  it('part sur un fil vide et zéro non-lu', () => {
    // Un arrivant tardif ne voit rien : c'est le sujet de la ligne fixe du
    // panneau, et c'est la vérité du transport (aucun tampon, aucun rejeu).
    const store = createChatStore(fakeRoom().room);

    expect(store.getSnapshot()).toEqual({ log: [], unread: 0 });
  });

  it('rend la même valeur tant que rien ne bouge', () => {
    // Le contrat de `useSyncExternalStore` : une valeur neuve à chaque appel
    // fait boucler le rendu.
    const store = createChatStore(fakeRoom().room);

    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('ajoute un message reçu, avec son identifiant, son corps et son horodatage', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    await settle();

    expect(store.getSnapshot().log).toEqual([
      {
        id: 's-1',
        identity: 'u-ada',
        name: 'Ada',
        body: 'bonjour',
        sentAt: 1_000,
        editedAt: null,
        isLocal: false,
      },
    ]);
  });

  it('résout le nom sur la Room, et le laisse vide pour qui est déjà parti', async () => {
    // `participantInfo` ne porte QUE l'identité. La coquille posera son propre
    // repli sur un nom vide ; le magasin n'invente rien.
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    probe.handlerFor(CHAT_TOPIC)?.(reader('s-2', 2_000, 'parti'), { identity: 'u-zoe' });
    await settle();

    expect(store.getSnapshot().log.map((entry) => entry.name)).toEqual(['Ada', '']);
  });

  it('applique la règle d’édition sur un second message de même identifiant', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjur'), { identity: 'u-ada' });
    await settle();
    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 9_000, 'bonjour'), { identity: 'u-ada' });
    await settle();

    expect(store.getSnapshot().log).toHaveLength(1);
    expect(store.getSnapshot().log[0]?.body).toBe('bonjour');
    expect(store.getSnapshot().log[0]?.sentAt).toBe(1_000);
  });

  it('avertit ses abonnés à chaque message reçu', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);
    const onChange = jest.fn();
    store.subscribe(onChange);

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    await settle();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('cesse d’avertir un abonné qui s’est désabonné', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);
    const leaving = jest.fn();
    const staying = jest.fn();

    const unsubscribe = store.subscribe(leaving);
    store.subscribe(staying);
    unsubscribe();

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    await settle();

    expect(leaving).not.toHaveBeenCalled();
    expect(staying).toHaveBeenCalledTimes(1);
  });

  it('journalise un message illisible et ne l’ajoute pas', async () => {
    // Ce n'est l'action de personne : c'est le message d'un tiers, malformé ou
    // tronqué. Une Snackbar pour un incident qu'on ne peut ni causer ni
    // corriger est du bruit. Journalisé, pas caché.
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    probe.handlerFor(CHAT_TOPIC)?.(failingReader('s-1', 1_000), { identity: 'u-ada' });
    await settle();

    expect(store.getSnapshot().log).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('publie sur le topic du chat et pose l’écho local APRÈS la résolution', async () => {
    const probe = fakeRoom();
    probe.sendText.mockResolvedValue({ id: 's-local', timestamp: 5_000 });
    const store = createChatStore(probe.room);

    await expect(store.send('bonjour')).resolves.toBe(true);

    expect(probe.sendText).toHaveBeenCalledWith('bonjour', { topic: CHAT_TOPIC });
    expect(store.getSnapshot().log).toEqual([
      {
        id: 's-local',
        identity: 'me',
        name: 'Ada',
        body: 'bonjour',
        sentAt: 5_000,
        editedAt: null,
        isLocal: true,
      },
    ]);
  });

  it('rend false sans écho quand la publication échoue', async () => {
    // L'écho SIGNIFIE « c'est parti ». Le poser avant la résolution le ferait
    // mentir pendant une reconnexion.
    const probe = fakeRoom();
    probe.sendText.mockRejectedValue(new Error('canal fermé'));
    const store = createChatStore(probe.room);

    await expect(store.send('bonjour')).resolves.toBe(false);

    expect(store.getSnapshot().log).toEqual([]);
  });

  it('tolère un participant local sans nom', async () => {
    const probe = fakeRoom();
    probe.setLocalName(undefined);
    probe.sendText.mockResolvedValue({ id: 's-local', timestamp: 5_000 });
    const store = createChatStore(probe.room);

    await store.send('bonjour');

    expect(store.getSnapshot().log[0]?.name).toBe('');
  });

  it('remet les non-lus à zéro au marquage', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    probe.handlerFor(CHAT_TOPIC)?.(reader('s-2', 2_000, 'la suite'), { identity: 'u-ada' });
    await settle();
    expect(store.getSnapshot().unread).toBe(2);

    store.markRead();

    expect(store.getSnapshot().unread).toBe(0);
    // Le fil, lui, ne bouge pas : marquer lu n'efface rien.
    expect(store.getSnapshot().log).toHaveLength(2);
  });

  it('retient le plus grand horodatage du fil, jamais l’horloge locale', async () => {
    // `sentAt` vient de l'horloge de l'ÉMETTEUR. Un pair en avance de deux
    // secondes laisserait son message non lu pour toujours si le marquage
    // écrivait `Date.now()`.
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);
    const future = Date.now() + 3_600_000;

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', future, 'en avance'), { identity: 'u-ada' });
    await settle();
    store.markRead();

    expect(store.getSnapshot().unread).toBe(0);
  });

  it('compte comme non lu ce qui arrive après le marquage', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    await settle();
    store.markRead();
    probe.handlerFor(CHAT_TOPIC)?.(reader('s-2', 2_000, 'la suite'), { identity: 'u-ada' });
    await settle();

    expect(store.getSnapshot().unread).toBe(1);
  });

  it('n’avertit personne quand il n’y a rien à marquer', () => {
    const probe = fakeRoom();
    const store = createChatStore(probe.room);
    const onChange = jest.fn();
    store.subscribe(onChange);

    store.markRead();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('borne le fil à CHAT_LOG_MAX_MESSAGES messages, en retirant les plus anciens', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    for (let i = 0; i <= CHAT_LOG_MAX_MESSAGES; i += 1) {
      probe.handlerFor(CHAT_TOPIC)?.(reader(`s-${i}`, 1_000 + i, `msg ${i}`), {
        identity: 'u-ada',
      });
    }
    await settle();

    const { log } = store.getSnapshot();
    expect(log).toHaveLength(CHAT_LOG_MAX_MESSAGES);
    expect(log[0]?.id).toBe('s-1');
    expect(log[log.length - 1]?.id).toBe(`s-${CHAT_LOG_MAX_MESSAGES}`);
  });

  it('oublie la clé lue d’un message évincé par la troncature, sans la faire hériter à un rejoueur', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    await settle();
    store.markRead();

    // Assez de nouveaux messages pour évincer 's-1' du fil borné.
    for (let i = 0; i < CHAT_LOG_MAX_MESSAGES; i += 1) {
      probe.handlerFor(CHAT_TOPIC)?.(reader(`s-filler-${i}`, 2_000 + i, 'suite'), {
        identity: 'u-ada',
      });
    }
    await settle();
    expect(store.getSnapshot().log.some((message) => message.id === 's-1')).toBe(false);
    // Les messages de la rafale sont eux-mêmes non lus : les marquer avant de
    // rejouer 's-1' isole la seule chose que ce test vérifie — sans ce
    // marquage, ils écraseraient l'assertion finale sous leur propre compte.
    store.markRead();
    expect(store.getSnapshot().unread).toBe(0);

    // Même identifiant que le message évincé : `appendMessage` ne trouve plus
    // l'original dans le fil tronqué, et l'ajoute donc comme un message NEUF
    // plutôt que de le fusionner. Si la clé lue n'avait pas été oubliée avec
    // le message qu'elle marquait, cette nouvelle apparition hériterait à
    // tort de son statut « lu ».
    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 999_000, 'rejoué'), { identity: 'u-ada' });
    await settle();

    expect(store.getSnapshot().unread).toBe(1);
  });

  it('détache exactement ce qu’il a attaché', () => {
    const probe = fakeRoom();
    const store = createChatStore(probe.room);

    store.dispose();

    expect(probe.registeredTopics()).toEqual([]);
  });

  it('n’avertit plus après dispose, même si une lecture se termine', async () => {
    // `readAll()` est asynchrone : une lecture lancée avant la libération peut
    // se terminer après. Sans le drapeau, React serait prévenu d'un
    // changement sur un magasin que l'écran a déjà lâché.
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);
    const onChange = jest.fn();
    store.subscribe(onChange);

    const handler = probe.handlerFor(CHAT_TOPIC);
    handler?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    store.dispose();
    await settle();

    expect(onChange).not.toHaveBeenCalled();
  });

  // MESURÉ : le test ci-dessus ne garde PAS le drapeau `disposed`. Supprimer
  // `if (disposed) return;` d'`invalidate()` laissait les dix-neuf tests verts,
  // parce que `dispose()` vide déjà la liste d'abonnés — les deux mécanismes se
  // masquent l'un l'autre, et la voie de notification ne peut localiser ni l'un
  // ni l'autre. Ce test-ci passe par l'AUTRE effet du drapeau, le seul qui
  // reste observable : un instantané périmé n'est pas invalidé après la
  // libération, donc `getSnapshot()` rend la même valeur, à l'identique.
  it('ne périme plus son instantané après dispose', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);
    const before = store.getSnapshot();

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    store.dispose();
    await settle();

    expect(store.getSnapshot()).toBe(before);
    expect(store.getSnapshot().log).toEqual([]);
  });
});
