import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { VideoTrack } from '@livekit/react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Text } from 'react-native-paper';

import { GRID_GAP, type Box } from 'src/call/grid';
import type { CallLayout, Tile } from 'src/call/layout';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Quand la bande se range sur le côté, elle cesse d'être un ÉTAGE sous la
  // scène pour devenir une COLONNE à côté : c'est ce qui lui rend la hauteur,
  // précisément ce qui devient rare quand la boîte s'élargit plus que le
  // gabarit ne le demande.
  rootRow: { flexDirection: 'row' },
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
    // `flex: 1` pour REMPLIR le `Pressable` qui l'enveloppe, et non pour
    // participer à une disposition. Sans lui, une vignette s'effondre à une
    // hauteur nulle : son `size` ne porte qu'une largeur, le `Pressable` prend
    // bien sa hauteur de l'étirement de la bande, mais cette vue-ci n'a alors
    // ni `flex` ni `height` et se dimensionne sur son contenu — un `VideoTrack`
    // en `flex: 1`, donc de base nulle. Constaté sur appareil : la bande
    // rendait deux tuiles invisibles pendant que la sélection y plaçait bien
    // deux tuiles. La scène y échappait, son `size` valant `{ flex: 1 }`.
    flex: 1,
    overflow: 'hidden',
    backgroundColor: tokens.color.surfaceDark,
    borderWidth: 2,
    borderColor: tokens.color.surfaceDark,
  },
  stageTile: { flex: 1 },
  // La page de la grille. `padding` et `gap` valent la MÊME constante, et
  // c'est exactement celle que `selectLayout` retire de la boîte mesurée avant
  // d'appeler `packGrid` : « le vide appartient à la marge de la page, jamais
  // à l'intérieur d'une tuile ». Les deux ne peuvent pas diverger — un test de
  // `grid.spec.ts` garde `GRID_GAP === tokens.spacing.xs`, et celui-ci est le
  // seul autre endroit qui pose ce nombre.
  //
  // Centrée dans les deux sens : ce qui reste après l'empaquetage est du fond,
  // et du fond centré se lit comme une mise en page voulue plutôt que comme
  // une vidéo cassée.
  gridPage: {
    flex: 1,
    padding: GRID_GAP,
    justifyContent: 'center',
    gap: GRID_GAP,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: GRID_GAP,
  },
  // Aucune dimension ici : elles descendent de `Packing` et ne peuvent pas
  // être statiques. Elles arrivent par un tableau `[styles.gridTile, { width,
  // height }]` — un objet de style CALCULÉ, jamais un littéral figé, la seule
  // forme possible pour une taille qui dépend de la boîte mesurée.
  gridTile: { borderRadius: tokens.radius.md },
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
  // Le badge d'épinglage — désormais PRESSABLE : c'est lui, et lui seul, qui
  // désépingle (voir `onTileUnpin`). Une petite punaise dans un coin passait
  // inaperçue ; un partenaire testant sur appareil ne l'a jamais vue. Un fond
  // opaque, jamais translucide — sans lui, le badge se pose directement sur
  // une vidéo dont la couleur n'est connue de personne ici. Coin opposé au
  // nom (`placeholder`, centré) et à la bordure de locuteur (`speaking`, sur
  // tout le pourtour) : rien ne se recouvre.
  //
  // `minWidth`/`minHeight` à 44, la recommandation Apple déjà retenue par
  // `controlBar.ts` pour la barre de contrôle : un PLANCHER, jamais une
  // largeur fixe — le libellé grandit avec sa traduction (« Закреплено » n'a
  // pas la largeur de « Pinned »), et une largeur figée le couperait dans les
  // locales les plus longues.
  pinBadge: {
    position: 'absolute',
    top: tokens.spacing.xs,
    left: tokens.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: tokens.spacing.sm,
    backgroundColor: tokens.color.surfaceDark,
    borderRadius: tokens.radius.pill,
  },
  // Cet écran est sombre dans les deux schémas et `react-native-paper`
  // l'ignore (`AGENTS.md`) — mais ni ce glyphe ni ce texte ne passent par un
  // composant Paper dont la couleur retomberait sur le thème : les deux sont
  // des `style` littéraux, jamais calculés. 15,86:1 sur `surfaceDark` (calculé,
  // pas copié du 16,65:1 de `backgroundDark` ailleurs dans ce fichier : les
  // deux fonds sont proches mais distincts).
  pinBadgeIcon: { color: tokens.color.textDark },
  pinBadgeText: { color: tokens.color.textDark },
});

