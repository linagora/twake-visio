import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import type { RaisedHand } from 'src/call/hands';
import { sheetStyles } from 'src/screens/room/controlBar';

export type HandQueueProps = {
  readonly hands: readonly RaisedHand[];
};

/**
 * La file des mains levées, dans le menu « Plus ».
 *
 * **Elle a survécu au départ de la commande, et ce n'est pas un oubli.** Lever
 * la main est parti dans la barre, en un appui, parce que c'est un signal qu'on
 * donne pendant que quelqu'un parle. La file, elle, n'est pas une commande :
 * c'est l'état du salon, qu'on consulte.
 *
 * `RaisedHandsBanner` ne la remplace pas. Il tient sur UNE rangée par
 * construction — le compte se pose à côté d'un nom —, donc à trois mains levées
 * il montre le premier nom et un « +2 ». Cette liste-ci les nomme toutes, dans
 * l'ordre. Deux surfaces, deux informations ; supprimer celle-ci aurait perdu
 * les noms sans que rien ne le dise.
 *
 * Les lignes ne sont pas des `SheetRow` : on ne peut pas baisser la main de
 * quelqu'un d'autre, et un élément pressable promettrait une action qui
 * n'existe pas.
 */
export function HandQueue({ hands }: HandQueueProps): React.ReactElement | null {
  const { t } = useTranslation();

  if (hands.length === 0) return null;

  return (
    <View testID="hand-queue">
      {/* Secondaire par la taille (`labelSmall`), jamais par un gris :
          `tokens.color.muted` donne 3,88:1 sur `surfaceDark`, sous le
          seuil AA. `sheetStyles.note` porte `textDark`, 15,86:1. */}
      <Text testID="hand-queue-title" variant="labelSmall" style={sheetStyles.note}>
        {t('call.handQueue')}
      </Text>
      {hands.map((hand, index) => (
        <Text
          key={hand.identity}
          testID={`hand-queue-row-${hand.identity}`}
          variant="labelSmall"
          style={sheetStyles.note}
        >
          {t('call.handQueueEntry', {
            position: index + 1,
            name: hand.name.trim().length > 0 ? hand.name.trim() : t('call.unnamedParticipant'),
          })}
        </Text>
      ))}
    </View>
  );
}
