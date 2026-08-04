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

  it('compte en minutes ET en secondes en deçà d’une heure', () => {
    expect(relativeTo(NOW + 25 * MINUTE + 42000, NOW)).toEqual({
      kind: 'minutes',
      minutes: 25,
      seconds: 42,
    });
  });

  // L'ARRONDI AU SUPÉRIEUR A ÉTÉ RETIRÉ, et ce test garde sa disparition.
  //
  // Il disait « à 30 s du début, dans 1 min », et c'était juste tant que la
  // ligne ne montrait que des minutes : « dans 0 min » se lisait comme une
  // erreur. Le décompte affiche désormais les secondes, et le même arrondi
  // produirait « dans 1 min 30 s » à 30 secondes du début — faux, et faux de
  // trente secondes.
  it('ne gonfle plus la minute quand il ne reste que des secondes', () => {
    expect(relativeTo(NOW + 30000, NOW)).toEqual({ kind: 'minutes', minutes: 0, seconds: 30 });
  });

  it('tronque à la seconde entière', () => {
    // 42,9 s restantes, c'est 42 s : le décompte ne doit pas battre en avance
    // sur l'horloge.
    expect(relativeTo(NOW + 42900, NOW)).toEqual({ kind: 'minutes', minutes: 0, seconds: 42 });
  });

  it('bascule en heures À une heure pile', () => {
    // La seconde polarité du seuil : sans ce cas, un test qui ne vérifie que
    // les minutes passerait contre un seuil placé n'importe où.
    expect(relativeTo(NOW + HOUR, NOW)).toEqual({
      kind: 'hours',
      hours: 1,
      minutes: 0,
      seconds: 0,
    });
  });

  // Les trois nombres DIFFÉRENTS entre eux, et différents du reste : avec
  // `8 h 36 min 36 s`, une implémentation qui recopierait les minutes dans les
  // secondes passerait.
  it('rend heures, minutes ET secondes au-delà du seuil', () => {
    expect(relativeTo(NOW + 8 * HOUR + 36 * MINUTE + 7000, NOW)).toEqual({
      kind: 'hours',
      hours: 8,
      minutes: 36,
      seconds: 7,
    });
  });

  it('tronque les minutes au-delà du seuil, sans arrondir au supérieur', () => {
    // Arrondir ici ferait afficher « 8 h 60 » à la frontière.
    expect(relativeTo(NOW + 8 * HOUR + 59 * MINUTE + 59000, NOW)).toEqual({
      kind: 'hours',
      hours: 8,
      minutes: 59,
      seconds: 59,
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
