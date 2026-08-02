import { AudioSession } from '@livekit/react-native';
import { Platform } from 'react-native';

import {
  audioRouteControl,
  clearAudioDevice,
  listAudioDevices,
  listAudioOutputs,
  openSystemRoutePicker,
  readCurrentAudioDeviceId,
  selectAudioDevice,
  selectAudioOutput,
  startAudioRoute,
  stopAudioRoute,
} from 'src/call/audioRoute';
import type { NativeAudioDevicesModule } from 'src/call/nativeAudioDevices';

// Le module natif est une CONSTANTE exportée : `requireOptionalNativeModule`
// rend `null` sous Jest, mesuré, et rien ne peut le réaffecter depuis un test.
// Le double est donc posé derrière un accesseur, relu à chaque appel — ce que
// `audioRoute.ts` fait bien, puisqu'il lit la liaison DANS ses fonctions et non
// au chargement du module.
//
// Le préfixe `mock` est ce qui autorise la fabrique hoistée de `jest.mock` à
// fermer sur cette variable.
const mockNativeHolder: { current: NativeAudioDevicesModule | null } = { current: null };

jest.mock('src/call/nativeAudioDevices', () => ({
  get nativeAudioDevices(): NativeAudioDevicesModule | null {
    return mockNativeHolder.current;
  },
}));

function fakeNative(overrides: Partial<NativeAudioDevicesModule> = {}): NativeAudioDevicesModule {
  return {
    isSupported: jest.fn(() => true),
    listDevices: jest.fn(async () => []),
    getCurrentDeviceId: jest.fn(async () => null),
    acquire: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
    selectDevice: jest.fn(async () => true),
    clearDevice: jest.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockNativeHolder.current = null;
  jest.mocked(AudioSession.getAudioOutputs).mockReset().mockResolvedValue([]);
  jest.mocked(AudioSession.selectAudioOutput).mockReset().mockResolvedValue(undefined);
  jest.mocked(AudioSession.showAudioRoutePicker).mockReset().mockResolvedValue(undefined);
  jest.mocked(AudioSession.startAudioSession).mockReset().mockResolvedValue(undefined);
  jest.mocked(AudioSession.stopAudioSession).mockReset().mockResolvedValue(undefined);
});

describe('audioRouteControl', () => {
  it("rend 'system' sur iOS, où la seule surface est le sélecteur de la plateforme", () => {
    // `getAudioOutputs()` y est une constante à deux entrées qui ne sont pas
    // des catégories : il n'y a pas de menu à peupler. Et le module natif est
    // Android seulement — même présent, iOS reste 'system'.
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockNativeHolder.current = fakeNative();

    expect(audioRouteControl()).toBe('system');
  });

  it("rend 'menu' quand le module natif n'est pas lié", () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(audioRouteControl()).toBe('menu');
  });

  it("rend 'menu' sous le plancher API 31, module lié compris", () => {
    // L'autre polarité de `isSupported()` : sans elle, un `ownsRoute()` qui ne
    // testerait que la présence du module passerait.
    jest.replaceProperty(Platform, 'OS', 'android');
    mockNativeHolder.current = fakeNative({ isSupported: jest.fn(() => false) });

    expect(audioRouteControl()).toBe('menu');
  });

  it("rend 'devices' quand le module natif est lié et l'API suffisante", () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockNativeHolder.current = fakeNative();

    expect(audioRouteControl()).toBe('devices');
  });
});

describe('startAudioRoute', () => {
  it('démarre AudioSwitch quand nous ne tenons pas le volant', async () => {
    await startAudioRoute();

    expect(AudioSession.startAudioSession).toHaveBeenCalledTimes(1);
  });

  it('prend le volant, et NE démarre PAS AudioSwitch, quand le module est là', async () => {
    // Les deux assertions, jamais la première seule : deux arbitres sur le même
    // canal sont la cause classique du « le son est reparti tout seul », et
    // c'est invisible en test — RNTL ne route rien.
    const native = fakeNative();
    mockNativeHolder.current = native;

    await startAudioRoute();

    expect(native.acquire).toHaveBeenCalledTimes(1);
    expect(AudioSession.startAudioSession).not.toHaveBeenCalled();
  });

  it('laisse AudioSwitch conduire sous le plancher API 31', async () => {
    const native = fakeNative({ isSupported: jest.fn(() => false) });
    mockNativeHolder.current = native;

    await startAudioRoute();

    expect(native.acquire).not.toHaveBeenCalled();
    expect(AudioSession.startAudioSession).toHaveBeenCalledTimes(1);
  });
});

