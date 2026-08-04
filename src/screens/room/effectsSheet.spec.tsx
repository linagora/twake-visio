import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import { tokens } from 'src/ui/tokens';
import { SHEET_SURFACE_COLOR } from './bottomSheet';
import { EffectsSheet } from './effectsSheet';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// Le compte de fonds vient du module natif, absent sous Jest. Huit, comme les
// huit images embarquées — et c'est ce compte qui décide du nombre de tuiles,
// donc du nombre de lignes.
jest.mock('src/call/backgroundEffect', () => ({
  backgroundCount: () => 8,
}));

// `animation.scale` à zéro ramène à zéro les deux animations d'opacité de
// `Modal` (`Modal.tsx:117-144`), sans quoi chacune prendrait 220 ms.
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

describe('EffectsSheet', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  // Les DEUX instructions de `choose`, pour CHACUN des trois sites d'appel.
  // `onPress={() => { onEffectSelect(x); onSheetDismiss(); }}` ne contient
  // aucune conditionnelle : un recensement des branches ne le voit pas, et
  // c'est exactement la forme qui a laissé trois feuilles ouvertes après un
  // choix ailleurs dans ce dépôt.
  describe('chaque tuile choisit ET referme', () => {
    it('« aucun » : annonce le choix', async () => {
      const onEffectSelect = jest.fn();
      const onSheetDismiss = jest.fn();

      await render(
        withPaper(
          <EffectsSheet
            current={{ kind: 'blur' }}
            onEffectSelect={onEffectSelect}
            onSheetDismiss={onSheetDismiss}
            testID="fx"
            visible
          />,
        ),
      );
      await fireEvent.press(screen.getByTestId('fx-none'));

      expect(onEffectSelect).toHaveBeenCalledWith({ kind: 'none' });
    });

    it('« aucun » : referme la feuille', async () => {
      const onSheetDismiss = jest.fn();

      await render(
        withPaper(
          <EffectsSheet
            current={{ kind: 'blur' }}
            onEffectSelect={jest.fn()}
            onSheetDismiss={onSheetDismiss}
            testID="fx"
            visible
          />,
        ),
      );
      await fireEvent.press(screen.getByTestId('fx-none'));

      expect(onSheetDismiss).toHaveBeenCalledTimes(1);
    });

    it('« flou » : annonce le choix', async () => {
      const onEffectSelect = jest.fn();

      await render(
        withPaper(
          <EffectsSheet
            current={{ kind: 'none' }}
            onEffectSelect={onEffectSelect}
            onSheetDismiss={jest.fn()}
            testID="fx"
            visible
          />,
        ),
      );
      await fireEvent.press(screen.getByTestId('fx-blur'));

      expect(onEffectSelect).toHaveBeenCalledWith({ kind: 'blur' });
    });

    it('« flou » : referme la feuille', async () => {
      const onSheetDismiss = jest.fn();

      await render(
        withPaper(
          <EffectsSheet
            current={{ kind: 'none' }}
            onEffectSelect={jest.fn()}
            onSheetDismiss={onSheetDismiss}
            testID="fx"
            visible
          />,
        ),
      );
      await fireEvent.press(screen.getByTestId('fx-blur'));

      expect(onSheetDismiss).toHaveBeenCalledTimes(1);
    });

    // Le TROISIÈME fond, jamais le premier : avec l'index 1, « transmet la
    // tuile pressée » et « renvoie toujours la première » seraient
    // indiscernables.
    it('un fond : annonce SON index, pas celui de la première tuile', async () => {
      const onEffectSelect = jest.fn();

      await render(
        withPaper(
          <EffectsSheet
            current={{ kind: 'none' }}
            onEffectSelect={onEffectSelect}
            onSheetDismiss={jest.fn()}
            testID="fx"
            visible
          />,
        ),
      );
      await fireEvent.press(screen.getByTestId('fx-image-3'));

      expect(onEffectSelect).toHaveBeenCalledWith({ index: 3, kind: 'image' });
      expect(onEffectSelect).not.toHaveBeenCalledWith({ index: 1, kind: 'image' });
    });

    it('un fond : referme la feuille', async () => {
      const onSheetDismiss = jest.fn();

      await render(
        withPaper(
          <EffectsSheet
            current={{ kind: 'none' }}
            onEffectSelect={jest.fn()}
            onSheetDismiss={onSheetDismiss}
            testID="fx"
            visible
          />,
        ),
      );
      await fireEvent.press(screen.getByTestId('fx-image-3'));

      expect(onSheetDismiss).toHaveBeenCalledTimes(1);
    });
  });

  // Les deux conditionnelles de `isSame`, chacune avec une fixture qui la rend
  // vraie ET fausse.
  describe('la tuile active', () => {
    it('distingue deux natures : le flou est actif, « aucun » ne l’est pas', async () => {
      await render(
        withPaper(
          <EffectsSheet
            current={{ kind: 'blur' }}
            onEffectSelect={jest.fn()}
            onSheetDismiss={jest.fn()}
            testID="fx"
            visible
          />,
        ),
      );

      expect(screen.getByTestId('fx-blur')).toHaveStyle({
        backgroundColor: tokens.color.brandStrong,
      });
      expect(screen.getByTestId('fx-none')).not.toHaveStyle({
        backgroundColor: tokens.color.brandStrong,
      });
    });

    // La seconde conditionnelle : deux fonds de MÊME nature, départagés par
    // leur seul index. Sans elle, `a.kind === b.kind` suffirait et les huit
    // vignettes s'allumeraient ensemble.
    it('distingue deux fonds par leur index', async () => {
      await render(
        withPaper(
          <EffectsSheet
            current={{ index: 5, kind: 'image' }}
            onEffectSelect={jest.fn()}
            onSheetDismiss={jest.fn()}
            testID="fx"
            visible
          />,
        ),
      );

      expect(screen.getByTestId('fx-image-5-frame')).toHaveStyle({
        backgroundColor: tokens.color.brandStrong,
      });
      expect(screen.getByTestId('fx-image-4-frame')).not.toHaveStyle({
        backgroundColor: tokens.color.brandStrong,
      });
    });
  });

  describe('la disposition', () => {
    // Huit vignettes RENDUES, pas huit atteignables par un ascenseur : c'est la
    // demande du propriétaire — deux lignes, rien de caché hors écran.
    it('rend les huit fonds', async () => {
      await render(
        withPaper(
          <EffectsSheet
            current={{ kind: 'none' }}
            onEffectSelect={jest.fn()}
            onSheetDismiss={jest.fn()}
            testID="fx"
            visible
          />,
        ),
      );

      for (let index = 1; index <= 8; index += 1) {
        expect(screen.getByTestId(`fx-image-${index}`)).toBeTruthy();
      }
    });

    // Le quart de la largeur est CE qui produit deux lignes pour huit fonds.
    // C'est la seule conséquence observable de la disposition : RNTL ne met
    // rien en page, donc « deux lignes » ne se mesure pas — la largeur qui les
    // impose, si.
    it('donne à chaque cellule le quart de la largeur', async () => {
      await render(
        withPaper(
          <EffectsSheet
            current={{ kind: 'none' }}
            onEffectSelect={jest.fn()}
            onSheetDismiss={jest.fn()}
            testID="fx"
            visible
          />,
        ),
      );

      expect(screen.getByTestId('fx-image-1')).toHaveStyle({ width: '25%' });
    });
  });

  // La doctrine de couleur explicite du dépôt : la surface ET le texte, jamais
  // l'un sans l'autre. Sans `PaperProvider` ancêtre un `Text` dépouillé
  // retomberait sur `rgba(28, 27, 31, 1)` ; l'égalité étant stricte, n'importe
  // quel repli fait échouer l'assertion.
  describe('les couleurs explicites', () => {
    it('force le fond de la feuille', async () => {
      await render(
        withPaper(
          <EffectsSheet
            current={{ kind: 'none' }}
            onEffectSelect={jest.fn()}
            onSheetDismiss={jest.fn()}
            testID="fx"
            visible
          />,
        ),
      );

      // `SHEET_SURFACE_COLOR` et non `surfaceDark` : la feuille est teintée de
      // vert (#151B18) là où `surfaceDark` est un gris neutre (#121212). Écrit
      // de mémoire, ce test attendait le second — c'est l'assertion qui a
      // corrigé la supposition, pas l'inverse.
      expect(screen.getByTestId('fx-surface')).toHaveStyle({
        backgroundColor: SHEET_SURFACE_COLOR,
      });
    });

    it('force la couleur des deux libellés', async () => {
      await render(
        withPaper(
          <EffectsSheet
            current={{ kind: 'none' }}
            onEffectSelect={jest.fn()}
            onSheetDismiss={jest.fn()}
            testID="fx"
            visible
          />,
        ),
      );

      expect(screen.getByTestId('fx-none-label')).toHaveStyle({ color: tokens.color.textDark });
      expect(screen.getByTestId('fx-blur-label')).toHaveStyle({ color: tokens.color.textDark });
    });
  });
});
