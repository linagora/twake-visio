import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import type { WaitingParticipant } from 'src/api/participants';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    backgroundColor: tokens.color.surfaceDark,
  },
  actions: { flexDirection: 'row', gap: tokens.spacing.sm },
});

export type WaitingBannerProps = {
  readonly participant: WaitingParticipant | null;
  readonly remaining: number;
  readonly onAnswer: (id: string, allow: boolean) => void;
};

// Une seule personne à la fois, la première arrivée, avec le nombre de
// personnes restantes : une pile de bandeaux mangerait la vidéo, qui est la
// raison d'être de l'écran. La coquille ne va rien chercher elle-même — elle
// reçoit une personne et deux actions.
export function WaitingBanner({
  participant,
  remaining,
  onAnswer,
}: WaitingBannerProps): React.ReactElement | null {
  const { t } = useTranslation();

  if (participant === null) return null;

  return (
    <View testID="waiting-banner" style={styles.root}>
      <Text variant="titleMedium">{t('waiting.knocking', { name: participant.username })}</Text>
      {remaining > 0 ? (
        <Text testID="waiting-others">{t('waiting.others', { count: remaining })}</Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          mode="contained"
          testID="waiting-admit"
          onPress={() => onAnswer(participant.id, true)}
        >
          {t('waiting.admit')}
        </Button>
        <Button
          mode="outlined"
          testID="waiting-refuse"
          onPress={() => onAnswer(participant.id, false)}
        >
          {t('waiting.refuse')}
        </Button>
      </View>
    </View>
  );
}
