import { VideoTrack } from '@livekit/react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { Track } from 'livekit-client';
import React from 'react';
import { Share } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { tokens } from 'src/ui/tokens';
import * as hand from 'src/api/hand';
import * as participants from 'src/api/participants';
import * as recordingApi from 'src/api/recording';
import * as rooms from 'src/api/rooms';
import type { ApiResult } from 'src/api/types';
import * as accounts from 'src/auth/accounts';
import * as audioRoute from 'src/call/audioRoute';
import { CHAT_TOPIC } from 'src/call/chat';
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

// Des encoches NON NULLES, injectées : le double de `jest.setup.ts` en rend
// zéro par défaut, et un rembourrage de zéro passerait aussi bien avec le
// crochet qu'avec une constante. Le fournisseur du double lit `initialMetrics`
// (`jest/mock.tsx:45-58`).
const IPHONE_INSETS = { bottom: 34, left: 0, right: 0, top: 59 };

function withInsets(node: React.ReactElement): React.ReactElement {
  return (
    <SafeAreaProvider
      initialMetrics={{ frame: { height: 874, width: 402, x: 0, y: 0 }, insets: IPHONE_INSETS }}
    >
      {withPaper(node)}
    </SafeAreaProvider>
  );
}

// La boîte de contenu de l'écran de couverture du Pixel 10 Pro Fold tenu en
// portrait, marge de page comprise : 1080 × 2364 px à densité 390.
const PORTRAIT_BOX = { width: 443, height: 900 };

// **La mesure n'existe pas sous Jest.** RNTL ne dispose aucune vue, donc le
// `onLayout` de `CallStage` ne part jamais tout seul — et sans boîte,
// `useCallLayout` rend `null` et l'écran ne pose AUCUNE tuile. Ce rendu-ci
// déclenche la mesure une fois, exactement comme la première trame le ferait
// sur appareil.
//
// Toléré absent : les écrans d'erreur et d'attente de connexion sortent avant
// de monter `CallStage`, et le panneau des participants la démonte. Un test
// qui traverse l'un de ces états remesure lui-même après coup.
async function measureStage(box = PORTRAIT_BOX): Promise<void> {
  const root = screen.queryByTestId('stage-root');
  if (root === null) return;
  await fireEvent(root, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: box.width, height: box.height } },
  });
}

// **La grille est la disposition par défaut** : tant que rien n'est épinglé et
// que personne ne partage, il n'y a plus de scène du tout. UN seul appui sur
// une cellule y ouvre le plein écran.
//
// C'en était deux — épingler, puis basculer sur la même tuile — et ce parcours
// avait un défaut que seule la géométrie révélait : épingler redispose l'écran
// sous le doigt, donc le second appui ne tombait plus sur la même chose. RNTL
// n'ayant aucune géométrie, l'ancienne aide ne pouvait pas le voir : elle
// visait la tuile par son identité, jamais par sa position.
async function enterFullscreen(key: string): Promise<void> {
  await fireEvent.press(screen.getByTestId(`tile-${key}`));
  await waitFor(() => expect(screen.queryByTestId('mic-toggle')).toBeNull());
}

// Le seul chemin qui mène au plein écran une tuile qui commence dans la BANDE,
// et il fait deux gestes sur deux surfaces distinctes : la vignette épingle —
// c'est le seul endroit d'où l'on épingle encore —, puis la scène bascule.
// À comparer avec `enterFullscreen` juste au-dessus, qui part d'une cellule de
// grille et n'en demande qu'un.
//
// La bande n'existe qu'en mode `focus`, donc l'appelant doit avoir posé un
// partage d'écran (voir `presentingParticipant`) ou un épinglage au préalable.
async function pinThenFullscreen(key: string): Promise<void> {
  await fireEvent.press(within(screen.getByTestId('filmstrip')).getByTestId(`tile-${key}`));
  await waitFor(() => expect(screen.getByTestId('pin-marker')).toBeTruthy());
  await fireEvent.press(screen.getByTestId(`tile-${key}`));
  await waitFor(() => expect(screen.queryByTestId('mic-toggle')).toBeNull());
}

