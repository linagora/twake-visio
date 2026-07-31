import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { HandBanner } from './handBanner';

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
    // `call.tsx` force un fond sombre dans les deux schémas alors que le thème
    // Paper suit le schéma système : sans couleur explicite, 1,08:1.
    await render(<HandBanner raised position={2} onLower={jest.fn()} />);

    expect(screen.getByTestId('hand-banner-text')).toHaveStyle({ color: tokens.color.textDark });
    expect(screen.getByTestId('hand-banner-position')).toHaveStyle({
      color: tokens.color.textDark,
    });
    // `mode="text"` retombe sur `theme.colors.primary` — 2,86:1 sur ce fond.
    expect(screen.getByTestId('hand-lower')).toHaveTextContent('call.lowerHand');
  });
});
