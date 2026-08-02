import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { MeetingVisit } from 'src/rooms/journal';
import { tokens } from 'src/ui/tokens';
import { filterVisits, formatVisitDuration, HistoriqueScreen } from './historique';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}));

// Même préambule que les sept autres specs d'écran, et pour une raison
// mécanique : importer `expo-router` pour de vrai tire `standard-navigation`,
// qui livre de l'ESM non transformé et que `transformIgnorePatterns` ne couvre
// pas. La suite ne se charge pas du tout sans ce double.
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('src/rooms/journal', () => ({ listVisits: jest.fn() }));
jest.mock('src/auth/accounts', () => ({ getActiveAccount: jest.fn() }));

const journal = jest.requireMock('src/rooms/journal') as { listVisits: jest.Mock };
const accounts = jest.requireMock('src/auth/accounts') as { getActiveAccount: jest.Mock };

function visit(
  slug: string,
  title: string,
  joinedAt: number,
  endedAt: number | null = null,
): MeetingVisit {
  return { slug, title, joinedAt, endedAt };
}

// 2026-08-02 à 14:30, heure locale. Fixé plutôt que relatif à maintenant : une
// date calculée depuis l'horloge rendrait le test vert ou rouge selon l'heure
// à laquelle il tourne.
const JOINED_AT = new Date(2026, 7, 2, 14, 30).getTime();

describe('filterVisits', () => {
  const visits = [
    visit('a', 'Point produit Visio', 2_000),
    visit('b', 'Comité souveraineté', 1_000),
  ];

  // Requête vide et requête non vide : les deux états de la conditionnelle.
  it('rend tout pour une requête vide', () => {
    expect(filterVisits(visits, '')).toHaveLength(2);
  });

  it('rend tout pour une requête faite d’espaces', () => {
    expect(filterVisits(visits, '   ')).toHaveLength(2);
  });

  // Ces deux-là assertissent l'IDENTITÉ, pas le contenu, et c'est délibéré.
  //
  // Mesuré : retirer le court-circuit `needle.length === 0` ne rougissait
  // RIEN — avec une aiguille vide, `includes('')` est vrai pour tout, donc
  // `filter` rend le même contenu. La ligne n'est pas observable par le
  // contenu ; elle l'est par la référence, `filter` allouant toujours un
  // tableau neuf. C'est ce que ces deux tests gardent, et c'est ce qui évite
  // un re-rendu de toute la liste à chaque frappe effacée.
  it('rend le tableau d’origine, sans copie, pour une requête vide', () => {
    expect(filterVisits(visits, '')).toBe(visits);
  });

  it('rend le tableau d’origine pour une requête faite d’espaces', () => {
    expect(filterVisits(visits, '   ')).toBe(visits);
  });

  it('ne garde que ce qui correspond', () => {
    expect(filterVisits(visits, 'produit').map((v) => v.slug)).toEqual(['a']);
  });

  it('ignore la casse', () => {
    expect(filterVisits(visits, 'PRODUIT').map((v) => v.slug)).toEqual(['a']);
  });

  // Le code du salon est souvent la seule chose qu'on retient d'une réunion
  // rejointe par lien : chercher dessus doit marcher.
  it('cherche aussi dans le code du salon', () => {
    expect(filterVisits(visits, 'b').map((v) => v.slug)).toContain('b');
  });

  it('rend une liste vide quand rien ne correspond', () => {
    expect(filterVisits(visits, 'zzz')).toHaveLength(0);
  });
});

describe('formatVisitDuration', () => {
  it('rend null tant que la visite est ouverte', () => {
    expect(formatVisitDuration(visit('a', 'A', 0))).toBe(null);
  });

  it('rend les minutes entières', () => {
    expect(formatVisitDuration(visit('a', 'A', 0, 42 * 60_000))).toBe('42 min');
  });

  // Jamais zéro : une réunion de quarante secondes a bien eu lieu, et « 0 min »
  // se lit comme une erreur d'affichage.
  it('arrondit une visite très courte à une minute', () => {
    expect(formatVisitDuration(visit('a', 'A', 0, 40_000))).toBe('1 min');
  });

  it('rend une visite instantanée comme une minute, pas zéro', () => {
    expect(formatVisitDuration(visit('a', 'A', 0, 0))).toBe('1 min');
  });

  // Au-delà de l'heure : « 1 h 05 » se compte mieux que « 65 min ».
  it('passe aux heures au-delà de soixante minutes', () => {
    expect(formatVisitDuration(visit('a', 'A', 0, 65 * 60_000))).toBe('1 h 05');
  });

  it('omet les minutes sur une heure ronde', () => {
    expect(formatVisitDuration(visit('a', 'A', 0, 120 * 60_000))).toBe('2 h');
  });
});

