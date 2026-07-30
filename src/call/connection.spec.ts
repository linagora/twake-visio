import { registerGlobals } from '@livekit/react-native';

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
const mockOff = jest.fn();

// La fabrique enregistre les gestionnaires d'événements par nom d'événement,
// ce que `jest.fn()` ne permet pas : sans eux, une coupure serveur ne peut pas
// être rejouée. Un seul `createCallSession()` par test, sinon la seconde
// session écrase les gestionnaires de la première.
const mockHandlers = new Map<string, (...args: unknown[]) => void>();

jest.mock('livekit-client', () => ({
  Room: class {
    connect = mockConnect;
    disconnect = mockDisconnect;
    on(event: string, handler: (...args: unknown[]) => void): unknown {
      mockHandlers.set(event, handler);
      return this;
    }
    // `off` retire réellement le gestionnaire, et seulement si la référence
    // correspond : un `dispose()` qui passerait une autre fonction — le piège
    // classique des gestionnaires anonymes — ne détacherait rien, et la carte
    // le montrerait.
    off(event: string, handler: (...args: unknown[]) => void): unknown {
      mockOff(event, handler);
      if (mockHandlers.get(event) === handler) mockHandlers.delete(event);
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
function pauseTransport(): { open: () => void; openOnly: (index: number) => void } {
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
    // Dénoue un transport précis, pour les cas où deux tentatives se
    // chevauchent et où l'ordre de dénouement est justement ce qu'on teste.
    openOnly: (index: number) => {
      const resolve = waiting[index];
      if (resolve === undefined) throw new Error(`Aucun transport n° ${index} en attente`);
      resolve();
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

// Un abonné qui lève est signalé sur `console.error`. Les tests qui en
// provoquent un l'espionnent pour taire le bruit et vérifier que le défaut
// n'est pas étouffé.
function silenceSubscriberErrors(): jest.SpyInstance {
  return jest.spyOn(console, 'error').mockImplementation(() => {});
}

beforeEach(() => {
  mockHandlers.clear();
  mockOff.mockReset();
  mockConnect.mockReset().mockResolvedValue(undefined);
  mockDisconnect.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('runtime WebRTC', () => {
  it('installe les globales WebRTC au chargement du module, avant toute Room', () => {
    // `livekit-client` s'appuie sur RTCPeerConnection et navigator.mediaDevices,
    // que React Native ne fournit pas. Sans cet appel, `room.connect()` casse à
    // l'exécution — et rien dans le dépôt ne le réclamait.
    //
    // L'assertion porte sur le chargement du module, pas sur `createCallSession`:
    // les écrans construisent la session dans un `useMemo`, c'est-à-dire pendant
    // le premier rendu, avant tout `useEffect`. Un appel placé dans le bootstrap
    // applicatif arriverait donc après la première `new Room()`.
    expect(registerGlobals).toHaveBeenCalledTimes(1);
  });
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

// Ces cinq cas gardent des mécanismes qui, jusqu'ici, ne portaient qu'un
// commentaire d'intention. Un commentaire ne survit pas à un refactor.
describe('createCallSession — mécanismes du verrou', () => {
  it('reste réutilisable quand room.connect lève de façon synchrone', async () => {
    // Une URL invalide fait lever `room.connect` avant tout `await`. Le `catch`
    // d'`attempt` s'exécute alors dans la portion synchrone : un nettoyage du
    // verrou écrit à l'intérieur d'`attempt` s'exécuterait avant sa pose, et le
    // verrou resterait fermé pour toujours — bouton « Réessayer » inerte.
    mockConnect.mockImplementationOnce(() => {
      throw new Error('URL invalide');
    });
    const session = createCallSession();

    await session.connect(ACCESS);
    expect(session.getState()).toEqual({ status: 'disconnected', reason: 'URL invalide' });

    await session.connect(ACCESS);

    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(session.getState()).toEqual({ status: 'connected' });
  });

  it('ne laisse pas une tentative abandonnée relâcher le verrou d\'une autre', async () => {
    const transport = pauseTransport();
    const session = createCallSession();
    const abandoned = session.connect(ACCESS);
    await session.disconnect();
    const rejoining = session.connect(ACCESS);

    // La tentative abandonnée se dénoue maintenant, après que la nouvelle a
    // posé son propre verrou. Sans le contrôle d'ère dans le dénouement, elle
    // relâcherait un verrou qui ne lui appartient plus.
    transport.openOnly(0);
    await abandoned;

    void session.connect(ACCESS);
    expect(mockConnect).toHaveBeenCalledTimes(2);

    transport.openOnly(1);
    await rejoining;
    expect(session.getState()).toEqual({ status: 'connected' });
  });

  it('ne rouvre pas de transport pendant que le SDK rétablit le lien', async () => {
    const session = createCallSession();
    await session.connect(ACCESS);
    emit('reconnecting');
    const seen = record(session);

    await session.connect(ACCESS);

    // Le SDK ne se garde pas lui-même ici : `Room.connect` ne court-circuite
    // que sur `connectFuture` et `state === Connected`. `Reconnecting` passe au
    // travers et lancerait une tentative neuve, mettant à la poubelle le
    // transport que le SDK est en train de rétablir.
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(session.getState()).toEqual({ status: 'reconnecting' });
    expect(seen).toEqual([]);
  });

  it('permet de rejoindre après l\'annulation d\'une connexion en vol', async () => {
    const transport = pauseTransport();
    const session = createCallSession();
    const abandoned = session.connect(ACCESS);

    await session.disconnect();
    transport.open();
    await abandoned;

    const rejoining = session.connect(ACCESS);

    // Le verrou doit être relâché par la coupure elle-même : la tentative
    // abandonnée verra son ère périmée et ne le relâchera pas. Sans cela la
    // session ne pourrait plus jamais se reconnecter.
    expect(mockConnect).toHaveBeenCalledTimes(2);

    transport.open();
    await rejoining;
    expect(session.getState()).toEqual({ status: 'connected' });
  });

  it('fige la liste des abonnés le temps d\'une notification', async () => {
    const transport = pauseTransport();
    const session = createCallSession();
    const late: string[] = [];
    let added = false;
    session.subscribe(() => {
      if (added) return;
      added = true;
      session.subscribe((state) => {
        late.push(state.status);
      });
    });

    const joining = session.connect(ACCESS);

    // Le nouvel abonné s'est inscrit pendant la notification de `connecting`.
    // Sans copie de la liste, l'itération d'un Set visite ce qu'on y ajoute en
    // cours de route, et il recevrait un état publié avant son abonnement.
    expect(late).toEqual([]);

    transport.open();
    await joining;

    expect(late).toEqual(['connected']);
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

describe('createCallSession — événements périmés', () => {
  it('ignore un Disconnected tardif qui raturerait une nouvelle tentative', async () => {
    const session = createCallSession();
    await session.connect(ACCESS);
    await session.disconnect();

    const transport = pauseTransport();
    const rejoining = session.connect(ACCESS);
    expect(session.getState()).toEqual({ status: 'connecting' });

    // Fenêtre réelle, établie sur la source de livekit-client@2.21.0 :
    // `Room.connect` relâche son disconnectLock tôt, et le `catch` de sa
    // fonction de connexion peut atteindre `handleDisconnect` plusieurs `await`
    // plus tard — donc après le départ d'une nouvelle tentative. Le drapeau
    // `hangingUp` ne couvrait que la fenêtre d'un `disconnect()` en cours.
    emit('disconnected');

    expect(session.getState()).toEqual({ status: 'connecting' });

    transport.open();
    await rejoining;
    expect(session.getState()).toEqual({ status: 'connected' });
  });

  it('ignore un Reconnecting reçu hors séance', async () => {
    const session = createCallSession();

    emit('reconnecting');

    // Sans garde, l'état passait à `reconnecting` — d'où `connect()` est
    // refusé. La session était figée sans aucune sortie, et aucun écran
    // n'appelle `disconnect()` sur une session qu'il croit `idle`.
    expect(session.getState()).toEqual({ status: 'idle' });

    await session.connect(ACCESS);

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(session.getState()).toEqual({ status: 'connected' });
  });

  it('reste reconnectable quand le serveur coupe pendant la publication de connected', async () => {
    const session = createCallSession();
    let cut = false;
    session.subscribe((state) => {
      if (state.status !== 'connected' || cut) return;
      cut = true;
      // Le serveur coupe dans la fenêtre — deux sauts de microtâche — entre la
      // publication de `connected` et le relâchement du verrou. `onDisconnected`
      // ouvre alors une nouvelle ère, et le dénouement de la tentative ne
      // relâche que le verrou de la sienne. Si l'ouverture d'ère ne relâchait
      // pas aussi le verrou, il ne le serait jamais.
      emit('disconnected');
    });

    await session.connect(ACCESS);
    expect(session.getState()).toEqual({ status: 'disconnected', reason: 'closed' });

    await session.connect(ACCESS);

    // Sans le correctif : la promesse périmée est rendue telle quelle, plus
    // aucun `room.connect` ne part, et la session n'est plus jamais
    // reconnectable — le symptôme même que la garde de C2 devait supprimer.
    expect(mockConnect).toHaveBeenCalledTimes(2);
    expect(session.getState()).toEqual({ status: 'connected' });
  });

  it('ignore un Reconnected reçu après un raccrochage', async () => {
    const session = createCallSession();
    await session.connect(ACCESS);
    await session.disconnect();
    expect(session.getState()).toEqual({ status: 'idle' });

    emit('reconnected');

    // Un `Reconnected` tardif ne doit pas remettre en séance une session que
    // l'utilisateur a raccrochée : l'écran quitté rebasculerait en appel.
    expect(session.getState()).toEqual({ status: 'idle' });
  });

  it('ignore un Reconnecting reçu après la fin de la séance', async () => {
    const session = createCallSession();
    await session.connect(ACCESS);
    emit('disconnected');
    expect(session.getState()).toEqual({ status: 'disconnected', reason: 'closed' });

    emit('reconnecting');

    // Une séance finie ne repart pas en `reconnecting` : `connect()` y est
    // refusé, et la session se retrouverait figée par la même porte.
    expect(session.getState()).toEqual({ status: 'disconnected', reason: 'closed' });
    await session.connect(ACCESS);
    expect(session.getState()).toEqual({ status: 'connected' });
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

describe('createCallSession — démontage', () => {
  it('détache les trois gestionnaires du SDK', () => {
    const session = createCallSession();
    const registered = new Map(mockHandlers);
    expect(registered.size).toBe(3);

    session.dispose();

    // Les écrans 17 à 19 créent une session par montage. Sans détachement,
    // chaque montage laisse une Room abonnée derrière lui.
    for (const [event, handler] of registered) {
      expect(mockOff).toHaveBeenCalledWith(event, handler);
    }
    expect(mockHandlers.size).toBe(0);
  });

  it('coupe le transport sans se faire attendre', () => {
    const session = createCallSession();

    // Un nettoyage de `useEffect` est synchrone : il ne peut pas attendre. La
    // coupure part donc sans être attendue, sinon la Room resterait vivante —
    // et avec elle le micro, la caméra et le transport.
    session.dispose();

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('survit à une coupure qui échoue au démontage', async () => {
    mockDisconnect.mockRejectedValue(new Error('socket déjà morte'));
    const session = createCallSession();

    session.dispose();
    await settleAll();

    // Personne à qui signaler l'échec d'une coupure de démontage : le rejet ne
    // doit surtout pas remonter non capturé.
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('relâche les abonnés et ne publie plus rien', async () => {
    const session = createCallSession();
    const seen = record(session);

    session.dispose();
    await session.connect(ACCESS);

    expect(seen).toEqual([]);
    expect(mockConnect).not.toHaveBeenCalled();
    expect(session.getState()).toEqual({ status: 'idle' });
  });

  it('est idempotent', () => {
    const session = createCallSession();

    session.dispose();
    session.dispose();

    // Un écran démonté deux fois, ou démonté après un raccrochage, ne doit pas
    // relancer une coupure sur une Room déjà libérée.
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mockOff).toHaveBeenCalledTimes(3);
  });
});

describe('createCallSession — un abonné qui lève', () => {
  it('n\'empêche pas le transport de s\'ouvrir', async () => {
    const reported = silenceSubscriberErrors();
    const session = createCallSession();
    session.subscribe(() => {
      throw new Error('rendu impossible');
    });

    // Le premier état publié est `connecting`, avant même l'appel au SDK. Un
    // abonné qui lève à ce moment-là empêchait `room.connect()` d'être appelé
    // du tout : l'écran tournait sur une connexion jamais tentée.
    await session.connect(ACCESS);

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(session.getState()).toEqual({ status: 'connected' });
    // Signalé, pas avalé : le défaut est chez l'abonné, l'étouffer le rendrait
    // indiagnosticable.
    expect(reported).toHaveBeenCalled();
  });

  it('ne fait pas rejeter connect(), contrat sur lequel les écrans s\'appuient', async () => {
    silenceSubscriberErrors();
    const session = createCallSession();
    session.subscribe(() => {
      throw new Error('rendu impossible');
    });

    // Les écrans écrivent `void session.connect(...)` sans try/catch : un rejet
    // ici serait un rejet non capturé en React Native.
    await expect(session.connect(ACCESS)).resolves.toBeUndefined();
  });

  it('ne prive pas les abonnés suivants de leurs notifications', async () => {
    silenceSubscriberErrors();
    const session = createCallSession();
    session.subscribe(() => {
      throw new Error('rendu impossible');
    });
    const seen = record(session);

    await session.connect(ACCESS);

    // Sans isolation, `state` avançait mais les abonnés enregistrés après
    // celui qui lève ne voyaient plus rien : `getState()` et les abonnés
    // divergeaient en silence.
    expect(seen).toEqual(['connecting', 'connected']);
  });

  it('laisse la session utilisable pour une tentative suivante', async () => {
    silenceSubscriberErrors();
    const session = createCallSession();
    const unsubscribe = session.subscribe(() => {
      throw new Error('rendu impossible');
    });

    await session.connect(ACCESS);
    unsubscribe();
    await session.disconnect();
    await session.connect(ACCESS);

    expect(session.getState()).toEqual({ status: 'connected' });
    expect(mockConnect).toHaveBeenCalledTimes(2);
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
