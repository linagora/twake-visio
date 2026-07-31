import { VideoTrack } from '@livekit/react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Track } from 'livekit-client';
import React from 'react';
import { Share } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import * as hand from 'src/api/hand';
import * as participants from 'src/api/participants';
import * as recordingApi from 'src/api/recording';
import * as rooms from 'src/api/rooms';
import type { ApiResult } from 'src/api/types';
import * as accounts from 'src/auth/accounts';
import * as audioRoute from 'src/call/audioRoute';
import type { CameraChoice } from 'src/call/devices';
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

// `CameraMenu` monte son contenu dans un `Portal`, qui jette sans
// `PaperProvider` ancêtre. `animation.scale` à zéro ramène à zéro la durée de
// l'animation de fermeture que `Menu` lance au montage — sans quoi son rappel
// de fin, qui remet `rendered` à faux, tombe 250 ms plus tard et annule
// l'ouverture. Tous les rendus de ce fichier passent par ici, y compris ceux
// qui n'ouvrent aucun menu : une seule voie vaut mieux que deux, et
// l'enveloppement de tous les rendus existants a été vérifié sans régression.
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

// Même à durée nulle, ce rappel part sur un `requestAnimationFrame` : sous Jest,
// `NativeAnimatedModule` est absent et `Animated` retombe sur son moteur
// JavaScript. Appelé avant chaque appui qui **ouvre** un menu — après le rendu
// comme après une fermeture, qui arme exactement le même rappel. Mesuré : 39
// ouvertures sur 40 sans ce vidage, 300 sur 300 avec.
async function settleMenus(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

const FRONT_CAMERA: CameraChoice = {
  deviceId: 'cam-front',
  facing: 'user',
  nameKey: 'call.cameraFront',
  ordinal: null,
};

const BACK_CAMERA: CameraChoice = {
  deviceId: 'cam-back',
  facing: 'environment',
  nameKey: 'call.cameraBack',
  ordinal: null,
};

const UNKNOWN_CAMERA: CameraChoice = {
  deviceId: 'cam-unknown',
  facing: 'unknown',
  nameKey: 'call.cameraUnknown',
  ordinal: null,
};

// Un participant distant minimal, du même contrat que `readParticipant` dans
// `src/call/participants` attend d'un `Participant` LiveKit — même convention
// que le `person()` de `useCallLayout.spec.ts`. `attributes` par défaut à `{}` :
// la plupart des tests de ce fichier ne portent pas sur la main levée.
function remoteParticipant(
  identity: string,
  name: string,
  attributes: Record<string, string> = {},
): unknown {
  return {
    identity,
    name,
    isLocal: false,
    isSpeaking: false,
    attributes,
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
//
// `mockRoomMetadata`/`mockRoomIsRecording` sont les deux membres que
// `createRecordingStore` lit directement (`src/call/recordingStore.ts`,
// `getSnapshot`) : des accesseurs, pas des champs figés, pour qu'un test
// puisse poser leur valeur avant le montage et simuler ce que voit qui
// rejoint une réunion déjà en cours d'enregistrement.
let mockRoomMetadata: string | undefined;
let mockRoomIsRecording = false;

// Les attributs du participant local, posés par le test qui en a besoin. Un
// accesseur, pas un champ figé : `readRoomView` les relit à chaque
// invalidation, et c'est ce qui permet de simuler l'attribut arrivant du
// serveur LiveKit **après** l'appui.
let mockLocalAttributes: Record<string, string> = {};

// Les gestionnaires attachés par les magasins, rangés par nom d'événement.
// L'ancien double rendait `on`/`off` inertes : aucun test ne pouvait alors
// distinguer une vue relue d'une vue figée au montage. `emitRoom` est la seule
// façon de faire arriver un changement d'attributs comme le fait le serveur.
const mockRoomHandlers = new Map<string, (() => void)[]>();

const mockRoom: {
  localParticipant: unknown;
  remoteParticipants: Map<string, unknown>;
  readonly metadata: string | undefined;
  readonly isRecording: boolean;
  on: (event: string, handler: () => void) => unknown;
  off: (event: string, handler: () => void) => unknown;
} = {
  localParticipant: {
    identity: 'me',
    isLocal: true,
    isSpeaking: false,
    get attributes(): Record<string, string> {
      return mockLocalAttributes;
    },
    // Doit distinguer la source : une réponse indifférente au paramètre
    // fabriquerait un faux partage d'écran local dès qu'un test pose
    // `mockCameraPublication`, puisque `src/call/participants.ts` lit aussi
    // `Track.Source.ScreenShare`. C'est exactement ce qui rendait
    // `tile-me:screen` réel et faisait passer deux tests ci-dessous pour la
    // mauvaise raison, avant ce correctif.
    getTrackPublication: (source: Track.Source) =>
      source === Track.Source.Camera ? mockCameraPublication : undefined,
  },
  remoteParticipants: new Map<string, unknown>(),
  get metadata(): string | undefined {
    return mockRoomMetadata;
  },
  get isRecording(): boolean {
    return mockRoomIsRecording;
  },
  on(event: string, handler: () => void): unknown {
    mockRoomHandlers.set(event, [...(mockRoomHandlers.get(event) ?? []), handler]);
    return mockRoom;
  },
  off(event: string, handler: () => void): unknown {
    const attached = mockRoomHandlers.get(event) ?? [];
    const index = attached.indexOf(handler);
    if (index !== -1) attached.splice(index, 1);
    if (attached.length === 0) mockRoomHandlers.delete(event);
    return mockRoom;
  },
};

// Fait arriver un événement de Room comme le ferait le SDK, dans un `act` :
// les magasins invalident, React relit, l'écran se réaffiche.
async function emitRoom(event: string): Promise<void> {
  await act(async () => {
    for (const handler of Array.from(mockRoomHandlers.get(event) ?? [])) handler();
  });
}

// L'état que `getState()` rend. Le test le pose avant le montage, puis publie
// les transitions suivantes par `publish()` — exactement les deux voies qu'offre
// le vrai module.
let mockCallState: CallState = { status: 'idle' };
const mockListeners = new Set<(state: CallState) => void>();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({ slug: 'reunion', camera: '1', mic: '1' }),
}));
// Interpolation rendue visible : sans elle, `t` rend la seule clé et un nombre
// codé en dur dans une coquille serait indiscernable du nombre calculé par
// l'écran. Vérifié : aucune des assertions existantes de ce fichier n'observe
// une clé interpolée.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}|${JSON.stringify(values)}`,
  }),
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
  mockRoomHandlers.clear();
  mockLocalAttributes = {};
  mockRoomMetadata = undefined;
  mockRoomIsRecording = false;
  jest.mocked(VideoTrack).mockClear();

  jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
  jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(GRANTED);
  jest.spyOn(media, 'setMicrophoneEnabled').mockResolvedValue();
  jest.spyOn(media, 'setCameraEnabled').mockResolvedValue();
  jest.spyOn(media, 'listCameras').mockResolvedValue([]);
  jest.spyOn(media, 'readActiveCameraId').mockReturnValue(null);
  jest.spyOn(media, 'selectCamera').mockResolvedValue(true);

  // 'menu' par défaut : c'est la branche qui a quelque chose à montrer. Les
  // tests du mode 'system' la surchargent.
  jest.spyOn(audioRoute, 'audioRouteControl').mockReturnValue('menu');
  jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue([]);
  jest.spyOn(audioRoute, 'selectAudioOutput').mockResolvedValue();
  jest.spyOn(audioRoute, 'openSystemRoutePicker').mockResolvedValue();
});

