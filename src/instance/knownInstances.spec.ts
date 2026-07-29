import { findKnownClientId } from 'src/instance/knownInstances';

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

  it('ignore la casse de l\'hôte', () => {
    expect(findKnownClientId('MEET.Linagora.COM')).toBe('twake-visio');
  });
});
