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
import { initialsOf } from 'src/ui/initialsAvatar';
import { tokens } from 'src/ui/tokens';

// — Les trois voiles du mockup, et pourquoi aucun n'est un jeton —
//
// Ce sont des voiles, pas des teintes : leur valeur rendue dépend de ce qu'il y
// a DESSOUS, donc aucun ne peut vivre dans `src/ui/tokens`, dont les jetons
// sont opaques et absolus. Ils vivent ici comme `BAR_RIPPLE_COLOR` vit dans
// `controlBar.ts`, chacun avec le ratio MESURÉ qui le justifie. Les deux
// dimensions qui les suivent, elles, sont ici pour une autre raison, dite à
// leur endroit.

// La bordure d'une tuile ordinaire. Décorative au sens de WCAG 1.4.11 : elle ne
// porte aucune information qu'on ne lise ailleurs — une tuile se voit à son
// image ou à son cercle d'initiales, la personne à son nom — donc aucun seuil
// ne s'y applique et la valeur du mockup est reprise telle quelle. Composée sur
// `surfaceDark` elle donne #232323, soit 1,19:1 : un liseré, rien de plus.
const TILE_BORDER_COLOR = 'rgba(255, 255, 255, 0.07)';

// Le fond du cercle d'initiales. Il ne se pose JAMAIS sur une vidéo — il ne
// paraît qu'en son absence — donc son composite est le seul possible et il est
// connu : 16 % de blanc sur `surfaceDark` (#121212) donnent #383838, sur lequel
// `textDark` mesure 9,93:1.
const AVATAR_BACKGROUND_COLOR = 'rgba(255, 255, 255, 0.16)';

// Le voile du badge de nom, et la SEULE valeur du mockup corrigée ici.
//
// Le mockup pose 45 % de noir. Ce badge-là, contrairement au cercle ci-dessus,
// se pose sur une vidéo dont la couleur n'est connue de personne ici — le même
// motif qui a rendu `overflowBadge` et `pinBadge` opaques. Le pire cas est une
// image blanche : le voile y compose #8C8C8C, sur lequel `textDark` ne mesure
// que 2,85:1, sous les 4,5:1 exigés d'un texte de 11,5 px.
//
// Et ces 45 % n'étaient pas seuls à porter le contraste : le mockup les
// accompagne d'un `backdrop-filter: blur(6px)`, qui n'a aucun équivalent en
// React Native — `expo-blur` n'est pas une dépendance de ce dépôt. Le voile
// reste donc seul, et doit tenir seul.
//
// Opacifier le badge coûterait le caractère du mockup ; l'épaissir suffit. Le
// plancher exact est 0,58 (4,51:1) ; 0,60 est la première valeur ronde
// au-dessus et mesure 4,86:1 sur une vidéo blanche, 17,05:1 sans vidéo.
const NAME_SCRIM_COLOR = 'rgba(0, 0, 0, 0.6)';

// L'écart entre le badge de nom et les deux bords qu'il longe, relevé du mockup
// (`left:10px;bottom:10px`). Hors des pas de `tokens.spacing`, comme les 5 et 9
// dp de `nameBadge` : ce badge se dimensionne et se place sur son texte de
// 11,5 px, jamais sur la grille d'espacement de la coque.
const NAME_INSET = 10;