describe('CallScreen', () => {
  it("lit l'état courant à l'initialisation, que `subscribe` ne pousse pas", async () => {
    // Le régresseur : le double n'appelle jamais le listener à l'abonnement.
    // Un écran qui partirait de `idle` en attendant une poussée initiale
    // afficherait le voyant de connexion pour toujours sur une séance déjà
    // ouverte. Seule une lecture de `getState()` au montage le sauve.
    mockCallState = { status: 'connected' };

    await render(withPaper(<CallScreen />));

    expect(screen.getByTestId('mic-toggle')).toBeTruthy();
    expect(screen.queryByTestId('call-connecting')).toBeNull();
    // L'écran s'est bien abonné — il n'a simplement rien reçu.
    expect(mockListeners.size).toBe(1);
  });

  it('expose la barre de contrôle une fois connecté', async () => {
    await render(withPaper(<CallScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('mic-toggle')).toBeTruthy();
      expect(screen.getByTestId('camera-toggle')).toBeTruthy();
      expect(screen.getByTestId('leave-btn')).toBeTruthy();
      expect(screen.getByTestId('active-speaker')).toBeTruthy();
      expect(screen.getByTestId('filmstrip')).toBeTruthy();
    });
  });

  it("n'expose plus la bascule binaire de caméra", async () => {
    // Sa fonction est un sous-ensemble strict du menu caméra, sa bascule
    // ignore trois caméras sur cinq sur un iPhone Pro, et sans ce retrait la
    // rangée porterait huit cibles — ce qui ne tient sur aucun téléphone
    // supporté.
    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    expect(screen.queryByTestId('switch-camera')).toBeNull();
  });

  it('pose sa propre vignette sur la scène tant qu’on est seul', async () => {
    // Le seul bout de chaîne que cet écran peut montrer : la Room est lue, la
    // sélection tranche, la coquille pose une vignette. Ce que cette vignette
    // affiche vraiment, personne ici ne peut le vérifier.
    await render(withPaper(<CallScreen />));

    await waitFor(() => expect(screen.getByTestId('tile-me:camera')).toBeTruthy());
    expect(screen.getByTestId('tile-placeholder-me:camera')).toBeTruthy();
  });

  it("suit les transitions publiées après l'abonnement", async () => {
    mockCallState = { status: 'connecting' };

    await render(withPaper(<CallScreen />));
    expect(screen.getByTestId('call-connecting')).toBeTruthy();

    await publish({ status: 'connected' });

    expect(screen.getByTestId('mic-toggle')).toBeTruthy();
  });

  it('annonce la reconnexion sans masquer la séance', async () => {
    // Sans cet état visible, la personne regarde une image figée en croyant que
    // c'est cassé, alors que le transport est en train de se rétablir.
    await render(withPaper(<CallScreen />));

    await publish({ status: 'reconnecting' });

    expect(screen.getByTestId('call-reconnecting')).toBeTruthy();
    expect(screen.getByTestId('leave-btn')).toBeTruthy();
  });

  it("traduit le motif de coupure et n'affiche jamais le texte brut du SDK", async () => {
    await render(withPaper(<CallScreen />));

    await publish({ status: 'disconnected', reason: 'could not establish signal connection' });

    expect(screen.getByTestId('call-error')).toHaveTextContent('error.network');
    expect(screen.queryByText(/signal connection/)).toBeNull();
  });

  it("distingue une séance fermée par le serveur d'une panne de connexion", async () => {
    await render(withPaper(<CallScreen />));

    await publish({ status: 'disconnected', reason: 'closed' });

    expect(screen.getByTestId('call-error')).toHaveTextContent('call.ended');
  });

  it("applique les choix du pré-écran à l'entrée en séance", async () => {
    await render(withPaper(<CallScreen />));

    await waitFor(() => {
      expect(media.setMicrophoneEnabled).toHaveBeenCalledWith(mockRoom, true);
      expect(media.setCameraEnabled).toHaveBeenCalledWith(mockRoom, true);
    });
  });

  it("coupe réellement le micro, et ne fait pas que changer l'icône", async () => {
    // Un bouton qui bascule son apparence sans agir sur la session est le pire
    // défaut possible ici : la personne se croit coupée et ne l'est pas.
    await render(withPaper(<CallScreen />));
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

  it('quitte en fermant la session avant de naviguer', async () => {
    // L'ordre compte : naviguer d'abord démonte le composant et le nettoyage
    // peut ne jamais atteindre le serveur, laissant un participant fantôme
    // dans la réunion pour les autres.
    await render(withPaper(<CallScreen />));
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
    const view = await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    await view.unmount();

    expect(mockUnsubscribed).toHaveBeenCalled();
    expect(mockDispose).toHaveBeenCalled();
    expect(mockListeners.size).toBe(0);
  });

  it('dit que la session a expiré sans tenter de rejoindre', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(null);

    await render(withPaper(<CallScreen />));

    expect(screen.getByTestId('call-error')).toHaveTextContent('error.unauthorized');
    expect(rooms.fetchRoomAccess).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("relaie un refus de l'API sans le confondre avec une panne réseau", async () => {
    jest
      .spyOn(rooms, 'fetchRoomAccess')
      .mockResolvedValue({ ok: false, error: { kind: 'unauthorized' } });

    await render(withPaper(<CallScreen />));

    await waitFor(() => {
      expect(screen.getByTestId('call-error')).toHaveTextContent('error.unauthorized');
    });
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('laisse une porte de sortie quand la séance a échoué', async () => {
    // L'en-tête est masqué par le Stack : sans ce bouton, un écran d'erreur est
    // un cul-de-sac dont on ne sort qu'en tuant l'application.
    await render(withPaper(<CallScreen />));
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

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
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

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
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

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await tick();

    expect(list).not.toHaveBeenCalled();
  });

  it("n'interroge pas la file sans droit de modérer", async () => {
    const list = jest.spyOn(participants, 'listWaitingParticipants');
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', false));

    await render(withPaper(<CallScreen />));
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

    await render(withPaper(<CallScreen />));
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

    await render(withPaper(<CallScreen />));
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

    await render(withPaper(<CallScreen />));
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

    await render(withPaper(<CallScreen />));
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

    await render(withPaper(<CallScreen />));
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

    await render(withPaper(<CallScreen />));
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

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await tick();
    await waitFor(() => expect(screen.getByTestId('waiting-admit')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('waiting-admit'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.network');
    });
  });
});

describe('CallScreen, panneau des participants', () => {
  it('ouvre et referme le panneau des participants depuis la barre de contrôle', async () => {
    await render(withPaper(<CallScreen />));
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

    await render(withPaper(<CallScreen />));
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

    await render(withPaper(<CallScreen />));
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

    await render(withPaper(<CallScreen />));
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

    await render(withPaper(<CallScreen />));
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

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-mute')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-mute'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.network');
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

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-mute')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-mute'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.unauthorized');
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

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-remove')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-remove'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.network');
    });
  });

  it("affiche aussi l'échec d'un changement de rôle", async () => {
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest
      .spyOn(participants, 'updateParticipantRole')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-promote')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-promote'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.network');
    });
  });

  it('rejette une exception inattendue comme une panne réseau', async () => {
    // Chemin distinct du précédent : ici la promesse rejette vraiment (au
    // lieu de résoudre `{ ok: false }`), et c'est le `.catch()` qui doit agir.
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest.spyOn(participants, 'muteParticipant').mockRejectedValue(new Error('boom'));

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-mute')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-mute'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.network');
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

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-mute')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-mute'));
    await act(async () => {
      resolveMute({ ok: true, value: undefined });
    });

    expect(screen.queryByTestId('call-notice')).toBeNull();
  });

  // M7 : le commentaire au-dessus des trois gestionnaires promet qu'« un
  // succès efface une éventuelle erreur affichée par un essai précédent »,
  // mais aucun test ne partait d'un état d'erreur pour le vérifier — muter
  // `result.ok ? null : …` en `result.ok ? notice : …` laissait les
  // tests précédents verts.
  it('efface une erreur affichée par un essai précédent quand le suivant réussit', async () => {
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    const muteSpy = jest.spyOn(participants, 'muteParticipant');
    muteSpy.mockResolvedValueOnce({ ok: false, error: { kind: 'forbidden' } });

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getByTestId('participant-mute')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('participant-mute'));
    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.network');
    });

    muteSpy.mockResolvedValueOnce({ ok: true, value: undefined });
    await fireEvent.press(screen.getByTestId('participant-mute'));

    await waitFor(() => {
      expect(screen.queryByTestId('call-notice')).toBeNull();
    });
  });
});