async function renderCall(box = PORTRAIT_BOX): Promise<Awaited<ReturnType<typeof render>>> {
  const view = await render(withPaper(<CallScreen />));
  await measureStage(box);
  return view;
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

// Une personne qui PARTAGE SON ÉCRAN. Depuis que la cellule de grille ouvre le
// plein écran, l'épinglage ne vit plus que sur la bande — et la bande n'existe
// qu'en mode `focus`, c'est-à-dire sous un partage d'écran ou un épinglage déjà
// posé. Tout test qui veut épingler doit donc d'abord en poser un : c'est la
// conséquence directe de l'arbitrage, et non un détour de fixture.
//
// Aucune caméra : `getTrackPublication(Camera)` rend `undefined`, donc la tuile
// `${identity}:camera` existe bien mais porte un carton nommé. C'est sans
// conséquence ici — aucun de ces tests ne regarde l'image — et cela garde la
// coquille minimale.
function presentingParticipant(identity: string, name: string): unknown {
  return {
    identity,
    name,
    isLocal: false,
    isSpeaking: false,
    attributes: {},
    getTrackPublication: (source: unknown) => {
      if (source === Track.Source.Microphone) return { trackSid: `TR_${identity}` };
      if (source === Track.Source.ScreenShare) {
        return { trackSid: `SC_${identity}`, track: { id: 'screen' }, isMuted: false };
      }
      return undefined;
    },
  };
}

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
    // Un micro publié : c'est le cas ordinaire d'une personne en séance, et
    // c'est ce qui rend « Couper le micro » disponible — le serveur exige le
    // `track_sid`, donc l'action n'a pas de sens sans publication. Les tests
    // qui veulent l'ABSENCE de micro construisent leur propre coquille.
    getTrackPublication: (source: unknown) =>
      source === Track.Source.Microphone ? { trackSid: `TR_${identity}` } : undefined,
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
//
// Variadique depuis C2 : `reactionStore` reçoit `(payload, participant)` sur
// `dataReceived`, là où les autres magasins n'attendaient rien. Un handler à
// zéro argument reste assignable à `RoomHandler` — une fonction qui ignore
// des arguments supplémentaires l'est toujours — donc aucun appelant existant
// n'a besoin d'être touché.
type RoomHandler = (...args: unknown[]) => void;
const mockRoomHandlers = new Map<string, RoomHandler[]>();
const mockPublishData = jest.fn().mockResolvedValue(undefined);

// Le flux de chat, du côté du double. `registerTextStreamHandler` n'est pas
// une émission d'événement : c'est une carte d'un seul gestionnaire par topic,
// et le vrai JETTE sur un doublon. Le double jette aussi, sans quoi rien ne
// garderait l'ordre `unregister` → `register` que le magasin respecte.
type StreamHandler = (
  reader: { info: { id: string; timestamp: number }; readAll: () => Promise<string> },
  info: { identity: string },
) => void;

const mockTextStreamHandlers = new Map<string, StreamHandler>();
const mockSendText = jest.fn();
// Le nom LiveKit du participant local, celui que le magasin de chat recopie
// dans l'écho d'un message émis. Un accesseur, pas un champ figé, pour la
// même raison que `mockLocalAttributes` juste au-dessus.
let mockLocalName: string | undefined;

const mockRoom: {
  localParticipant: unknown;
  remoteParticipants: Map<string, unknown>;
  readonly metadata: string | undefined;
  readonly isRecording: boolean;
  getParticipantByIdentity: (identity: string) => unknown;
  on: (event: string, handler: RoomHandler) => unknown;
  off: (event: string, handler: RoomHandler) => unknown;
  registerTextStreamHandler: (topic: string, handler: StreamHandler) => void;
  unregisterTextStreamHandler: (topic: string) => void;
} = {
  localParticipant: {
    identity: 'me',
    isLocal: true,
    isSpeaking: false,
    get name(): string | undefined {
      return mockLocalName;
    },
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
    publishData: mockPublishData,
    sendText: mockSendText,
  },
  remoteParticipants: new Map<string, unknown>(),
  get metadata(): string | undefined {
    return mockRoomMetadata;
  },
  get isRecording(): boolean {
    return mockRoomIsRecording;
  },
  // Réutilise `remoteParticipants`, déjà rempli par les tests existants
  // (`remoteParticipant(...)`) : `reactionStore` n'a besoin d'aucune donnée
  // de plus pour résoudre un nom d'émetteur.
  on(event: string, handler: RoomHandler): unknown {
    mockRoomHandlers.set(event, [...(mockRoomHandlers.get(event) ?? []), handler]);
    return mockRoom;
  },
  off(event: string, handler: RoomHandler): unknown {
    const attached = mockRoomHandlers.get(event) ?? [];
    const index = attached.indexOf(handler);
    if (index !== -1) attached.splice(index, 1);
    if (attached.length === 0) mockRoomHandlers.delete(event);
    return mockRoom;
  },
  registerTextStreamHandler(topic: string, handler: StreamHandler): void {
    if (mockTextStreamHandlers.has(topic)) {
      throw new Error(`handler already registered for ${topic}`);
    }
    mockTextStreamHandlers.set(topic, handler);
  },
  unregisterTextStreamHandler(topic: string): void {
    mockTextStreamHandlers.delete(topic);
  },
  // Le magasin y résout le nom d'un émetteur ; `remoteParticipants` est déjà
  // la carte que les tests de modération peuplent.
  getParticipantByIdentity(identity: string): unknown {
    return mockRoom.remoteParticipants.get(identity);
  },
};

// Fait arriver un événement de Room comme le ferait le SDK, dans un `act` :
// les magasins invalident, React relit, l'écran se réaffiche. Les arguments
// supplémentaires sont transmis tels quels — les appels existants
// (`emitRoom('participantAttributesChanged')`, sans argument) continuent de
// fonctionner sans modification.
async function emitRoom(event: string, ...args: unknown[]): Promise<void> {
  await act(async () => {
    for (const handler of Array.from(mockRoomHandlers.get(event) ?? [])) handler(...args);
  });
}

// Fait arriver un message entrant comme le fait le SDK : un lecteur dont
// `info` porte l'identifiant de flux et l'horodatage, et dont `readAll()`
// résout sur le texte COMPLET. Le gestionnaire lance une promesse sans
// l'attendre, d'où le vidage à l'intérieur de l'`act`.
async function receiveChat(
  identity: string,
  id: string,
  body: string,
  sentAt = 1_000,
): Promise<void> {
  const handler = mockTextStreamHandlers.get(CHAT_TOPIC);
  if (handler === undefined) throw new Error('aucun gestionnaire lk.chat enregistré');
  await act(async () => {
    handler({ info: { id, timestamp: sentAt }, readAll: async () => body }, { identity });
    await new Promise((resolve) => setTimeout(resolve, 0));
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
  mockPublishData.mockReset().mockResolvedValue(undefined);
  mockListeners.clear();
  mockCallState = { status: 'connected' };
  mockCameraPublication = undefined;
  // Un test de modération peut peupler la Room de participants distants ;
  // sans ce nettoyage, ils survivraient au test suivant.
  mockRoom.remoteParticipants.clear();
  mockRoomHandlers.clear();
  mockTextStreamHandlers.clear();
  mockSendText.mockReset().mockResolvedValue({ id: 's-local', timestamp: 5_000 });
  mockLocalName = 'Ada';
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

// Les trois actions de modération vivent désormais dans une feuille inférieure,
// ouverte par la seule cible que porte la ligne. `Modal` ne monte rien à l'état
// fermé (`Modal.tsx:182`) : sans cette ouverture, aucune des trois n'existe
// dans l'arbre. C'est voulu — voir `participantsPanel.tsx`, où trois boutons
// posés sur la ligne écrasaient le nom à 39 px sur un écran réel.
async function openParticipantActions(index = 0): Promise<void> {
  await waitFor(() =>
    expect(screen.getAllByTestId('participant-actions').length).toBeGreaterThan(index),
  );
  await fireEvent.press(nth(screen.getAllByTestId('participant-actions'), index));
  // Le TITRE de la feuille, jamais l'une des actions : « Couper le micro »
  // n'existe que si la personne publie un micro, et attendre celle-là ferait
  // expirer tout test portant sur quelqu'un qui n'en publie pas.
  await waitFor(() => expect(screen.getByTestId('participant-sheet-title')).toBeTruthy());
}

describe('CallScreen', () => {
  it("lit l'état courant à l'initialisation, que `subscribe` ne pousse pas", async () => {
    // Le régresseur : le double n'appelle jamais le listener à l'abonnement.
    // Un écran qui partirait de `idle` en attendant une poussée initiale
    // afficherait le voyant de connexion pour toujours sur une séance déjà
    // ouverte. Seule une lecture de `getState()` au montage le sauve.
    mockCallState = { status: 'connected' };

    await renderCall();

    expect(screen.getByTestId('mic-toggle')).toBeTruthy();
    expect(screen.queryByTestId('call-connecting')).toBeNull();
    // L'écran s'est bien abonné — il n'a simplement rien reçu.
    expect(mockListeners.size).toBe(1);
  });

  it('expose la barre de contrôle une fois connecté', async () => {
    await renderCall();

    await waitFor(() => {
      expect(screen.getByTestId('mic-toggle')).toBeTruthy();
      expect(screen.getByTestId('camera-toggle')).toBeTruthy();
      expect(screen.getByTestId('leave-btn')).toBeTruthy();
      // La grille, et non plus une scène : tant que personne ne partage et que
      // rien n'est épinglé, c'est elle la disposition par défaut.
      expect(screen.getByTestId('grid')).toBeTruthy();
    });
  });

  it("n'expose plus la bascule binaire de caméra", async () => {
    // Sa fonction est un sous-ensemble strict du menu caméra, sa bascule
    // ignore trois caméras sur cinq sur un iPhone Pro, et sans ce retrait la
    // rangée porterait huit cibles — ce qui ne tient sur aucun téléphone
    // supporté.
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    expect(screen.queryByTestId('switch-camera')).toBeNull();
  });

  it('pose sa propre vignette sur la scène tant qu’on est seul', async () => {
    // Le seul bout de chaîne que cet écran peut montrer : la Room est lue, la
    // sélection tranche, la coquille pose une vignette. Ce que cette vignette
    // affiche vraiment, personne ici ne peut le vérifier.
    await renderCall();

    await waitFor(() => expect(screen.getByTestId('tile-me:camera')).toBeTruthy());
    expect(screen.getByTestId('tile-placeholder-me:camera')).toBeTruthy();
  });

  it("suit les transitions publiées après l'abonnement", async () => {
    mockCallState = { status: 'connecting' };

    await renderCall();
    expect(screen.getByTestId('call-connecting')).toBeTruthy();

    await publish({ status: 'connected' });

    expect(screen.getByTestId('mic-toggle')).toBeTruthy();
  });

  it('annonce la reconnexion sans masquer la séance', async () => {
    // Sans cet état visible, la personne regarde une image figée en croyant que
    // c'est cassé, alors que le transport est en train de se rétablir.
    await renderCall();

    await publish({ status: 'reconnecting' });

    expect(screen.getByTestId('call-reconnecting')).toBeTruthy();
    expect(screen.getByTestId('leave-btn')).toBeTruthy();
  });

  it("traduit le motif de coupure et n'affiche jamais le texte brut du SDK", async () => {
    await renderCall();

    await publish({ status: 'disconnected', reason: 'could not establish signal connection' });

    expect(screen.getByTestId('call-error')).toHaveTextContent('error.network');
    expect(screen.queryByText(/signal connection/)).toBeNull();
  });

  it("distingue une séance fermée par le serveur d'une panne de connexion", async () => {
    await renderCall();

    await publish({ status: 'disconnected', reason: 'closed' });

    expect(screen.getByTestId('call-error')).toHaveTextContent('call.ended');
  });

  it("applique les choix du pré-écran à l'entrée en séance", async () => {
    await renderCall();

    await waitFor(() => {
      expect(media.setMicrophoneEnabled).toHaveBeenCalledWith(mockRoom, true);
      expect(media.setCameraEnabled).toHaveBeenCalledWith(mockRoom, true);
    });
  });

  it("coupe réellement le micro, et ne fait pas que changer l'icône", async () => {
    // Un bouton qui bascule son apparence sans agir sur la session est le pire
    // défaut possible ici : la personne se croit coupée et ne l'est pas.
    await renderCall();
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
    await renderCall();
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
    const view = await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    await view.unmount();

    expect(mockUnsubscribed).toHaveBeenCalled();
    expect(mockDispose).toHaveBeenCalled();
    expect(mockListeners.size).toBe(0);
  });

  it('dit que la session a expiré sans tenter de rejoindre', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(null);

    await renderCall();

    expect(screen.getByTestId('call-error')).toHaveTextContent('error.unauthorized');
    expect(rooms.fetchRoomAccess).not.toHaveBeenCalled();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("relaie un refus de l'API sans le confondre avec une panne réseau", async () => {
    jest
      .spyOn(rooms, 'fetchRoomAccess')
      .mockResolvedValue({ ok: false, error: { kind: 'unauthorized' } });

    await renderCall();

    await waitFor(() => {
      expect(screen.getByTestId('call-error')).toHaveTextContent('error.unauthorized');
    });
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("laisse la même porte de sortie pendant qu'on se connecte", async () => {
    // Le MÊME argument que le test suivant, appliqué à l'écran d'à côté : il ne
    // rendait qu'un indicateur d'activité, sans un seul bouton. C'est le
    // premier écran que voit tout participant, et le recensement des sorties
    // l'a relevé comme le seul état de l'écran d'appel dont on ne peut pas
    // sortir. Borné par le réseau, sauf pendant les demandes de permission
    // Android, qui n'ont aucun délai — et l'en-tête est masqué par le Stack.
    mockCallState = { status: 'connecting' };

    await renderCall();
    expect(screen.getByTestId('call-connecting')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('connecting-leave-btn'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/home'));
  });

  it('laisse une porte de sortie quand la séance a échoué', async () => {
    // L'en-tête est masqué par le Stack : sans ce bouton, un écran d'erreur est
    // un cul-de-sac dont on ne sort qu'en tuant l'application.
    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await tick();

    expect(list).not.toHaveBeenCalled();
  });

  it("n'interroge pas la file sans droit de modérer", async () => {
    const list = jest.spyOn(participants, 'listWaitingParticipants');
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', false));

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await tick();
    await waitFor(() => expect(screen.getByTestId('waiting-admit')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('waiting-admit'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.forbidden');
    });
  });
});

describe('CallScreen, panneau des participants', () => {
  it('ouvre et referme le panneau des participants depuis la barre de contrôle', async () => {
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('grid')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('call-header-participants'));

    await waitFor(() => expect(screen.getByText('participants.title')).toBeTruthy());
    // Le panneau remplace la scène plutôt que de se poser par-dessus.
    expect(screen.queryByTestId('grid')).toBeNull();

    await fireEvent.press(screen.getByTestId('call-header-participants'));

    // La boîte mesurée vit dans `call.tsx`, pas dans `CallStage` : elle
    // SURVIT au démontage du panneau, donc la grille revient sans attendre une
    // seconde mesure. Sur appareil, `onLayout` repart quand même à la trame
    // suivante et repose la même valeur.
    await waitFor(() => expect(screen.getByTestId('grid')).toBeTruthy());
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

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    // La SECONDE ligne : `openParticipantActions(0)` donnerait Alice, et le
    // test ne distinguerait plus rien.
    await openParticipantActions(1);

    await fireEvent.press(screen.getByTestId('participant-mute'));

    // Le jeton LiveKit et le trackSid du micro visé, jamais le compte : la
    // route `mute-participant` refuse le porteur OIDC (mesuré, 403) et exige
    // `track_sid` (mesuré, sérialiseur du serveur).
    expect(muteSpy).toHaveBeenCalledWith(
      ACCOUNT.instance.serverUrl,
      'lk',
      'r-1',
      'bob-identity',
      'TR_bob-identity',
    );
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

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    // Une action referme la feuille : on la rouvre entre les deux, toujours
    // celle de la seconde ligne.
    await openParticipantActions(1);
    await fireEvent.press(screen.getByTestId('participant-remove'));
    await openParticipantActions(1);
    await fireEvent.press(screen.getByTestId('participant-promote'));

    expect(removeSpy).toHaveBeenCalledWith(ACCOUNT, 'r-1', 'bob-identity');
    expect(roleSpy).toHaveBeenCalledWith(ACCOUNT, 'r-1', 'bob-identity', 'administrator');
  });

  it("ne montre aucune action de modération sans droit d'administrer", async () => {
    // Le `GRANTED` par défaut du `beforeEach` global porte déjà
    // `isAdministrable: false` : rien à surcharger ici.
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));

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

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));

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

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    await openParticipantActions();

    await fireEvent.press(screen.getByTestId('participant-mute'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.forbidden');
    });
  });

  it("distingue un refus d'autorisation d'une panne réseau", async () => {
    // `toApiErrorMessage` a une case par variante d'`ApiError` : ce test et les
    // quatre qui le suivent en couvrent une chacun, plus `forbidden` juste
    // au-dessus et `network` par le `.catch()` plus bas. La fonction rendait
    // `error.network` pour tout sauf `unauthorized` ; sans un test PAR
    // variante, un retour en arrière vers ce repli unique ne rougirait que sur
    // la seule branche observée.
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest
      .spyOn(participants, 'muteParticipant')
      .mockResolvedValue({ ok: false, error: { kind: 'unauthorized' } });

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    await openParticipantActions();

    await fireEvent.press(screen.getByTestId('participant-mute'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.unauthorized');
    });
  });

  // Une case de `toApiErrorMessage` par test, chacune avec la variante
  // d'`ApiError` qui la sélectionne. `not-found` et `validation` sont des cas
  // mesurés, pas hypothétiques : `mute-participant` du serveur meet exige un
  // `track_sid` en plus de l'identité — un corps incomplet est donc un 400,
  // et il ne doit pas se lire « Connexion impossible » alors que la réponse
  // est bien arrivée.
  it.each([
    ['not-found', { kind: 'not-found' } as const, 'error.notFound'],
    [
      'validation',
      { kind: 'validation', fields: { track_sid: ['required'] } } as const,
      'error.badRequest',
    ],
    ['server', { kind: 'server', status: 502 } as const, 'error.serverError'],
  ])('rend une clé propre à %s, jamais le repli réseau', async (_name, error, expected) => {
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest.spyOn(participants, 'muteParticipant').mockResolvedValue({ ok: false, error });

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    await openParticipantActions();

    await fireEvent.press(screen.getByTestId('participant-mute'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent(expected);
    });
  });

  // Le repli lui-même veut son test. Mesuré : muter `default` vers une autre
  // clé ne rougissait RIEN sur les 709. Le test « exception inattendue » plus
  // bas assertait pourtant bien `error.network` — mais il l'atteint par le
  // `.catch()`, qui pose la clé EN DUR sans jamais traverser
  // `toApiErrorMessage`. Assertion sur le résultat, branche jamais exercée :
  // le trou exact que décrit `AGENTS.md`. Il faut une panne de transport
  // RÉSOLUE en `{ ok: false }`, pas une promesse rejetée.
  it('garde le repli réseau pour une panne de transport résolue', async () => {
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest
      .spyOn(participants, 'muteParticipant')
      .mockResolvedValue({ ok: false, error: { kind: 'network' } });

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    await openParticipantActions();

    await fireEvent.press(screen.getByTestId('participant-mute'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.network');
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

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    await openParticipantActions();

    await fireEvent.press(screen.getByTestId('participant-remove'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.forbidden');
    });
  });

  it("affiche aussi l'échec d'un changement de rôle", async () => {
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest
      .spyOn(participants, 'updateParticipantRole')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    await openParticipantActions();

    await fireEvent.press(screen.getByTestId('participant-promote'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.forbidden');
    });
  });

  it('rejette une exception inattendue comme une panne réseau', async () => {
    // Chemin distinct du précédent : ici la promesse rejette vraiment (au
    // lieu de résoudre `{ ok: false }`), et c'est le `.catch()` qui doit agir.
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest.spyOn(participants, 'muteParticipant').mockRejectedValue(new Error('boom'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    await openParticipantActions();

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

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    await openParticipantActions();

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

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    await openParticipantActions();

    await fireEvent.press(screen.getByTestId('participant-mute'));
    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.forbidden');
    });

    muteSpy.mockResolvedValueOnce({ ok: true, value: undefined });
    // Le premier appui a refermé la feuille : la rouvrir fait partie du geste.
    await openParticipantActions();
    await fireEvent.press(screen.getByTestId('participant-mute'));

    await waitFor(() => {
      expect(screen.queryByTestId('call-notice')).toBeNull();
    });
  });

  // L'AUTRE moitié de la règle ci-dessus, et celle qui manquait : « un succès
  // efface une erreur d'un essai précédent » ne vaut que pour un essai de LA
  // MÊME FAMILLE. Une seule Snackbar sert six fonctions — modération,
  // enregistrement, main levée, admission, changement de périphérique, chat —
  // et chacune posait `null` sans regarder ce qu'elle effaçait. Un message de
  // chat parti effaçait donc en silence un refus de modération que personne
  // n'avait encore lu : le geste qui l'efface n'a rien à voir avec lui.
  //
  // Le couple choisi est celui du symptôme relevé. Il tient au `kind` porté
  // avec la clé, et non à la clé : un couple différent l'exercerait pareil.
  it('garde une erreur de modération quand un envoi de chat, lui, réussit', async () => {
    mockRoom.remoteParticipants.set('alice-identity', remoteParticipant('alice-identity', 'Alice'));
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest
      .spyOn(participants, 'muteParticipant')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    await openParticipantActions();
    await fireEvent.press(screen.getByTestId('participant-mute'));
    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('error.forbidden');
    });

    // Le panneau se referme, puis le chat s'ouvre : les deux corps s'excluent,
    // mais la Snackbar vit hors d'eux et traverse le changement.
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('chat-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('chat-btn'));
    await waitFor(() => expect(screen.getByTestId('chat-input')).toBeTruthy());

    // Un envoi qui RÉUSSIT : `mockSendText` résout par défaut.
    await fireEvent.changeText(screen.getByTestId('chat-input'), 'bonjour');
    await fireEvent.press(screen.getByTestId('chat-send'));

    // Le message est parti — la zone est vidée, ce que seul un succès fait —
    // et le refus de modération est toujours là.
    await waitFor(() => expect(screen.getByTestId('chat-input')).toHaveProp('value', ''));
    expect(screen.getByTestId('call-notice')).toHaveTextContent('error.forbidden');
  });
});

describe('CallScreen, choix de la caméra', () => {
  it("relit la liste et la caméra en service à l'ouverture du chevron, jamais avant", async () => {
    // Aucun abonnement, aucun sondage : `MediaDevicesChanged` ne se déclenche
    // jamais sur mobile, et rien d'autre ne notifie. L'ouverture est le seul
    // instant où une lecture est utile.
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
    await waitFor(() => expect(VideoTrack).toHaveBeenCalled());
    // Un double aveugle à `Track.Source` (voir le commentaire sur
    // `mockRoom.localParticipant.getTrackPublication` plus haut) rendrait
    // `mockCameraPublication` aussi pour `Track.Source.ScreenShare`,
    // fabriquant un partage d'écran local fantôme. `tile-me:screen`
    // apparaîtrait dans la bande et déplacerait `mock.lastCall` de la scène
    // vers cette vignette fantôme, faisant passer les deux assertions de
    // miroir ci-dessous pour la mauvaise raison.
    expect(screen.queryByTestId('tile-me:screen')).toBeNull();
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

    await renderCall();
    await waitFor(() => expect(VideoTrack).toHaveBeenCalled());
    // Le pendant du test précédent, et pour exactement la même raison : ce
    // test-ci lit `mock.lastCall` deux fois, donc un partage local fantôme le
    // ferait passer pour la mauvaise raison tout autant que son voisin. Deux
    // tests adjacents portant la même vulnérabilité, une seule garde corrigée,
    // c'est l'autre qui redeviendrait le trou.
    expect(screen.queryByTestId('tile-me:screen')).toBeNull();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    expect(audioRoute.listAudioOutputs).not.toHaveBeenCalled();

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(audioRoute.listAudioOutputs).toHaveBeenCalledTimes(1));
  });

  it('demande la catégorie pressée, jamais la première de la liste', async () => {
    // Deux catégories, jamais une seule, et la seconde visée.
    jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue(['bluetooth', 'speaker']);

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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
    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

describe('CallScreen, sortie audio par appareil', () => {
  const TESLA = {
    id: 7,
    kind: 'bluetooth' as const,
    name: 'Tesla Model 3',
    nameKey: 'call.output.bluetooth' as const,
    ordinal: null,
  };
  const SPEAKER = {
    id: 2,
    kind: 'speaker' as const,
    name: null,
    nameKey: 'call.output.speaker' as const,
    ordinal: null,
  };

  beforeEach(() => {
    jest.spyOn(audioRoute, 'audioRouteControl').mockReturnValue('devices');
    jest.spyOn(audioRoute, 'listAudioDevices').mockResolvedValue([TESLA, SPEAKER]);
    jest.spyOn(audioRoute, 'readCurrentAudioDeviceId').mockResolvedValue(null);
    jest.spyOn(audioRoute, 'selectAudioDevice').mockResolvedValue(true);
    jest.spyOn(audioRoute, 'clearAudioDevice').mockResolvedValue();
  });

  it("lit la liste ET l'état constaté à l'ouverture, jamais avant", async () => {
    // Deux lectures, un seul instant — même discipline que le menu caméra. La
    // seconde est ce que le périmètre A ne pouvait pas avoir.
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    expect(audioRoute.listAudioDevices).not.toHaveBeenCalled();
    expect(audioRoute.readCurrentAudioDeviceId).not.toHaveBeenCalled();

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(audioRoute.listAudioDevices).toHaveBeenCalledTimes(1));
    expect(audioRoute.readCurrentAudioDeviceId).toHaveBeenCalledTimes(1);
    // L'autre chemin n'est PAS emprunté : sans cette borne, un écran qui
    // appellerait les deux passerait aussi le test du mode catégories.
    expect(audioRoute.listAudioOutputs).not.toHaveBeenCalled();
  });

  it("demande l'appareil pressé, jamais le premier de la liste", async () => {
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-device-2'));

    await waitFor(() => expect(audioRoute.selectAudioDevice).toHaveBeenCalledWith(2));
    expect(audioRoute.selectAudioDevice).not.toHaveBeenCalledWith(7);
  });

  it('coche ce que le système a réellement pris, et prévient du désarmement', async () => {
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('audio-output-note')).toHaveTextContent('call.outputFollowsDevice'),
    );
    await fireEvent.press(screen.getByTestId('audio-output-device-7'));

    // Le système confirme la route à la réouverture. La coche affichée est
    // TOUJOURS celle de la relecture, jamais celle de notre demande : c'est ce
    // qui distingue ce chemin du mode catégories, et c'est pour cela que la
    // fixture doit bouger ici. Mesuré : sans ce `mockResolvedValue(7)`, le test
    // échoue — parce que le code fait bien ce qu'il annonce.
    jest.spyOn(audioRoute, 'readCurrentAudioDeviceId').mockResolvedValue(7);
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-check-7')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-2')).toBeNull();
    expect(screen.getByTestId('audio-output-note')).toHaveTextContent('call.outputManualUntilEnd');
  });

  it('signale un refus du système, et ne coche rien', async () => {
    // `setCommunicationDevice()` rend `false` quand la route n'a pas pris.
    // L'autre polarité du même booléen : sans elle, un écran qui cocherait
    // toujours passerait le test précédent.
    jest.spyOn(audioRoute, 'selectAudioDevice').mockResolvedValue(false);

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-7')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-device-7'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.deviceSwitchFailed'),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-7')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-7')).toBeNull();
  });

  it("rend la route au système, et relit l'état constaté APRÈS", async () => {
    // Les trois instructions du gestionnaire : `clearCommunicationDevice()`,
    // la relecture, et la note qui redevient « suit l'appareil ». Le système
    // rebascule sur SON choix, et c'est celui-là que l'écran doit montrer.
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-7')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('audio-output-device-7'));

    jest.spyOn(audioRoute, 'readCurrentAudioDeviceId').mockResolvedValue(2);
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-automatic')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-automatic'));

    await waitFor(() => expect(audioRoute.clearAudioDevice).toHaveBeenCalledTimes(1));
    // La relecture est la DEUXIÈME instruction du gestionnaire, et elle n'est
    // observable QUE par son appel : cet appui referme la feuille, donc plus
    // aucune coche n'est montée pour la montrer. La réouverture ci-dessous ne
    // peut rien en dire — elle relit de toute façon, et écrase.
    //
    // Trouvé par mutation : retirer `.then(() => readCurrentAudioDeviceId())`
    // du gestionnaire ne rougissait RIEN sans cette ligne. Trois lectures ici :
    // la première ouverture, la seconde, puis celle-ci.
    await waitFor(() => expect(audioRoute.readCurrentAudioDeviceId).toHaveBeenCalledTimes(3));
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-check-2')).toBeTruthy());
    expect(screen.getByTestId('audio-output-note')).toHaveTextContent('call.outputFollowsDevice');
    expect(screen.queryByTestId('audio-output-automatic')).toBeNull();
  });

  it("n'affiche rien quand l'énumération échoue, et ouvre une feuille vide", async () => {
    jest.spyOn(audioRoute, 'listAudioDevices').mockRejectedValue(new Error('énumération refusée'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-note')).toBeTruthy());
    expect(screen.queryByTestId('call-notice')).toBeNull();
    expect(screen.queryByTestId('audio-output-device-7')).toBeNull();
  });
});

describe('CallScreen, indicateur d’enregistrement', () => {
  it('montre l’indicateur à qui rejoint une réunion déjà enregistrée', async () => {
    // Le SDK n'émet PAS `RoomMetadataChanged` à la jonction : un indicateur
    // bâti sur l'abonnement seul resterait éteint toute la séance.
    mockRoomMetadata = STARTED_METADATA;
    mockRoomIsRecording = true;

    await renderCall();

    await waitFor(() =>
      expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.active'),
    );
  });

  it('n’affiche rien quand aucun enregistrement ne tourne', async () => {
    await renderCall();
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

    await renderCall();

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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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
    await renderCall();
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

    await renderCall();
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() => expect(toggle.mock.calls[0]?.[1]).toBe('salon-sans-uuid'));
  });

  it("n'affiche rien de plus au succès HTTP : c'est l'attribut qui décide", async () => {
    // Le `200` ne prouve pas que quiconque a vu quoi que ce soit. Le backend
    // écrit un attribut, et c'est le serveur LiveKit qui le diffuse — deux
    // sauts plus loin.
    jest.spyOn(hand, 'toggleHand').mockResolvedValue({ ok: true, value: undefined });

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();

    await waitFor(() => expect(screen.getByTestId('hand-banner-position')).toBeTruthy());
    // Troisième, pas première : un `position={1}` codé en dur dans la coquille
    // passerait sans les deux mains levées avant la sienne.
    expect(screen.getByTestId('hand-banner-position')).toHaveTextContent(
      'call.handPosition|{"position":3}',
    );
  });

  it('signale sur l’écran principal la main d’un autre, jamais la sienne', async () => {
    // Le filtre observé dans ses deux états, sur le même rendu : d'abord la
    // seule main locale — `HandBanner` la porte, le nouveau bandeau non —,
    // puis une main distante qui le fait apparaître.
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:00Z' };

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('hand-banner')).toBeTruthy());
    expect(screen.queryByTestId('raised-hands-banner')).toBeNull();

    mockRoom.remoteParticipants.set(
      'u-ada',
      remoteParticipant('u-ada', 'Ada', { handRaisedAt: '2026-07-30T10:00:01Z' }),
    );
    await emitRoom('participantAttributesChanged');

    expect(screen.getByTestId('raised-hands-banner-name')).toHaveTextContent(
      'call.handRaisedBy|{"name":"Ada"}',
    );
    expect(screen.queryByTestId('raised-hands-banner-others')).toBeNull();
  });

  it('nomme la première main de la file, et compte les autres', async () => {
    // Bob inséré AVANT Ada dans la Map du SDK, mais levé une seconde APRÈS :
    // c'est l'horodatage du serveur qui ordonne, jamais l'ordre d'insertion.
    // Et la main locale, la plus ancienne des trois, ne compte pas — sans quoi
    // le compte dirait 2.
    mockRoom.remoteParticipants.set(
      'u-bob',
      remoteParticipant('u-bob', 'Bob', { handRaisedAt: '2026-07-30T10:00:02Z' }),
    );
    mockRoom.remoteParticipants.set(
      'u-ada',
      remoteParticipant('u-ada', 'Ada', { handRaisedAt: '2026-07-30T10:00:01Z' }),
    );
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:00Z' };

    await renderCall();

    await waitFor(() => expect(screen.getByTestId('raised-hands-banner')).toBeTruthy());
    expect(screen.getByTestId('raised-hands-banner-name')).toHaveTextContent(
      'call.handRaisedBy|{"name":"Ada"}',
    );
    expect(screen.getByTestId('raised-hands-banner-others')).toHaveTextContent(
      'call.handRaisedOthers|{"count":1}',
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

    await renderCall();
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

    await renderCall();
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

    await renderCall();
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.handFailed'),
    );
    expect(screen.getByTestId('call-notice')).not.toHaveTextContent('error.unauthorized');
  });

  it('porte aussi un rejet inattendu jusqu’à la barre', async () => {
    jest.spyOn(hand, 'toggleHand').mockRejectedValue(new Error('boom'));

    await renderCall();
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

    await renderCall();
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

// Chaque surface porte désormais un seul geste : la bande épingle, la scène
// bascule le plein écran, et seul le badge désépingle — voir
// `docs/superpowers/plans/2026-08-01-pin-and-fullscreen.md` pour la
// conception d'origine et le lot qui la simplifie pour le rapport de ce
// changement.
describe('CallScreen, épinglage', () => {
  // La grille n'épingle PLUS : elle ouvre le plein écran. Ce test-ci reste dans
  // ce describe parce que c'est la MOITIÉ NÉGATIVE de l'épinglage — il prouve
  // qu'aucun épinglage ne part de cette surface — et il a pour complément
  // exact, plus bas, « une vignette de bande épingle et n'ouvre jamais le plein
  // écran ». Un des deux sites doit rougir si les deux rappels sont échangés.
  it('ouvre le plein écran sur la cellule qu’on touche dans la grille, sans épingler', async () => {
    // Ada est seule, distante et ne partage rien : les deux tuiles commencent
    // donc CÔTE À CÔTE dans la grille, sans qu'aucune ne soit sur une scène.
    // Toucher sa PROPRE cellule prouve que c'est bien la clé pressée qui part :
    // celle d'Ada serait aussi celle qu'une règle par défaut aurait choisie.
    mockRoom.remoteParticipants.set('u-ada', remoteParticipant('u-ada', 'Ada'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('tile-u-ada:camera')).toBeTruthy());
    expect(within(screen.getByTestId('grid')).getByTestId('tile-me:camera')).toBeTruthy();
    expect(screen.queryByTestId('active-speaker')).toBeNull();

    await fireEvent.press(screen.getByTestId('tile-me:camera'));

    // Sa propre vignette, SEULE : c'est le plein écran, et non une scène — la
    // barre est partie avec la grille.
    await waitFor(() => {
      expect(
        within(screen.getByTestId('active-speaker')).getByTestId('tile-me:camera'),
      ).toBeTruthy();
    });
    expect(screen.queryByTestId('grid')).toBeNull();
    expect(screen.queryByTestId('mic-toggle')).toBeNull();

    // Et rien n'a été épinglé au passage : la sortie rend la GRILLE, jamais une
    // scène épinglée. Sans cette seconde moitié, une cellule qui appellerait
    // les DEUX rappels passerait tout ce qui précède.
    await fireEvent.press(screen.getByTestId('tile-me:camera'));

    await waitFor(() => expect(screen.getByTestId('grid')).toBeTruthy());
    expect(screen.queryByTestId('pin-marker')).toBeNull();
  });

  // Règle centrale de ce lot : un second appui sur la tuile désormais en
  // scène ne désépingle PAS — ce serait ambigu avec le geste qui bascule le
  // plein écran sur cette même surface (voir le describe « plein écran »
  // plus bas). Sans CE test, une implémentation qui garderait l'ancien
  // ternaire (« épingler ou désépingler selon l'état courant ») sur la scène
  // passerait quand même le test précédent.
  it('un second appui sur la tuile désormais en scène ne la désépingle pas : il bascule le plein écran', async () => {
    // Ada partage son écran : c'est ce qui produit une bande, et la bande est
    // désormais le seul endroit d'où l'on épingle.
    mockRoom.remoteParticipants.set('u-ada', presentingParticipant('u-ada', 'Ada'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('filmstrip')).toBeTruthy());
    await fireEvent.press(within(screen.getByTestId('filmstrip')).getByTestId('tile-me:camera'));
    await waitFor(() => expect(screen.getByTestId('pin-marker')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('tile-me:camera'));

    // Le plein écran a pris : la bande a disparu.
    await waitFor(() => expect(screen.queryByTestId('filmstrip')).toBeNull());
    // Toujours la vignette locale, seule à l'écran — ni désépinglée (Ada
    // serait revenue), ni restée en disposition ordinaire (la bande serait
    // encore là).
    expect(within(screen.getByTestId('active-speaker')).getByTestId('tile-me:camera')).toBeTruthy();
  });

  // Le badge devient le seul geste qui désépingle.
  it('désépingle sur un appui du badge, jamais sur un appui de la tuile', async () => {
    // Ada partage son écran : c'est ce qui produit une bande, et la bande est
    // désormais le seul endroit d'où l'on épingle.
    mockRoom.remoteParticipants.set('u-ada', presentingParticipant('u-ada', 'Ada'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('filmstrip')).toBeTruthy());
    await fireEvent.press(within(screen.getByTestId('filmstrip')).getByTestId('tile-me:camera'));
    await waitFor(() => expect(screen.getByTestId('pin-marker')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('pin-marker'));

    // Désépingler rend la scène à ce qui l'occupait AVANT l'épinglage — le
    // partage d'Ada, qui n'a pas cessé pendant ce temps. C'est exactement ce à
    // quoi l'épinglage sert désormais, et le seul état d'où il peut partir :
    // ramener un visage que le partage avait chassé dans la bande, puis le
    // rendre.
    await waitFor(() => {
      expect(
        within(screen.getByTestId('active-speaker')).getByTestId('tile-u-ada:screen'),
      ).toBeTruthy();
    });
    expect(within(screen.getByTestId('filmstrip')).getByTestId('tile-me:camera')).toBeTruthy();
    expect(within(screen.getByTestId('filmstrip')).getByTestId('tile-u-ada:camera')).toBeTruthy();
    // Et le badge repart avec le désépinglage : un badge qui survivrait
    // mentirait sur l'état réel.
    expect(screen.queryByTestId('pin-marker')).toBeNull();
  });
});

describe('CallScreen, plein écran', () => {
  it("n'affiche que la tuile et masque les commandes en plein écran", async () => {
    // Ada distante : sa tuile commence dans la GRILLE, d'où le plein écran
    // n'est pas atteignable directement — voir `enterFullscreen`, qui épingle
    // d'abord.
    mockRoom.remoteParticipants.set('u-ada', remoteParticipant('u-ada', 'Ada'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('tile-u-ada:camera')).toBeTruthy());

    await enterFullscreen('u-ada:camera');

    expect(
      within(screen.getByTestId('active-speaker')).getByTestId('tile-u-ada:camera'),
    ).toBeTruthy();
    // La grille, la bande et la barre disparaissent TOUTES : la barre est
    // masquée par `call.tsx`, le reste par `CallStage` lui-même — deux sites
    // distincts, voir `stage.spec.tsx` pour la couverture propre au second.
    expect(screen.queryByTestId('grid')).toBeNull();
    expect(screen.queryByTestId('filmstrip')).toBeNull();
    expect(screen.queryByTestId('mic-toggle')).toBeNull();
    expect(screen.queryByTestId('leave-btn')).toBeNull();
  });

  it('rend la grille et les commandes hors plein écran', async () => {
    // Le complément direct du test précédent, même mise en place, sans
    // l'appui : sans CE test, une implémentation qui masquerait la barre et
    // la grille inconditionnellement passerait quand même le test ci-dessus.
    mockRoom.remoteParticipants.set('u-ada', remoteParticipant('u-ada', 'Ada'));

    await renderCall();

    await waitFor(() => {
      expect(screen.getByTestId('tile-u-ada:camera')).toBeTruthy();
      expect(screen.getByTestId('grid')).toBeTruthy();
      expect(screen.getByTestId('mic-toggle')).toBeTruthy();
      expect(screen.getByTestId('leave-btn')).toBeTruthy();
    });
  });

  // K7 : la clé plein écran ne se résout plus une fois la personne partie.
  // Sans le `?? null` qui referme la résolution, `fullscreenTile` resterait à
  // `undefined` — pas `null` — et l'écran continuerait de croire qu'il doit
  // afficher une tuile qu'il n'a plus.
  it('retombe sur la disposition normale si la tuile plein écran disparaît', async () => {
    mockRoom.remoteParticipants.set('u-ada', remoteParticipant('u-ada', 'Ada'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('tile-u-ada:camera')).toBeTruthy());
    await enterFullscreen('u-ada:camera');

    // Ada quitte la séance : sa tuile n'existe plus dans aucune disposition
    // possible, épinglée ou non.
    mockRoom.remoteParticipants.delete('u-ada');
    await emitRoom('participantDisconnected');

    await waitFor(() => {
      expect(screen.getByTestId('grid')).toBeTruthy();
      expect(screen.getByTestId('mic-toggle')).toBeTruthy();
    });
    // Seule reste la personne locale, seule cellule de la grille : l'épinglage
    // d'Ada ne résout plus lui non plus, donc rien ne retient le mode `focus`.
    expect(within(screen.getByTestId('grid')).getByTestId('tile-me:camera')).toBeTruthy();
  });

  // I4, reproduit par la revue : ni `fullscreen` ni `pin` n'étaient effacés par
  // ce retour à la normale — seule leur RÉSOLUTION retombait à `null`
  // (`src/call/layout.ts:283-287` : « si elle revient, l'épinglage reprend tout
  // seul »). Une clé périmée qui résout de nouveau rejette l'écran dans un état
  // que personne n'a demandé.
  //
  // **Ce test affirmait la résurrection de l'ÉPINGLAGE comme voulue.** Elle ne
  // l'est plus. L'argument d'alors — « bénin, la tuile qui revient se déplace
  // sous les yeux de la personne » — supposait un badge visible pendant
  // l'absence. Il n'y en a pas : une clé qui ne résout plus ne marque RIEN à
  // l'écran, et rien ne peut plus l'effacer, puisque le badge est le seul geste
  // qui désépingle et qu'il n'est pas rendu. L'épinglage se guérit donc comme
  // le plein écran, et pour la même raison.
  it('ne ressuscite ni le plein écran ni l’épinglage quand la cible revient sans un geste', async () => {
    // Ada présente : c'est ce qui produit la bande, seul endroit d'où l'on
    // épingle encore. Bob y est épinglé, puis basculé en plein écran depuis la
    // scène — la seule façon de poser les DEUX clés sur la MÊME tuile, ce que
    // ce test a précisément besoin de comparer.
    mockRoom.remoteParticipants.set('u-ada', presentingParticipant('u-ada', 'Ada'));
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('tile-u-bob:camera')).toBeTruthy());
    await pinThenFullscreen('u-bob:camera');

    // Bob part : la disposition normale revient, par la résolution ordinaire.
    mockRoom.remoteParticipants.delete('u-bob');
    await emitRoom('participantDisconnected');
    await waitFor(() => expect(screen.getByTestId('mic-toggle')).toBeTruthy());

    // Bob revient, avec la MÊME identité, donc la MÊME clé de tuile — sans
    // que personne n'ait pressé quoi que ce soit sur cet écran entre-temps.
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));
    await emitRoom('participantConnected');
    await waitFor(() => expect(screen.getByTestId('tile-u-bob:camera')).toBeTruthy());

    // L'ÉPINGLAGE ne reprend pas : ni badge, ni scène volée. La scène revient à
    // ce qui la tenait avant l'épinglage — le partage d'Ada — et Bob rentre
    // dans la bande comme n'importe qui.
    expect(screen.queryByTestId('pin-marker')).toBeNull();
    expect(
      within(screen.getByTestId('active-speaker')).getByTestId('tile-u-ada:screen'),
    ).toBeTruthy();
    expect(within(screen.getByTestId('filmstrip')).getByTestId('tile-u-bob:camera')).toBeTruthy();
    // Le PLEIN ÉCRAN non plus : il retirerait toutes les commandes sans que
    // personne n'ait rien demandé. La barre est donc là.
    expect(screen.getByTestId('mic-toggle')).toBeTruthy();
    expect(screen.getByTestId('leave-btn')).toBeTruthy();
  });

  // Le même trou que ci-dessus, sous un angle différent : après la guérison
  // automatique d'I4, un appui ORDINAIRE sur une vignette de la bande doit
  // redevenir un épinglage normal, jamais un résidu de l'ancien plein écran.
  // Carl est épinglé puis basculé en plein écran, avant de partir ; Bob,
  // resté dans la bande, sert de cible pour l'appui qui suit.
  it('un appui ordinaire redevient un épinglage une fois la cible du plein écran disparue', async () => {
    mockRoom.remoteParticipants.set('u-ada', presentingParticipant('u-ada', 'Ada'));
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));
    mockRoom.remoteParticipants.set('u-carl', remoteParticipant('u-carl', 'Carl'));

    await renderCall();
    await waitFor(() =>
      expect(
        within(screen.getByTestId('filmstrip')).getByTestId('tile-u-carl:camera'),
      ).toBeTruthy(),
    );

    // Carl, épinglé depuis la bande puis basculé en plein écran depuis la
    // scène, puis parti : `fullscreen` reste posé à `u-carl:camera` quand
    // `fullscreenTile`, résolu, retombe à `null`.
    await pinThenFullscreen('u-carl:camera');

    mockRoom.remoteParticipants.delete('u-carl');
    await emitRoom('participantDisconnected');
    await waitFor(() => expect(screen.getByTestId('filmstrip')).toBeTruthy());

    // Un appui ordinaire sur Bob, resté dans la bande : doit épingler.
    await fireEvent.press(within(screen.getByTestId('filmstrip')).getByTestId('tile-u-bob:camera'));

    await waitFor(() => {
      expect(
        within(screen.getByTestId('active-speaker')).getByTestId('tile-u-bob:camera'),
      ).toBeTruthy();
    });
    expect(screen.getByTestId('pin-marker')).toBeTruthy();
  });

  // Le complément EXACT de « ouvre le plein écran sur la cellule qu'on touche
  // dans la grille, sans épingler » : les deux surfaces posent chacune un
  // rappel, et une seule assertion par surface ne dit pas laquelle. Ici, la
  // bande — elle épingle, et n'ouvre JAMAIS le plein écran.
  //
  // Ce test remplace « résout la tuile plein écran même quand la cible a dû
  // d'abord être épinglée depuis la bande », dont le parcours (épingler depuis
  // la bande, puis basculer depuis la scène) est devenu, mot pour mot, celui du
  // test « un second appui sur la tuile désormais en scène… » du describe
  // précédent — et qui n'observait donc plus rien que celui-ci n'observe déjà.
  it('épingle depuis une vignette de bande, et n’y ouvre jamais le plein écran', async () => {
    mockRoom.remoteParticipants.set('u-ada', presentingParticipant('u-ada', 'Ada'));
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));

    await renderCall();
    await waitFor(() => {
      expect(within(screen.getByTestId('filmstrip')).getByTestId('tile-u-ada:camera')).toBeTruthy();
      expect(within(screen.getByTestId('filmstrip')).getByTestId('tile-u-bob:camera')).toBeTruthy();
    });

    await fireEvent.press(within(screen.getByTestId('filmstrip')).getByTestId('tile-u-bob:camera'));

    // Bob monte sur la scène, badge compris : c'est un épinglage.
    await waitFor(() => {
      expect(
        within(screen.getByTestId('active-speaker')).getByTestId('tile-u-bob:camera'),
      ).toBeTruthy();
    });
    expect(within(screen.getByTestId('active-speaker')).getByTestId('pin-marker')).toBeTruthy();
    // Et surtout PAS un plein écran : la bande et la barre entière sont restées.
    // Le badge ci-dessus attrape déjà l'ÉCHANGE des deux rappels ; ces deux
    // lignes-ci attrapent le cas qu'il laisse passer — une vignette qui
    // appellerait les DEUX, donc épinglerait ET basculerait.
    expect(screen.getByTestId('filmstrip')).toBeTruthy();
    expect(screen.getByTestId('mic-toggle')).toBeTruthy();
  });
});

