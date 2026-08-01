import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Text } from 'react-native-paper';

import type { AudioRouteControl } from 'src/call/audioRoute';
import { audioOutputNameKey, type AudioOutputKind } from 'src/call/devices';
import { BottomSheet } from 'src/screens/room/bottomSheet';
import {
  BAR_HIT_SLOP,
  BAR_ICON_COLOR,
  BAR_RIPPLE_COLOR,
  barStyles,
  sheetStyles,
} from 'src/screens/room/controlBar';
import { MenuCheck } from 'src/screens/room/menuCheck';
import { SheetRow } from 'src/screens/room/sheetRow';

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
      rippleColor={BAR_RIPPLE_COLOR}
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
    <>
      {button(() => {
        setVisible(true);
        // La liste est relue à l'ouverture, et à ce moment seulement : Android
        // n'émet aucun événement de changement de périphérique.
        onOpen();
      })}
      <BottomSheet
        testID="audio-output-sheet"
        visible={visible}
        title={t('call.audioOutput')}
        onDismiss={() => setVisible(false)}
      >
        {/* Secondaire par la taille (`labelSmall`), jamais par un gris :
            `tokens.color.muted` donne 3,88:1 sur `surfaceDark`, sous le seuil
            AA. C'est la seule occasion qu'a l'utilisateur d'apprendre qu'un
            choix manuel désarme la bascule automatique pour le reste de la
            séance. Le `View` qui l'enveloppait sous `Menu` n'a plus lieu
            d'être : ni `Menu.tsx` ni `BottomSheet` ne traitent leurs enfants
            différemment selon leur type — `Menu` rend `{children}` tel quel
            (`Menu.tsx:691,693`) — et ni le commit d'origine (6fb2087) ni aucun
            commentaire n'expliquaient pourquoi il était là. */}
        <Text testID="audio-output-note" variant="labelSmall" style={sheetStyles.note}>
          {chosen === null ? t('call.outputFollowsDevice') : t('call.outputManualUntilEnd')}
        </Text>
        {outputs.map((kind) => (
          <SheetRow
            key={kind}
            testID={`audio-output-option-${kind}`}
            leading={
              kind === chosen ? <MenuCheck testID={`audio-output-check-${kind}`} /> : undefined
            }
            title={t(audioOutputNameKey(kind))}
            onPress={() => {
              setVisible(false);
              onSelect(kind);
            }}
          />
        ))}
      </BottomSheet>
    </>
  );
}
