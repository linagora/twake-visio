import { VideoTrack } from '@livekit/react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Share } from 'react-native';

import * as participants from 'src/api/participants';
import * as rooms from 'src/api/rooms';
import type { ApiResult } from 'src/api/types';
import * as accounts from 'src/auth/accounts';
import * as media from 'src/call/media';
import type { AccessLevel, CallState, RoomAccess } from 'src/call/types';
import { CallScreen } from './call';

// `getAllByTestId` rend un tableau ; `noUncheckedIndexedAccess` refuse d'y
// indexer sans preuve que l'élément existe. Même garde que dans
// `participantsPanel.spec.tsx`.
function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`expected an item at index ${index}`);
  return item;
}

// Un accès accordé, avec le niveau et le droit de modérer que le test choisit.
// `r-1` est l'identifiant de salon repris par toutes les assertions portant
// sur `roomId`, jamais confondu avec une identité LiveKit ou une UUID de
// lobby : les trois valent des chaînes visiblement différentes dans ce fichier.
function grantedAccess(accessLevel: AccessLevel, isAdministrable: boolean): ApiResult<RoomAccess> {
  return {
    ok: true,
    value: {
      room: { id: 'r-1', slug: 'reunion', name: 'r', accessLevel },
      livekitUrl: 'wss://lk',
      token: 'lk',
      isAdministrable,
    },
  };
}

// Un participant distant minimal, du même contrat que `readParticipant` dans
// `src/call/participants` attend d'un `Participant` LiveKit — même convention
// que le `person()` de `useCallLayout.spec.ts`.
function remoteParticipant(identity: string, name: string): unknown {
  return {
    identity,
    name,
    isLocal: false,
    isSpeaking: false,
    getTrackPublication: () => undefined,
  };
}

// babel-plugin-jest-hoist lève l'appel jest.mock au-dessus des const du module :
// seul un nom préfixé par `mock` peut être référencé depuis la factory. Et il ne
// peut l'être que depuis une fermeture appelée plus tard — le corps de la
// factory, lui, s'exécute avant l'initialisation de ces const.
const mockReplace = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
const mockDispose = jest.fn();
const mockUnsubscribed = jest.fn();

// La publication caméra du participant local, posée par le test qui en a
// besoin. Sans elle, la vignette locale est un carton nommé — l'état de départ
// d'une séance dont la caméra n'a pas encore démarré.
let mockCameraPublication: unknown;

// Le double de `Room` doit désormais tenir le contrat que `src/call/participants`
// lit : un participant local, une carte de distants, et une émission
// d'événements à laquelle s'abonner. Un objet vide passait tant que personne ne
// lisait la Room ; il ferait maintenant tomber l'écran au premier rendu.
const mockRoom: {
  localParticipant: unknown;
  remoteParticipants: Map<string, unknown>;
  on: () => unknown;
  off: () => unknown;
} = {
  localParticipant: {
    identity: 'me',
    isLocal: true,
    isSpeaking: false,
    getTrackPublication: () => mockCameraPublication,
  },
  remoteParticipants: new Map<string, unknown>(),
  on: () => mockRoom,
  off: () => mockRoom,
};

// L'état que `getState()` rend. Le test le pose avant le montage, puis publie
// les transitions suivantes par `publish()` — exactement les deux voies qu'offre
// le vrai module.
let mockCallState: CallState = { status: 'idle' };
const mockListeners = new Set<(state: CallState) => void>();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({ slug: 'reunion', camera: '1', mic: '1' }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// `Snackbar` de `react-native-paper` lit `useSafeAreaInsets()`, qui lève sans
// `<SafeAreaProvider>` ancestor — présent en production (`app/_layout.tsx`),
// absent ici puisque `CallScreen` est rendu seul. Double officiel de la
// librairie (son propre dossier `jest/`), pas un bouchon maison : il retombe
// sur des marges à zéro en l'absence de Provider, exactement ce dont un test
// a besoin.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('src/call/connection', () => ({
  createCallSession: () => ({
    connect: mockConnect,
    disconnect: mockDisconnect,
    dispose: mockDispose,
    // Le double du plan appelait le listener à l'abonnement. **Le vrai
    // `subscribe()` ne pousse pas l'état courant** : il n'enregistre l'abonné
    // que pour les transitions suivantes. Un écran écrit contre le double du
    // plan passe ses tests et reste bloqué sur le voyant de connexion en
    // production. Ce double-ci reproduit le contrat réel.
    subscribe: (listener: (state: CallState) => void) => {
      mockListeners.add(listener);
      return () => {
        mockListeners.delete(listener);
        mockUnsubscribed();
      };
    },
    getState: () => mockCallState,
    getRoom: () => mockRoom,
  }),
}));

