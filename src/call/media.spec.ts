import { mediaDevices } from '@livekit/react-native-webrtc';
import type { Room } from 'livekit-client';

import {
  listCameras,
  readActiveCameraId,
  selectCamera,
  setCameraEnabled,
  setMicrophoneEnabled,
} from 'src/call/media';

jest.mock('livekit-client', () => ({
  Track: { Source: { Camera: 'camera', ScreenShare: 'screen_share' } },
  // Une fermeture, jamais la référence directe : la fabrique de `jest.mock`
  // s'exécute avant l'initialisation des `const` de ce module. Elle n'est là
  // que pour prouver que `listCameras` ne l'appelle pas — `getLocalDevices`
  // acquiert `getUserMedia` dès que sa liste filtrée est vide, et allume donc
  // le micro pour rien.
  Room: { getLocalDevices: (...args: unknown[]) => mockGetLocalDevices(...args) },
}));

const mockSetMicrophoneEnabled = jest.fn();
const mockSetCameraEnabled = jest.fn();
const mockRestartTrack = jest.fn();
const mockSwitchActiveDevice = jest.fn();
const mockGetActiveDevice = jest.fn();
const mockGetLocalDevices = jest.fn();

type Publications = Record<string, { videoTrack?: { restartTrack: jest.Mock } }>;

function fakeRoom(publications: Publications): Room {
  return {
    localParticipant: {
      setMicrophoneEnabled: mockSetMicrophoneEnabled,
      setCameraEnabled: mockSetCameraEnabled,
      getTrackPublication: (source: string) => publications[source],
    },
    switchActiveDevice: mockSwitchActiveDevice,
    getActiveDevice: mockGetActiveDevice,
  } as unknown as Room;
}

function roomWithCamera(): Room {
  return fakeRoom({ camera: { videoTrack: { restartTrack: mockRestartTrack } } });
}

beforeEach(() => {
  mockSetMicrophoneEnabled.mockReset().mockResolvedValue(undefined);
  mockSetCameraEnabled.mockReset().mockResolvedValue(undefined);
  mockRestartTrack.mockReset().mockResolvedValue(undefined);
  mockSwitchActiveDevice.mockReset().mockResolvedValue(true);
  mockGetActiveDevice.mockReset().mockReturnValue(undefined);
  mockGetLocalDevices.mockReset();
  jest.mocked(mediaDevices.enumerateDevices).mockReset().mockResolvedValue([]);
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

describe('listCameras', () => {
  it("passe par mediaDevices et n'appelle jamais Room.getLocalDevices", async () => {
    // `getLocalDevices` acquiert `getUserMedia` dès que sa liste filtrée est
    // vide — ce qui est toujours le cas sur mobile pour l'audio — et allume
    // donc le micro pour rien. Le piège ne se paie pas sous Jest : il se paie
    // sur appareil, par une pastille d'enregistrement qui s'allume seule.
    //
    // Deux caméras, jamais une seule : avec une seule, `listCameras` pourrait
    // être réduite à `readCameras(...).slice(0, 1)` sans qu'aucun test ne
    // rougisse — mesuré par mutation.
    jest.mocked(mediaDevices.enumerateDevices).mockResolvedValue([
      { kind: 'videoinput', deviceId: '0', facing: 'front', label: 'camera-2-id' },
      { kind: 'videoinput', deviceId: '1', facing: 'environment', label: 'camera-1-id' },
      { kind: 'audioinput', deviceId: 'audio-1', label: 'Audio' },
    ]);

    const cameras = await listCameras();

    expect(cameras).toEqual([
      { deviceId: '0', facing: 'user', nameKey: 'call.cameraFront', ordinal: null },
      { deviceId: '1', facing: 'environment', nameKey: 'call.cameraBack', ordinal: null },
    ]);
    expect(mockGetLocalDevices).not.toHaveBeenCalled();
  });

  it("rend une liste vide plutôt que de jeter quand l'énumération ne rend rien d'exploitable", async () => {
    jest.mocked(mediaDevices.enumerateDevices).mockResolvedValue(undefined);

    await expect(listCameras()).resolves.toEqual([]);
  });
});

describe('selectCamera', () => {
  it('vise videoinput et le deviceId reçu, jamais le premier venu', async () => {
    // Deux appels distincts, et le second vérifié : un appel qui enverrait
    // toujours le même identifiant passerait un test à une seule valeur.
    await selectCamera(fakeRoom({}), 'cam-front');
    await selectCamera(fakeRoom({}), 'cam-back');

    expect(mockSwitchActiveDevice).toHaveBeenNthCalledWith(1, 'videoinput', 'cam-front');
    expect(mockSwitchActiveDevice).toHaveBeenNthCalledWith(2, 'videoinput', 'cam-back');
  });

  it('rend le booléen du SDK tel quel', async () => {
    // `false` dit qu'Android est retombé sur son repli `facingMode` : la
    // caméra en service n'est pas celle qu'on a demandée. Remplacer ce
    // booléen par `true` supprimerait le seul signal qui existe.
    mockSwitchActiveDevice.mockResolvedValue(false);

    await expect(selectCamera(fakeRoom({}), 'cam-back')).resolves.toBe(false);
  });

  it('rend true quand le SDK confirme', async () => {
    mockSwitchActiveDevice.mockResolvedValue(true);

    await expect(selectCamera(fakeRoom({}), 'cam-back')).resolves.toBe(true);
  });

  it('laisse remonter le rejet, qui est le second canal', async () => {
    // `switchActiveDevice` jette si `setDeviceId` jette, après avoir restauré
    // le `deviceId` précédent. Un `.catch()` seul chez l'appelant ne verrait
    // pas le premier canal ; avaler le rejet ici masquerait le second.
    mockSwitchActiveDevice.mockRejectedValue(new Error('contrainte impossible'));

    await expect(selectCamera(fakeRoom({}), 'cam-back')).rejects.toThrow('contrainte impossible');
  });
});

describe('readActiveCameraId', () => {
  it('rend la caméra réellement en service', () => {
    mockGetActiveDevice.mockReturnValue('cam-back');

    expect(readActiveCameraId(fakeRoom({}))).toBe('cam-back');
    expect(mockGetActiveDevice).toHaveBeenCalledWith('videoinput');
  });

  it("rend null plutôt qu'undefined quand le SDK n'en connaît aucune", () => {
    // `getActiveDevice` rend `string | undefined` ; l'écran tient un
    // `string | null`. La conversion se fait ici, une fois.
    mockGetActiveDevice.mockReturnValue(undefined);

    expect(readActiveCameraId(fakeRoom({}))).toBe(null);
  });
});
