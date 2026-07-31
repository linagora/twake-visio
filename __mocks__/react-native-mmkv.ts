/**
 * Manual Jest mock for `react-native-mmkv`.
 *
 * The real one is a native module that does not exist under Jest: any spec that
 * imports `src/rooms/titles` would fail to load without this stub.
 *
 * Backed by a plain Map rather than a set of `jest.fn()` returning `undefined`.
 * A stub that forgets everything would let a broken store pass every test —
 * `rememberRoomTitle` then `findRoomTitle` has to actually round-trip, which is
 * the only property worth guarding here.
 *
 * Placed adjacent to `node_modules`, so Jest substitutes it automatically.
 * Same mechanism as `__mocks__/expo-crypto.ts`.
 */
class FakeMMKV {
  private readonly entries = new Map<string, string>();

  set(key: string, value: string): void {
    this.entries.set(key, value);
  }

  getString(key: string): string | undefined {
    return this.entries.get(key);
  }

  remove(key: string): boolean {
    return this.entries.delete(key);
  }
}

/**
 * Keyed by store id, and the registry is hung off `globalThis` on purpose.
 *
 * The real MMKV lives on disk: two `createMMKV({id: 'x'})` calls see the same
 * data, and that data outlives the process. A stub returning a fresh Map each
 * call models neither, so it cannot express the one property that matters for
 * `src/auth/accounts` — that an account survives a cold start.
 *
 * `jest.resetModules()` clears module state, which is exactly what a spec uses
 * to replay module load. A registry held in module scope would be wiped along
 * with it, and the reloaded module would find an empty store — proving nothing.
 * `globalThis` is this fake's disk.
 */
declare global {
  var fakeMmkvStores: Map<string, FakeMMKV> | undefined;
}

export function createMMKV(options?: { id?: string }): FakeMMKV {
  const stores = globalThis.fakeMmkvStores ?? new Map<string, FakeMMKV>();
  globalThis.fakeMmkvStores = stores;
  const id = options?.id ?? 'default';
  const existing = stores.get(id);
  if (existing !== undefined) return existing;
  const created = new FakeMMKV();
  stores.set(id, created);
  return created;
}
