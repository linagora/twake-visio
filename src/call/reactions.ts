// Les huit valeurs telles qu'elles circulent sur le fil. Union de chaînes, pas
// `enum` : le dépôt les interdit (`AGENTS.md`), et ce sont les noms courts
// Unicode eux-mêmes, pas un choix esthétique.
export type ReactionKey =
  | 'thumbs-up'
  | 'thumbs-down'
  | 'clapping-hands'
  | 'red-heart'
  | 'face-with-tears-of-joy'
  | 'face-with-open-mouth'
  | 'party-popper'
  | 'folded-hands';

// L'ordre déclaré ici est celui dans lequel `ReactionPicker` (tâche 4) pose
// les huit cibles en grille : quatre par rangée, dans cet ordre, sur deux
// rangées.
export const REACTION_KEYS: readonly ReactionKey[] = [
  'thumbs-up',
  'thumbs-down',
  'clapping-hands',
  'red-heart',
  'face-with-tears-of-joy',
  'face-with-open-mouth',
  'party-popper',
  'folded-hands',
];

const REACTION_GLYPHS: Readonly<Record<ReactionKey, string>> = {
  'thumbs-up': '👍',
  'thumbs-down': '👎',
  'clapping-hands': '👏',
  'red-heart': '❤️',
  'face-with-tears-of-joy': '😂',
  'face-with-open-mouth': '😮',
  'party-popper': '🎉',
  'folded-hands': '🙏',
};

export function reactionGlyph(key: ReactionKey): string {
  return REACTION_GLYPHS[key];
}

// Une réaction prête à afficher. `id` est fourni par l'appelant : un module
// pur n'appelle pas `crypto`, c'est `reactionStore` (tâche 2) qui le fabrique.
export type Reaction = {
  readonly id: string;
  readonly key: ReactionKey;
  readonly identity: string;
  // Vide quand l'émetteur a déjà quitté la salle au moment de la résolution.
  readonly name: string;
  readonly isLocal: boolean;
  // Millisecondes depuis l'époque : `Date.now()`, posé par l'appelant.
  readonly at: number;
};

export const REACTION_BURST = 10;
export const REACTION_WINDOW_MS = 1_000;
export const REACTION_LIFETIME_MS = 3_000;
export const REACTION_MAX_VISIBLE = 6;

// Le JSON exact que meet attend sur le canal sans topic. `<valeur>` est la
// chaîne ReactionKey elle-même : les huit valeurs de meet SONT les noms
// courts Unicode (§5.C9 de la conception).
export function encodeReaction(key: ReactionKey): string {
  return JSON.stringify({ type: 'reactionReceived', data: { emoji: key } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isReactionKey(value: unknown): value is ReactionKey {
  return typeof value === 'string' && REACTION_KEYS.some((candidate) => candidate === value);
}

// Rend `null` pour tout ce qui n'est pas une réaction connue — un autre type,
// un emoji hors liste, un JSON invalide, une valeur qui n'est pas un objet.
// C'est OBLIGATOIRE, pas une omission : le canal sans topic transporte toute
// la famille `NotificationType` de meet (participantMuted, roleChanged,
// screenRecordingStarted, …, §2.3), et cette fonction ne jette jamais.
export function parseReaction(json: string): ReactionKey | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isRecord(value)) return null;
  if (value.type !== 'reactionReceived') return null;
  if (!isRecord(value.data)) return null;

  return isReactionKey(value.data.emoji) ? value.data.emoji : null;
}

// Fenêtre glissante. Une entrée compte contre le budget tant que
// `now - entrée < REACTION_WINDOW_MS` : à la borne exacte, elle est déjà
// hors fenêtre. Rend la décision ET la fenêtre mise à jour — un limiteur qui
// muterait un tableau ne serait pas testable en table.
//
// Un appel REFUSÉ ne grossit pas la liste : seul un appel accepté y ajoute
// `now`. Sans cette règle, une rafale de cinquante appuis en une seconde ne
// libérerait jamais de budget tant qu'elle continue.
export function admitSend(
  recent: readonly number[],
  now: number,
): { readonly allowed: boolean; readonly recent: readonly number[] } {
  const kept = recent.filter((sentAt) => now - sentAt < REACTION_WINDOW_MS);
  if (kept.length >= REACTION_BURST) return { allowed: false, recent: kept };
  return { allowed: true, recent: [...kept, now] };
}

// Ajoute à la fin, et plafonne à REACTION_MAX_VISIBLE en retirant la plus
// ancienne. La conception donne le plafond (§6.4) mais pas qui l'applique :
// c'est ICI, au seul point où la liste grandit — pas dans `ReactionOverlay`,
// qui pose ce qu'on lui donne sans rien décider (voir tâche 5).
export function appendReaction(list: readonly Reaction[], next: Reaction): readonly Reaction[] {
  const appended = [...list, next];
  return appended.length > REACTION_MAX_VISIBLE
    ? appended.slice(appended.length - REACTION_MAX_VISIBLE)
    : appended;
}

// Efface une réaction dont l'âge atteint sa durée de vie. À la borne exacte
// (`now - reaction.at === REACTION_LIFETIME_MS`), elle est déjà effacée.
export function pruneReactions(list: readonly Reaction[], now: number): readonly Reaction[] {
  return list.filter((reaction) => now - reaction.at < REACTION_LIFETIME_MS);
}
