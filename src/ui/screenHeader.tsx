import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

type Props = {
  readonly title: string;
  readonly backLabel: string;
  // `onBackPress`, jamais `onPress` — voir la note de `settingRow.tsx`.
  readonly onBackPress: () => void;
  readonly testID: string;
};

// L'en-tête des écrans POUSSÉS, par opposition à `AppHeader` qui coiffe les
// trois onglets.
//
// Il existe pour une raison unique et mesurée : `app/_layout.tsx` pose
// `headerShown: false` sur tout le Stack. Un écran poussé n'a donc AUCUNE
// commande de sortie que le cadre lui donnerait — ni flèche, ni titre. Sans un
// bouton à lui, c'est un cul-de-sac dont on ne sort qu'en tuant l'application.
//
// `prejoin.tsx` avait découvert la règle et l'avait appliquée chez lui, en
// commentaire. Personne ne l'a balayée vers les autres écrans poussés : trois
// d'entre eux étaient des culs-de-sac, dont un signalé par le propriétaire.
// D'où cette primitive plutôt qu'un quatrième chevron recopié — c'est la
// doctrine d'`AGENTS.md` sur les règles écrites en commentaire, appliquée à
// une règle qui venait justement d'en coûter trois.
export function ScreenHeader({ title, backLabel, onBackPress, testID }: Props): React.ReactElement {
  return (
    <View style={styles.header} testID={testID}>
      <Pressable
        accessibilityLabel={backLabel}
        accessibilityRole="button"
        onPress={onBackPress}
        style={styles.back}
        testID={`${testID}-back`}
      >
        <MaterialCommunityIcons
          color={tokens.color.textPrimary}
          name="chevron-left"
          size={24}
          testID={`${testID}-back-icon`}
        />
      </Pressable>
      <Text numberOfLines={1} style={styles.title} testID={`${testID}-title`}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    marginLeft: -8,
    width: 40,
  },
  header: {
    alignItems: 'center',
    backgroundColor: tokens.color.cardSurface,
    borderBottomColor: tokens.color.cardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: tokens.spacing.sm,
  },
  title: {
    color: tokens.color.textPrimary,
    flexShrink: 1,
    fontFamily: tokens.font.extraBold,
    fontSize: tokens.typography.screenTitle.fontSize,
    letterSpacing: tokens.typography.screenTitle.letterSpacing,
  },
});
