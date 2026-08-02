import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

export type AvatarSize = 'sm' | 'md' | 'lg';

type Props = {
  readonly name: string;
  readonly size: AvatarSize;
  readonly testID?: string;
};

// Les trois diamètres du mockup : en-tête, rangée de liste, carte de profil.
const DIAMETER: Readonly<Record<AvatarSize, number>> = { sm: 32, md: 40, lg: 56 };
const GLYPH: Readonly<Record<AvatarSize, number>> = { sm: 13, md: 13, lg: 19 };

// Deux initiales au plus : la première et la DERNIÈRE.
//
// La dernière, pas la deuxième — « Jean Pierre Dupont » donne « JD » et non
// « JP ». C'est le nom de famille qui distingue, et une personne à deux prénoms
// se retrouverait sinon rangée avec les homonymes de son second prénom.
//
// Un nom d'un seul mot n'en donne qu'une : deux lettres du même mot se
// liraient comme deux personnes. Un nom vide n'en donne aucune, plutôt qu'une
// lettre inventée.
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return '';
  const first = words[0] as string;
  if (words.length === 1) return first.slice(0, 1).toUpperCase();
  const last = words[words.length - 1] as string;
  return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase();
}

export function InitialsAvatar({ name, size, testID }: Props): React.ReactElement {
  const diameter = DIAMETER[size];
  return (
    <View
      style={[styles.circle, { borderRadius: diameter / 2, height: diameter, width: diameter }]}
      testID={testID}
    >
      <Text
        style={[styles.text, { fontSize: GLYPH[size] }]}
        testID={testID === undefined ? undefined : `${testID}-text`}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    backgroundColor: tokens.color.avatarBackground,
    justifyContent: 'center',
  },
  text: {
    color: tokens.color.avatarForeground,
    fontFamily: tokens.font.extraBold,
  },
});