describe('CallScreen, choix de la caméra', () => {
  it("relit la liste et la caméra en service à l'ouverture du chevron, jamais avant", async () => {
    // Aucun abonnement, aucun sondage : `MediaDevicesChanged` ne se déclenche
    // jamais sur mobile, et rien d'autre ne notifie. L'ouverture est le seul
    // instant où une lecture est utile.
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());
    expect(media.listCameras).not.toHaveBeenCalled();
    expect(media.readActiveCameraId).not.toHaveBeenCalled();

    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(media.listCameras).toHaveBeenCalledTimes(1));
    expect(media.readActiveCameraId).toHaveBeenCalledWith(mockRoom);
  });

  it('demande la caméra pressée, jamais la première de la liste', async () => {
    // Deux caméras, jamais une seule, et la seconde visée : avec une seule,
    // « transmet le deviceId reçu » et « envoie toujours le même » seraient
    // indiscernables. `cam-back` ne ressemble ni à `r-1` (le salon) ni à `me`
    // (l'identité LiveKit locale).
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));

    await waitFor(() => expect(media.selectCamera).toHaveBeenCalledWith(mockRoom, 'cam-back'));
  });

  it('coche la caméra que le SDK dit en service, pas la première de la liste', async () => {
    // Deux caméras, jamais une seule, et la seconde désignée comme active :
    // avec une seule, « transmet ce que rend `readActiveCameraId` » et
    // « coche toujours la première » seraient indiscernables. C'est aussi ce
    // qui prouve que la lecture est bien câblée jusqu'à la prop du menu.
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);
    jest.spyOn(media, 'readActiveCameraId').mockReturnValue('cam-back');

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());
    await settleMenus();

    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(screen.getByTestId('camera-check-cam-back')).toBeTruthy());
    expect(screen.queryByTestId('camera-check-cam-front')).toBeNull();
  });

  it("porte la face de la caméra retenue jusqu'au miroir de sa propre image", async () => {
    // La face vit dans l'état de l'écran, le miroir se décide dans la
    // sélection : si l'écran ne prend pas la face du `CameraChoice` retenu, sa
    // propre image reste retournée après le passage en caméra arrière, et tout
    // ce qu'elle filme devient illisible.
    mockCameraPublication = { trackSid: 'ts-me', source: 'camera', isMuted: false, track: {} };
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(VideoTrack).toHaveBeenCalled());
    expect(jest.mocked(VideoTrack).mock.lastCall?.[0].mirror).toBe(true);

    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));

    await waitFor(() => expect(jest.mocked(VideoTrack).mock.lastCall?.[0].mirror).toBe(false));
  });

  it('ne touche pas au miroir quand la face de la caméra retenue est indéterminée', async () => {
    // iOS peut rendre "unknown" pour une caméra externe. `FacingMode` n'a pas
    // de miroir défini pour elle : la face précédente reste en vigueur, plutôt
    // que de retourner l'image sur une valeur qui ne veut rien dire.
    mockCameraPublication = { trackSid: 'ts-me', source: 'camera', isMuted: false, track: {} };
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, UNKNOWN_CAMERA]);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(VideoTrack).toHaveBeenCalled());
    expect(jest.mocked(VideoTrack).mock.lastCall?.[0].mirror).toBe(true);

    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-unknown')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('camera-option-cam-unknown'));

    await waitFor(() => expect(media.selectCamera).toHaveBeenCalledWith(mockRoom, 'cam-unknown'));
    expect(jest.mocked(VideoTrack).mock.lastCall?.[0].mirror).toBe(true);
  });

  it('annonce le repli silencieux quand le SDK rend false', async () => {
    // Sur Android, un `deviceId` invalide retombe sur le `facingMode` sans
    // rien dire : sans ce message, l'appui semble n'avoir servi à rien.
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);
    jest.spyOn(media, 'selectCamera').mockResolvedValue(false);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.deviceSwitchFailed');
    });
  });

  it('annonce aussi le rejet, qui est le second canal', async () => {
    // `switchActiveDevice` jette si `setDeviceId` jette. Un `.catch()` seul ne
    // verrait pas le premier canal ; ne lire que le booléen ne verrait pas
    // celui-ci.
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);
    jest.spyOn(media, 'selectCamera').mockRejectedValue(new Error('contrainte impossible'));

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.deviceSwitchFailed');
    });
  });

  it("efface le message quand l'essai suivant réussit", async () => {
    // Même règle que les actions de modération : un succès efface l'échec
    // précédent. Sans ce test, remplacer `setNotice(null)` par un no-op
    // laisserait les précédents verts.
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);
    const select = jest.spyOn(media, 'selectCamera');
    select.mockResolvedValueOnce(false);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));
    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.deviceSwitchFailed');
    });

    select.mockResolvedValueOnce(true);
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-front')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('camera-option-cam-front'));

    await waitFor(() => expect(screen.queryByTestId('call-notice')).toBeNull());
  });

  it("n'affiche rien quand l'énumération échoue, et ouvre un menu vide", async () => {
    // Un message d'erreur pour une liste que l'utilisateur vient tout juste de
    // demander à voir n'aide personne à agir, et le chevron ne peut pas être
    // désactivé.
    jest.spyOn(media, 'listCameras').mockRejectedValue(new Error('énumération refusée'));

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());

    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(media.listCameras).toHaveBeenCalled());
    expect(screen.queryByTestId('call-notice')).toBeNull();
    expect(screen.getByTestId('camera-menu-btn')).toBeTruthy();
    // Le menu est vraiment vide, pas seulement silencieux : miroir du trou
    // fermé côté audio en tâche 8 (`audio-output-option-bluetooth`, plus bas).
    expect(screen.queryByTestId('camera-option-cam-front')).toBeNull();
    expect(screen.queryByTestId('camera-option-cam-back')).toBeNull();
  });

  it("vide la liste plutôt que de garder celle d'avant quand une réouverture échoue", async () => {
    // `handleOpenCameraMenu` ne remettait pas `cameras` à zéro dans son
    // `.catch()` : une première ouverture réussie, puis un échec, laissait la
    // liste précédente affichée à la réouverture suivante — pas le menu vide
    // que promet le test ci-dessus, et que promet le commentaire de
    // `handleOpenCameraMenu`.
    const list = jest
      .spyOn(media, 'listCameras')
      .mockResolvedValueOnce([FRONT_CAMERA, BACK_CAMERA]);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-front')).toBeTruthy());

    list.mockRejectedValueOnce(new Error('énumération refusée'));
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(media.listCameras).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('camera-option-cam-front')).toBeNull();
    expect(screen.queryByTestId('camera-option-cam-back')).toBeNull();
  });
});

