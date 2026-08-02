import { StyleSheet } from 'react-native';

import { tokens } from 'src/ui/tokens';

// SIX cibles sur une rangée, à 52 dp — le gabarit du mockup. `IconButton` de
// Paper fait 40 dp de côté plus `margin: 6` ; la marge est neutralisée par la
// prop `style`, appliquée en dernier, et la cible posée explicitement.
//
//     6 × 52 + 1 (dans la paire caméra) + 4 × 8 + 2 × 4 = 353 dp
//
// `borderRadius` est relu depuis le `style` aplati par `IconButton`, donc
// l'ondulation reste ronde.
//
// **Ces 52 dp étaient hors d'atteinte tant que la rangée portait SEPT
// cibles.** Le compteur de participants y faisait doublon avec celui de
// l'en-tête ; le propriétaire a tranché pour l'en-tête, et la septième cible
// est partie. À sept, le mockup aurait demandé :
//
//     52 + (52 + 1 + 52) + 52 + 52 + 52 + 60 = 373 dp   sur un écran de 360
//
// La rangée d'avant tenait à 357 dp parce qu'elle rabotait la cible à 44. Le
// résultat net du passage à six : 353 dp, soit MOINS de largeur qu'avant pour
// une cible PLUS GRANDE — et 48 dp de marge sur un écran de 360.
//
// La cible tactile d'un bouton de barre, en dp. Nommée plutôt qu'écrite trois
// fois : `barStyles.button` la pose, `BAR_HEIGHT` s'en déduit, et les deux ne
// peuvent plus diverger au premier changement de gabarit.
export const BAR_BUTTON_SIZE = 52;

// Le rembourrage de la rangée, de part et d'autre. Nommé et EXPORTÉ pour la
// même raison que la taille du bouton : `callControlBar.tsx` le pose sur
// `styles.controls`, et `BAR_HEIGHT` juste dessous en dépend. Écrit deux fois,
// il divergerait au premier ajustement — et rien ne le dirait, puisque RNTL ne
// dispose rien et qu'aucun test ne peut voir la hauteur qui en résulte.
export const BAR_PADDING = tokens.spacing.xs;

// La hauteur RÉELLE de la rangée, celle qu'un calque posé par-dessus doit
// dégager :
//
//     4 (padding) + 52 (bouton) + 4 (padding) = 60 dp
//
// C'est le même 60 que cite `src/call/layout.ts` à propos de la boîte offerte à
// la scène.
//
// Lue par `ReactionOverlay`, qui s'ancre en bas à droite — précisément là où
// `leave-btn` termine cette rangée.
export const BAR_HEIGHT = BAR_BUTTON_SIZE + 2 * BAR_PADDING;

// Le voile du mockup : du blanc à 10 %, et non une teinte de plus. C'est lui
// qui donne une SURFACE à chaque commande de la barre, là où elles n'étaient
// que des glyphes nus posés sur le fond noir de `call.tsx`.
//
// C'est la seule couleur de ce fichier qui ne vienne pas de `src/ui/tokens`,
// et la raison est bornée : le jeu de jetons ne porte aucun translucide, et
// `src/ui/` est hors du périmètre de ce sous-lot. Ce n'est pas une couleur
// inventée — c'est `surfaceLight` (#FFFFFF) à 10 % d'opacité. Précédent du
// même office et de la même forme : `src/ui/actionCard.tsx:93`,
// `rgba(255,255,255,0.18)`.
//
// 1,26:1 sur `backgroundDark`, et c'est VOULU : ce fond est décoratif. Ce qui
// identifie une commande reste son glyphe — `BAR_ICON_COLOR`, 16,65:1 — donc
// WCAG 1.4.11 ne s'applique pas ici, exactement comme pour `cardBorder` et
// `rowSeparator` dans `src/ui/tokens`. Un voile qui passerait 3:1 sur ce fond
// ne serait plus un voile.
//
// Il ne touche pas que la rangée : `barStyles.button` habille aussi les deux
// boutons de `chatPanel.tsx`, posés sur `surfaceDark`, où le même voile donne
// 1,30:1. Deux fonds, deux ratios — les confondre est l'erreur que ce dépôt a
// déjà commise pour `BAR_RIPPLE_COLOR`.
export const BAR_SURFACE_COLOR = 'rgba(255, 255, 255, 0.1)';

