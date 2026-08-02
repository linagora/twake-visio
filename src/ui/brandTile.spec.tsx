import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { BrandTile } from 'src/ui/brandTile';

describe('BrandTile', () => {
  // Deux tailles, deux fixtures : sans la seconde, une constante passerait.
  it.each([
    ['sm', 32],
    ['lg', 92],
  ] as const)('rend la taille %s à %i px', async (size, side) => {
    await render(<BrandTile size={size} testID="tile" />);
    expect(screen.getByTestId('tile')).toHaveStyle({ width: side, height: side });
  });

  // Le rayon suit la taille — 10 pour la petite, 26 pour la grande — et ce
  // n'est pas proportionnel : le mockup les pose séparément.
  it.each([
    ['sm', 10],
    ['lg', 26],
  ] as const)('arrondit la taille %s à %i px', async (size, radius) => {
    await render(<BrandTile size={size} testID="tile" />);
    expect(screen.getByTestId('tile')).toHaveStyle({ borderRadius: radius });
  });

  it('rend son glyphe', async () => {
    await render(<BrandTile size="lg" testID="tile" />);
    expect(screen.getByTestId('tile-glyph')).toBeTruthy();
  });

  // Le glyphe est blanc sur le vert de marque. `colors` du dégradé est une prop
  // CONSOMMÉE par `LinearGradient` : on n'assertit pas dessus, on assertit la
  // conséquence joignable — le style du glyphe.
  it('pose la couleur explicite du glyphe', async () => {
    await render(<BrandTile size="lg" testID="tile" />);
    expect(screen.getByTestId('tile-glyph')).toHaveStyle({ color: '#FFFFFF' });
  });
});
