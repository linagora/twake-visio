import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider, Text } from 'react-native-paper';

import { sheetStyles } from 'src/screens/room/controlBar';
import { tokens } from 'src/ui/tokens';
import { ROW_REST_COLOR, ROW_SELECTED_COLOR, SheetRow } from './sheetRow';

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

  // La troisième chose que `Menu.Item` donnait gratuitement (`MenuItem.tsx:194`),
  // et la seule qui ne se voie pas : `TouchableRipple` ne pose AUCUN rôle par
  // défaut. Sans elle, chaque ligne de feuille est annoncée comme du texte
  // quelconque — rien ne dit qu'on peut appuyer dessus. Relevée par la revue de
  // branche, jamais par un test : d'où celui-ci.
  it('annonce un rôle de bouton, que Menu.Item posait', async () => {
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={jest.fn()} />));

    expect(screen.getByTestId('row')).toHaveProp('accessibilityRole', 'button');
  });

  // K5, côté au repos. Les trois propriétés vivent sur l'élément PRESSABLE :
  // `TouchableRipple` étale `style` sur son `Pressable`
  // (`TouchableRipple.native.tsx:94`), donc c'est bien le nœud que rend
  // `getByTestId('row')` qui les porte, celui-là même que `fireEvent.press`
  // atteint. Sur le conteneur interne, elles ne seraient joignables par rien —
  // il n'a pas de `testID`.
  it('pose le fond de repos, la forme et la cible minimale', async () => {
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={jest.fn()} />));

    expect(screen.getByTestId('row')).toHaveStyle({
      backgroundColor: ROW_REST_COLOR,
      borderRadius: 12,
      minHeight: 48,
      // Sans elle, l'ondulation d'Android déborde des coins arrondis :
      // `TouchableRipple` ne pose `overflow: 'hidden'` que pour un rendu
      // `borderless` (`TouchableRipple.native.tsx:94`), que celui-ci n'est pas.
      // Le rendu ne s'observe pas sous Jest — le préréglage fixe
      // `Platform.OS` à `'ios'` — mais la PROPRIÉTÉ, elle, s'observe.
      overflow: 'hidden',
    });
  });

  // K5, côté sélectionné. LA MÊME prop, l'autre valeur : c'est la paire qui
  // prouve, pas l'un des deux. Sans ce test, `selected ? … : …` pourrait être
  // la constante `rowRest` et le précédent resterait vert ; sans le précédent,
  // elle pourrait être la constante `rowSelected`.
  it('bascule sur le lavis de sélection quand la ligne est choisie', async () => {
    await render(
      withPaper(<SheetRow testID="row" title="Un titre" selected onPress={jest.fn()} />),
    );

    expect(screen.getByTestId('row')).toHaveStyle({ backgroundColor: ROW_SELECTED_COLOR });
  });

  // Le défaut de la prop, qui est le cas de la plupart des appelants — les
  // trois actions de modération, le partage, le chat, la main levée, le retour
  // à l'automatique. Une valeur par défaut inversée les laverait toutes en
  // vert, et le test ci-dessus ne le verrait pas.
  it('ne lave rien quand l’appelant ne dit pas si la ligne est choisie', async () => {
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={jest.fn()} />));

    expect(screen.getByTestId('row')).not.toHaveStyle({ backgroundColor: ROW_SELECTED_COLOR });
  });

  it('pose la graisse et la taille du titre', async () => {
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={jest.fn()} />));

    expect(screen.getByTestId('row-title')).toHaveStyle({
      fontFamily: tokens.font.semiBold,
      fontSize: tokens.typography.rowTitle.fontSize,
    });
  });
});
