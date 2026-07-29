export type ColorScheme = 'light' | 'dark';

// Toute couleur d'avant-plan porte une variante par schéma. Une valeur unique
// partagée entre clair et sombre échoue au contraste sur l'un des deux fonds :
// #C62828 sur #0B0B0C donne 3,4:1, sous le seuil WCAG AA de 4,5:1.
export const tokens = {
  color: {
    primaryLight: '#0057B8',
    primaryDark: '#4D9AFF',
    onPrimaryLight: '#FFFFFF',
    onPrimaryDark: '#0B1B2B',
    surfaceLight: '#FFFFFF',
    surfaceDark: '#121212',
    backgroundLight: '#F5F7FA',
    backgroundDark: '#0B0B0C',
    textLight: '#1A1A1A',
    textDark: '#ECECEC',
    dangerLight: '#C62828',
    dangerDark: '#FF8A80',
    successLight: '#2E7D32',
    successDark: '#81C784',
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