// Ce que la suppression du rappel des commandes doit garantir, prouvé plutôt
// qu'affirmé : un appui n'importe où sur l'unique tuile plein écran suffit à
// en sortir. Toute la machinerie de rappel (`chromeVisible`,
// `chromeRevealNonce`, `CHROME_REVEAL_MS`, le bouton `fullscreen-exit-btn` et
// sa clé `call.exitFullscreen`) a disparu : elle ne servait qu'à ouvrir un
// état intermédiaire devenu inutile dès lors que la sortie est immédiate.
describe('CallScreen, plein écran, sortie', () => {
  it('sort du plein écran par un simple appui, et retrouve alors la totalité de la barre', async () => {
    // Ada présente : la scène est son écran, et un appui dessus ouvre le plein
    // écran sans qu'aucun épinglage n'ait à être posé d'abord. C'est le chemin
    // le plus court vers l'état que ce test veut QUITTER, et il laisse une
    // bande derrière lui — ce dont la dernière assertion a besoin.
    mockRoom.remoteParticipants.set('u-ada', presentingParticipant('u-ada', 'Ada'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('tile-u-ada:screen')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('tile-u-ada:screen'));
    // Rien n'est atteignable en plein écran : ni la barre, ni le bouton pour
    // quitter la séance — c'est précisément ce qu'une revue de branche avait
    // trouvé risqué (voir le describe « enfermement » plus bas).
    await waitFor(() => expect(screen.queryByTestId('mic-toggle')).toBeNull());
    expect(screen.queryByTestId('leave-btn')).toBeNull();

    await fireEvent.press(screen.getByTestId('tile-u-ada:screen'));

    // La sortie est TOTALE, en un seul appui : bande ET barre entière
    // reviennent ensemble, sept boutons compris — aucun état intermédiaire où
    // seule une partie de l'écran mènerait à la sortie. La bande, et non la
    // grille : le partage d'Ada tient toujours la scène, et la sortie du plein
    // écran ne défait rien d'autre qu'elle-même.
    await waitFor(() => {
      expect(screen.getByTestId('filmstrip')).toBeTruthy();
      expect(screen.getByTestId('mic-toggle')).toBeTruthy();
      expect(screen.getByTestId('camera-toggle')).toBeTruthy();
      expect(screen.getByTestId('call-header-participants')).toBeTruthy();
      expect(screen.getByTestId('leave-btn')).toBeTruthy();
    });
  });

  // Bob est épinglé PUIS basculé en plein écran (la seule façon d'y envoyer
  // une tuile venue de la bande, voir le describe précédent) : la sortie ne
  // doit pas défaire l'épinglage en secret, ce qui ferait redescendre Bob à
  // la place d'Ada.
  it("un appui qui sort du plein écran ne touche pas à l'épinglage", async () => {
    mockRoom.remoteParticipants.set('u-ada', presentingParticipant('u-ada', 'Ada'));
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));

    await renderCall();
    await waitFor(() =>
      expect(within(screen.getByTestId('filmstrip')).getByTestId('tile-u-bob:camera')).toBeTruthy(),
    );

    await pinThenFullscreen('u-bob:camera');

    // La sortie, sur la même tuile.
    await fireEvent.press(screen.getByTestId('tile-u-bob:camera'));

    // Bob, toujours épinglé et sur la scène : la sortie du plein écran n'a
    // pas désépinglé en secret. Sans épinglage, c'est le partage d'Ada qui
    // aurait repris la scène — la différence est donc bien observable.
    await waitFor(() => {
      expect(
        within(screen.getByTestId('active-speaker')).getByTestId('tile-u-bob:camera'),
      ).toBeTruthy();
    });
    expect(screen.getByTestId('pin-marker')).toBeTruthy();
    expect(within(screen.getByTestId('filmstrip')).getByTestId('tile-u-ada:screen')).toBeTruthy();
  });

  // La barre n'est PAS décrochée par une ternaire de `call.tsx` : elle reste
  // montée en plein écran et rend `null` elle-même, sur sa prop `hidden`. Ce
  // n'est pas un détail de style — c'est ce qui garde les quatre états de
  // périphérique qu'elle possède, et la sortie audio demandée est le seul des
  // quatre que RIEN ne relit : les deux listes sont réinterrogées à chaque
  // ouverture de leur feuille, la caméra en service avec elles.
  //
  // Mesuré des deux côtés, contre la même fixture : ce test passe sur la barre
  // telle qu'elle est, et rougit sur `{fullscreenTile === null ? <CallControlBar
  // hidden={false} … /> : null}` — la forme qu'une extraction naïve produit, et
  // que les 114 autres tests de ce fichier acceptent sans broncher. La coche du
  // haut-parleur disparaissait alors sur un aller-retour, sans que personne
  // n'ait rien demandé.
  it('garde la sortie audio demandée à travers un aller-retour par le plein écran', async () => {
    jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue(['bluetooth', 'speaker']);
    mockRoom.remoteParticipants.set('u-ada', remoteParticipant('u-ada', 'Ada'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('audio-output-option-speaker'));

    await waitFor(() => expect(screen.getByTestId('tile-u-ada:camera')).toBeTruthy());
    await enterFullscreen('u-ada:camera');
    // La sortie, sur la même tuile : la barre revient entière.
    await fireEvent.press(screen.getByTestId('tile-u-ada:camera'));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-check-speaker')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-bluetooth')).toBeNull();
  });
});

