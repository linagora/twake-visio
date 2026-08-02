import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { tokens } from 'src/ui/tokens';
import { SurfaceCard } from './surfaceCard';

describe('SurfaceCard', () => {
  // On force la surface ET le texte, ou ni l'un ni l'autre : une surface
  // forcée sous un texte laissé au thème est le pire des trois cas.
  it('pose le fond et la bordure explicites', async () => {
    await render(
      <SurfaceCard testID="card">
        <Text>contenu</Text>
      </SurfaceCard>,
    );
    expect(screen.getByTestId('card')).toHaveStyle({
      backgroundColor: tokens.color.cardSurface,
      borderColor: tokens.color.cardBorder,
    });
  });

  it('rend ses enfants', async () => {
    await render(
      <SurfaceCard testID="card">
        <Text testID="child">contenu</Text>
      </SurfaceCard>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  // `overflow: hidden` n'est pas cosmétique : sans lui, la première et la
  // dernière rangée d'une liste débordent du rayon et l'angle paraît carré.
  it('rogne ses enfants au rayon de la carte', async () => {
    await render(
      <SurfaceCard testID="card">
        <Text>contenu</Text>
      </SurfaceCard>,
    );
    expect(screen.getByTestId('card')).toHaveStyle({
      borderRadius: tokens.radius.card,
      overflow: 'hidden',
    });
  });
});
