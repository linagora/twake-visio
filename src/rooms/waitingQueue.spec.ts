import { firstWaiting, mergeWaiting, withoutParticipant } from 'src/rooms/waitingQueue';

const ada = { id: 'p-1', username: 'Ada' };
const bob = { id: 'p-2', username: 'Bob' };
const cid = { id: 'p-3', username: 'Cid' };

describe('mergeWaiting', () => {
  it("conserve l'ordre déjà connu et ajoute les nouveaux à la fin", () => {
    // Réordonner ferait changer de personne sous le doigt qui s'apprête à
    // appuyer sur Admettre.
    expect(mergeWaiting([ada, bob], [bob, ada, cid])).toEqual([ada, bob, cid]);
  });

  it('retire ceux que le serveur ne liste plus', () => {
    // Un autre modérateur a répondu, ou la personne a renoncé.
    expect(mergeWaiting([ada, bob], [bob])).toEqual([bob]);
  });

  it('accepte une première liste', () => {
    expect(mergeWaiting([], [ada, bob])).toEqual([ada, bob]);
  });

  it("rend une liste vide quand plus personne n'attend", () => {
    expect(mergeWaiting([ada], [])).toEqual([]);
  });

  it('prend le nom le plus récent pour une personne déjà connue', () => {
    expect(mergeWaiting([ada], [{ id: 'p-1', username: 'Ada L.' }])).toEqual([
      { id: 'p-1', username: 'Ada L.' },
    ]);
  });

  it("ne modifie pas les objets de la liste qu'on lui passe", () => {
    // Le module est pur : fusionner rend une valeur neuve, il ne doit pas
    // changer ce que l'appelant a déjà en main. Un objet local, distinct
    // d'`ada`, pour ne pas polluer les autres tests si la garde manquait.
    const staleAda = { id: 'p-1', username: 'Ada' };

    mergeWaiting([staleAda], [{ id: 'p-1', username: 'Ada L.' }]);

    expect(staleAda).toEqual({ id: 'p-1', username: 'Ada' });
  });
});

describe('firstWaiting', () => {
  it('rend la première personne', () => {
    expect(firstWaiting([ada, bob])).toEqual(ada);
  });

  it('rend null sur une file vide', () => {
    expect(firstWaiting([])).toBe(null);
  });
});

describe('withoutParticipant', () => {
  it('retire la personne traitée', () => {
    expect(withoutParticipant([ada, bob], 'p-1')).toEqual([bob]);
  });

  it('ne bronche pas sur un identifiant absent', () => {
    expect(withoutParticipant([ada], 'p-9')).toEqual([ada]);
  });

  it("ne modifie pas la liste qu'on lui passe", () => {
    const queue = [ada, bob];

    withoutParticipant(queue, 'p-1');

    expect(queue).toEqual([ada, bob]);
  });
});
