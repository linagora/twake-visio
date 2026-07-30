import { APP_SCHEME } from 'src/constants';

// Chemins à segment unique servis par l'application web de meet, qui ne
// désignent jamais un salon. Relevés dans src/frontend/src/routes.ts en amont.
const RESERVED_SEGMENTS = new Set([
  'api',
  'admin',
  'static',
  'media',
  'callback',
  'sdk',
  'feedback',
  'mentions-legales',
  'accessibilite',
  'conditions-utilisation',
]);

// Identifiant de salon généré par meet : trois groupes alphanumériques 3-4-3,
// tirets optionnels. Reprend flexibleRoomIdPattern de l'amont.
const GENERATED_ROOM_ID = /^[a-zA-Z0-9]{3}-?[a-zA-Z0-9]{4}-?[a-zA-Z0-9]{3}$/;

// Un slug de salon vient de slugify() côté serveur, un identifiant généré du
// motif 3-4-3 : les deux tiennent dans cet alphabet. Le vérifier d'abord tue
// d'un coup les points (favicon.ico), le percent-encoding (favicon%2eico) et
// tout ce à quoi on n'a pas pensé — là où une liste de cas interdits laisse
// toujours passer celui qu'on n'a pas anticipé.
const SLUG_CHARSET = /^[a-zA-Z0-9-]+$/;

function isRoomSegment(segment: string): boolean {
  if (!SLUG_CHARSET.test(segment)) return false;
  if (GENERATED_ROOM_ID.test(segment)) return true;
  return !RESERVED_SEGMENTS.has(segment);
}

// allowedHosts est obligatoire et sans valeur par défaut : un lien de réunion
// n'a de sens que rapporté à une instance connue. Sans ce contrôle, n'importe
// quel site — ou un mailto: — fait ouvrir un salon dans l'application, et
// l'utilisateur ne peut rien y faire sans désinstaller.
export function parseMeetingLink(url: string, allowedHosts: readonly string[]): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol === `${APP_SCHEME}:`) {
    // twakevisio://room/<slug> — l'hôte porte « room ».
    if (parsed.host !== 'room') return null;
    const candidate = parsed.pathname.split('/').filter((s) => s.length > 0)[0];
    if (candidate === undefined) return null;
    return isRoomSegment(candidate) ? candidate : null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (!allowedHosts.includes(parsed.host.toLowerCase())) return null;

  const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
  const first = segments[0];
  if (first === undefined || segments.length !== 1) return null;
  return isRoomSegment(first) ? first : null;
}
