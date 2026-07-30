import { findKnownClientId, listKnownHosts } from 'src/instance/knownInstances';

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
});
