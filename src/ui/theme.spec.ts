import { makeTheme } from 'src/ui/theme';
import { tokens } from 'src/ui/tokens';

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
  it("donne au thème clair un fond plus lumineux qu'au thème sombre", () => {
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
    "respecte le contraste AA de la couleur d'erreur sur le fond en %s",
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

  // Les trois rôles que `makeTheme` laissait au violet de référence de Material
  // et que des composants réellement rendus ici consomment : `surfaceVariant`
  // (fond d'un `TextInput` en mode `flat`, le défaut), `onSurfaceVariant`
  // (libellé et texte indicatif du même champ, `description` d'un `List.Item`,
  // anneau non coché d'un `RadioButton`) et `outline` (son trait de repos).
  it.each(['light', 'dark'] as const)(
    'aligne onSurfaceVariant sur onSurface en %s, plutôt que le gris violet MD3 qui échoue en sombre',
    (scheme) => {
      const { colors } = makeTheme(scheme);
      expect(colors.onSurfaceVariant).toBe(colors.onSurface);
    },
  );

  it.each(['light', 'dark'] as const)(
    'respecte le contraste AA de onSurfaceVariant sur surfaceVariant en %s',
    (scheme) => {
      const { colors } = makeTheme(scheme);
      expect(
        computeContrast(colors.onSurfaceVariant, colors.surfaceVariant),
      ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    },
  );

  it.each(['light', 'dark'] as const)('aligne surfaceVariant sur surface en %s', (scheme) => {
    const { colors } = makeTheme(scheme);
    expect(colors.surfaceVariant).toBe(colors.surface);
  });

  // La toute PREMIÈRE utilisation de `tokens.color.muted` comme valeur : jusqu'ici
  // cette constante n'apparaissait que dans des commentaires. Elle échoue le
  // seuil texte en sombre (3,875:1 sur `surfaceDark`), d'où son emploi ici seul —
  // `outline` est une bordure, soumise au seuil NON textuel de 3:1 (WCAG 1.4.11),
  // que les quatre combinaisons franchissent.
  it('fixe outline sur tokens.color.muted, dans les deux schémas', () => {
    expect(makeTheme('light').colors.outline).toBe(tokens.color.muted);
    expect(makeTheme('dark').colors.outline).toBe(tokens.color.muted);
  });
});
