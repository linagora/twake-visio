import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { WelcomeScreen } from './welcome';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('WelcomeScreen', () => {
  it('propose les trois entrées exigées', async () => {
    await render(<WelcomeScreen />);

    expect(screen.queryByTestId('sign-in-btn')).not.toBeNull();
    expect(screen.queryByTestId('sign-up-btn')).not.toBeNull();
    expect(screen.queryByTestId('org-server-btn')).not.toBeNull();
  });

  it('rend la tuile de marque', async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByTestId('welcome-tile')).toBeTruthy();
  });

  describe('le titre bicolore', () => {
    // Deux `Text`, pas un : « Twake » en texte principal et « Visio » en vert
    // de marque. Un seul nœud ne pourrait pas porter deux couleurs.
    it('pose la couleur explicite de la première moitié', async () => {
      await render(<WelcomeScreen />);
      expect(screen.getByTestId('welcome-title')).toHaveStyle({
        color: tokens.color.textPrimary,
      });
    });

    it('pose la couleur explicite de la seconde moitié', async () => {
      await render(<WelcomeScreen />);
      expect(screen.getByTestId('welcome-title-accent')).toHaveStyle({
        color: tokens.color.brandStrong,
      });
    });
  });

  it('pose la couleur explicite de la baseline', async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByTestId('welcome-tagline')).toHaveStyle({
      color: tokens.color.textSecondary,
    });
  });

  // La HIÉRARCHIE est une décision, et rien ne la gardait : le spec d'origine
  // n'assertait que la présence des boutons. Le mockup met « S'inscrire » en
  // plein et « Se connecter » en contour — l'application vise d'abord des
  // personnes sans compte. Sans ces deux tests, un retour en arrière passerait
  // au vert.
  //
  // `Button` de Paper pose ``${testID}-text`` sur son `Text` interne
  // (`Button.tsx:405`), donc la couleur du libellé est joignable — c'est ce
  // qui distingue les deux modes de façon observable, `mode` étant une prop
  // que le composant consomme.
  it('met S’inscrire en avant, avec du blanc sur le vert', async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByTestId('sign-up-btn-text')).toHaveStyle({ color: tokens.color.onBrand });
  });

  it('met Se connecter en retrait, en vert sur le fond', async () => {
    await render(<WelcomeScreen />);

    expect(screen.getByTestId('sign-in-btn-text')).toHaveStyle({
      color: tokens.color.brandStrong,
    });
  });
});
