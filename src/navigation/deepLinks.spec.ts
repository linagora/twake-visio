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

  it('ignore une URL malformée', () => {
    expect(parseMeetingLink('pas une url')).toBe(null);
  });
});
