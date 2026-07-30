import type { Room } from 'livekit-client';

import { setCameraEnabled, setMicrophoneEnabled, switchCamera } from 'src/call/media';

jest.mock('livekit-client', () => ({
  Track: { Source: { Camera: 'camera', ScreenShare: 'screen_share' } },
}));

const mockSetMicrophoneEnabled = jest.fn();
const mockSetCameraEnabled = jest.fn();
const mockRestartTrack = jest.fn();

type Publications = Record<string, { videoTrack?: { restartTrack: jest.Mock } }>;

function fakeRoom(publications: Publications): Room {
  return {
    localParticipant: {
      setMicrophoneEnabled: mockSetMicrophoneEnabled,
      setCameraEnabled: mockSetCameraEnabled,
      getTrackPublication: (source: string) => publications[source],
    },
  } as unknown as Room;
}

function roomWithCamera(): Room {
  return fakeRoom({ camera: { videoTrack: { restartTrack: mockRestartTrack } } });
}

beforeEach(() => {
  mockSetMicrophoneEnabled.mockReset().mockResolvedValue(undefined);
  mockSetCameraEnabled.mockReset().mockResolvedValue(undefined);
  mockRestartTrack.mockReset().mockResolvedValue(undefined);
});

describe('setMicrophoneEnabled', () => {
  it("transmet l'activation au participant local", async () => {
    await setMicrophoneEnabled(roomWithCamera(), false);
    expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(false);
  });
});

describe('setCameraEnabled', () => {
  it("transmet l'activation au participant local", async () => {
    await setCameraEnabled(roomWithCamera(), true);
    expect(mockSetCameraEnabled).toHaveBeenCalledWith(true);
  });
});

describe('switchCamera', () => {
  it('bascule de la face avant vers la face arrière et renvoie la face obtenue', async () => {
    const facing = await switchCamera(roomWithCamera(), 'user');

    expect(mockRestartTrack).toHaveBeenCalledWith({ facingMode: 'environment' });
    expect(facing).toBe('environment');
  });

  it('revient à la face avant depuis la face arrière', async () => {
    const facing = await switchCamera(roomWithCamera(), 'environment');

    expect(mockRestartTrack).toHaveBeenCalledWith({ facingMode: 'user' });
    expect(facing).toBe('user');
  });

  it("ignore le partage d'écran plutôt que de le redémarrer en caméra", async () => {
    // Un filtre sur `kind === 'video'` attraperait la piste de partage
    // d'écran, et lui appliquer une contrainte de face remplacerait l'écran
    // partagé par le visage de la personne devant tout le monde.
    const room = fakeRoom({ screen_share: { videoTrack: { restartTrack: mockRestartTrack } } });

    const facing = await switchCamera(room, 'user');

    expect(mockRestartTrack).not.toHaveBeenCalled();
    expect(facing).toBe('user');
  });

  it("conserve la face courante quand aucune caméra n'est publiée", async () => {
    const facing = await switchCamera(fakeRoom({}), 'user');

    expect(mockRestartTrack).not.toHaveBeenCalled();
    expect(facing).toBe('user');
  });

  it("conserve la face courante quand la publication n'a pas encore de piste", async () => {
    const facing = await switchCamera(fakeRoom({ camera: {} }), 'user');

    expect(mockRestartTrack).not.toHaveBeenCalled();
    expect(facing).toBe('user');
  });
});
