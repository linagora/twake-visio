import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { tokens } from 'src/ui/tokens';

// — Le signal « une main est levée » —
//
// L'ambre est la seule couleur d'ÉTAT de cet écran : elle ne dit ni une action
// ni une erreur, elle dit qu'on demande la parole. Les deux bandeaux qui
// portent ce signal — la sienne (`handBanner`) et celle d'un autre
// (`raisedHandsBanner`) — partagent donc les trois valeurs, importées d'ici
// plutôt que recopiées. Même raison que pour les constantes de `callHeader.tsx`
// et même précédent (`controlBar.ts` → `BAR_HEIGHT`, importé par
// `reactionOverlay.tsx`) : un seul endroit à promouvoir dans `src/ui/tokens`,
// que ce sous-lot ne possède pas.
//
// Les ratios sont mesurés sur le lavis COMPOSÉ, jamais sur l'ambre pur : ces
// deux fonds sont translucides et se posent sur `backgroundDark` (#0B0B0C), ce
// qui donne #2D240B pour le premier.
export const HAND_SIGNAL_SURFACE = 'rgba(255, 193, 7, 0.14)';

// Décoratif : ce bandeau n'est pas une commande, et son texte à 10,33:1 suffit
// à le faire voir. Valeur du mockup, conservée.
export const HAND_SIGNAL_BORDER = 'rgba(255, 193, 7, 0.4)';

// 10,33:1 sur le lavis composé, bien au-dessus des 4,5:1 exigés d'un texte.
export const HAND_SIGNAL_TEXT = '#FFCE3A';

const styles = StyleSheet.create({
  // Une PUCE, et non plus une bande : le rayon de 13 du mockup n'a de sens que sur une
  // surface qui épouse son contenu. `alignSelf: 'center'` la fait, et les
  // marges la bornent — sinon un libellé long la collerait aux deux bords.
  //
  // Elle pose désormais son propre fond, là où l'ancienne bande héritait du
  // `backgroundDark` que `call.tsx` force sur `styles.root`. Les deux bandeaux
  // du signal s'empilent toujours en colonne au lieu qu'un écrase l'autre.
  root: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: HAND_SIGNAL_SURFACE,
    borderColor: HAND_SIGNAL_BORDER,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    justifyContent: 'center',
    marginHorizontal: tokens.spacing.md,
    marginVertical: tokens.spacing.xs,
    paddingLeft: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
  },
  // Cet écran est sombre dans les deux schémas alors que `makeTheme` rend le
  // thème TOUJOURS clair : sans cette couleur explicite, le libellé retombe sur
  // `theme.colors.onSurface` — 1,17:1 sur ce lavis, invisible. 10,33:1 avec.
  text: { color: HAND_SIGNAL_TEXT, fontFamily: tokens.font.bold, fontSize: 13 },
  // Le libellé de « Baisser la main », à la taille de ce qu'il accompagne. Sa
  // COULEUR reste posée par `textColor` : `labelStyle` passe APRÈS `textStyle`
  // dans le tableau de styles de Paper (`Button.tsx:405-412`), donc une couleur
  // écrite ici l'emporterait sur elle sans le dire.
  lowerLabel: { fontFamily: tokens.font.bold, fontSize: 13 },
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
        labelStyle={styles.lowerLabel}
        // `mode="text"` n'a pas de fond propre : son texte retombe sur
        // `theme.colors.primary`, que le Lot 1 fixe désormais toujours au thème
        // clair — #177E44 sur le lavis ambre tombe à 3,00:1. `primaryDark` donne
        // 5,39:1, et son bleu tranche avec l'ambre du libellé : l'action se
        // distingue de l'état qu'elle annule.
        textColor={tokens.color.primaryDark}
        onPress={onLower}
      >
        {t('call.lowerHand')}
      </Button>
    </View>
  );
}
