import { authedFetch } from 'src/api/client';
import * as session from 'src/auth/session';
import type { Account } from 'src/auth/accounts';

const ACCOUNT: Account = {
  id: 'https://sso.linagora.com|u-1',
  instance: {
    serverUrl: 'https://meet.linagora.com',
    issuer: 'https://sso.linagora.com',
    clientId: 'twake-visio',
    livekitUrl: 'https://livekit.linagora.com',
    features: { recording: true, subtitle: true, telephony: false },
  },
  email: 'ada@linagora.com',
  displayName: 'Ada',
};

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('authedFetch', () => {
  it('joint le jeton porteur à la requête', async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue({ ok: true, token: 'at' });
    // Les génériques explicites sont nécessaires : sans paramètres déclarés,
    // noUncheckedIndexedAccess rejette l'accès à calls[0][1] comme hors tuple.
    const spy = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
      async () => new Response(JSON.stringify({ id: 1 }), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await authedFetch<{ id: number }>(ACCOUNT, '/api/v1.0/users/me/');

    expect(result).toEqual({ ok: true, value: { id: 1 } });
    const headers = (spy.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer at');
  });

  it('rafraîchit puis rejoue une seule fois sur 401', async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue({ ok: true, token: 'stale' });
    const refresh = jest
      .spyOn(session, 'forceRefresh')
      .mockResolvedValue({ ok: true, token: 'fresh' });
    const spy = jest
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 2 }), { status: 200 }));
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await authedFetch<{ id: number }>(ACCOUNT, '/api/v1.0/users/me/');

    expect(result).toEqual({ ok: true, value: { id: 2 } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('ne rejoue qu\'une seule fois, même si le 401 persiste', async () => {
    // Sans borne, un 401 persistant accompagné d'un rafraîchissement qui
    // réussit boucle indéfiniment et martèle le SSO. Aucun autre test ne
    // distingue « rejoue une fois » de « rejoue sans fin » : chacun résout au
    // second appel ou échoue au rafraîchissement du premier. C'est
    // toHaveBeenCalledTimes(2) qui borne, et rien d'autre.
    jest.spyOn(session, 'getAccessToken').mockResolvedValue({ ok: true, token: 'stale' });
    jest.spyOn(session, 'forceRefresh').mockResolvedValue({ ok: true, token: 'fresh' });
    const spy = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
      async () => new Response(null, { status: 401 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await authedFetch(ACCOUNT, '/api/v1.0/users/me/');

    expect(result).toEqual({ ok: false, error: { kind: 'unauthorized' } });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('rend unauthorized quand le rafraîchissement échoue', async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue({ ok: true, token: 'stale' });
    jest
      .spyOn(session, 'forceRefresh')
      .mockResolvedValue({ ok: false, reason: 'refused' });
    globalThis.fetch = jest.fn(
      async () => new Response(null, { status: 401 }),
    ) as unknown as typeof fetch;

    const result = await authedFetch(ACCOUNT, '/api/v1.0/users/me/');

    expect(result).toEqual({ ok: false, error: { kind: 'unauthorized' } });
  });

  it('dit « réseau » et non « session expirée » quand le SSO est indisponible', async () => {
    // Même panne, deux messages possibles selon l'endroit où elle frappe. Si le
    // rafraîchissement échoue parce que le SSO est tombé, envoyer l'utilisateur
    // se reconnecter est inutile : le serveur ne peut pas l'authentifier.
    jest
      .spyOn(session, 'getAccessToken')
      .mockResolvedValue({ ok: true, token: 'stale' });
    jest
      .spyOn(session, 'forceRefresh')
      .mockResolvedValue({ ok: false, reason: 'unavailable' });
    globalThis.fetch = jest.fn(
      async () => new Response(null, { status: 401 }),
    ) as unknown as typeof fetch;

    const result = await authedFetch(ACCOUNT, '/api/v1.0/users/me/');

    expect(result).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('mappe 403 sur forbidden', async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue({ ok: true, token: 'at' });
    globalThis.fetch = jest.fn(
      async () => new Response(null, { status: 403 }),
    ) as unknown as typeof fetch;

    const result = await authedFetch(ACCOUNT, '/api/v1.0/rooms/x/');

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
  });

  it('mappe une panne réseau sur network', async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue({ ok: true, token: 'at' });
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;

    const result = await authedFetch(ACCOUNT, '/api/v1.0/users/me/');

    expect(result).toEqual({ ok: false, error: { kind: 'network' } });
  });
});
