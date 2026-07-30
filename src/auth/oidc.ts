import { OIDC_REDIRECT_URI, REQUEST_TIMEOUT_MS } from 'src/constants';
import type { PkcePair } from 'src/auth/pkce';
import type { InstanceConfig } from 'src/instance/types';

export type TokenSet = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly idToken: string | null;
  readonly expiresAt: number;
};

export type TokenError = 'invalid_grant' | 'network' | 'malformed_response';

export type TokenResult = { ok: true; value: TokenSet } | { ok: false; error: TokenError };

type RawTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
};

export function buildAuthorizeUrl(
  config: InstanceConfig,
  pkce: PkcePair,
  state: string,
  loginHint?: string,
): string {
  const url = new URL(`${config.issuer}/oauth2/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', OIDC_REDIRECT_URI);
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', pkce.method);
  url.searchParams.set('state', state);
  if (loginHint !== undefined) url.searchParams.set('login_hint', loginHint);
  return url.toString();
}

// Client public : aucun client_secret n'est transmis, l'authentification du
// client repose entièrement sur PKCE.
async function postToken(
  config: InstanceConfig,
  params: Record<string, string>,
  previousRefreshToken: string | null,
): Promise<TokenResult> {
  let response: Response;
  try {
    response = await fetch(`${config.issuer}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, ...params }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: 'network' };
  }

  if (!response.ok) return { ok: false, error: 'invalid_grant' };

  let raw: RawTokenResponse;
  try {
    raw = (await response.json()) as RawTokenResponse;
  } catch {
    return { ok: false, error: 'malformed_response' };
  }

  if (raw.access_token === undefined || raw.expires_in === undefined) {
    return { ok: false, error: 'malformed_response' };
  }

  return {
    ok: true,
    value: {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token ?? previousRefreshToken,
      idToken: raw.id_token ?? null,
      expiresAt: Date.now() + raw.expires_in * 1000,
    },
  };
}

export async function exchangeCode(
  config: InstanceConfig,
  code: string,
  verifier: string,
): Promise<TokenResult> {
  return postToken(
    config,
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: OIDC_REDIRECT_URI,
      code_verifier: verifier,
    },
    null,
  );
}

export async function refreshTokens(
  config: InstanceConfig,
  refreshToken: string,
): Promise<TokenResult> {
  return postToken(
    config,
    { grant_type: 'refresh_token', refresh_token: refreshToken },
    refreshToken,
  );
}
