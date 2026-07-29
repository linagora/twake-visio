/**
 * Manual Jest mock for `expo-crypto`.
 *
 * jest-expo auto-generates a native-module stub for every Expo module at
 * `<package>/mocks/<NativeModuleName>.ts`. Expo's own stub for this package
 * (`expo-crypto/mocks/ExpoCrypto.ts`) is an unfinished placeholder — its own
 * header says "TODO: Replace with mock" — and it unconditionally resolves
 * `digestStringAsync` to `''` and `getRandomValues` to `null`. `getRandomBytes`
 * still produces real bytes under Jest because `expo-crypto`'s own `Crypto.ts`
 * falls back to `Math.random` in `__DEV__`, but nothing backs
 * `digestStringAsync`: a real digest (e.g. a PKCE `code_challenge`) silently
 * comes back as an empty string instead of failing loudly at the cause.
 *
 * This file replaces the whole package under test with a minimal, real
 * implementation backed by Node's `crypto` module, covering only the surface
 * this codebase currently uses. Extend it if a later test needs more of the
 * real `expo-crypto` API.
 */
/// <reference types="node" />
import { createHash, randomBytes } from 'node:crypto';

// The project's tsconfig sets `types: ["jest"]`, which excludes `@types/node`
// from automatic inclusion; the triple-slash reference above opts this file
// back in without widening that setting project-wide.

export const CryptoDigestAlgorithm = {
  SHA1: 'SHA-1',
  SHA256: 'SHA-256',
  SHA384: 'SHA-384',
  SHA512: 'SHA-512',
} as const;

// Named distinctly from the `CryptoDigestAlgorithm` const (rather than reusing
// its name the way an enum's type and namespace share one identifier) so this
// doesn't trip `@typescript-eslint/no-redeclare`.
type DigestAlgorithm = (typeof CryptoDigestAlgorithm)[keyof typeof CryptoDigestAlgorithm];

export const CryptoEncoding = {
  HEX: 'hex',
  BASE64: 'base64',
} as const;

type DigestEncoding = (typeof CryptoEncoding)[keyof typeof CryptoEncoding];

export type CryptoDigestOptions = {
  readonly encoding: DigestEncoding;
};

const NODE_ALGORITHM_BY_DIGEST_ALGORITHM: Readonly<Record<DigestAlgorithm, string>> = {
  [CryptoDigestAlgorithm.SHA1]: 'sha1',
  [CryptoDigestAlgorithm.SHA256]: 'sha256',
  [CryptoDigestAlgorithm.SHA384]: 'sha384',
  [CryptoDigestAlgorithm.SHA512]: 'sha512',
};

export function getRandomBytes(byteCount: number): Uint8Array {
  return new Uint8Array(randomBytes(byteCount));
}

export async function digestStringAsync(
  algorithm: DigestAlgorithm,
  data: string,
  options: CryptoDigestOptions = { encoding: CryptoEncoding.HEX }
): Promise<string> {
  const nodeAlgorithm = NODE_ALGORITHM_BY_DIGEST_ALGORITHM[algorithm];
  return createHash(nodeAlgorithm).update(data, 'utf8').digest(options.encoding);
}
