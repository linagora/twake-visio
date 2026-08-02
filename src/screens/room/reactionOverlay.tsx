import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { reactionGlyph, type Reaction } from 'src/call/reactions';
import { CALL_SURFACE_HAIRLINE } from 'src/screens/room/callHeader';
import { CHAT_FOOTER_HEIGHT } from 'src/screens/room/chatPanel';
import { BAR_HEIGHT } from 'src/screens/room/controlBar';
import { tokens } from 'src/ui/tokens';

// Ce que la plus basse des bulles doit dégager, en dp. CALCULÉ à partir des
// hauteurs réelles, jamais choisi à l'œil : ce calque recouvre l'écran entier
// et s'ancre EN BAS À DROITE, c'est-à-dire exactement là où les commandes
// finissent.
//
//     BAR_HEIGHT (60) + tokens.spacing.sm (8) = 68 dp
//
// Le pas d'écart est là pour que la bulle ne colle pas à la barre ; il vient de
// l'échelle d'espacement, pas d'une appréciation.
//
// La valeur d'avant était `tokens.spacing.xl`, soit 32, quand la barre en
// occupe 60 : la plus basse des bulles se posait donc 28 dp À L'INTÉRIEUR de la
// barre, alignée à droite — sur `leave-btn`, le bouton pour raccrocher. C'est
// exactement ce que ce calcul évite : la garde SUIT `BAR_HEIGHT`, elle n'est
// pas un nombre recopié, et le passage de la cible de 44 à 52 dp ne lui a
// demandé aucune intervention.
const BOTTOM_GUARD = BAR_HEIGHT + tokens.spacing.sm;

// La même garde, plus le bas du panneau de discussion quand il est ouvert :
//
//     68 + CHAT_FOOTER_HEIGHT (56 + 16) = 140 dp
//
// Sans elle, les bulles se posaient sur `chat-send` dès la deuxième — le
// panneau occupe toute la région au-dessus de la barre, et sa zone de saisie en
// tient le bas.
const BOTTOM_GUARD_WITH_CHAT = BOTTOM_GUARD + CHAT_FOOTER_HEIGHT;

const styles = StyleSheet.create({
  // Recouvre l'écran entier, scène ou panneau : `pointerEvents="none"` laisse
  // tout appui traverser jusqu'à ce qu'il y a en dessous — aucune bulle n'est
  // pressable. Ancrée en bas à droite, au-dessus de la barre — et la garde qui
  // l'y tient est calculée, voir `BOTTOM_GUARD` ci-dessus.
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: tokens.spacing.md,
    paddingBottom: BOTTOM_GUARD,
  },
  // Superposé à `root`, jamais à sa place : un seul `paddingBottom` change, et
  // c'est la seule différence entre les deux états. Un style NOMMÉ plutôt qu'un
  // objet en ligne, pour que la mutation « poser `root` ici » soit disponible
  // et localise la garde.
  rootWithChat: { paddingBottom: BOTTOM_GUARD_WITH_CHAT },
  // Le seul fond OPAQUE de tout ce sous-lot, et c'est délibéré : les bandeaux se
  // posent sur le `backgroundDark` que `call.tsx` force, dont on connaît la
  // valeur, quand une bulle se pose sur de la VIDÉO, dont on ne connaît ni la
  // couleur ni la luminance. Un lavis translucide y serait illisible une image
  // sur deux. Le filet lui rend le bord que le lavis lui aurait donné, pour les
  // images où la vidéo derrière est elle-même sombre.
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    backgroundColor: tokens.color.surfaceDark,
    borderColor: CALL_SURFACE_HAIRLINE,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 5,
    marginTop: tokens.spacing.xs,
  },
  glyph: { fontSize: 24 },
  // Cet écran force un fond sombre dans les deux schémas alors que `makeTheme`
  // rend le thème TOUJOURS clair : sans couleur explicite, ce texte retomberait
  // sur `onSurface`, quasi-noir. Voir `AGENTS.md`. Forcée en même temps que
  // `bubble.backgroundColor` ci-dessus, jamais l'une sans l'autre.
  name: { color: tokens.color.textDark, fontFamily: tokens.font.semiBold, fontSize: 12.5 },
});

export type ReactionOverlayProps = {
  readonly reactions: readonly Reaction[];
  // Vrai quand le panneau de discussion est ouvert. Ce calque ne connaît pas
  // les panneaux — il reçoit un booléen et en tire une garde. Obligatoire
  // plutôt qu'optionnelle à défaut `false` : le seul appelant doit décider, et
  // un défaut silencieux redonnerait les bulles à `chat-send` le jour où un
  // second appelant apparaît.
  readonly chatOpen: boolean;
};

// Des bulles immobiles, jamais animées (§5.C12 de la conception) : sur une
// grille vidéo de téléphone, une animation flottante masquerait des visages,
// et RNTL ne pourrait de toute façon rien en dire. Le plafond de six et la
// durée de vie de 3 s vivent dans `reactionStore` ; cette coquille pose la
// liste qu'on lui donne, rien de plus — même division du travail que
// `HandBanner`/`RecordingIndicator`.
export function ReactionOverlay({
  reactions,
  chatOpen,
}: ReactionOverlayProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (reactions.length === 0) return null;

  return (
    <View
      testID="reaction-overlay"
      pointerEvents="none"
      style={chatOpen ? [styles.root, styles.rootWithChat] : styles.root}
    >
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
