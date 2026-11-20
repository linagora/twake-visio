import {
  createRoom,
  fetchMyRooms,
  fetchRoom,
  joinRoom,
  requestEntry,
  type JoinOutcome,
} from 'src/api/rooms';
import * as anon from 'src/api/anon';
import * as client from 'src/api/client';
import type { ApiError, ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';
import * as session from 'src/auth/session';
import type { Visitor } from 'src/auth/visitor';
import type { RoomAccess } from 'src/call/types';

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

// La couture RÉSEAU : `fetch` doublé, et lui seul. Ces tests observent la
// requête telle qu'elle part — adresse, méthode, en-têtes, corps —, pas
// l'argument passé à `authedFetch` ou `anonFetch` : un branchement compte /
// invité inversé passerait inaperçu à ce niveau-là.
function serve(body: unknown): jest.Mock<Promise<Response>, Parameters<typeof fetch>> {
  const spy = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  );
  globalThis.fetch = spy as unknown as typeof fetch;
  return spy;
}

function sent(spy: jest.Mock<Promise<Response>, Parameters<typeof fetch>>): {
  url: string;
  init: RequestInit;
  headers: Record<string, string>;
} {
  const call = spy.mock.calls[0];
  if (call === undefined) throw new Error('aucune requête partie');
  const init = call[1] ?? {};
  return { url: String(call[0]), init, headers: init.headers as Record<string, string> };
}

function admittedAccess(result: ApiResult<JoinOutcome>): RoomAccess {
  if (!result.ok || result.value.kind !== 'admitted') throw new Error('admission attendue');
  return result.value.access;
}

// Le salon tel que `join/` le rend quand la personne doit attendre : le
// sérialiseur de détail, sans `livekit` et sans `accesses`.
const WAITING = {
  id: 'r-1',
  name: 'Réunion',
  slug: 'abc-defg-hij',
  configuration: {},
  access_level: 'trusted',
};

const JOINED = {
  ...WAITING,
  livekit: { url: 'wss://livekit.acme.com', room: 'r-1', token: 'lk-token' },
};

// Les échecs que le lecteur partagé sait nommer, tels qu'ils arrivent par le
// réseau. `joinRoom` et `fetchRoom` les rendent TELS QUELS : sans le retour
// anticipé sur leur premier échec, la réponse serait lue comme un salon,
// l'appel jetterait, et le pré-join dirait « réseau » pour un salon supprimé.
const FAILURES: readonly (readonly [string, () => Promise<Response>, ApiError])[] = [
  [
    'un 404 en JSON',
    async () => new Response('{"detail":"No Room matches the given query."}', { status: 404 }),
    { kind: 'not-found' },
  ],
  [
    "un 404 qui n'est pas du JSON",
    async () => new Response('<h1>Not Found</h1>', { status: 404 }),
    { kind: 'missing-route' },
  ],
  [
    'un 410',
    async () => new Response('{"detail":"This room has been deleted."}', { status: 410 }),
    { kind: 'gone' },
  ],
  ['un 5xx', async () => new Response('{}', { status: 503 }), { kind: 'server', status: 503 }],
  [
    'un rejet réseau',
    async () => {
      throw new Error('offline');
    },
    { kind: 'network' },
  ],
];

function respondWith(respond: () => Promise<Response>): void {
  globalThis.fetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
    respond,
  ) as unknown as typeof fetch;
}

