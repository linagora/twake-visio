import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

export type SettingOption = {
  readonly id: string;
  readonly label: string;
};

type Props = {
  readonly label: string;
  // Optionnel : la rangée caméra n'en a pas. Le sien répétait mot pour mot
  // celui de la rangée micro, juste au-dessus — deux phrases identiques
  // empilées sont du bruit, et le mockup ne le donne qu'à la première.
  readonly hint?: string;
  readonly currentLabel: string;
  readonly options: readonly SettingOption[];
  readonly selectedId: string;
  readonly open: boolean;
  // Préfixées, jamais `onPress` : `fireEvent.press` remonte la fibre React
  // jusqu'au premier ancêtre HÔTE, et ni `Pressable` ni un composant à nous
  // n'en sont un. Une prop qui reprend le nom d'un événement hôte est donc
  // trouvée sur notre propre fibre, et le test passe que la prop soit câblée ou
  // non. Mesuré sur ce dépôt : zéro rouge avant renommage, quatre après.
  readonly onRowPress: () => void;
  readonly onOptionPress: (id: string) => void;
  readonly testID: string;
};

// Une rangée de réglage dépliante : libellé, valeur courante, chevron, et les
// options en dessous quand elle est ouverte.
//
// L'état déplié est porté par le PARENT, pas ici : l'écran Réglages n'en ouvre
// qu'une à la fois, ce qu'un état local par rangée ne saurait pas faire.
export function SettingRow({
  label,
  hint,
  currentLabel,
  options,
  selectedId,
  open,
  onRowPress,
  onOptionPress,
  testID,
}: Props): React.ReactElement {
  return (
    <View style={styles.row}>
      <Pressable onPress={onRowPress} style={styles.header} testID={`${testID}-header`}>
        <View style={styles.headerText}>
          <Text style={styles.label} testID={`${testID}-label`}>
            {label}
          </Text>
          {hint === undefined ? null : (
            <Text style={styles.hint} testID={`${testID}-hint`}>
              {hint}
            </Text>
          )}
        </View>
        <Text style={styles.current} testID={`${testID}-current`}>
          {currentLabel}
        </Text>
        <MaterialCommunityIcons
          color={tokens.color.textChevron}
          name={open ? 'chevron-down' : 'chevron-right'}
          size={20}
        />
      </Pressable>
      {open ? (
        <View style={styles.options}>
          {options.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => onOptionPress(option.id)}
              style={[styles.option, option.id === selectedId ? styles.optionSelected : null]}
              testID={`${testID}-option-${option.id}`}
            >
              <Text style={styles.optionLabel} testID={`${testID}-option-label-${option.id}`}>
                {option.label}
              </Text>
              {option.id === selectedId ? (
                <MaterialCommunityIcons
                  color={tokens.color.brandStrong}
                  name="check"
                  size={18}
                  testID={`${testID}-check-${option.id}`}
                />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  current: {
    color: tokens.color.brandStrong,
    flexShrink: 0,
    fontFamily: tokens.font.bold,
    fontSize: 13,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    minHeight: 56,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 14,
  },
  headerText: { flex: 1, gap: 2 },
  hint: {
    color: tokens.color.textSectionLabel,
    fontFamily: tokens.font.medium,
    fontSize: tokens.typography.rowHint.fontSize,
    lineHeight: tokens.typography.rowHint.lineHeight,
  },
  label: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.bold,
    fontSize: tokens.typography.rowTitle.fontSize,
  },
  option: {
    alignItems: 'center',
    borderColor: tokens.color.fieldBorder,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionLabel: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.bold,
    fontSize: 14,
  },
  // `brand` en bordure et non en texte : c'est un anneau, soumis au seuil non
  // textuel de 3:1, qu'il franchit sur blanc comme sur le lavis.
  optionSelected: {
    backgroundColor: tokens.color.brandWash,
    borderColor: tokens.color.brand,
  },
  options: { gap: 6, paddingBottom: 14, paddingHorizontal: tokens.spacing.md },
  row: { borderBottomColor: tokens.color.rowSeparator, borderBottomWidth: 1 },
});
