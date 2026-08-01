import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';

import { reactionGlyph, REACTION_KEYS, type ReactionKey } from 'src/call/reactions';
import { BAR_RIPPLE_COLOR, sheetStyles } from 'src/screens/room/controlBar';
import { tokens } from 'src/ui/tokens';

// Traduit chaque valeur du fil vers sa clé i18n d'accessibilité. Mécanique,
// comme la table de `reactionGlyph` — mais c'est un choix de PRÉSENTATION
// (quel libellé accessible porter), pas une décision sur la donnée (quel
// glyphe afficher) : elle vit ici, jamais dans `src/call/reactions.ts`, qui
// n'exporte que ce que la conception liste (§6.4).
const REACTION_LABEL_KEYS: Readonly<Record<ReactionKey, string>> = {
  'thumbs-up': 'reaction.thumbsUp',
  'thumbs-down': 'reaction.thumbsDown',
  'clapping-hands': 'reaction.clap',
  'red-heart': 'reaction.heart',
  'face-with-tears-of-joy': 'reaction.laughing',
  'face-with-open-mouth': 'reaction.surprised',
  'party-popper': 'reaction.celebration',
  'folded-hands': 'reaction.please',
};

const styles = StyleSheet.create({
  // Largeur explicite : le contenu d'un `Menu` de Paper est intrinsèque —
  // sans elle, huit cibles s'aligneraient sur une seule rangée dès qu'un
  // écran est assez large. 4 × 44 + 3 × 8 = 200 : quatre par rangée, jamais
  // cinq (5 × 44 + 4 × 8 = 252, hors de ces 200 dp).
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 200, gap: tokens.spacing.sm },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Un emoji Unicode pleine couleur (Apple Color Emoji, Noto Color Emoji)
  // ignore la couleur de premier plan qu'on lui poserait : ce n'est donc pas
  // un oubli de la doctrine de contraste d'`AGENTS.md`, qui porte sur du
  // texte retombant sur une couleur de thème — un glyphe emoji ne retombe sur
  // rien de tel.
  glyph: { fontSize: 28 },
});

export type ReactionPickerProps = { readonly onSend: (key: ReactionKey) => void };

// Huit cibles de 44 dp, dans le menu « plus », jamais dans la barre — la
// barre est pleine (`controlBar.ts`, §4.1 de la conception). Pas de
// `Menu.Item` : on peut envoyer plusieurs réactions de suite, et un
// `Menu.Item` refermerait le menu au premier appui. C'est `MoreMenu` (tâche 6)
// qui décide de ne pas envelopper `onSend` d'un `setVisible(false)`, à
// l'inverse de ses trois voisines.
//
// `sheetStyles.note` porte le titre de section, pas `barStyles.menuNote` : ce
// dernier n'existe plus depuis que les trois menus de la barre sont devenus
// des feuilles inférieures (`AGENTS.md`) — `sheetStyles.note` est la même
// étiquette secondaire que `hand-queue-title` dans `handControl.tsx`, même
// paire de tokens (15,86:1 sur `surfaceDark`).
export function ReactionPicker({ onSend }: ReactionPickerProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View>
      <Text testID="reaction-picker-title" variant="labelSmall" style={sheetStyles.note}>
        {t('call.reactions')}
      </Text>
      <View testID="reaction-grid" style={styles.grid}>
        {REACTION_KEYS.map((key) => (
          <TouchableRipple
            key={key}
            testID={`reaction-${key}`}
            style={styles.button}
            borderless
            rippleColor={BAR_RIPPLE_COLOR}
            accessibilityLabel={t(REACTION_LABEL_KEYS[key])}
            onPress={() => onSend(key)}
          >
            <Text style={styles.glyph}>{reactionGlyph(key)}</Text>
          </TouchableRipple>
        ))}
      </View>
    </View>
  );
}
