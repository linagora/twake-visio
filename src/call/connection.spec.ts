import { createCallSession, type CallSession } from 'src/call/connection';
import type { RoomAccess } from 'src/call/types';

const ACCESS: RoomAccess = {
  room: { id: 'r-1', slug: 'reunion', name: 'Réunion', accessLevel: 'public' },
  livekitUrl: 'wss://livekit.linagora.com',
  token: 'lk-token',
};

// Les noms doivent commencer par `mock` : babel-plugin-jest-hoist remonte
// `jest.mock` au-dessus des déclarations et n'autorise dans la fabrique que
// les identifiants correspondant à /^mock/i.
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

// La fabrique enregistre les gestionnaires d'événements par nom d'événement,
// ce que `jest.fn()` ne permet pas : sans eux, une coupure serveur ne peut pas
// être rejouée. Un seul `createCallSession()` par test, sinon la seconde
// session écrase les gestionnaires de la première.
const mockHandlers = new Map<string, (...args: unknown[]) => void>();

jest.mock('livekit-client', () => ({
  Room: class {
    connect = mockConnect;
    disconnect = mockDisconnect;
    off = jest.fn();
    on(event: string, handler: (...args: unknown[]) => void): unknown {
      mockHandlers.set(event, handler);
      return this;
    }
  },
  RoomEvent: {
    Disconnected: 'disconnected',
    Reconnecting: 'reconnecting',
    Reconnected: 'reconnected',
  },
}));

function emit(event: string): void {
  const handler = mockHandlers.get(event);
  if (handler === undefined) throw new Error(`Aucun gestionnaire abonné à « ${event} »`);
  handler();
}

// Vide la file de microtâches pour de bon. `await Promise.resolve()` n'en
// vide qu'une couche : une promesse déjà résolue rendue par un verrou trop
// permissif franchirait ce filtre et le test la croirait encore en vol.
function settleAll(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

// Rend la main sur l'ouverture du transport : sans cela le SDK simulé résout
// dans la même salve de microtâches que l'appel, et l'on ne peut rien
// observer entre `connecting` et `connected`. `open()` dénoue *tous* les
// transports demandés, y compris ceux qu'un verrou cassé aurait laissés
// passer : n'en dénouer qu'un ferait expirer le test au lieu de nommer ce qui
// a lâché.
function pauseTransport(): { open: () => void } {
  const waiting: (() => void)[] = [];
  mockConnect.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        waiting.push(resolve);
      }),
  );
  return {
    open: () => {
      for (const resolve of waiting) resolve();
    },
  };
}

// Le tableau grandit au fil des notifications : les tests assertent la
// séquence complète, pas seulement l'état final.
function record(session: CallSession): string[] {
  const seen: string[] = [];
  session.subscribe((state) => {
    seen.push(state.status);
  });
  return seen;
}

beforeEach(() => {
  mockHandlers.clear();
  mockConnect.mockReset().mockResolvedValue(undefined);
  mockDisconnect.mockReset().mockResolvedValue(undefined);
});

describe('createCallSession — état initial', () => {
  it('démarre à l\'état idle', () => {
    expect(createCallSession().getState()).toEqual({ status: 'idle' });
  });

  it('expose une Room stable, dont les écrans ont besoin pour le rendu vidéo', () => {
    const session = createCallSession();

    // L'identité doit rester la même d'un appel à l'autre : les écrans passent
    // cette Room à un contexte React, et une instance neuve à chaque lecture
    // remonterait tout l'arbre vidéo à chaque rendu.
    expect(session.getRoom()).toBe(session.getRoom());
  });
});

describe('createCallSession — établissement', () => {
  it('publie connecting dès la demande, puis connected une fois le transport ouvert', async () => {
    const transport = pauseTransport();
    const session = createCallSession();
    const seen = record(session);

    const joining = session.connect(ACCESS);

    // Cette assertion intermédiaire est ce qui rend le test discriminant : une
    // implémentation qui ne publierait que l'état final laisserait la séquence
    // finale identique et passerait sans jamais prévenir l'UI de l'attente.
    expect(seen).toEqual(['connecting']);
    expect(session.getState()).toEqual({ status: 'connecting' });

    transport.open();
    await joining;

    expect(seen).toEqual(['connecting', 'connected']);
    expect(mockConnect).toHaveBeenCalledWith(ACCESS.livekitUrl, ACCESS.token);
  });

  it('retombe sur disconnected avec le motif quand la connexion échoue', async () => {
    mockConnect.mockRejectedValue(new Error('refused'));
    const session = createCallSession();
    const seen = record(session);

    await session.connect(ACCESS);

    expect(session.getState()).toEqual({ status: 'disconnected', reason: 'refused' });
    expect(seen).toEqual(['connecting', 'disconnected']);
  });

  it('rapporte un motif lisible quand le SDK rejette autre chose qu\'une Error', async () => {
    mockConnect.mockRejectedValue('jeton expiré');
    const session = createCallSession();

    await session.connect(ACCESS);

    expect(session.getState()).toEqual({ status: 'disconnected', reason: 'jeton expiré' });
  });

  it('autorise une nouvelle tentative après un échec', async () => {
    mockConnect.mockRejectedValueOnce(new Error('refused')).mockResolvedValueOnce(undefined);
    const session = createCallSession();

    await session.connect(ACCESS);
    await session.connect(ACCESS);

    // Un verrou nettoyé sur le seul chemin de succès laisserait la personne
    // devant un bouton « Réessayer » définitivement inerte.
    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(session.getState()).toEqual({ status: 'connected' });
  });
});

