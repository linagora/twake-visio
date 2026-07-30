import { findKnownHostForDomain, listKnownHosts } from 'src/instance/knownInstances';

describe('listKnownHosts', () => {
  it('couvre les deux instances de production', () => {
    const hosts = listKnownHosts();

    expect(hosts).toContain('meet.linagora.com');
    expect(hosts).toContain('visio.twake.app');
  });

  // Le point de rupture à surveiller : linagora.com est un domaine d'adresse
  // email, et un site Drupal. Fusionner la table des domaines dans celle des
  // hôtes connus - ou faire dériver listKnownHosts() des deux - suffirait à
  // faire ouvrir https://linagora.com/<n'importe quoi> comme un salon.
  it("n'étend pas l'allowlist des liens profonds aux domaines d'adresse email", () => {
    expect(findKnownHostForDomain('linagora.com')).toBe('meet.linagora.com');
    expect(listKnownHosts()).not.toContain('linagora.com');
  });

  // Cette liste n'est plus qu'une allowlist : elle ne doit porter aucun
  // client_id, celui-ci étant désormais lu sur l'instance elle-même. Un hôte
  // qui reviendrait avec une valeur associée signalerait la réintroduction
  // d'une valeur devinée.
  it('ne porte que des hôtes, sans rien y associer', () => {
    for (const host of listKnownHosts()) {
      expect(typeof host).toBe('string');
      expect(host).not.toContain('/');
    }
  });
});

describe('findKnownHostForDomain', () => {
  it("associe un domaine d'adresse email à son instance", () => {
    expect(findKnownHostForDomain('linagora.com')).toBe('meet.linagora.com');
  });

  it('renvoie null pour un domaine inconnu, qui devra être sondé', () => {
    expect(findKnownHostForDomain('example.org')).toBe(null);
  });

  it('ignore la casse du domaine', () => {
    expect(findKnownHostForDomain('LINAGORA.com')).toBe('meet.linagora.com');
  });

  // La voie rapide ne vérifie rien sur le réseau : elle ne peut désigner qu'un
  // hôte de l'allowlist, sinon elle renverrait une URL arbitraire. Le type de la
  // table impose la règle à la compilation ; ce test la constate à l'exécution.
  it("ne désigne que des hôtes de l'allowlist", () => {
    const host = findKnownHostForDomain('linagora.com');

    expect(host).not.toBeNull();
    expect(listKnownHosts()).toContain(host);
  });

  // twake.app est absent volontairement : meet.twake.app est un déploiement
  // distinct de visio.twake.app, avec un autre SSO. Le rattacher enverrait ces
  // adresses sur la mauvaise instance.
  it('ne rattache pas twake.app, dont les déploiements sont distincts', () => {
    expect(findKnownHostForDomain('twake.app')).toBe(null);
  });
});
