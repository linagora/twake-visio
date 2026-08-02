import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import {
  HAND_SIGNAL_BORDER,
  HAND_SIGNAL_SURFACE,
  HAND_SIGNAL_TEXT,
  HandBanner,
} from './handBanner';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}|${JSON.stringify(values)}`,
  }),
}));

describe('HandBanner', () => {
  it('ne rend rien tant que la main est baissée', async () => {
    await render(<HandBanner raised={false} position={3} onLower={jest.fn()} />);

    expect(screen.queryByTestId('hand-banner')).toBe(null);
  });

  it('dit la main levée et propose de la baisser en un appui', async () => {
    const onLower = jest.fn();
    await render(<HandBanner raised position={1} onLower={onLower} />);

    expect(screen.getByTestId('hand-banner-text')).toHaveTextContent('call.handRaised');
    await fireEvent.press(screen.getByTestId('hand-lower'));

    expect(onLower).toHaveBeenCalledTimes(1);
  });

  it('affiche la position reçue, pas une constante', async () => {
    const view = await render(<HandBanner raised position={2} onLower={jest.fn()} />);

    expect(screen.getByTestId('hand-banner-position')).toHaveTextContent(
      'call.handPosition|{"position":2}',
    );

    // Une seconde position, distincte : sans elle, un `1` codé en dur passerait.
    await view.rerender(<HandBanner raised position={5} onLower={jest.fn()} />);

    expect(screen.getByTestId('hand-banner-position')).toHaveTextContent(
      'call.handPosition|{"position":5}',
    );
  });

  it('tait la position quand elle est inconnue, sans taire le bandeau', async () => {
    // Cas réel, pas une précaution : un horodatage que `Date.parse` refuse sort
    // de la file sans sortir de l'attribut.
    await render(<HandBanner raised position={null} onLower={jest.fn()} />);

    expect(screen.getByTestId('hand-banner-text')).toBeTruthy();
    expect(screen.queryByTestId('hand-banner-position')).toBe(null);
  });

  it('porte une couleur explicite sur son texte et sur son action', async () => {
    // `call.tsx` force un fond sombre alors que `makeTheme` rend désormais le
    // thème TOUJOURS clair : sans couleur explicite, 1,17:1 sur ce lavis.
    await render(<HandBanner raised position={2} onLower={jest.fn()} />);

    // 10,33:1 sur le lavis ambre une fois composé sur `backgroundDark`.
    expect(screen.getByTestId('hand-banner-text')).toHaveStyle({ color: HAND_SIGNAL_TEXT });
    expect(screen.getByTestId('hand-banner-position')).toHaveStyle({
      color: HAND_SIGNAL_TEXT,
    });
    expect(screen.getByTestId('hand-lower')).toHaveTextContent('call.lowerHand');
    // Le `Text` interne d'un `Button` Paper porte un `testID` (`${testID}-text`,
    // `Button.tsx:405` dans react-native-paper 5.15.3) et sa couleur y est bien
    // lisible par `toHaveStyle` — vérifié directement (le plan affirmait le
    // contraire), et déjà le précédent établi par
    // `participantsPanel.spec.tsx:240-248` pour ce même `mode="text"`. Sans
    // `textColor` explicite, `mode="text"` retombe sur `theme.colors.primary` —
    // #177E44 sur ce lavis, 3,00:1. `primaryDark` y donne 5,39:1, et il tranche
    // avec l'ambre du libellé, ce qui distingue l'action de l'état.
    expect(screen.getByTestId('hand-lower-text')).toHaveStyle({
      color: tokens.color.primaryDark,
    });
  });

  // On force la SURFACE et le TEXTE, ou ni l'un ni l'autre. Le lavis vaut ici
  // couleur d'état : ambre = « une main est levée », et c'est le seul signal de
  // l'écran à en porter une.
  it('pose le lavis ambre et son filet', async () => {
    await render(<HandBanner raised position={2} onLower={jest.fn()} />);

    expect(screen.getByTestId('hand-banner')).toHaveStyle({
      backgroundColor: HAND_SIGNAL_SURFACE,
      borderColor: HAND_SIGNAL_BORDER,
      borderRadius: 13,
    });
  });
});