type VideoTileProps = {
  readonly tile: Tile;
  // Ce que la PLACE veut, quand la source n'impose rien.
  readonly fitWhenCamera: 'cover' | 'contain';
  readonly size: StyleProp<ViewStyle>;
  // Relayé tel quel : la vignette ne décide pas ce qu'un appui sur SA
  // surface signifie — voir `CallStage`, qui ferme dans la fermeture la
  // clé (ou son absence) propre à chaque site d'appel : scène, bande ou
  // plein écran ne veulent pas dire la même chose sous ce même appui.
  //
  // Nommé `onTilePress`, jamais `onPress` : `fireEvent.press` de RNTL 14
  // retombe, faute de handler sur l'élément visé, sur une remontée de FIBRE
  // (`findEventHandlerFromFiber`, `@testing-library/react-native/dist/fire-event.js`)
  // qui s'arrête au premier ANCÊTRE HÔTE croisé — jamais avant. `Pressable`
  // n'étant pas un composant hôte, un nom identique à sa propre prop
  // `onPress` se laisse trouver sur CETTE fonction-ci sans jamais prouver
  // qu'elle le relaie : vérifié par mutation, retirer `onPress={onTilePress}`
  // du `Pressable` ci-dessous laisse les tests de ce fichier ET ceux de
  // `call.spec.tsx` rouges — voir le rapport de ce lot pour le compte exact.
  readonly onTilePress: () => void;
  // I5 : vrai quand CETTE tuile doit porter le badge d'épinglage. Obligatoire
  // plutôt qu'optionnelle à défaut `false`, pour la même raison que
  // `onTilePress` juste au-dessus : `CallStage` instancie `VideoTile` à trois
  // sites d'appel (scène, bande, plein écran), et un défaut silencieux
  // laisserait un site oublié se comporter par accident au lieu de forcer une
  // décision. Seule la scène, en disposition ordinaire, doit jamais valoir
  // `true` — voir `CallStage` plus bas.
  readonly pinned: boolean;
  // Le geste du badge, distinct de celui de la tuile : un appui sur la tuile
  // de scène bascule désormais le plein écran (`onTilePress`), donc
  // désépingler a besoin de SA PROPRE surface, plus petite, posée par-dessus.
  // Obligatoire pour la même raison que `pinned` : les deux sites d'appel où
  // `pinned` vaut toujours `false` passent un bouchon qui ne sera jamais
  // invoqué, plutôt que de laisser la décision implicite.
  readonly onTileUnpin: () => void;
};

