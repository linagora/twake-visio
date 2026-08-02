import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
 * Les vignettes ne sont PAS affichées : les huit images vivent dans les
 * ressources du module natif, pas dans le bundle JavaScript, et les dupliquer
 * pour un aperçu doublerait leur poids. Chaque fond est donc un numéro et une
 * pastille — l'aperçu réel, c'est la caméra juste au-dessus, qui change dès la
 * sélection.
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
            <MaterialCommunityIcons color={tokens.color.textDark} name="image" size={22} />
            <Text style={styles.label} testID={`${testID}-image-${index}-label`}>
              {String(index)}
            </Text>
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
});
