import { tokens } from 'src/ui/tokens';
import { makeTheme } from 'src/ui/theme';

describe('makeTheme', () => {
  it('dérive la couleur primaire du thème clair depuis les tokens', () => {
    const theme = makeTheme('light');
    expect(theme.colors.primary).toBe(tokens.color.primary);
  });

  it('produit un thème sombre distinct du thème clair', () => {
    expect(makeTheme('dark').colors.background).not.toBe(
      makeTheme('light').colors.background,
    );
  });
});