describe('CallScreen, sortie audio', () => {
  it("relit la liste à l'ouverture du menu, jamais avant", async () => {
    // Aucun sondage, aucun écouteur : rafraîchir la liste ne dirait jamais
    // d'où sort le son, seulement ce qui est disponible.
    jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue(['bluetooth', 'speaker']);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    expect(audioRoute.listAudioOutputs).not.toHaveBeenCalled();

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(audioRoute.listAudioOutputs).toHaveBeenCalledTimes(1));
  });

  it('demande la catégorie pressée, jamais la première de la liste', async () => {
    // Deux catégories, jamais une seule, et la seconde visée.
    jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue(['bluetooth', 'speaker']);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-option-speaker'));

    await waitFor(() => expect(audioRoute.selectAudioOutput).toHaveBeenCalledWith('speaker'));
    expect(audioRoute.selectAudioOutput).not.toHaveBeenCalledWith('bluetooth');
  });

  it('coche ce qui a été demandé à la réouverture, et prévient du désarmement', async () => {
    // La coche marque notre propre choix, jamais l'état du système. Et la
    // ligne d'explication est la seule occasion d'apprendre que la bascule
    // automatique vient d'être désarmée pour le reste de la séance.
    jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue(['bluetooth', 'speaker']);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('audio-output-note')).toHaveTextContent('call.outputFollowsDevice'),
    );
    await fireEvent.press(screen.getByTestId('audio-output-option-speaker'));

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-check-speaker')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-bluetooth')).toBeNull();
    expect(screen.getByTestId('audio-output-note')).toHaveTextContent('call.outputManualUntilEnd');
  });

  it("n'affiche aucun message quand une sortie est choisie", async () => {
    // Il n'existe aucun canal d'échec : afficher un succès serait du bruit,
    // afficher un échec serait une invention.
    jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue(['bluetooth', 'speaker']);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-option-speaker'));

    await waitFor(() => expect(audioRoute.selectAudioOutput).toHaveBeenCalled());
    expect(screen.queryByTestId('call-notice')).toBeNull();
  });

  it('ouvre le sélecteur de la plateforme sur iOS, sans rien lire', async () => {
    // `getAudioOutputs()` y est une constante à deux entrées qui ne sont pas
    // des catégories : il n'y a rien à peupler et rien à relire.
    jest.spyOn(audioRoute, 'audioRouteControl').mockReturnValue('system');

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(audioRoute.openSystemRoutePicker).toHaveBeenCalledTimes(1));
    expect(audioRoute.listAudioOutputs).not.toHaveBeenCalled();
    expect(screen.queryByTestId('audio-output-note')).toBeNull();
  });

  it("n'ouvre pas le sélecteur système en mode menu", async () => {
    // L'autre borne du mode : sans elle, un écran qui appellerait les deux
    // rappels passerait le test précédent.
    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(audioRoute.listAudioOutputs).toHaveBeenCalled());
    expect(audioRoute.openSystemRoutePicker).not.toHaveBeenCalled();
  });

  it('ouvre un menu sur sa seule explication quand la liste est vide', async () => {
    // Rien n'a échoué : pas de message. Vérifie aussi qu'aucune option ne
    // s'affiche : sans cette dernière assertion, un `outputs` câblé sur une
    // constante non vide (au lieu de l'état rempli par `listAudioOutputs`)
    // passerait ce test aussi bien qu'un câblage correct — mesuré par
    // mutation, seul ce test pouvait le distinguer.
    jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue([]);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-note')).toBeTruthy());
    expect(screen.queryByTestId('call-notice')).toBeNull();
    expect(screen.queryByTestId('audio-output-option-bluetooth')).toBeNull();
    expect(screen.queryByTestId('audio-output-option-speaker')).toBeNull();
  });

  // Miroir exact du test caméra « n'affiche rien quand l'énumération échoue »
  // (`CallScreen, choix de la caméra`) : sans lui, un `setNotice` ajouté par
  // erreur dans le `.catch()` de `handleOpenAudioOutput` passerait inaperçu.
  it("n'affiche rien quand l'énumération échoue, et ouvre un menu vide", async () => {
    jest.spyOn(audioRoute, 'listAudioOutputs').mockRejectedValue(new Error('énumération refusée'));

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(audioRoute.listAudioOutputs).toHaveBeenCalled());
    expect(screen.queryByTestId('call-notice')).toBeNull();
    expect(screen.getByTestId('audio-output-btn')).toBeTruthy();
    expect(screen.queryByTestId('audio-output-option-bluetooth')).toBeNull();
    expect(screen.queryByTestId('audio-output-option-speaker')).toBeNull();
  });

  it("vide la liste plutôt que de garder celle d'avant quand une réouverture échoue", async () => {
    // Même défaut, même correction que côté caméra : `handleOpenAudioOutput`
    // ne remettait pas `outputs` à zéro dans son `.catch()`.
    const list = jest
      .spyOn(audioRoute, 'listAudioOutputs')
      .mockResolvedValueOnce(['bluetooth', 'speaker']);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-bluetooth')).toBeTruthy());

    list.mockRejectedValueOnce(new Error('énumération refusée'));
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(audioRoute.listAudioOutputs).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('audio-output-option-bluetooth')).toBeNull();
    expect(screen.queryByTestId('audio-output-option-speaker')).toBeNull();
  });
});

