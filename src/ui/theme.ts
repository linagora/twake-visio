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
    },
  };
}
