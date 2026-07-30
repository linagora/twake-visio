import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

import type { TokenSet } from 'src/auth/oidc';

// expo-secure-store adosse Keychain (iOS) et Keystore (Android). MMKV n'est
// pas chiffré par défaut et ne doit jamais porter de jeton.
function keyFor(accountId: string): string {
  return `tokens.${accountId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

export async function saveTokens(accountId: string, tokens: TokenSet): Promise<void> {
  await setItemAsync(keyFor(accountId), JSON.stringify(tokens));
}

export async function loadTokens(accountId: string): Promise<TokenSet | null> {
  const raw = await getItemAsync(keyFor(accountId));
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    return null;
  }
}

export async function clearTokens(accountId: string): Promise<void> {
  await deleteItemAsync(keyFor(accountId));
}
