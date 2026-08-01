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
    const url = new URL(buildAuthorizeUrl(CONFIG, PKCE, 'st4te', 'n0nce'));

    expect(url.origin + url.pathname).toBe('https://sso.linagora.com/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('twake-visio');
    // HTTPS, et non le schéma personnalisé : Chrome ne dispatche pas d'intention
    // applicative pour une redirection en schéma personnalisé qui répond à un
    // POST de formulaire — donc la PREMIÈRE connexion, celle où l'on saisit son
    // mot de passe, restait bloquée. Établi trois fois par comparaison
    // contrôlée. La valeur est écrite en dur ici plutôt que lue depuis la
    // constante : comparer le code à lui-même ne garderait rien.
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://meet.twake-dev.maudet.cloud/auth/mobile-callback',
    );
    expect(url.searchParams.get('code_challenge')).toBe('chal');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('st4te');
  });

  // Sans lui, LemonLDAP::NG refuse d'émettre le code APRÈS avoir authentifié la
  // personne, et redirige vers `redirect_uri` en portant une erreur. Les deux
  // valeurs sont volontairement distinctes ici : une implémentation qui
  // recopierait `state` dans `nonce` passerait un test qui les confondrait.
  it('porte un nonce, distinct du state', () => {
    const url = new URL(buildAuthorizeUrl(CONFIG, PKCE, 'st4te', 'n0nce'));

    expect(url.searchParams.get('nonce')).toBe('n0nce');
    expect(url.searchParams.get('nonce')).not.toBe(url.searchParams.get('state'));
  });

  it('transmet login_hint quand il est fourni', () => {
    const url = new URL(buildAuthorizeUrl(CONFIG, PKCE, 'st', 'no', 'ada@linagora.com'));
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