// Constat critique d'une revue de branche, arbre à l'appui : ouvrir le
// panneau des participants depuis le plein écran démontait `CallStage`, qui
// portait alors le seul geste capable de rappeler les commandes ; le minuteur
// de l'ancien `chromeVisible` continuait de tourner sans qu'aucun bouton ne
// reste atteignable pour l'arrêter — un enfermement total. La simplification
// de ce lot supprime le minuteur, mais `handleToggleParticipants` garde
// l'invariant qui évitait le pire : ouvrir ce panneau exige toujours d'être
// sorti du plein écran d'abord (voir `call.tsx`). Gardé, comme demandé : le
// panneau des participants doit rester utilisable après un passage par le
// plein écran, sans qu'il y reste rien accroché.
describe('CallScreen, plein écran, enfermement', () => {
  it('laisse le panneau des participants utilisable après un aller-retour par le plein écran', async () => {
    mockRoom.remoteParticipants.set('u-ada', remoteParticipant('u-ada', 'Ada'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('tile-u-ada:camera')).toBeTruthy());

    // Plein écran : grille, barre ET en-tête masqués. La pastille des
    // participants vit désormais dans l'en-tête, plus dans la barre — les deux
    // tombent sous la même garde, donc rien n'est atteignable tant qu'on n'en
    // est pas sorti.
    await enterFullscreen('u-ada:camera');
    expect(screen.queryByTestId('grid')).toBeNull();
    expect(screen.queryByTestId('call-header-participants')).toBeNull();

    // La sortie : un appui, où qu'il porte sur l'unique tuile affichée.
    await fireEvent.press(screen.getByTestId('tile-u-ada:camera'));
    await waitFor(() => expect(screen.getByTestId('call-header-participants')).toBeTruthy());

    // Le panneau s'ouvre et se referme normalement après ce passage par le
    // plein écran.
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    await waitFor(() => expect(screen.getByText('participants.title')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('call-header-participants'));

    // Une sortie reste atteignable : la zone vidéo et le bouton pour raccrocher
    // sont bien revenus. La GRILLE, et non une scène : le plein écran ouvert
    // depuis une cellule n'épingle rien, donc rien ne retient le mode `focus`
    // une fois qu'on en sort.
    await waitFor(() => {
      expect(screen.getByTestId('grid')).toBeTruthy();
      expect(screen.getByTestId('leave-btn')).toBeTruthy();
    });
  });
});

// « Le plein écran masque la barre et les commandes, jamais une demande qui
// attend une réponse. » La règle arbitrée le 2026-08-02, qui remplace « une
// tuile, et rien d'autre ».
//
// Quatre surfaces, et le describe couvre les deux camps : ce qui SURVIT parce
// qu'il attend une réponse de vous — quelqu'un frappe à la porte, quelqu'un
// d'autre lève la main —, et ce qui DISPARAÎT parce qu'il ne fait que décrire
// l'état du monde — l'enregistrement, votre propre main, les bulles.
//
// Les tests du second camp font l'aller-retour : sans le retour, une
// implémentation qui ne rendrait plus jamais le bandeau passerait aussi. Ceux
// du premier assertent en plus l'ABSENCE de `mic-toggle`, sans quoi un plein
// écran qui n'aurait jamais pris les rendrait verts pour la mauvaise raison.
describe('CallScreen, plein écran, ce qui disparaît et ce qui reste', () => {
  // La file d'attente part d'un `setInterval` de cinq secondes : sans avancer
  // le temps, `listWaitingParticipants` n'est jamais appelé et le bandeau
  // n'existe pas. Même dispositif que le describe « salle d'attente », posé sur
  // ce describe entier plutôt que sur son seul test qui en a besoin : les trois
  // autres n'attendent aucun minuteur, et une horloge figée y garde même la
  // bulle de réaction en vie plutôt que de la laisser expirer au bout de 3 s.
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // INVERSÉ le 2026-08-02. Ce test affirmait le contraire, et son commentaire
  // parlait d'une « conséquence acceptée ». Elle ne l'est plus : la règle est
  // devenue « le plein écran masque la barre et les commandes, jamais une
  // demande qui attend une réponse », et quelqu'un enfermé dehors en est une.
  it("garde le bandeau d'admission visible en plein écran", async () => {
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest
      .spyOn(participants, 'listWaitingParticipants')
      .mockResolvedValue({ ok: true, value: [{ id: 'lobby-1', username: 'Ada' }] });
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(screen.getByTestId('waiting-banner')).toBeTruthy());

    await enterFullscreen('u-bob:camera');

    expect(screen.getByTestId('waiting-banner')).toBeTruthy();
    expect(screen.queryByTestId('mic-toggle')).toBeNull();
  });

  // La seconde moitié de la même règle : une main levée attend qu'on donne la
  // parole. `mic-toggle` absent prouve qu'on est bien EN plein écran — sans
  // cette seconde assertion, un plein écran qui n'aurait jamais pris rendrait
  // le test vert pour la mauvaise raison.
  it('garde le bandeau des mains levées visible en plein écran', async () => {
    mockRoom.remoteParticipants.set(
      'u-bob',
      remoteParticipant('u-bob', 'Bob', { handRaisedAt: '2026-07-30T10:00:01Z' }),
    );

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('raised-hands-banner')).toBeTruthy());

    await enterFullscreen('u-bob:camera');

    expect(screen.getByTestId('raised-hands-banner')).toBeTruthy();
    expect(screen.queryByTestId('mic-toggle')).toBeNull();
  });

  it("masque l'indicateur d'enregistrement en plein écran, et le rend au retour", async () => {
    mockRoomMetadata = STARTED_METADATA;
    mockRoomIsRecording = true;
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('recording-indicator')).toBeTruthy());

    await enterFullscreen('u-bob:camera');

    expect(screen.queryByTestId('recording-indicator')).toBeNull();

    await fireEvent.press(screen.getByTestId('tile-u-bob:camera'));

    await waitFor(() => expect(screen.getByTestId('recording-indicator')).toBeTruthy());
  });

  it('masque le bandeau de main levée en plein écran, et le rend au retour', async () => {
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:00Z' };
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('hand-banner')).toBeTruthy());

    await enterFullscreen('u-bob:camera');

    expect(screen.queryByTestId('hand-banner')).toBeNull();

    await fireEvent.press(screen.getByTestId('tile-u-bob:camera'));

    await waitFor(() => expect(screen.getByTestId('hand-banner')).toBeTruthy());
  });

  it('masque les bulles de réaction en plein écran, et les rend au retour', async () => {
    // Une réaction reçue par le canal de données, jamais depuis le menu : la
    // feuille du menu resterait ouverte par-dessus la scène, et l'appui qui
    // ouvre le plein écran ne serait plus celui d'un vrai parcours.
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await emitRoom(
      'dataReceived',
      new TextEncoder().encode('{"type":"reactionReceived","data":{"emoji":"party-popper"}}'),
      { identity: 'u-bob' },
    );
    await waitFor(() => expect(screen.getByTestId('reaction-overlay')).toBeTruthy());

    await enterFullscreen('u-bob:camera');

    expect(screen.queryByTestId('reaction-overlay')).toBeNull();

    await fireEvent.press(screen.getByTestId('tile-u-bob:camera'));

    await waitFor(() => expect(screen.getByTestId('reaction-overlay')).toBeTruthy());
  });
});

