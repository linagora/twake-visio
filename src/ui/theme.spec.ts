import { makeTheme } from 'src/ui/theme';
import { tokens } from 'src/ui/tokens';

// Luminance relative WCAG 2.1. Un test d'inégalité entre deux couleurs
// passerait si l'on les intervertissait ; un test de contraste non.
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
// WCAG 1.4.11 : un élément non textuel — trait, remplissage, glyphe décoratif —
// n'est tenu qu'à 3:1.
const AA_NON_TEXT = 3;

describe('makeTheme', () => {
  // La coque est claire quel que soit le schéma système : c'est la décision de
  // conception du Lot 1, et c'est elle qui rend `onSurface` juste par défaut
  // hors écran d'appel, au lieu d'étendre le piège à 1,08:1 aux écrans neufs.
  it('rend un thème clair, sans paramètre de schéma', () => {
    expect(makeTheme().dark).toBe(false);
    expect(makeTheme().colors.background).toBe(tokens.color.appBackground);
    expect(makeTheme().colors.surface).toBe(tokens.color.cardSurface);
  });

  it('respecte le contraste AA du texte sur le fond', () => {
    const { colors } = makeTheme();
    expect(computeContrast(colors.onSurface, colors.background)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });

  // #1FA45C avec du blanc ne donne que 3,22:1. Le vert qui porte du texte est
  // donc `brandStrong`, et `brand` reste un accent non textuel. Ce test est la
  // garde qui empêche de reprendre la valeur du mockup telle quelle.
  it('respecte le contraste AA de onPrimary sur primary', () => {
    const { colors } = makeTheme();
    expect(computeContrast(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });

  it("respecte le contraste AA de la couleur d'erreur sur le fond", () => {
    const { colors } = makeTheme();
    expect(computeContrast(colors.error, colors.background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('aligne onSurfaceVariant sur onSurface', () => {
    const { colors } = makeTheme();
    expect(colors.onSurfaceVariant).toBe(colors.onSurface);
  });

  it('aligne surfaceVariant sur surface', () => {
    const { colors } = makeTheme();
    expect(colors.surfaceVariant).toBe(colors.surface);
  });

  // `outline` délimite un `TextInput` en mode `outlined`, où rien d'autre ne
  // signale la commande : WCAG 1.4.11 s'y applique, sur les DEUX fonds où un
  // champ peut être posé. Le premier jet y avait mis `fieldBorder`, un trait
  // décoratif à 1,26:1 — c'est ce test qui l'a attrapé.
  it.each([
    ['la surface', tokens.color.cardSurface],
    ['le fond', tokens.color.appBackground],
  ])('respecte le seuil non textuel de outline sur %s', (_label, background) => {
    expect(computeContrast(makeTheme().colors.outline, background)).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
  });

  it('applique le rayon des tokens au thème', () => {
    expect(makeTheme().roundness).toBe(tokens.radius.md);
  });
});

describe('polices du thème', () => {
  // Paper lit `fonts.<variante>.fontFamily` pour chacune de ses variantes de
  // typographie. Sans ce bloc, tout `Text` de Paper retombe sur la police
  // système et la refonte n'est visible nulle part.
  it('pose Manrope sur les variantes de corps, de libellé et de titre', () => {
    const { fonts } = makeTheme();
    expect(fonts.bodyMedium.fontFamily).toBe(tokens.font.medium);
    expect(fonts.labelLarge.fontFamily).toBe(tokens.font.semiBold);
    expect(fonts.titleMedium.fontFamily).toBe(tokens.font.bold);
    expect(fonts.titleLarge.fontFamily).toBe(tokens.font.extraBold);
  });
});

// Les valeurs que le mockup donne et qui échouent WCAG AA ont été corrigées par
// le plus petit assombrissement possible, à teinte préservée. Ce tableau est la
// garde qui empêche de les remettre telles quelles — cinq d'entre elles
// échouaient, dont le libellé d'onglet inactif à 2,85:1.
describe('palette de la coque', () => {
  it.each([
    ['textPrimary sur le fond', tokens.color.textPrimary, tokens.color.appBackground],
    ['textPrimary sur une carte', tokens.color.textPrimary, tokens.color.cardSurface],
    ['textSecondary sur une carte', tokens.color.textSecondary, tokens.color.cardSurface],
    ['textMeta sur une carte', tokens.color.textMeta, tokens.color.cardSurface],
    ['textSectionLabel sur le fond', tokens.color.textSectionLabel, tokens.color.appBackground],
    ['textTabInactive sur une carte', tokens.color.textTabInactive, tokens.color.cardSurface],
    ['textFooter sur le fond', tokens.color.textFooter, tokens.color.appBackground],
    ['brandStrong sur une carte', tokens.color.brandStrong, tokens.color.cardSurface],
    ['brandStrong sur le lavis', tokens.color.brandStrong, tokens.color.brandWash],
    ['danger sur une carte', tokens.color.danger, tokens.color.cardSurface],
    // Le fond le moins favorable des deux, et celui sur lequel « Se
    // déconnecter » est réellement posé.
    ['danger sur le fond', tokens.color.danger, tokens.color.appBackground],
    [
      'avatarForeground sur avatarBackground',
      tokens.color.avatarForeground,
      tokens.color.avatarBackground,
    ],
  ])('%s respecte AA pour du texte', (_label, foreground, background) => {
    expect(computeContrast(foreground, background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  // `brand` porte des remplissages et des anneaux, jamais du texte : seuil 3:1.
  // Et sur BLANC seulement — sur `appBackground` il tombe à 2,99, ce que le
  // second test fige pour que personne ne l'y pose par mégarde.
  it('brand respecte le seuil non textuel sur une carte blanche', () => {
    expect(computeContrast(tokens.color.brand, tokens.color.cardSurface)).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
  });

  it("brand n'atteint PAS le seuil non textuel sur le fond de l'application", () => {
    expect(computeContrast(tokens.color.brand, tokens.color.appBackground)).toBeLessThan(
      AA_NON_TEXT,
    );
  });

  it('textChevron respecte le seuil non textuel sur une carte blanche', () => {
    expect(
      computeContrast(tokens.color.textChevron, tokens.color.cardSurface),
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});
