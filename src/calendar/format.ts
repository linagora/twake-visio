// Ce que la ligne dit du délai, SANS le formuler : la mise en mots est faite
// par le composant, qui seul a `t`. Une fonction pure qui rendrait « dans 8 h »
// serait intraduisible et intestable dans les sept langues du dépôt.
export type Relative =
  | { readonly kind: 'ongoing' }
  | { readonly kind: 'minutes'; readonly minutes: number }
  | { readonly kind: 'hours'; readonly hours: number; readonly minutes: number };

const MINUTE_MS = 60000;
const HOUR_MS = 3600000;

/**
 * Le délai avant une réunion, ou le fait qu'elle a commencé.
 *
 * `now` est un paramètre, jamais l'horloge lue à l'intérieur : sans quoi aucune
 * fixture ne peut rendre les trois formes.
 *
 * Le seuil est à l'heure PLEINE : en dessous on compte en minutes, au-dessus en
 * heures et minutes. C'est ce que fait le panneau web, à ceci près qu'il affiche
 * aussi les secondes — retirées ici, voir `useUpcoming`.
 */
export function relativeTo(startMs: number, now: number): Relative {
  const delta = startMs - now;
  // Une réunion commencée est « en cours » : afficher « dans -3 min » serait
  // exact et illisible.
  if (delta <= 0) return { kind: 'ongoing' };

  if (delta < HOUR_MS) {
    // Arrondi au SUPÉRIEUR : à 59 s du début, « dans 1 min » est plus juste que
    // « dans 0 min », qui se lirait comme « c'est passé ».
    return { kind: 'minutes', minutes: Math.max(1, Math.ceil(delta / MINUTE_MS)) };
  }

  const hours = Math.floor(delta / HOUR_MS);
  return { kind: 'hours', hours, minutes: Math.floor((delta % HOUR_MS) / MINUTE_MS) };
}

/**
 * L'heure de début, dans le fuseau de l'APPAREIL.
 *
 * C'est volontaire et c'est la seule lecture juste : la personne lit son écran
 * là où elle est. Un évènement à 09:30 à Paris s'affiche 08:30 pour qui est à
 * Londres, ce qui est l'heure à laquelle elle devra se connecter.
 */
export function clockLabel(startMs: number): string {
  const date = new Date(startMs);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
