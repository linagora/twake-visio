import { parsePastedMeeting } from 'src/navigation/deepLinks';

describe('parsePastedMeeting', () => {
  describe("une URL, l'hôte étant rapporté tel quel", () => {
    it("rend le slug et l'hôte d'une instance connue", () => {
      expect(parsePastedMeeting('https://meet.linagora.com/abc-defg-hij')).toEqual({
        slug: 'abc-defg-hij',
        host: 'meet.linagora.com',
      });
    });

    it('ACCEPTE un hôte hors allowlist, en le rapportant', () => {
      expect(parsePastedMeeting('https://meet.acme.com/abc-defg-hij')).toEqual({
        slug: 'abc-defg-hij',
        host: 'meet.acme.com',
      });
    });

    // AUCUN test sur la casse de l'hôte, et c'est délibéré : `new URL()`
    // normalise déjà le sien pour un scheme spécial, donc une assertion dessus
    // serait verte que `.toLowerCase()` soit là ou non. Mesuré le 2026-08-04 en
    // mutant l'implémentation — la suite est restée entièrement verte.

    it('ignore une chaîne de requête', () => {
      expect(parsePastedMeeting('https://meet.acme.com/abc-defg-hij?utm=mail')?.slug).toBe(
        'abc-defg-hij',
      );
    });

    it('refuse un segment réservé', () => {
      expect(parsePastedMeeting('https://meet.acme.com/callback')).toBe(null);
    });

    it('refuse un chemin à plusieurs segments', () => {
      expect(parsePastedMeeting('https://meet.acme.com/a/b')).toBe(null);
    });

    it('refuse http en clair', () => {
      expect(parsePastedMeeting('http://meet.acme.com/abc-defg-hij')).toBe(null);
    });
  });

  describe('une URL noyée dans un message', () => {
    it("l'extrait du texte qui l'entoure", () => {
      expect(parsePastedMeeting('Rejoins-moi : https://meet.acme.com/abc-defg-hij à 14 h')).toEqual(
        { slug: 'abc-defg-hij', host: 'meet.acme.com' },
      );
    });

    it('retire le point qui termine la phrase, pas le slug', () => {
      expect(parsePastedMeeting('On se voit là https://meet.acme.com/abc-defg-hij.')).toEqual({
        slug: 'abc-defg-hij',
        host: 'meet.acme.com',
      });
    });

    it('rend null quand le texte ne porte aucune URL exploitable', () => {
      expect(parsePastedMeeting('Rejoins-moi https://meet.acme.com/mentions-legales')).toBe(null);
    });
  });

  describe('le schéma applicatif', () => {
    it("rend le slug SANS hôte : le lien n'en porte aucun", () => {
      expect(parsePastedMeeting('twakevisio://room/abc-defg-hij')).toEqual({
        slug: 'abc-defg-hij',
        host: null,
      });
    });

    it('refuse un hôte autre que « room »', () => {
      expect(parsePastedMeeting('twakevisio://callback/abc-defg-hij')).toBe(null);
    });
  });

  describe('un code nu', () => {
    it('accepte le code avec ses tirets', () => {
      expect(parsePastedMeeting('abc-defg-hij')).toEqual({ slug: 'abc-defg-hij', host: null });
    });

    it('accepte le code sans tirets', () => {
      expect(parsePastedMeeting('abcdefghij')).toEqual({ slug: 'abcdefghij', host: null });
    });

    it('détoure les espaces autour du code', () => {
      expect(parsePastedMeeting('  abc-defg-hij \n')?.slug).toBe('abc-defg-hij');
    });

    // LE test de ce lot. `normalizeCodeInput` jetterait la ponctuation et
    // rendrait dix lettres — un code « complet » et faux. Le motif doit donc
    // s'appliquer au texte ENTIER.
    it("REFUSE une phrase qui contient un code, au lieu d'en extraire dix lettres", () => {
      expect(parsePastedMeeting('Rejoins-moi : abc-defg-hij')).toBe(null);
    });

    it('refuse un code trop court', () => {
      expect(parsePastedMeeting('abc-defg-hi')).toBe(null);
    });

    it('refuse un code portant un chiffre', () => {
      expect(parsePastedMeeting('abc-def9-hij')).toBe(null);
    });
  });

  it('rend null sur un presse-papiers vide', () => {
    expect(parsePastedMeeting('')).toBe(null);
  });

  it('rend null sur du texte quelconque', () => {
    expect(parsePastedMeeting('bonjour tout le monde')).toBe(null);
  });
});
