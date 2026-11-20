import { computeEntryQuery } from 'src/call/entryChoices';

describe('computeEntryQuery', () => {
  it('écrit les deux choix, chacun à sa place', () => {
    expect(computeEntryQuery({ camera: '0', mic: '1' })).toBe('?camera=0&mic=1');
    // Les valeurs inverses : un ordre ou une valeur codés en dur passeraient
    // le premier cas.
    expect(computeEntryQuery({ camera: '1', mic: '0' })).toBe('?camera=1&mic=0');
  });

  it("n'écrit pas un choix absent, pour que la séance retombe sur les Réglages", () => {
    expect(computeEntryQuery({ mic: '0' })).toBe('?mic=0');
    expect(computeEntryQuery({ camera: '1' })).toBe('?camera=1');
  });

  it("ne rend rien quand aucun choix n'a été fait", () => {
    expect(computeEntryQuery({})).toBe('');
  });

  it("échappe une valeur, qu'un lien profond peut fabriquer", () => {
    expect(computeEntryQuery({ camera: '1&mic=1' })).toBe('?camera=1%26mic%3D1');
    expect(computeEntryQuery({ mic: '0#x' })).toBe('?mic=0%23x');
  });
});
