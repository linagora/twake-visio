import type { CalendarEvent } from 'src/calendar/ics';

// La fenêtre reprend celle du widget web : une heure derrière, vingt-quatre
// devant.
//
// L'heure derrière n'est pas une marge de confort, c'est le cas d'usage
// principal : on rejoint une réunion en retard bien plus souvent qu'en avance,
// et une réunion en cours doit rester joignable jusqu'à sa fin.
export const WINDOW_BEHIND_MS = 3600000;
export const WINDOW_AHEAD_MS = 24 * 3600000;

// Trois, comme le panneau web, et non les cinq que le widget autorise. Un
// écran de téléphone n'en montre pas davantage sans repousser le reste hors de
// vue.
export const MAX_EVENTS = 3;

/**
 * Tout ce que la fenêtre retient : trié, dédupliqué, **non tronqué**.
 *
 * Extrait de `selectUpcoming` pour que les rappels de réunion s'appuient sur la
 * même règle sans hériter de sa troncature. `MAX_EVENTS` est une contrainte
 * d'AFFICHAGE — une carte d'accueil ne montre pas plus de trois lignes — et une
 * notification n'a pas cette contrainte : une journée à six réunions est
 * justement celle où l'on en oublie une.
 *
 * `now` est un PARAMÈTRE et non un `Date.now()` lu à l'intérieur : c'est ce qui
 * permet à une fixture de rendre chaque borne vraie ET fausse. Une fonction qui
 * lit l'horloge elle-même ne peut être testée qu'à l'instant où elle tourne.
 */
export function selectWindow(
  events: readonly CalendarEvent[],
  now: number,
): readonly CalendarEvent[] {
  const behind = now - WINDOW_BEHIND_MS;
  const ahead = now + WINDOW_AHEAD_MS;

  const seen = new Set<string>();
  const kept: CalendarEvent[] = [];

  for (const event of events) {
    // Deux bornes, et elles ne portent PAS sur la même extrémité : on garde ce
    // qui n'est pas encore fini et qui a déjà commencé, ou commencera bientôt.
    if (event.endMs <= behind) continue;
    if (event.startMs >= ahead) continue;

    // Un évènement partagé arrive une fois par agenda qui le porte.
    if (seen.has(event.uid)) continue;
    seen.add(event.uid);

    kept.push(event);
  }

  return kept.sort((a, b) => a.startMs - b.startMs);
}

/**
 * Les prochaines visioconférences telles que l'accueil les montre.
 *
 * Le tri PRÉCÈDE la troncature, et c'est `selectWindow` qui le fait : l'inverse
 * rendrait trois évènements valides mais pas les trois prochains.
 */
export function selectUpcoming(
  events: readonly CalendarEvent[],
  now: number,
): readonly CalendarEvent[] {
  return selectWindow(events, now).slice(0, MAX_EVENTS);
}
