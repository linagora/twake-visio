import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import { JoinSheet } from 'src/screens/joinSheet';
import { tokens } from 'src/ui/tokens';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Même préambule que `bottomSheet.spec.tsx` et `formSheet.spec.tsx` : `Modal`
// vit dans un `Portal`, qui lit les encarts de zone sûre.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('src/instance/knownInstances', () => ({
  listKnownHosts: () => ['meet.linagora.com'],
}));

const clipboard = jest.requireMock('expo-clipboard') as { getStringAsync: jest.Mock };

function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

function sheet(
  overrides: Partial<React.ComponentProps<typeof JoinSheet>> = {},
): React.ReactElement {
  return withPaper(
    <JoinSheet
      onJoinRoom={jest.fn()}
      onSheetDismiss={jest.fn()}
      testID="join"
      visible
      {...overrides}
    />,
  );
}

async function type(text: string): Promise<void> {
  await fireEvent.changeText(screen.getByTestId('join-input'), text);
}

describe('JoinSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clipboard.getStringAsync.mockResolvedValue('');
  });

  it('rend dix cases', async () => {
    await render(sheet());

    expect(screen.getAllByTestId(/^join-cell-\d+$/)).toHaveLength(10);
  });

  describe('la frappe', () => {
    it('remplit les cases au fil de la saisie', async () => {
      await render(sheet());
      await type('ogo');

      expect(screen.getByTestId('join-cell-0')).toHaveTextContent('o');
      expect(screen.getByTestId('join-cell-1')).toHaveTextContent('g');
      expect(screen.getByTestId('join-cell-2')).toHaveTextContent('o');
    });

    // La branche « pas encore atteinte » doit être empruntée : sans elle, des
    // cases toujours remplies passeraient le test précédent.
    it('laisse vides les cases non atteintes', async () => {
      await render(sheet());
      await type('ogo');

      expect(screen.getByTestId('join-cell-3')).toHaveTextContent('');
      expect(screen.getByTestId('join-cell-9')).toHaveTextContent('');
    });

    it('normalise une saisie collée avec ses tirets', async () => {
      await render(sheet());
      await type('OGO-KMYY-QRL');

      expect(screen.getByTestId('join-cell-0')).toHaveTextContent('o');
      expect(screen.getByTestId('join-cell-9')).toHaveTextContent('l');
    });
  });

  describe('l’action de validation', () => {
    // Les deux états, chacun avec sa fixture. Le mockup grise le bouton ; on ne
    // le REND PAS, ce qui sort aussi une commande morte de l'arbre
    // d'accessibilité.
    it('ne rend pas l’action tant que le code est incomplet', async () => {
      await render(sheet());
      await type('ogo');

      expect(screen.queryByTestId('join-submit')).toBe(null);
    });

    it('rend l’action quand les dix lettres sont saisies', async () => {
      await render(sheet());
      await type('ogokmyyqrl');

      expect(screen.getByTestId('join-submit')).toBeTruthy();
    });

    // Le slug porte les tirets, la saisie ne les a pas : c'est `formatCodeSlug`
    // qui les rend, et ce test garde le format ATTENDU PAR MEET.
    it('remonte le slug avec ses tirets', async () => {
      const onJoinRoom = jest.fn();
      await render(sheet({ onJoinRoom }));
      await type('ogokmyyqrl');
      await fireEvent.press(screen.getByTestId('join-submit'));

      expect(onJoinRoom).toHaveBeenCalledWith('ogo-kmyy-qrl');
    });
  });

  describe('coller un lien', () => {
    it('accepte un lien d’un hôte connu et remplit les cases', async () => {
      clipboard.getStringAsync.mockResolvedValue('https://meet.linagora.com/ogo-kmyy-qrl');
      await render(sheet());
      await fireEvent.press(screen.getByTestId('join-paste'));

      expect(screen.getByTestId('join-cell-0')).toHaveTextContent('o');
      expect(screen.getByTestId('join-cell-9')).toHaveTextContent('l');
    });

    // La branche de REFUS doit être empruntée : c'est la même allowlist qui
    // protège les liens profonds, et sans ce test elle pourrait disparaître
    // sans qu'aucune suite ne bronche.
    it('refuse un lien d’un hôte inconnu', async () => {
      clipboard.getStringAsync.mockResolvedValue('https://evil.example/ogo-kmyy-qrl');
      await render(sheet());
      await fireEvent.press(screen.getByTestId('join-paste'));

      expect(screen.getByTestId('join-cell-0')).toHaveTextContent('');
      expect(screen.getByTestId('join-paste-error')).toBeTruthy();
    });

    it('n’affiche aucune erreur avant qu’on ait collé', async () => {
      await render(sheet());

      expect(screen.queryByTestId('join-paste-error')).toBe(null);
    });

    it('refuse un presse-papiers vide sans planter', async () => {
      clipboard.getStringAsync.mockResolvedValue('');
      await render(sheet());
      await fireEvent.press(screen.getByTestId('join-paste'));

      expect(screen.getByTestId('join-paste-error')).toBeTruthy();
    });
  });

  describe('les couleurs explicites', () => {
    it('pose la couleur du texte d’une case', async () => {
      await render(sheet());
      await type('o');

      expect(screen.getByTestId('join-cell-0')).toHaveStyle({
        color: tokens.color.textPrimary,
      });
    });

    it('pose la couleur de l’indication', async () => {
      await render(sheet());

      expect(screen.getByTestId('join-hint')).toHaveStyle({
        color: tokens.color.textSectionLabel,
      });
    });

    it('pose la couleur du message d’erreur', async () => {
      clipboard.getStringAsync.mockResolvedValue('https://evil.example/x');
      await render(sheet());
      await fireEvent.press(screen.getByTestId('join-paste'));

      expect(screen.getByTestId('join-paste-error')).toHaveStyle({
        color: tokens.color.danger,
      });
    });
  });

  // Le champ réel est TRANSPARENT — c'est ce qui permet aux dix cases
  // d'afficher un seul état. Son curseur système l'est donc aussi : sans ce
  // repère, rien ne dit où l'on en est, ni même que le champ a le focus.
  describe('le repère de saisie', () => {
    // La position, case par case. Les deux états de `focused` ET les deux
    // bornes de `code.length` : un repère posé sans condition, ou posé toujours
    // au même endroit, échoue ici.
    it('ne marque aucune case tant que le champ n’a pas le focus', async () => {
      await render(sheet());

      expect(screen.queryByTestId('join-caret')).toBe(null);
    });

    it('marque la PREMIÈRE case dès la prise de focus', async () => {
      await render(sheet());

      await fireEvent(screen.getByTestId('join-input'), 'focus');

      expect(screen.getByTestId('join-caret')).toBeTruthy();
      expect(screen.getByTestId('join-cell-0')).toHaveStyle({ color: tokens.color.textPrimary });
    });

    it('avance le repère derrière le dernier caractère saisi', async () => {
      await render(sheet());
      await fireEvent(screen.getByTestId('join-input'), 'focus');

      await fireEvent.changeText(screen.getByTestId('join-input'), 'abc');

      // Le repère est UNIQUE : s'il en restait un sur la case 0, `getByTestId`
      // jetterait sur la multiplicité plutôt que de rendre le bon.
      expect(screen.getByTestId('join-caret')).toBeTruthy();
      // Et les trois cases précédentes portent bien les caractères, donc le
      // repère est en quatrième position et nulle part ailleurs.
      expect(screen.getByTestId('join-cell-0')).toHaveTextContent('a');
      expect(screen.getByTestId('join-cell-2')).toHaveTextContent('c');
      expect(screen.getByTestId('join-cell-3')).toHaveTextContent('');
    });

    it('ne marque plus rien une fois le code complet', async () => {
      await render(sheet());
      await fireEvent(screen.getByTestId('join-input'), 'focus');

      await fireEvent.changeText(screen.getByTestId('join-input'), 'abcdefghij');

      // `code.length` vaut alors le nombre de cases, un index hors du rang :
      // il n'y a plus rien à saisir, et le bouton d'envoi vient d'apparaître.
      expect(screen.queryByTestId('join-caret')).toBe(null);
      expect(screen.getByTestId('join-submit')).toBeTruthy();
    });

    it('retire le repère quand le champ perd le focus', async () => {
      await render(sheet());
      await fireEvent(screen.getByTestId('join-input'), 'focus');
      expect(screen.getByTestId('join-caret')).toBeTruthy();

      await fireEvent(screen.getByTestId('join-input'), 'blur');

      expect(screen.queryByTestId('join-caret')).toBe(null);
    });
  });
});
