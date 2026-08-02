import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

export type ActionGlyph = 'video-outline' | 'login-variant';

type Props = {
  readonly title: string;
  readonly subtitle: string;
  readonly glyph: ActionGlyph;
  // La carte pleine porte le dégradé et du blanc ; celle à filet un fond clair
  // et le texte principal. Une seule prop, parce que les deux variantes ne
  // diffèrent QUE par là — six couleurs qui vont ensemble.
  readonly filled: boolean;
  readonly onCardPress: () => void;
  readonly testID: string;
};

// Les deux cartes d'action de l'accueil.
//
// Le dégradé de la variante pleine a été assombri par rapport au mockup : son
// blanc n'y donnait que 2,78:1, sous le seuil du TEXTE. Voir le tableau dans
// `src/ui/tokens`.
export function ActionCard({
  title,
  subtitle,
  glyph,
  filled,
  onCardPress,
  testID,
}: Props): React.ReactElement {
  const foreground = filled ? tokens.color.onBrand : tokens.color.textPrimary;
  const glyphColor = filled ? tokens.color.onBrand : tokens.color.brandStrong;

  const body = (
    <>
      <View style={[styles.badge, filled ? styles.badgeFilled : styles.badgeOutlined]}>
        <MaterialCommunityIcons
          color={glyphColor}
          name={glyph}
          size={24}
          testID={`${testID}-glyph`}
        />
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, { color: foreground }]} testID={`${testID}-title`}>
          {title}
        </Text>
        <Text
          style={[
            styles.subtitle,
            { color: filled ? tokens.color.onBrand : tokens.color.textMeta },
          ]}
          testID={`${testID}-subtitle`}
        >
          {subtitle}
        </Text>
      </View>
    </>
  );

  return (
    <Pressable onPress={onCardPress} testID={testID}>
      {filled ? (
        <LinearGradient
          colors={[tokens.color.cardGradientFrom, tokens.color.cardGradientTo]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.card}
        >
          {body}
        </LinearGradient>
      ) : (
        <View style={[styles.card, styles.cardOutlined]}>{body}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: 14,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  // Un blanc très transparent : sur le dégradé il éclaircit sans introduire une
  // troisième couleur.
  badgeFilled: { backgroundColor: 'rgba(255,255,255,0.18)' },
  badgeOutlined: { backgroundColor: tokens.color.brandWash },
  card: {
    alignItems: 'center',
    borderRadius: tokens.radius.card,
    flexDirection: 'row',
    gap: 14,
    padding: 18,
  },
  cardOutlined: {
    backgroundColor: tokens.color.cardSurface,
    borderColor: tokens.color.cardBorder,
    borderWidth: 1,
  },
  subtitle: { fontFamily: tokens.font.medium, fontSize: 13 },
  text: { flex: 1, gap: 3 },
  title: { fontFamily: tokens.font.extraBold, fontSize: 17 },
});