const STARTED_METADATA = JSON.stringify({
  recording_mode: 'screen_recording',
  recording_status: 'started',
});

describe('CallScreen, indicateur d’enregistrement', () => {
  it('montre l’indicateur à qui rejoint une réunion déjà enregistrée', async () => {
    // Le SDK n'émet PAS `RoomMetadataChanged` à la jonction : un indicateur
    // bâti sur l'abonnement seul resterait éteint toute la séance.
    mockRoomMetadata = STARTED_METADATA;
    mockRoomIsRecording = true;

    await render(withPaper(<CallScreen />));

    await waitFor(() =>
      expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.active'),
    );
  });

  it('n’affiche rien quand aucun enregistrement ne tourne', async () => {
    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    expect(screen.queryByTestId('recording-indicator')).toBe(null);
  });

  it('montre l’indicateur à qui n’a pas le droit d’enregistrer', async () => {
    // Ce qu'on peut faire et ce qu'on doit savoir sont deux questions
    // différentes. Une seconde phase et un second mode, pour qu'un libellé en
    // dur ne passe pas.
    mockRoomMetadata = JSON.stringify({
      recording_mode: 'transcript',
      recording_status: 'saving',
    });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', false));

    await render(withPaper(<CallScreen />));

    await waitFor(() =>
      expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.saving'),
    );
  });
});

