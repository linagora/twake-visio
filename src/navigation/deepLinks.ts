import { APP_SCHEME } from 'src/constants';

// Chemins servis par l'application web qui ne désignent jamais un salon.
const RESERVED_SEGMENTS = new Set(['api', 'admin', 'static', 'media', 'callback']);

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
    const candidate = parsed.host === 'room' ? segments[0] : null;
    return candidate ?? null;
  }

  const first = segments[0];
  if (first === undefined || RESERVED_SEGMENTS.has(first)) return null;
  return segments.length === 1 ? first : null;
}