describe('createCallSession — verrou de concurrence', () => {
  it('n\'ouvre qu\'un transport pour deux demandes simultanées', async () => {
    const transport = pauseTransport();
    const session = createCallSession();
    const seen = record(session);

    const first = session.connect(ACCESS);
    const second = session.connect(ACCESS);
    transport.open();
    await Promise.all([first, second]);

    expect(mockConnect).toHaveBeenCalledTimes(1);
    // Le seul compteur d'appels ne suffit pas : une garde posée après
    // `setState` bloquerait bien le second transport, mais aurait déjà republié
    // `connecting` et fait clignoter l'écran. La séquence l'interdit aussi.
    expect(seen).toEqual(['connecting', 'connected']);
  });

  it('fait attendre la demande concurrente jusqu\'au dénouement de la première', async () => {
    const transport = pauseTransport();
    const session = createCallSession();
    const settled: string[] = [];

    void session.connect(ACCESS).then(() => settled.push('first'));
    void session.connect(ACCESS).then(() => settled.push('second'));

    // Une garde qui se contenterait de rendre la main résoudrait
    // immédiatement la seconde promesse ; l'appelant lirait alors `connecting`
    // en croyant la connexion terminée.
    await settleAll();
    expect(settled).toEqual([]);
    expect(session.getState()).toEqual({ status: 'connecting' });

    transport.open();
    await settleAll();

    expect(settled).toEqual(['first', 'second']);
    expect(session.getState()).toEqual({ status: 'connected' });
  });

  it('ne rouvre pas un transport déjà établi', async () => {
    const session = createCallSession();
    await session.connect(ACCESS);
    const seen = record(session);

    await session.connect(ACCESS);

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
  });
});

describe('createCallSession — événements du serveur', () => {
  it('publie reconnecting puis connected quand le lien se rétablit', async () => {
    const session = createCallSession();
    await session.connect(ACCESS);
    const seen = record(session);

    emit('reconnecting');
    expect(session.getState()).toEqual({ status: 'reconnecting' });

    // Sans le retour à `connected`, l'écran resterait bloqué sur « reconnexion »
    // alors que la séance a repris.
    emit('reconnected');
    expect(session.getState()).toEqual({ status: 'connected' });
    expect(seen).toEqual(['reconnecting', 'connected']);
  });

  it('publie disconnected quand le serveur coupe la session', async () => {
    const session = createCallSession();
    await session.connect(ACCESS);
    const seen = record(session);

    emit('disconnected');

    expect(session.getState()).toEqual({ status: 'disconnected', reason: 'closed' });
    expect(seen).toEqual(['disconnected']);
  });
});

describe('createCallSession — coupure volontaire', () => {
  it('publie idle sans faire clignoter d\'erreur, alors que le SDK émet Disconnected', async () => {
    // `Room.disconnect()` émet `RoomEvent.Disconnected`. Rejouer cet événement
    // est le seul moyen de prouver qu'un raccrochage volontaire ne passe pas
    // par un état d'erreur que l'UI afficherait.
    mockDisconnect.mockImplementation(async () => {
      emit('disconnected');
    });
    const session = createCallSession();
    await session.connect(ACCESS);
    const seen = record(session);

    await session.disconnect();

    expect(seen).toEqual(['idle']);
    expect(session.getState()).toEqual({ status: 'idle' });
  });

  it('n\'est pas ressuscitée par la tentative de connexion qu\'elle a abandonnée', async () => {
    const transport = pauseTransport();
    const session = createCallSession();
    const joining = session.connect(ACCESS);

    await session.disconnect();
    expect(session.getState()).toEqual({ status: 'idle' });

    // Le SDK avorte la connexion en vol, mais rien ne garantit l'ordre : la
    // promesse peut se dénouer après la coupure. Elle ne doit alors plus rien
    // publier, sinon l'écran de pré-jonction quitté rebascule en séance.
    transport.open();
    await joining;

    expect(session.getState()).toEqual({ status: 'idle' });
  });

  it('termine la séance même si le SDK échoue à couper', async () => {
    mockDisconnect.mockRejectedValue(new Error('socket déjà morte'));
    const session = createCallSession();
    await session.connect(ACCESS);

    await session.disconnect();

    // Garder l'état précédent bloquerait l'écran sur un appel dont plus rien
    // ne sort, sans aucun recours pour l'utilisateur.
    expect(session.getState()).toEqual({ status: 'idle' });
  });

  it('ne rature pas une nouvelle tentative lancée pendant la coupure', async () => {
    const transport = pauseTransport();
    let finishTeardown = (): void => {};
    mockDisconnect.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishTeardown = resolve;
        }),
    );
    const session = createCallSession();

    const leaving = session.disconnect();
    const rejoining = session.connect(ACCESS);
    expect(session.getState()).toEqual({ status: 'connecting' });

    finishTeardown();
    await leaving;

    // Une coupure lente qui se termine après le départ d'une nouvelle tentative
    // ne doit pas repasser à `idle` par-dessus : l'écran repartirait à zéro au
    // milieu d'une connexion.
    expect(session.getState()).toEqual({ status: 'connecting' });

    transport.open();
    await rejoining;

    expect(session.getState()).toEqual({ status: 'connected' });
  });

  it('permet de rejoindre à nouveau après un raccrochage', async () => {
    const session = createCallSession();
    await session.connect(ACCESS);
    await session.disconnect();

    await session.connect(ACCESS);

    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(session.getState()).toEqual({ status: 'connected' });
  });
});

describe('createCallSession — abonnement', () => {
  it('cesse de notifier après désabonnement', async () => {
    const session = createCallSession();
    const seen: string[] = [];
    const unsubscribe = session.subscribe((state) => {
      seen.push(state.status);
    });

    unsubscribe();
    await session.connect(ACCESS);

    expect(seen).toEqual([]);
  });
});
