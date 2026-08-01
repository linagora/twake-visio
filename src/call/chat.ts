// `lk.chat` n'est PAS une constante de `livekit-client` : la recherche
// exhaustive des littéraux `lk.*` dans 2.18.0 n'en donne qu'un,
// `lk.agent.pre-connect-audio-buffer`. Le topic du chat vient de
// `@livekit/components-core`, qui n'est pas une dépendance déclarée de cette
// application. On l'écrit donc en dur, ici, une seule fois — et c'est cette
// constante que le magasin enregistre et que l'émission vise.
export const CHAT_TOPIC = 'lk.chat';

// La valeur de meet : au-delà d'une minute de silence, le message suivant
// reprend son en-tête d'auteur, même s'il vient de la même personne.
export const CHAT_GROUPING_MS = 60_000;

// Borne d'ÉMISSION seulement ; en réception, `readAll()` reconstitue n'importe
// quelle longueur et rien n'est tronqué. `sendText` découpe en
// `splitUtf8(text, 15_000)`, c'est-à-dire en OCTETS : 2 000 caractères tiennent
// sous cette borne pour n'importe quel texte, donc l'émission reste sur le
// chemin mono-chunk — le seul que la conception ait éprouvé.
export const CHAT_MAX_LENGTH = 2_000;

export type ChatMessage = {
  // `TextStreamInfo.id`, celui du SDK. Unique par flux, pas par salon : deux
  // émetteurs peuvent porter le même. La paire (id, identity) est la vraie
  // clé — voir `appendMessage` et `messageKey`.
  readonly id: string;
  readonly identity: string;
  // Vide quand l'émetteur a déjà quitté la salle : le nom se résout sur la
  // `Room` au moment de la réception, et la coquille pose son propre repli.
  readonly name: string;
  readonly body: string;
  readonly sentAt: number;
  readonly editedAt: number | null;
  readonly isLocal: boolean;
};

// La clé de liste ET de testID. Elle porte les deux moitiés de l'identité d'un
// message : un `id` seul ne les distingue pas, et deux vignettes qui
// partageraient une clé échangeraient leur contenu au moindre changement de
// liste.
export function messageKey(message: ChatMessage): string {
  return `${message.identity}#${message.id}`;
}

// LA règle de correction. Un message de même `id` ET de même `identity`
// REMPLACE l'existant EN PLACE, en conservant le `sentAt` d'origine et en
// posant `editedAt` ; sinon il est ajouté à la fin. L'ignorer produit un
// doublon à l'écran, pas une donnée manquante — c'est ainsi que le web édite.
//
// Même `id` mais identité DIFFÉRENTE : ajouté, jamais fusionné. Un participant
// ne réécrit pas le message d'un autre en rejouant son identifiant de flux.
//
// En place, et non déplacé en fin de fil : une correction de faute de frappe
// ne doit pas faire sauter le message hors de la conversation qu'il commente.
export function appendMessage(
  log: readonly ChatMessage[],
  incoming: ChatMessage,
): readonly ChatMessage[] {
  const existing = log.find(
    (message) => message.id === incoming.id && message.identity === incoming.identity,
  );
  if (existing === undefined) return [...log, incoming];

  const merged: ChatMessage = { ...incoming, sentAt: existing.sentAt, editedAt: incoming.sentAt };
  return log.map((message) => (message === existing ? merged : message));
}

// Le point de lecture est un ENSEMBLE DE CLÉS, et surtout pas un horodatage.
//
// `sentAt` vient de l'horloge de l'ÉMETTEUR : livekit-client le prend du
// `Date.now()` du pair dans `streamText`. Un repère temporel devait donc être
// le maximum du fil — prendre `Date.now()` local aurait laissé non lu, pour
// toujours, le message d'un pair en avance. Mais ce maximum se fait empoisonner
// par ce même pair, dans l'autre sens : un seul message daté d'une heure devant
// hissait le repère au-dessus de toutes les horloges honnêtes, et le compte
// tombait définitivement à zéro — pour tout le monde, pour le reste de la
// séance. Mesuré : dix messages attendus, zéro obtenu. Les deux directions ne
// pouvaient pas être fermées ensemble, parce qu'aucune borne temporelle n'est
// comparable entre deux horloges qu'on ne contrôle pas.
//
// Une clé ne dépend d'aucune horloge, et elle est stable à l'édition —
// `appendMessage` fusionne en place sans toucher à `id` ni à `identity` — donc
// un message relu ne redevient pas non lu parce que son auteur l'a corrigé.
// C'est exactement ce que la borne stricte sur `sentAt` obtenait, sans le
// prix.
//
// Les siens ne sont jamais non lus : on vient de les écrire.
export function unreadCount(log: readonly ChatMessage[], readKeys: ReadonlySet<string>): number {
  return log.filter((message) => !message.isLocal && !readKeys.has(messageKey(message))).length;
}

// Vrai quand la ligne doit porter son en-tête d'auteur : premier message, ou
// émetteur différent du précédent, ou plus de CHAT_GROUPING_MS depuis lui.
// Exactement CHAT_GROUPING_MS ne l'ouvre pas.
export function startsGroup(log: readonly ChatMessage[], index: number): boolean {
  const message = log[index];
  if (message === undefined) return false;
  const previous = log[index - 1];
  if (previous === undefined) return true;
  if (previous.identity !== message.identity) return true;
  return message.sentAt - previous.sentAt > CHAT_GROUPING_MS;
}

// Coupe les blancs, tronque à CHAT_MAX_LENGTH, rend `null` si rien ne reste.
// Le composant n'envoie que sur un non-`null` : il n'a aucune règle à lui.
//
// La coupe recule d'une unité UTF-16 quand elle tomberait entre les deux
// moitiés d'une paire de substitution — un demi-emoji à l'écran, et un U+FFFD
// sur le fil après encodage. C'est la même discipline que `splitUtf8` côté SDK.
export function normaliseBody(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= CHAT_MAX_LENGTH) return trimmed;

  const cut = trimmed.slice(0, CHAT_MAX_LENGTH);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}
