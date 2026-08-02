import { instanceLabel } from 'src/instance/label';

describe('instanceLabel', () => {
  it("rend l'hôte, pas l'URL entière", () => {
    expect(instanceLabel('https://meet.linagora.com')).toBe('meet.linagora.com');
  });

  it('jette le chemin et le protocole', () => {
    expect(instanceLabel('https://meet.linagora.com/quelque/chose')).toBe('meet.linagora.com');
  });

  // Deux instances d'une même organisation portent souvent la même adresse
  // e-mail : c'est l'hôte, et lui seul, qui dit où l'on est.
  it('distingue deux instances voisines', () => {
    expect(instanceLabel('https://meet.linagora.com')).not.toBe(
      instanceLabel('https://meet.twake-dev.maudet.cloud'),
    );
  });

  it('garde le port quand il y en a un', () => {
    expect(instanceLabel('https://meet.exemple.test:8443')).toBe('meet.exemple.test:8443');
  });

  // La branche de repli doit être empruntée : une valeur illisible vaut mieux
  // affichée telle quelle qu'effacée.
  it("rend l'entrée telle quelle quand ce n'est pas une URL", () => {
    expect(instanceLabel('pas une url')).toBe('pas une url');
  });

  it('rend une chaîne vide telle quelle', () => {
    expect(instanceLabel('')).toBe('');
  });
});
