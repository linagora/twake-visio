import { MD3LightTheme, type MD3Theme } from 'react-native-paper';

import { tokens } from 'src/ui/tokens';

// La coque est claire quel que soit le schéma système, et c'est délibéré.
//
// `AGENTS.md` consacre sa plus longue section à un piège : `call.tsx` force
// `backgroundDark`, mais react-native-paper fait retomber la couleur de son
// texte sur `theme.colors.onSurface`. Tant que ce thème pouvait être clair OU
// sombre, tout composant posé sur l'écran d'appel devait poser sa couleur
// explicite, et deux périmètres ont livré du noir sur noir — 1,08:1 et 1,13:1.
//
// En rendant la coque toujours claire, `onSurface` redevient JUSTE par défaut
// partout hors appel : le piège cesse de s'étendre aux écrans neufs au lieu
// d'être recopié trois fois de plus. L'écran d'appel, lui, garde ses couleurs
// explicites et la doctrine continue de s'y appliquer mot pour mot.
//
// Le coût, assumé : l'application ne suit plus le mode sombre du système. Le
// mockup ne spécifie aucune valeur sombre pour la coque, et les inventer serait
// de la conception, pas de la transcription.
//
// La fonction ne prend plus de paramètre de schéma : un argument qu'on ignore
// se lit comme un oubli, et laisserait croire que le sombre est encore atteint.
export function makeTheme(): MD3Theme {
  return {
    ...MD3LightTheme,
    roundness: tokens.radius.md,
    colors: {
      ...MD3LightTheme.colors,
      // `brandStrong`, pas `brand` : du blanc sur #1FA45C ne donne que 3,22:1,
      // sous le seuil AA que la spec de ce fichier impose à cette paire.
      primary: tokens.color.brandStrong,
      onPrimary: tokens.color.onBrand,
      background: tokens.color.appBackground,
      surface: tokens.color.cardSurface,
      onSurface: tokens.color.textPrimary,
      error: tokens.color.danger,
      // Les trois rôles de plus, choisis parce que des composants réellement
      // rendus ici les consomment — pas pour couvrir la palette par principe.
      //
      // `surfaceVariant` est le fond d'un `TextInput` en mode `flat`, qui est
      // le défaut : `server.tsx`, `home.tsx` et `create.tsx` en rendent cinq.
      // `onSurfaceVariant` porte leur libellé et leur texte indicatif, la
      // `description` d'un `List.Item`, et l'anneau non coché d'un
      // `RadioButton`.
      surfaceVariant: tokens.color.cardSurface,
      onSurfaceVariant: tokens.color.textPrimary,
      // `outline` est le trait de repos d'un champ, pas du texte : le seuil
      // pertinent est celui de WCAG 1.4.11 pour le non-textuel, 3:1. Et c'est
      // `controlOutline`, PAS `cardBorder` ni `fieldBorder` : ici le trait est
      // la seule chose qui délimite la commande, alors que ceux-là sont
      // décoratifs. Le premier jet les avait confondus — 1,26:1.
      outline: tokens.color.controlOutline,
    },
    fonts: {
      ...MD3LightTheme.fonts,
      bodySmall: { ...MD3LightTheme.fonts.bodySmall, fontFamily: tokens.font.medium },
      bodyMedium: { ...MD3LightTheme.fonts.bodyMedium, fontFamily: tokens.font.medium },
      bodyLarge: { ...MD3LightTheme.fonts.bodyLarge, fontFamily: tokens.font.medium },
      labelSmall: { ...MD3LightTheme.fonts.labelSmall, fontFamily: tokens.font.semiBold },
      labelMedium: { ...MD3LightTheme.fonts.labelMedium, fontFamily: tokens.font.semiBold },
      labelLarge: { ...MD3LightTheme.fonts.labelLarge, fontFamily: tokens.font.semiBold },
      titleSmall: { ...MD3LightTheme.fonts.titleSmall, fontFamily: tokens.font.bold },
      titleMedium: { ...MD3LightTheme.fonts.titleMedium, fontFamily: tokens.font.bold },
      titleLarge: { ...MD3LightTheme.fonts.titleLarge, fontFamily: tokens.font.extraBold },
      headlineSmall: { ...MD3LightTheme.fonts.headlineSmall, fontFamily: tokens.font.extraBold },
    },
  };
}
