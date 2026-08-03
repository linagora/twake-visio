import { REQUEST_TIMEOUT_MS } from 'src/constants';
import { readEvent, type CalendarEvent } from 'src/calendar/ics';
import { WINDOW_AHEAD_MS, WINDOW_BEHIND_MS } from 'src/calendar/upcoming';

/**
 * L'hôte du service d'agenda, déduit de celui de meet.
 *
 * `https://meet.<domaine>` → `https://tcalendar-side-service.<domaine>`, en
 * remplaçant le PREMIER label. C'est la règle du widget web (`BASE_DOMAIN`),
 * reprise telle quelle et validée avec Michel-Marie.
 *
 * C'est une HYPOTHÈSE sur les autres instances : rien ne garantit qu'elles
 * nomment leurs hôtes ainsi. Cette fonction est le seul endroit à corriger si
 * l'une d'elles fait autrement.
 */
export function sideServiceUrl(serverUrl: string): string | null {
  let host: string;
  try {
    host = new URL(serverUrl).hostname;
  } catch {
    return null;
  }
  const dot = host.indexOf('.');
  // Sans domaine parent il n'y a rien à remplacer : préfixer donnerait un hôte
  // inexistant, donc une requête qui échoue sans nommer sa cause.
  if (dot < 0) return null;
  return `https://tcalendar-side-service${host.slice(dot)}`;
}

// `YYYYMMDDTHHMMSSZ`, sans tirets ni deux-points. Un horodatage ISO passé tel
// quel fait rendre 400 par Sabre.
function caldavTime(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

export function calendarQueryBody(startMs: number, endMs: number): string {
  return (
    '<?xml version="1.0" encoding="utf-8" ?>' +
    '<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
    '<d:prop><d:getetag/><c:calendar-data/></d:prop>' +
    '<c:filter><c:comp-filter name="VCALENDAR">' +
    '<c:comp-filter name="VEVENT">' +
    `<c:time-range start="${caldavTime(startMs)}" end="${caldavTime(endMs)}"/>` +
    '</c:comp-filter></c:comp-filter></c:filter>' +
    '</c:calendar-query>'
  );
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

async function getJson(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: authHeaders(token),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return (await response.json()) as unknown;
}

// Le pont ne porte aucun contrat : ces formes sont regardées sans assertion de
// type, par `typeof` et par l'opérateur `in`, comme `readAudioDevices`.
function readUserId(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  if (!('_id' in raw) || typeof raw._id !== 'string') return null;
  return raw._id;
}

function readCalendarPaths(raw: unknown): readonly string[] {
  if (typeof raw !== 'object' || raw === null || !('_embedded' in raw)) return [];
  const embedded = raw._embedded;
  if (typeof embedded !== 'object' || embedded === null || !('dav:calendar' in embedded)) return [];
  const list = embedded['dav:calendar'];
  if (!Array.isArray(list)) return [];

  const paths: string[] = [];
  for (const entry of list as readonly unknown[]) {
    if (typeof entry !== 'object' || entry === null || !('_links' in entry)) continue;
    const links = entry._links;
    if (typeof links !== 'object' || links === null || !('self' in links)) continue;
    const self = links.self;
    if (typeof self !== 'object' || self === null || !('href' in self)) continue;
    if (typeof self.href !== 'string') continue;

    // Le serveur rend `/calendars/…`, l'appel se fait sur `/dav/calendars/…`,
    // et sans le suffixe `.json` — qui donne la représentation JSON de la
    // collection, pas la cible d'un REPORT.
    const relative = self.href.startsWith('/') ? self.href : `/${self.href}`;
    const prefixed = relative.startsWith('/dav/') ? relative : `/dav${relative}`;
    paths.push(prefixed.replace(/\.json$/, ''));
  }
  return paths;
}

// La réponse d'un REPORT est un `multistatus` XML qui embarque des blocs ICS.
// On ne parse pas le XML : on découpe sur la balise, parce que la seule chose
// qui nous intéresse est le contenu de `calendar-data`, et qu'aucun analyseur
// DOM n'est disponible en React Native sans dépendance supplémentaire.
const CALENDAR_DATA = /<[^>]*calendar-data[^>]*>([\s\S]*?)<\/[^>]*calendar-data>/g;

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

function readReport(xml: string): readonly CalendarEvent[] {
  const events: CalendarEvent[] = [];
  CALENDAR_DATA.lastIndex = 0;
  let match = CALENDAR_DATA.exec(xml);
  while (match !== null) {
    const event = readEvent(unescapeXml(match[1] ?? ''));
    if (event !== null) events.push(event);
    match = CALENDAR_DATA.exec(xml);
  }
  return events;
}

/**
 * Les évènements de la fenêtre, tous agendas confondus.
 *
 * Trois appels enchaînés, comme le widget web : l'identifiant de l'utilisateur,
 * la liste de ses agendas, puis un REPORT par agenda. La méthode `REPORT` et
 * l'en-tête `Depth` font partie du contrat CalDAV — un `GET` sur la même URL
 * rend la collection, pas les évènements.
 *
 * Jette sur l'échec des DEUX premiers appels : sans identifiant ni agenda il
 * n'y a rien à montrer, et l'appelant traduit cela en « pas de calendrier ici ».
 * Un agenda qui refuse son REPORT est en revanche ignoré — un agenda partagé
 * peut être illisible sans que les autres le soient.
 */
export async function fetchUpcoming(
  base: string,
  token: string,
  now: number,
): Promise<readonly CalendarEvent[]> {
  const userId = readUserId(await getJson(`${base}/api/user`, token));
  if (userId === null) throw new Error(`${base}/api/user: aucun identifiant`);

  const paths = readCalendarPaths(
    await getJson(`${base}/dav/calendars/${userId}.json?personal=true`, token),
  );
  if (paths.length === 0) return [];

  const body = calendarQueryBody(now - WINDOW_BEHIND_MS, now + WINDOW_AHEAD_MS);

  const perCalendar = await Promise.all(
    paths.map(async (path) => {
      try {
        const response = await fetch(`${base}${path}`, {
          method: 'REPORT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/xml; charset=utf-8',
            Depth: '1',
          },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) return [];
        return readReport(await response.text());
      } catch {
        return [];
      }
    }),
  );

  return perCalendar.flat();
}
