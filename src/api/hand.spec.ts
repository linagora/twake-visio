import { toggleHand } from 'src/api/hand';
import * as session from 'src/auth/session';

function ok(): Response {
  return { ok: true, status: 200 } as Response;
}

function status(code: number): Response {
  return { ok: false, status: code } as Response;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  jest.restoreAllMocks();
  fetchMock = jest.fn().mockResolvedValue(ok());
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('toggleHand', () => {
  it('poste sur la route du salon visé', async () => {
    await toggleHand('https://meet.linagora.com', 'r-2', 'jwt-1', true);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://meet.linagora.com/api/v1.0/rooms/r-2/toggle-hand/',
    );

    // Un seul salon ne distingue pas une référence transmise d'une route codée
    // en dur qui coïnciderait avec celle-ci.
    await toggleHand('https://autre.example', 'r-9', 'jwt-1', true);

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://autre.example/api/v1.0/rooms/r-9/toggle-hand/',
    );
  });

  it('échappe la référence de salon', async () => {
    await toggleHand('https://meet.linagora.com', 'salon été', 'jwt-1', true);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://meet.linagora.com/api/v1.0/rooms/salon%20%C3%A9t%C3%A9/toggle-hand/',
    );
  });

  it('porte le jeton LiveKit reçu en argument, et lui seul', async () => {
    await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-de-salle', true);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer jwt-de-salle');

    // Un second jeton, distinct : sans lui, un en-tête codé en dur passerait.
    await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-autre', true);

    const second = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((second.headers as Record<string, string>).authorization).toBe('Bearer jwt-autre');
  });

  it('ne rafraîchit jamais la session OIDC', async () => {
    const refresh = jest.spyOn(session, 'forceRefresh');
    const read = jest.spyOn(session, 'getAccessToken');

    await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);
    fetchMock.mockResolvedValue(status(401));
    await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);

    expect(refresh).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    // Et aucun rejeu : deux appels, deux requêtes.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('envoie le booléen demandé, dans les deux sens', async () => {
    await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      raised: true,
    });

    await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', false);
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      raised: false,
    });
  });

  it('rend un succès sans valeur', async () => {
    const result = await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('rend un 401 comme un refus de salle, jamais comme une session expirée', async () => {
    fetchMock.mockResolvedValue(status(401));

    const result = await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
  });

  it('rend un 403 comme un refus de salle', async () => {
    fetchMock.mockResolvedValue(status(403));

    const result = await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
  });

  it('rend un 404 comme une absence de participant', async () => {
    fetchMock.mockResolvedValue(status(404));

    const result = await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);

    expect(result).toEqual({ ok: false, error: { kind: 'not-found' } });
  });

  it('garde le statut des autres refus', async () => {
    fetchMock.mockResolvedValue(status(400));
    expect(await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true)).toEqual({
      ok: false,
      error: { kind: 'server', status: 400 },
    });

    fetchMock.mockResolvedValue(status(500));
    expect(await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true)).toEqual({
      ok: false,
      error: { kind: 'server', status: 500 },
    });
  });

  it('rend une panne réseau comme une valeur, sans lever', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const result = await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);

    expect(result).toEqual({ ok: false, error: { kind: 'network' } });
  });
});
