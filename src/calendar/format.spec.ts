import { clockLabel, relativeTo } from 'src/calendar/format';

const NOW = Date.UTC(2026, 7, 3, 8, 0, 0);
const MINUTE = 60000;
const HOUR = 3600000;

describe('relativeTo', () => {
  it('dit « en cours » pour une réunion commencée', () => {
    expect(relativeTo(NOW - MINUTE, NOW)).toEqual({ kind: 'ongoing' });
  });

  it('dit « en cours » à la seconde exacte du début', () => {
    // La borne elle-même. Un `<` au lieu d'un `<=` afficherait « dans 0 min »
    // pendant une seconde, ce qui se lit comme une erreur.
    expect(relativeTo(NOW, NOW)).toEqual({ kind: 'ongoing' });
  });

  it('compte en minutes en deçà d’une heure', () => {
    expect(relativeTo(NOW + 25 * MINUTE, NOW)).toEqual({ kind: 'minutes', minutes: 25 });
  });

  it('arrondit au supérieur, pour ne jamais afficher zéro', () => {
    // À 30 secondes du début, « dans 1 min » ; un arrondi à l'inférieur dirait
    // « dans 0 min » alors que la réunion n'a pas commencé.
    expect(relativeTo(NOW + 30000, NOW)).toEqual({ kind: 'minutes', minutes: 1 });
  });

  it('bascule en heures À une heure pile', () => {
    // La seconde polarité du seuil : sans ce cas, un test qui ne vérifie que
    // les minutes passerait contre un seuil placé n'importe où.
    expect(relativeTo(NOW + HOUR, NOW)).toEqual({ kind: 'hours', hours: 1, minutes: 0 });
  });

  it('rend heures ET minutes au-delà du seuil', () => {
    expect(relativeTo(NOW + 8 * HOUR + 36 * MINUTE, NOW)).toEqual({
      kind: 'hours',
      hours: 8,
      minutes: 36,
    });
  });

  it('tronque les minutes au-delà du seuil, sans arrondir au supérieur', () => {
    // Arrondir ici ferait afficher « 8 h 60 » à la frontière.
    expect(relativeTo(NOW + 8 * HOUR + 59 * MINUTE + 59000, NOW)).toEqual({
      kind: 'hours',
      hours: 8,
      minutes: 59,
    });
  });
});

describe('clockLabel', () => {
  it("rend l'heure locale sur deux chiffres", () => {
    // Construit en heure LOCALE pour que le test ne dépende pas du fuseau de
    // la machine qui l'exécute : c'est la lecture, pas la conversion, qu'on
    // vérifie ici.
    const nineThirty = new Date(2026, 7, 3, 9, 30, 0).getTime();

    expect(clockLabel(nineThirty)).toBe('09:30');
  });

  it('complète les minutes à deux chiffres', () => {
    const fivePastThree = new Date(2026, 7, 3, 15, 5, 0).getTime();

    expect(clockLabel(fivePastThree)).toBe('15:05');
  });
});
