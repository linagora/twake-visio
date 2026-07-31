import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  // La même bande que le message de reconnexion et que l'indicateur
  // d'enregistrement : au-dessus de la scène, hors de la barre. Pas de fond
  // propre — il hérite du `backgroundDark` que `call.tsx` force sur
  // `styles.root` dans les deux schémas, exactement comme
  // `recordingIndicator.tsx`. Les deux bandeaux s'empilent en colonne au lieu
  // qu'un écrase l'autre.
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
  },
  // `call.tsx` force un fond sombre dans les deux schémas alors que le thème
  // Paper suit le schéma système : sans cette couleur explicite, le libellé
  // retombe sur `theme.colors.onSurface` — 1,08:1, invisible. 16,65:1 avec.
  text: { color: tokens.color.textDark },
});

export type HandBannerProps = {
  readonly raised: boolean;
  readonly position: number | null;
  readonly onLower: () => void;
};

// Lever la main est un acte qu'on prépare ; la baisser est un acte qu'on subit
// — le modérateur vient de donner la parole, et fouiller un menu à ce
// moment-là est le mauvais moment. Deux appuis pour lever, un pour baisser.
// C'est aussi la seule chose qui rende une main levée oubliée visible pour
// celui qui l'a levée.
export function HandBanner({
  raised,
  position,
  onLower,
}: HandBannerProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!raised) return null;

  return (
    <View testID="hand-banner" style={styles.root}>
      <Text testID="hand-banner-text" style={styles.text}>
        {t('call.handRaised')}
      </Text>
      {/* `null` alors que la main est levée est un cas réel, pas une
          précaution : un horodatage que `Date.parse` refuse sort de la file
          sans sortir de l'attribut. On dit alors la main levée sans inventer
          un rang. */}
      {position === null ? null : (
        <Text testID="hand-banner-position" style={styles.text}>
          {t('call.handPosition', { position })}
        </Text>
      )}
      <Button
        testID="hand-lower"
        mode="text"
        // `mode="text"` n'a pas de fond propre : son texte retombe sur
        // `theme.colors.primary`, qui suit le schéma système — #0057B8 sur
        // `backgroundDark` tombe à 2,86:1. `primaryDark` donne 6,92:1.
        textColor={tokens.color.primaryDark}
        onPress={onLower}
      >
        {t('call.lowerHand')}
      </Button>
    </View>
  );
}
