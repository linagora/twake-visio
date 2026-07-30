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

// Exporté séparément pour être testable contre le vecteur officiel de la
// RFC 7636 annexe B. Sans un verifier imposé de l'extérieur, aucun test ne peut
// distinguer un digest correct d'un digest calculé sur la mauvaise entrée.
export async function computeChallenge(verifier: string): Promise<string> {
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: CryptoEncoding.BASE64,
  });
  return toBase64Url(digest);
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = toUnreservedString(getRandomBytes(VERIFIER_BYTES));
  return { verifier, challenge: await computeChallenge(verifier), method: 'S256' };
}
