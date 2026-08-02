import { createMMKV } from 'react-native-mmkv';

import {
  listVisits,
  MAX_VISITS,
  rememberVisit,
  rememberVisitEnd,
  resetJournal,
} from 'src/rooms/journal';

describe('journal des réunions', () => {
  beforeEach(() => {
    resetJournal();
  });

  it('rend une liste vide sur une installation neuve', () => {
    expect(listVisits()).toEqual([]);
  });

  it('relit une visite enregistrée', () => {
    rememberVisit('ogo-kmyy-qrl', 'Point produit', 1_000);

    expect(listVisits()).toEqual([
      { slug: 'ogo-kmyy-qrl', title: 'Point produit', joinedAt: 1_000, endedAt: null },
    ]);
  });

  // L'ordre est une décision : la fixture doit produire les deux sens
  // d'insertion, sinon une implémentation qui n'ordonne rien passerait celui
  // qui se trouve déjà dans le bon ordre.
  it('rend la plus récente en premier, écrite en dernier', () => {
    rememberVisit('ancienne', 'Ancienne', 1_000);
    rememberVisit('recente', 'Récente', 2_000);

    expect(listVisits().map((visit) => visit.slug)).toEqual(['recente', 'ancienne']);
  });

  it('rend la plus récente en premier, écrite en premier', () => {
    rememberVisit('recente', 'Récente', 2_000);
    rememberVisit('ancienne', 'Ancienne', 1_000);

    expect(listVisits().map((visit) => visit.slug)).toEqual(['recente', 'ancienne']);
  });

  // Une VISITE, pas un salon : rejoindre deux fois la même réunion doit laisser
  // deux traces, sinon l'historique ment sur ce qui s'est passé.
  it('garde une entrée par visite, même pour un salon déjà rejoint', () => {
    rememberVisit('meme', 'Même salon', 1_000);
    rememberVisit('meme', 'Même salon', 2_000);

    expect(listVisits()).toHaveLength(2);
  });

  it('retire les espaces autour de l’intitulé', () => {
    rememberVisit('abc', '  Point produit  ', 1_000);

    expect(listVisits()[0]?.title).toBe('Point produit');
  });

  // Même garde que `rememberRoomTitle` : une ligne sans rien à afficher est
  // pire qu'une absence de ligne.
  it('n’enregistre pas un intitulé vide', () => {
    rememberVisit('vide', '   ', 1_000);

    expect(listVisits()).toEqual([]);
  });

  describe('le plafond', () => {
    // Sans plafond, MMKV croît sans fin sur un appareil de longue vie. Même
    // réflexe que `MAX_ROOM_PAGES` dans `src/api/rooms.ts:57`.
    it('ne dépasse jamais MAX_VISITS entrées', () => {
      for (let index = 0; index < MAX_VISITS + 10; index += 1) {
        rememberVisit(`salon-${index}`, `Salon ${index}`, index);
      }

      expect(listVisits()).toHaveLength(MAX_VISITS);
    });

    it('jette les plus ANCIENNES, pas les plus récentes', () => {
      for (let index = 0; index < MAX_VISITS + 10; index += 1) {
        rememberVisit(`salon-${index}`, `Salon ${index}`, index);
      }
      const slugs = listVisits().map((visit) => visit.slug);

      expect(slugs).toContain(`salon-${MAX_VISITS + 9}`);
      expect(slugs).not.toContain('salon-0');
    });

    // La branche « sous le plafond » doit être empruntée aussi, sinon un
    // `slice` mal borné qui tronquerait toujours passerait inaperçu.
    it('ne tronque rien sous le plafond', () => {
      rememberVisit('a', 'A', 1_000);
      rememberVisit('b', 'B', 2_000);

      expect(listVisits()).toHaveLength(2);
    });
  });

  describe('la fin de la visite', () => {
    // La durée était reportée au lot de l'écran d'appel, faute d'un point
    // d'accroche : `call.tsx` était disputé par quatorze branches. Elles ont
    // toutes atterri, et la dette est payée ici.

    it('rend une durée nulle tant que la visite n’est pas close', () => {
      rememberVisit('ouverte', 'Ouverte', 1_000);

      expect(listVisits()[0]?.endedAt).toBe(null);
    });

    it('clôt la visite la plus récente d’un salon', () => {
      rememberVisit('abc', 'Réunion', 1_000);
      rememberVisitEnd('abc', 4_000);

      expect(listVisits()[0]?.endedAt).toBe(4_000);
    });

    // Rejoindre deux fois le même salon laisse deux traces : clore doit
    // atteindre la DERNIÈRE, pas la première rencontrée.
    it('clôt la plus récente quand le salon a été rejoint deux fois', () => {
      rememberVisit('abc', 'Réunion', 1_000);
      rememberVisit('abc', 'Réunion', 3_000);
      rememberVisitEnd('abc', 5_000);

      const visits = listVisits().filter((v) => v.slug === 'abc');
      expect(visits[0]?.endedAt).toBe(5_000);
      expect(visits[1]?.endedAt).toBe(null);
    });

    // La branche « salon inconnu » doit être empruntée : quitter un salon
    // jamais journalisé ne doit rien casser.
    it('ignore la clôture d’un salon absent du journal', () => {
      rememberVisit('abc', 'Réunion', 1_000);
      rememberVisitEnd('jamais-vu', 5_000);

      expect(listVisits()).toHaveLength(1);
      expect(listVisits()[0]?.endedAt).toBe(null);
    });

    // Une fin ANTÉRIEURE au début n'est pas une durée : l'horloge de
    // l'appareil peut reculer, et une durée négative s'afficherait comme telle.
    it('ignore une fin antérieure au début', () => {
      rememberVisit('abc', 'Réunion', 5_000);
      rememberVisitEnd('abc', 1_000);

      expect(listVisits()[0]?.endedAt).toBe(null);
    });

    it('ne clôt pas deux fois', () => {
      rememberVisit('abc', 'Réunion', 1_000);
      rememberVisitEnd('abc', 4_000);
      rememberVisitEnd('abc', 9_000);

      expect(listVisits()[0]?.endedAt).toBe(4_000);
    });
  });

  describe('la robustesse', () => {
    // MMKV rend une chaîne : rien ne garantit qu'elle soit encore du JSON
    // valide après une mise à jour ratée. Un historique illisible doit se
    // vider, pas faire planter l'onglet.
    it('rend une liste vide plutôt que de jeter sur du JSON corrompu', () => {
      writeRawVisits('{ pas du json');

      expect(listVisits()).toEqual([]);
    });

    it('rend une liste vide si la valeur stockée n’est pas un tableau', () => {
      writeRawVisits('{"slug":"x"}');

      expect(listVisits()).toEqual([]);
    });
  });
});

// Écrit directement dans le magasin pour simuler une valeur qu'une version
// antérieure, ou une écriture interrompue, aurait laissée.
//
// Import nommé ordinaire, et non l'idiome `require` d'`AGENTS.md` : celui-ci ne
// sert qu'à ESPIONNER un export de module, où la copie de namespace de Babel
// ferait poser l'espion sur un objet que le module testé ne touche jamais. Ici
// on ne fait qu'appeler la fonction, et `__mocks__/react-native-mmkv.ts` est
// substitué automatiquement.
function writeRawVisits(value: string): void {
  createMMKV({ id: 'room-journal' }).set('visits', value);
}