// Publie une transition comme le fait la machine à états de `src/call/connection` :
// l'état courant avance, puis les abonnés sont notifiés.
async function publish(next: CallState): Promise<void> {
  await act(async () => {
    mockCallState = next;
    for (const listener of Array.from(mockListeners)) listener(next);
  });
}

const ACCOUNT = {
  id: 'https://sso.linagora.com|u-1',
  instance: {
    serverUrl: 'https://meet.linagora.com',
    issuer: 'https://sso.linagora.com',
    clientId: 'twake-visio',
    livekitUrl: 'https://livekit.linagora.com',
    features: { recording: true, subtitle: true, telephony: false },
  },
  email: 'ada@linagora.com',
  displayName: 'Ada',
};

const GRANTED = {
  ok: true,
  value: {
    room: { id: 'r-1', slug: 'reunion', name: 'Réunion', accessLevel: 'public' },
    livekitUrl: 'wss://livekit.linagora.com',
    token: 'lk',
    isAdministrable: false,
  },
} as const;

beforeEach(() => {
  jest.restoreAllMocks();
  mockReplace.mockReset();
  mockConnect.mockReset().mockResolvedValue(undefined);
  mockDisconnect.mockReset().mockResolvedValue(undefined);
  mockDispose.mockReset();
  mockUnsubscribed.mockReset();
  mockListeners.clear();
  mockCallState = { status: 'connected' };
  mockCameraPublication = undefined;
  // Un test de modération peut peupler la Room de participants distants ;
  // sans ce nettoyage, ils survivraient au test suivant.
  mockRoom.remoteParticipants.clear();
  jest.mocked(VideoTrack).mockClear();

  jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
  jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);
  jest.spyOn(media, 'setMicrophoneEnabled').mockResolvedValue();
  jest.spyOn(media, 'setCameraEnabled').mockResolvedValue();
  jest.spyOn(media, 'switchCamera').mockResolvedValue('environment');
});

