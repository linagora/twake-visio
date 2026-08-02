import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { TouchableRipple } from 'react-native-paper';

import { BAR_RIPPLE_COLOR } from 'src/screens/room/controlBar';
import { tokens } from 'src/ui/tokens';

// — Les deux fonds d'une ligne de feuille —
//
// Relevés sur le mockup, exportés pour que les spécifications les assertent
// sans recopier un rgba dans quatre fichiers. Ils vivent ici plutôt que dans
// `src/ui/tokens` pour la raison écrite en tête de `bottomSheet.tsx` : `src/ui/`
// appartient au lot d'intégration.
//
// Le blanc à 7 % donne #252B28 une fois composé sur `SHEET_SURFACE_COLOR` : de
// quoi détacher la ligne de la feuille sans la transformer en carte. Il ne
// porte aucune information — le titre dit ce que fait la ligne — donc WCAG
// 1.4.11 ne s'y applique pas.
export const ROW_REST_COLOR = 'rgba(255, 255, 255, 0.07)';

// Le vert de marque (`tokens.color.brand`, #1FA45C) à 22 %, soit #173927 une
// fois composé sur la feuille. `textDark` y donne 10,77:1.
//
// Il ne porte pas non plus l'information de sélection À LUI SEUL : composé sur
// la feuille, il ne se distingue du fond de repos que par 1,14:1, très en
// dessous des 3:1 de WCAG 1.4.11. C'est la COCHE de `sheetCheck.tsx` qui dit
// « celle-ci », et le lavis qui l'accompagne — jamais l'inverse. Une sélection
// signalée par la seule couleur serait invisible à qui distingue mal les
// verts, et ici elle le serait pour tout le monde.
export const ROW_SELECTED_COLOR = 'rgba(31, 164, 92, 0.22)';

// 48 dp de cible minimale et 12 de rayon, relevés sur le mockup. `tokens.radius`
// n'a pas de 12 (sm 4, md 8, lg 16, card 18) : nommé ici en attendant que
// l'intégration l'y range.
const ROW_MIN_HEIGHT = 48;
const ROW_RADIUS = 12;

const styles = StyleSheet.create({
  // La pastille : fond, forme et marges, sur l'élément PRESSABLE lui-même.
  // `TouchableRipple` étale `style` sur son `Pressable`
  // (`TouchableRipple.native.tsx:94`), donc c'est bien le nœud que
  // `getByTestId(testID)` rend qui les porte — et l'ondulation reste dans la
  // pastille grâce à `overflow`.
  //
  // 8 dp de marge et 8 dp de rembourrage : le titre tombe donc à 16 dp du bord
  // de la feuille, exactement où `sheetStyles.note` pose les libellés qui ne
  // sont pas des lignes — le titre de la file des mains levées, celui du
  // sélecteur de réactions, l'explication de la sortie audio. Ces trois-là
  // vivent dans des fichiers que ce sous-lot ne possède pas ; aligner la ligne
  // sur eux est la seule façon de ne pas décaler la feuille en deux moitiés.
  row: {
    borderRadius: ROW_RADIUS,
    justifyContent: 'center',
    marginBottom: tokens.spacing.xs,
    marginHorizontal: tokens.spacing.sm,
    minHeight: ROW_MIN_HEIGHT,
    overflow: 'hidden',
  },
  rowRest: { backgroundColor: ROW_REST_COLOR },
  rowSelected: { backgroundColor: ROW_SELECTED_COLOR },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
  },
  // Un `Text` de react-native, plus celui de Paper : la couleur est explicite
  // de toute façon (voir ci-dessous) et la graisse vient du mockup, donc plus
  // rien ne reste à hériter du thème. Même choix que le titre de la feuille.
  title: {
    color: tokens.color.textDark,
    fontFamily: tokens.font.semiBold,
    fontSize: tokens.typography.rowTitle.fontSize,
    lineHeight: tokens.typography.rowTitle.lineHeight,
  },
});

export type SheetRowProps = {
  readonly testID: string;
  readonly title: string;
  // Un SURCLASSEMENT, jamais la couleur de base : `styles.title` est toujours
  // appliqué en dessous. Un appelant qui oublie cette prop obtient donc
  // `textDark`, pas le quasi-noir que Paper calculerait depuis un thème clair
  // sur un écran que `call.tsx` force sombre. Les seules valeurs attendues ici
  // sont les couleurs d'alerte — `sheetStyles.rowTitleDanger` pour
  // `recordingControl.tsx`, son équivalent local pour `participantsPanel.tsx`.
  readonly titleStyle?: StyleProp<TextStyle>;
  readonly leading?: React.ReactNode;
  // Le lavis vert du mockup. Purement visuel : la ligne reste pressable, et ce
  // qui DIT la sélection est la coche passée en `leading` — voir le commentaire
  // de `ROW_SELECTED_COLOR`. Nommée `selected` et non `checked` : rien ici ne
  // se coche ni ne se décoche, on choisit parmi des exclusifs.
  readonly selected?: boolean;
  readonly accessibilityLabel?: string;
  readonly onPress: () => void;
};

// Ce que `Menu.Item` donnait gratuitement et qu'il faut rendre : `testID` sur
// l'élément pressable (`MenuItem.tsx:191`), `` `${testID}-title` `` sur son
// `Text` interne (`MenuItem.tsx:225`), et un RÔLE D'ACCESSIBILITÉ
// (`MenuItem.tsx:194`). Toute la doctrine de contraste du dépôt tient sur le
// deuxième ; le troisième a failli être oublié, et il ne se voit pas.
//
// `TouchableRipple` ne pose AUCUN rôle par défaut. Sans la ligne ci-dessous,
// chaque ligne de feuille — partage, enregistrement, main levée, chaque caméra,
// chaque sortie audio — serait annoncée par un lecteur d'écran comme du texte
// quelconque, sans rien qui dise qu'on peut appuyer dessus. Aucun test ne
// l'aurait signalé, et rien ne se voit à l'œil : c'est une régression qui ne
// coûte qu'aux gens qui n'ont pas le choix de la contourner.
//
// `button` plutôt que `menuitem` : ce n'est plus un menu, et `Modal` n'expose
// aucun conteneur de rôle `menu` qui donnerait un sens au second.
//
// `TouchableRipple` étale `{...rest}` sur son `Pressable`
// (`TouchableRipple.native.tsx:94`), donc `testID` comme `accessibilityRole`
// arrivent bien sur l'élément que `fireEvent.press` atteint.
export function SheetRow({
  testID,
  title,
  titleStyle,
  leading,
  selected = false,
  accessibilityLabel,
  onPress,
}: SheetRowProps): React.ReactElement {
  return (
    <TouchableRipple
      testID={testID}
      accessibilityRole="button"
      // Sans lui, Paper calcule l'ondulation depuis `theme.colors.onSurface` :
      // `textLight` sur la feuille, soit **1,08:1** — une affordance perdue.
      // Ce n'est pas 1,13:1 : celui-là est le même repli sur `backgroundDark`,
      // le fond de la barre, et il est correctement attribué là-bas
      // (`controlBar.ts`). Deux fonds, deux ratios, et les confondre est
      // exactement le défaut que `2fa138c` a corrigé ailleurs dans ce dépôt.
      rippleColor={BAR_RIPPLE_COLOR}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[styles.row, selected ? styles.rowSelected : styles.rowRest]}
    >
      <View style={styles.content}>
        {leading}
        <Text testID={`${testID}-title`} style={[styles.title, titleStyle]}>
          {title}
        </Text>
      </View>
    </TouchableRipple>
  );
}
