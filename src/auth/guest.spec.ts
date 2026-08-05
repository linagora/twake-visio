import {
  endGuestSession,
  getGuestSession,
  readRememberedGuestName,
  rememberGuestName,
  resetGuestForTest,
  startGuestSession,
} from 'src/auth/guest';

// Ce module n'était exercé qu'À TRAVERS `visitor.spec.ts`, qui l'observe par
// `getVisitor()` — donc jamais ses deux clés séparément, et jamais
// `readRememberedGuestName` avant qu'une session existe. Or c'est cette
// séparation qui EST le module : `serverUrl` naît et meurt avec la réunion,
// `name` lui survit. Les confondre ferait l'un des deux défauts que son
// commentaire de tête nomme — un nom réclamé à chaque réunion, ou une session
// fantôme qu'un lien profond reprendrait avec le serveur de la PRÉCÉDENTE.
beforeEach(() => {
  resetGuestForTest();
});

describe('la session invité', () => {
  it("n'existe pas tant que rien ne l'a ouverte", () => {
    expect(getGuestSession()).toBe(null);
  });

  it('naît de startGuestSession, avec son serveur', () => {
    startGuestSession('https://meet.acme.com');

    expect(getGuestSession()).toEqual({ serverUrl: 'https://meet.acme.com', displayName: '' });
  });

  // La SECONDE ouverture écrase la première : un invité qui enchaîne deux
  // réunions sur deux instances ne doit pas interroger l'ancienne.
  it('adopte le serveur de la dernière ouverture', () => {
    startGuestSession('https://meet.acme.com');
    startGuestSession('https://meet.autre.com');

    expect(getGuestSession()?.serverUrl).toBe('https://meet.autre.com');
  });

  it('meurt avec endGuestSession', () => {
    startGuestSession('https://meet.acme.com');

    endGuestSession();

    expect(getGuestSession()).toBe(null);
  });
});

describe('le nom mémorisé', () => {
  // Lu AVANT toute session : le pré-join en pré-remplit son champ, et il le
  // fait avant que quoi que ce soit ait été confirmé.
  it("rend une chaîne vide quand rien n'a jamais été mémorisé", () => {
    expect(readRememberedGuestName()).toBe('');
  });

  it('rend ce qui a été mémorisé', () => {
    rememberGuestName('Camille');

    expect(readRememberedGuestName()).toBe('Camille');
  });

  it('accompagne la session ouverte ensuite', () => {
    rememberGuestName('Camille');

    startGuestSession('https://meet.acme.com');

    expect(getGuestSession()?.displayName).toBe('Camille');
  });

  // LE contrat des deux clés, et la seule chose que ce fichier garde qu'aucun
  // autre ne garde : la fin d'une session ne doit PAS effacer le nom.
  it('SURVIT à la fin de la session, et pré-remplit la suivante', () => {
    startGuestSession('https://meet.acme.com');
    rememberGuestName('Camille');

    endGuestSession();

    expect(readRememberedGuestName()).toBe('Camille');
    startGuestSession('https://meet.autre.com');
    expect(getGuestSession()).toEqual({
      serverUrl: 'https://meet.autre.com',
      displayName: 'Camille',
    });
  });

  it('remplace le nom précédent plutôt que de s’y ajouter', () => {
    rememberGuestName('Camille');

    rememberGuestName('Dominique');

    expect(readRememberedGuestName()).toBe('Dominique');
  });
});
