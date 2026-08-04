import { JOIN_ACTION, prejoinRoute, slugFromResponse } from 'src/notifications/response';

// La vraie valeur d'`expo-notifications`. Écrite ici plutôt qu'importée, pour
// la même raison que la fonction la reçoit en paramètre : ce test doit pouvoir
// tourner sans le module natif.
const DEFAUT = 'expo.modules.notifications.actions.DEFAULT';

describe('slugFromResponse', () => {
  describe("l'identifiant de l'action", () => {
    it('accepte le bouton « Rejoindre »', () => {
      expect(slugFromResponse(JOIN_ACTION, { slug: 'aaa-bbb-ccc' }, DEFAUT)).toBe('aaa-bbb-ccc');
    });

    it('accepte aussi un appui sur le corps de la notification', () => {
      expect(slugFromResponse(DEFAUT, { slug: 'aaa-bbb-ccc' }, DEFAUT)).toBe('aaa-bbb-ccc');
    });

    it('refuse toute autre action', () => {
      // Une action « Ignorer » ajoutée plus tard ne doit pas ouvrir la réunion
      // du seul fait qu'elle porte un slug.
      expect(slugFromResponse('dismiss', { slug: 'aaa-bbb-ccc' }, DEFAUT)).toBe(null);
    });
  });

  describe('la charge utile', () => {
    it('refuse une charge absente', () => {
      expect(slugFromResponse(JOIN_ACTION, null, DEFAUT)).toBe(null);
      expect(slugFromResponse(JOIN_ACTION, undefined, DEFAUT)).toBe(null);
    });

    it('refuse un slug qui n’est pas une chaîne', () => {
      expect(slugFromResponse(JOIN_ACTION, { slug: 42 }, DEFAUT)).toBe(null);
    });

    it('refuse un slug vide', () => {
      // Sans ce cas, `typeof slug === 'string'` seul laisserait passer la
      // chaîne vide et produirait la route « /room//prejoin ».
      expect(slugFromResponse(JOIN_ACTION, { slug: '' }, DEFAUT)).toBe(null);
    });
  });
});

describe('prejoinRoute', () => {
  it('mène au PRÉ-ACCUEIL, comme « Rejoindre » depuis l’accueil', () => {
    expect(prejoinRoute('aaa-bbb-ccc')).toBe('/room/aaa-bbb-ccc/prejoin');
  });
});
