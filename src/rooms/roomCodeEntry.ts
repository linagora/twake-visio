// La saisie d'un code de salon, en logique pure.
//
// Elle vit hors du composant pour que la feuille « Rejoindre » soit testable
// sans piloter dix cases : tout ce qui décide — normaliser, découper, savoir si
// c'est complet — s'éprouve ici, et le rendu n'a plus qu'à afficher.
//
// Le format vient du client web de meet, dont `src/api/roomCode.ts` cite le
// motif relevé dans son bundle : `[a-z]{3}-[a-z]{4}-[a-z]{3}`.

// Trois cases, quatre, trois — les groupes du mockup, qui sont aussi ceux du
// motif ci-dessus. Exporté parce que la feuille rend ses cases depuis là :
// deux constantes à tenir d'accord seraient une de trop.
export const CODE_GROUPS = [3, 4, 3] as const;

const CODE_LENGTH = CODE_GROUPS.reduce((total, group) => total + group, 0);

// `[a-z]` seulement, et c'est une contrainte, pas une commodité : meet tire ses
// codes dans cet alphabet (`roomCode.ts:16`). Accepter un chiffre remplirait
// une case pour une saisie qui ne joindra jamais rien.
//
// Les tirets sont jetés plutôt que refusés : coller « ogo-kmyy-qrl » depuis un
// message est le geste le plus courant, et l'exiger sans tirets serait une
// exigence que rien n'explique à l'écran.
export function normalizeCodeInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .slice(0, CODE_LENGTH);
}

// Le tuple est construit explicitement plutôt que par `map`.
//
// `CODE_GROUPS.map(…)` rend un `string[]`, que seul un `as unknown as` aurait
// pu présenter comme un triplet — et le dépôt interdit cette double-assertion
// hors fichiers de spec. Le vrai correctif est de dire au type ce qui est vrai,
// pas de le contraindre : il y a exactement trois groupes.
export function splitCodeGroups(code: string): readonly [string, string, string] {
  const [first, second, third] = CODE_GROUPS;
  return [
    code.slice(0, first),
    code.slice(first, first + second),
    code.slice(first + second, first + second + third),
  ];
}

export function isCompleteCode(code: string): boolean {
  return code.length === CODE_LENGTH;
}

// Le slug que meet attend porte les tirets ; la saisie ne les a pas.
//
// Rend `null` plutôt qu'un slug tronqué sur un code incomplet : « ogo-k- »
// construirait une URL qui ne joindra rien, et l'appelant doit savoir qu'il n'y
// a pas de salon à demander.
export function formatCodeSlug(code: string): string | null {
  if (!isCompleteCode(code)) return null;
  return splitCodeGroups(code).join('-');
}
