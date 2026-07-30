import { StyleSheet } from 'react-native';

import { tokens } from 'src/ui/tokens';

// Sept cibles sur une rangée. `IconButton` de Paper fait 40 dp de côté plus
// `margin: 6`, soit 52 dp d'encombrement : six suffisaient à demander 424 dp
// sur un téléphone qui en fait 360. La marge de Paper est neutralisée par la
// prop `style`, appliquée en dernier, et la cible ramenée à 44 dp — la
// recommandation Apple, au lieu des 48 dp de Material. Le coût est nommé, et
// il est compensé verticalement par le `hitSlop` ci-dessous.
//
//     7 × 44 + 1 (dans la paire caméra) + 5 × 8 + 2 × 4 = 357 dp
//
// `borderRadius` est relu depuis le `style` aplati par `IconButton`, donc
// l'ondulation reste ronde.
export const barStyles = StyleSheet.create({
  button: { margin: 0, width: 44, height: 44, borderRadius: 22 },
  // Cet écran est sombre dans les deux schémas alors que le thème Paper suit
  // le schéma système. Un `Menu` laissé intact serait cohérent avec lui-même ;
  // le piège n'apparaît qu'en forçant la surface sans le texte, ou l'inverse.
  // Les deux sont donc forcés : 15,86:1.
  menuContent: { backgroundColor: tokens.color.surfaceDark },
  menuTitle: { color: tokens.color.textDark },
  // Secondaire par la taille (`variant="labelSmall"`), jamais par un gris :
  // `tokens.color.muted` donne 3,88:1 sur cette surface, sous le seuil AA.
  menuNote: {
    color: tokens.color.textDark,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  // La coche du menu. Sa seule fonction est d'occuper la gouttière d'icône
  // d'un `Menu.Item` ; sa couleur vient de l'icône que Paper y pose.
  check: { width: 24, height: 24 },
});

// 16,65:1 sur `backgroundDark`. Aucun `IconButton` de cette barre ne porte
// `disabled` : Paper teste `disabled` avant la couleur passée par l'appelant et
// rend `onSurfaceDisabled`, un quasi-noir en schéma clair, sur un fond sombre.
// Ce qui n'est pas actionnable n'est pas rendu.
export const BAR_ICON_COLOR = tokens.color.textDark;

// Le `hitSlop` de 10 dp que Paper pose par défaut est plus large que les écarts
// retenus : deux zones tactiles voisines se recouvriraient, et le recouvrement
// irait au frère rendu en dernier. Généreux là où rien ne gêne, exact là où ça
// compte. `{...rest}` est étalé après le défaut de Paper, donc celui-ci gagne.
export const BAR_HIT_SLOP = { top: 8, bottom: 8, left: 0, right: 0 };
