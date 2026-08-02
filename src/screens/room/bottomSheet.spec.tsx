import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider, Text } from 'react-native-paper';

import { tokens } from 'src/ui/tokens';
import { BottomSheet, SHEET_HANDLE_COLOR, SHEET_SURFACE_COLOR } from './bottomSheet';

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

  // La constante est importée plutôt que recopiée : c'est la CAUSE qu'on garde
  // — « une couleur explicite est posée » — et non la valeur du jour. Le repli
  // que ce test attrape reste le même : sans elle, `Modal` laisse sa `Surface`
  // transparente (`Modal.tsx:243-246`) et l'égalité stricte échoue.
  it('force la surface et le titre, que le thème clair de Paper trahirait', async () => {
    await render(sheet(true));

    expect(screen.getByTestId('test-sheet-surface')).toHaveStyle({
      backgroundColor: SHEET_SURFACE_COLOR,
    });
    expect(screen.getByTestId('test-sheet-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  // La feuille se distingue de la scène par sa FORME autant que par son fond,
  // et les deux coins hauts sont deux propriétés distinctes : n'en garder qu'un
  // laisserait l'autre libre de disparaître, sur une feuille qui paraîtrait
  // alors de travers.
  it('arrondit les deux coins hauts de la feuille', async () => {
    await render(sheet(true));

    expect(screen.getByTestId('test-sheet-surface')).toHaveStyle({
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
    });
  });

  // La poignée est le seul élément de la feuille qui ne dise rien : elle se
  // garde donc par son rendu et par son fond, faute de texte à observer. Sans
  // couleur, un `View` sans fond est parfaitement invisible et rien d'autre ne
  // le signalerait.
  it('pose une poignée, avec son gabarit et son fond', async () => {
    await render(sheet(true));

    expect(screen.getByTestId('test-sheet-handle')).toHaveStyle({
      alignSelf: 'center',
      backgroundColor: SHEET_HANDLE_COLOR,
      borderRadius: 3,
      height: 4,
      width: 42,
    });
  });

  // Le mockup fixe la taille ET la graisse du titre. La couleur a son propre
  // test ci-dessus ; celui-ci garde ce qu'aucune couleur ne dit — sans lui,
  // retirer la police laisserait le titre retomber sur la police système et le
  // `fontSize: 14` d'une `variant` de Paper.
  it('pose la taille et la graisse du titre', async () => {
    await render(sheet(true));

    expect(screen.getByTestId('test-sheet-title')).toHaveStyle({
      fontFamily: tokens.font.extraBold,
      fontSize: 20,
    });
  });

  // La poignée et le titre restent hors du défilement pour la même raison : ce
  // qui nomme la feuille et ce qui dit comment la refermer ne doivent pas
  // pouvoir sortir de l'écran quand son contenu s'allonge. Le titre a son test
  // plus bas ; celui-ci vise la poignée, ajoutée après lui.
  it('garde la poignée hors du conteneur défilant', async () => {
    await render(sheet(true));

    expect(within(screen.getByTestId('test-sheet-scroll')).queryByTestId('test-sheet-handle')).toBe(
      null,
    );
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

  // `Menu` bornait sa hauteur et faisait défiler au-delà d'un seuil
  // (`Menu.tsx:496-539`, `:687-693`) ; `Modal` ne fait ni l'un ni l'autre. Sans
  // ces deux propriétés, une file de mains levées assez longue pousse le titre
  // de la feuille hors de l'écran, sans moyen de l'y ramener — environ trois
  // lignes suffisent en paysage.
  //
  // Aucun test ne peut prouver qu'on atteint le bas d'une liste : Jest ne
  // dispose pas les vues et ne fait défiler rien. Ceux-ci prouvent la seule
  // chose gardable — que la borne et le conteneur défilant n'ont pas été
  // retirés.
  it('borne la hauteur de la feuille', async () => {
    await render(sheet(true));

    expect(screen.getByTestId('test-sheet-surface')).toHaveStyle({ maxHeight: '80%' });
  });

  it('fait défiler son contenu sans emporter son titre', async () => {
    await render(sheet(true));

    // `within` plutôt que `toContainElement` : ce dernier vient de
    // `jest-native`, dont les types attendent le `ReactTestInstance` de l'ancien
    // rendu de test, quand RNTL 14 rend le sien. Le matcher fonctionnerait à
    // l'exécution, `tsc` refuse. `within` porte la même assertion et se type.
    const scroll = within(screen.getByTestId('test-sheet-scroll'));

    // Le titre est HORS du conteneur défilant : ce qui nomme la feuille ne doit
    // pas pouvoir sortir de l'écran quand son contenu s'allonge.
    expect(scroll.queryByTestId('test-sheet-title')).toBe(null);
    expect(scroll.getByTestId('child')).toBeTruthy();
  });
});