describe('joinRoom', () => {
  // Le nom SAISI, et non celui que porte le visiteur : les deux diffèrent ici
  // pour que l'assertion ne puisse venir que du premier.
  it('poste le nom saisi, rogné, sans aucune identité, pour un invité', async () => {
    const spy = serve(JOINED);

    await joinRoom(AS_GUEST, 'abc-defg-hij', '  Camille Martin  ');

    const { url, init, headers } = sent(spy);
    expect(url).toBe('https://meet.acme.com/api/v1.0/rooms/abc-defg-hij/join/');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ username: 'Camille Martin' });
    // Sans lui, `fetch` étiquette le corps `text/plain` et Django REST
    // Framework le refuse en 415 : le nom n'arriverait jamais.
    expect(headers['content-type']).toBe('application/json');
    expect(headers.authorization).toBeUndefined();
  });

  it('ne poste aucun nom avec un compte : le serveur le tire du compte', async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue({ ok: true, token: 'at' });
    const spy = serve(JOINED);

    await joinRoom(AS_ACCOUNT, 'abc-defg-hij', 'Ada');

    const { url, init, headers } = sent(spy);
    expect(url).toBe('https://meet.linagora.com/api/v1.0/rooms/abc-defg-hij/join/');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({});
    expect(headers.authorization).toBe('Bearer at');
  });

  it("rend « admis » et l'accès quand la réponse porte livekit", async () => {
    serve(JOINED);

    const result = await joinRoom(AS_GUEST, 'abc-defg-hij', 'Camille');

    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'admitted',
        access: {
          room: { id: 'r-1', slug: 'abc-defg-hij', name: 'Réunion', accessLevel: 'trusted' },
          livekitUrl: 'wss://livekit.acme.com',
          token: 'lk-token',
          isAdministrable: false,
        },
      },
    });
  });

  it("rend « salle d'attente » quand la réponse n'a pas livekit", async () => {
    serve(WAITING);

    const result = await joinRoom(AS_GUEST, 'abc-defg-hij', 'Camille');

    expect(result).toEqual({ ok: true, value: { kind: 'lobby' } });
  });

  // Le droit de modérer vaut la PRÉSENCE de `accesses`, que le sérialiseur ne
  // pose que pour un administrateur ou un propriétaire. Les deux tests se
  // croisent : chacun porte le signal que l'autre n'a pas, pour qu'une lecture
  // par n'importe quel autre champ fasse rougir l'un des deux.
  it('rend le droit de modérer quand la réponse porte accesses', async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue({ ok: true, token: 'at' });
    serve({ ...JOINED, accesses: [{ id: 'a-1', role: 'owner' }] });

    const result = await joinRoom(AS_ACCOUNT, 'abc-defg-hij', '');

    expect(admittedAccess(result).isAdministrable).toBe(true);
  });

  it("ne le rend pas sans accesses, même quand un autre champ l'affirme", async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue({ ok: true, token: 'at' });
    serve({ ...JOINED, is_administrable: true });

    const result = await joinRoom(AS_ACCOUNT, 'abc-defg-hij', '');

    expect(admittedAccess(result).isAdministrable).toBe(false);
  });

  it.each(FAILURES)('rend %s tel quel', async (_label, respond, error) => {
    respondWith(respond);

    expect(await joinRoom(AS_GUEST, 'abc-defg-hij', 'Camille')).toEqual({ ok: false, error });
  });
});

// La lecture du pré-join : l'existence du salon et son nom, rien d'autre. Elle
// ne porte plus aucun nom dans l'adresse — c'est `joinRoom` qui le poste.
describe('fetchRoom', () => {
  it("lit le salon sans nom dans l'adresse, pour un invité", async () => {
    const spy = serve(WAITING);

    const result = await fetchRoom(AS_GUEST, 'abc-defg-hij');

    const { url, headers } = sent(spy);
    expect(url).toBe('https://meet.acme.com/api/v1.0/rooms/abc-defg-hij/');
    expect(headers.authorization).toBeUndefined();
    expect(result).toEqual({
      ok: true,
      value: { id: 'r-1', slug: 'abc-defg-hij', name: 'Réunion', accessLevel: 'trusted' },
    });
  });

  it('lit le salon par le chemin authentifié avec un compte', async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue({ ok: true, token: 'at' });
    const spy = serve(WAITING);

    await fetchRoom(AS_ACCOUNT, 'abc-defg-hij');

    const { url, headers } = sent(spy);
    expect(url).toBe('https://meet.linagora.com/api/v1.0/rooms/abc-defg-hij/');
    expect(headers.authorization).toBe('Bearer at');
  });

  it.each(FAILURES)('rend %s tel quel', async (_label, respond, error) => {
    respondWith(respond);

    expect(await fetchRoom(AS_GUEST, 'abc-defg-hij')).toEqual({ ok: false, error });
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
    // La salle d'attente scrutait une lecture du salon, qui ne change pas sur
    // un refus : la personne attendait indéfiniment.
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
