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
/**
 * Signatures copied from the real module rather than guessed:
 * `node_modules/react-native-mmkv/lib/specs/MMKV.nitro.d.ts:45-62` declares
 * `set(key, boolean | string | number | ArrayBuffer)` and one typed getter per
 * kind, each returning `undefined` when the key is absent.
 *
 * Only the three kinds this app stores are modelled. A getter that returned the
 * wrong kind — `getBoolean` handing back the string `"false"`, which is truthy —
 * would be worse than none at all, so each one checks the stored type and
 * returns `undefined` on a mismatch, exactly as a typed native store does.
 */
type Stored = boolean | string | number;

class FakeMMKV {
  private readonly entries = new Map<string, Stored>();

  set(key: string, value: Stored): void {
    this.entries.set(key, value);
  }

  getString(key: string): string | undefined {
    const value = this.entries.get(key);
    return typeof value === 'string' ? value : undefined;
  }

  getBoolean(key: string): boolean | undefined {
    const value = this.entries.get(key);
    return typeof value === 'boolean' ? value : undefined;
  }

  getNumber(key: string): number | undefined {
    const value = this.entries.get(key);
    return typeof value === 'number' ? value : undefined;
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
