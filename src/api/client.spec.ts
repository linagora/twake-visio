import { authedFetch, livekitFetch } from 'src/api/client';
import * as session from 'src/auth/session';
import type { Account } from 'src/auth/accounts';

const ACCOUNT: Account = {
  id: 'https://sso.linagora.com|u-1',
  instance: {
    serverUrl: 'https://meet.linagora.com',
    issuer: 'https://sso.linagora.com',
    clientId: 'twake-visio',
    livekitUrl: 'https://livekit.linagora.com',
    features: { recording: true, subtitle: true, telephony: false, calendar: false },
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

  it("ne rejoue qu'une seule fois, même si le 401 persiste", async () => {
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
    jest.spyOn(session, 'forceRefresh').mockResolvedValue({ ok: false, reason: 'refused' });
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
    jest.spyOn(session, 'getAccessToken').mockResolvedValue({ ok: true, token: 'stale' });
    jest.spyOn(session, 'forceRefresh').mockResolvedValue({ ok: false, reason: 'unavailable' });
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

describe('authedFetch, erreurs de champ', () => {
  function respond(body: string, status: number): void {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue({ ok: true, token: 'at' });
    globalThis.fetch = jest.fn(
      async () => new Response(body, { status }),
    ) as unknown as typeof fetch;
  }

  it("rend les champs refusés d'un 400 plutôt qu'un statut nu", async () => {
    // Cas réel, relevé sur meet.linagora.com : l'API dérive le slug du nom et
    // refuse les doublons. Sans les champs, l'écran ne peut que proposer de
    // réessayer à l'identique, ce qui échouera toujours.
    respond(JSON.stringify({ slug: ['Room with this Slug already exists.'] }), 400);

    const result = await authedFetch(ACCOUNT, '/api/v1.0/rooms/', { method: 'POST' });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', fields: { slug: ['Room with this Slug already exists.'] } },
    });
  });

  it('retombe sur server quand le 400 ne suit pas la convention', async () => {
    // Une page HTML de proxy, par exemple : l'annoncer comme une erreur de champ
    // ferait inventer à l'écran un diagnostic que personne n'a donné.
    respond('<html>Bad Request</html>', 400);

    const result = await authedFetch(ACCOUNT, '/api/v1.0/rooms/', { method: 'POST' });

    expect(result).toEqual({ ok: false, error: { kind: 'server', status: 400 } });
  });

  it('retombe sur server quand le 400 est du JSON sans champ exploitable', async () => {
    // Corps JSON valide, donc le parsing réussit : c'est la garde sur les champs
    // vides qui doit trancher, pas celle sur le parsing. Sans elle, l'écran
    // recevrait une erreur de champ vide et dirait « corrigez votre saisie »
    // sans pouvoir dire laquelle.
    respond(JSON.stringify({ detail: 'Malformed request' }), 400);

    const result = await authedFetch(ACCOUNT, '/api/v1.0/rooms/', { method: 'POST' });

    expect(result).toEqual({ ok: false, error: { kind: 'server', status: 400 } });
  });

  it('ignore les entrées qui ne sont pas des listes de chaînes', async () => {
    respond(JSON.stringify({ detail: 'nope', slug: ['pris'] }), 400);

    const result = await authedFetch(ACCOUNT, '/api/v1.0/rooms/', { method: 'POST' });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', fields: { slug: ['pris'] } },
    });
  });

  it('laisse les autres statuts intacts', async () => {
    respond(JSON.stringify({ slug: ['pris'] }), 500);

    // La lecture des champs est réservée au 400 : un 500 qui porterait par
    // hasard cette forme resterait une panne serveur, pas une saisie à corriger.
    const result = await authedFetch(ACCOUNT, '/api/v1.0/rooms/', { method: 'POST' });

    expect(result).toEqual({ ok: false, error: { kind: 'server', status: 500 } });
  });
});

// `mute-participant` est la seule route de meet qui refuse le porteur OIDC :
// mesuré sur une instance réelle, elle rendait 403 là où une EXPULSION,
// gardée par la seule permission `HasPrivilegesOnRoom`, réussissait au même
// instant sur le même salon avec le même compte. Voir `src/api/participants.ts`.
describe('livekitFetch', () => {
  it('porte le jeton LiveKit, et ne touche jamais à celui du compte', async () => {
    // `getAccessToken` doit rester INAPPELÉ : c'est tout l'intérêt de ce
    // chemin, et un appel qui l'emprunterait quand même passerait le reste du
    // test sans cette assertion.
    const token = jest.spyOn(session, 'getAccessToken');
    const spy = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
      async () => new Response(JSON.stringify({}), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await livekitFetch(
      'https://meet.linagora.com',
      'lk-jwt',
      'r-1',
      'mute-participant',
      { participant_identity: 'PA_1', track_sid: 'TR_1' },
    );

    expect(token).not.toHaveBeenCalled();
    expect(spy.mock.calls[0]?.[0]).toBe(
      'https://meet.linagora.com/api/v1.0/rooms/r-1/mute-participant/',
    );
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer lk-jwt');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      participant_identity: 'PA_1',
      track_sid: 'TR_1',
    });
    expect(result).toEqual({ ok: true, value: {} });
  });

  it("échappe l'identifiant de salon plutôt que de le coller tel quel", async () => {
    const spy = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
      async () => new Response(JSON.stringify({}), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    await livekitFetch('https://meet.linagora.com', 'lk', 'r 1/x', 'mute-participant', {});

    expect(spy.mock.calls[0]?.[0]).toBe(
      'https://meet.linagora.com/api/v1.0/rooms/r%201%2Fx/mute-participant/',
    );
  });

  it('mappe 403 sur forbidden, comme authedFetch', async () => {
    // Le statut exact que l'instance mesurée renvoyait. Sans ce mappage,
    // l'écran dirait « Connexion impossible » pour un refus arrivé par le
    // réseau — le défaut que `toApiErrorMessage` vient de corriger.
    globalThis.fetch = (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch;

    const result = await livekitFetch(
      'https://meet.linagora.com',
      'lk',
      'r-1',
      'mute-participant',
      {},
    );

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
  });

  it('rend les champs refusés d’un 400 plutôt qu’un statut nu', async () => {
    // Le cas réel : sans `track_sid`, le sérialiseur du serveur refuse. Ce 400
    // était masqué par le 403 tant que le mauvais justificatif était envoyé.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ track_sid: ['This field is required.'] }), {
        status: 400,
      })) as unknown as typeof fetch;

    const result = await livekitFetch(
      'https://meet.linagora.com',
      'lk',
      'r-1',
      'mute-participant',
      {},
    );

    expect(result).toEqual({
      ok: false,
      error: { kind: 'validation', fields: { track_sid: ['This field is required.'] } },
    });
  });

  it('mappe une panne de transport sur network', async () => {
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    const result = await livekitFetch(
      'https://meet.linagora.com',
      'lk',
      'r-1',
      'mute-participant',
      {},
    );

    expect(result).toEqual({ ok: false, error: { kind: 'network' } });
  });
});
