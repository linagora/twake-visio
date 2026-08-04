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

// ————————————————————————————————————————————————————————————————————————
// Ce que le PRESSE-PAPIERS peut rendre, à la différence d'un lien profond.
//
// `parseMeetingLink` ci-dessus garde son allowlist et n'est PAS touchée : un
// lien profond arrive sans qu'on l'ait demandé, et l'allowlist est ce qui
// empêche un message hostile de faire ouvrir un salon étranger.
//
// Coller est l'inverse : un appui délibéré, dont l'hôte est montré avant que
// quoi que ce soit ne parte. D'où deux fonctions, et non un drapeau sur une
// seule — un drapeau se met à faux par erreur, une fonction séparée non.
export type PastedTarget = { readonly slug: string; readonly host: string | null };

// `null` en hôte veut dire « aucune information d'hôte dans ce qui a été
// collé » — l'appelant garde le sien. Ce n'est PAS « hôte inconnu ».
const BARE_CODE = /^[a-z]{3}-?[a-z]{4}-?[a-z]{3}$/i;

const EMBEDDED_URL = /https:\/\/[^\s<>"']+/i;

// La ponctuation qui termine une phrase, pas une URL. « Rendez-vous ici :
// https://…/abc-defg-hij. » est la forme sous laquelle un lien circule
// vraiment, et sans ce retrait le point final entre dans le segment, que
// SLUG_CHARSET refuse alors — un refus que rien n'expliquerait à l'écran.
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

function fromUrl(candidate: string): PastedTarget | null {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  if (parsed.protocol === `${APP_SCHEME}:`) {
    if (parsed.host !== 'room') return null;
    const segment = parsed.pathname.split('/').filter((s) => s.length > 0)[0];
    if (segment === undefined) return null;
    return isRoomSegment(segment) ? { slug: segment, host: null } : null;
  }

  if (parsed.protocol !== 'https:') return null;

  const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
  const first = segments[0];
  if (first === undefined || segments.length !== 1) return null;
  if (!isRoomSegment(first)) return null;
  return { slug: first, host: parsed.host.toLowerCase() };
}

export function parsePastedMeeting(text: string): PastedTarget | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const whole = fromUrl(trimmed);
  if (whole !== null) return whole;

  const embedded = EMBEDDED_URL.exec(trimmed);
  if (embedded !== null) {
    const found = fromUrl(embedded[0].replace(TRAILING_PUNCTUATION, ''));
    if (found !== null) return found;
  }

  // Le motif est appliqué au TEXTE ENTIER, jamais après normalisation.
  //
  // `normalizeCodeInput` jette tout ce qui n'est pas [a-z] puis tronque à dix :
  // lui passer « Rejoins-moi : abc-defg-hij » lui ferait rendre dix lettres,
  // donc un code « complet », donc parfaitement bogus — dix cases remplies et
  // une proposition de rejoindre un salon qui n'existe pas.
  if (BARE_CODE.test(trimmed)) return { slug: trimmed, host: null };

  return null;
}

/**
 * Les hôtes autorisés à fournir un salon depuis l'AGENDA de la personne.
 *
 * Ce n'est PAS `listKnownHosts()`, qui est l'allowlist de ce qui arrive du
 * dehors et ne contient que les instances de production : sur toute autre,
 * « Rejoindre » n'aurait rien fait, en silence. Ici l'évènement vient de
 * l'agenda de la personne, sur SON instance : c'est cet hôte-là qui fait
 * autorité, et lui seul.
 *
 * Vide quand l'URL est illisible, ce qui REFERME la porte plutôt que de
 * l'ouvrir.
 */
export function agendaHosts(serverUrl: string): readonly string[] {
  try {
    return [new URL(serverUrl).hostname];
  } catch {
    return [];
  }
}