describe('CallScreen, commande d’enregistrement', () => {
  async function openMore(): Promise<void> {
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
  }

  it('n’offre pas la commande sans droit d’administration', async () => {
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', false));

    await render(withPaper(<CallScreen />));
    await openMore();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.queryByTestId('recording-toggle')).toBe(null);
  });

  it('n’offre pas la commande quand l’instance n’enregistre pas', async () => {
    // `recording.is_enabled` à faux : le serveur répondrait 404, et le geste
    // serait voué à échouer.
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue({
      ...ACCOUNT,
      instance: {
        ...ACCOUNT.instance,
        features: { recording: false, subtitle: true, telephony: false },
      },
    } as never);
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(withPaper(<CallScreen />));
    await openMore();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.queryByTestId('recording-toggle')).toBe(null);
  });

  it('démarre l’enregistrement du salon dont le serveur a rendu l’accès', async () => {
    // `r-9`, pas `r-1` : un identifiant en dur passerait le test avec le salon
    // par défaut.
    const start = jest
      .spyOn(recordingApi, 'startRecording')
      .mockResolvedValue({ ok: true, value: undefined });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
      ok: true,
      value: {
        room: { id: 'r-9', slug: 'reunion', name: 'r', accessLevel: 'trusted' },
        livekitUrl: 'wss://lk',
        token: 'lk',
        isAdministrable: true,
      },
    });

    await render(withPaper(<CallScreen />));
    await openMore();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    await waitFor(() => expect(start).toHaveBeenCalledWith(ACCOUNT, 'r-9'));
  });

  it('porte l’échec du démarrage jusqu’à la barre, sans le confondre avec un autre', async () => {
    // L'échec ordinaire de ces fonctions est une VALEUR, pas un rejet : un
    // `.catch()` seul ne le verrait jamais passer. C'est exactement le test qui
    // aurait attrapé les deux bogues du périmètre B. Le 409 distingue en outre
    // l'action : traduit avec `'stop'`, il donnerait « n'a pas pu être arrêté ».
    jest
      .spyOn(recordingApi, 'startRecording')
      .mockResolvedValue({ ok: false, error: { kind: 'server', status: 409 } });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(withPaper(<CallScreen />));
    await openMore();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('recording.errorBusy'),
    );
  });

  // Chemin distinct du précédent : ici la promesse rejette vraiment (au lieu
  // de résoudre `{ ok: false }`), et c'est le `.catch()` séparé qui doit agir.
  // Sans ce test, un `.catch()` vidé de son `setNotice` — exactement le second
  // bogue du périmètre B — laissait les six autres tests de ce describe verts.
  it('porte aussi un rejet inattendu du démarrage jusqu’à la barre', async () => {
    jest.spyOn(recordingApi, 'startRecording').mockRejectedValue(new Error('boom'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(withPaper(<CallScreen />));
    await openMore();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.network'),
    );
  });

  it('arrête l’enregistrement en cours et dit son échec propre', async () => {
    // Le 404 de l'arrêt veut dire « pas encore démarré », jamais « salon
    // introuvable ».
    // `r-7`, pas `r-1` : un identifiant en dur passerait le test avec le salon
    // par défaut.
    mockRoomMetadata = STARTED_METADATA;
    mockRoomIsRecording = true;
    const stop = jest
      .spyOn(recordingApi, 'stopRecording')
      .mockResolvedValue({ ok: false, error: { kind: 'not-found' } });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
      ok: true,
      value: {
        room: { id: 'r-7', slug: 'reunion', name: 'r', accessLevel: 'trusted' },
        livekitUrl: 'wss://lk',
        token: 'lk',
        isAdministrable: true,
      },
    });

    await render(withPaper(<CallScreen />));
    await openMore();
    await waitFor(() =>
      expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.stop'),
    );
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    await waitFor(() => expect(stop).toHaveBeenCalledWith(ACCOUNT, 'r-7'));
    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('recording.errorNotActive'),
    );
  });

  // Miroir du test de démarrage ci-dessus, pour le second gestionnaire : les
  // deux `.catch()` sont écrits séparément dans `call.tsx`, donc un trou dans
  // l'un des deux ne dit rien de l'autre.
  it('porte aussi un rejet inattendu de l’arrêt jusqu’à la barre', async () => {
    mockRoomMetadata = STARTED_METADATA;
    mockRoomIsRecording = true;
    jest.spyOn(recordingApi, 'stopRecording').mockRejectedValue(new Error('boom'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(withPaper(<CallScreen />));
    await openMore();
    await waitFor(() =>
      expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.stop'),
    );
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.network'),
    );
  });

  it('efface le message quand un essai suivant réussit', async () => {
    const start = jest
      .spyOn(recordingApi, 'startRecording')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(withPaper(<CallScreen />));
    await openMore();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));
    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('recording.errorForbidden'),
    );

    start.mockResolvedValue({ ok: true, value: undefined });
    await openMore();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    await waitFor(() => expect(screen.queryByTestId('call-notice')).toBeNull());
  });
});

