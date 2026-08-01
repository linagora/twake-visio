import { VideoTrack } from '@livekit/react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Text } from 'react-native-paper';

import type { CallLayout, Tile } from 'src/call/layout';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1 },
  // En paysage, la bande cesse d'être un ÉTAGE sous la scène pour devenir une
  // COLONNE à côté : c'est ce qui lui rend la hauteur, précisément ce qui
  // devient rare quand la fenêtre s'élargit plus qu'elle ne s'allonge.
  rootLandscape: { flexDirection: 'row' },
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
  // Le pendant de `filmstrip` en paysage : une largeur fixe au lieu d'une
  // hauteur fixe, pour que la scène garde toute la hauteur de la fenêtre.
  filmstripColumn: {
    flexGrow: 0,
    width: tokens.spacing.xl * 3,
  },
  filmstripContentColumn: {
    flexDirection: 'column',
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
  // Le pendant de `thumbnailTile` en paysage : la dimension fixe passe de la
  // largeur à la hauteur, pour tenir dans la colonne plutôt que dans la
  // rangée.
  thumbnailTileColumn: { height: tokens.spacing.xl * 3, borderRadius: tokens.radius.md },
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
  // Ce que la PLACE veut, quand la source n'impose rien.
  readonly fitWhenCamera: 'cover' | 'contain';
  readonly size: StyleProp<ViewStyle>;
  // Relayés tels quels : la vignette ne décide ni qui monte sur scène ni ce
  // qu'un appui long signifie, elle ne fait que rapporter le geste avec la clé
  // de SA tuile — voir `CallStage`, qui ferme la clé dans la fermeture.
  //
  // Nommés `onTilePress`/`onTileLongPress`, jamais `onPress`/`onLongPress` :
  // `fireEvent.press` de RNTL 14 retombe, faute de handler sur l'élément visé,
  // sur une remontée de FIBRE (`findEventHandlerFromFiber`,
  // `@testing-library/react-native/dist/fire-event.js`) qui s'arrête au premier
  // ANCÊTRE HÔTE croisé — jamais avant. `Pressable` n'étant pas un composant
  // hôte, un nom identique à sa propre prop `onPress` se laisse trouver sur
  // CETTE fonction-ci sans jamais prouver qu'elle le relaie : vérifié par
  // mutation, retirer `onPress={onPress}` du `Pressable` ci-dessous, sous ce
  // même nom, laissait 682 tests verts.
  readonly onTilePress: () => void;
  readonly onTileLongPress: () => void;
};

// Aucune décision ici : la vignette pose ce qu'on lui donne. Tout ce qui se
// choisit — qui, dans quel ordre, en miroir ou non — a été décidé par
// `src/call/layout`, le seul endroit vérifiable.
function VideoTile({
  tile,
  fitWhenCamera,
  size,
  onTilePress,
  onTileLongPress,
}: VideoTileProps): React.ReactElement {
  const { t } = useTranslation();
  // La sélection nettoie le nom : il n'y a qu'une absence à traiter, et jamais
  // d'identifiant brut à l'écran.
  const label = tile.name === '' ? t('call.unnamedParticipant') : tile.name;

  return (
    // `size` est répété ici : sans lui, ce `Pressable` — dépourvu de toute
    // dimension propre — se rétrécirait à son contenu, et la vue dimensionnée
    // qu'il enveloppe ne récupère JAMAIS sa taille depuis un enfant. C'est ce
    // qui viderait la scène (`flex: 1`) à hauteur nulle, et réduirait chaque
    // vignette de la bande à la largeur de son texte. Le `testID`, lui, reste
    // sur la vue qu'il a toujours désigné : les tests existants l'interrogent,
    // et `fireEvent.press` atteint `onPress` en remontant jusqu'à ce `Pressable`
    // quel que soit l'élément visé par la requête.
    <Pressable style={size} onPress={onTilePress} onLongPress={onTileLongPress}>
      <View
        testID={`tile-${tile.key}`}
        // Le nom est la seule chose qu'un lecteur d'écran puisse dire d'une piste
        // vidéo. Il le porte donc dans les deux cas, image ou non.
        accessibilityLabel={label}
        style={[styles.tile, size, tile.isSpeaking ? styles.speaking : null]}
      >
        {tile.track === null ? (
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
            trackRef={tile.track}
            style={styles.video}
            // Un écran ne se rogne jamais, où qu'il soit posé : un texte coupé est
            // un texte perdu, et c'est précisément ce qu'on partage. La place ne
            // décide que pour une caméra.
            objectFit={tile.source === 'screen' ? 'contain' : fitWhenCamera}
            mirror={tile.mirror}
          />
        )}
      </View>
    </Pressable>
  );
}

