import { siblingHost } from 'src/calendar/hosts';

// L'étiquette d'hôte de l'agenda WEB sur les instances Twake actuelles.
//
// `calendar-ng`, et non `calendar` : mesuré le 2026-08-03 sur l'instance de
// développement, `calendar.<domaine>` rend 404 et seul `calendar-ng.<domaine>`
// sert Twake Calendar. Le side-service annonce pourtant `calendar.<domaine>`
// dans son `spa.calendar.url` — cette valeur est PÉRIMÉE, elle désigne l'ancien
// frontal, et s'y fier donnerait un lien mort.
//
// Le suffixe « -ng » sent la migration : le jour où l'agenda reprend le nom
// `calendar`, c'est cette constante qu'on change, et elle seule.
const CALENDAR_HOST_LABEL = 'calendar-ng';

/**
 * Le lien web vers un évènement, pour aller le consulter dans l'agenda.
 *
 * `null` quand l'hôte ne se déduit pas ou que l'évènement n'a pas
 * d'identifiant : l'appelant ne rend alors pas l'icône du tout, plutôt que
 * d'offrir un lien qui ne mène nulle part.
 */
export function calendarEventUrl(serverUrl: string, uid: string): string | null {
  if (uid === '') return null;
  const base = siblingHost(serverUrl, CALENDAR_HOST_LABEL);
  if (base === null) return null;
  // Un UID d'iCalendar n'a aucune contrainte de caractères (RFC 5545 §3.8.4.7).
  // Sans encodage, un `#` ou un `?` couperait l'URL en deux.
  return `${base}/events/${encodeURIComponent(uid)}`;
}
