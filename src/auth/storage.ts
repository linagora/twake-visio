import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

import type { TokenSet } from 'src/auth/oidc';

// expo-secure-store adosse Keychain (iOS) et Keystore (Android). MMKV n'est
// pas chiffré par défaut et ne doit jamais porter de jeton.

const KEY_SAFE = /^[A-Za-z0-9.-]$/;

// Échappement injectif : chaque caractère hors alphabet devient `_XXXX` sur
// quatre hexadécimaux — largeur fixe, donc sans ambiguïté — et `_` lui-même est
// échappé. Un remplacement uniforme par `_` ne l'est pas : `host:8443` et
// `host/8443` produisent alors la même clé, et un compte lit les jetons de
// l'autre sans que rien ne le signale.
function encodeKey(value: string): string {
  let out = '';
  for (const char of value) {
    if (KEY_SAFE.test(char)) {
      out += char;
      continue;
    }
    const code = char.codePointAt(0) ?? 0;
    out += `_${code.toString(16).padStart(4, '0')}`;
  }
  return out;
}

function keyFor(accountId: string): string {
  return `tokens.${encodeKey(accountId)}`;
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
