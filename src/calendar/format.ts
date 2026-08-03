// Ce que la ligne dit du délai, SANS le formuler : la mise en mots est faite
// par le composant, qui seul a `t`. Une fonction pure qui rendrait « dans 8 h »
// serait intraduisible et intestable dans les sept langues du dépôt.
export type Relative =
  | { readonly kind: 'ongoing' }
  | { readonly kind: 'minutes'; readonly minutes: number; readonly seconds: number }
  | {
      readonly kind: 'hours';
      readonly hours: number;
      readonly minutes: number;
      readonly seconds: number;
    };

const HOUR_MS = 3600000;

/**
 * Le délai avant une réunion, ou le fait qu'elle a commencé.
 *
 * `now` est un paramètre, jamais l'horloge lue à l'intérieur : sans quoi aucune
 * fixture ne peut rendre les trois formes.
 *
 * Le seuil est à l'heure PLEINE : en dessous on compte en minutes et secondes,
 * au-dessus en heures, minutes et secondes. C'est ce que fait le panneau web,
 * secondes comprises — `useUpcoming` bat donc la seconde pour les animer.
 *
 * **Tout est TRONQUÉ, jamais arrondi au supérieur.** Ce module a d'abord
 * arrondi les minutes, pour ne pas afficher « dans 0 min » à trente secondes du
 * début — un zéro qui se lisait « c'est passé ». Les secondes rendent cet
 * arrondi FAUX : à trente secondes du début il dirait « dans 1 min 30 s ». Le
 * zéro qu'il évitait ne gêne plus, puisqu'une seconde l'accompagne toujours.
 */
export function relativeTo(startMs: number, now: number): Relative {
  const delta = startMs - now;
  // Une réunion commencée est « en cours » : afficher « dans -3 min » serait
  // exact et illisible.
  if (delta <= 0) return { kind: 'ongoing' };

  // Une seule troncature, en tête : compter ensuite sur des secondes entières
  // évite qu'un reste de millisecondes fasse diverger les trois nombres.
  const total = Math.floor(delta / 1000);
  const seconds = total % 60;

  if (delta < HOUR_MS) return { kind: 'minutes', minutes: Math.floor(total / 60), seconds };

  return {
    kind: 'hours',
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds,
  };
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
