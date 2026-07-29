import { fetchInstanceConfig } from 'src/instance/discovery';

const CONFIG_WITH_OIDC = {
  livekit: { url: 'https://livekit.linagora.com' },
  recording: { is_enabled: true },
  subtitle: { enabled: true },
  telephony: { enabled: false },
  oidc: { issuer: 'https://sso.linagora.com', mobile_client_id: 'twake-visio' },
};

const CONFIG_WITHOUT_OIDC = { ...CONFIG_WITH_OIDC, oidc: undefined };

type FetchCall = { url: string; init: RequestInit | undefined };

let calls: FetchCall[] = [];

// Le second argument de fetch est capturé, sans quoi redirect et signal ne
// sont assertables par aucun test et peuvent disparaître du code sans qu'une
// suite au vert ne s'en aperçoive.
function mockFetch(handler: (url: string) => Response): void {
  calls = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return handler(String(input));
  }) as unknown as typeof fetch;
}

function findCall(fragment: string): FetchCall | undefined {
  return calls.find((call) => call.url.includes(fragment));
}

describe('fetchInstanceConfig', () => {
  it('chemin A — lit l\'issuer depuis /config/', async () => {
    mockFetch(() => new Response(JSON.stringify(CONFIG_WITH_OIDC), { status: 200 }));

    const result = await fetchInstanceConfig('https://meet.linagora.com');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.issuer).toBe('https://sso.linagora.com');
    expect(result.value.clientId).toBe('twake-visio');
    expect(result.value.livekitUrl).toBe('https://livekit.linagora.com');
  });

  it('chemin B — déduit l\'issuer de la redirection quand oidc manque', async () => {
    mockFetch((url) => {
      if (url.includes('/config/')) {
        return new Response(JSON.stringify(CONFIG_WITHOUT_OIDC), { status: 200 });
      }
      return new Response(null, {
        status: 302,
        headers: {
          location:
            'https://sso.linagora.com/oauth2/authorize?response_type=code&client_id=livekit-meet',
        },
      });
    });

    const result = await fetchInstanceConfig('https://meet.linagora.com');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.issuer).toBe('https://sso.linagora.com');
    expect(result.value.clientId).toBe('twake-visio');
  });

  it('échoue proprement sur un hôte inconnu sans bloc oidc', async () => {
    mockFetch((url) => {
      if (url.includes('/config/')) {
        return new Response(JSON.stringify(CONFIG_WITHOUT_OIDC), { status: 200 });
      }
      return new Response(null, {
        status: 302,
        headers: { location: 'https://sso.example.org/oauth2/authorize' },
      });
    });

    const result = await fetchInstanceConfig('https://meet.example.org');

    expect(result).toEqual({ ok: false, error: 'oidc-undiscoverable' });
  });

  it('signale une instance qui n\'est pas un serveur meet', async () => {
    mockFetch(() => new Response('<html></html>', { status: 200 }));

    const result = await fetchInstanceConfig('https://example.org');

    expect(result).toEqual({ ok: false, error: 'not-a-meet-instance' });
  });

  it('signale un serveur injoignable', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;

    const result = await fetchInstanceConfig('https://down.example.org');

    expect(result).toEqual({ ok: false, error: 'unreachable' });
  });

  it('signale unreachable quand c\'est le repli lui-même qui échoue', async () => {
    // Distinct du test précédent : /config/ répond, donc le chemin A aboutit
    // et c'est bien /authenticate/ qui jette. Sans ce cas, la panne du repli
    // pourrait être repliée sur oidc-undiscoverable sans qu'aucun test ne bronche.
    mockFetch((url) => {
      if (url.includes('/config/')) {
        return new Response(JSON.stringify(CONFIG_WITHOUT_OIDC), { status: 200 });
      }
      throw new TypeError('network');
    });

    const result = await fetchInstanceConfig('https://meet.linagora.com');

    expect(result).toEqual({ ok: false, error: 'unreachable' });
  });

  it('ne suit pas la redirection sur le chemin de repli', async () => {
    mockFetch((url) => {
      if (url.includes('/config/')) {
        return new Response(JSON.stringify(CONFIG_WITHOUT_OIDC), { status: 200 });
      }
      return new Response(null, {
        status: 302,
        headers: { location: 'https://sso.linagora.com/oauth2/authorize' },
      });
    });

    await fetchInstanceConfig('https://meet.linagora.com');

    expect(findCall('/authenticate/')?.init?.redirect).toBe('manual');
  });

  it('borne chaque appel réseau par un délai', async () => {
    mockFetch((url) => {
      if (url.includes('/config/')) {
        return new Response(JSON.stringify(CONFIG_WITHOUT_OIDC), { status: 200 });
      }
      return new Response(null, {
        status: 302,
        headers: { location: 'https://sso.linagora.com/oauth2/authorize' },
      });
    });

    await fetchInstanceConfig('https://meet.linagora.com');

    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.init?.signal !== undefined)).toBe(true);
  });
});