// Le diamètre du cercle d'initiales, relevé du mockup. Hors de `tokens.spacing`
// à dessein : ce n'est pas un pas d'espacement, c'est la taille d'un objet.
const AVATAR_DIAMETER = 62;

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
  // La bordure est toujours là, et sa LARGEUR ne change jamais : seule sa
  // couleur change. Le bord est intérieur à la boîte — `size` en fixe les
  // dimensions — donc l'épaissir rognerait l'image, et l'épaissir quand
  // quelqu'un parle la rognerait à chaque mot.
  //
  // Le mockup pose 1 px sur une tuile ordinaire et 2 px sur la tuile locale. Ce
  // sont les 2 px qui sont retenus pour TOUTES, et c'est la seule dimension du
  // mockup qui bouge ici : `localTile` et `speaking` plus bas ne posent alors
  // qu'une couleur, et `isSpeaking` — la seule des deux conditions qui BASCULE
  // en séance — ne peut plus déplacer un pixel. La distinction que le mockup
  // fait par l'épaisseur, la couleur la fait déjà : 4,88:1 entre le vert de
  // marque et la bordure ordinaire.
  //
  // `radius.card` vaut 18, exactement le rayon relevé sur les tuiles du
  // mockup : le même nombre parce que c'est le même système visuel, celui du
  // Lot 1. Il est posé ICI plutôt que sur les styles de taille pour que les
  // trois surfaces — grille, bande, scène — le portent sans avoir à le répéter.
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
    borderRadius: tokens.radius.card,
    borderWidth: 2,
    borderColor: TILE_BORDER_COLOR,
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
  // Le compteur de débordement. Posé en bas à droite de la PAGE — le badge
  // d'épinglage est en haut à gauche de sa tuile et le badge de nom en bas à
  // gauche de la sienne : aucun des trois ne peut en recouvrir un autre. Un
  // fond OPAQUE, jamais translucide : la grille est pleine dès qu'il apparaît,
  // donc il se pose forcément sur une vidéo dont la couleur n'est connue de
  // personne ici. `nameBadge` plus bas répond au même risque autrement, et le
  // commentaire de `NAME_SCRIM_COLOR` dit à quelles conditions.
  overflowBadge: {
    position: 'absolute',
    right: tokens.spacing.sm,
    bottom: tokens.spacing.sm,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
    backgroundColor: tokens.color.surfaceDark,
    borderRadius: tokens.radius.pill,
  },
  // Même doctrine que `pinBadgeText` : cet écran est sombre et
  // `react-native-paper` l'ignore (`AGENTS.md`). Ce `Text` vient de Paper, donc
  // sans cette couleur explicite il retomberait sur `onSurface` — un quasi-noir
  // sur un fond quasi noir.
  //
  // Ce n'était « le défaut de la plupart des appareils » que tant que le thème
  // suivait le schéma système. Depuis le Lot 1 de la refonte, `makeTheme` rend
  // toujours le thème clair : le piège n'est plus fréquent, il est certain.
  overflowText: { color: tokens.color.textDark },
  // Plus de rayon ici ni dans les deux styles voisins : il appartient à
  // `styles.tile`, que toute tuile porte quelle que soit sa surface.
  thumbnailTile: { width: tokens.spacing.xl * 4 },
  // Le pendant de `thumbnailTile` en paysage : la dimension fixe passe de la
  // largeur à la hauteur, pour tenir dans la colonne plutôt que dans la
  // rangée.
  thumbnailTileColumn: { height: tokens.spacing.xl * 3 },
  // « C'est moi ». 5,82:1 sur `surfaceDark` : la spécification du lot demandait
  // de mesurer le vert de marque par sous-lot avant emploi plutôt que de le
  // supposer — sur la coque claire il tombait à 2,99, sous le seuil non textuel
  // de 3:1 lui-même.
  localTile: { borderColor: tokens.color.brand },
  // Le locuteur passe DEVANT « c'est moi », et pas l'inverse : c'est le seul
  // des deux états qui bascule, donc le seul qu'on regarde changer. Posé après
  // `localTile` dans le tableau de styles, il gagne. 6,59:1 sur `surfaceDark`.
  speaking: { borderColor: tokens.color.primaryDark },
  video: { flex: 1 },
  // Le cercle d'initiales : ce que la tuile montre à la place d'une image. Une
  // COUCHE en position absolue plutôt qu'une vue en flux, comme celle du nom
  // juste en dessous — les deux se superposent au cadre sans se connaître, et
  // aucune ne prend sa place à l'autre.
  //
  // `absoluteFill` et non `absoluteFillObject` : ce dernier n'existe plus en RN
  // 0.86, ni dans les types ni à l'exécution. `absoluteFill` EST l'objet
  // (`StyleSheetExports.js:21-27`), donc il se répand.
  avatarLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR_DIAMETER,
    height: AVATAR_DIAMETER,
    borderRadius: AVATAR_DIAMETER / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AVATAR_BACKGROUND_COLOR,
  },
  // Même doctrine qu'`overflowText` : ce `Text` vient de Paper, donc sans
  // couleur explicite il retomberait sur `onSurface`, que `makeTheme` rend
  // TOUJOURS clair depuis le Lot 1. 9,93:1 sur le composite du cercle
  // (#383838), calculé et non recopié d'un autre fond de ce fichier.
  avatarText: {
    color: tokens.color.textDark,
    fontFamily: tokens.font.extraBold,
    fontSize: 20,
  },
  // La couche qui POSITIONNE le badge de nom, en bas à gauche. Elle couvre
  // toute la tuile et ne doit donc rien intercepter : c'est le `pointerEvents`
  // posé sur elle en JSX qui laisse l'appui atteindre le `Pressable` qui
  // l'englobe. Le badge d'épinglage, lui, ne lui doit rien : il est rendu APRÈS
  // elle, donc au-dessus, et reçoit l'appui avant qu'elle ne soit consultée.
  nameLayer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    padding: NAME_INSET,
  },
  // `maxWidth` à 100 % : sans lui, un nom long élargit le badge au-delà de la
  // tuile, que l'`overflow: 'hidden'` de `styles.tile` coupe net. Le
  // `numberOfLines` du texte ne borne QUE le nombre de lignes, jamais la
  // largeur de son parent.
  //
  // 5 et 9 dp ne sont sur aucun pas de `tokens.spacing` (4, 8, 16, 24, 32) : ce
  // sont les valeurs relevées du mockup, gardées telles quelles parce que ce
  // badge se dimensionne sur son texte de 11,5 px et non sur la grille
  // d'espacement de la coque.
  nameBadge: {
    maxWidth: '100%',
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: NAME_SCRIM_COLOR,
  },
  nameText: {
    color: tokens.color.textDark,
    fontFamily: tokens.font.bold,
    fontSize: 11.5,
  },
  // Le badge d'épinglage — désormais PRESSABLE : c'est lui, et lui seul, qui
  // désépingle (voir `onTileUnpin`). Une petite punaise dans un coin passait
  // inaperçue ; un partenaire testant sur appareil ne l'a jamais vue. Un fond
  // opaque, jamais translucide — sans lui, le badge se pose directement sur
  // une vidéo dont la couleur n'est connue de personne ici. Coin opposé au nom
  // (`nameBadge`, en bas à gauche depuis le restylage — il était centré) et à
  // la bordure de locuteur (`speaking`, sur tout le pourtour) : rien ne se
  // recouvre.
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
        // `localTile` avant `speaking` : le dernier gagne, et c'est voulu — voir
        // les deux styles.
        style={[
          styles.tile,
          size,
          tile.isLocal ? styles.localTile : null,
          tile.isSpeaking ? styles.speaking : null,
        ]}
      >
        {tile.track === null ? (
          // Sans image, un cercle d'initiales sur fond uni. Un rectangle noir ne
          // se distingue pas d'une panne, et faire disparaître la vignette
          // sortirait la personne de la liste des présents alors qu'elle est
          // bien là.
          //
          // Les initiales viennent du nom BRUT, jamais de `label` : un nom vide
          // n'en donne aucune (`initialsOf`), et c'est bien un cercle nu qu'on
          // veut alors, pas la première lettre d'une chaîne traduite.
          <View style={styles.avatarLayer}>
            <View testID={`tile-avatar-${tile.key}`} style={styles.avatar}>
              <Text testID={`tile-avatar-${tile.key}-text`} style={styles.avatarText}>
                {initialsOf(tile.name)}
              </Text>
            </View>
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

        {/* Le nom, en bas à gauche, sur toute tuile — avec image ou sans. Rendu
            AVANT le badge d'épinglage pour que celui-ci reste au-dessus, et
            `pointerEvents="none"` parce que cette couche recouvre la tuile
            entière : sans lui, elle s'interposerait entre le doigt et le
            `Pressable` qui l'englobe.

            Le `testID` du carton nommé d'avant SUIT LE NOM, la seule chose que
            ce carton portait — et il reste, comme avant, réservé aux tuiles
            SANS image : `call.spec.tsx:544` s'en sert pour prouver qu'aucune
            vidéo n'est posée, et l'étendre à toutes les tuiles viderait cette
            preuve au lieu de la garder.

            Posé sur la COUCHE et non sur le badge, pour que `tile-name-…`
            désigne le même élément dans les deux cas. Et les initiales, elles,
            sont hors de cette couche : `toHaveTextContent` de RNTL 14 compare
            la chaîne ENTIÈRE (`matches()`, `exact = true` par défaut), pas une
            sous-chaîne comme le ferait `jest-native` — mesuré, un « A » glissé
            à côté du nom fait lire « Aada:camera » là où deux tests attendent
            « ada:camera ».

            Pas de glyphe de micro coupé devant le nom, et ce n'est pas un
            oubli : RIEN dans l'application ne sait qu'un micro est coupé.
            `Tile` ne porte pas l'information, `ParticipantView` non plus — son
            `micTrackSid` dit qu'une piste est PUBLIÉE, et son propre
            commentaire précise qu'il est « distinct de `isMuted` à dessein ».
            Ce qui manque n'est PAS l'abonnement : `RoomEvent.TrackMuted` et
            `TrackUnmuted` déclenchent déjà la relecture
            (`src/call/participants.ts:26-27`). C'est le champ — il faudrait
            lire `publication.isMuted` dans `readParticipant`, le porter dans
            `ParticipantView` puis dans `Tile` par `toTile`. Deux fichiers hors
            du périmètre de ce sous-lot, leurs deux specs, et une donnée
            nouvelle : ce qu'un restylage s'interdit. Le mockup lui-même ne
            remplit jamais ce créneau — `muteIcon:''` pour ses quatre tuiles. */}
        <View
          testID={tile.track === null ? `tile-placeholder-${tile.key}` : undefined}
          style={styles.nameLayer}
          pointerEvents="none"
        >
          <View testID={`tile-name-${tile.key}`} style={styles.nameBadge}>
            <Text testID={`tile-name-${tile.key}-text`} style={styles.nameText} numberOfLines={1}>
              {label}
            </Text>
          </View>
        </View>

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
  // Cellule de grille : ouvre le plein écran sur ELLE, donc avec sa clé. La
  // scène, elle, n'en a pas besoin — il n'y a jamais qu'une tuile dessus.
  readonly onFullscreenTile: (key: string) => void;
  // Vignette de bande, en mode `focus` : un appui épingle celle qu'on touche.
  // La clé de la tuile visée, `${identity}:${source}` ; c'est `call.tsx` seul
  // qui décide ce que « épingler » produit, cette coquille ne fait que le
  // rapporter.
  //
  // Le SEUL site d'appel depuis que la grille ouvre le plein écran : la bande
  // n'existe qu'en mode `focus`, donc l'épinglage n'est atteignable que sous un
  // partage d'écran ou un épinglage déjà posé. Conséquence assumée de
  // l'arbitrage — épingler sert à défaire ce qu'un partage a fait, et n'a rien
  // à défaire ailleurs.
  //
  // Distinct de `onFullscreenTile` bien que de même signature, et c'est ce qui
  // rend le mauvais câblage détectable : un site branché sur l'autre rougit.
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
  onFullscreenTile,
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
        onFullscreenTile,
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
  // La grille n'épingle PLUS : elle ouvre le plein écran. Elle montre déjà tout
  // le monde, donc y toucher une tuile veut dire « celui-ci, en grand » —
  // transitoire, et dont un second appui sort — et non « garde-le sur la
  // scène ». L'épinglage reste à la BANDE, où il défait ce qu'un partage
  // d'écran a fait : ramener un visage que la scène a chassé.
  readonly onFullscreenTile: (key: string) => void;
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
function TileGrid({ layout, onFullscreenTile }: TileGridProps): React.ReactElement {
  const { t } = useTranslation();
  // Un objet de style CALCULÉ, jamais un littéral figé : ces deux nombres
  // descendent de la boîte mesurée et ne peuvent pas être statiques. C'est la
  // seule forme de style dynamique du fichier. Plus rien de statique ne
  // l'accompagne depuis que le rayon vit sur `styles.tile`.
  const size = { width: layout.tileWidth, height: layout.tileHeight };

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
              // Un appui sur une cellule ouvre le PLEIN ÉCRAN sur elle : la
              // grille montre déjà tout le monde, donc y toucher quelqu'un veut
              // dire « celui-ci, en grand ». Jamais un épinglage — voir
              // `onFullscreenTile` du type ci-dessus.
              onTilePress={() => onFullscreenTile(tile.key)}
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

      {/* Le débordement est un COMPTE, jamais un défilement : un défilement
          vertical dans la grille n'a aucune position de repos naturelle, et
          `ParticipantsPanel` est déjà la surface qui répond à « qui est là »,
          distincte de « ce que je regarde ». */}
      {layout.overflow > 0 ? (
        <View testID="grid-overflow" style={styles.overflowBadge}>
          <Text testID="grid-overflow-text" style={styles.overflowText}>
            {t('call.moreParticipants', { count: layout.overflow })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type StageContentProps = Omit<CallStageProps, 'onMeasureBox'>;

function renderContent({
  layout,
  onPressStageTile,
  onFullscreenTile,
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

  if (layout.mode === 'grid')
    return <TileGrid layout={layout} onFullscreenTile={onFullscreenTile} />;

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
