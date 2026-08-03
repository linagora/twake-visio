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
 * Les prochaines visioconférences, triées, dédupliquées et tronquées.
 *
 * `now` est un PARAMÈTRE et non un `Date.now()` lu à l'intérieur : c'est ce qui
 * permet à une fixture de rendre chaque borne vraie ET fausse. Une fonction qui
 * lit l'horloge elle-même ne peut être testée qu'à l'instant où elle tourne.
 */
export function selectUpcoming(
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

  // Le tri PRÉCÈDE la troncature. L'inverse rendrait trois évènements valides
  // mais pas les trois prochains.
  return kept.sort((a, b) => a.startMs - b.startMs).slice(0, MAX_EVENTS);
}
