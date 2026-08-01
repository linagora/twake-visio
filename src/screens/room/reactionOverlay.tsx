import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { reactionGlyph, type Reaction } from 'src/call/reactions';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  // Recouvre l'écran entier, scène ou panneau : `pointerEvents="none"` laisse
  // tout appui traverser jusqu'à ce qu'il y a en dessous — aucune bulle n'est
  // pressable. Ancrée en bas à droite, au-dessus de la barre : position
  // choisie, pas mesurée (voir le plan).
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: tokens.spacing.md,
    paddingBottom: tokens.spacing.xl,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    backgroundColor: tokens.color.surfaceDark,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    marginTop: tokens.spacing.xs,
  },
  glyph: { fontSize: 24 },
  // Cet écran force un fond sombre dans les deux schémas alors que le thème
  // Paper suit le schéma système : sans couleur explicite, ce texte
  // retomberait sur `onSurface`, quasi-noir en schéma clair. Voir `AGENTS.md`.
  // Forcée en même temps que `bubble.backgroundColor` ci-dessus, jamais
  // l'une sans l'autre.
  name: { color: tokens.color.textDark },
});

export type ReactionOverlayProps = { readonly reactions: readonly Reaction[] };

// Des bulles immobiles, jamais animées (§5.C12 de la conception) : sur une
// grille vidéo de téléphone, une animation flottante masquerait des visages,
// et RNTL ne pourrait de toute façon rien en dire. Le plafond de six et la
// durée de vie de 3 s vivent dans `reactionStore` ; cette coquille pose la
// liste qu'on lui donne, rien de plus — même division du travail que
// `HandBanner`/`RecordingIndicator`.
export function ReactionOverlay({ reactions }: ReactionOverlayProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (reactions.length === 0) return null;

  return (
    <View testID="reaction-overlay" pointerEvents="none" style={styles.root}>
      {reactions.map((reaction) => {
        const trimmed = reaction.name.trim();
        const label = reaction.isLocal
          ? t('call.you')
          : trimmed.length > 0
            ? trimmed
            : t('call.unnamedParticipant');

        return (
          <View key={reaction.id} testID={`reaction-bubble-${reaction.id}`} style={styles.bubble}>
            <Text style={styles.glyph}>{reactionGlyph(reaction.key)}</Text>
            <Text testID={`reaction-bubble-name-${reaction.id}`} style={styles.name}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
