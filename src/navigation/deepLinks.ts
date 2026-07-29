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

// Reconnaissance positive d'abord : un identifiant généré est un salon sans
// discussion possible. À défaut, un salon nommé porte un slug — mais un
// fichier statique servi à la racine (favicon.ico, site.webmanifest) contient
// un point et n'en est pas un.
function isRoomSegment(segment: string): boolean {
  if (GENERATED_ROOM_ID.test(segment)) return true;
  return !RESERVED_SEGMENTS.has(segment) && !segment.includes('.');
}

export function parseMeetingLink(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const segments = parsed.pathname.split('/').filter((s) => s.length > 0);

  if (parsed.protocol === `${APP_SCHEME}:`) {
    // twakevisio://room/<slug> — l'hôte porte « room ».
    if (parsed.host !== 'room') return null;
    const candidate = segments[0];
    if (candidate === undefined) return null;
    return isRoomSegment(candidate) ? candidate : null;
  }

  const first = segments[0];
  if (first === undefined || segments.length !== 1) return null;
  return isRoomSegment(first) ? first : null;
}
