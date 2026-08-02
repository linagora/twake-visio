import { createMMKV } from 'react-native-mmkv';

// Le journal des réunions rejointes, gardé sur l'appareil.
//
// Même motif et même raison que `src/rooms/titles.ts` : `/api/v1.0/rooms/` ne
// renvoie que `{ id, slug, name, access_level }`, sans aucune date. Le dépôt le
// dit déjà en `src/screens/home.tsx:50` — « trier par une date qu'on n'a pas
// vue serait deviner ».
//
// Conséquence assumée, à dire plutôt qu'à masquer : l'historique est celui de
// CET appareil. Une réunion rejointe depuis le web n'y figure pas.
//
// La DURÉE n'y est pas, et c'est délibéré. L'obtenir demanderait un point
// d'accroche à la fin de l'appel, donc dans `call.tsx`, que quatorze branches se
// disputent au moment où ceci est écrit. Reportée au lot de l'écran d'appel :
// l'heure d'entrée est exacte, une durée devinée ne le serait pas.
export type MeetingVisit = {
  readonly slug: string;
  readonly title: string;
  readonly joinedAt: number;
};

// Borne de sécurité, même réflexe que `MAX_ROOM_PAGES` (`src/api/rooms.ts:57`).
// Sans plafond, le magasin croît sans fin sur un appareil de longue vie.
export const MAX_VISITS = 200;

const store = createMMKV({ id: 'room-journal' });
const VISITS_KEY = 'visits';

// `joinedAt` est un PARAMÈTRE et non un `Date.now()` interne : un magasin qui
// lit l'horloge lui-même ne peut pas être testé sur l'ordre sans faire avancer
// le temps réel. Le dépôt appelle ce trou par son nom — « `sinceFor` sans
// horloge qui avance ».
function readAll(): readonly MeetingVisit[] {
  const raw = store.getString(VISITS_KEY);
  if (raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    // Un historique illisible se vide, il ne fait pas planter l'onglet : rien
    // ne garantit que la chaîne soit encore du JSON valide après une mise à
    // jour interrompue.
    return Array.isArray(parsed) ? (parsed as readonly MeetingVisit[]) : [];
  } catch {
    return [];
  }
}

function byMostRecent(a: MeetingVisit, b: MeetingVisit): number {
  return b.joinedAt - a.joinedAt;
}

export function rememberVisit(slug: string, title: string, joinedAt: number): void {
  const trimmed = title.trim();
  // Un intitulé vide n'en est pas un : l'enregistrer ferait une ligne sans rien
  // à afficher. Même garde que `rememberRoomTitle`.
  if (trimmed.length === 0) return;
  const next = [{ slug, title: trimmed, joinedAt }, ...readAll()]
    .sort(byMostRecent)
    .slice(0, MAX_VISITS);
  store.set(VISITS_KEY, JSON.stringify(next));
}

export function listVisits(): readonly MeetingVisit[] {
  return [...readAll()].sort(byMostRecent);
}

// Réservé aux tests : remet le journal dans l'état d'une installation neuve.
export function resetJournal(): void {
  store.remove(VISITS_KEY);
}
