import { createRoom, fetchRoomAccess } from 'src/api/rooms';
import * as client from 'src/api/client';
import type { Account } from 'src/auth/accounts';

const ACCOUNT = {
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
} as Account;

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('fetchRoomAccess', () => {
  it('extrait l\'URL et le jeton LiveKit', async () => {
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'r-1',
        slug: 'reunion',
        access_level: 'trusted',
        livekit: { url: 'https://livekit.linagora.com', room: 'r-1', token: 'lk-token' },
      },
    });

    const result = await fetchRoomAccess(ACCOUNT, 'reunion');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.livekitUrl).toBe('https://livekit.linagora.com');
    expect(result.value.token).toBe('lk-token');
    expect(result.value.room.slug).toBe('reunion');
  });

  it('signale la salle d\'attente quand le bloc livekit est absent', async () => {
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'r-1', slug: 'reunion', access_level: 'restricted' },
    });

    const result = await fetchRoomAccess(ACCOUNT, 'reunion');

    expect(result).toEqual({ ok: false, error: { kind: 'lobby', participantId: '' } });
  });
});

describe('createRoom', () => {
  it('transmet le nom et le niveau d\'accès choisis', async () => {
    // spyOn conserve la signature d'authedFetch, donc calls[0][2] est typé
    // sans générique supplémentaire, contrairement à un jest.fn() nu.
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'r-2', slug: 'point-hebdo', access_level: 'public' },
    });

    await createRoom(ACCOUNT, { name: 'Point hebdo', accessLevel: 'public' });

    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Point hebdo',
      access_level: 'public',
    });
  });
});
