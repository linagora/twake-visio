import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';

export type PkcePair = {
  readonly verifier: string;
  readonly challenge: string;
  readonly method: 'S256';
};

const VERIFIER_BYTES = 64;

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toUnreservedString(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let out = '';
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = toUnreservedString(getRandomBytes(VERIFIER_BYTES));
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: CryptoEncoding.BASE64,
  });
  return { verifier, challenge: toBase64Url(digest), method: 'S256' };
}
