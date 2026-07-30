import { getRandomBytes } from 'expo-crypto';

// Le client web de meet route sur un code de dix lettres minuscules, affiché en
// trois groupes. Son bundle porte le motif en clair :
//
//   "[a-z]{3}-[a-z]{4}-[a-z]{3}"
//
// Laisser le serveur dériver le slug du nom produisait « test-mobile », que ce
// routeur refuse — mesuré : https://meet.linagora.com/test-mobile répond
// « Vérifier votre code de réunion ». Un salon créé depuis le mobile était donc
// injoignable depuis le web, et son lien impartageable.
//
// Effet de bord bienvenu : un code tiré au sort ne peut plus entrer en
// collision avec le nom d'un salon existant, ce qui supprime le refus
// « Room with this Slug already exists » sur un nom déjà utilisé.
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const CODE_LENGTH = 10;

// 26 ne divise pas 256 : prendre `octet % 26` favoriserait les six premières
// lettres. On rejette la queue non divisible plutôt que d'introduire ce biais
// dans un code dont la difficulté à deviner est la seule protection d'un salon
// public.
const REJECT_AT = 256 - (256 % LETTERS.length);

export function generateRoomCode(): string {
  let out = '';
  while (out.length < CODE_LENGTH) {
    for (const byte of getRandomBytes(CODE_LENGTH)) {
      if (byte >= REJECT_AT) continue;
      out += LETTERS[byte % LETTERS.length];
      if (out.length === CODE_LENGTH) break;
    }
  }
  return `${out.slice(0, 3)}-${out.slice(3, 7)}-${out.slice(7)}`;
}
