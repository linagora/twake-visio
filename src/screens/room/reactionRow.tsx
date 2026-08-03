import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';

import { reactionGlyph, REACTION_KEYS, type ReactionKey } from 'src/call/reactions';
import { BAR_RIPPLE_COLOR, BAR_SURFACE_COLOR } from 'src/screens/room/controlBar';
import { tokens } from 'src/ui/tokens';

// Les mêmes libellés d'accessibilité que `reactionPicker.tsx`, et pour la même
// raison : un emoji seul n'est pas annoncé de façon fiable par un lecteur
// d'écran. La table est recopiée plutôt qu'importée parce qu'elle est un choix
// de PRÉSENTATION, et que les deux surfaces peuvent diverger — la feuille
// affiche un titre de section, cette rangée n'en a pas.
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

export type ReactionRowProps = {
  readonly onSend: (key: ReactionKey) => void;
  readonly testID: string;
};

/**
 * Les huit réactions sur UNE rangée, posée au-dessus de la barre.
 *
 * C'est la forme du web, que le propriétaire a demandée : un appui ouvre la
 * rangée, un choix l'envoie et la referme aussitôt. Une feuille inférieure
 * demandait deux gestes de plus pour une action qui se veut brève.
 *
 * Elle ne ressemble donc pas à `reactionPicker.tsx`, qui reste la grille 4×2 de
 * la feuille : huit cibles sur une seule ligne ne tiennent qu'en rétrécissant
 * — 8 × 40 = 320 dp sur les 344 disponibles d'un écran de 360. Quarante points
 * est sous le minimum tactile de 44, et c'est acceptable ICI, et seulement
 * ici : la rangée est un survol transitoire, chaque cible est entourée de vide
 * plutôt que d'une autre commande destructrice, et une erreur de visée envoie
 * un emoji voisin — pas un raccrochage.
 */
export function ReactionRow({ onSend, testID }: ReactionRowProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View style={styles.row} testID={testID}>
      {REACTION_KEYS.map((key) => (
        <TouchableRipple
          accessibilityLabel={t(REACTION_LABEL_KEYS[key])}
          accessibilityRole="button"
          borderless
          key={key}
          onPress={() => onSend(key)}
          // Sans elle, Paper calcule l'ondulation depuis `theme.colors.onSurface`
          // — un quasi-noir en schéma clair, sur le fond forcé sombre de cet
          // écran. Voir `BAR_RIPPLE_COLOR`.
          rippleColor={BAR_RIPPLE_COLOR}
          style={styles.target}
          testID={`${testID}-${key}`}
        >
          <Text style={styles.glyph}>{reactionGlyph(key)}</Text>
        </TouchableRipple>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Un emoji Unicode pleine couleur ignore la couleur de premier plan qu'on lui
  // poserait : ce n'est donc pas un oubli de la doctrine de contraste
  // d'`AGENTS.md`, qui porte sur du texte retombant sur une couleur de thème.
  glyph: { fontSize: 24 },
  // HORS FLUX, et ancrée au-dessus de la barre par `bottom: '100%'`. La barre
  // garde donc exactement sa hauteur `BAR_HEIGHT`, dont `src/call/layout.ts`
  // déduit la boîte offerte à la scène : une rangée en flux l'aurait fait
  // varier selon qu'elle est ouverte ou non, et la scène aurait sauté à chaque
  // ouverture.
  row: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: BAR_SURFACE_COLOR,
    borderRadius: tokens.radius.lg,
    bottom: '100%',
    flexDirection: 'row',
    gap: 2,
    marginBottom: tokens.spacing.xs,
    paddingHorizontal: tokens.spacing.xs,
    position: 'absolute',
  },
  target: {
    alignItems: 'center',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
});
