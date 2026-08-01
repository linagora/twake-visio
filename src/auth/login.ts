import { getRandomBytes } from 'expo-crypto';
import { openAuthSessionAsync } from 'expo-web-browser';

import { fetchMe } from 'src/api/users';
import {
  addAccount,
  getActiveAccount,
  makeAccountId,
  removeAccount,
  setActiveAccount,
  type Account,
} from 'src/auth/accounts';
import { buildAuthorizeUrl, exchangeCode } from 'src/auth/oidc';
import { createPkcePair } from 'src/auth/pkce';
import { clearTokens, saveTokens } from 'src/auth/storage';
import { OIDC_RETURN_URL } from 'src/constants';
import { fetchInstanceConfig } from 'src/instance/discovery';

export type LoginError =
  | 'unreachable'
  | 'not-a-meet-instance'
  | 'oidc-undiscoverable'
  | 'cancelled'
  | 'state-mismatch'
  | 'token-exchange-failed'
  | 'profile-unavailable';

export type LoginResult = { ok: true; value: Account } | { ok: false; error: LoginError };

// Seize octets tirés du générateur de la plateforme, rendus en hexadécimal.
// Sert au `state` comme au `nonce`, qui ont la même exigence — être
// imprévisible — mais jamais la même valeur : voir `buildAuthorizeUrl`.
function randomHex(): string {
  return Array.from(getRandomBytes(16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Oublie le compte actif : ses jetons quittent le trousseau, son entrée quitte
// le registre. Si un autre compte reste connu, `removeAccount` l'active — c'est
// ce qui rend le basculement possible sans repasser par le SSO.
//
// Ne déconnecte QUE l'application. La session du SSO vit dans le navigateur
// système, hors d'atteinte : se reconnecter juste après ne redemandera pas le
// mot de passe, et c'est le comportement attendu d'un SSO. Prétendre le
// contraire demanderait de rouvrir le navigateur sur l'URL de déconnexion du
// fournisseur, ce qui n'est pas ce que demande un bouton nommé « se
// déconnecter » dans une application.
export async function signOut(): Promise<void> {
  const account = getActiveAccount();
  if (account === null) return;
  // Le retrait du registre prime sur l'effacement du trousseau, d'où le
  // `finally` : si l'effacement échoue et qu'on laisse le compte actif, le
  // bouton devient inopérant et la personne reste connectée après avoir demandé
  // le contraire. Des jetons orphelins, eux, n'ouvrent rien — plus aucun compte
  // ne porte l'identifiant qui les indexe.
  try {
    await clearTokens(account.id);
  } finally {
    removeAccount(account.id);
  }
}

export async function signIn(serverUrl: string, loginHint?: string): Promise<LoginResult> {
  const instance = await fetchInstanceConfig(serverUrl);
  if (!instance.ok) return { ok: false, error: instance.error };

  const pkce = await createPkcePair();
  const state = randomHex();
  const nonce = randomHex();
  const authorizeUrl = buildAuthorizeUrl(instance.value, pkce, state, nonce, loginHint);

  // Navigateur système, jamais une WebView : RFC 8252.
  const session = await openAuthSessionAsync(authorizeUrl, OIDC_RETURN_URL);
  if (session.type !== 'success') return { ok: false, error: 'cancelled' };

  const returned = new URL(session.url);
  if (returned.searchParams.get('state') !== state) {
    return { ok: false, error: 'state-mismatch' };
  }

  const code = returned.searchParams.get('code');
  if (code === null) return { ok: false, error: 'token-exchange-failed' };

  const tokens = await exchangeCode(instance.value, code, pkce.verifier);
  if (!tokens.ok) return { ok: false, error: 'token-exchange-failed' };

  const provisional: Account = {
    id: makeAccountId(instance.value.issuer, 'pending'),
    instance: instance.value,
    email: '',
    displayName: '',
  };
  await saveTokens(provisional.id, tokens.value);

  const me = await fetchMe(provisional);
  if (!me.ok) return { ok: false, error: 'profile-unavailable' };

  const account: Account = {
    id: makeAccountId(instance.value.issuer, me.value.id),
    instance: instance.value,
    email: me.value.email,
    displayName: me.value.displayName,
  };
  await saveTokens(account.id, tokens.value);

  // addAccount enregistre sans activer, pour qu'un rafraîchissement en arrière-plan
  // ne vole pas le compte actif. Une connexion explicite, elle, doit bien basculer.
  const registered = addAccount(account);
  setActiveAccount(registered.id);

  return { ok: true, value: registered };
}
