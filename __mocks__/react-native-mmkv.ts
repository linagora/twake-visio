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

export function createMMKV(): FakeMMKV {
  return new FakeMMKV();
}
