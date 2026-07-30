import { getRandomBytes } from 'expo-crypto';
import { openAuthSessionAsync } from 'expo-web-browser';

import { fetchMe } from 'src/api/users';
import { addAccount, makeAccountId, setActiveAccount, type Account } from 'src/auth/accounts';
import { buildAuthorizeUrl, exchangeCode } from 'src/auth/oidc';
import { createPkcePair } from 'src/auth/pkce';
import { saveTokens } from 'src/auth/storage';
import { OIDC_REDIRECT_URI } from 'src/constants';
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

function makeState(): string {
  return Array.from(getRandomBytes(16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function signIn(serverUrl: string, loginHint?: string): Promise<LoginResult> {
  const instance = await fetchInstanceConfig(serverUrl);
  if (!instance.ok) return { ok: false, error: instance.error };

  const pkce = await createPkcePair();
  const state = makeState();
  const authorizeUrl = buildAuthorizeUrl(instance.value, pkce, state, loginHint);

  // Navigateur système, jamais une WebView : RFC 8252.
  const session = await openAuthSessionAsync(authorizeUrl, OIDC_REDIRECT_URI);
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