describe('CallScreen, réactions', () => {
  it('envoie une réaction depuis le menu, sans jamais fermer celui-ci', async () => {
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('reaction-thumbs-up')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('reaction-thumbs-up'));

    await waitFor(() => expect(mockPublishData).toHaveBeenCalledTimes(1));
    const [bytes, options] = mockPublishData.mock.calls[0] as [Uint8Array, { reliable: boolean }];
    expect(new TextDecoder().decode(bytes)).toBe(
      '{"type":"reactionReceived","data":{"emoji":"thumbs-up"}}',
    );
    expect(options).toEqual({ reliable: true });
    // À l'inverse de `hand-toggle`, une réaction ne referme pas le menu.
    expect(screen.getByTestId('reaction-thumbs-up')).toBeTruthy();
  });

  it('affiche sa propre bulle après un envoi accepté', async () => {
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('reaction-red-heart')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('reaction-red-heart'));

    await waitFor(() => expect(screen.getByTestId('reaction-overlay')).toBeTruthy());
  });

  // La garde du bas de `ReactionOverlay` dépend du panneau ouvert, et c'est
  // ICI qu'elle se câble : le composant ne connaît que son booléen, et
  // `reactionOverlay.spec.tsx` en garde déjà les deux valeurs. Un `false` posé
  // en dur ici resterait invisible partout ailleurs — l'arithmétique et sa
  // provenance sont dans `reactionOverlay.tsx`, à côté des constantes.
  it('remonte les bulles au-dessus de la zone de saisie dès que le chat est ouvert', async () => {
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('reaction-red-heart')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('reaction-red-heart'));
    await waitFor(() => expect(screen.getByTestId('reaction-overlay')).toBeTruthy());

    // Chat fermé : seule la barre est à dégager. Les deux nombres suivent
    // `BAR_HEIGHT` — 4 + 52 + 4 = 60, plus 8 d'écart — et `reactionOverlay.spec`
    // porte la même paire. Deux sites, un seul calcul : celui de
    // `reactionOverlay.tsx`.
    expect(screen.getByTestId('reaction-overlay')).toHaveStyle({ paddingBottom: 68 });

    // Une réaction ne referme pas la feuille : `chat-btn` y est encore.
    await fireEvent.press(screen.getByTestId('chat-btn'));
    await waitFor(() => expect(screen.getByTestId('chat-title')).toBeTruthy());

    // Chat ouvert : la zone de saisie s'ajoute à la garde.
    expect(screen.getByTestId('reaction-overlay')).toHaveStyle({ paddingBottom: 140 });
  });

  it("n'affiche aucune bulle et ne montre aucune Snackbar quand la publication échoue", async () => {
    mockPublishData.mockRejectedValueOnce(new Error('offline'));
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('reaction-thumbs-up')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('reaction-thumbs-up'));

    await waitFor(() => expect(mockPublishData).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('reaction-overlay')).toBeNull();
    // `Snackbar` (react-native-paper) ne rend rien tant que `visible` n'est
    // jamais devenu vrai (`hidden` part de `!visible` et `handleSendReaction`
    // n'appelle jamais `setNotice` ici) : la surface n'existe donc pas du
    // tout dans l'arbre, pas seulement masquée. `visible` est d'ailleurs
    // déstructuré hors de `...rest` par `Snackbar` lui-même (node_modules/
    // react-native-paper/src/components/Snackbar.tsx) et n'atteint jamais le
    // noeud hôte — `.props.visible` sur l'élément trouvé par testID ne
    // lirait donc rien d'utile, à supposer même que l'élément existe.
    expect(screen.queryByTestId('call-notice')).toBeNull();
  });

  it('affiche une bulle avec le nom quand un autre participant réagit', async () => {
    mockRoom.remoteParticipants.set('u-ada', remoteParticipant('u-ada', 'Ada'));
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    await emitRoom(
      'dataReceived',
      new TextEncoder().encode('{"type":"reactionReceived","data":{"emoji":"party-popper"}}'),
      { identity: 'u-ada' },
    );

    await waitFor(() => expect(screen.getByTestId('reaction-overlay')).toBeTruthy());
    // `getByText` seul est ambigu : Ada est aussi un participant distant de la
    // séance, dont la tuile (caméra coupée) affiche déjà son nom en carton —
    // un second « Ada » dans l'arbre, distinct de la bulle. Scoper la
    // recherche à l'incrustation lève l'ambiguïté sans dépendre du schéma
    // interne d'identifiant que `reactionStore` fabrique pour chaque bulle.
    expect(within(screen.getByTestId('reaction-overlay')).getByText('Ada')).toBeTruthy();
  });

  it("ignore un paquet de données qui n'est pas une réaction", async () => {
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    await emitRoom(
      'dataReceived',
      new TextEncoder().encode('{"type":"participantMuted","data":{}}'),
      { identity: 'u-ada' },
    );

    expect(screen.queryByTestId('reaction-overlay')).toBeNull();
  });

  // Le plan proposait d'atteindre cet état par le menu (`more-btn`, puis
  // `settleMenus`), avec des horloges déjà truquées. Vérifié : ça bloque le
  // test entier jusqu'à expiration du délai de 5 s. `settleMenus` attend un
  // VRAI `setTimeout(32)` pour laisser l'animation JS de `Modal` se stabiliser
  // (voir son commentaire) ; sous `jest.useFakeTimers()`, posé ici AVANT cet
  // appel, ce minuteur ne s'écoule jamais puisque rien ne l'avance. La voie
  // par `emitRoom('dataReceived', …)` déjà éprouvée par le test voisin
  // (« affiche une bulle avec le nom… ») n'a pas ce problème : elle n'ouvre
  // aucun menu, donc ne dépend d'aucun minuteur réel.
  it('efface une bulle après sa durée de vie', async () => {
    jest.useFakeTimers();
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    await emitRoom(
      'dataReceived',
      new TextEncoder().encode('{"type":"reactionReceived","data":{"emoji":"thumbs-up"}}'),
      { identity: 'u-ghost' },
    );
    await waitFor(() => expect(screen.getByTestId('reaction-overlay')).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(screen.queryByTestId('reaction-overlay')).toBeNull();
    jest.useRealTimers();
  });

  it('détache le canal de données au démontage', async () => {
    const view = await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    expect(mockRoomHandlers.get('dataReceived')?.length ?? 0).toBeGreaterThan(0);

    await view.unmount();

    expect(mockRoomHandlers.get('dataReceived') ?? []).toHaveLength(0);
  });
});

