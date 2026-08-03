import { calendarQueryBody, fetchUpcoming, sideServiceUrl } from 'src/calendar/sideService';

describe('sideServiceUrl', () => {
  it("remplace le premier label de l'hôte meet", () => {
    // La règle du widget web (`BASE_DOMAIN`), reprise telle quelle.
    expect(sideServiceUrl('https://meet.twake-dev.maudet.cloud')).toBe(
      'https://tcalendar-side-service.twake-dev.maudet.cloud',
    );
  });

  it('tolère une barre oblique finale', () => {
    expect(sideServiceUrl('https://meet.twake-dev.maudet.cloud/')).toBe(
      'https://tcalendar-side-service.twake-dev.maudet.cloud',
    );
  });

  it("rend null quand l'hôte n'a pas de domaine parent", () => {
    // `https://meet` n'a rien à remplacer : préfixer donnerait un hôte qui
    // n'existe pas, et une requête qui échoue sans dire pourquoi.
    expect(sideServiceUrl('https://meet')).toBeNull();
  });

  it("rend null sur une URL qui n'en est pas une", () => {
    expect(sideServiceUrl('pas une url')).toBeNull();
  });
});

describe('calendarQueryBody', () => {
  it('encadre la requête sur la fenêtre demandée, au format CalDAV', () => {
    // Le format est `YYYYMMDDTHHMMSSZ`, sans tirets ni deux-points : un
    // horodatage ISO passé tel quel fait rendre 400 par Sabre.
    const body = calendarQueryBody(Date.UTC(2026, 7, 3, 8, 0, 0), Date.UTC(2026, 7, 4, 8, 0, 0));

    expect(body).toContain('start="20260803T080000Z"');
    expect(body).toContain('end="20260804T080000Z"');
    expect(body).toContain('<c:comp-filter name="VEVENT">');
  });
});

// Le pont réseau est doublé au niveau de `fetch` : c'est la seule couche que
// l'application ne possède pas, et la doubler plus haut ne prouverait rien du
// chemin réellement emprunté.
type Call = { readonly url: string; readonly init?: RequestInit };

function mockFetch(handler: (call: Call) => Response | Promise<Response>): jest.Mock {
  const fn = jest.fn(async (url: string, init?: RequestInit) => handler({ url, init }));
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

const USER = JSON.stringify({ _id: 'user-1' });
const CALENDARS = JSON.stringify({
  _embedded: { 'dav:calendar': [{ _links: { self: { href: '/calendars/user-1/user-1.json' } } }] },
});
const REPORT = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
<d:response><d:propstat><d:prop><cal:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:evt-1
SUMMARY:COCO
DTSTART:20260803T090000Z
DTEND:20260803T100000Z
X-OPENPAAS-VIDEOCONFERENCE:https://meet.twake-dev.maudet.cloud/mjj-beyv-zai
END:VEVENT
END:VCALENDAR</cal:calendar-data></d:prop></d:propstat></d:response>
</d:multistatus>`;

function ok(body: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as Response;
}

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('fetchUpcoming', () => {
  it('enchaîne utilisateur, agendas puis REPORT, et rend les évènements', async () => {
    const fetchMock = mockFetch(({ url }) => {
      if (url.endsWith('/api/user')) return ok(USER);
      if (url.includes('/dav/calendars/user-1.json')) return ok(CALENDARS);
      return ok(REPORT);
    });

    const events = await fetchUpcoming('https://side', 'jeton', Date.UTC(2026, 7, 3, 8, 0, 0));

    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toBe('COCO');
    // L'ordre des trois appels EST le contrat : l'identifiant vient du premier,
    // le chemin d'agenda du deuxième.
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      'https://side/api/user',
      'https://side/dav/calendars/user-1.json?personal=true',
      'https://side/dav/calendars/user-1/user-1',
    ]);
  });

  it('porte le jeton en Bearer sur les trois appels', async () => {
    const fetchMock = mockFetch(({ url }) => {
      if (url.endsWith('/api/user')) return ok(USER);
      if (url.includes('/dav/calendars/user-1.json')) return ok(CALENDARS);
      return ok(REPORT);
    });

    await fetchUpcoming('https://side', 'jeton', Date.UTC(2026, 7, 3, 8, 0, 0));

    for (const call of fetchMock.mock.calls) {
      const headers = (call[1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer jeton');
    }
  });

  it('emploie la méthode REPORT et l’en-tête Depth sur le troisième appel', async () => {
    // Un `GET` sur cette URL rend la collection, pas les évènements de la
    // fenêtre. La méthode fait partie du contrat CalDAV.
    const fetchMock = mockFetch(({ url }) => {
      if (url.endsWith('/api/user')) return ok(USER);
      if (url.includes('/dav/calendars/user-1.json')) return ok(CALENDARS);
      return ok(REPORT);
    });

    await fetchUpcoming('https://side', 'jeton', Date.UTC(2026, 7, 3, 8, 0, 0));

    const report = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(report.method).toBe('REPORT');
    expect((report.headers as Record<string, string>).Depth).toBe('1');
  });

  it('jette une erreur nommée sur un 401, que l’appelant traduit en « pas de calendrier »', async () => {
    mockFetch(() => ({ ok: false, status: 401 }) as Response);

    await expect(
      fetchUpcoming('https://side', 'jeton', Date.UTC(2026, 7, 3, 8, 0, 0)),
    ).rejects.toThrow('401');
  });

  it('rend une liste vide quand le compte ne porte aucun agenda', async () => {
    mockFetch(({ url }) => {
      if (url.endsWith('/api/user')) return ok(USER);
      return ok(JSON.stringify({ _embedded: { 'dav:calendar': [] } }));
    });

    await expect(
      fetchUpcoming('https://side', 'jeton', Date.UTC(2026, 7, 3, 8, 0, 0)),
    ).resolves.toEqual([]);
  });

  it("n'abandonne pas tout quand UN agenda échoue", async () => {
    // Un agenda partagé peut refuser le REPORT. Les autres doivent quand même
    // rendre leurs évènements.
    const twoCalendars = JSON.stringify({
      _embedded: {
        'dav:calendar': [
          { _links: { self: { href: '/calendars/user-1/refuse.json' } } },
          { _links: { self: { href: '/calendars/user-1/user-1.json' } } },
        ],
      },
    });
    mockFetch(({ url }) => {
      if (url.endsWith('/api/user')) return ok(USER);
      if (url.includes('/dav/calendars/user-1.json')) return ok(twoCalendars);
      if (url.includes('refuse')) return { ok: false, status: 403 } as Response;
      return ok(REPORT);
    });

    const events = await fetchUpcoming('https://side', 'jeton', Date.UTC(2026, 7, 3, 8, 0, 0));

    expect(events.map((e) => e.summary)).toEqual(['COCO']);
  });
});