export type CallStageProps = {
  readonly layout: CallLayout;
  // La clé de la tuile touchée, `${identity}:${source}`. La coquille ne décide
  // rien du sens d'un appui : elle le rapporte, et `call.tsx` seul choisit ce
  // qu'il produit — voir `handlePressTile`, qui épingle et désépingle.
  readonly onPressTile: (key: string) => void;
  // Encore inerte : le geste arrive avec cette tâche, ce qu'il déclenche
  // (plein écran) avec la suivante. La scène est pressable comme les autres
  // tuiles dès maintenant, pour que cette tâche-là n'ait plus à toucher au
  // contrat de `CallStageProps`.
  readonly onLongPressTile: (key: string) => void;
};

// La coquille de rendu, tenue aussi bête que possible : personne ne peut la
// relire à l'exécution — le simulateur ne publie ni caméra ni micro — donc tout
// ce qui pourrait s'y tromper doit être ailleurs.
//
// La bande reste posée même vide plutôt que d'apparaître au premier arrivant :
// la scène garderait sinon la même hauteur pour deux dispositions différentes,
// et se redimensionnerait sous une vidéo en cours de lecture.
export function CallStage({
  layout,
  onPressTile,
  onLongPressTile,
}: CallStageProps): React.ReactElement {
  const { width, height } = useWindowDimensions();
  // Les dimensions de la fenêtre, jamais une API d'orientation : sur un
  // pliable elles changent SANS rotation — Pixel 10 Pro Fold, couverture
  // 1080×2364, écran interne 2076×2152.
  //
  // Un prédicat binaire suffit ici : il ne fait que choisir entre une bande en
  // rangée et une bande en colonne, sans rien connaître des tuiles qu'elle
  // contient. Il ne suffira plus le jour où la refonte de la grille comparera
  // le rapport de la fenêtre à celui des tuiles plutôt qu'à 1 — l'écran interne
  // de ce même pliable donne 2076÷2152 ≈ 0,965 (calculé ici, pas cité d'une
  // fiche produit), où ce prédicat binaire retourne toute la disposition sur
  // 3,5 % de géométrie.
  const landscape = width > height;

  return (
    <View style={[styles.root, landscape ? styles.rootLandscape : null]}>
      <View style={styles.stage} testID="active-speaker">
        {/* `contain` pour une caméra : `cover` agrandirait une source 16:9 sur un
            écran en portrait jusqu'à n'en montrer que 26 % — mesuré sur
            1080×2364. Aucune des deux valeurs n'est bonne ; les bandes noires
            sont un défaut de MISE EN PAGE, que la refonte de la grille traitera. */}
        <VideoTile
          tile={layout.stage}
          fitWhenCamera="contain"
          size={styles.stageTile}
          onTilePress={() => onPressTile(layout.stage.key)}
          onTileLongPress={() => onLongPressTile(layout.stage.key)}
        />
      </View>

      {/* Une bande de longueur inconnue : au-delà de trois vignettes, les
          suivantes sortent de l'écran et seraient inatteignables sans
          défilement. En paysage, elle bascule de rangée en colonne : c'est ce
          qui rend sa hauteur à la scène plutôt que de la lui prendre. */}
      <ScrollView
        testID="filmstrip"
        horizontal={!landscape}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={landscape ? styles.filmstripColumn : styles.filmstrip}
        contentContainerStyle={landscape ? styles.filmstripContentColumn : styles.filmstripContent}
      >
        {layout.filmstrip.map((tile) => (
          // `cover` pour une caméra en vignette : elle est trop petite pour
          // qu'on y cherche un cadrage, elle doit d'abord être pleine. Un écran
          // y échappe : voir le commentaire sur `objectFit` dans `VideoTile`.
          <VideoTile
            key={tile.key}
            tile={tile}
            fitWhenCamera="cover"
            size={landscape ? styles.thumbnailTileColumn : styles.thumbnailTile}
            onTilePress={() => onPressTile(tile.key)}
            onTileLongPress={() => onLongPressTile(tile.key)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
