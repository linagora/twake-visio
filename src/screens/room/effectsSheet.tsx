import React from 'react';
import { useTranslation } from 'react-i18next';

import type { BackgroundEffect } from 'src/call/backgroundEffect';
import { BottomSheet } from 'src/screens/room/bottomSheet';
import { EffectsPicker } from 'src/screens/room/effectsPicker';

type Props = {
  readonly visible: boolean;
  readonly current: BackgroundEffect;
  // Préfixée, jamais `onSelect` : voir la note de `settingRow.tsx` sur les noms
  // repris d'événements hôtes, qui rendent un test vert par accident.
  readonly onEffectSelect: (effect: BackgroundEffect) => void;
  readonly onSheetDismiss: () => void;
  readonly testID: string;
};

/**
 * Le choix de l'effet d'arrière-plan, dans sa propre feuille.
 *
 * Utilisé par le PRÉ-JOIN seulement. En séance, le même contenu est monté dans
 * le menu de la caméra — le propriétaire a demandé ce rapprochement, et il est
 * juste : l'objectif et l'arrière-plan règlent la même chose. C'est pourquoi le
 * contenu vit dans `effectsPicker.tsx` et non ici.
 */
export function EffectsSheet({
  visible,
  current,
  onEffectSelect,
  onSheetDismiss,
  testID,
}: Props): React.ReactElement {
  const { t } = useTranslation();

  return (
    <BottomSheet
      testID={testID}
      visible={visible}
      title={t('effects.title')}
      onDismiss={onSheetDismiss}
    >
      <EffectsPicker
        current={current}
        // Les DEUX instructions comptent : annoncer le choix, et refermer. Un
        // gestionnaire à deux instructions n'a aucune conditionnelle, donc un
        // recensement des branches ne le voit pas — c'est la forme qui a laissé
        // trois feuilles ouvertes après un choix ailleurs dans ce dépôt.
        onEffectSelect={(effect) => {
          onEffectSelect(effect);
          onSheetDismiss();
        }}
        testID={testID}
      />
    </BottomSheet>
  );
}
