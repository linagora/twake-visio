import { makeTheme } from 'src/ui/theme';

// Luminance relative WCAG 2.1. Un test d'inégalité entre clair et sombre
// passerait si l'on intervertissait les deux thèmes ; un test de contraste non.
function computeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function computeContrast(a: string, b: string): number {
  const [light, dark] = [computeLuminance(a), computeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

const AA_NORMAL_TEXT = 4.5;

describe('makeTheme', () => {
  it('donne au thème clair un fond plus lumineux qu\'au thème sombre', () => {
    expect(computeLuminance(makeTheme('light').colors.background)).toBeGreaterThan(
      computeLuminance(makeTheme('dark').colors.background),
    );
  });

  it.each(['light', 'dark'] as const)(
    'respecte le contraste AA du texte sur le fond en %s',
    (scheme) => {
      const { colors } = makeTheme(scheme);
      expect(computeContrast(colors.onSurface, colors.background)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    },
  );

  it.each(['light', 'dark'] as const)(
    'respecte le contraste AA de la couleur d\'erreur sur le fond en %s',
    (scheme) => {
      const { colors } = makeTheme(scheme);
      expect(computeContrast(colors.error, colors.background)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    },
  );

  it.each(['light', 'dark'] as const)(
    'respecte le contraste AA de onPrimary sur primary en %s',
    (scheme) => {
      const { colors } = makeTheme(scheme);
      expect(computeContrast(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    },
  );

  it('applique le rayon des tokens au thème', () => {
    expect(makeTheme('light').roundness).toBe(8);
  });
});