export const barStyles = StyleSheet.create({
  button: {
    margin: 0,
    width: BAR_BUTTON_SIZE,
    height: BAR_BUTTON_SIZE,
    borderRadius: BAR_BUTTON_SIZE / 2,
    // Posé ICI et non au cas par cas : `cameraMenu.tsx`, `audioOutputControl.tsx`
    // et `moreMenu.tsx` rendent trois des six boutons de la rangée et ne
    // connaissent que ce style. Un voile appliqué dans `callControlBar.tsx`
    // seul laisserait ces trois-là nus au milieu des autres.
    backgroundColor: BAR_SURFACE_COLOR,
  },
  // Le rouge d'alerte du mockup, POSÉ PAR-DESSUS `button` et jamais seul : il
  // ne porte que le fond, tout le reste du gabarit vient de là. Deux emplois,
  // et le mockup leur donne bien le même rouge — un micro ou une caméra
  // coupés, et « raccrocher ».
  //
  // `tokens.color.danger` (#D03939) plutôt que le #E03B3B du mockup, qui n'a
  // pas de jeton : c'est déjà la version assombrie que ce dépôt a retenue de
  // la même famille (voir le tableau de `src/ui/tokens`), et elle mesure
  // MIEUX sous le glyphe — 4,11:1 avec `BAR_ICON_COLOR`, contre 3,66:1 pour
  // la valeur du mockup. La pastille elle-même donne 4,05:1 sur
  // `backgroundDark`, au-dessus des 3:1 qu'un objet graphique demande pour se
  // détacher de son fond.
  danger: { backgroundColor: tokens.color.danger },
  // L'ancre du menu « plus » : un conteneur SANS dimension propre, dont le
  // seul rôle est de donner à la pastille un parent positionné. La cible reste
  // 52 dp et la pastille est hors flux, donc la rangée vaut toujours 353 dp —
  // le calcul ci-dessus n'a pas bougé d'un dp.
  anchor: { position: 'relative' },
  // Le compteur du mockup : fond vert, texte blanc. Les DEUX couleurs sont
  // posées ici, et les deux atteignent bien le rendu — `Badge` extrait
  // `backgroundColor` du style aplati pour le placer lui-même, puis répand le
  // RESTE de ce style APRÈS la couleur de texte qu'il tire du thème
  // (`Badge.tsx:88-120`). Sans elles, Paper appaire `theme.colors.error` et
  // `theme.colors.onError` : un rouge, là où le mockup veut du vert.
  //
  // `brandStrong` et non `brand` : le vert de marque #1FA45C ne donne que
  // 3,22:1 sous du blanc, sous le seuil AA de 4,5 — c'est écrit dans
  // `src/ui/tokens`, « `brand` ne porte JAMAIS de texte ». #177E44 donne
  // 5,12:1 sous le même blanc, et 3,85:1 contre `backgroundDark`, de quoi
  // détacher la pastille du fond de la barre.
  //
  // La hauteur reste celle de Paper — 20 dp (`Badge.tsx:15`, `defaultSize`) —,
  // déjà au-dessus des 19 du mockup.
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: tokens.color.brandStrong,
    color: tokens.color.onBrand,
  },
});

// 16,65:1 sur `backgroundDark`, et TROIS fonds désormais, pas un : 13,23:1 sur
// le voile de `BAR_SURFACE_COLOR`, 4,11:1 sur le rouge de `barStyles.danger`.
// C'est le troisième qui gouverne — au-dessus des 3:1 d'un objet graphique, en
// dessous des 4,5:1 d'un texte, ce qu'un glyphe n'est pas. Une seule couleur de
// glyphe pour les six boutons : `dangerDark` sur ce même rouge tomberait à
// 2,13:1.
//
// Aucun `IconButton` de cette barre ne porte `disabled` : Paper teste
// `disabled` avant la couleur passée par l'appelant et rend `onSurfaceDisabled`,
// un quasi-noir, sur un fond sombre. Ce qui n'est pas actionnable n'est pas
// rendu.
export const BAR_ICON_COLOR = tokens.color.textDark;

// Sans lui, Paper calcule l'ondulation depuis `theme.colors.onSurface` à 12 %
// d'opacité (`TouchableRipple/utils.ts:38-40`) — `textPrimary`, que `makeTheme`
// rend TOUJOURS depuis le Lot 1 de la refonte, sur un fond que `call.tsx` force
// sombre : 1,13:1, invisible. Ce n'était « le défaut de la plupart des
// appareils » que tant que le thème suivait le schéma système ; c'est
// désormais le seul cas. Ce n'est pas de
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
  // le fond de `call.tsx`, pas celui de cette feuille). La seule alerte de cet
  // écran qui soit du TEXTE : elle vit dans une feuille, à deux appuis, donc
  // jamais adjacente au combiné raccroché.
  //
  // Les deux autres rouges sont des FONDS, et ils portent un autre jeton —
  // `barStyles.danger`, sur `danger` : la lisibilité y est celle du glyphe posé
  // dessus, pas celle du rouge lui-même. Ne pas confondre les deux rôles.
  // (Cette ligne disait « la seule couleur d'alerte de cette barre qui ne soit
  // pas celle de quitter », et le remplissage du micro coupé l'a périmée.)
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
