import { createMMKV } from 'react-native-mmkv';

// Un intitulé lisible, gardé sur l'appareil.
//
// meet ne peut pas le porter. Son modèle impose `slug = slugify(name)`, et le
// routeur du client web n'accepte que la forme `xxx-yyyy-zzz` : le nom d'un
// salon joignable depuis un navigateur *est* son code. Le champ `configuration`
// existe et s'écrit, mais le sérialiseur de liste n'expose que
// `id, name, slug, access_level` — un titre qui y serait rangé demanderait une
// requête de détail par salon, ce qui est hors de question sur une liste qui en
// compte des dizaines.
//
// Conséquence assumée, à dire à l'utilisateur plutôt qu'à masquer : l'intitulé
// ne suit pas la réunion. La personne qui la crée le voit, celle qui la rejoint
// voit le code. Le rendre partagé demande un champ de titre chez
// `suitenumerique/meet`.
const store = createMMKV({ id: 'room-titles' });

function keyFor(slug: string): string {
  return `title:${slug}`;
}

export function rememberRoomTitle(slug: string, title: string): void {
  const trimmed = title.trim();
  // Un intitulé vide n'en est pas un : le stocker ferait afficher une ligne
  // sans rien à la place du code, qui est au moins exact.
  if (trimmed.length === 0) return;
  store.set(keyFor(slug), trimmed);
}

export function findRoomTitle(slug: string): string | null {
  return store.getString(keyFor(slug)) ?? null;
}

export function forgetRoomTitle(slug: string): void {
  store.remove(keyFor(slug));
}
