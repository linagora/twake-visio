import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from 'react-native-paper';

import type { RaisedHand } from 'src/call/hands';
import type { ReactionKey } from 'src/call/reactions';
import type { RecordingState } from 'src/call/recording';
import { BottomSheet } from 'src/screens/room/bottomSheet';
import {
  BAR_HIT_SLOP,
  BAR_ICON_COLOR,
  BAR_RIPPLE_COLOR,
  barStyles,
} from 'src/screens/room/controlBar';
import { HandControl } from 'src/screens/room/handControl';
import { ReactionPicker } from 'src/screens/room/reactionPicker';
import { RecordingControl } from 'src/screens/room/recordingControl';
import { SheetRow } from 'src/screens/room/sheetRow';

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
  // Facultatif, à l'inverse de tous les autres rappels — et c'est une
  // dérogation délibérée, motivée par la barre de qualité elle-même : la
  // rendre obligatoire romprait la compilation de `call.tsx`, qui construit
  // encore ses props `<MoreMenu>` sans elle tant que la tâche qui l'y câble
  // (le magasin de réactions) n'a pas atterri — et `tsc --noEmit` tourne sur
  // tout le projet, jamais fichier par fichier, donc ce point rouge n'est pas
  // local à cette tâche. Le repli interne ci-dessous couvre l'intervalle.
  readonly onSendReaction?: (key: ReactionKey) => void;
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
  // Repli inerte : voir le commentaire sur `MoreMenuProps.onSendReaction`.
  onSendReaction = () => undefined,
}: MoreMenuProps): React.ReactElement {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <>
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
      <BottomSheet
        testID="more-sheet"
        visible={visible}
        title={t('call.more')}
        onDismiss={() => setVisible(false)}
      >
        <SheetRow
          testID="share-btn"
          title={t('call.share')}
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
        {/* Quatrième entrée, jamais fermée sur l'appui — à l'inverse des trois
            précédentes. `onSendReaction` passe tel quel, sans enveloppe : c'est
            ce qui permet d'envoyer plusieurs réactions de suite sans rouvrir le
            menu (§5.C8 de la conception). */}
        <ReactionPicker onSend={onSendReaction} />
      </BottomSheet>
    </>
  );
}
