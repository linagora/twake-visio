import { useEffect, useRef, useState } from 'react';

import type { CalendarEvent } from 'src/calendar/ics';
import { loadUpcoming, type UpcomingCause } from 'src/calendar/load';
import { selectUpcoming } from 'src/calendar/upcoming';

export type { UpcomingCause };

/**
 * Trois états, et le premier n'est PAS une erreur.
 *
 * `unavailable` couvre tout ce qui empêche de servir le panneau : aucun compte,
 * un hôte indéductible, un jeton refusé, un service injoignable, un `401`
 * d'audience. Dans tous ces cas le panneau ne se rend pas — c'est le contrat du
 * widget web, « toute erreur masque le widget », pour que l'accueil n'ait
 * jamais l'air cassé.
 *
 * `ready` avec une liste vide est DIFFÉRENT : le calendrier répond, il n'y a
 * simplement rien de prévu. Confondre les deux ferait croire l'application
 * cassée à qui n'a pas de réunion aujourd'hui.
 */
export type UpcomingState =
  | { readonly status: 'loading' }
  // `reason` n'est PAS décorative : sans elle, « pas de panneau » couvre quatre
  // causes très différentes et aucune n'est observable depuis l'appareil — les
  // logs JavaScript n'atteignent pas logcat, et le débogueur de Metro refuse
  // les connexions. Mesuré le 2026-08-03 : le panneau était absent et rien ne
  // permettait de dire pourquoi.
  // `cause` est TYPÉE, `reason` reste libre, et les deux servent deux publics.
  //
  // `reason` porte le détail technique — un code HTTP, une audience de jeton —
  // et n'est lue qu'en développement. `cause` est ce que l'écran montre à la
  // personne : trois situations qui appellent trois phrases et trois gestes
  // différents. Les confondre produisait « agenda indisponible — jeton:
  // no-session », qui ne dit à personne qu'il suffit de se reconnecter.
  | { readonly status: 'unavailable'; readonly cause: UpcomingCause; readonly reason: string }
  | { readonly status: 'ready'; readonly events: readonly CalendarEvent[]; readonly now: number };

// DEUX cadences, et il faut les deux. Le widget web fait de même.
//
// Les DONNÉES viennent d'un service CalDAV : trois requêtes enchaînées, plus
// un REPORT par agenda. Une minute est déjà généreux.
//
// Le DÉCOMPTE, lui, doit battre la seconde, sinon « dans 6 h 45 min 12 s »
// afficherait douze secondes pendant une minute entière — un compteur figé se
// lit comme une application bloquée.
//
// Le tic ne redemande rien : il republie les évènements déjà en mémoire avec
// un instant frais. Confondre les deux ferait soixante fois plus de requêtes.
const REFRESH_MS = 60000;
const TICK_MS = 1000;

export function useUpcomingMeetings(): UpcomingState {
  const [state, setState] = useState<UpcomingState>({ status: 'loading' });
  // Les évènements du dernier chargement RÉUSSI, et `null` dès qu'un
  // chargement échoue. C'est ce que le tic de la seconde republie ; sans cette
  // remise à `null`, un agenda devenu injoignable laisserait le panneau
  // afficher indéfiniment ses dernières réunions.
  const loaded = useRef<readonly CalendarEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const publish = (all: readonly CalendarEvent[], now: number): void => {
      loaded.current = all;
      setState({ status: 'ready', events: selectUpcoming(all, now), now });
    };

    const hide = (cause: UpcomingCause, reason: string): void => {
      loaded.current = null;
      setState({ status: 'unavailable', cause, reason });
    };

    const load = async (): Promise<void> => {
      // Le chargement vit dans `src/calendar/load.ts`, que la tâche de fond des
      // rappels emprunte aussi. L'annulation reste ICI : elle est propre au
      // cycle de vie du composant, et la tâche de fond n'en a aucune.
      const outcome = await loadUpcoming();
      if (cancelled) return;
      if (outcome.ok) publish(outcome.events, outcome.now);
      else hide(outcome.cause, outcome.reason);
    };

    void load();
    const refresh = setInterval(() => void load(), REFRESH_MS);
    const tick = setInterval(() => {
      const all = loaded.current;
      if (all === null) return;
      publish(all, Date.now());
    }, TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, []);

  return state;
}
