import type { CalendarEvent } from 'src/calendar/ics';
import { WINDOW_AHEAD_MS, WINDOW_BEHIND_MS, selectUpcoming } from 'src/calendar/upcoming';

// Un instant de référence lisible : 2026-08-03 à 08:00 UTC, soit 10:00 à Paris.
const NOW = Date.UTC(2026, 7, 3, 8, 0, 0);
const MINUTE = 60000;
const HOUR = 3600000;

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    uid: 'u',
    summary: 'Réunion',
    startMs: NOW + HOUR,
    endMs: NOW + 2 * HOUR,
    meetUrl: 'https://meet.twake-dev.maudet.cloud/aaa-bbb-ccc',
    ...overrides,
  };
}

describe('selectUpcoming', () => {
  it('garde un évènement à venir dans la fenêtre', () => {
    const soon = event({ uid: 'soon', startMs: NOW + HOUR, endMs: NOW + 2 * HOUR });

    expect(selectUpcoming([soon], NOW).map((e) => e.uid)).toEqual(['soon']);
  });

  it('garde un évènement DÉJÀ COMMENCÉ mais non terminé', () => {
    // Le cas qui compte le plus : on rejoint une réunion en retard bien plus
    // souvent qu'on ne la rejoint en avance. La fenêtre part donc dans le passé.
    const running = event({ uid: 'running', startMs: NOW - 30 * MINUTE, endMs: NOW + 30 * MINUTE });

    expect(selectUpcoming([running], NOW).map((e) => e.uid)).toEqual(['running']);
  });

  it('garde une LONGUE réunion commencée avant la borne et toujours en cours', () => {
    // Le test qui distingue « la fenêtre borne la FIN » de « elle borne le
    // DÉBUT ». Une réunion de trois heures entamée il y a deux heures est
    // encore joignable ; borner le début la ferait disparaître de l'écran
    // pendant qu'elle se tient.
    //
    // Mesuré par mutation : sans ce cas, remplacer `endMs` par `startMs` dans
    // la borne du passé ne rougissait RIEN.
    const long = event({ uid: 'long', startMs: NOW - 2 * HOUR, endMs: NOW + HOUR });

    expect(selectUpcoming([long], NOW).map((e) => e.uid)).toEqual(['long']);
  });

  it('jette un évènement terminé', () => {
    // La seconde polarité de la garde ci-dessus. Sans elle, « déjà commencé »
    // passerait aussi contre une implémentation qui ne regarde que le début.
    const over = event({ uid: 'over', startMs: NOW - 2 * HOUR, endMs: NOW - HOUR });

    expect(selectUpcoming([over], NOW)).toEqual([]);
  });

  it('jette un évènement trop loin dans le futur', () => {
    const far = event({
      uid: 'far',
      startMs: NOW + WINDOW_AHEAD_MS + MINUTE,
      endMs: NOW + WINDOW_AHEAD_MS + HOUR,
    });

    expect(selectUpcoming([far], NOW)).toEqual([]);
  });

  it('garde un évènement juste AVANT le bord du futur', () => {
    // La borne elle-même, des deux côtés : un test qui ne vérifie que le rejet
    // passerait contre une fenêtre nulle.
    const edge = event({
      uid: 'edge',
      startMs: NOW + WINDOW_AHEAD_MS - MINUTE,
      endMs: NOW + WINDOW_AHEAD_MS + HOUR,
    });

    expect(selectUpcoming([edge], NOW).map((e) => e.uid)).toEqual(['edge']);
  });

  it('jette un évènement terminé juste avant le bord du passé', () => {
    const stale = event({
      uid: 'stale',
      startMs: NOW - WINDOW_BEHIND_MS - 2 * HOUR,
      endMs: NOW - WINDOW_BEHIND_MS - MINUTE,
    });

    expect(selectUpcoming([stale], NOW)).toEqual([]);
  });

  it('trie par heure de début, quel que soit l’ordre reçu', () => {
    // Le serveur rend les évènements par agenda, pas par heure : les trois de
    // la mesure du 2026-08-03 sont arrivés COCO, Point BC, COMEX alors que
    // Point BC est le dernier de la journée.
    const coco = event({ uid: 'coco', startMs: NOW + HOUR, endMs: NOW + 2 * HOUR });
    const pointBc = event({ uid: 'point-bc', startMs: NOW + 7 * HOUR, endMs: NOW + 8 * HOUR });
    const comex = event({ uid: 'comex', startMs: NOW + 3 * HOUR, endMs: NOW + 4 * HOUR });

    expect(selectUpcoming([coco, pointBc, comex], NOW).map((e) => e.uid)).toEqual([
      'coco',
      'comex',
      'point-bc',
    ]);
  });

  it('ne rend jamais plus de trois évènements', () => {
    const many = [1, 2, 3, 4, 5].map((n) =>
      event({ uid: `e${n}`, startMs: NOW + n * HOUR, endMs: NOW + n * HOUR + MINUTE }),
    );

    expect(selectUpcoming(many, NOW).map((e) => e.uid)).toEqual(['e1', 'e2', 'e3']);
  });

  it('garde les TROIS premiers, pas trois au hasard', () => {
    // La troncature s'applique APRÈS le tri. L'inverse rendrait trois évènements
    // corrects mais pas les trois bons, ce qu'un test sur le seul compte ne
    // verrait pas.
    const late = event({ uid: 'late', startMs: NOW + 9 * HOUR, endMs: NOW + 10 * HOUR });
    const early = event({ uid: 'early', startMs: NOW + MINUTE, endMs: NOW + HOUR });
    const others = [2, 3, 4].map((n) =>
      event({ uid: `e${n}`, startMs: NOW + n * HOUR, endMs: NOW + n * HOUR + MINUTE }),
    );

    expect(selectUpcoming([late, ...others, early], NOW).map((e) => e.uid)).toEqual([
      'early',
      'e2',
      'e3',
    ]);
  });

  it('rend une liste vide sans évènement', () => {
    expect(selectUpcoming([], NOW)).toEqual([]);
  });

  it('déduplique par UID, un évènement pouvant vivre dans deux agendas', () => {
    // Un évènement partagé apparaît une fois par agenda qui le porte. Deux
    // lignes identiques dans le panneau se liraient comme deux réunions.
    const once = event({ uid: 'shared', startMs: NOW + HOUR, endMs: NOW + 2 * HOUR });
    const twice = event({ uid: 'shared', startMs: NOW + HOUR, endMs: NOW + 2 * HOUR });

    expect(selectUpcoming([once, twice], NOW)).toHaveLength(1);
  });
});
