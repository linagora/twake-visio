import { agendaHosts, parseMeetingLink } from 'src/navigation/deepLinks';

const HOSTS = ['meet.linagora.com', 'visio.twake.app'] as const;

describe('parseMeetingLink', () => {
  it("extrait le slug d'une URL https de meet", () => {
    expect(parseMeetingLink('https://meet.linagora.com/point-hebdo', HOSTS)).toBe('point-hebdo');
  });

  it('extrait le slug du schéma applicatif', () => {
    expect(parseMeetingLink('twakevisio://room/point-hebdo', HOSTS)).toBe('point-hebdo');
  });

  it('ignore la racine du site', () => {
    expect(parseMeetingLink('https://meet.linagora.com/', HOSTS)).toBe(null);
  });

  it("ignore les chemins réservés de l'application web", () => {
    expect(parseMeetingLink('https://meet.linagora.com/api/v1.0/config/', HOSTS)).toBe(null);
  });

  it.each(['feedback', 'mentions-legales', 'accessibilite', 'conditions-utilisation'])(
    "ignore la page « %s » de l'application web",
    (segment) => {
      expect(parseMeetingLink(`https://meet.linagora.com/${segment}`, HOSTS)).toBe(null);
    },
  );

  it.each(['favicon.ico', 'site.webmanifest', 'apple-touch-icon.png'])(
    'ignore le fichier statique « %s » servi à la racine',
    (file) => {
      expect(parseMeetingLink(`https://meet.linagora.com/${file}`, HOSTS)).toBe(null);
    },
  );

  it('reconnaît un identifiant de salon généré par meet', () => {
    expect(parseMeetingLink('https://meet.linagora.com/abc-defg-hij', HOSTS)).toBe('abc-defg-hij');
  });

  it('reconnaît un identifiant généré sans tirets', () => {
    expect(parseMeetingLink('https://meet.linagora.com/abcdefghij', HOSTS)).toBe('abcdefghij');
  });

  it('refuse un hôte étranger', () => {
    expect(parseMeetingLink('https://evil.example/point-hebdo', HOSTS)).toBe(null);
  });

  it('accepte la seconde instance connue', () => {
    expect(parseMeetingLink('https://visio.twake.app/point-hebdo', HOSTS)).toBe('point-hebdo');
  });

  it('refuse http en clair sur un hôte pourtant connu', () => {
    expect(parseMeetingLink('http://meet.linagora.com/point-hebdo', HOSTS)).toBe(null);
  });

  it.each(['mailto:point-hebdo', 'javascript:point-hebdo', 'file:///point-hebdo'])(
    'refuse le schéma « %s »',
    (link) => {
      expect(parseMeetingLink(link, HOSTS)).toBe(null);
    },
  );

  it('refuse un point encodé en pourcentage', () => {
    expect(parseMeetingLink('https://meet.linagora.com/favicon%2eico', HOSTS)).toBe(null);
  });

  it('ignore une URL malformée', () => {
    expect(parseMeetingLink('pas une url', HOSTS)).toBe(null);
  });
});

describe('agendaHosts', () => {
  it("rend l'hôte de l'instance", () => {
    expect(agendaHosts('https://meet.linagora.com')).toEqual(['meet.linagora.com']);
  });

  it("ignore le chemin et le port de l'URL", () => {
    expect(agendaHosts('https://meet.example.org:8443/quelque/chose')).toEqual([
      'meet.example.org',
    ]);
  });

  it('rend une liste VIDE quand l’URL est illisible', () => {
    // Vide et non « tout accepter » : une liste d'hôtes vide REFERME la porte,
    // puisque `parseMeetingLink` exige une correspondance. L'inverse ferait
    // ouvrir un salon depuis n'importe quel lien d'agenda.
    expect(agendaHosts('pas une url')).toEqual([]);
    expect(agendaHosts('')).toEqual([]);
  });
});
