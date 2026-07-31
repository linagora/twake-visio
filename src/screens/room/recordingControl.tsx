import React from 'react';
import { useTranslation } from 'react-i18next';
import { Menu } from 'react-native-paper';

import type { RecordingState } from 'src/call/recording';
import { BAR_RIPPLE_COLOR, barStyles } from 'src/screens/room/controlBar';

export type RecordingControlProps = {
  readonly state: RecordingState;
  readonly canStart: boolean;
  readonly busy: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
};

// Un seul contrôle, dont l'identité suit la phase : l'exclusivité des deux
// modes n'a besoin d'aucun état supplémentaire — on ne peut pas démarrer
// pendant qu'une chose tourne, puisque la commande est alors un arrêt.
//
// Deux absences plutôt que deux grisages : sans droit, le serveur refuserait ;
// pendant un appel en vol, `disabled` rendrait un quasi-noir illisible que
// Paper calcule avant toute couleur explicite. On masque, on ne grise pas.
//
// Pas de `leadingIcon` : `MenuItem` colore l'icône depuis le thème, donc en
// quasi-noir sur cette surface sombre — c'est pour cette raison que le glyphe
// de coche a dû être extrait dans `menuCheck.tsx`. L'identité passe par le
// libellé et sa couleur.
export function RecordingControl({
  state,
  canStart,
  busy,
  onStart,
  onStop,
}: RecordingControlProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!canStart) return null;
  if (busy) return null;

  const stopping = state.phase !== 'idle';
  const label = stopping ? 'recording.stop' : 'recording.start';

  return (
    <Menu.Item
      testID="recording-toggle"
      title={t(label)}
      titleStyle={stopping ? barStyles.menuTitleDanger : barStyles.menuTitle}
      rippleColor={BAR_RIPPLE_COLOR}
      accessibilityLabel={t(label)}
      onPress={stopping ? onStop : onStart}
    />
  );
}
