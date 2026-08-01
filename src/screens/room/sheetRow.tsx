import React from 'react';
import { View, type StyleProp, type TextStyle } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';

import { BAR_RIPPLE_COLOR, sheetStyles } from 'src/screens/room/controlBar';

export type SheetRowProps = {
  readonly testID: string;
  readonly title: string;
  // Un SURCLASSEMENT, jamais la couleur de base : `sheetStyles.rowTitle` est
  // toujours appliqué en dessous. Un appelant qui oublie cette prop obtient
  // donc `textDark`, pas le quasi-noir que Paper calculerait depuis un thème
  // clair sur un écran que `call.tsx` force sombre. La seule valeur attendue
  // ici est `sheetStyles.rowTitleDanger`.
  readonly titleStyle?: StyleProp<TextStyle>;
  readonly leading?: React.ReactNode;
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
  accessibilityLabel,
  onPress,
}: SheetRowProps): React.ReactElement {
  return (
    <TouchableRipple
      testID={testID}
      accessibilityRole="button"
      // Sans lui, Paper calcule l'ondulation depuis `theme.colors.onSurface` :
      // `textLight` sur `surfaceDark`, soit **1,08:1** — une affordance perdue.
      // Ce n'est pas 1,13:1 : celui-là est le même repli sur `backgroundDark`,
      // le fond de la barre, et il est correctement attribué là-bas
      // (`controlBar.ts`). Deux fonds, deux ratios, et les confondre est
      // exactement le défaut que `2fa138c` a corrigé ailleurs dans ce dépôt.
      rippleColor={BAR_RIPPLE_COLOR}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
    >
      <View style={sheetStyles.row}>
        {leading}
        <Text testID={`${testID}-title`} style={[sheetStyles.rowTitle, titleStyle]}>
          {title}
        </Text>
      </View>
    </TouchableRipple>
  );
}
