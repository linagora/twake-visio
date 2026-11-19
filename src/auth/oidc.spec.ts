import { buildAuthorizeUrl, exchangeCode, refreshTokens } from 'src/auth/oidc';
import type { InstanceConfig } from 'src/instance/types';

const CONFIG: InstanceConfig = {
  serverUrl: 'https://meet.linagora.com',
  issuer: 'https://sso.linagora.com',
  clientId: 'twake-visio',
  livekitUrl: 'https://livekit.linagora.com',
  features: { recording: true, subtitle: true, telephony: false, calendar: false },
};

const PKCE = { verifier: 'v'.repeat(64), challenge: 'chal', method: 'S256' } as const;

describe('buildAuthorizeUrl', () => {
  it('assemble les paramètres du flux Authorization Code + PKCE', () => {
    const url = new URL(buildAuthorizeUrl(CONFIG, PKCE, 'st4te', 'n0nce'));

    expect(url.origin + url.pathname).toBe('https://sso.linagora.com/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('twake-visio');
    expect(url.searchParams.get('redirect_uri')).toBe('twakevisio://callback');

    expect(url.searchParams.get('nonce')).toBe('n0nce');
    expect(url.searchParams.get('nonce')).not.toBe(url.searchParams.get('state'));
  });

  it('transmet login_hint quand il est fourni', () => {
    const url = new URL(buildAuthorizeUrl(CONFIG, PKCE, 'st', 'no', 'ada@linagora.com'));
    expect(url.searchParams.get('login_hint')).toBe('ada@linagora.com');
  });

  // `offline_access` est ce qui donne au jeton de rafraîchissement une vie
  // INDÉPENDANTE de la session du portail. Sans lui, mesuré sur l'instance de
  // développement le 2026-08-03, le jeton meurt avec la session — « Unable to
  // find OIDC session » — et l'application redemande un mot de passe alors
  // qu'aucun téléphone ne devrait l'exiger chaque jour.
  //
  // C'est une portée que le SERVEUR doit aussi autoriser : LemonLDAP ignore la
  // demande à moins que `oidcRPMetaDataOptionsAllowOffline` ne soit posé sur le
  // client, et que le consentement soit contourné ou demandé
  // (`Issuer/OpenIDConnect.pm:885-912`). Les deux moitiés ont été livrées
  // ensemble ; l'une sans l'autre ne fait rien.
  it("demande l'accès hors ligne, sans perdre les portées de base", () => {
    const scope = new URL(buildAuthorizeUrl(CONFIG, PKCE, 'st', 'no')).searchParams.get('scope');

    // Découpé plutôt que comparé à une chaîne : l'ordre des portées n'a aucune
    // signification, et le figer ferait rougir un ajout parfaitement valide.
    expect(scope?.split(' ')).toEqual(
      expect.arrayContaining(['openid', 'email', 'profile', 'offline_access']),
    );
  });
});

describe('exchangeCode', () => {
  it("n'envoie aucun client_secret", async () => {
    const spy = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
            id_token: 'it',
          }),
          { status: 200 },
        ),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await exchangeCode(CONFIG, 'the-code', PKCE.verifier);

    expect(result.ok).toBe(true);
    const body = String((spy.mock.calls[0]?.[1] as RequestInit).body);
    expect(body).toContain('code_verifier=');
    expect(body).not.toContain('client_secret');
    expect(new URLSearchParams(body).get('redirect_uri')).toBe('twakevisio://callback');
  });

  it('renvoie une erreur typée sur refus du serveur', async () => {
    globalThis.fetch = jest.fn(
      async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
    ) as unknown as typeof fetch;

    const result = await exchangeCode(CONFIG, 'bad', PKCE.verifier);

    expect(result).toEqual({ ok: false, error: 'invalid_grant' });
  });
});

describe('refreshTokens', () => {
  it("conserve l'ancien refresh_token quand le serveur n'en renvoie pas", async () => {
    globalThis.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ access_token: 'at2', expires_in: 3600 }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;

    const result = await refreshTokens(CONFIG, 'old-rt');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.refreshToken).toBe('old-rt');
  });

  it('adopte le nouveau refresh_token en cas de rotation', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({ access_token: 'at2', refresh_token: 'new-rt', expires_in: 3600 }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    const result = await refreshTokens(CONFIG, 'old-rt');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.refreshToken).toBe('new-rt');
  });
});
