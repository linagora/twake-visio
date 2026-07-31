import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider, Text } from 'react-native-paper';

import { tokens } from 'src/ui/tokens';
import { BottomSheet } from './bottomSheet';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

function sheet(visible: boolean, onDismiss: () => void = jest.fn()): React.ReactElement {
  return withPaper(
    <BottomSheet testID="test-sheet" visible={visible} title="Le titre" onDismiss={onDismiss}>
      <Text testID="child">un enfant</Text>
    </BottomSheet>,
  );
}

describe('BottomSheet', () => {
  // K1, côté fermé. C'est ce qui garantit que les assertions
  // `queryByTestId(…) → null` des trois spécifications existantes restent vraies
  // après la conversion.
  it('ne monte rien tant qu’elle est fermée', async () => {
    await render(sheet(false));

    expect(screen.queryByTestId('test-sheet-surface')).toBe(null);
    expect(screen.queryByTestId('test-sheet-title')).toBe(null);
    expect(screen.queryByTestId('child')).toBe(null);
  });

  // K1, côté ouvert. La MÊME prop, l'autre valeur : c'est la paire qui prouve,
  // pas l'un des deux.
  it('monte la surface, le titre et les enfants une fois ouverte', async () => {
    await render(sheet(true));

    expect(screen.getByTestId('test-sheet-surface')).toBeTruthy();
    expect(screen.getByTestId('test-sheet-title')).toHaveTextContent('Le titre');
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  // Ce qu'aucun test ne prouvera : qu'elle est VISUELLEMENT en bas — Jest ne
  // dispose pas les vues. Ce test prouve seulement que la propriété qui la met
  // en bas n'a pas été retirée, ce qui est la seule chose gardable.
  it('pose la propriété qui colle la feuille en bas', async () => {
    await render(sheet(true));

    expect(screen.getByTestId('test-sheet-wrapper')).toHaveStyle({
      justifyContent: 'flex-end',
    });
  });

  it('force la surface et le titre, que le thème clair de Paper trahirait', async () => {
    await render(sheet(true));

    expect(screen.getByTestId('test-sheet-surface')).toHaveStyle({
      backgroundColor: tokens.color.surfaceDark,
    });
    expect(screen.getByTestId('test-sheet-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('referme sur un appui hors de la feuille', async () => {
    const onDismiss = jest.fn();
    await render(sheet(true, onDismiss));

    await fireEvent.press(screen.getByTestId('test-sheet-backdrop'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // Le défaut de Paper est la chaîne anglaise en dur `'Close modal'`
  // (`Modal.tsx:107`). Elle atteindrait donc l'écran d'un lecteur d'écran
  // francophone, en anglais, sans qu'aucune règle de chaînes en dur ne la voie
  // passer — elle ne vit pas dans nos fichiers.
  it('annonce le fond dans la langue de l’application', async () => {
    await render(sheet(true));

    expect(screen.getByLabelText('call.closeSheet')).toBeTruthy();
  });
});
