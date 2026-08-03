import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Badge, IconButton } from 'react-native-paper';

import type { RaisedHand } from 'src/call/hands';
import { BottomSheet } from 'src/screens/room/bottomSheet';
import {
  BAR_HIT_SLOP,
  BAR_ICON_COLOR,
  BAR_RIPPLE_COLOR,
  barStyles,
} from 'src/screens/room/controlBar';
import { HandQueue } from 'src/screens/room/handQueue';
import { SheetRow } from 'src/screens/room/sheetRow';

export type MoreMenuProps = {
  // Le chat est le seul producteur de pastille : elle est donc portée par un
  // bouton générique et dit « quelque chose dans la feuille », pas « des
  // messages ». C'est une indirection, elle est écrite plutôt que découverte.
  readonly unread: number;
  // La file, jamais la commande : lever la main est parti dans la barre. Voir
  // `handQueue.tsx` pour ce qui distingue cette liste du bandeau du haut.
  readonly hands: readonly RaisedHand[];
  readonly onOpenChat: () => void;
  // La sortie audio a quitté la BARRE pour cette ligne : ses six emplacements
  // sont allés à la main levée et aux réactions, que le propriétaire voulait en
  // un appui. Choisir où sort le son est plus rare que lever la main.
  readonly onOpenAudioOutput: () => void;
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
  unread,
  hands,
  onOpenChat,
  onOpenAudioOutput,
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
          testID="chat-btn"
          title={t('chat.title')}
          accessibilityLabel={t('chat.title')}
          onPress={() => {
            setVisible(false);
            onOpenChat();
          }}
        />
        <HandQueue hands={hands} />
        {/* La sortie audio, descendue de la barre. Elle referme ce menu AVANT
            d'ouvrir sa feuille : les deux ne peuvent pas coexister, la seconde
            étant montée par `callControlBar.tsx` et non ici — une feuille
            rendue dans une autre est démontée quand celle-ci se ferme. */}
        <SheetRow
          testID="audio-output-row"
          title={t('call.audioOutput')}
          accessibilityLabel={t('call.audioOutput')}
          onPress={() => {
            setVisible(false);
            onOpenAudioOutput();
          }}
        />
      </BottomSheet>
    </>
  );
}
