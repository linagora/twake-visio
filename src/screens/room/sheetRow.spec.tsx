import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider, Text } from 'react-native-paper';

import { sheetStyles } from 'src/screens/room/controlBar';
import { tokens } from 'src/ui/tokens';
import { SheetRow } from './sheetRow';

function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

describe('SheetRow', () => {
  it('rend le titre sous le suffixe que Menu.Item posait', async () => {
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={jest.fn()} />));

    expect(screen.getByTestId('row-title')).toHaveTextContent('Un titre');
  });

  it('appelle onPress sur l’élément pressable', async () => {
    const onPress = jest.fn();
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={onPress} />));

    await fireEvent.press(screen.getByTestId('row'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // K2, côté absent : la couleur de base s'applique quand même. C'est la
  // propriété qui protège tout appelant distrait.
  it('colore le titre même sans titleStyle', async () => {
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={jest.fn()} />));

    expect(screen.getByTestId('row-title')).toHaveStyle({ color: tokens.color.textDark });
  });

  // K2, côté fourni : et le surclassement gagne. Sans CE test, une
  // implémentation qui ignorerait `titleStyle` passerait le précédent.
  it('laisse titleStyle surclasser la couleur de base', async () => {
    await render(
      withPaper(
        <SheetRow
          testID="row"
          title="Un titre"
          titleStyle={sheetStyles.rowTitleDanger}
          onPress={jest.fn()}
        />,
      ),
    );

    expect(screen.getByTestId('row-title')).toHaveStyle({ color: tokens.color.dangerDark });
  });

  // K3, les deux côtés.
  it('ne rend rien devant le titre sans leading', async () => {
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={jest.fn()} />));

    expect(screen.queryByTestId('leading')).toBe(null);
  });

  it('rend le leading fourni', async () => {
    await render(
      withPaper(
        <SheetRow
          testID="row"
          title="Un titre"
          leading={<Text testID="leading">✓</Text>}
          onPress={jest.fn()}
        />,
      ),
    );

    expect(screen.getByTestId('leading')).toBeTruthy();
  });

  // K4, les deux côtés.
  it('n’annonce aucune étiquette sans accessibilityLabel', async () => {
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={jest.fn()} />));

    expect(screen.queryByLabelText('Une étiquette')).toBe(null);
  });

  it('annonce l’étiquette fournie', async () => {
    await render(
      withPaper(
        <SheetRow
          testID="row"
          title="Un titre"
          accessibilityLabel="Une étiquette"
          onPress={jest.fn()}
        />,
      ),
    );

    expect(screen.getByLabelText('Une étiquette')).toBeTruthy();
  });
});