describe('CallScreen — le chat', () => {
  async function openChat(): Promise<void> {
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('chat-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('chat-btn'));
    await waitFor(() => expect(screen.getByTestId('chat-title')).toBeTruthy());
  }

  it('remplace la zone vidéo par le chat, et la rend au retour', async () => {
    // Le panneau remplace la vidéo plutôt que de se poser par-dessus : les
    // deux se disputeraient la même image. La barre, elle, reste en place.
    //
    // `stage-root` et non `active-speaker` : depuis la grille adaptative, ce
    // dernier n'existe que lorsque le CONTENU réclame une scène — un partage
    // d'écran, un épinglage. À une seule personne, la disposition est une
    // grille, et ce test échouait sur une tuile qui n'a jamais eu de raison
    // d'être là. `stage-root` est la racine de la zone vidéo dans les deux
    // dispositions, donc exactement ce que ce test veut voir disparaître.
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('stage-root')).toBeTruthy());

    await openChat();

    expect(screen.queryByTestId('stage-root')).toBe(null);
    expect(screen.getByTestId('leave-btn')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('chat-close'));

    await waitFor(() => expect(screen.getByTestId('stage-root')).toBeTruthy());
    expect(screen.queryByTestId('chat-title')).toBe(null);
  });

  it("n'ouvre jamais deux panneaux à la fois", async () => {
    // Trois états s'excluent ; deux booléens en autoriseraient quatre, dont un
    // impossible.
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));
    await renderCall();
    await fireEvent.press(screen.getByTestId('call-header-participants'));
    await waitFor(() => expect(screen.getAllByTestId('participant-row').length).toBeGreaterThan(0));

    await openChat();

    expect(screen.queryByTestId('participant-row')).toBe(null);
  });

  it('affiche un message reçu du serveur', async () => {
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));
    await renderCall();

    await receiveChat('u-bob', 's-1', 'bonjour');
    await openChat();

    expect(screen.getByTestId('chat-body-u-bob#s-1')).toHaveTextContent('bonjour');
  });

  it('compte les non-lus sans ouvrir le panneau, puis les efface à l’ouverture', async () => {
    // Deux messages, jamais un seul : avec un seul, une pastille codée en dur
    // à 1 passerait.
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));
    await renderCall();

    await receiveChat('u-bob', 's-1', 'bonjour', 1_000);
    await receiveChat('u-bob', 's-2', 'la suite', 2_000);

    expect(screen.getByTestId('chat-unread')).toHaveTextContent('2');

    await openChat();

    expect(screen.queryByTestId('chat-unread')).toBe(null);
  });

  // Le compteur repartait de zéro à la seule OUVERTURE. Un message arrivé
  // PENDANT que le panneau est ouvert était donc compté non lu **alors que son
  // corps était à l'écran**, et la pastille survivait à la fermeture : elle
  // annonçait, sur un fil qu'on venait de lire, un message qu'on avait déjà lu.
  //
  // Deux messages, jamais un seul : avec un seul, une pastille codée en dur à
  // 1 passerait la première assertion.
  it('efface aussi les non-lus à la FERMETURE, et n’efface pas le fil', async () => {
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));
    await renderCall();
    await openChat();

    // Reçus panneau OUVERT : leur corps est à l'écran, et c'est bien là que le
    // compteur les tenait pour non lus.
    await receiveChat('u-bob', 's-1', 'bonjour', 1_000);
    await receiveChat('u-bob', 's-2', 'la suite', 2_000);
    expect(screen.getByTestId('chat-body-u-bob#s-2')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('chat-close'));

    // Les deux instructions de `handleCloseChat`, une assertion chacune : le
    // panneau se referme, ET la pastille part avec lui.
    await waitFor(() => expect(screen.getByTestId('stage-root')).toBeTruthy());
    expect(screen.queryByTestId('chat-unread')).toBe(null);
  });

  it('envoie sur le topic du chat et vide la zone', async () => {
    mockSendText.mockResolvedValue({ id: 's-local', timestamp: 5_000 });
    await renderCall();
    await openChat();

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'bonjour');
    await fireEvent.press(screen.getByTestId('chat-send'));

    await waitFor(() => expect(mockSendText).toHaveBeenCalledWith('bonjour', { topic: 'lk.chat' }));
    expect(screen.getByTestId('chat-input').props.value).toBe('');
    expect(screen.getByTestId('chat-body-me#s-local')).toHaveTextContent('bonjour');
  });

  it('signale un envoi échoué et garde le texte', async () => {
    mockSendText.mockRejectedValue(new Error('canal fermé'));
    await renderCall();
    await openChat();

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'bonjour');
    await fireEvent.press(screen.getByTestId('chat-send'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('chat.sendFailed'),
    );
    expect(screen.getByTestId('chat-input').props.value).toBe('bonjour');
  });

  it('efface l’avertissement quand un envoi suivant réussit', async () => {
    // Le test que le périmètre B avait dû ajouter après coup : un succès doit
    // effacer l'erreur d'un essai précédent.
    mockSendText.mockRejectedValueOnce(new Error('canal fermé'));
    mockSendText.mockResolvedValue({ id: 's-local', timestamp: 5_000 });
    await renderCall();
    await openChat();

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'bonjour');
    await fireEvent.press(screen.getByTestId('chat-send'));
    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('chat.sendFailed'),
    );

    await fireEvent.press(screen.getByTestId('chat-send'));

    // La `Snackbar` de Paper ne rend RIEN quand elle est masquée : le motif du
    // dépôt est `queryByTestId(…).toBeNull()`, jamais un contenu vide.
    await waitFor(() => expect(screen.queryByTestId('call-notice')).toBeNull());
  });

  // MESURÉ : sans ce test, figer `behavior={undefined}` sur la racine laissait
  // les 105 autres verts. Aucun test de RNTL n'ouvre de clavier, et ce que
  // `KeyboardAvoidingView` fait de cette prop SUR UN APPAREIL n'est donc pas
  // prouvable ici — mais que le câblage n'ait pas été retiré, si. C'est la
  // cause qu'on garde, pas le symptôme : sans elle, la zone de saisie et le
  // bouton « quitter » passent sous le clavier sur iOS.
  //
  // Le préréglage Jest fixe `Platform.OS` à 'ios', donc c'est la branche
  // 'padding' que ce fichier rend ; l'autre est gardée dans `keyboard.spec.ts`,
  // et c'est précisément pourquoi `keyboardMode()` est une VALEUR.
  it('rembourre la racine entière, et non le seul panneau', async () => {
    await renderCall();

    await waitFor(() => expect(screen.getByTestId('call-root')).toBeTruthy());
    // `behavior` elle-même n'est joignable par aucune assertion :
    // `KeyboardAvoidingView` la retire de ses props avant de les étaler sur sa
    // `View` (`KeyboardAvoidingView.js:225-233`) — le même piège que le
    // `visible` d'un `Badge`. Ce qui reste observable est ce que la branche
    // 'padding' COMPOSE : `StyleSheet.compose(style, {paddingBottom:
    // bottomHeight})` (`:279`), là où la branche par défaut passe `style` tel
    // quel (`:291`). Clavier fermé, `bottomHeight` vaut 0 — et `styles.root`
    // ne porte aucun `paddingBottom`, donc cette clé n'est là que si la
    // branche de rembourrage est active. Convention INTERNE à React Native,
    // pas un contrat d'API : une montée de version peut la changer, et le
    // rouge de cette suite serait alors le seul signal.
    expect(screen.getByTestId('call-root')).toHaveStyle({ paddingBottom: 0 });
  });

  describe('l’en-tête de séance', () => {
    // Le montage lui-même n'était gardé par RIEN : quatre mutations —
    // en-tête absent, compteur figé, minuteur figé, pastille non câblée —
    // rougissaient zéro test. Ces cinq-là ferment le trou.
    it('nomme la réunion', async () => {
      await renderCall();

      expect(screen.getByTestId('call-header-title')).toHaveTextContent('Réunion');
    });

    it('compte les personnes présentes', async () => {
      await renderCall();

      // Le double d'i18n rend `clé|{valeurs}` dès qu'on lui passe des
      // valeurs : c'est le COMPTE interpolé qu'on observe, pas la chaîne
      // rendue. Une REGEX, parce que `toHaveTextContent` de RNTL compare
      // sinon la chaîne entière. Le fixture par défaut n'a que le
      // participant local.
      await waitFor(() => {
        expect(screen.getByTestId('call-header-participants-count')).toHaveTextContent(/"count":1/);
      });
    });

    it('ouvre le panneau des participants depuis la pastille', async () => {
      await renderCall();

      await fireEvent.press(screen.getByTestId('call-header-participants'));

      // Le panneau démonte la scène : son ouverture se lit à la disparition
      // de la grille, comme `enterFullscreen` lit celle de `mic-toggle`.
      await waitFor(() => {
        expect(screen.queryByTestId('stage-root')).toBeNull();
      });
    });

    // La règle du plein écran, appliquée à l'en-tête : il DÉCRIT l'état du
    // monde — quelle réunion, depuis quand, combien de personnes — et n'attend
    // aucune réponse. Il disparaît donc, là où le bandeau d'admission survit.
    it('disparaît en plein écran, comme tout ce qui ne demande rien', async () => {
      await renderCall();
      await enterFullscreen('me:camera');

      expect(screen.queryByTestId('call-header')).toBeNull();
    });

    it('revient en quittant le plein écran', async () => {
      await renderCall();
      await enterFullscreen('me:camera');
      await fireEvent.press(screen.getByTestId('tile-me:camera'));

      await waitFor(() => {
        expect(screen.getByTestId('call-header')).toBeTruthy();
      });
    });
  });

  it('enregistre lk.chat une seule fois, et le libère au démontage', async () => {
    // Un gestionnaire laissé sur une Room vivante est une fuite qu'aucun écran
    // ne rattrape ; deux enregistrements feraient jeter le SDK.
    const view = await renderCall();

    expect(mockTextStreamHandlers.has('lk.chat')).toBe(true);

    await view.unmount();

    expect(mockTextStreamHandlers.has('lk.chat')).toBe(false);
  });
});

