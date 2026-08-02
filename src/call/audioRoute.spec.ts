import { AudioSession } from '@livekit/react-native';
import { Platform } from 'react-native';

import {
  audioRouteControl,
  clearAudioDevice,
  listAudioDevices,
  listAudioOutputs,
  openSystemRoutePicker,
  readCurrentAudioDeviceId,
  routeToPreferredDevice,
  watchPreferredDevice,
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
    addListener: jest.fn(() => ({ remove: jest.fn() })),
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

  it('route vers le casque APRÈS avoir pris le volant, jamais avant', async () => {
    // L'ordre est le point : `getAvailableCommunicationDevices()` se lit une
    // fois le mode de communication posé. Lister avant `acquire()` rendrait une
    // liste sans le casque, et la préférence porterait sur du vide.
    const order: string[] = [];
    const native = fakeNative({
      acquire: jest.fn(async () => {
        order.push('acquire');
      }),
      listDevices: jest.fn(async () => {
        order.push('list');
        return [{ id: 3, type: 7, name: 'Jabra Evolve3 85' }];
      }),
      selectDevice: jest.fn(async (id: number) => {
        order.push(`select:${id}`);
        return true;
      }),
    });
    mockNativeHolder.current = native;

    await startAudioRoute();

    expect(order).toEqual(['acquire', 'list', 'select:3']);
  });

  it("ne pose aucune route quand aucun casque n'est disponible", async () => {
    // La seconde polarité : sans casque, on laisse le système décider. Poser
    // une route ici arbitrerait entre écouteur et haut-parleur, ce que personne
    // n'a demandé — et un `setCommunicationDevice` est un choix MANUEL pour
    // Android, qu'on ne défait qu'en le vidant.
    const native = fakeNative({
      listDevices: jest.fn(async () => [
        { id: 1, type: 1, name: 'Pixel 10 Pro Fold' },
        { id: 2, type: 2, name: 'Pixel 10 Pro Fold' },
      ]),
    });
    mockNativeHolder.current = native;

    await startAudioRoute();

    expect(native.acquire).toHaveBeenCalledTimes(1);
    expect(native.selectDevice).not.toHaveBeenCalled();
  });

  it("ne route rien sur le chemin AudioSwitch, qui s'en charge lui-même", async () => {
    const native = fakeNative({ isSupported: jest.fn(() => false) });
    mockNativeHolder.current = native;

    await startAudioRoute();

    expect(native.listDevices).not.toHaveBeenCalled();
    expect(native.selectDevice).not.toHaveBeenCalled();
  });
});

describe('routeToPreferredDevice', () => {
  it('route vers le casque Bluetooth disponible et rend true', async () => {
    const native = fakeNative({
      listDevices: jest.fn(async () => [
        { id: 1, type: 1, name: 'Pixel 10 Pro Fold' },
        { id: 4, type: 7, name: 'Jabra Evolve3 85' },
      ]),
    });
    mockNativeHolder.current = native;

    await expect(routeToPreferredDevice()).resolves.toBe(true);

    expect(native.selectDevice).toHaveBeenCalledWith(4);
  });

  it("rend false, sans rien poser, quand aucun casque n'est disponible", async () => {
    const native = fakeNative({
      listDevices: jest.fn(async () => [{ id: 1, type: 1, name: 'Pixel 10 Pro Fold' }]),
    });
    mockNativeHolder.current = native;

    await expect(routeToPreferredDevice()).resolves.toBe(false);

    expect(native.selectDevice).not.toHaveBeenCalled();
  });

  it('rend ce que le système a répondu, refus compris', async () => {
    // `setCommunicationDevice()` rend un booléen, et un refus doit remonter :
    // l'appelant ne doit pas annoncer une route qui n'a pas pris.
    const native = fakeNative({
      listDevices: jest.fn(async () => [{ id: 4, type: 7, name: 'Jabra Evolve3 85' }]),
      selectDevice: jest.fn(async () => false),
    });
    mockNativeHolder.current = native;

    await expect(routeToPreferredDevice()).resolves.toBe(false);
  });

  it('rend false quand le module natif est absent', async () => {
    await expect(routeToPreferredDevice()).resolves.toBe(false);
  });

  it('ne repose pas une route déjà en place', async () => {
    // Ce n'est pas une optimisation, c'est un GARDE-FOU DE BOUCLE.
    // `addOnCommunicationDeviceChangedListener` notifie aussi les changements
    // que NOUS provoquons (`TwakeAudioDevicesModule.acquireRoute`). L'écoute
    // des changements rappelle donc cette fonction après chaque route posée ;
    // sans cette égalité, elle se rappellerait elle-même sans fin.
    const native = fakeNative({
      listDevices: jest.fn(async () => [{ id: 4, type: 7, name: 'Jabra Evolve3 85' }]),
      getCurrentDeviceId: jest.fn(async () => 4),
    });
    mockNativeHolder.current = native;

    await expect(routeToPreferredDevice()).resolves.toBe(false);

    expect(native.selectDevice).not.toHaveBeenCalled();
  });
});

