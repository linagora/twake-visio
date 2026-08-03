import { useEffect, useState } from 'react';

import { getActiveAccount } from 'src/auth/accounts';
import { getAccessToken } from 'src/auth/session';
import type { CalendarEvent } from 'src/calendar/ics';
import { fetchUpcoming, sideServiceUrl } from 'src/calendar/sideService';
import { selectUpcoming } from 'src/calendar/upcoming';

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
  | { readonly status: 'unavailable' }
  | { readonly status: 'ready'; readonly events: readonly CalendarEvent[]; readonly now: number };

// Une minute. Le widget web recharge à la même cadence et réaffiche à la
// seconde ; on garde le rechargement et on laisse tomber le tic, qui réveille
// le fil JavaScript trois mille six cents fois par heure pour une information
// que personne ne lit à ce grain.
const REFRESH_MS = 60000;

export function useUpcomingMeetings(): UpcomingState {
  const [state, setState] = useState<UpcomingState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      const account = getActiveAccount();
      if (account === null) {
        if (!cancelled) setState({ status: 'unavailable' });
        return;
      }

      const base = sideServiceUrl(account.instance.serverUrl);
      if (base === null) {
        if (!cancelled) setState({ status: 'unavailable' });
        return;
      }

      const outcome = await getAccessToken(account.id, account.instance);
      if (!outcome.ok) {
        if (!cancelled) setState({ status: 'unavailable' });
        return;
      }

      try {
        const now = Date.now();
        const all = await fetchUpcoming(base, outcome.token, now);
        if (cancelled) return;
        setState({ status: 'ready', events: selectUpcoming(all, now), now });
      } catch {
        // Y COMPRIS le 401 d'audience. Voir le document de conception : le
        // service peut refuser un jeton frappé pour `livekit-meet`, et ce
        // refus se lit « pas de calendrier ici », jamais comme une panne.
        if (!cancelled) setState({ status: 'unavailable' });
      }
    };

    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return state;
}
