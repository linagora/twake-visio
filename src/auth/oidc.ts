import { OIDC_CALLBACK_PATH, REQUEST_TIMEOUT_MS } from 'src/constants';

// L'URL de retour déclarée au SSO : la page de rebond de l'instance DÉCOUVERTE,
// jamais une constante. C'est ce qui permet à une application publiée sur les
// stores de servir un client dont le domaine n'existait pas à la compilation.
// `serverUrl` arrive déjà normalisée sans barre finale (`discovery.ts:58`).
export function redirectUriFor(config: InstanceConfig): string {
  return `${config.serverUrl}${OIDC_CALLBACK_PATH}`;
}
import type { PkcePair } from 'src/auth/pkce';
import type { InstanceConfig } from 'src/instance/types';

export type TokenSet = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly idToken: string | null;
  readonly expiresAt: number;
};

// `server` existe pour ne pas confondre une panne du SSO avec un refus
// d'autorisation. Sans cette distinction, une indisponibilité de LemonLDAP
// envoie l'utilisateur se reconnecter contre un serveur qui ne peut pas
// l'authentifier.
export type TokenError = 'invalid_grant' | 'server' | 'network' | 'malformed_response';

export type TokenResult = { ok: true; value: TokenSet } | { ok: false; error: TokenError };

type RawTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
};

// `nonce` n'est pas décoratif et n'est pas optionnel en pratique. OpenID Connect
// le fait porter par l'`id_token`, et un fournisseur a le droit d'exiger qu'on
// l'envoie : mesuré sur LemonLDAP::NG, où son absence fait échouer l'émission du
// code APRÈS une authentification réussie, avec
// `{"code":"ISSUER_OIDC_LOGIN_FAILED","reason":"Nonce required"}` au journal du
// portail. Le serveur redirige alors quand même vers `redirect_uri`, mais en
// portant une erreur au lieu d'un code — l'application recevait donc bien son
// lien de retour, et échouait ensuite sans rien pouvoir en dire.
//
// Il est distinct de `state`, qui lie la réponse à la requête du navigateur.
// Les deux sont donc tirés séparément : réutiliser l'un pour l'autre ferait
// d'une seule valeur volée les deux protections à la fois.
//
// Il n'est pas encore VÉRIFIÉ au retour, et c'est une dette assumée, pas un
// oubli : la vérification exige de décoder le corps de l'`id_token`, donc du
// base64url — or ni React Native ni le runtime Expo n'exposent `atob`. Node
// l'expose, lui, donc un décodeur qui s'y fierait passerait tous les tests et
// planterait sur l'appareil. Le correctif est un décodeur écrit à la main, avec
// ses propres tests ; c'est un changement distinct.
export function buildAuthorizeUrl(
  config: InstanceConfig,
  pkce: PkcePair,
  state: string,
  nonce: string,
  loginHint?: string,
): string {
  const url = new URL(`${config.issuer}/oauth2/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', redirectUriFor(config));
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', pkce.method);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
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

  if (!response.ok) {
    return {
      ok: false,
      error: response.status >= 500 ? 'server' : 'invalid_grant',
    };
  }

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
      redirect_uri: redirectUriFor(config),
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
