import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native-paper';

import type { AudioDeviceChoice } from 'src/call/audioDevices';
import type { AudioRouteControl } from 'src/call/audioRoute';
import { audioOutputNameKey, type AudioOutputKind } from 'src/call/devices';
import { BottomSheet } from 'src/screens/room/bottomSheet';
import { sheetStyles } from 'src/screens/room/controlBar';
import { SheetCheck } from 'src/screens/room/sheetCheck';
import { SheetRow } from 'src/screens/room/sheetRow';

export type AudioOutputSheetProps = {
  // Contrôlée par le parent, jamais interne. Le déclencheur a quitté ce
  // composant : c'est une LIGNE du menu « Plus » depuis que la main levée et
  // les réactions ont pris les deux emplacements que la barre pouvait offrir.
  // Une feuille qui garde son propre `visible` ne peut pas être ouverte depuis
  // une autre feuille — celle-ci démonterait celle-là en se fermant.
  readonly visible: boolean;
  readonly onDismiss: () => void;
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
  readonly onSelect: (kind: AudioOutputKind) => void;
  readonly onSelectDevice: (device: AudioDeviceChoice) => void;
  readonly onAutomatic: () => void;
};

/**
 * La feuille de choix de la sortie audio, SANS son déclencheur.
 *
 * Le déclencheur est parti dans le menu « Plus » : la barre n'avait que six
 * emplacements, et le propriétaire a demandé qu'ils aillent à la main levée et
 * aux réactions. Le `visible` est donc contrôlé par le parent — une feuille qui
 * garderait le sien ne pourrait pas être ouverte depuis une autre feuille, qui
 * la démonterait en se fermant.
 */
export function AudioOutputSheet({
  visible,
  onDismiss,
  mode,
  outputs,
  chosen,
  devices,
  currentDeviceId,
  manual,
  onSelect,
  onSelectDevice,
  onAutomatic,
}: AudioOutputSheetProps): React.ReactElement | null {
  const { t } = useTranslation();

  // Sur iOS il n'y a rien à peupler : `getAudioOutputs()` y est une constante à
  // deux entrées qui ne sont pas des catégories. Le seul recours est le
  // sélecteur de la plateforme, dont on ne contrôle ni l'apparence ni les
  // libellés — et dont rien ne dit s'il est apparu. Ce composant ne rend donc
  // RIEN dans ce mode ; c'est l'appelant qui ouvre le sélecteur natif.
  if (mode === 'system') return null;

  // Composé par i18next, jamais en JavaScript : une chaîne assemblée ici ne
  // serait pas traduisible. Même motif que `cameraMenu.tsx`.
  const deviceTitle = (device: AudioDeviceChoice): string => {
    const label = device.name ?? t(audioOutputNameKey(device.kind));
    return device.ordinal === null
      ? label
      : t('call.outputNumbered', { name: label, index: device.ordinal });
  };

  return (
    <BottomSheet
      testID="audio-output-sheet"
      visible={visible}
      title={t('call.audioOutput')}
      onDismiss={onDismiss}
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
                onDismiss();
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
                onDismiss();
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
            onDismiss();
            onAutomatic();
          }}
        />
      ) : null}
    </BottomSheet>
  );
}
