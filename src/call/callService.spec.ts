import { startCallService, stopCallService } from 'src/call/callService';
import type { NativeCallServiceModule } from 'src/call/nativeCallService';

// Même montage que `audioRoute.spec.ts` : le module natif est une CONSTANTE
// exportée que `requireOptionalNativeModule` fixe à `null` sous Jest, donc rien
// ne peut la réaffecter depuis un test. Le double passe par un accesseur, relu
// à chaque appel.
const mockNativeHolder: { current: NativeCallServiceModule | null } = { current: null };

jest.mock('src/call/nativeCallService', () => ({
  get nativeCallService(): NativeCallServiceModule | null {
    return mockNativeHolder.current;
  },
}));

jest.mock('i18next', () => ({ t: (key: string) => `tr:${key}` }));

function fakeNative(overrides: Partial<NativeCallServiceModule> = {}): NativeCallServiceModule {
  return {
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockNativeHolder.current = null;
});

describe('startCallService', () => {
  it('démarre le service avec des textes traduits', async () => {
    const native = fakeNative();
    mockNativeHolder.current = native;

    await startCallService();

    // Les deux textes traversent le pont : c'est ce qui garde les sept langues
    // du dépôt maîtresses du libellé, plutôt qu'un `strings.xml` que
    // `src/i18n/index.spec.ts` ne saurait pas vérifier.
    expect(native.start).toHaveBeenCalledWith('tr:call.ongoingTitle', 'tr:call.ongoingBody');
  });

  it("ne fait rien quand le module natif n'est pas lié", async () => {
    // Sous Jest, sur iOS, et dans un binaire construit sans lui. L'absence doit
    // se refermer sans bruit, pas jeter.
    await expect(startCallService()).resolves.toBeUndefined();
  });

  it("n'échoue pas quand le système refuse de démarrer le service", async () => {
    // `startForegroundService()` lève si l'application est déjà en arrière-plan.
    // Un service qui ne démarre pas prive d'une reprise ; il ne doit jamais
    // empêcher d'entrer en séance — même règle que la permission Bluetooth.
    const native = fakeNative({
      start: jest.fn(async () => Promise.reject(new Error('refusé'))),
    });
    mockNativeHolder.current = native;

    await expect(startCallService()).resolves.toBeUndefined();
  });
});

describe('stopCallService', () => {
  it('arrête le service', async () => {
    const native = fakeNative();
    mockNativeHolder.current = native;

    await stopCallService();

    expect(native.stop).toHaveBeenCalledTimes(1);
  });

  it("ne fait rien quand le module natif n'est pas lié", async () => {
    await expect(stopCallService()).resolves.toBeUndefined();
  });

  it("n'échoue pas quand l'arrêt rejette", async () => {
    // L'arrêt est appelé depuis un raccrochage et depuis un démontage : jeter
    // là laisserait la séance à moitié fermée.
    const native = fakeNative({
      stop: jest.fn(async () => Promise.reject(new Error('refusé'))),
    });
    mockNativeHolder.current = native;

    await expect(stopCallService()).resolves.toBeUndefined();
  });
});
