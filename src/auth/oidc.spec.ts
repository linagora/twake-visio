import { buildAuthorizeUrl, exchangeCode, refreshTokens } from 'src/auth/oidc';
import type { InstanceConfig } from 'src/instance/types';

const CONFIG: InstanceConfig = {
  serverUrl: 'https://meet.linagora.com',
  issuer: 'https://sso.linagora.com',
  clientId: 'twake-visio',
  livekitUrl: 'https://livekit.linagora.com',
  features: { recording: true, subtitle: true, telephony: false },
};

const PKCE = { verifier: 'v'.repeat(64), challenge: 'chal', method: 'S256' } as const;

describe('buildAuthorizeUrl', () => {
  it('assemble les paramètres du flux Authorization Code + PKCE', () => {
    const url = new URL(buildAuthorizeUrl(CONFIG, PKCE, 'st4te'));

    expect(url.origin + url.pathname).toBe('https://sso.linagora.com/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('twake-visio');
    expect(url.searchParams.get('redirect_uri')).toBe('twakevisio://callback');
    expect(url.searchParams.get('code_challenge')).toBe('chal');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('st4te');
  });

  it('transmet login_hint quand il est fourni', () => {
    const url = new URL(buildAuthorizeUrl(CONFIG, PKCE, 'st', 'ada@linagora.com'));
    expect(url.searchParams.get('login_hint')).toBe('ada@linagora.com');
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
