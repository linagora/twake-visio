import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { backgroundCount, type BackgroundEffect } from 'src/call/backgroundEffect';
import { BottomSheet } from 'src/screens/room/bottomSheet';
import { tokens } from 'src/ui/tokens';

type Props = {
  readonly visible: boolean;
  readonly current: BackgroundEffect;
  // Préfixée, jamais `onSelect` : voir la note de `settingRow.tsx` sur les noms
  // repris d'événements hôtes, qui rendent un test vert par accident.
  readonly onEffectSelect: (effect: BackgroundEffect) => void;
  readonly onSheetDismiss: () => void;
  readonly testID: string;
};

// Les vignettes du sélecteur, 320 px de large — 228 Ko pour les huit.
//
// Elles sont EN PLUS des images natives, pas à leur place : le natif compose en
// 1280, le sélecteur montre en 320. Une seule taille ne peut pas servir les
// deux — c'est d'ailleurs l'erreur qui a produit des fonds en 107 x 60, quand
// j'avais pris les vignettes de la DINUM pour des images de composition.
//
// `require` statique et non calculé : Metro résout les chemins à la
// compilation, et `require(\`…/\${index}.jpg\`)` ne compile pas.
const THUMBNAILS: Readonly<Record<number, number>> = {
  1: require('assets/backgrounds/1.jpg'),
  2: require('assets/backgrounds/2.jpg'),
  3: require('assets/backgrounds/3.jpg'),
  4: require('assets/backgrounds/4.jpg'),
  5: require('assets/backgrounds/5.jpg'),
  6: require('assets/backgrounds/6.jpg'),
  7: require('assets/backgrounds/7.jpg'),
  8: require('assets/backgrounds/8.jpg'),
};

// L'index 0 n'est pas un fond : c'est « aucun ». Les fonds DINUM sont numérotés
// de 1 à 8 dans les ressources du module natif, et on garde cette numérotation
// plutôt que de décaler — un décalage silencieux entre JavaScript et natif est
// exactement ce qui produit un fond de travers sans message d'erreur.
function backgroundIndexes(): readonly number[] {
  return Array.from({ length: backgroundCount() }, (_, offset) => offset + 1);
}

function isSame(a: BackgroundEffect, b: BackgroundEffect): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'image' || b.kind !== 'image' || a.index === b.index;
}

/**
 * Le choix de l'effet d'arrière-plan.
 *
 * Chaque fond est montré par sa VIGNETTE. Une première version n'affichait
 * qu'un numéro, pour ne pas embarquer les images deux fois ; le propriétaire a
 * signalé qu'un sélecteur de fonds sans image ne se choisit pas. 228 Ko pour
 * les huit est le prix, et il est juste.
 */
export function EffectsSheet({
  visible,
  current,
  onEffectSelect,
  onSheetDismiss,
  testID,
}: Props): React.ReactElement {
  const { t } = useTranslation();

  const choose = (effect: BackgroundEffect): void => {
    onEffectSelect(effect);
    onSheetDismiss();
  };

  return (
    <BottomSheet
      testID={testID}
      visible={visible}
      title={t('effects.title')}
      onDismiss={onSheetDismiss}
    >
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          onPress={() => choose({ kind: 'none' })}
          style={[styles.tile, isSame(current, { kind: 'none' }) ? styles.tileActive : null]}
          testID={`${testID}-none`}
        >
          <MaterialCommunityIcons color={tokens.color.textDark} name="cancel" size={22} />
          <Text style={styles.label} testID={`${testID}-none-label`}>
            {t('effects.none')}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => choose({ kind: 'blur' })}
          style={[styles.tile, isSame(current, { kind: 'blur' }) ? styles.tileActive : null]}
          testID={`${testID}-blur`}
        >
          <MaterialCommunityIcons color={tokens.color.textDark} name="blur" size={22} />
          <Text style={styles.label} testID={`${testID}-blur-label`}>
            {t('effects.blur')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        contentContainerStyle={styles.row}
        showsHorizontalScrollIndicator={false}
      >
        {backgroundIndexes().map((index) => (
          <Pressable
            accessibilityRole="button"
            key={index}
            onPress={() => choose({ index, kind: 'image' })}
            style={[
              styles.tile,
              isSame(current, { index, kind: 'image' }) ? styles.tileActive : null,
            ]}
            testID={`${testID}-image-${index}`}
          >
            <Image
              source={THUMBNAILS[index]}
              style={styles.thumbnail}
              testID={`${testID}-image-${index}-thumb`}
            />
          </Pressable>
        ))}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  // Une couleur EXPLICITE, comme tout ce qui est posé sur cet écran : le thème
  // est toujours clair depuis le Lot 1, et Paper retomberait sur un quasi-noir
  // au-dessus d'un fond sombre.
  label: { color: tokens.color.textDark, fontFamily: tokens.font.semiBold, fontSize: 12 },
  row: { flexDirection: 'row', gap: tokens.spacing.sm, padding: tokens.spacing.md },
  tile: {
    alignItems: 'center',
    borderColor: tokens.color.controlOutline,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    gap: 4,
    justifyContent: 'center',
    minHeight: 64,
    width: 72,
  },
  // 3,85:1 sur `backgroundDark` — au-dessus des 3:1 qu'un objet graphique
  // demande pour se détacher de son fond.
  tileActive: { backgroundColor: tokens.color.brandStrong, borderColor: tokens.color.brand },
  // La vignette remplit la tuile : c'est l'image qu'on choisit, pas une icône
  // à côté d'un libellé.
  thumbnail: { borderRadius: tokens.radius.sm, height: 56, width: 64 },
});
