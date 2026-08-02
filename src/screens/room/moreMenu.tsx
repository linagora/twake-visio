import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Badge, IconButton } from 'react-native-paper';

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
  // Le chat est le seul producteur de pastille : elle est donc portée par un
  // bouton générique et dit « quelque chose dans la feuille », pas « des
  // messages ». C'est une indirection, elle est écrite plutôt que découverte.
  readonly unread: number;
  readonly onShare: () => void;
  readonly onStartRecording: () => void;
  readonly onStopRecording: () => void;
  readonly onToggleHand: () => void;
  // Obligatoire comme tous les autres rappels. Elle a été optionnelle le temps
  // d'un lot — la rendre obligatoire cassait alors la compilation de
  // `call.tsx`, qui ne la passait pas encore, et `tsc --noEmit` tourne sur tout
  // le projet, jamais fichier par fichier. Ce câblage a atterri depuis
  // (`handleSendReaction`), donc la dérogation n'a plus d'objet : la laisser
  // optionnelle rendrait un site d'appel oublié silencieusement inerte.
  readonly onSendReaction: (key: ReactionKey) => void;
  readonly onOpenChat: () => void;
  // `null` là où le natif n'existe pas — iOS attend son pendant Vision. Une
  // entrée qu'on ne peut pas honorer n'est pas RENDUE, elle n'est pas grisée :
  // `IconButton/utils.ts:88-93` rendrait un quasi-noir sur fond sombre, et
  // `participantsPanel.tsx` a déjà fixé ce précédent.
  readonly onOpenEffects: (() => void) | null;
};

// Ce menu prend la place du bouton de partage et porte trois commandes : le
// partage lui-même, l'enregistrement — qu'on ne démarre qu'au début d'une
// réunion — et la main levée, avec sa file en lecture seule sous elle.
//
// La raison d'origine était la LARGEUR : sept cibles de 44 dp remplissaient la
// rangée à 357 dp sur 360, et une huitième en aurait demandé 409. Le compteur
// de participants a depuis rejoint l'en-tête ; la rangée est passée à six
// cibles de 52 dp, soit 353 dp, donc cette raison-là a disparu. Celle qui
// suit, non.
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
  unread,
  onShare,
  onStartRecording,
  onStopRecording,
  onToggleHand,
  onSendReaction,
  onOpenChat,
  onOpenEffects,
}: MoreMenuProps): React.ReactElement {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <>
      {/* Un conteneur sans dimension propre : la pastille est hors flux, la
          cible reste 52 dp, la rangée reste à 353 dp. */}
      <View style={barStyles.anchor}>
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
        {/* Rendue seulement quand il y a du non-lu, jamais posée à `visible`
            faux : `Badge` retire `visible` de ses props avant de les étaler
            (`Badge.tsx:59-60`), donc l'état n'est joignable par aucune
            assertion — et une pastille masquée par la seule opacité laisse
            quand même son « 0 » dans l'arbre d'accessibilité. Aucune couleur
            posée : Paper appaire lui-même `error` et `onError`, et les deux
            schémas passent le seuil AA. En forcer un casserait l'autre. Posée
            à CÔTÉ du bouton, jamais comme son enfant — un `IconButton` ne rend
            que son icône. */}
        {unread > 0 ? (
          <Badge testID="chat-unread" style={barStyles.badge}>
            {unread}
          </Badge>
        ) : null}
      </View>
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
        {/* Placée avant la main levée, dont le bloc de file n'est pas
            pressable : les trois commandes restent groupées, et la file garde
            le bas de la feuille où on ne la prendra pas pour une liste
            d'actions. */}
        <SheetRow
          testID="chat-btn"
          title={t('chat.title')}
          accessibilityLabel={t('chat.title')}
          onPress={() => {
            setVisible(false);
            onOpenChat();
          }}
        />
        {onOpenEffects === null ? null : (
          <SheetRow
            testID="effects-btn"
            title={t('effects.title')}
            accessibilityLabel={t('effects.open')}
            onPress={() => {
              setVisible(false);
              onOpenEffects();
            }}
          />
        )}
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
