import type { ParticipantView, RoomView } from 'src/call/layout';

// Le nom de l'attribut participant, tel que le backend meet l'écrit
// (`viewsets.py`, `attributes={"handRaisedAt": …}`) et tel que le serveur
// LiveKit le rediffuse. Une constante plutôt qu'un littéral recopié : la
// projection la lit, et les doubles de test doivent porter la même.
export const HAND_ATTRIBUTE = 'handRaisedAt';

// Une main levée, prête à afficher. `raisedAt` est déjà en millisecondes
// d'époque : le tri n'a plus rien à parser.
export type RaisedHand = {
  readonly identity: string;
  readonly name: string;
  readonly raisedAt: number;
  readonly isLocal: boolean;
};

// Contrat backend, verbatim : chaîne vide = main baissée, absence de clé =
// jamais levée, horodatage ISO 8601 = levée. Les deux premiers cas se lisent
// `null` : ils sont indiscernables à l'écran.
export function readHandRaisedAt(
  attributes: Readonly<Record<string, string>> | undefined,
): string | null {
  const raw = attributes?.[HAND_ATTRIBUTE];
  if (raw === undefined || raw === '') return null;
  return raw;
}

export function isHandRaised(participant: ParticipantView): boolean {
  return participant.handRaisedAt !== null;
}

// Le local d'abord parce qu'il est dans la file au même titre que les autres :
// prendre `RoomView` plutôt qu'un tableau rend cette inclusion structurelle.
export function raisedHands(view: RoomView): readonly RaisedHand[] {
  const hands: RaisedHand[] = [];
  for (const participant of [view.local, ...view.remotes]) {
    if (participant.handRaisedAt === null) continue;
    const raisedAt = Date.parse(participant.handRaisedAt);
    if (Number.isNaN(raisedAt)) continue;
    hands.push({
      identity: participant.identity,
      name: participant.name,
      raisedAt,
      isLocal: participant.isLocal,
    });
  }

  return hands.sort((a, b) =>
    a.raisedAt !== b.raisedAt ? a.raisedAt - b.raisedAt : a.identity.localeCompare(b.identity),
  );
}

export function handPosition(hands: readonly RaisedHand[], identity: string): number | null {
  const index = hands.findIndex((hand) => hand.identity === identity);
  return index === -1 ? null : index + 1;
}

// Le complément de `raisedHands()`, qui inclut le local à dessein. Ce qui
// s'affiche sur l'écran principal, lui, ne doit PAS le compter : `HandBanner`
// porte déjà votre propre main sur la ligne du dessus, et l'y compter une
// seconde fois ferait dire « et 1 autre » là où il n'y a personne d'autre.
//
// L'ordre reçu est conservé tel quel — c'est `raisedHands()` qui trie, et il
// n'y a pas de seconde règle d'ordre à nommer ici. `isLocal` est déjà sur
// `RaisedHand` : rien à ajouter au type.
export function otherRaisedHands(hands: readonly RaisedHand[]): readonly RaisedHand[] {
  return hands.filter((hand) => !hand.isLocal);
}
