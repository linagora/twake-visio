import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Menu } from 'react-native-paper';

import type { CameraChoice } from 'src/call/devices';
import {
  BAR_HIT_SLOP,
  BAR_ICON_COLOR,
  BAR_RIPPLE_COLOR,
  barStyles,
} from 'src/screens/room/controlBar';
import { MenuCheck } from 'src/screens/room/menuCheck';

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
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      // La barre est en bas de l'écran.
      anchorPosition="top"
      contentStyle={barStyles.menuContent}
      anchor={
        <IconButton
          testID="camera-menu-btn"
          icon="chevron-up"
          iconColor={BAR_ICON_COLOR}
          rippleColor={BAR_RIPPLE_COLOR}
          style={barStyles.button}
          hitSlop={BAR_HIT_SLOP}
          onPress={() => {
            setVisible(true);
            // La liste est relue à l'ouverture, et à ce moment seulement :
            // aucun événement de changement de périphérique n'existe sur
            // mobile, et c'est le seul instant où quelqu'un regarde.
            onOpen();
          }}
          accessibilityLabel={t('call.selectCamera')}
        />
      }
    >
      {cameras.map((camera) => (
        <Menu.Item
          key={camera.deviceId}
          testID={`camera-option-${camera.deviceId}`}
          titleStyle={barStyles.menuTitle}
          rippleColor={BAR_RIPPLE_COLOR}
          leadingIcon={
            camera.deviceId === activeDeviceId
              ? () => <MenuCheck testID={`camera-check-${camera.deviceId}`} />
              : undefined
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
    </Menu>
  );
}