// Aucune décision ici : la vignette pose ce qu'on lui donne. Tout ce qui se
// choisit — qui, dans quel ordre, en miroir ou non — a été décidé par
// `src/call/layout`, le seul endroit vérifiable.
function VideoTile({
  tile,
  fitWhenCamera,
  size,
  onTilePress,
  pinned,
  onTileUnpin,
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
    <Pressable style={size} onPress={onTilePress}>
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
        {pinned ? (
          // I5 : un `Pressable` à part entière, imbriqué dans celui de la
          // tuile — pas un second `onPress` sur le même élément. RNTL 14
          // cible l'élément exact demandé par `getByTestId` avant de remonter
          // la fibre (voir le commentaire sur `onTilePress` plus haut) : viser
          // CE `testID` atteint donc CE `Pressable`, jamais celui, plus
          // englobant, de la tuile — vérifié par un test dédié dans
          // `stage.spec.tsx` plutôt que supposé.
          //
          // `hitSlop` inutile ici : le plancher `minWidth`/`minHeight` de
          // `styles.pinBadge` EST la cible tactile.
          <Pressable
            testID="pin-marker"
            style={styles.pinBadge}
            onPress={onTileUnpin}
            accessibilityLabel={t('call.pinned')}
          >
            <MaterialCommunityIcons
              testID="pin-marker-icon"
              name="pin"
              size={16}
              style={styles.pinBadgeIcon}
            />
            <Text testID="pin-marker-text" style={styles.pinBadgeText}>
              {t('call.pinned')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

export type CallStageProps = {
  // `null` tant que la boîte n'a pas été mesurée : la coquille ne rend alors
  // aucune tuile. Une trame, jamais plus — et elle passe inaperçue à côté des
  // secondes de négociation WebRTC qui la précèdent.
  readonly layout: CallLayout | null;
  // La boîte que cette coquille vient de mesurer. Elle la REMONTE et ne s'en
  // sert jamais : c'est `selectLayout` qui en tire le nombre de tuiles, leur
  // taille et l'axe de la bande. La coquille reste bête.
  readonly onMeasureBox: (box: Box) => void;
  // Scène du mode `focus` : un appui bascule le plein écran SUR la tuile qui
  // s'y trouve, épinglée ou non — `call.tsx` ne distingue plus les deux à ce
  // geste, voir `handlePressStageTile`. Zéro argument : il n'y a jamais qu'une
  // tuile sur la scène, et `call.tsx` connaît déjà sa clé par `layout.focus.key`.
  readonly onPressStageTile: () => void;
  // Un appui sur une tuile qui n'est PAS la scène — vignette de bande en mode
  // `focus`, cellule en mode `grid` — épingle celle qu'on touche. La clé de la
  // tuile visée, `${identity}:${source}` ; c'est `call.tsx` seul qui décide ce
  // que « épingler » produit, cette coquille ne fait que le rapporter.
  //
  // Nommé par ce qu'il VEUT DIRE et non par la surface d'où il part : les deux
  // sites d'appel disent exactement la même chose, et un nom qui citerait la
  // bande mentirait au site de la grille. C'est aussi ce qui rend le mauvais
  // câblage détectable — un site branché sur `onPressStageTile` par erreur
  // rougit, puisque les deux rappels restent distincts.
  readonly onPinTile: (key: string) => void;
  // Badge d'épinglage, sur la scène : c'est lui, et lui seul, qui désépingle
  // — voir `onTileUnpin` de `VideoTile`.
  readonly onUnpinTile: () => void;
  // Tuile plein écran : un appui, où qu'il porte sur cette unique tuile, en
  // sort. Un aller-retour sur le même geste que celui qui l'a ouverte
  // (`onPressStageTile`), sur la même surface.
  readonly onExitFullscreen: () => void;
  // La tuile seule à montrer, sans bande ; `null` = disposition normale. Ce
  // n'est pas une décision de disposition — `selectLayout` n'a pas à
  // connaître cette notion d'écran — donc elle arrive déjà résolue : cette
  // coquille ne fait que la poser, elle ne décide ni ce qui la remplit ni
  // quand elle retombe à `null`. Voir `fullscreenTile` dans `call.tsx`.
  readonly fullscreenTile: Tile | null;
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
  onMeasureBox,
  onPressStageTile,
  onPinTile,
  onUnpinTile,
  onExitFullscreen,
  fullscreenTile,
}: CallStageProps): React.ReactElement {
  // La boîte est MESURÉE, jamais déduite de `useWindowDimensions()`. Trois
  // motifs, et le premier suffit : la fenêtre ignore les 52 dp de la barre de
  // contrôle, les encoches de `SafeAreaView` (`app/_layout.tsx`) et les trois
  // bandeaux qui peuvent apparaître à tout instant au-dessus de la scène. Une
  // disposition calculée sur la fenêtre placerait une rangée derrière la barre
  // dès qu'une main se lève. `onLayout` coûte une trame et supprime la classe
  // entière.
  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent): void => {
      const { width, height } = event.nativeEvent.layout;
      onMeasureBox({ width, height });
    },
    [onMeasureBox],
  );

  // Un seul `onLayout`, sur la racine, valable pour les trois dispositions
  // ci-dessous : le plein écran, l'attente de la mesure et la disposition
  // ordinaire ne changent pas la boîte que le parent nous donne. Le poser dans
  // chaque branche le ferait disparaître dans celle qu'on oublierait.
  return (
    <View style={[styles.root, axisStyle(layout)]} onLayout={handleLayout} testID="stage-root">
      {renderContent({
        layout,
        onPressStageTile,
        onPinTile,
        onUnpinTile,
        onExitFullscreen,
        fullscreenTile,
      })}
    </View>
  );
}

// La racine passe en rangée quand la bande se range SUR LE CÔTÉ : c'est ce qui
// rend sa hauteur à la scène plutôt que de la lui prendre. Jamais en plein
// écran, où il n'y a pas de bande, ni avant la mesure, où il n'y a rien.
function axisStyle(layout: CallLayout | null): StyleProp<ViewStyle> {
  if (layout === null || layout.mode === 'grid') return null;
  return layout.stripAxis === 'column' ? styles.rootRow : null;
}

type TileGridProps = {
  readonly layout: Extract<CallLayout, { mode: 'grid' }>;
  readonly onPinTile: (key: string) => void;
};

// Les tuiles découpées en rangées de `columns`. Le découpage est EXPLICITE et
// non un `flexWrap` : à deux colonnes bornées par la largeur, la somme des
// tuiles et de leur écart vaut exactement la largeur offerte, et le moindre
// arrondi flottant ferait retomber la dernière cellule à la ligne. `columns`
// arrive déjà calculé, il n'y a rien à redécouvrir.
//
// `Math.max(1, …)` est une garde de TERMINAISON, pas une règle : `packGrid` ne
// rend jamais moins d'une colonne, mais un pas de zéro boucle indéfiniment, et
// une boucle infinie dans un rendu ne se diagnostique pas.
function rowsOf(tiles: readonly Tile[], columns: number): readonly (readonly Tile[])[] {
  const step = Math.max(1, columns);
  const rows: Tile[][] = [];
  for (let index = 0; index < tiles.length; index += step) {
    rows.push(tiles.slice(index, index + step));
  }
  return rows;
}

// La grille : aucune scène, aucune bande, des cellules toutes de la même
// taille. Chacune est déjà au rapport du gabarit, donc `cover` ne rogne
// presque rien et ne laisse JAMAIS de noir à l'intérieur d'une tuile — c'est
// tout le principe : le vide devient de la marge de page.
function TileGrid({ layout, onPinTile }: TileGridProps): React.ReactElement {
  const size = [styles.gridTile, { width: layout.tileWidth, height: layout.tileHeight }];

  return (
    <View style={styles.gridPage} testID="grid">
      {rowsOf(layout.tiles, layout.columns).map((row, index) => (
        <View key={row[0]?.key ?? index} testID={`grid-row-${index}`} style={styles.gridRow}>
          {row.map((tile) => (
            <VideoTile
              key={tile.key}
              tile={tile}
              fitWhenCamera="cover"
              size={size}
              // Un appui sur une cellule ÉPINGLE, exactement comme un appui sur
              // une vignette de bande : c'est la seule échappatoire depuis la
              // grille vers une grande surface, et le seul moyen de figer ce
              // qu'on regarde quand il y a plus de monde que de cellules.
              onTilePress={() => onPinTile(tile.key)}
              // Jamais de badge dans la grille : une tuile épinglée force le
              // mode `focus`, donc aucune tuile qui atteint ce site d'appel
              // n'est jamais celle qui est épinglée.
              pinned={false}
              // Jamais invoqué : `pinned` vaut toujours `false` à ce site.
              onTileUnpin={() => undefined}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

type StageContentProps = Omit<CallStageProps, 'onMeasureBox'>;

function renderContent({
  layout,
  onPressStageTile,
  onPinTile,
  onUnpinTile,
  onExitFullscreen,
  fullscreenTile,
}: StageContentProps): React.ReactElement | null {
  // Le plein écran remplace la disposition entière : une tuile, aucune bande.
  if (fullscreenTile !== null) {
    return (
      <View style={styles.stage} testID="active-speaker">
        <VideoTile
          tile={fullscreenTile}
          fitWhenCamera="contain"
          size={styles.stageTile}
          onTilePress={onExitFullscreen}
          // I5 : jamais ici. Le plein écran n'affiche jamais le badge,
          // épinglée ou non : un badge y suggérerait qu'un appui sur la
          // tuile désépingle, alors qu'il en sort — voir le commentaire sur
          // `pinned` de `VideoTileProps`.
          pinned={false}
          // Jamais invoqué : `pinned` vaut toujours `false` à ce site.
          onTileUnpin={() => undefined}
        />
      </View>
    );
  }

  // Rien tant que la boîte n'est pas connue. Poser une tuile « en attendant »
  // sur une taille inventée la ferait sauter d'une taille à l'autre une trame
  // plus tard, sous une vidéo en cours de lecture.
  if (layout === null) return null;

  if (layout.mode === 'grid') return <TileGrid layout={layout} onPinTile={onPinTile} />;

  return (
    <>
      <View style={styles.stage} testID="active-speaker">
        {/* `contain` pour une caméra : `cover` agrandirait une source 16:9 sur un
            écran en portrait jusqu'à n'en montrer que 26 % — mesuré sur
            1080×2364. Aucune des deux valeurs n'est bonne ; les bandes noires
            sont un défaut de MISE EN PAGE, que la grille traite. */}
        <VideoTile
          tile={layout.focus}
          fitWhenCamera="contain"
          size={styles.stageTile}
          onTilePress={onPressStageTile}
          // I5 : la SEULE des trois instanciations de `VideoTile` où ce badge
          // peut apparaître — voir `src/call/layout.ts`, dont le filtre
          // garantit qu'une tuile épinglée ne peut jamais se trouver dans la
          // bande juste en dessous.
          pinned={layout.pinned}
          onTileUnpin={onUnpinTile}
        />
      </View>

      {/* Une bande de longueur inconnue : au-delà de trois vignettes, les
          suivantes sortent de l'écran et seraient inatteignables sans
          défilement. Quand la boîte est plus large que le gabarit ne le
          demande, elle bascule de rangée en colonne : c'est ce qui rend sa
          hauteur à la scène plutôt que de la lui prendre. */}
      <ScrollView
        testID="filmstrip"
        horizontal={layout.stripAxis === 'row'}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={layout.stripAxis === 'column' ? styles.filmstripColumn : styles.filmstrip}
        contentContainerStyle={
          layout.stripAxis === 'column' ? styles.filmstripContentColumn : styles.filmstripContent
        }
      >
        {layout.filmstrip.map((tile) => (
          // `cover` pour une caméra en vignette : elle est trop petite pour
          // qu'on y cherche un cadrage, elle doit d'abord être pleine. Un écran
          // y échappe : voir le commentaire sur `objectFit` dans `VideoTile`.
          <VideoTile
            key={tile.key}
            tile={tile}
            fitWhenCamera="cover"
            size={layout.stripAxis === 'column' ? styles.thumbnailTileColumn : styles.thumbnailTile}
            onTilePress={() => onPinTile(tile.key)}
            // I5 : jamais dans la bande, par construction — `layout.ts`
            // filtre systématiquement la tuile épinglée hors de `filmstrip`,
            // donc aucune tuile qui atteint ce site d'appel n'est jamais
            // elle. Explicite plutôt qu'omis, pour que ce site d'appel décide
            // lui aussi, au lieu d'hériter un défaut en silence.
            pinned={false}
            // Jamais invoqué : `pinned` vaut toujours `false` à ce site.
            onTileUnpin={() => undefined}
          />
        ))}
      </ScrollView>
    </>
  );
}
