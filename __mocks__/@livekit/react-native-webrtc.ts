/**
 * Double manuel de `@livekit/react-native-webrtc`.
 *
 * L'index du vrai paquet construit un `NativeEventEmitter` au chargement du
 * module (`AudioDeviceModuleEvents.ts` → `EventEmitter.ts`), sur un module
 * natif qui n'existe pas sous Jest. L'import jette donc avant même qu'une
 * fonction ne soit appelée, et il jette pour toute suite qui importe
 * `src/call/media.ts` — soit `media.spec.ts`, `call.spec.tsx` et
 * `prejoin.spec.tsx`, sur un message qui ne nomme ni caméra ni périphérique.
 *
 * Placé à côté de `node_modules`, Jest le substitue automatiquement partout,
 * sans `jest.mock(...)` — même mécanisme que `__mocks__/@livekit/react-native.ts`.
 *
 * `enumerateDevices` est un `jest.fn()` rendant `Promise<unknown>`, la
 * signature réelle : le vrai passe-plat ne type pas son résultat, et c'est ce
 * qui justifie le module de parsing de `src/call/devices.ts`.
 */
export const mediaDevices = {
  enumerateDevices: jest.fn(async (): Promise<unknown> => []),
};
