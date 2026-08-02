import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from 'react-native-paper';

import type { CameraChoice } from 'src/call/devices';
import { BottomSheet } from 'src/screens/room/bottomSheet';
import {
  BAR_HIT_SLOP,
  BAR_ICON_COLOR,
  BAR_RIPPLE_COLOR,
  barStyles,
} from 'src/screens/room/controlBar';
import { SheetCheck } from 'src/screens/room/sheetCheck';
import { SheetRow } from 'src/screens/room/sheetRow';

export type CameraMenuProps = {
  readonly cameras: readonly CameraChoice[];
  readonly activeDeviceId: string | null;
  readonly onOpen: () => void;
  // Le `CameraChoice` entier, pas seulement son `deviceId` : l'écran a besoin
  // de `facing` pour le miroir de sa propre vignette.
  readonly onSelect: (choice: CameraChoice) => void;
};

// Le chevron est toujours rendu, jamais désactivé. Un appareil qui ne rendrait
// qu'une caméra ouvrirait un menu d'une ligne : légèrement inutile, jamais
// cassé — et `disabled` ferait revenir le noir sur noir.
export function CameraMenu({
  cameras,
  activeDeviceId,
  onOpen,
  onSelect,
}: CameraMenuProps): React.ReactElement {
  const { t } = useTranslation();
  // État d'affichage local, jamais métier : le parent n'a rien à en savoir.
  const [visible, setVisible] = useState(false);

  return (
    <>
      <IconButton
        testID="camera-menu-btn"
        icon="chevron-up"
        iconColor={BAR_ICON_COLOR}
        rippleColor={BAR_RIPPLE_COLOR}
        style={barStyles.button}
        hitSlop={BAR_HIT_SLOP}
        onPress={() => {
          setVisible(true);
          // La liste est relue à l'ouverture, et à ce moment seulement : aucun
          // événement de changement de périphérique n'existe sur mobile, et
          // c'est le seul instant où quelqu'un regarde.
          onOpen();
        }}
        accessibilityLabel={t('call.selectCamera')}
      />
      <BottomSheet
        testID="camera-sheet"
        visible={visible}
        title={t('call.selectCamera')}
        onDismiss={() => setVisible(false)}
      >
        {cameras.map((camera) => (
          <SheetRow
            key={camera.deviceId}
            testID={`camera-option-${camera.deviceId}`}
            // `SheetRow` applique sa couleur de titre en dessous : plus de
            // `titleStyle` à passer pour la couleur ordinaire.
            //
            // Le lavis et la coche disent la MÊME chose et viennent donc du
            // même prédicat, écrit une fois. Le lavis seul ne se distingue du
            // fond de repos que par 1,14:1 : c'est la coche qui porte
            // l'information, le lavis qui l'accompagne.
            selected={camera.deviceId === activeDeviceId}
            leading={
              camera.deviceId === activeDeviceId ? (
                <SheetCheck testID={`camera-check-${camera.deviceId}`} />
              ) : undefined
            }
            // Composé par i18next, jamais en JavaScript : une chaîne assemblée
            // ici ne serait pas traduisible.
            title={
              camera.ordinal === null
                ? t(camera.nameKey)
                : t('call.cameraNumbered', { name: t(camera.nameKey), index: camera.ordinal })
            }
            onPress={() => {
              setVisible(false);
              onSelect(camera);
            }}
          />
        ))}
      </BottomSheet>
    </>
  );
}