describe('CallScreen', () => {
  it("lit l'état courant à l'initialisation, que `subscribe` ne pousse pas", async () => {
    // Le régresseur : le double n'appelle jamais le listener à l'abonnement.
    // Un écran qui partirait de `idle` en attendant une poussée initiale
    // afficherait le voyant de connexion pour toujours sur une séance déjà
    // ouverte. Seule une lecture de `getState()` au montage le sauve.
    mockCallState = { status: 'connected' };

    await render(<CallScreen />);

    expect(screen.getByTestId('mic-toggle')).toBeTruthy();
    expect(screen.queryByTestId('call-connecting')).toBeNull();
    // L'écran s'est bien abonné — il n'a simplement rien reçu.
    expect(mockListeners.size).toBe(1);
  });

  it('expose la barre de contrôle une fois connecté', async () => {
    await render(<CallScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('mic-toggle')).toBeTruthy();
      expect(screen.getByTestId('camera-toggle')).toBeTruthy();
      expect(screen.getByTestId('switch-camera')).toBeTruthy();
      expect(screen.getByTestId('leave-btn')).toBeTruthy();
      expect(screen.getByTestId('active-speaker')).toBeTruthy();
      expect(screen.getByTestId('filmstrip')).toBeTruthy();
    });
  });

  it('pose sa propre vignette sur la scène tant qu’on est seul', async () => {
    // Le seul bout de chaîne que cet écran peut montrer : la Room est lue, la
    // sélection tranche, la coquille pose une vignette. Ce que cette vignette
    // affiche vraiment, personne ici ne peut le vérifier.
    await render(<CallScreen />);

    await waitFor(() => expect(screen.getByTestId('tile-me')).toBeTruthy());
    expect(screen.getByTestId('tile-placeholder-me')).toBeTruthy();
  });

  it('porte la face courante de la caméra jusqu’au miroir de sa propre image', async () => {
    // La face vit dans l'état de l'écran, le miroir se décide dans la
    // sélection : si l'écran ne lui passe pas la face courante, sa propre image
    // reste retournée après le passage en caméra arrière, et tout ce qu'elle
    // filme devient illisible. Rien d'autre ne relie ces deux bouts.
    mockCameraPublication = { trackSid: 'ts-me', source: 'camera', isMuted: false, track: {} };
    await render(<CallScreen />);
    await waitFor(() => expect(VideoTrack).toHaveBeenCalled());
    expect(jest.mocked(VideoTrack).mock.lastCall?.[0].mirror).toBe(true);

    await fireEvent.press(screen.getByTestId('switch-camera'));

    await waitFor(() => expect(jest.mocked(VideoTrack).mock.lastCall?.[0].mirror).toBe(false));
  });

  it("suit les transitions publiées après l'abonnement", async () => {
    mockCallState = { status: 'connecting' };

    await render(<CallScreen />);
    expect(screen.getByTestId('call-connecting')).toBeTruthy();

    await publish({ status: 'connected' });

    expect(screen.getByTestId('mic-toggle')).toBeTruthy();
  });

  it('annonce la reconnexion sans masquer la séance', async () => {
    // Sans cet état visible, la personne regarde une image figée en croyant que
    // c'est cassé, alors que le transport est en train de se rétablir.
    await render(<CallScreen />);

    await publish({ status: 'reconnecting' });

    expect(screen.getByTestId('call-reconnecting')).toBeTruthy();
    expect(screen.getByTestId('leave-btn')).toBeTruthy();
  });

  it("traduit le motif de coupure et n'affiche jamais le texte brut du SDK", async () => {
    await render(<CallScreen />);

    await publish({ status: 'disconnected', reason: 'could not establish signal connection' });

    expect(screen.getByTestId('call-error')).toHaveTextContent('error.network');
    expect(screen.queryByText(/signal connection/)).toBeNull();
  });

  it("distingue une séance fermée par le serveur d'une panne de connexion", async () => {
    await render(<CallScreen />);

    await publish({ status: 'disconnected', reason: 'closed' });

    expect(screen.getByTestId('call-error')).toHaveTextContent('call.ended');
  });

  it("applique les choix du pré-écran à l'entrée en séance", async () => {
    await render(<CallScreen />);

    await waitFor(() => {
      expect(media.setMicrophoneEnabled).toHaveBeenCalledWith(mockRoom, true);
      expect(media.setCameraEnabled).toHaveBeenCalledWith(mockRoom, true);
    });
  });

  it("coupe réellement le micro, et ne fait pas que changer l'icône", async () => {
    // Un bouton qui bascule son apparence sans agir sur la session est le pire
    // défaut possible ici : la personne se croit coupée et ne l'est pas.
    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('mic-toggle')).toBeTruthy());
    jest.mocked(media.setMicrophoneEnabled).mockClear();

    await fireEvent.press(screen.getByTestId('mic-toggle'));

    await waitFor(() => {
      expect(media.setMicrophoneEnabled).toHaveBeenCalledWith(mockRoom, false);
    });
    // Et la bascule ne raccroche pas au passage : le plan faisait dépendre
    // l'effet de connexion de `micOn`, ce qui déclenchait son nettoyage — donc
    // une coupure de séance — à chaque appui.
    expect(mockDisconnect).not.toHaveBeenCalled();
  });

  it('repart de la face renvoyée par le module média', async () => {
    // Le SDK n'expose pas la face courante : si l'écran ne conserve pas celle
    // qu'on lui rend, le second appui redemande la même et la caméra ne tourne
    // plus jamais.
    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('switch-camera')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('switch-camera'));
    await waitFor(() => expect(media.switchCamera).toHaveBeenCalledWith(mockRoom, 'user'));

    await fireEvent.press(screen.getByTestId('switch-camera'));
    await waitFor(() =>
      expect(media.switchCamera).toHaveBeenLastCalledWith(mockRoom, 'environment'),
    );
  });

  it('quitte en fermant la session avant de naviguer', async () => {
    // L'ordre compte : naviguer d'abord démonte le composant et le nettoyage
    // peut ne jamais atteindre le serveur, laissant un participant fantôme
    // dans la réunion pour les autres.
    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('leave-btn'));

    await waitFor(() => {
      expect(mockDisconnect).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/home');
    });
    expect(mockDisconnect.mock.invocationCallOrder[0]).toBeLessThan(
      mockReplace.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it('se désabonne et libère la session au démontage', async () => {
    // `subscribe` rend une fonction de désabonnement, et `dispose()` est
    // terminal : sans lui la Room survit à l'écran, et avec elle le micro, la
    // caméra et le transport.
    const view = await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    await view.unmount();

    expect(mockUnsubscribed).toHaveBeenCalled();
    expect(mockDispose).toHaveBeenCalled();
    expect(mockListeners.size).toBe(0);
  });

  it('dit que la session a expiré sans tenter de rejoindre', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(null);

    await render(<CallScreen />);

    expect(screen.getByTestId('call-error')).toHaveTextContent('error.unauthorized');
    expect(rooms.fetchRoomAccess).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("relaie un refus de l'API sans le confondre avec une panne réseau", async () => {
    jest
      .spyOn(rooms, 'fetchRoomAccess')
      .mockResolvedValue({ ok: false, error: { kind: 'unauthorized' } });

    await render(<CallScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('call-error')).toHaveTextContent('error.unauthorized');
    });
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('laisse une porte de sortie quand la séance a échoué', async () => {
    // L'en-tête est masqué par le Stack : sans ce bouton, un écran d'erreur est
    // un cul-de-sac dont on ne sort qu'en tuant l'application.
    await render(<CallScreen />);
    await publish({ status: 'disconnected', reason: 'closed' });

    await fireEvent.press(screen.getByTestId('error-leave-btn'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'));
  });
});

describe('CallScreen, partage du lien', () => {
  it("partage un lien qui porte sur l'instance du compte", async () => {
    // Le lien doit venir de l'instance de la personne connectée. Une constante
    // enverrait tout le monde sur meet.linagora.com, y compris quelqu'un dont
    // la réunion vit ailleurs.
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('share-btn'));

    await waitFor(() => {
      expect(share).toHaveBeenCalledWith({
        message: 'https://meet.linagora.com/reunion',
        url: 'https://meet.linagora.com/reunion',
      });
    });
  });

  it("ne fait pas tomber l'écran quand le partage est annulé", async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('annulé'));

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('share-btn'));

    // Un partage annulé est un geste ordinaire, pas une panne : la séance
    // continue.
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
  });
});

