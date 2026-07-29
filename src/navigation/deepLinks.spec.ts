import { parseMeetingLink } from 'src/navigation/deepLinks';

describe('parseMeetingLink', () => {
  it("extrait le slug d'une URL https de meet", () => {
    expect(parseMeetingLink('https://meet.linagora.com/point-hebdo')).toBe('point-hebdo');
  });

  it('extrait le slug du schéma applicatif', () => {
    expect(parseMeetingLink('twakevisio://room/point-hebdo')).toBe('point-hebdo');
  });

  it('ignore la racine du site', () => {
    expect(parseMeetingLink('https://meet.linagora.com/')).toBe(null);
  });

  it("ignore les chemins réservés de l'application web", () => {
    expect(parseMeetingLink('https://meet.linagora.com/api/v1.0/config/')).toBe(null);
  });

  it.each(['feedback', 'mentions-legales', 'accessibilite', 'conditions-utilisation'])(
    "ignore la page « %s » de l'application web",
    (segment) => {
      expect(parseMeetingLink(`https://meet.linagora.com/${segment}`)).toBe(null);
    },
  );

  it.each(['favicon.ico', 'site.webmanifest', 'apple-touch-icon.png'])(
    'ignore le fichier statique « %s » servi à la racine',
    (file) => {
      expect(parseMeetingLink(`https://meet.linagora.com/${file}`)).toBe(null);
    },
  );

  it('reconnaît un identifiant de salon généré par meet', () => {
    expect(parseMeetingLink('https://meet.linagora.com/abc-defg-hij')).toBe('abc-defg-hij');
  });

  it('reconnaît un identifiant généré sans tirets', () => {
    expect(parseMeetingLink('https://meet.linagora.com/abcdefghij')).toBe('abcdefghij');
  });

  it('ignore une URL malformée', () => {
    expect(parseMeetingLink('pas une url')).toBe(null);
  });
});
