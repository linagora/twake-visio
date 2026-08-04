import { createRoom, fetchMyRooms, fetchRoomAccess, requestEntry } from 'src/api/rooms';
import * as anon from 'src/api/anon';
import * as client from 'src/api/client';
import type { Account } from 'src/auth/accounts';
import type { Visitor } from 'src/auth/visitor';

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

const AS_ACCOUNT: Visitor = { kind: 'account', account: ACCOUNT };
const AS_GUEST: Visitor = {
  kind: 'guest',
  serverUrl: 'https://meet.acme.com',
  displayName: 'Camille Dupont',
};

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

    const result = await fetchRoomAccess(AS_ACCOUNT, 'reunion');

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

    const result = await fetchRoomAccess(AS_ACCOUNT, 'reunion');

    expect(result).toEqual({ ok: false, error: { kind: 'lobby', participantId: '' } });
  });
});

describe('fetchRoomAccess, en invité', () => {
  it('passe par anonFetch, jamais par le chemin authentifié', async () => {
    const anonSpy = jest.spyOn(anon, 'anonFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'r-1',
        slug: 'abc-defg-hij',
        access_level: 'public',
        livekit: { url: 'https://lk', room: 'r-1', token: 'tok' },
      },
    });
    const authedSpy = jest.spyOn(client, 'authedFetch');

    await fetchRoomAccess(AS_GUEST, 'abc-defg-hij');

    expect(authedSpy).not.toHaveBeenCalled();
    expect(anonSpy.mock.calls[0]?.[0]).toBe('https://meet.acme.com');
  });

  // Mesuré le 2026-08-04 : sans ce paramètre le jeton porte "Anonymous".
  it('porte le nom en paramètre de requête, encodé', async () => {
    const anonSpy = jest.spyOn(anon, 'anonFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'r-1',
        slug: 'abc',
        access_level: 'public',
        livekit: { url: 'https://lk', room: 'r-1', token: 'tok' },
      },
    });

    await fetchRoomAccess(AS_GUEST, 'abc');

    expect(anonSpy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/abc/?username=Camille%20Dupont');
  });

  it("n'ajoute AUCUN paramètre quand le nom est vide", async () => {
    const anonSpy = jest.spyOn(anon, 'anonFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'r-1',
        slug: 'abc',
        access_level: 'public',
        livekit: { url: 'https://lk', room: 'r-1', token: 'tok' },
      },
    });

    await fetchRoomAccess({ ...AS_GUEST, displayName: '' }, 'abc');

    expect(anonSpy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/abc/');
  });
});

describe('fetchRoomAccess, avec un compte', () => {
  it('passe par authedFetch, jamais par le chemin anonyme', async () => {
    const anonSpy = jest.spyOn(anon, 'anonFetch');
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'r-1',
        slug: 'abc',
        access_level: 'public',
        livekit: { url: 'https://lk', room: 'r-1', token: 'tok' },
      },
    });

    await fetchRoomAccess(AS_ACCOUNT, 'abc');

    expect(anonSpy).not.toHaveBeenCalled();
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
    expect(body.access_level).toBe('public');
    // Le nom envoyé est un code, pas l'intitulé saisi : meet impose
    // `slug = slugify(name)` et le routeur de son client web n'accepte que
    // cette forme. Envoyer « Point hebdo » donnait le slug `point-hebdo`, que
    // le web refuse, rendant la réunion injoignable depuis un navigateur.
    expect(body.name).toMatch(/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(body.name).not.toBe('Point hebdo');
  });

  it('tire un code différent pour deux réunions du même intitulé', async () => {
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'r-2', slug: 'abc-defg-hij', access_level: 'public' },
    });

    await createRoom(ACCOUNT, { name: 'Même intitulé', accessLevel: 'public' });
    await createRoom(ACCOUNT, { name: 'Même intitulé', accessLevel: 'public' });

    // Le code ne dépendant plus du nom, la seconde ne bute plus sur
    // « Room with this Slug already exists ».
    const names = spy.mock.calls.map((call) => {
      const body = JSON.parse(String((call[2] as RequestInit).body)) as Record<string, unknown>;
      return body.name;
    });
    expect(names[0]).not.toBe(names[1]);
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

