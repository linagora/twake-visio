import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import type { RaisedHand } from 'src/call/hands';
import { sheetStyles } from 'src/screens/room/controlBar';
import { SheetRow } from 'src/screens/room/sheetRow';

export type HandControlProps = {
  readonly raised: boolean;
  readonly busy: boolean;
  readonly hands: readonly RaisedHand[];
  readonly onToggle: () => void;
};

// La commande et la file, dans le menu « plus ». Un seul contrôle dont
// l'identité suit l'attribut : on ne peut pas lever pendant que la main est
// levée, puisque la commande est alors une baisse.
//
// Pendant un appel en vol, la commande n'est pas rendue plutôt que grisée —
// même règle que `RecordingControl`, et pour la même raison : Paper teste
// `disabled` avant toute couleur explicite et rend un quasi-noir sur cette
// surface sombre. La file, elle, reste : elle décrit l'état du salon, pas la
// requête en cours.
//
// Les lignes de file ne sont pas des `SheetRow` : on ne peut pas baisser la
// main de quelqu'un d'autre, et un élément pressable promettrait une action
// qui n'existe pas.
export function HandControl({
  raised,
  busy,
  hands,
  onToggle,
}: HandControlProps): React.ReactElement {
  const { t } = useTranslation();
  const label = raised ? 'call.lowerHand' : 'call.raiseHand';

  return (
    <View>
      {busy ? null : (
        <SheetRow
          testID="hand-toggle"
          title={t(label)}
          accessibilityLabel={t(label)}
          onPress={onToggle}
        />
      )}
      {hands.length === 0 ? null : (
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
      )}
    </View>
  );
}
