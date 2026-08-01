import React from 'react';
import { useTranslation } from 'react-i18next';

import type { RecordingState } from 'src/call/recording';
import { sheetStyles } from 'src/screens/room/controlBar';
import { SheetRow } from 'src/screens/room/sheetRow';

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
// Pas de `leading` : `SheetRow` insère ce nœud tel quel, sans lui donner de
// couleur — c'est pour cette raison que le glyphe de coche porte sa propre
// couleur explicite ailleurs (`menuCheck.tsx`, réutilisé par `cameraMenu.tsx`
// et `audioOutputControl.tsx`). Ici, l'identité passe par le libellé et sa
// couleur, jamais par une icône.
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
    <SheetRow
      testID="recording-toggle"
      title={t(label)}
      // `SheetRow` applique `rowTitle` en dessous : seul le SURCLASSEMENT
      // d'alerte se passe ici, ce qui dit mieux ce qui est l'exception.
      titleStyle={stopping ? sheetStyles.rowTitleDanger : undefined}
      accessibilityLabel={t(label)}
      onPress={stopping ? onStop : onStart}
    />
  );
}