describe('CallScreen, main levée', () => {
  // Un accès dont l'identifiant de salon ET le jeton diffèrent de ceux de
  // `GRANTED` : c'est la seule façon de distinguer une valeur transmise d'une
  // constante qui coïnciderait avec le fixture par défaut.
  const HAND_ACCESS: ApiResult<RoomAccess> = {
    ok: true,
    value: {
      room: { id: 'r-7', slug: 'reunion', name: 'Réunion', accessLevel: 'public' },
      livekitUrl: 'wss://livekit.linagora.com',
      token: 'jwt-de-salle',
      isAdministrable: false,
    },
  };

  async function openMenu(): Promise<void> {
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('hand-toggle')).toBeTruthy());
  }

  it('lève la main du salon et du jeton que le serveur a rendus', async () => {
    const toggle = jest.spyOn(hand, 'toggleHand').mockResolvedValue({ ok: true, value: undefined });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(HAND_ACCESS);

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() =>
      expect(toggle).toHaveBeenCalledWith('https://meet.linagora.com', 'r-7', 'jwt-de-salle', true),
    );
  });

  it('propose de BAISSER dans le menu quand sa propre main est levée', async () => {
    // `MoreMenu` reçoit `handRaised` de `call.tsx` et le transmet à
    // `HandControl`, qui choisit le libellé. Une régression qui fige cette
    // prop à `false` laisse `handleToggleHand` baisser la vraie main tout en
    // affichant « Lever la main » — un libellé qui annonce l'inverse de son
    // effet.
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:00Z' };
    await render(withPaper(<CallScreen />));
    await openMenu();
    expect(screen.getByTestId('hand-toggle')).toHaveTextContent('call.lowerHand');
  });

  it("retombe sur le slug quand le salon n'a pas d'identifiant", async () => {
    // `Room.id` est `string | null`, et `RoomViewSet.get_object()` accepte les
    // deux formes : le repli supprime le cas nul au lieu de fabriquer
    // `/api/v1.0/rooms//toggle-hand/`.
    const toggle = jest.spyOn(hand, 'toggleHand').mockResolvedValue({ ok: true, value: undefined });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
      ok: true,
      value: {
        room: { id: null, slug: 'salon-sans-uuid', name: 'R', accessLevel: 'public' },
        livekitUrl: 'wss://livekit.linagora.com',
        token: 'jwt-de-salle',
        isAdministrable: false,
      },
    });

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() => expect(toggle.mock.calls[0]?.[1]).toBe('salon-sans-uuid'));
  });

  it("n'affiche rien de plus au succès HTTP : c'est l'attribut qui décide", async () => {
    // Le `200` ne prouve pas que quiconque a vu quoi que ce soit. Le backend
    // écrit un attribut, et c'est le serveur LiveKit qui le diffuse — deux
    // sauts plus loin.
    jest.spyOn(hand, 'toggleHand').mockResolvedValue({ ok: true, value: undefined });

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() => expect(hand.toggleHand).toHaveBeenCalled());
    expect(screen.queryByTestId('hand-banner')).toBeNull();

    // … puis l'attribut arrive, et lui seul fait apparaître le bandeau.
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:00Z' };
    await emitRoom('participantAttributesChanged');

    expect(screen.getByTestId('hand-banner')).toBeTruthy();
  });

  it('baisse la main depuis le bandeau, en un seul appui', async () => {
    // Lever est un acte qu'on prépare, baisser un acte qu'on subit : deux
    // appuis pour lever, un pour baisser, sans ouvrir aucun menu.
    const toggle = jest.spyOn(hand, 'toggleHand').mockResolvedValue({ ok: true, value: undefined });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(HAND_ACCESS);
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:00Z' };

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('hand-banner')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('hand-lower'));

    await waitFor(() =>
      expect(toggle).toHaveBeenCalledWith(
        'https://meet.linagora.com',
        'r-7',
        'jwt-de-salle',
        false,
      ),
    );
  });

  it('ignore un second appui tant que la requête est en vol', async () => {
    // `HandControl` retire sa commande pendant l'appel ; le bandeau, lui,
    // garde la sienne — sans quoi baisser la main deviendrait impossible au
    // moment précis où on veut la baisser. La garde est donc portée par la
    // valeur `handBusy`, jamais par un `disabled`. Deux requêtes concurrentes
    // en sens opposé produiraient un résultat qui dépend de leur ordre
    // d'arrivée au serveur.
    let settle: (value: ApiResult<void>) => void = () => undefined;
    const toggle = jest.spyOn(hand, 'toggleHand').mockReturnValue(
      new Promise<ApiResult<void>>((resolve) => {
        settle = resolve;
      }),
    );
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:00Z' };

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('hand-lower')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('hand-lower'));
    await fireEvent.press(screen.getByTestId('hand-lower'));

    expect(toggle).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle({ ok: true, value: undefined });
    });
  });

  it('masque la commande du menu tant que la requête est en vol', async () => {
    // Complément du test ci-dessus, côté menu cette fois : `HandControl` ne
    // grise pas `hand-toggle` pendant l'appel, il ne le rend pas — même
    // convention que `RecordingControl`, puisque Paper teste `disabled` avant
    // toute couleur explicite sur cette surface sombre (voir `handControl.tsx`).
    let settle: (value: ApiResult<void>) => void = () => undefined;
    const toggle = jest.spyOn(hand, 'toggleHand').mockReturnValue(
      new Promise<ApiResult<void>>((resolve) => {
        settle = resolve;
      }),
    );

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    expect(toggle).toHaveBeenCalledTimes(1);
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.queryByTestId('hand-toggle')).toBeNull();

    await act(async () => {
      settle({ ok: true, value: undefined });
    });
  });

  it('montre sa position dans la file, celle du serveur et pas la première', async () => {
    // Deux mains levées avant la sienne : avec une seule, une position codée
    // en dur à 1 passerait.
    mockRoom.remoteParticipants.set(
      'u-ada',
      remoteParticipant('u-ada', 'Ada', { handRaisedAt: '2026-07-30T10:00:01Z' }),
    );
    mockRoom.remoteParticipants.set(
      'u-bob',
      remoteParticipant('u-bob', 'Bob', { handRaisedAt: '2026-07-30T10:00:02Z' }),
    );
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:03Z' };

    await render(withPaper(<CallScreen />));

    await waitFor(() => expect(screen.getByTestId('hand-banner-position')).toBeTruthy());
    // Troisième, pas première : un `position={1}` codé en dur dans la coquille
    // passerait sans les deux mains levées avant la sienne.
    expect(screen.getByTestId('hand-banner-position')).toHaveTextContent(
      'call.handPosition|{"position":3}',
    );
  });

  it('montre la file entière dans le menu, dans son ordre', async () => {
    mockRoom.remoteParticipants.set(
      'u-bob',
      remoteParticipant('u-bob', 'Bob', { handRaisedAt: '2026-07-30T10:00:02Z' }),
    );
    mockRoom.remoteParticipants.set(
      'u-ada',
      remoteParticipant('u-ada', 'Ada', { handRaisedAt: '2026-07-30T10:00:01Z' }),
    );

    await render(withPaper(<CallScreen />));
    await openMenu();

    expect(screen.getByTestId('hand-queue-row-u-ada')).toBeTruthy();
    expect(screen.getByTestId('hand-queue-row-u-bob')).toBeTruthy();
    // Ada a levé la main une seconde avant Bob : c'est l'horodatage du serveur
    // qui ordonne, pas l'ordre d'insertion dans la Map du SDK.
    const rows = screen.getAllByTestId(/^hand-queue-row-/);
    expect(nth(rows, 0).props.testID).toBe('hand-queue-row-u-ada');
  });

  it("dit l'échec sans bouger l'état affiché", async () => {
    // L'échec ordinaire de `toggleHand` est une *valeur* résolue, jamais un
    // rejet : un `.catch()` seul ne verrait pas passer un 403.
    jest.spyOn(hand, 'toggleHand').mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.handFailed'),
    );
    expect(screen.queryByTestId('hand-banner')).toBeNull();
  });

  it('ne confond pas un 401 de salle avec une session expirée', async () => {
    // `error.unauthorized` s'affiche « Session expired » : un 401 de
    // `toggle-hand` ne dit rien de la session OIDC, qui est valide.
    jest.spyOn(hand, 'toggleHand').mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.handFailed'),
    );
    expect(screen.getByTestId('call-notice')).not.toHaveTextContent('error.unauthorized');
  });

  it('porte aussi un rejet inattendu jusqu’à la barre', async () => {
    jest.spyOn(hand, 'toggleHand').mockRejectedValue(new Error('boom'));

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.handFailed'),
    );
  });

  it('efface le message quand un essai suivant réussit', async () => {
    const toggle = jest
      .spyOn(hand, 'toggleHand')
      .mockResolvedValue({ ok: false, error: { kind: 'network' } });

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));
    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.handFailed'),
    );

    toggle.mockResolvedValue({ ok: true, value: undefined });
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('hand-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() => expect(screen.getByTestId('call-notice')).toHaveTextContent(''));
  });
});
