import type { CalendarEvent } from 'src/calendar/ics';
import { MAX_EVENTS, WINDOW_AHEAD_MS } from 'src/calendar/upcoming';
import {
  LEAD_MINUTES,
  isLeadMinutes,
  planReminders,
  reminderId,
} from 'src/notifications/reminders';

// Le même instant de référence que `upcoming.spec.ts` : 2026-08-03 à 08:00 UTC.
const NOW = Date.UTC(2026, 7, 3, 8, 0, 0);
const MINUTE = 60000;
const HOUR = 3600000;

const HOSTS = ['meet.twake-dev.maudet.cloud'];

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    uid: 'u',
    summary: 'Réunion',
    startMs: NOW + 2 * HOUR,
    endMs: NOW + 3 * HOUR,
    meetUrl: 'https://meet.twake-dev.maudet.cloud/aaa-bbb-ccc',
    ...overrides,
  };
}

describe('planReminders', () => {
  describe('le lien de la réunion', () => {
    // Première conditionnelle, ses deux polarités. La fixture par défaut porte
    // un lien analysable ; celle-ci porte un hôte hors de la liste, donc
    // `parseMeetingLink` rend `null`.
    it('pose un rappel quand le lien est analysable', () => {
      expect(planReminders([event()], 15, NOW, HOSTS).map((r) => r.slug)).toEqual(['aaa-bbb-ccc']);
    });

    it("n'en pose AUCUN quand l'hôte du lien est inconnu", () => {
      const ailleurs = event({ meetUrl: 'https://ailleurs.example/aaa-bbb-ccc' });

      expect(planReminders([ailleurs], 15, NOW, HOSTS)).toEqual([]);
    });

    it("n'en pose AUCUN quand l'URL n'en est pas une", () => {
      expect(planReminders([event({ meetUrl: 'pas une url' })], 15, NOW, HOSTS)).toEqual([]);
    });
  });

  describe("l'instant du rappel", () => {
    // Seconde conditionnelle. La même réunion, le même délai, et seul `now`
    // change : c'est ce qui fait basculer la condition et rien d'autre.
    it('pose un rappel quand son instant est encore devant', () => {
      const dans2h = event({ startMs: NOW + 2 * HOUR });

      expect(planReminders([dans2h], 15, NOW, HOSTS).map((r) => r.fireAtMs)).toEqual([
        NOW + 2 * HOUR - 15 * MINUTE,
      ]);
    });

    it("n'en pose AUCUN quand son instant est déjà passé", () => {
      // Réunion dans dix minutes, rappel demandé quinze minutes avant :
      // l'instant du rappel est derrière nous.
      const dans10min = event({ startMs: NOW + 10 * MINUTE, endMs: NOW + 70 * MINUTE });

      expect(planReminders([dans10min], 15, NOW, HOSTS)).toEqual([]);
    });

    it("n'en pose AUCUN pour une réunion DÉJÀ COMMENCÉE", () => {
      // `selectWindow` la garde — on rejoint une réunion en retard —, mais son
      // rappel n'a plus lieu d'être. C'est la même condition qui l'écarte, pas
      // une troisième : `startMs` étant passé, `startMs - lead` l'est aussi.
      const encours = event({ startMs: NOW - 10 * MINUTE, endMs: NOW + 50 * MINUTE });

      expect(planReminders([encours], 15, NOW, HOSTS)).toEqual([]);
    });

    it('déplace le rappel quand le délai change', () => {
      // Sans ce test, remplacer `leadMinutes * 60_000` par une constante
      // resterait vert : un seul délai ne prouve pas qu'il est LU.
      const e = event({ startMs: NOW + 2 * HOUR });

      expect(planReminders([e], 60, NOW, HOSTS)[0]?.fireAtMs).toBe(NOW + HOUR);
      expect(planReminders([e], 5, NOW, HOSTS)[0]?.fireAtMs).toBe(NOW + 2 * HOUR - 5 * MINUTE);
    });
  });

  describe('la fenêtre, héritée de selectWindow', () => {
    it('ignore une réunion au-delà de vingt-quatre heures', () => {
      const loin = event({
        startMs: NOW + WINDOW_AHEAD_MS + HOUR,
        endMs: NOW + WINDOW_AHEAD_MS + 2 * HOUR,
      });

      expect(planReminders([loin], 15, NOW, HOSTS)).toEqual([]);
    });

    it('ne TRONQUE pas à trois, à la différence de l’accueil', () => {
      // Le point de la conception : `MAX_EVENTS` est une contrainte d'affichage
      // de la carte d'accueil, pas une règle de rappel. Sans ce test, remettre
      // un `.slice(0, MAX_EVENTS)` dans le chemin des rappels resterait vert.
      const six = Array.from({ length: 6 }, (_, i) =>
        event({ uid: `e${i}`, startMs: NOW + (i + 2) * HOUR, endMs: NOW + (i + 3) * HOUR }),
      );

      expect(planReminders(six, 15, NOW, HOSTS)).toHaveLength(6);
      expect(six.length).toBeGreaterThan(MAX_EVENTS);
    });

    it('ne pose qu’un rappel pour un évènement porté par deux agendas', () => {
      const a = event({ uid: 'partage' });
      const b = event({ uid: 'partage' });

      expect(planReminders([a, b], 15, NOW, HOSTS)).toHaveLength(1);
    });
  });

  describe('ce que porte un rappel', () => {
    // Chaque champ est une cible de mutation distincte : les recenser ensemble
    // sans les assertir séparément laisserait passer une inversion.
    it("porte l'intitulé, le début et un identifiant dérivé de l'uid", () => {
      const e = event({ uid: 'point-hebdo', summary: 'Point hebdo', startMs: NOW + 3 * HOUR });

      expect(planReminders([e], 30, NOW, HOSTS)[0]).toEqual({
        id: 'reminder:point-hebdo',
        fireAtMs: NOW + 3 * HOUR - 30 * MINUTE,
        title: 'Point hebdo',
        startMs: NOW + 3 * HOUR,
        slug: 'aaa-bbb-ccc',
      });
    });
  });
});

describe('reminderId', () => {
  it("préfixe l'uid, pour qu'un identifiant de rappel se reconnaisse", () => {
    expect(reminderId('abc')).toBe('reminder:abc');
  });
});

describe('isLeadMinutes', () => {
  it('accepte les quatre délais proposés', () => {
    expect(LEAD_MINUTES.every((m) => isLeadMinutes(m))).toBe(true);
  });

  it('refuse une valeur qui ne figure pas dans la liste', () => {
    // Le garde-fou qui protège une préférence écrite par une version
    // antérieure, comme `isSupportedLocale` le fait pour la langue.
    expect(isLeadMinutes(45)).toBe(false);
  });
});
