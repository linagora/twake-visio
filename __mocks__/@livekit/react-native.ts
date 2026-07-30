/**
 * Manual Jest mock for `@livekit/react-native`.
 *
 * `src/call/connection.ts` calls `registerGlobals()` at module load, so every
 * spec that imports it pulls this package in. The real one reaches for
 * `@livekit/react-native-webrtc`, a native module that does not exist under
 * Jest: without this stub the whole call suite fails to load.
 *
 * Placed adjacent to `node_modules`, so Jest substitutes it automatically for
 * every spec — no `jest.mock('@livekit/react-native')` call needed. Same
 * mechanism as `__mocks__/expo-crypto.ts`.
 *
 * `registerGlobals` is a `jest.fn()` on purpose rather than a no-op: it is the
 * only way for a test to assert that the WebRTC globals are installed before a
 * `Room` is ever constructed. `src/call/connection.spec.ts` does exactly that.
 */
export const registerGlobals = jest.fn();
