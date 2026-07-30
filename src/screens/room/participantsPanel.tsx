import React from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, List, Text } from 'react-native-paper';

import type { ParticipantRole } from 'src/api/participants';
import type { ParticipantView } from 'src/call/layout';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, padding: tokens.spacing.md, gap: tokens.spacing.sm },
  actions: { flexDirection: 'row', gap: tokens.spacing.xs },
  // Le panneau remplace la scène dans la même `View` sombre que `call.tsx`
  // pose (`backgroundDark`, dans les deux schémas) : sans cette couleur
  // explicite, le titre et le nom de chaque ligne retombent sur
  // `theme.colors.onSurface`, qui suit le schéma système — noir sur noir dès
  // qu'un appareil est en clair.
  text: { color: tokens.color.textDark },
});

type RowProps = {
  readonly participant: ParticipantView;
  readonly canModerate: boolean;
  readonly onMute: (identity: string) => void;
  readonly onRemove: (identity: string) => void;
  readonly onRole: (identity: string, role: ParticipantRole) => void;
};

// Une ligne, une personne. Même répartition que VideoTile dans stage.tsx :
// jamais d'identité brute ni de vide à l'écran — les deux se liraient comme un
// défaut d'affichage plutôt que comme une personne réellement sans nom — et un
// nom trop long est tronqué plutôt que de pousser les actions hors de l'écran.
function ParticipantRow({
  participant,
  canModerate,
  onMute,
  onRemove,
  onRole,
}: RowProps): React.ReactElement {
  const { t } = useTranslation();
  const name = participant.name.trim();
  const label = name.length > 0 ? name : t('call.unnamedParticipant');

  return (
    <List.Item
      testID="participant-row"
      title={label}
      titleStyle={styles.text}
      titleNumberOfLines={2}
      right={() =>
        // Sans droit de modérer, le serveur refuserait de toute façon :
        // proposer un geste voué à échouer se lit comme une panne de
        // l'application. Et personne ne se modère soi-même — s'expulser (ou
        // changer son propre rôle) d'un pouce mal placé n'est pas rattrapable.
        canModerate && !participant.isLocal ? (
          <View style={styles.actions}>
            <Button
              testID="participant-mute"
              mode="text"
              // `mode="text"` n'a pas de fond propre : son texte retombe par
              // défaut sur `theme.colors.primary`, qui suit le schéma
              // système — #0057B8 sur `backgroundDark` tombe à 2,86:1, sous
              // le seuil AA. `primaryDark` (#4D9AFF) le fait passer.
              textColor={tokens.color.primaryDark}
              onPress={() => onMute(participant.identity)}
            >
              {t('participants.mute')}
            </Button>
            <Button
              testID="participant-remove"
              mode="text"
              textColor={tokens.color.primaryDark}
              onPress={() => onRemove(participant.identity)}
            >
              {t('participants.remove')}
            </Button>
            <Button
              testID="participant-promote"
              mode="text"
              textColor={tokens.color.primaryDark}
              onPress={() => onRole(participant.identity, 'administrator')}
            >
              {t('participants.promote')}
            </Button>
          </View>
        ) : null
      }
    />
  );
}

export type ParticipantsPanelProps = {
  readonly participants: readonly ParticipantView[];
  readonly canModerate: boolean;
  readonly onMute: (identity: string) => void;
  readonly onRemove: (identity: string) => void;
  readonly onRole: (identity: string, role: ParticipantRole) => void;
};

// Coquille : elle reçoit une liste et trois rappels, elle ne va rien chercher
// elle-même. Deux identifiants circulent dans ce périmètre — l'UUID de lobby
// et l'identité LiveKit — et ne s'échangent pas ; ce panneau ne connaît que la
// seconde, celle que porte `ParticipantView.identity` et que reçoivent les
// trois rappels.
export function ParticipantsPanel({
  participants,
  canModerate,
  onMute,
  onRemove,
  onRole,
}: ParticipantsPanelProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View style={styles.root}>
      <Text variant="titleMedium" style={styles.text}>
        {t('participants.title')}
      </Text>
      <FlatList
        data={[...participants]}
        keyExtractor={(participant) => participant.identity}
        renderItem={({ item }) => (
          <ParticipantRow
            participant={item}
            canModerate={canModerate}
            onMute={onMute}
            onRemove={onRemove}
            onRole={onRole}
          />
        )}
      />
    </View>
  );
}
