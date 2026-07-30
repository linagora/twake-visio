import * as discovery from 'src/instance/discovery';
import { fetchServerUrlForEmail } from 'src/instance/emailResolution';
import type { InstanceResult } from 'src/instance/types';

const FOUND: InstanceResult = {
  ok: true,
  value: {
    serverUrl: 'https://meet.example.org',
    issuer: 'https://sso.example.org',
    clientId: 'twake-visio',
    livekitUrl: 'wss://livekit.example.org',
    features: { recording: false, subtitle: false, telephony: false },
  },
};

let probe: jest.SpyInstance<Promise<InstanceResult>, [string]>;
let networkCalls: string[] = [];

beforeEach(() => {
  jest.restoreAllMocks();
  networkCalls = [];
  // Toute tentative de sortie réseau est enregistrée puis échoue : un test qui
  // prétend ne rien appeler doit le prouver, et un appel oublié se voit ici
  // plutôt que de partir vers un vrai hôte pendant la suite.
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    networkCalls.push(String(input));
    throw new TypeError('aucun appel réseau attendu dans ce test');
  }) as unknown as typeof fetch;
  probe = jest.spyOn(discovery, 'fetchInstanceConfig');
});

function probedUrls(): string[] {
  return probe.mock.calls.map((call) => call[0]);
}

describe('fetchServerUrlForEmail', () => {
  it('résout un domaine connu sans ouvrir la moindre connexion', async () => {
    const result = await fetchServerUrlForEmail('ada@linagora.com');

    expect(result).toEqual({ ok: true, value: 'https://meet.linagora.com' });
    expect(probedUrls()).toEqual([]);
    expect(networkCalls).toEqual([]);
  });

  it("accepte la casse mixte et les espaces autour de l'adresse sur la voie rapide", async () => {
    const result = await fetchServerUrlForEmail('  Ada@LINAGORA.com  ');

    expect(result).toEqual({ ok: true, value: 'https://meet.linagora.com' });
    expect(probedUrls()).toEqual([]);
  });

  it('accepte une adresse étiquetée sur la voie rapide', async () => {
    const result = await fetchServerUrlForEmail('ada+visio@linagora.com');

    expect(result).toEqual({ ok: true, value: 'https://meet.linagora.com' });
    expect(probedUrls()).toEqual([]);
  });

  it("essaie meet.<domaine> d'abord et s'arrête dès qu'il répond", async () => {
    probe.mockResolvedValue(FOUND);

    const result = await fetchServerUrlForEmail('ada@example.org');

    expect(result).toEqual({ ok: true, value: 'https://meet.example.org' });
    expect(probedUrls()).toEqual(['https://meet.example.org']);
  });

  it('sonde le domaine en minuscules', async () => {
    probe.mockResolvedValue(FOUND);

    await fetchServerUrlForEmail('Ada@Example.ORG');

    expect(probedUrls()).toEqual(['https://meet.example.org']);
  });

  it("retombe sur le domaine nu quand meet.<domaine> n'est pas une instance meet", async () => {
    probe.mockImplementation(async (serverUrl: string) =>
      serverUrl === 'https://example.org' ? FOUND : { ok: false, error: 'not-a-meet-instance' },
    );

    const result = await fetchServerUrlForEmail('ada@example.org');

    expect(result).toEqual({ ok: true, value: 'https://example.org' });
    expect(probedUrls()).toEqual(['https://meet.example.org', 'https://example.org']);
  });

  it('poursuit sur le domaine nu quand meet.<domaine> est injoignable', async () => {
    // visio.linagora.com ne résout pas du tout en production : une candidate
    // qui n'existe pas doit faire passer à la suivante, pas arrêter la course.
    probe.mockImplementation(async (serverUrl: string) =>
      serverUrl === 'https://example.org' ? FOUND : { ok: false, error: 'unreachable' },
    );

    const result = await fetchServerUrlForEmail('ada@example.org');

    expect(result).toEqual({ ok: true, value: 'https://example.org' });
    expect(probedUrls()).toEqual(['https://meet.example.org', 'https://example.org']);
  });

  it("s'arrête sur une instance meet dont l'OIDC ne se découvre pas", async () => {
    // Le contrat de détection est la forme JSON de /api/v1.0/config/, jamais un
    // code HTTP : oidc-undiscoverable veut dire que la config a bien été lue,
    // donc que l'hôte est le bon. Continuer à sonder le domaine nu ferait
    // conclure « introuvable » pour une instance qu'on a bel et bien trouvée.
    probe.mockResolvedValue({ ok: false, error: 'oidc-undiscoverable' });

    const result = await fetchServerUrlForEmail('ada@example.org');

    expect(result).toEqual({ ok: true, value: 'https://meet.example.org' });
    expect(probedUrls()).toEqual(['https://meet.example.org']);
  });

  it('distingue « instance introuvable » quand aucune candidate ne répond', async () => {
    probe.mockResolvedValue({ ok: false, error: 'not-a-meet-instance' });

    const result = await fetchServerUrlForEmail('ada@example.org');

    expect(result).toEqual({ ok: false, error: 'instance-not-found' });
    expect(probedUrls()).toEqual(['https://meet.example.org', 'https://example.org']);
  });

  it('refuse une saisie sans @ sans rien sonder', async () => {
    const result = await fetchServerUrlForEmail('linagora.com');

    expect(result).toEqual({ ok: false, error: 'invalid-email' });
    expect(probedUrls()).toEqual([]);
  });

  it('refuse une adresse sans partie locale', async () => {
    expect(await fetchServerUrlForEmail('@linagora.com')).toEqual({
      ok: false,
      error: 'invalid-email',
    });
  });

  it('refuse un domaine sans point', async () => {
    expect(await fetchServerUrlForEmail('ada@localhost')).toEqual({
      ok: false,
      error: 'invalid-email',
    });
  });

  it('refuse un domaine mal formé', async () => {
    expect(await fetchServerUrlForEmail('ada@-linagora.com')).toEqual({
      ok: false,
      error: 'invalid-email',
    });
    expect(await fetchServerUrlForEmail('ada@linagora.com.')).toEqual({
      ok: false,
      error: 'invalid-email',
    });
    expect(probedUrls()).toEqual([]);
  });
});