describe('HistoriqueScreen', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    journal.listVisits.mockReturnValue([visit('ogo-kmyy-qrl', 'Point produit', JOINED_AT)]);
    accounts.getActiveAccount.mockReturnValue({ displayName: 'Michel Maudet' });
  });

  it('pose la couleur explicite du titre d’une ligne', async () => {
    await render(<HistoriqueScreen />);
    expect(screen.getByTestId('visit-title-ogo-kmyy-qrl')).toHaveStyle({
      color: tokens.color.textPrimary,
    });
  });

  it('pose la couleur explicite de la méta d’une ligne', async () => {
    await render(<HistoriqueScreen />);
    expect(screen.getByTestId('visit-meta-ogo-kmyy-qrl')).toHaveStyle({
      color: tokens.color.textMeta,
    });
  });

  it('affiche l’intitulé de la réunion', async () => {
    await render(<HistoriqueScreen />);
    expect(screen.getByTestId('visit-title-ogo-kmyy-qrl')).toHaveTextContent('Point produit');
  });

  it('affiche l’heure d’entrée', async () => {
    await render(<HistoriqueScreen />);
    expect(screen.getByTestId('visit-meta-ogo-kmyy-qrl')).toHaveTextContent(/14:30/);
  });

  // Les deux états, chacun avec sa fixture : une visite close montre sa durée,
  // une visite ouverte n'en montre aucune.
  it('affiche la durée d’une visite close', async () => {
    journal.listVisits.mockReturnValue([visit('a', 'Close', JOINED_AT, JOINED_AT + 42 * 60_000)]);
    await render(<HistoriqueScreen />);

    expect(screen.getByTestId('visit-meta-a')).toHaveTextContent(/42 min/);
  });

  it('n’affiche aucune durée pour une visite ouverte', async () => {
    journal.listVisits.mockReturnValue([visit('a', 'Ouverte', JOINED_AT)]);
    await render(<HistoriqueScreen />);

    expect(screen.getByTestId('visit-meta-a')).not.toHaveTextContent(/min/);
  });

  it('rend une ligne par visite', async () => {
    journal.listVisits.mockReturnValue([
      visit('a', 'Une', JOINED_AT),
      visit('b', 'Deux', JOINED_AT - 1_000),
    ]);
    await render(<HistoriqueScreen />);

    expect(screen.getByTestId('visit-title-a')).toBeTruthy();
    expect(screen.getByTestId('visit-title-b')).toBeTruthy();
  });

  describe('les deux états vides, qui sont distincts', () => {
    // Journal jamais rempli : « Aucune réunion pour l'instant ».
    it('affiche l’état vide quand le journal est vide', async () => {
      journal.listVisits.mockReturnValue([]);
      await render(<HistoriqueScreen />);

      expect(screen.getByTestId('history-empty')).toHaveTextContent('history.empty');
    });

    it('n’affiche pas l’état vide quand le journal est peuplé', async () => {
      await render(<HistoriqueScreen />);

      expect(screen.queryByTestId('history-empty')).toBe(null);
    });

    // Recherche infructueuse : un message DIFFÉRENT. Les confondre dirait à
    // quelqu'un qui vient de taper trois lettres qu'il n'a jamais tenu de
    // réunion.
    it('affiche le message de recherche infructueuse, pas l’état vide', async () => {
      await render(<HistoriqueScreen />);
      await fireEvent.changeText(screen.getByTestId('history-search-input'), 'zzz');

      expect(screen.getByTestId('history-no-match')).toHaveTextContent('history.noMatch');
      expect(screen.queryByTestId('history-empty')).toBe(null);
    });

    it('n’affiche aucun des deux quand la recherche trouve', async () => {
      await render(<HistoriqueScreen />);
      await fireEvent.changeText(screen.getByTestId('history-search-input'), 'produit');

      expect(screen.queryByTestId('history-no-match')).toBe(null);
      expect(screen.queryByTestId('history-empty')).toBe(null);
    });
  });

  describe('le libellé de section', () => {
    it('annonce les récentes quand aucune recherche n’est active', async () => {
      await render(<HistoriqueScreen />);

      expect(screen.getByTestId('history-section')).toHaveTextContent('history.recent');
    });

    // La conditionnelle prend ses deux valeurs : sans ce second cas, un
    // libellé constant passerait.
    it('annonce des résultats quand une recherche est active', async () => {
      await render(<HistoriqueScreen />);
      await fireEvent.changeText(screen.getByTestId('history-search-input'), 'produit');

      expect(screen.getByTestId('history-section')).toHaveTextContent('history.results');
    });
  });
});
