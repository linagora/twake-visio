import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

import { tokens, type ColorScheme } from 'src/ui/tokens';

export function makeTheme(scheme: ColorScheme): MD3Theme {
  const isDark = scheme === 'dark';
  const base = isDark ? MD3DarkTheme : MD3LightTheme;
  return {
    ...base,
    roundness: tokens.radius.md,
    colors: {
      ...base.colors,
      primary: isDark ? tokens.color.primaryDark : tokens.color.primaryLight,
      onPrimary: isDark ? tokens.color.onPrimaryDark : tokens.color.onPrimaryLight,
      background: isDark ? tokens.color.backgroundDark : tokens.color.backgroundLight,
      surface: isDark ? tokens.color.surfaceDark : tokens.color.surfaceLight,
      onSurface: isDark ? tokens.color.textDark : tokens.color.textLight,
      error: isDark ? tokens.color.dangerDark : tokens.color.dangerLight,
      // Les trois rôles de plus, choisis parce que des composants réellement
      // rendus ici les consomment — pas pour couvrir la palette par principe.
      // `makeTheme` en surchargeait six sur les trente-trois de MD3 ; les
      // vingt-sept autres restaient au violet de référence de Material.
      //
      // `surfaceVariant` est le fond d'un `TextInput` en mode `flat`, qui est le
      // défaut : `server.tsx`, `home.tsx` et `create.tsx` en rendent cinq.
      // `onSurfaceVariant` porte leur libellé et leur texte indicatif, la
      // `description` d'un `List.Item`, et l'anneau non coché d'un
      // `RadioButton`.
      surfaceVariant: isDark ? tokens.color.surfaceDark : tokens.color.surfaceLight,
      onSurfaceVariant: isDark ? tokens.color.textDark : tokens.color.textLight,
      // `muted` échoue le seuil TEXTE en schéma sombre — 3,875:1 sur
      // `surfaceDark`, 4,069:1 sur `backgroundDark` — d'où son absence
      // d'`onSurfaceVariant`, aligné sur `onSurface` à la place. Mais `outline`
      // est le trait de repos d'un champ, pas du texte : le seuil pertinent est
      // celui de WCAG 1.4.11 pour le non-textuel, 3:1, que les quatre
      // combinaisons franchissent. Première utilisation de ce jeton comme
      // valeur ; il ne vivait jusqu'ici que dans des commentaires.
      outline: tokens.color.muted,
    },
  };
}
