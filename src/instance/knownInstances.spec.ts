import {
  findKnownClientId,
  findKnownHostForDomain,
  listKnownHosts,
} from 'src/instance/knownInstances';

describe('findKnownClientId', () => {
  it('reconnaît une instance connue', () => {
    expect(findKnownClientId('meet.linagora.com')).toBe('twake-visio');
  });

  it('reconnaît la seconde instance de production', () => {
    expect(findKnownClientId('visio.twake.app')).toBe('twake-visio');
  });

  it('renvoie null pour un hôte inconnu', () => {
    expect(findKnownClientId('meet.example.org')).toBe(null);
  });

  it("ignore la casse de l'hôte", () => {
    expect(findKnownClientId('MEET.Linagora.COM')).toBe('twake-visio');
  });
});

describe('listKnownHosts', () => {
  // La propriété à garder, pas le contenu actuel : chaque hôte listé doit
  // rester résolu par findKnownClientId, pour qu'ajouter une instance à la
  // table étende automatiquement l'allowlist des liens profonds sans que les
  // deux puissent diverger.
  it('couvre les deux instances de production et reste synchronisée avec findKnownClientId', () => {
    const hosts = listKnownHosts();

    expect(hosts).toContain('meet.linagora.com');
    expect(hosts).toContain('visio.twake.app');
    for (const host of hosts) {
      expect(findKnownClientId(host)).not.toBeNull();
    }
  });

  // Le point de rupture à surveiller : linagora.com est un domaine d'adresse
  // email, et un site Drupal. Fusionner la table des domaines dans celle des
  // hôtes connus — ou faire dériver listKnownHosts() des deux — suffirait à
  // faire ouvrir https://linagora.com/<n'importe quoi> comme un salon.
  it("n'étend pas l'allowlist des liens profonds aux domaines d'adresse email", () => {
    expect(findKnownHostForDomain('linagora.com')).toBe('meet.linagora.com');
    expect(listKnownHosts()).not.toContain('linagora.com');
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

  // La voie rapide ne vérifie rien sur le réseau : elle ne peut désigner qu'une
  // instance dont le client_id est déjà connu, sinon elle renverrait une URL
  // sur laquelle signIn échouerait aussitôt en oidc-undiscoverable. Le type de
  // la table impose la règle à la compilation ; ce test la constate à
  // l'exécution pour la seule entrée existante.
  it('ne désigne que des instances dont le client_id est connu', () => {
    const host = findKnownHostForDomain('linagora.com');

    expect(host).not.toBeNull();
    expect(findKnownClientId(host ?? '')).not.toBeNull();
  });
});
