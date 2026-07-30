import { findRoomTitle, forgetRoomTitle, rememberRoomTitle } from 'src/rooms/titles';

describe('titres de salon', () => {
  afterEach(() => {
    forgetRoomTitle('abc-defg-hij');
    forgetRoomTitle('klm-nopq-rst');
  });

  it('rend un intitulé enregistré', () => {
    rememberRoomTitle('abc-defg-hij', 'Point hebdo');

    expect(findRoomTitle('abc-defg-hij')).toBe('Point hebdo');
  });

  it('rend null pour un salon dont on ne sait rien', () => {
    // Le cas courant : un salon créé sur un autre appareil, ou par quelqu'un
    // d'autre. L'appelant affiche alors le code, qui est au moins exact.
    expect(findRoomTitle('klm-nopq-rst')).toBe(null);
  });

  it('ne confond pas deux salons', () => {
    rememberRoomTitle('abc-defg-hij', 'Point hebdo');
    rememberRoomTitle('klm-nopq-rst', 'Revue');

    expect(findRoomTitle('abc-defg-hij')).toBe('Point hebdo');
    expect(findRoomTitle('klm-nopq-rst')).toBe('Revue');
  });

  it('retire les espaces autour', () => {
    rememberRoomTitle('abc-defg-hij', '  Point hebdo  ');

    expect(findRoomTitle('abc-defg-hij')).toBe('Point hebdo');
  });

  it("n'enregistre pas un intitulé vide", () => {
    // Sans cette garde, la liste afficherait une ligne vide à la place du code,
    // qui est au moins exact.
    rememberRoomTitle('abc-defg-hij', '   ');

    expect(findRoomTitle('abc-defg-hij')).toBe(null);
  });

  it('oublie un intitulé sur demande', () => {
    rememberRoomTitle('abc-defg-hij', 'Point hebdo');

    forgetRoomTitle('abc-defg-hij');

    expect(findRoomTitle('abc-defg-hij')).toBe(null);
  });
});
