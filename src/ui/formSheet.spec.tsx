import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { FormSheet } from 'src/ui/formSheet';
import { tokens } from 'src/ui/tokens';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Préambule repris de `src/screens/room/bottomSheet.spec.tsx`, pas réinventé :
// `Modal` vit dans un `Portal`, qui lit les encarts de zone sûre.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// `animation.scale` à zéro ramène à zéro les deux animations d'opacité de
// `Modal` (`Modal.tsx:117-144`), qui prendraient sinon 220 ms chacune.
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

function sheet(
  overrides: Partial<React.ComponentProps<typeof FormSheet>> = {},
): React.ReactElement {
  return withPaper(
    <FormSheet
      onSheetDismiss={jest.fn()}
      testID="sheet"
      title="Rejoindre une réunion"
      visible
      {...overrides}
    >
      <Text testID="child">contenu</Text>
    </FormSheet>,
  );
}

describe('FormSheet', () => {
  // `visible` est une prop que `Modal` CONSOMME : `props.visible` sur le nœud
  // rendu vaut `undefined`, et une assertion dessus serait verte dans les deux
  // états. On observe donc le RENDU, qui est la conséquence — c'est aussi ce
  // que fait le spec de `BottomSheet`.
  it('ne monte rien tant qu’elle est fermée', async () => {
    await render(sheet({ visible: false }));

    expect(screen.queryByTestId('sheet-surface')).toBe(null);
    expect(screen.queryByTestId('sheet-title')).toBe(null);
    expect(screen.queryByTestId('child')).toBe(null);
  });

  it('monte son contenu quand elle est ouverte', async () => {
    await render(sheet({ visible: true }));

    expect(screen.getByTestId('child')).toBeTruthy();
  });

  // LA raison d'être de ce composant, distinct de `BottomSheet` : une surface
  // CLAIRE. Sans couleur explicite, le `contentContainerStyle` d'un `Modal` est
  // transparent (`Modal.tsx:243-246`) — ce n'est pas une précaution, c'est une
  // obligation.
  it('pose la surface claire explicite', async () => {
    await render(sheet());

    expect(screen.getByTestId('sheet-surface')).toHaveStyle({
      backgroundColor: tokens.color.cardSurface,
    });
  });

  // On force la surface ET le texte, ou ni l'un ni l'autre.
  it('pose la couleur explicite du titre', async () => {
    await render(sheet());

    expect(screen.getByTestId('sheet-title')).toHaveStyle({ color: tokens.color.textPrimary });
  });

  it('affiche son titre', async () => {
    await render(sheet({ title: 'Nouvelle réunion' }));

    expect(screen.getByTestId('sheet-title')).toHaveTextContent('Nouvelle réunion');
  });

  it('rend la poignée de la feuille', async () => {
    await render(sheet());

    expect(screen.getByTestId('sheet-handle')).toBeTruthy();
  });

  // `onSheetDismiss`, jamais `onDismiss` : le nom d'un événement de `Modal`
  // serait trouvé sur notre propre fibre.
  it('remonte la fermeture demandée par le fond', async () => {
    const onSheetDismiss = jest.fn();
    await render(sheet({ onSheetDismiss }));

    await fireEvent.press(screen.getByLabelText('join.close'));

    expect(onSheetDismiss).toHaveBeenCalledTimes(1);
  });
});