describe('watchPreferredDevice', () => {
  // Le double d'abonnement rend la fonction que le natif a reçue, pour pouvoir
  // la déclencher : c'est le seul moyen d'observer ce que fait l'écoute.
  // Un VRAI vidage de file, jamais deux `Promise.resolve()` : la chaîne de
  // `routeToPreferredDevice` enchaîne trois fonctions asynchrones, et un vidage
  // trop court rendrait les deux tests « ne touche à rien » VERTS À VIDE — ils
  // passeraient contre une implémentation qui route.
  const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  function listenerOf(native: NativeAudioDevicesModule): () => void {
    const call = jest.mocked(native.addListener).mock.calls[0];
    if (call === undefined) throw new Error('aucun abonnement posé');
    return call[1];
  }

  it("s'abonne aux changements de route", () => {
    const native = fakeNative();
    mockNativeHolder.current = native;

    watchPreferredDevice(() => false);

    expect(native.addListener).toHaveBeenCalledWith('onDevicesChanged', expect.any(Function));
  });

  it('route vers le casque branché en cours de séance', async () => {
    const native = fakeNative({
      listDevices: jest.fn(async () => [{ id: 4, type: 7, name: 'Jabra Evolve3 85' }]),
    });
    mockNativeHolder.current = native;

    watchPreferredDevice(() => false);
    listenerOf(native)();
    // L'écoute ne peut pas attendre : elle détache la promesse. On vide donc la
    // file pour la laisser se dénouer.
    await flush();

    expect(native.selectDevice).toHaveBeenCalledWith(4);
  });

  it('ne touche à rien quand la personne a choisi sa sortie à la main', async () => {
    // La seconde polarité, et elle compte : un choix manuel doit tenir contre
    // un casque qui se connecte ensuite.
    const native = fakeNative({
      listDevices: jest.fn(async () => [{ id: 4, type: 7, name: 'Jabra Evolve3 85' }]),
    });
    mockNativeHolder.current = native;

    watchPreferredDevice(() => true);
    listenerOf(native)();
    await flush();

    expect(native.selectDevice).not.toHaveBeenCalled();
  });

  it('relit le choix manuel à CHAQUE notification, sans le capturer', async () => {
    // Capturer `manual` à l'abonnement laisserait la préférence écraser un
    // choix fait après coup — pour le reste de la séance, et sans le dire.
    let manual = false;
    const native = fakeNative({
      listDevices: jest.fn(async () => [{ id: 4, type: 7, name: 'Jabra Evolve3 85' }]),
    });
    mockNativeHolder.current = native;

    watchPreferredDevice(() => manual);
    manual = true;
    listenerOf(native)();
    await flush();

    expect(native.selectDevice).not.toHaveBeenCalled();
  });

  it("se désabonne quand on appelle ce qu'il rend", () => {
    const remove = jest.fn();
    const native = fakeNative({ addListener: jest.fn(() => ({ remove })) });
    mockNativeHolder.current = native;

    watchPreferredDevice(() => false)();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("n'écoute rien sous le plancher API 31, où AudioSwitch conduit", () => {
    // Il fait déjà la bascule : écouter ici poserait un second arbitre sur le
    // même canal — la cause classique du « le son est reparti tout seul ».
    const native = fakeNative({ isSupported: jest.fn(() => false) });
    mockNativeHolder.current = native;

    watchPreferredDevice(() => false);

    expect(native.addListener).not.toHaveBeenCalled();
  });

  it('rend une fonction inerte quand le module natif est absent', () => {
    // Sous Jest, sur iOS, et dans un binaire construit sans lui. L'appeler ne
    // doit pas jeter — le nettoyage d'un effet ne rattrape rien.
    expect(() => watchPreferredDevice(() => false)()).not.toThrow();
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
