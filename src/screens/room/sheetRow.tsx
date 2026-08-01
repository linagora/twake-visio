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
// l'élément pressable (`MenuItem.tsx:191`) et `` `${testID}-title` `` sur son
// `Text` interne (`MenuItem.tsx:225`). Toute la doctrine de contraste du dépôt
// tient sur le second.
//
// `TouchableRipple` étale `{...rest}` sur son `Pressable`
// (`TouchableRipple.native.tsx:94`), donc le `testID` arrive bien sur l'élément
// que `fireEvent.press` atteint.
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
      // Sans lui, Paper calcule l'ondulation depuis `theme.colors.onSurface` :
      // 1,13:1 sur cette surface, une affordance perdue. Voir `controlBar.ts`.
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
