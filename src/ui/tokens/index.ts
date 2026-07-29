export type ColorScheme = 'light' | 'dark';

export const tokens = {
  color: {
    primary: '#0057B8',
    onPrimary: '#FFFFFF',
    surfaceLight: '#FFFFFF',
    surfaceDark: '#121212',
    backgroundLight: '#F5F7FA',
    backgroundDark: '#0B0B0C',
    textLight: '#1A1A1A',
    textDark: '#ECECEC',
    danger: '#C62828',
    success: '#2E7D32',
    muted: '#6B7280',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 4, md: 8, lg: 16, pill: 999 },
  typography: {
    body: { fontSize: 16, lineHeight: 24 },
    title: { fontSize: 22, lineHeight: 28 },
    caption: { fontSize: 13, lineHeight: 18 },
  },
} as const;
