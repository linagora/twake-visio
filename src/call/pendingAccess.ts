import type { RoomAccess } from 'src/call/types';

/**
 * Le passage de main entre ce qui fait entrer et la séance.
 *
 * Seule une demande d'entrée délivre un jeton LiveKit : `join/`, que poste le
 * pré-join, ou `request-entry`, que scrute la salle d'attente. La séance n'en
 * demande aucun : elle part de celui que l'un des deux a mis de côté ici, et
 * renvoie au pré-join quand il n'y a rien.
 *
 * Redemander ne servirait d'ailleurs à rien pour qui sort de la salle
 * d'attente : `join/` ne regarde que le niveau d'accès, l'authentification et
 * le rôle (`can_bypass_lobby`), jamais une admission. Une personne admise s'y
 * verrait renvoyer à l'attente, en boucle.
 *
 * **En mémoire, jamais dans MMKV.** Un jeton LiveKit est un secret ; il vit six
 * heures et n'a aucune raison de survivre au processus. `src/auth/storage.ts`
 * pose la même règle dans l'autre sens.
 *
 * **Consommé UNE fois.** Un jeton laissé en place serait repris par une entrée
 * ultérieure dans un autre salon si le slug venait à coïncider, et surtout il
 * servirait une seconde entrée sans qu'aucune demande ne soit refaite : le
 * serveur ne pourrait plus la refuser, ni la salle d'attente s'interposer.
 */
let pending: { readonly slug: string; readonly access: RoomAccess } | null = null;

export function stashRoomAccess(slug: string, access: RoomAccess): void {
  pending = { slug, access };
}

/**
 * Rend l'accès mis de côté pour CE salon, et l'oublie.
 *
 * Le slug est vérifié : sans cela, une admission abandonnée laisserait son
 * jeton servir à l'ouverture du salon suivant, qui n'a aucune raison d'être le
 * même.
 */
export function takeRoomAccess(slug: string): RoomAccess | null {
  if (pending === null || pending.slug !== slug) return null;
  const { access } = pending;
  pending = null;
  return access;
}

export function clearPendingAccess(): void {
  pending = null;
}
