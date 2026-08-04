// Un évènement d'agenda réduit à ce que le panneau montre. Les instants sont
// des millisecondes epoch et non des `Date` : une valeur comparable, sérialisable,
// et qui ne porte aucun fuseau — celui de l'affichage est décidé au rendu.
export type CalendarEvent = {
  readonly uid: string;
  readonly summary: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly meetUrl: string;
};

// Une heure. La durée par défaut d'un rendez-vous dans la plupart des agendas,
// et ce qu'on donne à un évènement qui n'annonce ni fin ni durée.
const DEFAULT_DURATION_MS = 3600000;

// RFC 5545 §3.1 : une ligne repliée reprend après un saut suivi d'un ESPACE ou
// d'une TABULATION. Sans ce dépliage, une URL repliée à 75 octets est tronquée
// en son milieu et le salon devient introuvable.
function unfold(ics: string): readonly string[] {
  return ics
    .replace(/\r\n[ \t]/g, '')
    .replace(/\n[ \t]/g, '')
    .split(/\r?\n/);
}

type Property = { readonly name: string; readonly params: string; readonly value: string };

// Le PREMIER deux-points sépare le nom et ses paramètres de la valeur. Un
// découpage plus naïf casserait sur `ORGANIZER;CN=…:mailto:…`, présent dans
// tous les évènements réels, dont la valeur contient elle-même un deux-points.
function readProperty(line: string): Property | null {
  const colon = line.indexOf(':');
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const semicolon = head.indexOf(';');
  return {
    name: (semicolon < 0 ? head : head.slice(0, semicolon)).toUpperCase(),
    params: semicolon < 0 ? '' : head.slice(semicolon + 1),
    value: line.slice(colon + 1),
  };
}

// Le décalage d'un fuseau NOMMÉ à un instant donné, en seconde.
//
// `Intl` est la seule source de la base de fuseaux disponible à l'exécution ;
// aucune table n'est embarquée. Sur un moteur qui ne la porte pas, la fonction
// rend `null` et l'appelant retombe sur l'heure locale de l'appareil — faux
// pour qui voyage, juste pour tout le monde à son bureau, et surtout jamais un
// plantage.
function zoneOffsetSeconds(timeZone: string, atMs: number): number | null {
  try {
    const format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = format.formatToParts(new Date(atMs));
    const read = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
    // `formatToParts` rend 24 pour minuit sur certains moteurs ; `Date.UTC` le
    // reporte au jour suivant, ce qui est exactement le résultat voulu.
    const wallMs = Date.UTC(
      read('year'),
      read('month') - 1,
      read('day'),
      read('hour'),
      read('minute'),
      read('second'),
    );
    return (wallMs - atMs) / 1000;
  } catch {
    return null;
  }
}

// `20260803T093000`, `20260803T073000Z`, ou `20260803` pour une journée entière.
function readStamp(value: string): { readonly utcMs: number; readonly isUtc: boolean } | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (match === null) return null;
  const [, y, mo, d, h, mi, s, z] = match;
  return {
    utcMs: Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h ?? '0'),
      Number(mi ?? '0'),
      Number(s ?? '0'),
    ),
    isUtc: z === 'Z',
  };
}

// Un horodatage ICS vers un instant.
//
// Trois formes, et elles ne se traitent pas pareil : suffixé `Z` c'est déjà de
// l'UTC ; porteur d'un `TZID` c'est une heure MURALE dans ce fuseau, qu'il faut
// décaler ; sans rien c'est l'heure locale de l'appareil.
function toInstant(property: Property): number | null {
  const stamp = readStamp(property.value);
  if (stamp === null) return null;
  if (stamp.isUtc) return stamp.utcMs;

  const tzid = /TZID=([^;]+)/.exec(property.params)?.[1];
  if (tzid === undefined) {
    // Heure locale : `Date.UTC` a lu les composants comme de l'UTC, on retire
    // donc le décalage de l'appareil pour retomber sur le bon instant.
    return stamp.utcMs + new Date(stamp.utcMs).getTimezoneOffset() * 60000;
  }

  const guess = zoneOffsetSeconds(tzid, stamp.utcMs);
  if (guess === null) return stamp.utcMs + new Date(stamp.utcMs).getTimezoneOffset() * 60000;

  // Deux passes, et la seconde n'est pas une précaution de style : à la bascule
  // d'heure d'été, le décalage lu À l'instant approché diffère de celui qui
  // s'applique à l'instant vrai. La première passe approche, la seconde corrige.
  const first = stamp.utcMs - guess * 1000;
  const refined = zoneOffsetSeconds(tzid, first);
  return refined === null ? first : stamp.utcMs - refined * 1000;
}

