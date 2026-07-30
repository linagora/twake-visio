import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { IconButton, Menu, Text } from 'react-native-paper';

import type { AudioRouteControl } from 'src/call/audioRoute';
import { audioOutputNameKey, type AudioOutputKind } from 'src/call/devices';
import { BAR_HIT_SLOP, BAR_ICON_COLOR, barStyles } from 'src/screens/room/controlBar';

export type AudioOutputControlProps = {
  readonly mode: AudioRouteControl;
  readonly outputs: readonly AudioOutputKind[];
  // Ce que *nous* avons demandé pendant cette séance, jamais l'état du système
  // — il n'est lisible sur aucune des deux plateformes.
  readonly chosen: AudioOutputKind | null;
  readonly onOpen: () => void;
  readonly onSelect: (kind: AudioOutputKind) => void;
  readonly onSystemPicker: () => void;
};

export function AudioOutputControl({
  mode,
  outputs,
  chosen,
  onOpen,
  onSelect,
  onSystemPicker,
}: AudioOutputControlProps): React.ReactElement {
  const { t } = useTranslation();
  // État d'affichage local, jamais métier : le parent n'a rien à en savoir.
  const [visible, setVisible] = useState(false);

  // Même icône, même place, même libellé d'accessibilité dans les deux modes :
  // cohérent en surface, honnête en profondeur. L'icône est fixe — une icône de
  // casque affichée pendant que le son sort du haut-parleur serait un mensonge
  // d'interface, et rien ne permet de savoir d'où il sort.
  const button = (onPress: () => void): React.ReactElement => (
    <IconButton
      testID="audio-output-btn"
      icon="volume-high"
      iconColor={BAR_ICON_COLOR}
      style={barStyles.button}
      hitSlop={BAR_HIT_SLOP}
      onPress={onPress}
      accessibilityLabel={t('call.audioOutput')}
    />
  );

  // Sur iOS il n'y a rien à peupler : `getAudioOutputs()` y est une constante à
  // deux entrées qui ne sont pas des catégories. Le seul recours est le
  // sélecteur de la plateforme, dont on ne contrôle ni l'apparence ni les
  // libellés — et dont rien ne dit s'il est apparu.
  if (mode === 'system') return button(onSystemPicker);

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      // La barre est en bas de l'écran.
      anchorPosition="top"
      contentStyle={barStyles.menuContent}
      anchor={button(() => {
        setVisible(true);
        // La liste est relue à l'ouverture, et à ce moment seulement : Android
        // n'émet aucun événement de changement de périphérique.
        onOpen();
      })}
    >
      <View>
        {/* Secondaire par la taille (`labelSmall`), jamais par un gris :
            `tokens.color.muted` donne 3,88:1 sur `surfaceDark`, sous le seuil
            AA (voir `controlBar.ts`). C'est la seule occasion qu'a
            l'utilisateur d'apprendre qu'un choix manuel désarme la bascule
            automatique pour le reste de la séance. */}
        <Text testID="audio-output-note" variant="labelSmall" style={barStyles.menuNote}>
          {chosen === null ? t('call.outputFollowsDevice') : t('call.outputManualUntilEnd')}
        </Text>
      </View>
      {outputs.map((kind) => (
        <Menu.Item
          key={kind}
          testID={`audio-output-option-${kind}`}
          titleStyle={barStyles.menuTitle}
          // Un `leadingIcon` fonction ne reçoit jamais la couleur que Paper
          // calcule pour un `leadingIcon` chaîne : `Icon.tsx` (react-native-
          // paper) l'appelle avec `{ color, size, direction, testID }`, mais
          // rien n'oblige la fonction à lire cet argument, et un `View` sans
          // fond ni contenu resterait de toute façon invisible quelle que soit
          // la couleur reçue — même panne que `cameraMenu.tsx` avant sa
          // correction (commit 607f6f5). La coche est donc un vrai glyphe,
          // rendu directement, couleur explicite.
          leadingIcon={
            kind === chosen
              ? () => (
                  <MaterialCommunityIcons
                    testID={`audio-output-check-${kind}`}
                    name="check"
                    size={24}
                    style={barStyles.check}
                  />
                )
              : undefined
          }
          title={t(audioOutputNameKey(kind))}
          onPress={() => {
            setVisible(false);
            onSelect(kind);
          }}
        />
      ))}
    </Menu>
  );
}
