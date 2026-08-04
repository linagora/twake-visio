import type { CalendarEvent } from 'src/calendar/ics';
import { selectWindow } from 'src/calendar/upcoming';
import { parseMeetingLink } from 'src/navigation/deepLinks';

// Les quatre délais proposés, du plus large au plus court. L'ordre est celui de
// la liste affichée ; le premier choix, « Jamais », n'est pas ici parce qu'il
// n'est pas un délai mais son absence — voir `reminderLeadMinutes` dans
// `src/settings/preferences.ts`, où `null` le porte.
export const LEAD_MINUTES = [60, 30, 15, 5] as const;
export type LeadMinutes = (typeof LEAD_MINUTES)[number];

export function isLeadMinutes(value: number): value is LeadMinutes {
  return (LEAD_MINUTES as readonly number[]).includes(value);
}

export type Reminder = {
  readonly id: string;
  readonly fireAtMs: number;
  readonly title: string;
  readonly startMs: number;
  readonly slug: string;
};

// L'identifiant est dérivé de l'`uid` de l'évènement, donc stable d'une
// programmation à l'autre. Il ne sert pas à retrouver un rappel — on annule
// tout puis on repose — mais à rendre les journaux lisibles quand un rappel se
// déclenche au mauvais moment.
export function reminderId(uid: string): string {
  return `reminder:${uid}`;
}

/**
 * Les rappels à poser, calculés et rien d'autre.
 *
 * **Pure, et c'est le point.** Aucun appel à `expo-notifications`, aucune
 * horloge lue à l'intérieur : `now` est un paramètre. C'est ce qui permet à une
 * fixture de rendre chaque condition vraie ET fausse, et donc de tester le
 * comportement plutôt que de constater qu'il ne jette pas.
 *
 * Deux conditions y décident, et deux seulement :
 *
 * 1. le lien de la réunion est analysable, ou non ;
 * 2. l'instant du rappel est encore devant, ou déjà derrière.
 *
 * La seconde couvre aussi le cas d'une réunion **déjà commencée** : son
 * `startMs` étant passé, `startMs - lead` l'est nécessairement aussi. Un
 * troisième test sur « a commencé » serait donc mort, et une mutation ne le
 * ferait jamais rougir.
 *
 * La fenêtre, le tri et la déduplication ne sont pas refaits ici : ils
 * appartiennent à `selectWindow`, qui les porte pour l'accueil comme pour les
 * rappels. Deux implémentations de la même règle divergeraient au premier
 * changement.
 */
export function planReminders(
  events: readonly CalendarEvent[],
  leadMinutes: number,
  now: number,
  allowedHosts: readonly string[],
): readonly Reminder[] {
  const lead = leadMinutes * 60_000;
  const plan: Reminder[] = [];

  for (const event of selectWindow(events, now)) {
    // Le MÊME analyseur et la MÊME liste d'hôtes que « Rejoindre » sur
    // l'accueil (`src/screens/home.tsx`). Un lien qu'on ne sait pas lire ne
    // produit aucun rappel, plutôt qu'un rappel dont le bouton échouerait une
    // fois la personne réveillée par lui.
    const slug = parseMeetingLink(event.meetUrl, allowedHosts);
    if (slug === null) continue;

    const fireAtMs = event.startMs - lead;
    if (fireAtMs <= now) continue;

    plan.push({
      id: reminderId(event.uid),
      fireAtMs,
      title: event.summary,
      startMs: event.startMs,
      slug,
    });
  }

  return plan;
}
