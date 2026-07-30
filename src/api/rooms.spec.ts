import { createRoom, fetchMyRooms, fetchRoomAccess } from 'src/api/rooms';
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
  it("extrait l'URL et le jeton LiveKit", async () => {
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

  it("signale la salle d'attente quand le bloc livekit est absent", async () => {
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'r-1', slug: 'reunion', access_level: 'restricted' },
    });

    const result = await fetchRoomAccess(ACCOUNT, 'reunion');

    expect(result).toEqual({ ok: false, error: { kind: 'lobby', participantId: '' } });
  });
});

describe('createRoom', () => {
  it("transmet le nom et le niveau d'accès choisis", async () => {
    // spyOn conserve la signature d'authedFetch, donc calls[0][2] est typé
    // sans générique supplémentaire, contrairement à un jest.fn() nu.
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'r-2', slug: 'point-hebdo', access_level: 'public' },
    });

    await createRoom(ACCOUNT, { name: 'Point hebdo', accessLevel: 'public' });

    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.name).toBe('Point hebdo');
    expect(body.access_level).toBe('public');
  });

  it('envoie un code que le client web sait router', async () => {
    // Sans ce code, le serveur dérive le slug du nom : « Test mobile » devenait
    // « test-mobile », que le routeur web refuse. Le salon existait mais
    // n'était joignable ni par lien ni depuis un navigateur.
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'r-2', slug: 'abc-defg-hij', access_level: 'public' },
    });

    await createRoom(ACCOUNT, { name: 'Test mobile', accessLevel: 'public' });

    const init = spy.mock.calls[0]?.[2] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.slug).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
  });

  it('tire un code différent à chaque création', async () => {
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'r-2', slug: 'abc-defg-hij', access_level: 'public' },
    });

    await createRoom(ACCOUNT, { name: 'Un', accessLevel: 'public' });
    await createRoom(ACCOUNT, { name: 'Deux', accessLevel: 'public' });

    // Un code constant ferait échouer la seconde création sur le refus
    // « Room with this Slug already exists », que l'utilisateur ne pourrait
    // pas résoudre en changeant le nom.
    const slugs = spy.mock.calls.map((call) => {
      const body = JSON.parse(String((call[2] as RequestInit).body)) as Record<string, unknown>;
      return body.slug;
    });
    expect(slugs[0]).not.toBe(slugs[1]);
  });
});

describe('fetchMyRooms, pagination', () => {
  const page = (slugs: readonly string[], next: string | null): unknown => ({
    results: slugs.map((slug) => ({ id: 'r-' + slug, slug, access_level: 'public' })),
    next,
  });

  it('suit les pages suivantes au lieu de ne lire que la première', async () => {
    // Le défaut constaté sur appareil : l'API rend les salons par ordre
    // alphabétique de slug, donc s'arrêter à la première page ne montrait que le
    // début de l'alphabet. Un salon « test-mobile » n'apparaissait jamais.
    const fetchSpy = jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValueOnce({
        ok: true,
        value: page(['aet-jgqg-fpa'], 'https://meet.linagora.com/api/v1.0/rooms/?page=2'),
      })
      .mockResolvedValueOnce({ ok: true, value: page(['test-mobile'], null) });

    const result = await fetchMyRooms(ACCOUNT);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((r) => r.slug)).toEqual(['aet-jgqg-fpa', 'test-mobile']);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]?.[1]).toBe('/api/v1.0/rooms/?page=2');
  });

  it('ne suit pas un next qui pointe sur une autre origine', async () => {
    // La requête part avec le jeton porteur : suivre une origine étrangère
    // l'enverrait à un tiers.
    const fetchSpy = jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: page(['a'], 'https://ailleurs.example/api/v1.0/rooms/'),
    });

    const result = await fetchMyRooms(ACCOUNT);

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("remonte l'erreur quand la première page échoue", async () => {
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: false, error: { kind: 'unauthorized' } });

    const result = await fetchMyRooms(ACCOUNT);

    expect(result).toEqual({ ok: false, error: { kind: 'unauthorized' } });
  });

  it('rend les pages déjà lues quand une page suivante échoue', async () => {
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValueOnce({
        ok: true,
        value: page(['a'], 'https://meet.linagora.com/api/v1.0/rooms/?page=2'),
      })
      .mockResolvedValueOnce({ ok: false, error: { kind: 'network' } });

    const result = await fetchMyRooms(ACCOUNT);

    // Une liste courte vaut mieux qu'une liste vide, à condition de ne pas se
    // présenter comme complète : la troncature part dans les traces.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((r) => r.slug)).toEqual(['a']);
  });

  it('borne le nombre de pages suivies', async () => {
    // Sans plafond, un compte aux milliers de salons ferait enchaîner les
    // requêtes indéfiniment au montage de l'accueil.
    const fetchSpy = jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: page(['x'], 'https://meet.linagora.com/api/v1.0/rooms/?page=99'),
    });

    await fetchMyRooms(ACCOUNT);

    expect(fetchSpy).toHaveBeenCalledTimes(20);
  });
});