describe('requestEntry', () => {
  it('rend le statut et le jeton quand la demande est acceptée', async () => {
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'p-1',
        status: 'accepted',
        username: 'Ada',
        livekit: { url: 'wss://livekit.linagora.com', room: 'r-1', token: 'lk' },
      },
    });

    const result = await requestEntry(AS_ACCOUNT, 'reunion', 'Ada');

    expect(result).toEqual({
      ok: true,
      value: {
        participantId: 'p-1',
        status: 'accepted',
        livekitUrl: 'wss://livekit.linagora.com',
        token: 'lk',
      },
    });
  });

  it('rend le refus, que rien ne permettait de détecter auparavant', async () => {
    // La salle d'attente scrutait fetchRoomAccess, qui ne change pas sur un
    // refus : la personne attendait indéfiniment.
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'p-1', status: 'denied', username: 'Ada' },
    });

    const result = await requestEntry(AS_ACCOUNT, 'reunion', 'Ada');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('denied');
    expect(result.value.token).toBe(null);
    // Un refus ne porte pas de bloc livekit : sans cette assertion, un
    // fallback cassé sur `livekitUrl` (par exemple une URL par défaut au lieu
    // de `null`) passerait ce test aussi bien qu'avec le bon comportement —
    // seul `token` était couvert, `livekitUrl` ne l'était pas.
    expect(result.value.livekitUrl).toBe(null);
  });

  it("traite un statut inconnu comme une attente plutôt que d'inventer", async () => {
    // Le backend peut gagner un état. Le prendre pour une admission ferait
    // entrer quelqu'un sans jeton ; le prendre pour un refus le chasserait à
    // tort. L'attente est le seul choix qui ne perde rien.
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'p-1', status: 'quelque-chose-de-neuf', username: 'Ada' },
    });

    const result = await requestEntry(AS_ACCOUNT, 'reunion', 'Ada');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('waiting');
  });
});

describe('requestEntry, en invité', () => {
  it('poste le nom par anonFetch', async () => {
    const anonSpy = jest.spyOn(anon, 'anonFetch').mockResolvedValue({
      ok: true,
      value: { id: 'p-1', status: 'accepted' },
    });

    await requestEntry(AS_GUEST, 'abc', 'Camille Dupont');

    const init = anonSpy.mock.calls[0]?.[2] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ username: 'Camille Dupont' });
  });
});

describe('fetchRoomAccess, droit de modérer', () => {
  it('rend is_administrable', async () => {
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'r-1',
        slug: 'reunion',
        access_level: 'trusted',
        is_administrable: true,
        livekit: { url: 'wss://lk', room: 'r-1', token: 'lk' },
      },
    });

    const result = await fetchRoomAccess(AS_ACCOUNT, 'reunion');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAdministrable).toBe(true);
  });

  it("vaut false quand le serveur ne le dit pas, plutôt que d'ouvrir la modération", async () => {
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'r-1',
        slug: 'reunion',
        access_level: 'trusted',
        livekit: { url: 'wss://lk', room: 'r-1', token: 'lk' },
      },
    });

    const result = await fetchRoomAccess(AS_ACCOUNT, 'reunion');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAdministrable).toBe(false);
  });

  it('refuse une valeur seulement vraie au sens large, pas exactement `true`', async () => {
    // `authedFetch` rend le JSON par un cast non vérifié (`as T`) : rien ne
    // garantit à l'exécution que le champ est un booléen. Un test qui ne
    // couvrirait que « présent contre absent » laisserait passer une
    // comparaison de vérité (`Boolean(x)`), qui ouvrirait la modération sur
    // n'importe quelle valeur non nulle envoyée par erreur.
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'r-1',
        slug: 'reunion',
        access_level: 'trusted',
        is_administrable: 1,
        livekit: { url: 'wss://lk', room: 'r-1', token: 'lk' },
      },
    });

    const result = await fetchRoomAccess(AS_ACCOUNT, 'reunion');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAdministrable).toBe(false);
  });
});
