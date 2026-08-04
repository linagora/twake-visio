import { useEffect, useState } from 'react';

import { loadUpcoming } from 'src/calendar/load';

/**
 * L'agenda répond-il ? Une seule fois, à l'ouverture.
 *
 * **Pas `useUpcomingMeetings`**, et c'est délibéré : ce crochet-là bat la
 * seconde pour animer un décompte, et republie donc son état soixante fois par
 * minute. Monté dans les Réglages, il ferait rendre l'écran entier à chaque
 * tic, pour un booléen qui ne change pas.
 *
 * `null` tant qu'on ne sait pas. L'appelant ne rend rien dans cet état plutôt
 * que de faire apparaître une ligne qui disparaîtrait aussitôt.
 */
export function useAgendaAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadUpcoming().then((outcome) => {
      if (!cancelled) setAvailable(outcome.ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}
