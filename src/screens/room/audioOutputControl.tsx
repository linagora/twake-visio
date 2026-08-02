import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Text } from 'react-native-paper';

import type { AudioDeviceChoice } from 'src/call/audioDevices';
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
import { SheetCheck } from 'src/screens/room/sheetCheck';
import { SheetRow } from 'src/screens/room/sheetRow';

export type AudioOutputControlProps = {
  readonly mode: AudioRouteControl;
  // Le chemin 'menu' : des CATÉGORIES, tout ce qu'AudioSwitch sait rendre.
  readonly outputs: readonly AudioOutputKind[];
  // Ce que *nous* avons demandé sur ce chemin-là, jamais l'état du système —
  // il n'y est lisible sur aucune des deux plateformes.
  readonly chosen: AudioOutputKind | null;
  // Le chemin 'devices' : un appareil NOMMÉ par ligne.
  readonly devices: readonly AudioDeviceChoice[];
  // L'état CONSTATÉ, lu par `getCommunicationDevice()`. C'est ce qui distingue
  // les deux chemins : ici la coche dit où le son part, pas ce qu'on a demandé.
  readonly currentDeviceId: number | null;
  readonly manual: boolean;
  readonly onOpen: () => void;
  readonly onSelect: (kind: AudioOutputKind) => void;
  readonly onSelectDevice: (device: AudioDeviceChoice) => void;
  readonly onAutomatic: () => void;
  readonly onSystemPicker: () => void;
};

export function AudioOutputControl({
  mode,
  outputs,
  chosen,
  devices,
  currentDeviceId,
  manual,
  onOpen,
  onSelect,
  onSelectDevice,
  onAutomatic,
  onSystemPicker,
}: AudioOutputControlProps): React.ReactElement {
  const { t } = useTranslation();
  // État d'affichage local, jamais métier : le parent n'a rien à en savoir.
  const [visible, setVisible] = useState(false);

  // Même icône, même place, même libellé d'accessibilité dans les trois modes :
  // cohérent en surface, honnête en profondeur. L'icône est fixe — une icône de
  // casque affichée pendant que le son sort du haut-parleur serait un mensonge
  // d'interface, et la catégorie constatée ne suffit pas à la choisir.
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

  // Composé par i18next, jamais en JavaScript : une chaîne assemblée ici ne
  // serait pas traduisible. Même motif que `cameraMenu.tsx`.
  const deviceTitle = (device: AudioDeviceChoice): string => {
    const label = device.name ?? t(audioOutputNameKey(device.kind));
    return device.ordinal === null
      ? label
      : t('call.outputNumbered', { name: label, index: device.ordinal });
  };

  return (
    <>
      {button(() => {
        setVisible(true);
        // La liste est relue à l'ouverture, et à ce moment seulement.
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
            séance. */}
        <Text testID="audio-output-note" variant="labelSmall" style={sheetStyles.note}>
          {manual ? t('call.outputManualUntilEnd') : t('call.outputFollowsDevice')}
        </Text>
        {mode === 'devices'
          ? devices.map((device) => (
              <SheetRow
                key={device.id}
                testID={`audio-output-device-${device.id}`}
                // Le lavis et la coche disent la MÊME chose : même prédicat,
                // écrit une fois. Voir `ROW_SELECTED_COLOR` — le lavis seul ne
                // se distingue du fond de repos que par 1,14:1.
                selected={device.id === currentDeviceId}
                leading={
                  device.id === currentDeviceId ? (
                    <SheetCheck testID={`audio-output-check-${device.id}`} />
                  ) : undefined
                }
                title={deviceTitle(device)}
                onPress={() => {
                  setVisible(false);
                  onSelectDevice(device);
                }}
              />
            ))
          : outputs.map((kind) => (
              <SheetRow
                key={kind}
                testID={`audio-output-option-${kind}`}
                // Le second chemin, et sa propre cible de mutation : ces deux
                // branches sont structurellement identiques mais distinctes,
                // et une seule gardée laisserait l'autre libre de figer.
                selected={kind === chosen}
                leading={
                  kind === chosen ? <SheetCheck testID={`audio-output-check-${kind}`} /> : undefined
                }
                title={t(audioOutputNameKey(kind))}
                onPress={() => {
                  setVisible(false);
                  onSelect(kind);
                }}
              />
            ))}
        {/* Le retour à l'automatique n'existe QUE sur le chemin 'devices' :
            `clearCommunicationDevice()` le donne, alors qu'AudioSwitch ne le
            donne pas — `setUserSelectedAudioDevice` y est `protected`, donc
            aucun appelant extérieur ne peut remettre le champ à `null`. Rendu
            seulement quand il y a quelque chose à défaire : masquer une
            commande indisponible, jamais la griser.

            Son libellé dit un RETOUR, pas une destination. « Automatique »
            seul se lisait comme une quatrième sortie posée à côté de trois
            appareils — alors que l'automatique n'est pas un endroit où envoyer
            le son, c'est l'état par défaut de la séance, et cette ligne ne sert
            qu'à y revenir après l'avoir rompu. Relevé par le propriétaire sur
            appareil, qui a lu la ligne comme un réglage modifiable. */}
        {mode === 'devices' && manual ? (
          <SheetRow
            testID="audio-output-automatic"
            title={t('call.outputAutomatic')}
            onPress={() => {
              setVisible(false);
              onAutomatic();
            }}
          />
        ) : null}
      </BottomSheet>
    </>
  );
}
