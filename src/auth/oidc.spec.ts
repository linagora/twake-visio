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
    // Dérivée de l'INSTANCE découverte, jamais écrite en dur : c'est ce qui
    // permet à l'application publiée sur les stores de servir un client dont
    // personne ne connaissait le domaine à la compilation.
    //
    // Et c'est une URL HTTPS, pas le schéma de l'application : Chrome ne
    // dispatche pas d'intention pour une redirection en schéma personnalisé qui
    // répond à un POST de formulaire, donc la première connexion — celle où
    // l'on saisit son mot de passe — restait bloquée. La page servie par
    // l'instance termine la chaîne du POST et rebondit ensuite vers le schéma.
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://meet.linagora.com/auth/mobile-callback',
    );

    expect(url.searchParams.get('nonce')).toBe('n0nce');
    expect(url.searchParams.get('nonce')).not.toBe(url.searchParams.get('state'));
  });

  // La MÊME fonction, une AUTRE instance. Sans ce second cas, l'assertion
  // ci-dessus passerait contre une URL écrite en dur — et c'est précisément ce
  // qu'il ne faut pas, puisque l'application publiée doit servir des clients
  // dont le domaine n'existait pas à la compilation.
  it('dérive l’URL de retour de l’instance découverte, jamais d’une constante', () => {
    const autre = { ...CONFIG, serverUrl: 'https://visio.une-autre-mairie.fr' };

    const url = new URL(buildAuthorizeUrl(autre, PKCE, 'st', 'no'));

    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://visio.une-autre-mairie.fr/auth/mobile-callback',
    );
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
