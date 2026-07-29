import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

import { tokens, type ColorScheme } from 'src/ui/tokens';

export function makeTheme(scheme: ColorScheme): MD3Theme {
  const base = scheme === 'dark' ? MD3DarkTheme : MD3LightTheme;
  return {
    ...base,
    roundness: tokens.radius.md,
    colors: {
      ...base.colors,
      primary: tokens.color.primary,
      onPrimary: tokens.color.onPrimary,
      background:
        scheme === 'dark' ? tokens.color.backgroundDark : tokens.color.backgroundLight,
      surface: scheme === 'dark' ? tokens.color.surfaceDark : tokens.color.surfaceLight,
      onSurface: scheme === 'dark' ? tokens.color.textDark : tokens.color.textLight,
      error: tokens.color.danger,
    },
  };
}