describe('CallScreen, salle d’attente', () => {
  // La scrutation part d'un `setInterval` de cinq secondes : sans avancer le
  // temps, `listWaitingParticipants` ne serait jamais appelé, garde ouverte ou
  // pas, et ces tests ne distingueraient rien du tout. Portée à ce describe
  // seul pour ne pas changer le comportement des horloges des autres tests.
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function tick(): Promise<void> {
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
  }

  it("n'interroge pas la file sur un salon public", async () => {
    // Le serveur rend `[]` sur un salon public et 404 sur `enter` : interroger
    // serait du bruit garanti, et l'écran de création propose `public` par
    // défaut.
    const list = jest.spyOn(participants, 'listWaitingParticipants');
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('public', true));

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await tick();

    expect(list).not.toHaveBeenCalled();
  });

  it("n'interroge pas la file sans droit de modérer", async () => {
    const list = jest.spyOn(participants, 'listWaitingParticipants');
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', false));

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await tick();

    expect(list).not.toHaveBeenCalled();
  });

  // I3 : `canModerate` valait vrai dès `isAdministrable`, sans regarder
  // `room.id` (`string | null` depuis le premier commit d'API). Un salon
  // administrable dont l'id est `null` scrutait quand même
  // `/api/v1.0/rooms//waiting-participants/` toutes les cinq secondes — la
  // chaîne vide venant du repli `access?.room.id ?? ''`.
  it("n'interroge pas la file quand l'identifiant de salon est absent, même administrable", async () => {
    const list = jest.spyOn(participants, 'listWaitingParticipants');
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
      ok: true,
      value: {
        room: { id: null, slug: 'reunion', name: 'r', accessLevel: 'trusted' },
        livekitUrl: 'wss://lk',
        token: 'lk',
        isAdministrable: true,
      },
    });

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await tick();

    expect(list).not.toHaveBeenCalled();
  });

  it('interroge la file dès que les deux conditions sont réunies', async () => {
    // La garde n'est pas testée que par ses refus : un `&&` mal câblé (par
    // exemple un `||`, ou une des deux moitiés oubliée) peut aussi bloquer un
    // cas qui devrait passer. Sans ce test, une garde figée à `false` rendrait
    // les deux tests précédents vrais pour la mauvaise raison.
    const list = jest
      .spyOn(participants, 'listWaitingParticipants')
      .mockResolvedValue({ ok: true, value: [] });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await tick();

    expect(list).toHaveBeenCalledWith(ACCOUNT, 'r-1');
  });

  it('affiche la première personne en attente et annonce celles qui restent', async () => {
    // Deux personnes, jamais une seule : avec une seule, `firstWaiting` et un
    // repli codé en dur qui rendrait toujours la même personne seraient
    // indiscernables.
    jest.spyOn(participants, 'listWaitingParticipants').mockResolvedValue({
      ok: true,
      value: [
        { id: 'lobby-1', username: 'Ada' },
        { id: 'lobby-2', username: 'Bob' },
      ],
    });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await tick();

    await waitFor(() => expect(screen.getByTestId('waiting-banner')).toBeTruthy());
    // Une deuxième personne en file : `remaining` doit le dire.
    expect(screen.getByTestId('waiting-others')).toBeTruthy();
  });

  it("n'annonce personne d'autre pour une seule personne en attente", async () => {
    // L'autre borne de `Math.max(waiting.length - 1, 0)` : sans elle, une
    // formule qui ne soustrairait pas (par exemple `waiting.length` seul)
    // passerait le test précédent tout en annonçant, à tort, une personne
    // supplémentaire ici.
    jest.spyOn(participants, 'listWaitingParticipants').mockResolvedValue({
      ok: true,
      value: [{ id: 'lobby-1', username: 'Ada' }],
    });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await tick();

    await waitFor(() => expect(screen.getByTestId('waiting-banner')).toBeTruthy());
    expect(screen.queryByTestId('waiting-others')).toBeNull();
  });

  it('admet la première personne en attente avec son UUID de lobby, jamais une autre valeur', async () => {
    // `lobby-1`/`lobby-2` ne ressemblent ni à `r-1` (l'identifiant de salon)
    // ni à `me` (l'identité LiveKit du participant local) : si l'écran envoyait
    // l'un de ceux-là par erreur, l'assertion le distinguerait.
    jest.spyOn(participants, 'listWaitingParticipants').mockResolvedValue({
      ok: true,
      value: [
        { id: 'lobby-1', username: 'Ada' },
        { id: 'lobby-2', username: 'Bob' },
      ],
    });
    const answerEntrySpy = jest
      .spyOn(participants, 'answerEntry')
      .mockResolvedValue({ ok: true, value: undefined });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await tick();
    await waitFor(() => expect(screen.getByTestId('waiting-admit')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('waiting-admit'));

    expect(answerEntrySpy).toHaveBeenCalledWith(ACCOUNT, 'r-1', 'lobby-1', true);
  });

  it('refuse par le même mécanisme, sans inverser le sens du booléen', async () => {
    // Admettre et refuser partent vers le même endpoint : inverser le booléen
    // laisserait entrer qui on voulait écarter.
    jest.spyOn(participants, 'listWaitingParticipants').mockResolvedValue({
      ok: true,
      value: [
        { id: 'lobby-1', username: 'Ada' },
        { id: 'lobby-2', username: 'Bob' },
      ],
    });
    const answerEntrySpy = jest
      .spyOn(participants, 'answerEntry')
      .mockResolvedValue({ ok: true, value: undefined });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await tick();
    await waitFor(() => expect(screen.getByTestId('waiting-refuse')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('waiting-refuse'));

    expect(answerEntrySpy).toHaveBeenCalledWith(ACCOUNT, 'r-1', 'lobby-1', false);
  });

  // I1 : `answer` avalait l'échec d'`answerEntry` (`.catch(() => undefined)`),
  // qui ne voit jamais passer l'échec ordinaire d'un `ApiResult` — une valeur
  // résolue, pas un rejet. Le modérateur croyait avoir répondu ; la personne
  // dehors n'entrait jamais, sans un mot pour le dire.
  it("affiche un message visible quand admettre échoue, sans l'avaler", async () => {
    jest.spyOn(participants, 'listWaitingParticipants').mockResolvedValue({
      ok: true,
      value: [{ id: 'lobby-1', username: 'Ada' }],
    });
    jest
      .spyOn(participants, 'answerEntry')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await tick();
    await waitFor(() => expect(screen.getByTestId('waiting-admit')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('waiting-admit'));

    await waitFor(() => {
      expect(screen.getByTestId('moderation-error')).toHaveTextContent('error.network');
    });
  });
});

describe('CallScreen, panneau des participants', () => {
  it('ouvre et referme le panneau des participants depuis la barre de contrôle', async () => {
    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('active-speaker')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participants-toggle'));

    await waitFor(() => expect(screen.getByText('participants.title')).toBeTruthy());
    // Le panneau remplace la scène plutôt que de se poser par-dessus.
    expect(screen.queryByTestId('active-speaker')).toBeNull();

    await fireEvent.press(screen.getByTestId('participants-toggle'));

    await waitFor(() => expect(screen.getByTestId('active-speaker')).toBeTruthy());
    expect(screen.queryByText('participants.title')).toBeNull();
  });

  it("mute par l'identité LiveKit de la ligne pressée, jamais par l'UUID de lobby", async () => {
    // Deux personnes distantes, jamais une seule : avec une seule, on ne
    // distinguerait pas « transmet l'identité reçue » de « ignore l'argument et
    // agit toujours sur la même ». `bob-identity` ne ressemble ni à `r-1`
    // (l'identifiant de salon) ni à une UUID de lobby.
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    mockRoom.remoteParticipants.set('bob-identity', remoteParticipant('bob-identity', 'Bob'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    const muteSpy = jest
      .spyOn(participants, 'muteParticipant')
      .mockResolvedValue({ ok: true, value: undefined });

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getAllByTestId('participant-mute')).toHaveLength(2));

    await fireEvent.press(nth(screen.getAllByTestId('participant-mute'), 1));

    expect(muteSpy).toHaveBeenCalledWith(ACCOUNT, 'r-1', 'bob-identity');
  });

  it('expulse et promeut par la même identité LiveKit, pas par la première', async () => {
    // Deux personnes distantes, jamais une seule : avec une seule, un
    // `handleRemoveParticipant`/`handleChangeParticipantRole` qui ignorerait
    // son paramètre et enverrait `'alice-identity'` en dur serait
    // indiscernable d'un câblage correct — exactement le trou déjà payé par
    // la tâche 7, et relevé par la revue de cette tâche-ci pour ces deux
    // actions précises.
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    mockRoom.remoteParticipants.set('bob-identity', remoteParticipant('bob-identity', 'Bob'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    const removeSpy = jest
      .spyOn(participants, 'removeParticipant')
      .mockResolvedValue({ ok: true, value: undefined });
    const roleSpy = jest
      .spyOn(participants, 'updateParticipantRole')
      .mockResolvedValue({ ok: true, value: undefined });

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getAllByTestId('participant-remove')).toHaveLength(2));

    await fireEvent.press(nth(screen.getAllByTestId('participant-remove'), 1));
    await fireEvent.press(nth(screen.getAllByTestId('participant-promote'), 1));

    expect(removeSpy).toHaveBeenCalledWith(ACCOUNT, 'r-1', 'bob-identity');
    expect(roleSpy).toHaveBeenCalledWith(ACCOUNT, 'r-1', 'bob-identity', 'administrator');
  });

  it("ne montre aucune action de modération sans droit d'administrer", async () => {
    // Le `GRANTED` par défaut du `beforeEach` global porte déjà
    // `isAdministrable: false` : rien à surcharger ici.
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));

    await waitFor(() => expect(screen.getAllByTestId('participant-row')).toHaveLength(2));
    expect(screen.queryByTestId('participant-mute')).toBeNull();
    expect(screen.queryByTestId('participant-remove')).toBeNull();
    expect(screen.queryByTestId('participant-promote')).toBeNull();
  });

  // I3, même garde que la salle d'attente ci-dessus : un salon administrable
  // dont `room.id` est `null` ne doit pas non plus proposer d'action, sans
  // quoi l'appui fabriquerait `/api/v1.0/rooms//mute-participant/`.
  it("ne montre aucune action de modération quand l'identifiant de salon est absent", async () => {
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
      ok: true,
      value: {
        room: { id: null, slug: 'reunion', name: 'r', accessLevel: 'trusted' },
        livekitUrl: 'wss://lk',
        token: 'lk',
        isAdministrable: true,
      },
    });

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));

    await waitFor(() => expect(screen.getAllByTestId('participant-row')).toHaveLength(2));
    expect(screen.queryByTestId('participant-mute')).toBeNull();
    expect(screen.queryByTestId('participant-remove')).toBeNull();
    expect(screen.queryByTestId('participant-promote')).toBeNull();
  });
});

