import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InitialsAvatar } from 'src/ui/initialsAvatar';
import { tokens } from 'src/ui/tokens';

type Props = {
  readonly title: string;
  readonly userName: string;
  // `onAvatarPress`, jamais `onPress` — voir la note de `settingRow.tsx`.
  readonly onAvatarPress: () => void;
  readonly testID: string;
};

// L'en-tête commun aux trois onglets : titre à gauche, avatar à droite.
//
// L'avatar est un raccourci vers Réglages, comme dans le mockup. Il double
// l'onglet plutôt que de le remplacer : c'est le geste attendu sur une photo de
// profil, et le coût est un `Pressable`.
//
// La tuile-logo du mockup n'est pas rendue ici. Elle y coiffe un écran unique ;
// répétée au-dessus des trois onglets, elle prendrait 32 dp de large sur chaque
// écran pour redire le nom de l'application que le premier onglet affiche déjà
// en titre.
export function AppHeader({ title, userName, onAvatarPress, testID }: Props): React.ReactElement {
  // L'encart HAUT est porté ICI, et non par la racine de l'écran. Les deux
  // peignent, mais pas la même couleur : la racine porte `appBackground`, cet
  // en-tête `cardSurface`. Posé sur la racine, le bandeau d'état prenait donc
  // le gris de la page sous un en-tête blanc — une couture visible, constatée
  // sur appareil. Le bord appartient à la surface qui le BORDE.
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + tokens.spacing.sm }]} testID={testID}>
      <Text numberOfLines={1} style={styles.title} testID={`${testID}-title`}>
        {title}
      </Text>
      <Pressable onPress={onAvatarPress} testID={`${testID}-avatar`}>
        <InitialsAvatar name={userName} size="sm" testID={`${testID}-avatar-badge`} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: tokens.color.cardSurface,
    borderBottomColor: tokens.color.cardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
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
