import { VideoTrack } from '@livekit/react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';

import type { CallLayout, Tile } from 'src/call/layout';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: tokens.color.surfaceDark },
  // `flexGrow: 0` : sans lui, un ScrollView réclame toute la place restante et
  // la scène disparaît.
  filmstrip: {
    flexGrow: 0,
    // Trois pas de la plus grande unité d'espacement : de quoi montrer une
    // vignette lisible sans manger la scène.
    height: tokens.spacing.xl * 3,
  },
  filmstripContent: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: tokens.spacing.xs,
    padding: tokens.spacing.xs,
  },
  // La bordure est toujours là, seule sa couleur change : une bordure qui
  // apparaît quand quelqu'un parle rognerait l'image de deux pixels à chaque
  // mot.
  tile: {
    overflow: 'hidden',
    backgroundColor: tokens.color.surfaceDark,
    borderWidth: 2,
    borderColor: tokens.color.surfaceDark,
  },
  stageTile: { flex: 1 },
  thumbnailTile: { width: tokens.spacing.xl * 4, borderRadius: tokens.radius.md },
  speaking: { borderColor: tokens.color.primaryDark },
  video: { flex: 1 },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.xs,
  },
  placeholderText: { color: tokens.color.textDark, textAlign: 'center' },
});

type VideoTileProps = {
  readonly tile: Tile;
  readonly objectFit: 'cover' | 'contain';
  readonly size: StyleProp<ViewStyle>;
};

// Aucune décision ici : la vignette pose ce qu'on lui donne. Tout ce qui se
// choisit — qui, dans quel ordre, en miroir ou non — a été décidé par
// `src/call/layout`, le seul endroit vérifiable.
function VideoTile({ tile, objectFit, size }: VideoTileProps): React.ReactElement {
  const { t } = useTranslation();
  // La sélection nettoie le nom : il n'y a qu'une absence à traiter, et jamais
  // d'identifiant brut à l'écran.
  const label = tile.name === '' ? t('call.unnamedParticipant') : tile.name;

  return (
    <View
      testID={`tile-${tile.key}`}
      // Le nom est la seule chose qu'un lecteur d'écran puisse dire d'une piste
      // vidéo. Il le porte donc dans les deux cas, image ou non.
      accessibilityLabel={label}
      style={[styles.tile, size, tile.isSpeaking ? styles.speaking : null]}
    >
      {tile.camera === null ? (
        // Sans image, un nom sur fond uni. Un rectangle noir ne se distingue pas
        // d'une panne, et faire disparaître la vignette sortirait la personne de
        // la liste des présents alors qu'elle est bien là.
        <View testID={`tile-placeholder-${tile.key}`} style={styles.placeholder}>
          <Text style={styles.placeholderText} numberOfLines={2}>
            {label}
          </Text>
        </View>
      ) : (
        <VideoTrack
          trackRef={tile.camera}
          style={styles.video}
          objectFit={objectFit}
          mirror={tile.mirror}
        />
      )}
    </View>
  );
}

export type CallStageProps = {
  readonly layout: CallLayout;
};

// La coquille de rendu, tenue aussi bête que possible : personne ne peut la
// relire à l'exécution — le simulateur ne publie ni caméra ni micro — donc tout
// ce qui pourrait s'y tromper doit être ailleurs.
//
// La bande reste posée même vide plutôt que d'apparaître au premier arrivant :
// la scène garderait sinon la même hauteur pour deux dispositions différentes,
// et se redimensionnerait sous une vidéo en cours de lecture.
export function CallStage({ layout }: CallStageProps): React.ReactElement {
  return (
    <>
      <View style={styles.stage} testID="active-speaker">
        {/* `contain` sur la scène : `cover` remplirait un écran de téléphone en
            portrait avec une image de caméra en paysage, donc en coupant les
            deux tiers du visage. */}
        <VideoTile tile={layout.stage} objectFit="contain" size={styles.stageTile} />
      </View>

      {/* Une bande de longueur inconnue : au-delà de trois vignettes, les
          suivantes sortent de l'écran et seraient inatteignables sans défilement. */}
      <ScrollView
        testID="filmstrip"
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filmstrip}
        contentContainerStyle={styles.filmstripContent}
      >
        {layout.filmstrip.map((tile) => (
          // `cover` sur les vignettes : elles sont trop petites pour qu'on y
          // cherche un cadrage, elles doivent d'abord être pleines.
          <VideoTile key={tile.key} tile={tile} objectFit="cover" size={styles.thumbnailTile} />
        ))}
      </ScrollView>
    </>
  );
}
