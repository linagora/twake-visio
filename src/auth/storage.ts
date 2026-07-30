import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

import type { TokenSet } from 'src/auth/oidc';

// expo-secure-store adosse Keychain (iOS) et Keystore (Android). MMKV n'est
// pas chiffré par défaut et ne doit jamais porter de jeton.

const KEY_SAFE = /^[A-Za-z0-9.-]$/;

// Échappement injectif : chaque caractère hors alphabet devient `_XXXXXX` sur
// exactement six hexadécimaux, et `_` lui-même est échappé.
//
// Six, et non quatre : `padStart` impose un plancher, pas un plafond, donc un
// point de code hors du plan de base déborde. Avec quatre, `U+10000` donne
// `_10000` — indistinguable de `U+1000` suivi du chiffre `0`. Le plus grand
// point de code Unicode étant U+10FFFF, six chiffres suffisent toujours et la
// largeur est alors réellement fixe.
//
// Un remplacement uniforme par `_`, lui, n'est injectif pour rien : `host:8443`
// et `host/8443` produisent la même clé, et un compte lit les jetons de l'autre
// sans que rien ne le signale.
function encodeKey(value: string): string {
  let out = '';
  for (const char of value) {
    if (KEY_SAFE.test(char)) {
      out += char;
      continue;
    }
    const code = char.codePointAt(0) ?? 0;
    out += `_${code.toString(16).padStart(6, '0')}`;
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