// C'est ICI que le défaut se voyait : `call.tsx` peint `backgroundDark`, la
// coque appliquait les encoches SANS fond, et la bande dégagée laissait voir
// la vue système — blanche, en haut ET en bas d'un écran noir. Signalé sur
// appareil.
describe('CallScreen, les encoches', () => {
  it('peint son noir JUSQU’AU bord haut, encoche comprise', async () => {
    await render(withInsets(<CallScreen />));

    // Les deux ensemble, jamais séparément : un rembourrage sans fond ne peint
    // rien, et c'est exactement ce qui produisait la bande blanche.
    expect(screen.getByTestId('call-root')).toHaveStyle({
      backgroundColor: tokens.color.backgroundDark,
      paddingTop: 59,
    });
  });

  // Le bas n'est PAS sur la racine, et ce test dit pourquoi plutôt que de le
  // taire : `call-root` est une `KeyboardAvoidingView`, qui écrase
  // `paddingBottom` avec la hauteur du clavier — zéro sans clavier. La première
  // version de la correction posait l'encart là et il disparaissait ; c'est ce
  // test qui l'a montré, pas une relecture.
  it('laisse la KeyboardAvoidingView écraser le bas de la racine', async () => {
    await render(withInsets(<CallScreen />));

    expect(screen.getByTestId('call-root')).toHaveStyle({ paddingBottom: 0 });
  });

  // Donc c'est la BARRE qui écarte les commandes de l'indicateur d'accueil,
  // elle qui borde le bas. 4 (le rembourrage de la rangée) + 34 (l'encart).
  it('écarte les commandes de l’indicateur d’accueil', async () => {
    await render(withInsets(<CallScreen />));

    expect(screen.getByTestId('leave-btn').parent).toBeTruthy();
    expect(screen.getByTestId('mic-toggle')).toBeTruthy();
    expect(screen.getByTestId('call-controls')).toHaveStyle({ paddingBottom: 38 });
  });
});
