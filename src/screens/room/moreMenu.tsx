import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Menu } from 'react-native-paper';

import type { RaisedHand } from 'src/call/hands';
import type { RecordingState } from 'src/call/recording';
import {
  BAR_HIT_SLOP,
  BAR_ICON_COLOR,
  BAR_RIPPLE_COLOR,
  barStyles,
} from 'src/screens/room/controlBar';
import { HandControl } from 'src/screens/room/handControl';
import { RecordingControl } from 'src/screens/room/recordingControl';

export type MoreMenuProps = {
  readonly recording: RecordingState;
  readonly canRecord: boolean;
  readonly recordingBusy: boolean;
  readonly handRaised: boolean;
  readonly handBusy: boolean;
  readonly hands: readonly RaisedHand[];
  readonly onShare: () => void;
  readonly onStartRecording: () => void;
  readonly onStopRecording: () => void;
  readonly onToggleHand: () => void;
};

// La rangée de commandes est pleine : sept cibles de 44 dp tiennent sur 357 dp,
// une huitième en demanderait 409 sur un écran qui en fait 360. Ce menu prend
// donc la place du bouton de partage et porte trois commandes : le partage
// lui-même, l'enregistrement — qu'on ne démarre qu'au début d'une réunion — et
// la main levée, avec sa file en lecture seule sous elle.
//
// Effet de bord voulu : la commande d'enregistrement n'est plus dans la barre,
// donc jamais adjacente au combiné raccroché. Deux rouges voisins pendant un
// enregistrement ne peuvent plus se produire.
//
// Le menu possède sa visibilité et se referme lui-même avant d'appeler le
// rappel du parent : `RecordingControl` n'a rien à savoir du menu qui le
// contient.
export function MoreMenu({
  recording,
  canRecord,
  recordingBusy,
  handRaised,
  handBusy,
  hands,
  onShare,
  onStartRecording,
  onStopRecording,
  onToggleHand,
}: MoreMenuProps): React.ReactElement {
  const { t } = useTranslation();
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
          testID="more-btn"
          icon="dots-vertical"
          iconColor={BAR_ICON_COLOR}
          rippleColor={BAR_RIPPLE_COLOR}
          style={barStyles.button}
          hitSlop={BAR_HIT_SLOP}
          onPress={() => setVisible(true)}
          accessibilityLabel={t('call.more')}
        />
      }
    >
      <Menu.Item
        testID="share-btn"
        title={t('call.share')}
        titleStyle={barStyles.menuTitle}
        rippleColor={BAR_RIPPLE_COLOR}
        accessibilityLabel={t('call.share')}
        onPress={() => {
          setVisible(false);
          onShare();
        }}
      />
      <RecordingControl
        state={recording}
        canStart={canRecord}
        busy={recordingBusy}
        onStart={() => {
          setVisible(false);
          onStartRecording();
        }}
        onStop={() => {
          setVisible(false);
          onStopRecording();
        }}
      />
      <HandControl
        raised={handRaised}
        busy={handBusy}
        hands={hands}
        onToggle={() => {
          setVisible(false);
          onToggleHand();
        }}
      />
    </Menu>
  );
}
