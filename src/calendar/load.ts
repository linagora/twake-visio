import { getActiveAccount } from 'src/auth/accounts';
import { forceRefresh, getAccessToken } from 'src/auth/session';
import type { CalendarEvent } from 'src/calendar/ics';
import { fetchUpcoming, httpStatusOf, sideServiceUrl } from 'src/calendar/sideService';

/**
 * Pourquoi le panneau ne peut pas s'afficher, du point de vue de la PERSONNE.
 *
 * - `signed-out` : la session est perdue ou absente. Un geste la répare.
 * - `unreachable` : le service ne répond pas. Rien à faire, ça se retente seul.
 * - `unsupported` : cette instance n'expose pas d'agenda. Rien ne le réparera.
 */
export type UpcomingCause = 'signed-out' | 'unreachable' | 'unsupported';

export type LoadOutcome =
  | { readonly ok: true; readonly events: readonly CalendarEvent[]; readonly now: number }
  | { readonly ok: false; readonly cause: UpcomingCause; readonly reason: string };

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

/**
 * Un chargement d'agenda, du compte actif jusqu'aux évènements.
 *
 * **Extrait de `useUpcomingMeetings` pour que la tâche de fond emprunte le même
 * chemin.** Deux implémentations de cette chaîne divergeraient au premier
 * changement, et c'est la reprise sur 401 qui en ferait les frais : la tâche de
 * fond échouerait là où le premier plan réussit, sans que rien ne le montre —
 * un travail de fond ne rend aucun écran rouge.
 *
 * L'annulation N'est PAS gérée ici : elle appartient à l'appelant, qui sait
 * seul s'il est encore monté. Une garde d'annulation à l'intérieur obligerait
 * la tâche de fond, qui n'en a aucune, à en inventer une.
 */
export async function loadUpcoming(): Promise<LoadOutcome> {
  const account = getActiveAccount();
  if (account === null) return { ok: false, cause: 'signed-out', reason: 'aucun compte' };

  const base = sideServiceUrl(account.instance.serverUrl);
  if (base === null) return { ok: false, cause: 'unsupported', reason: 'hôte indéductible' };

  const outcome = await getAccessToken(account.id, account.instance);
  if (!outcome.ok) {
    // Un jeton absent ou REFUSÉ se répare en se reconnectant ; un SSO
    // injoignable ne se répare pas d'ici et se retente seul.
    const cause: UpcomingCause = outcome.reason === 'unavailable' ? 'unreachable' : 'signed-out';
    return { ok: false, cause, reason: `jeton: ${outcome.reason}` };
  }

  // `mayRefresh` n'est vrai qu'au PREMIER essai. Sans cette garde, un service
  // définitivement fermé ferait tourner le SSO en rond, un renouvellement par
  // refus.
  const attempt = async (token: string, mayRefresh: boolean): Promise<LoadOutcome> => {
    try {
      const now = Date.now();
      return { ok: true, events: await fetchUpcoming(base, token, now), now };
    } catch (error: unknown) {
      // Un 401 peut ne rien dire de la session : `getAccessToken` rend le jeton
      // en cache jusqu'à trente secondes de son expiration, donc un jeton
      // frappé AVANT un changement de configuration du SSO survit jusqu'à une
      // heure. Mesuré le 2026-08-03 : l'audience du client `livekit-meet` a été
      // corrigée côté LemonLDAP, et sans ce rejeu le panneau serait resté
      // masqué tout ce temps, correctif en place.
      if (mayRefresh && httpStatusOf(error) === 401) {
        const refreshed = await forceRefresh(account.id, account.instance);
        if (refreshed.ok) return attempt(refreshed.token, false);
      }

      // Le 401 qui SUBSISTE, lui, ne dit toujours pas pourquoi. Les claims du
      // jeton, si — et `aud` est le suspect nommé dans le document de
      // conception : le jeton qui fonctionne porte `["visio-widget",
      // "openpaas"]`. Lire l'audience transforme une hypothèse en mesure.
      // `__DEV__` seulement, et jamais le jeton.
      const detail = __DEV__ ? ` ${audienceOf(token)}` : '';
      // Y COMPRIS le 401 d'audience. Voir le document de conception : le service
      // peut refuser un jeton frappé pour `livekit-meet`, et ce refus se lit
      // « pas de calendrier ici », jamais comme une panne.
      return {
        ok: false,
        cause: 'unreachable',
        reason: `${error instanceof Error ? error.message : String(error)}${detail}`,
      };
    }
  };

  return attempt(outcome.token, true);
}
