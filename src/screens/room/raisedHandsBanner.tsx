import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import type { RaisedHand } from 'src/call/hands';
import {
  HAND_SIGNAL_BORDER,
  HAND_SIGNAL_SURFACE,
  HAND_SIGNAL_TEXT,
} from 'src/screens/room/handBanner';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  // La même PUCE que `HandBanner`, et les trois mêmes valeurs, importées de lui
  // plutôt que recopiées : l'ambre est la couleur d'état « une main est levée »,
  // et ces deux bandeaux disent la même chose de deux personnes différentes.
  // Les laisser diverger ferait lire deux signaux là où il n'y en a qu'un.
  //
  // Elle ne dépend plus du `backgroundDark` que `call.tsx` force sur
  // `styles.root` : le lavis est translucide et se compose dessus, ce dont les
  // ratios mesurés dans `handBanner.tsx` tiennent compte.
  //
  // Une seule rangée, jamais deux : le compte se pose À CÔTÉ du nom, ce qui rend
  // la hauteur du bandeau indépendante du nombre de mains levées.
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
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
  },
  // Cet écran est sombre dans les deux schémas alors que `makeTheme` rend le
  // thème TOUJOURS clair : sans cette couleur explicite, le libellé retombe sur
  // `theme.colors.onSurface` — 1,17:1 sur ce lavis, invisible. 10,33:1 avec.
  //
  // `flexShrink: 1` n'est pas une précaution : la valeur par défaut de Yoga en
  // React Native est 0, à l'inverse du web. Sans lui, une phrase longue ne se
  // réduit pas et pousse le compte hors de l'écran — le défaut exact que
  // `participantsPanel.tsx` a payé, mesuré à 39 px de nom restant. Avec lui,
  // plus `numberOfLines={1}`, c'est la FIN de la phrase qui se tronque, donc le
  // verbe avant le nom. La phrase est une seule clé, et le rester : les sept
  // traductions posent `{{name}}` à des places différentes — l'allemand met le
  // verbe à la fin — et la découper pour protéger le verbe casserait l'ordre
  // des mots.
  name: {
    color: HAND_SIGNAL_TEXT,
    flexShrink: 1,
    fontFamily: tokens.font.bold,
    fontSize: 13,
  },
  others: { color: HAND_SIGNAL_TEXT, fontFamily: tokens.font.semiBold, fontSize: 12 },
});

export type RaisedHandsBannerProps = {
  // Les mains des AUTRES, déjà triées par `raisedHands()` : la coquille ne
  // choisit ni qui filtrer ni dans quel ordre. Prendre `hands[0]` est de la
  // présentation, pas de la sélection — d'où l'absence d'un `firstRaised()`
  // symétrique de `firstWaiting`, dont l'ordre, lui, est une règle de domaine.
  readonly hands: readonly RaisedHand[];
};

// Ce que `HandBanner` ne dit pas et n'a jamais prétendu dire : qu'un AUTRE
// demande la parole. Sans lui la file ne vit que dans la feuille « Plus », que
// personne n'ouvre sans raison — la fonction était livrée et inutilisable.
//
// Aucun bouton, et c'est délibéré : donner la parole est un acte de la réunion,
// pas de l'application. Cela écarte du même coup les deux pièges de cet écran,
// le `rippleColor` et le `disabled` — dont aucune couleur explicite ne rattrape
// le second (`IconButton/utils.ts:88-93`).
//
// Rendu conditionnellement, jamais basculé par une prop `visible` : Paper
// consomme `visible` avant d'étaler le reste (`Badge.tsx:59-60`), donc l'état ne
// serait joignable par aucune assertion. Rend `null` au repos, comme les trois
// autres locataires de la bande.
export function RaisedHandsBanner({ hands }: RaisedHandsBannerProps): React.ReactElement | null {
  const { t } = useTranslation();
  // `noUncheckedIndexedAccess` rend `hands[0]` optionnel : la file vide et
  // l'absence de premier sont la MÊME condition, il n'y en a pas deux à écrire.
  const first = hands[0];
  if (first === undefined) return null;

  // Même repli que `waitingBanner.tsx`, `handControl.tsx`, `stage.tsx` et
  // `participantsPanel.tsx` : jamais une identité brute, jamais un vide — les
  // deux se lisent comme une panne d'affichage plutôt que comme une personne.
  const name = first.name.trim();
  const label = name.length > 0 ? name : t('call.unnamedParticipant');
  const others = hands.length - 1;

  return (
    <View testID="raised-hands-banner" style={styles.root}>
      <Text testID="raised-hands-banner-name" style={styles.name} numberOfLines={1}>
        {t('call.handRaisedBy', { name: label })}
      </Text>
      {/* Rendu seulement à partir de 1 : « et 0 autre » à côté d'un nom est du
          bruit, et un « 0 » traînerait dans l'arbre d'accessibilité. */}
      {others > 0 ? (
        <Text testID="raised-hands-banner-others" style={styles.others}>
          {t('call.handRaisedOthers', { count: others })}
        </Text>
      ) : null}
    </View>
  );
}
