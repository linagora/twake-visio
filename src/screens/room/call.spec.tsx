import { VideoTrack } from '@livekit/react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Share } from 'react-native';

import * as rooms from 'src/api/rooms';
import * as accounts from 'src/auth/accounts';
import * as media from 'src/call/media';
import type { CallState } from 'src/call/types';
import { CallScreen } from './call';

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
