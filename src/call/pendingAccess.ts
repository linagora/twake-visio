import type { RoomAccess } from 'src/call/types';

/**
 * Le passage de main entre la salle d'attente et la séance.
 *
 * **Sans lui, un invité admis ne peut PAS entrer.** `request-entry` rend le
 * jeton LiveKit au moment de l'admission ; `lobby.tsx` le jetait et naviguait,
 * et `call.tsx` redemandait l'accès par `fetchRoomAccess`. Or meet n'inclut le
 * bloc `livekit` pour un anonyme que sur un salon `public` — lu dans son
 * sérialiseur, `should_access_room` exige `is_public`, un rôle, ou un compte
 * authentifié sur un salon `trusted`. Le second appel ne rendait donc jamais de
 * jeton : la personne était admise, puis renvoyée à la salle d'attente. Une
 * boucle dont rien ne sortait.
 *
 * Le même défaut frappait un COMPTE admis sur un salon `restricted` sans rôle,
 * plus rarement — `trusted` court-circuitant par `is_authenticated`.
 *
 * **En mémoire, jamais dans MMKV.** Un jeton LiveKit est un secret ; il vit six
 * heures et n'a aucune raison de survivre au processus. `src/auth/storage.ts`
 * pose la même règle dans l'autre sens.
 *
 * **Consommé UNE fois.** Un jeton laissé en place serait repris par une entrée
 * ultérieure dans un autre salon si le slug venait à coïncider, et surtout il
 * masquerait un vrai échec de `fetchRoomAccess` en le remplaçant par un accès
 * périmé.
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
