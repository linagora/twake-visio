import { useEffect, useRef, useState } from 'react';

import { getActiveAccount } from 'src/auth/accounts';
import { forceRefresh, getAccessToken } from 'src/auth/session';
import type { CalendarEvent } from 'src/calendar/ics';
import { fetchUpcoming, httpStatusOf, sideServiceUrl } from 'src/calendar/sideService';
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
  // `reason` n'est PAS décorative : sans elle, « pas de panneau » couvre quatre
  // causes très différentes et aucune n'est observable depuis l'appareil — les
  // logs JavaScript n'atteignent pas logcat, et le débogueur de Metro refuse
  // les connexions. Mesuré le 2026-08-03 : le panneau était absent et rien ne
  // permettait de dire pourquoi.
  | { readonly status: 'unavailable'; readonly reason: string }
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

// La charge utile d'un JWT est du base64url, sans signature à vérifier ici :
// on ne fait CONFIANCE à rien de ce qu'elle dit, on l'affiche pour diagnostiquer.
function audienceOf(token: string): string {
  try {
    const payload = token.split('.')[1];
    if (payload === undefined) return '(jeton non JWT)';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { aud?: unknown; client_id?: unknown };
    return `aud=${JSON.stringify(claims.aud)} client_id=${String(claims.client_id)}`;
  } catch {
    return '(claims illisibles)';
  }
}

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

    const hide = (reason: string): void => {
      loaded.current = null;
      setState({ status: 'unavailable', reason });
    };

    const load = async (): Promise<void> => {
      const account = getActiveAccount();
      if (account === null) {
        if (!cancelled) hide('aucun compte');
        return;
      }

      const base = sideServiceUrl(account.instance.serverUrl);
      if (base === null) {
        if (!cancelled) hide('hôte indéductible');
        return;
      }

      const outcome = await getAccessToken(account.id, account.instance);
      if (!outcome.ok) {
        if (!cancelled) hide(`jeton: ${outcome.reason}`);
        return;
      }

      // `mayRefresh` n'est vrai qu'au PREMIER essai. Sans cette garde, un
      // service définitivement fermé ferait tourner le SSO en rond, un
      // renouvellement par refus.
      const attempt = async (token: string, mayRefresh: boolean): Promise<void> => {
        try {
          const now = Date.now();
          const all = await fetchUpcoming(base, token, now);
          if (cancelled) return;
          publish(all, now);
        } catch (error: unknown) {
          // Un 401 peut ne rien dire de la session : `getAccessToken` rend le
          // jeton en cache jusqu'à trente secondes de son expiration, donc un
          // jeton frappé AVANT un changement de configuration du SSO survit
          // jusqu'à une heure. Mesuré le 2026-08-03 : l'audience du client
          // `livekit-meet` a été corrigée côté LemonLDAP, et sans ce rejeu le
          // panneau serait resté masqué tout ce temps, correctif en place.
          if (mayRefresh && httpStatusOf(error) === 401) {
            const refreshed = await forceRefresh(account.id, account.instance);
            if (cancelled) return;
            if (refreshed.ok) return attempt(refreshed.token, false);
          }

          // Le 401 qui SUBSISTE, lui, ne dit toujours pas pourquoi. Les claims
          // du jeton, si — et `aud` est le suspect nommé dans le document de
          // conception : le jeton qui fonctionne porte
          // `["visio-widget", "openpaas"]`. Lire l'audience transforme une
          // hypothèse en mesure. `__DEV__` seulement, et jamais le jeton.
          const detail = __DEV__ ? ` ${audienceOf(token)}` : '';
          // Y COMPRIS le 401 d'audience. Voir le document de conception : le
          // service peut refuser un jeton frappé pour `livekit-meet`, et ce
          // refus se lit « pas de calendrier ici », jamais comme une panne.
          if (!cancelled) {
            hide(`${error instanceof Error ? error.message : String(error)}${detail}`);
          }
        }
      };

      await attempt(outcome.token, true);
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
