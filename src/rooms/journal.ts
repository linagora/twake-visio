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
// La durée est portée par `endedAt`, `null` tant que la visite n'est pas close.
//
// Elle était reportée au lot de l'écran d'appel : l'obtenir demande un point
// d'accroche à la FIN de l'appel, donc dans `call.tsx`, que quatorze branches se
// disputaient. Elles ont toutes atterri, et la dette est payée.
//
// `null` plutôt qu'une durée de zéro : une visite en cours et une visite d'une
// seconde ne sont pas la même chose, et l'écran doit pouvoir les distinguer.
export type MeetingVisit = {
  readonly slug: string;
  readonly title: string;
  readonly joinedAt: number;
  readonly endedAt: number | null;
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
  const next = [{ slug, title: trimmed, joinedAt, endedAt: null }, ...readAll()]
    .sort(byMostRecent)
    .slice(0, MAX_VISITS);
  store.set(VISITS_KEY, JSON.stringify(next));
}

// Clôt la visite la plus récente d'un salon.
//
// La PLUS RÉCENTE, pas la première rencontrée : rejoindre deux fois le même
// salon laisse deux traces, et c'est celle qu'on vient de quitter qu'il faut
// fermer. `listVisits` les rend déjà triées, la première est donc la bonne.
//
// Trois refus, chacun pour une raison :
// — un salon absent du journal : quitter un salon jamais journalisé ne doit
//   rien casser ;
// — une visite déjà close : une seconde clôture écraserait la vraie durée ;
// — une fin ANTÉRIEURE au début : l'horloge de l'appareil peut reculer, et une
//   durée négative s'afficherait telle quelle.
export function rememberVisitEnd(slug: string, endedAt: number): void {
  const all = [...readAll()].sort(byMostRecent);
  const index = all.findIndex((visit) => visit.slug === slug && visit.endedAt === null);
  if (index === -1) return;
  const visit = all[index] as MeetingVisit;
  if (endedAt < visit.joinedAt) return;
  all[index] = { ...visit, endedAt };
  store.set(VISITS_KEY, JSON.stringify(all));
}

export function listVisits(): readonly MeetingVisit[] {
  return [...readAll()].sort(byMostRecent);
}

// Réservé aux tests : remet le journal dans l'état d'une installation neuve.
export function resetJournal(): void {
  store.remove(VISITS_KEY);
}
