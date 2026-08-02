import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

type Props = {
  readonly value: string;
  readonly placeholder: string;
  // `onQueryChange`, jamais `onChangeText` — voir la note de `settingRow.tsx`.
  readonly onQueryChange: (query: string) => void;
  readonly testID: string;
};

// Le champ de recherche de l'Historique.
//
// `TextInput` de react-native et non celui de Paper : celui de Paper apporte un
// libellé flottant, un fond `surfaceVariant` et une hauteur qu'il faudrait
// combattre pour retrouver le filet de 14 px du mockup.
//
// `placeholderTextColor` est indispensable et distinct de `color` : RN ne
// dérive pas l'un de l'autre, et sans lui le texte indicatif retombe sur un gris
// système qu'on ne contrôle pas.
//
// Le filet est décoratif : la loupe et le texte indicatif identifient la
// commande, donc WCAG 1.4.11 n'exige pas 3:1 ici et `fieldBorder` garde la
// valeur du mockup.
export function SearchField({
  value,
  placeholder,
  onQueryChange,
  testID,
}: Props): React.ReactElement {
  return (
    <View style={styles.field} testID={testID}>
      <MaterialCommunityIcons color={tokens.color.textSectionLabel} name="magnify" size={19} />
      <TextInput
        onChangeText={onQueryChange}
        placeholder={placeholder}
        placeholderTextColor={tokens.color.textSectionLabel}
        style={styles.input}
        testID={`${testID}-input`}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    alignItems: 'center',
    backgroundColor: tokens.color.cardSurface,
    borderColor: tokens.color.fieldBorder,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    height: 48,
    paddingHorizontal: 14,
  },
  input: {
    color: tokens.color.textPrimary,
    flex: 1,
    fontFamily: tokens.font.semiBold,
    fontSize: 14.5,
  },
});