describe('CallScreen, échec de modération', () => {
  // `ApiResult<void>` rend son échec ordinaire comme une valeur (`{ ok: false
  // }`), jamais comme un rejet : un `.catch()` seul ne le verrait jamais
  // passer, et couper le micro, expulser ou promouvoir resteraient sans
  // aucun retour visible en cas de 403 — un cas réel, pas hypothétique, pour
  // `mute_participant` côté serveur.
  it("affiche un message visible quand couper le micro échoue, sans l'avaler", async () => {
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest
      .spyOn(participants, 'muteParticipant')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-mute')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-mute'));

    await waitFor(() => {
      expect(screen.getByTestId('moderation-error')).toHaveTextContent('error.network');
    });
  });

  it("distingue un refus d'autorisation d'une panne réseau", async () => {
    // Même mécanisme que `toAccessMessage`/`toApiErrorMessage` pour l'accès
    // initial : seul `unauthorized` a sa propre clé, le reste retombe sur
    // `error.network`. Ce test vérifie que la branche `unauthorized` est bien
    // atteignable depuis ce nouvel appelant, pas seulement depuis l'ancien.
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest
      .spyOn(participants, 'muteParticipant')
      .mockResolvedValue({ ok: false, error: { kind: 'unauthorized' } });

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-mute')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-mute'));

    await waitFor(() => {
      expect(screen.getByTestId('moderation-error')).toHaveTextContent('error.unauthorized');
    });
  });

  it("affiche aussi l'échec d'une expulsion", async () => {
    // Les trois actions partagent le même défaut avant correctif : ne pas les
    // couvrir toutes les trois reproduirait exactement le trou de l'Important 1.
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest
      .spyOn(participants, 'removeParticipant')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-remove')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-remove'));

    await waitFor(() => {
      expect(screen.getByTestId('moderation-error')).toHaveTextContent('error.network');
    });
  });

  it("affiche aussi l'échec d'un changement de rôle", async () => {
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest
      .spyOn(participants, 'updateParticipantRole')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-promote')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-promote'));

    await waitFor(() => {
      expect(screen.getByTestId('moderation-error')).toHaveTextContent('error.network');
    });
  });

  it('rejette une exception inattendue comme une panne réseau', async () => {
    // Chemin distinct du précédent : ici la promesse rejette vraiment (au
    // lieu de résoudre `{ ok: false }`), et c'est le `.catch()` qui doit agir.
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest.spyOn(participants, 'muteParticipant').mockRejectedValue(new Error('boom'));

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-mute')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-mute'));

    await waitFor(() => {
      expect(screen.getByTestId('moderation-error')).toHaveTextContent('error.network');
    });
  });

  it('ne montre rien quand la modération réussit', async () => {
    // Résolution différée et contrôlée : sans elle, rien ne garantit qu'on
    // observe l'état d'après-résolution plutôt qu'un instant où la promesse
    // n'a simplement pas encore eu la chance de répondre.
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    let resolveMute: (result: ApiResult<void>) => void = () => undefined;
    jest.spyOn(participants, 'muteParticipant').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMute = resolve;
        }),
    );

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-mute')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-mute'));
    await act(async () => {
      resolveMute({ ok: true, value: undefined });
    });

    expect(screen.queryByTestId('moderation-error')).toBeNull();
  });

  // M7 : le commentaire au-dessus des trois gestionnaires promet qu'« un
  // succès efface une éventuelle erreur affichée par un essai précédent »,
  // mais aucun test ne partait d'un état d'erreur pour le vérifier — muter
  // `result.ok ? null : …` en `result.ok ? moderationError : …` laissait les
  // tests précédents verts.
  it('efface une erreur affichée par un essai précédent quand le suivant réussit', async () => {
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    const muteSpy = jest.spyOn(participants, 'muteParticipant');
    muteSpy.mockResolvedValueOnce({ ok: false, error: { kind: 'forbidden' } });

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-mute')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-mute'));
    await waitFor(() => {
      expect(screen.getByTestId('moderation-error')).toHaveTextContent('error.network');
    });

    muteSpy.mockResolvedValueOnce({ ok: true, value: undefined });
    await fireEvent.press(screen.getByTestId('participant-mute'));

    await waitFor(() => {
      expect(screen.queryByTestId('moderation-error')).toBeNull();
    });
  });
});
