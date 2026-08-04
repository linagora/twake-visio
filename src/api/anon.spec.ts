import { anonFetch } from 'src/api/anon';

function mockFetch(response: Response): jest.Mock<Promise<Response>, Parameters<typeof fetch>> {
  const spy = jest.fn<Promise<Response>, Parameters<typeof fetch>>(async () => response);
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
}

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('anonFetch', () => {
  it("n'envoie AUCUN en-tête d'autorisation", async () => {
    const spy = mockFetch(new Response(JSON.stringify({ id: 1 }), { status: 200 }));

    await anonFetch('https://meet.acme.com', '/api/v1.0/rooms/abc/');

    const headers = (spy.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    expect(headers.accept).toBe('application/json');
  });

  it("compose l'URL depuis le serveur et le chemin", async () => {
    const spy = mockFetch(new Response('{}', { status: 200 }));

    await anonFetch('https://meet.acme.com', '/api/v1.0/rooms/abc/?username=Ada');

    expect(spy.mock.calls[0]?.[0]).toBe('https://meet.acme.com/api/v1.0/rooms/abc/?username=Ada');
  });

  it('rend la valeur analysée sur 200', async () => {
    mockFetch(new Response(JSON.stringify({ slug: 'abc' }), { status: 200 }));

    expect(await anonFetch<{ slug: string }>('https://m', '/p')).toEqual({
      ok: true,
      value: { slug: 'abc' },
    });
  });

  it('traduit un 404 en not-found, comme le chemin authentifié', async () => {
    mockFetch(new Response('{"detail":"No Room matches the given query."}', { status: 404 }));

    expect(await anonFetch('https://m', '/p')).toEqual({
      ok: false,
      error: { kind: 'not-found' },
    });
  });

  it('traduit un 401 en unauthorized SANS rejouer la requête', async () => {
    const spy = mockFetch(new Response('{}', { status: 401 }));

    const result = await anonFetch('https://m', '/p');

    expect(result).toEqual({ ok: false, error: { kind: 'unauthorized' } });
    // UN seul appel : il n'y a aucun jeton à rafraîchir, et rejouer à
    // l'identique ne ferait que doubler la requête.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('traduit un rejet réseau en network', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    expect(await anonFetch('https://m', '/p')).toEqual({ ok: false, error: { kind: 'network' } });
  });
});
