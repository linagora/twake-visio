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
});

// 16,65:1 sur `backgroundDark`. Aucun `IconButton` de cette barre ne porte
// `disabled` : Paper teste `disabled` avant la couleur passée par l'appelant et
// rend `onSurfaceDisabled`, un quasi-noir en schéma clair, sur un fond sombre.
// Ce qui n'est pas actionnable n'est pas rendu.
export const BAR_ICON_COLOR = tokens.color.textDark;

// Sans lui, Paper calcule l'ondulation depuis `theme.colors.onSurface` à 12 %
// d'opacité (`TouchableRipple/utils.ts:38-40`) — `textLight`, le schéma clair
// par défaut de la plupart des appareils, sur un fond que `call.tsx` force
// sombre dans les deux schémas : 1,13:1, invisible. Ce n'est pas de
// l'illisibilité, c'est une affordance perdue : aucun retour à l'appui,
// « raccrocher » compris.
//
// Vérifié dans les deux sources (`IconButton/utils.ts` et `Menu/utils.ts`,
// mêmes fonctions `getRippleColor`) : une couleur fournie ici est utilisée
// telle quelle, sans l'alpha que Paper applique à sa valeur par défaut — le
// retour anticipé sur une couleur explicite saute ce calcul. L'ondulation est
// donc pleine, pas translucide : un compromis assumé plutôt qu'un défaut, sur
// un fond assez sombre pour qu'un rendu à 12 % y reste douteux.
export const BAR_RIPPLE_COLOR = tokens.color.textDark;

// Le `hitSlop` de 10 dp que Paper pose par défaut est plus large que les écarts
// retenus : deux zones tactiles voisines se recouvriraient, et le recouvrement
// irait au frère rendu en dernier. Généreux là où rien ne gêne, exact là où ça
// compte. `{...rest}` est étalé après le défaut de Paper, donc celui-ci gagne.
export const BAR_HIT_SLOP = { top: 8, bottom: 8, left: 0, right: 0 };

// Les feuilles inférieures qui remplacent les trois menus de la barre. Un
// `Modal` de Paper devient une feuille par UNE propriété de style, et rien
// d'autre : voir `wrapper`.
export const sheetStyles = StyleSheet.create({
  // La seule ligne qui fait la feuille. `Modal` pose son enveloppe en
  // `absoluteFill` avec `justifyContent: 'center'` (`Modal.tsx:238-241`) et
  // applique la prop `style` APRÈS elle (`Modal.tsx:210-215`) : `flex-end`
  // gagne donc, et colle la surface au bas de l'écran.
  wrapper: { justifyContent: 'flex-end' },
  // `Modal` pose `backgroundColor: 'transparent'` sur sa `Surface`
  // (`Modal.tsx:243-246`). Ce fond n'est donc pas une précaution de contraste,
  // c'est une obligation : sans lui la feuille n'a aucun fond. 15,86:1 avec
  // `textDark`, la même paire que les menus qu'elle remplace.
  surface: {
    backgroundColor: tokens.color.surfaceDark,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    paddingVertical: tokens.spacing.sm,
    // `Menu` bornait sa hauteur (`Menu.tsx:496-539`) ; `Modal` ne borne rien.
    // Sans cette ligne, une feuille assez longue — la file des mains levées est
    // la seule ici qui n'a aucune limite en amont — pousse son propre titre
    // hors de l'écran, et rien ne permet de l'y ramener. 80 % laisse toujours
    // voir la scène derrière, ce qui dit qu'on est dans une feuille et non sur
    // un nouvel écran.
    maxHeight: '80%',
  },
  // `flexShrink: 1` et non `flex: 1` : la feuille doit rester HAUTE COMME SON
  // CONTENU tant qu'il tient, et ne se contraindre qu'au-delà. Avec `flex: 1`,
  // une feuille de deux lignes occuperait d'emblée 80 % de l'écran.
  scroll: { flexShrink: 1 },
  // Le titre de la feuille. Il porte son propre espacement plutôt que celui
  // d'une ligne : une ligne est pressable et veut une cible haute, un titre ne
  // l'est pas.
  title: {
    color: tokens.color.textDark,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  // La ligne. 16 dp de padding vertical de part et d'autre d'un texte de
  // ~20 dp donnent ~52 dp de cible — au-dessus des 44 dp que la barre s'impose,
  // parce qu'ici la place ne manque pas.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  rowTitle: { color: tokens.color.textDark },
  // 8,21:1 sur `surfaceDark` (8,62:1 est `dangerDark` sur `backgroundDark` —
  // le fond de `call.tsx`, pas celui de cette feuille). La seule couleur
  // d'alerte de cette barre qui ne soit pas celle de « quitter » : elle vit
  // dans une feuille, à deux appuis, donc jamais adjacente au combiné
  // raccroché.
  rowTitleDanger: { color: tokens.color.dangerDark },
  // Secondaire par la taille (`variant="labelSmall"`), jamais par un gris :
  // `tokens.color.muted` donne 3,88:1 sur cette surface, sous le seuil AA.
  note: {
    color: tokens.color.textDark,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  // La coche de la feuille : un glyphe `MaterialCommunityIcons` rendu
  // directement par `SheetCheck` (`sheetCheck.tsx`), partagé par
  // `cameraMenu.tsx` et `audioOutputControl.tsx`, jamais par la résolution
  // habituelle d'un `Menu.Item`. Pour un `leadingIcon` fonction, `Icon.tsx`
  // (react-native-paper) appelle `s({ color, size, direction, testID })`,
  // mais rien n'oblige la fonction à lire cet argument — la nôtre ne le
  // faisait pas, et un `View` vide n'a de toute façon ni contenu ni fond à
  // colorer. La couleur est donc portée ici, explicitement, et jamais celle
  // que Paper calculerait depuis le thème.
  check: { color: tokens.color.textDark },
});