// `PT1H30M`, `P1DT2H`, `PT45M`. Les semaines sont acceptées : un agenda peut
// les produire, et les ignorer donnerait une durée nulle sans le dire.
function readDuration(value: string): number | null {
  const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    value.trim(),
  );
  if (match === null) return null;
  const [, w, d, h, mi, s] = match;
  const total =
    Number(w ?? 0) * 604800 +
    Number(d ?? 0) * 86400 +
    Number(h ?? 0) * 3600 +
    Number(mi ?? 0) * 60 +
    Number(s ?? 0);
  return total === 0 ? null : total * 1000;
}

// RFC 5545 §3.3.11 : dans un texte, `\n`, `\,`, `\;` et `\\` sont échappés.
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

const URL_IN_TEXT = /https?:\/\/[^\s"'<>\\]+/;

/**
 * Lit le PREMIER `VEVENT` d'un contenu iCalendar, ou `null` s'il n'y en a pas,
 * ou s'il ne porte aucun lien de visioconférence.
 *
 * Un ICS réel commence par un `VTIMEZONE` qui porte ses PROPRES `DTSTART`,
 * ancrés en 1970 — la règle de changement d'heure. Mesuré le 2026-08-03 : un
 * parseur qui prend la PREMIÈRE occurrence rend une réunion du 29 mars 1970.
 *
 * Celui-ci garde la dernière, et il ne franchit pas `END:VEVENT` : deux raisons
 * indépendantes pour lesquelles le piège ne le touche pas. La garde `inEvent`
 * en est une troisième, et elle n'est PAS observable — la retirer ne rougit
 * aucun test, vérifié par mutation. Elle reste pour le jour où quelqu'un
 * déplacera le `break`.
 */
export function readEvent(ics: string): CalendarEvent | null {
  if (ics === '') return null;

  let inEvent = false;
  let uid = '';
  let summary = '';
  let start: Property | null = null;
  let end: Property | null = null;
  let duration: number | null = null;
  let dedicated = '';
  let conference = '';
  let description = '';

  for (const line of unfold(ics)) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      continue;
    }
    if (trimmed === 'END:VEVENT') break;
    if (!inEvent) continue;

    const property = readProperty(trimmed);
    if (property === null) continue;

    switch (property.name) {
      case 'UID':
        uid = property.value;
        break;
      case 'SUMMARY':
        summary = unescapeText(property.value);
        break;
      case 'DTSTART':
        start = property;
        break;
      case 'DTEND':
        end = property;
        break;
      case 'DURATION':
        duration = readDuration(property.value);
        break;
      case 'X-OPENPAAS-VIDEOCONFERENCE':
        dedicated = property.value.trim();
        break;
      case 'CONFERENCE':
        conference = property.value.trim();
        break;
      case 'DESCRIPTION':
        description = unescapeText(property.value);
        break;
      default:
        break;
    }
  }

  if (start === null) return null;
  const startMs = toInstant(start);
  if (startMs === null) return null;

  // Trois porteurs du même lien dans un ICS réel, par ordre de fiabilité
  // décroissante : la propriété dédiée est structurée, `CONFERENCE` l'est à
  // moitié, `DESCRIPTION` est de la prose où il faut pêcher une URL.
  const meetUrl =
    dedicated !== ''
      ? dedicated
      : conference !== ''
        ? conference
        : (URL_IN_TEXT.exec(description)?.[0] ?? '');
  if (meetUrl === '') return null;

  const endMs =
    end !== null
      ? (toInstant(end) ?? startMs + DEFAULT_DURATION_MS)
      : startMs + (duration ?? DEFAULT_DURATION_MS);

  return { uid, summary, startMs, endMs, meetUrl };
}
