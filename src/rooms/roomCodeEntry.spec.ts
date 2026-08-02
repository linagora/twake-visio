import {
  CODE_GROUPS,
  formatCodeSlug,
  isCompleteCode,
  normalizeCodeInput,
  splitCodeGroups,
} from 'src/rooms/roomCodeEntry';

describe('normalizeCodeInput', () => {
  it('met en minuscules', () => {
    expect(normalizeCodeInput('OGO')).toBe('ogo');
  });

  // Le geste le plus courant : coller « ogo-kmyy-qrl » depuis un message.
  it('jette les tirets d’un code collé', () => {
    expect(normalizeCodeInput('ogo-kmyy-qrl')).toBe('ogokmyyqrl');
  });

  // meet tire ses codes dans [a-z] seulement (`roomCode.ts`), donc un chiffre
  // ne peut pas en faire partie : l'accepter afficherait une case remplie pour
  // une saisie qui ne joindra jamais rien.
  it('jette les chiffres', () => {
    expect(normalizeCodeInput('og0k1')).toBe('ogk');
  });

  it('jette les espaces', () => {
    expect(normalizeCodeInput('ogo kmyy qrl')).toBe('ogokmyyqrl');
  });

  // La borne doit être franchie ET non franchie.
  it('tronque au-delà de dix lettres', () => {
    expect(normalizeCodeInput('abcdefghijklmno')).toBe('abcdefghij');
  });

  it('ne tronque pas en deçà de dix', () => {
    expect(normalizeCodeInput('abc')).toBe('abc');
  });

  it('rend une chaîne vide pour une saisie vide', () => {
    expect(normalizeCodeInput('')).toBe('');
  });
});

describe('splitCodeGroups', () => {
  it('découpe un code complet en 3-4-3', () => {
    expect(splitCodeGroups('ogokmyyqrl')).toEqual(['ogo', 'kmyy', 'qrl']);
  });

  // Les trois états partiels : premier groupe entamé, deuxième entamé,
  // troisième entamé. Sans eux, des bornes fausses passeraient sur le seul cas
  // complet.
  it('découpe un premier groupe entamé', () => {
    expect(splitCodeGroups('og')).toEqual(['og', '', '']);
  });

  it('découpe un deuxième groupe entamé', () => {
    expect(splitCodeGroups('ogok')).toEqual(['ogo', 'k', '']);
  });

  it('découpe un troisième groupe entamé', () => {
    expect(splitCodeGroups('ogokmyyq')).toEqual(['ogo', 'kmyy', 'q']);
  });

  it('découpe un code vide', () => {
    expect(splitCodeGroups('')).toEqual(['', '', '']);
  });

  // La somme des groupes est la longueur du mockup : trois cases, quatre,
  // trois. Ce test fige le contrat que la feuille rendra en dix cases.
  it('décrit dix cases en trois groupes', () => {
    expect(CODE_GROUPS).toEqual([3, 4, 3]);
    expect(CODE_GROUPS.reduce((a, b) => a + b, 0)).toBe(10);
  });
});

describe('isCompleteCode', () => {
  // Les deux états, chacun avec sa fixture.
  it('reconnaît un code de dix lettres', () => {
    expect(isCompleteCode('ogokmyyqrl')).toBe(true);
  });

  it('refuse un code plus court', () => {
    expect(isCompleteCode('ogokmyyqr')).toBe(false);
  });

  it('refuse une saisie vide', () => {
    expect(isCompleteCode('')).toBe(false);
  });
});

describe('formatCodeSlug', () => {
  // Le slug que meet attend porte les tirets ; la saisie ne les a pas.
  it('rend les tirets au code complet', () => {
    expect(formatCodeSlug('ogokmyyqrl')).toBe('ogo-kmyy-qrl');
  });

  // Un code partiel n'est pas un slug : rendre « ogo-k- » ferait construire
  // une URL qui ne joindra rien.
  it('rend null pour un code incomplet', () => {
    expect(formatCodeSlug('ogok')).toBe(null);
  });
});