describe('stopAudioRoute', () => {
  it('arrête AudioSwitch quand nous ne tenons pas le volant', async () => {
    await stopAudioRoute();

    expect(AudioSession.stopAudioSession).toHaveBeenCalledTimes(1);
  });

  it('rend la route au système quand nous la tenions', async () => {
    const native = fakeNative();
    mockNativeHolder.current = native;

    await stopAudioRoute();

    expect(native.release).toHaveBeenCalledTimes(1);
    expect(AudioSession.stopAudioSession).not.toHaveBeenCalled();
  });
});

describe('listAudioOutputs', () => {
  it('normalise et ordonne ce que rend le module natif', async () => {
    jest.mocked(AudioSession.getAudioOutputs).mockResolvedValue(['speaker', 'bluetooth', 'hdmi']);

    await expect(listAudioOutputs()).resolves.toEqual(['bluetooth', 'speaker']);
  });

  it("rend une liste vide quand la session audio n'est pas ouverte", async () => {
    jest.mocked(AudioSession.getAudioOutputs).mockResolvedValue([]);

    await expect(listAudioOutputs()).resolves.toEqual([]);
  });

  it('jette les constantes iOS, qui ne sont pas des catégories', async () => {
    jest.mocked(AudioSession.getAudioOutputs).mockResolvedValue(['default', 'force_speaker']);

    await expect(listAudioOutputs()).resolves.toEqual([]);
  });
});

describe('selectAudioOutput', () => {
  it('transmet la catégorie choisie, jamais une autre', async () => {
    // Deux appels distincts, et la seconde catégorie vérifiée : un appel qui
    // enverrait toujours 'speaker' passerait un test à une seule valeur.
    await selectAudioOutput('bluetooth');
    await selectAudioOutput('earpiece');

    expect(AudioSession.selectAudioOutput).toHaveBeenNthCalledWith(1, 'bluetooth');
    expect(AudioSession.selectAudioOutput).toHaveBeenNthCalledWith(2, 'earpiece');
  });
});

describe('listAudioDevices', () => {
  it("rend une liste vide quand le module natif n'est pas lié", async () => {
    await expect(listAudioDevices()).resolves.toEqual([]);
  });

  it('normalise ce que rend le module natif', async () => {
    mockNativeHolder.current = fakeNative({
      listDevices: jest.fn(async () => [
        { id: 2, type: 2, name: 'Pixel 8' },
        { id: 7, type: 7, name: 'Tesla Model 3' },
      ]),
    });

    await expect(listAudioDevices()).resolves.toEqual([
      {
        id: 7,
        kind: 'bluetooth',
        name: 'Tesla Model 3',
        nameKey: 'call.output.bluetooth',
        ordinal: null,
      },
      { id: 2, kind: 'speaker', name: null, nameKey: 'call.output.speaker', ordinal: null },
    ]);
  });
});

describe('selectAudioDevice', () => {
  it("rend `false` quand le module natif n'est pas lié", async () => {
    await expect(selectAudioDevice(7)).resolves.toBe(false);
  });

  it("transmet l'identifiant visé, et rend le verdict du système", async () => {
    // Deux identifiants distincts : un appel qui enverrait toujours le premier
    // passerait un test à une seule valeur.
    const native = fakeNative({ selectDevice: jest.fn(async (id: number) => id === 7) });
    mockNativeHolder.current = native;

    await expect(selectAudioDevice(7)).resolves.toBe(true);
    await expect(selectAudioDevice(2)).resolves.toBe(false);
    expect(native.selectDevice).toHaveBeenNthCalledWith(1, 7);
    expect(native.selectDevice).toHaveBeenNthCalledWith(2, 2);
  });
});

describe('clearAudioDevice', () => {
  it("ne jette pas quand le module natif n'est pas lié", async () => {
    await expect(clearAudioDevice()).resolves.toBeUndefined();
  });

  it('rend la route au système', async () => {
    const native = fakeNative();
    mockNativeHolder.current = native;

    await clearAudioDevice();

    expect(native.clearDevice).toHaveBeenCalledTimes(1);
  });
});

describe('readCurrentAudioDeviceId', () => {
  it("rend `null` quand le module natif n'est pas lié", async () => {
    await expect(readCurrentAudioDeviceId()).resolves.toBeNull();
  });

  it("rend l'identifiant constaté par le système", async () => {
    mockNativeHolder.current = fakeNative({ getCurrentDeviceId: jest.fn(async () => 7) });

    await expect(readCurrentAudioDeviceId()).resolves.toBe(7);
  });
});

describe('openSystemRoutePicker', () => {
  it('appelle le sélecteur système', async () => {
    // Un test ne peut vérifier que l'appel : la méthode native simule un clic
    // sur une vue jamais insérée dans la hiérarchie, et n'a pas de resolver.
    await openSystemRoutePicker();

    expect(AudioSession.showAudioRoutePicker).toHaveBeenCalled();
  });
});
