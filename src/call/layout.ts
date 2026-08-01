import type { VideoTrackProps } from '@livekit/react-native';

import { GRID_GAP, TILE_ASPECT, gridCapacity, packGrid, type Box } from 'src/call/grid';
import type { FacingMode } from 'src/call/media';

// La référence de piste que `VideoTrack` accepte. Elle est prise sur les props
// du composant plutôt qu'importée de `@livekit/components-react` : ce paquet-là
// n'est pas une dépendance déclarée de l'application — il n'arrive que dans les
// bagages de `@livekit/react-native` — et `AGENTS.md` demande de préférer ce que
// ce dernier réexporte lui-même. Le type est ainsi ancré sur le seul contrat qui
// compte vraiment, celui du composant qui va la recevoir.
//
// Ce module ne lit jamais l'intérieur d'une `VideoTrackRef` : il la transporte.
//
// Nommée par ce qu'elle est — une référence de piste vidéo — et non par ce
// qu'elle portait au départ. Depuis que le partage d'écran existe, la même forme
// transporte un écran aussi bien qu'un visage, et un type nommé « caméra » qui
// porte un écran est un mensonge que le prochain lecteur paiera.
export type VideoTrackRef = NonNullable<VideoTrackProps['trackRef']>;

// L'état d'un participant tel que la sélection en a besoin, et rien de plus. Ce
// sont des valeurs simples — pas d'objets du SDK — pour que les règles
// ci-dessous soient éprouvables sans LiveKit ni WebRTC.
export type ParticipantView = {
  readonly identity: string;
  readonly name: string;
  readonly isLocal: boolean;
  readonly isSpeaking: boolean;
  // Millisecondes depuis l'époque, `null` si la personne n'a jamais parlé.
  readonly lastSpokeAt: number | null;
  // Millisecondes depuis l'époque. Le SDK ne le garantit pas : `null` est un
  // cas réel, pas une précaution.
  readonly joinedAt: number | null;
  // Le trackSid du micro, `null` si la personne n'en publie aucun. Exigé par
  // `MuteParticipantSerializer` du serveur meet EN PLUS de l'identité — ce que
  // le client n'envoyait pas. Distinct de `isMuted` à dessein : une piste
  // coupée par son émetteur garde sa publication et son sid, et un modérateur
  // peut vouloir la couper côté serveur quoi qu'il en soit ; c'est l'ABSENCE
  // de publication qui rend l'action sans objet.
  readonly micTrackSid: string | null;
  // `null` quand la caméra n'est pas publiée, qu'elle est coupée, ou que la
  // piste n'est pas souscrite. Les trois se ressemblent à l'écran : il n'y a
  // pas d'image.
  readonly camera: VideoTrackRef | null;
  // `null` couvre les mêmes trois cas que `camera` : rien n'est publié, la piste
  // n'est pas souscrite, ou elle est coupée.
  readonly screen: VideoTrackRef | null;
  // Instant de première vue de CETTE piste, en millisecondes, et jamais l'instant
  // où le partage a réellement commencé : LiveKit n'horodate pas les
  // publications — vérifié, la seule occurrence de `firstReceivedTime` dans
  // `livekit-client.esm.mjs` concerne les segments de transcription.
  //
  // `null` si et seulement si `screen` est `null`.
  readonly screenSince: number | null;
  // Horodatage ISO 8601 posé par le serveur meet, `null` quand la main est
  // baissée. Le contrat backend distingue la chaîne vide (baissée) de
  // l'absence de clé (jamais levée) ; les deux se lisent `null` ici. Un champ
  // nommé, jamais la carte d'attributs entière : ce type est « ce dont la
  // sélection a besoin, et rien de plus ». Lu par `readParticipant`
  // (`src/call/participants.ts`) via `readHandRaisedAt` (`src/call/hands.ts`).
  readonly handRaisedAt: string | null;
};

// Il y a toujours un participant local — une séance sans soi n'existe pas —
// donc la scène n'est jamais vide, et `stage` n'est jamais `null`.
export type RoomView = {
  readonly local: ParticipantView;
  readonly remotes: readonly ParticipantView[];
};

export type TileSource = 'camera' | 'screen';

export type Tile = {
  // `${identity}:${source}`, et non l'identité seule : depuis le partage
  // d'écran, une même personne produit deux tuiles. Deux vignettes qui
  // partageraient une clé échangeraient leur vidéo au moindre changement de
  // liste.
  readonly key: string;
  readonly source: TileSource;
  // Nettoyé, éventuellement vide. La coquille n'a donc qu'un seul cas d'absence
  // à traiter, et aucune règle de nom ne lui incombe.
  readonly name: string;
  readonly track: VideoTrackRef | null;
  readonly isLocal: boolean;
  readonly isSpeaking: boolean;
  readonly mirror: boolean;
};

// Deux modes, et c'est le CONTENU qui tranche, jamais la géométrie :
//
//   1. un épinglage résout vers une tuile présente  ⇒ `focus` sur elle ;
//   2. sinon, un partage d'écran existe             ⇒ `focus` sur cet écran ;
//   3. sinon                                        ⇒ `grid`.
//
// Une union discriminée plutôt qu'un objet à champs facultatifs : `tsc` trouve
// alors tout consommateur qui aurait oublié un mode, et une grille n'a pas de
// scène — un `stage` toujours présent mais parfois dénué de sens serait un
// mensonge que le prochain lecteur paierait.
export type CallLayout =
  | {
      readonly mode: 'grid';
      readonly columns: number;
      // Les dimensions calculées d'UNE cellule, identiques pour toutes. Elles
      // ne peuvent pas être statiques : elles descendent de la boîte mesurée.
      readonly tileWidth: number;
      readonly tileHeight: number;
      readonly tiles: readonly Tile[];
      // Combien de participants la boîte n'a pas pu montrer. 0 le plus souvent.
      // Un COMPTE, jamais un défilement : un défilement vertical n'a pas de
      // position de repos naturelle, et `ParticipantsPanel` est déjà la surface
      // qui répond à « qui est là », distincte de « ce que je regarde ».
      readonly overflow: number;
    }
  | {
      readonly mode: 'focus';
      readonly focus: Tile;
      // Vrai quand c'est l'épinglage qui a produit ce focus, faux quand c'est
      // un partage d'écran. La coquille en tire un badge, pas une règle.
      readonly pinned: boolean;
      // Où la bande se range : `'row'` sous la scène, `'column'` à côté d'elle.
      // Décidé ici et jamais dans la coquille — c'est une décision de
      // disposition, et `stage.tsx` ne décide rien.
      readonly stripAxis: StripAxis;
      readonly filmstrip: readonly Tile[];
    };

export type StripAxis = 'row' | 'column';

// Ce qui décide n'est pas « la boîte est-elle plus large que haute », c'est
// « est-elle plus large que le contenu ne le demande ». Le comparatif juste
// est donc `W / H` contre `TILE_ASPECT`, jamais contre 1 :
//
//   - `W / H < TILE_ASPECT` : la tuile de focus est bornée par la largeur, le
//     mou est vertical, la bande passe DESSOUS ;
//   - `W / H > TILE_ASPECT` : le mou est horizontal, la bande passe SUR LE CÔTÉ.
//
// Un seuil binaire posé à 1,000 serait placé exactement là où il ne faut pas :
// l'écran interne du Pixel 10 Pro Fold fait 2076 × 2152, soit un rapport de
// 0,965, et 1,037 une fois tourné — `width > height` retournerait toute la
// disposition sur 3,5 % de géométrie. Le seuil de 1,778 est loin de la zone où
// cet appareil vit, et les deux postures y répondent pareil.
function pickStripAxis(box: Box): StripAxis {
  return box.width / box.height > TILE_ASPECT ? 'column' : 'row';
}

// L'ordre de la bande de vignettes. Il ne dépend ni de la parole ni des pistes :
// une bande triée par le locuteur se réorganise sous le pouce, et l'on appuie
// sur la vignette de quelqu'un d'autre que celle qu'on visait. L'ordre
// d'arrivée est le seul qui ne bouge pas tant que personne n'entre ni ne sort.
//
// L'identité départage : `joinedAt` est facultatif côté SDK, et sans dernier
// recours l'ordre retomberait sur celui de la Map du SDK, qui n'est stable pour
// personne.
function compareStable(a: ParticipantView, b: ParticipantView): number {
  const joinedA = a.joinedAt ?? Number.POSITIVE_INFINITY;
  const joinedB = b.joinedAt ?? Number.POSITIVE_INFINITY;
  if (joinedA !== joinedB) return joinedA - joinedB;
  if (a.identity === b.identity) return 0;
  return a.identity < b.identity ? -1 : 1;
}

// Le classement par la parole. Trois règles, dans cet ordre :
//
//   1. celui qui parle passe devant celui qui s'est tu, même récemment — sans
//      quoi l'on regarde quelqu'un qui vient de finir sa phrase pendant qu'un
//      autre parle ;
//   2. à parole égale, le plus récent — c'est ce qui garde le dernier locuteur
//      en place au lieu de vider la place ou de la faire sauter au silence ;
//   3. à défaut, l'ordre stable, pour que deux entrants muets ne se disputent
//      pas la même cellule à chaque rendu.
//
// Il a changé d'office avec la grille, pas de contenu : il ne choisit plus LA
// scène — il n'y en a plus quand personne ne partage — il DÉPARTAGE. Et ce
// départage ne sert qu'à décider qui obtient une cellule quand il y a plus de
// monde que de cellules.
function compareForStage(a: ParticipantView, b: ParticipantView): number {
  if (a.isSpeaking !== b.isSpeaking) return a.isSpeaking ? -1 : 1;
  const spokeA = a.lastSpokeAt ?? Number.NEGATIVE_INFINITY;
  const spokeB = b.lastSpokeAt ?? Number.NEGATIVE_INFINITY;
  if (spokeA !== spokeB) return spokeB - spokeA;
  return compareStable(a, b);
}

// Les distants du plus « méritant » au moins, jamais soi : sa propre tuile a
// une place réservée en tête de grille, hors classement — même motif que la
// bande, « la chercher parmi des vignettes qui bougent, c'est ne jamais savoir
// si l'on est cadré ».
//
// Le classement porte sur la *personne*, pas sur la piste : quelqu'un qui parle
// caméra coupée garde son rang. Le faire dépendre de la présence d'une image,
// ce serait perdre une cellule chaque fois que quelqu'un coupe sa caméra, et
// finir par regarder quelqu'un qui se tait.
function rankBySpeech(view: RoomView): readonly ParticipantView[] {
  return [...view.remotes].sort(compareForStage);
}

// Qui obtient une cellule, et dans quel ordre elles s'affichent — deux
// questions distinctes, et c'est tout l'objet de cette fonction.
//
// L'APPARTENANCE se décide au classement par la parole : au-delà de la
// capacité, ce sont ceux qui parlent qui restent à l'écran. L'ORDRE, lui, reste
// l'ordre stable — une cellule qui change de place sous le pouce est pire
// qu'une cellule absente, exactement le motif que la bande porte déjà.
//
// Conséquence voulue : tant que tout le monde tient, la grille ne bouge JAMAIS.
// C'est le cas courant. Au-delà, seule l'appartenance change.
function pickGridMembers(view: RoomView, capacity: number): readonly ParticipantView[] {
  // À une seule cellule, elle va au premier distant et jamais à soi : on tient
  // le téléphone, on n'a pas besoin de se voir en grand. C'est mot pour mot
  // l'ancienne règle de `pickStage`, généralisée au lieu d'être contredite — et
  // le repli sur soi vaut pour la même raison qu'avant : un rectangle noir
  // ferait croire à une panne à celui qui arrive le premier.
  if (capacity <= 1) return [rankBySpeech(view)[0] ?? view.local];

  const kept = rankBySpeech(view).slice(0, capacity - 1);
  return [view.local, ...[...kept].sort(compareStable)];
}

// Traduit un participant et une source de piste en tuile prête pour l'affichage.
function toTile(participant: ParticipantView, source: TileSource, facing: FacingMode): Tile {
  return {
    key: `${participant.identity}:${source}`,
    source,
    name: participant.name.trim(),
    track: source === 'screen' ? participant.screen : participant.camera,
    isLocal: participant.isLocal,
    isSpeaking: participant.isSpeaking,
    // Le miroir ne concerne que sa propre image, et seulement en caméra
    // frontale : c'est le reflet auquel on s'attend en se regardant. Retourner
    // un distant, ou la caméra arrière, rendrait tout texte filmé illisible.
    // Un écran n'est jamais en miroir : le retourner rendrait illisible tout
    // texte affiché dessus, ce qui est précisément ce qu'on partage.
    mirror: source === 'camera' && participant.isLocal && facing === 'user',
  };
}

// Qui partage, et depuis le plus longtemps ? Rend `null` si personne ne partage.
//
// À égalité d'instant — le cas de la jonction, où tous les partages en cours
// sont découverts dans la même lecture — l'ordre stable départage. Arbitraire,
// mais déterministe : personne n'a de raison d'attendre l'un plutôt que l'autre,
// et une scène qui sauterait entre deux écrans serait pire que ce choix.
//
// Le local est inclus dans la recherche, contrairement à `pickStage` : si c'est
// soi qui présente, la scène doit le montrer aussi — présenter, c'est justement
// demander qu'on regarde, y compris son propre écran.
function pickScreen(view: RoomView): ParticipantView | null {
  let best: ParticipantView | null = null;
  for (const p of [view.local, ...view.remotes]) {
    if (p.screen === null || p.screenSince === null) continue;
    if (best === null) {
      best = p;
      continue;
    }
    const bestSince = best.screenSince ?? 0;
    if (p.screenSince > bestSince) best = p;
    else if (p.screenSince === bestSince && compareStable(p, best) < 0) best = p;
  }
  return best;
}

// Fonction pure : mêmes entrées, mêmes vignettes. Tout ce qui décide de ce qui
// s'affiche est ici ; la coquille de rendu ne fait que poser la liste.
export function selectLayout(
  view: RoomView,
  facing: FacingMode,
  // La boîte réellement offerte à la scène, en dp, telle que `onLayout` l'a
  // mesurée — jamais les dimensions de la fenêtre. Celles-ci ignorent les 52 dp
  // de la barre de contrôle, les encoches de `SafeAreaView`, et les trois
  // bandeaux qui peuvent apparaître à tout instant.
  box: Box,
  // Une clé de tuile, `${identity}:${source}`. `null` = rien d'épinglé.
  pin: string | null,
): CallLayout {
  // Toutes les tuiles candidates, dans l'ordre où la bande les montrerait. Sa
  // propre vignette ouvre la bande, à une place fixe.
  const everyone = [view.local, ...[...view.remotes].sort(compareStable)];
  const candidates = [
    ...everyone.map((p) => toTile(p, 'camera', facing)),
    ...everyone.filter((p) => p.screen !== null).map((p) => toTile(p, 'screen', facing)),
  ];

  // L'épinglage est RÉSOLU contre la vue présente à chaque rendu, jamais
  // « effacé ». Une personne qui part emporte sa tuile ; la clé reste posée et
  // ne résout plus, donc on retombe sur la règle ordinaire. Si elle revient,
  // l'épinglage reprend tout seul — et une reconnexion le conserve.
  const pinnedTile = pin === null ? undefined : candidates.find((t) => t.key === pin);

  const presenter = pickScreen(view);
  // Un partage ne se DISPUTE pas la scène : il la prend, et la garde tant qu'il
  // dure. La règle vient du produit, mais elle vient aussi de la géométrie
  // depuis la grille : une tuile n'est jamais letterboxée à l'intérieur, or un
  // écran ne peut pas être rogné — « un texte coupé est un texte perdu ». Un
  // écran est donc le seul contenu qui exige un `contain`, donc une boîte à
  // lui, donc le seul qui ne peut pas entrer dans une cellule de grille.
  //
  // Un épinglage passe devant lui : c'est une demande explicite, et elle gagne.
  // Un épinglage qu'un partage pourrait renverser n'épingle pas.
  const focus: Tile | undefined =
    pinnedTile ?? (presenter === null ? undefined : toTile(presenter, 'screen', facing));

  if (focus !== undefined) {
    return {
      mode: 'focus',
      focus,
      pinned: pinnedTile !== undefined,
      stripAxis: pickStripAxis(box),
      filmstrip: candidates.filter((tile) => tile.key !== focus.key),
    };
  }

  // La marge de page vaut le MÊME écart que celui entre deux cellules : « le
  // vide appartient à la marge de la page, jamais à l'intérieur d'une tuile ».
  // Retirée ici plutôt que dans `src/call/grid`, qui ne connaît que des
  // cellules — mais `stage.tsx` pose exactement le même `GRID_GAP` en
  // `padding`, et un test garde l'égalité des deux.
  const inner: Box = {
    width: box.width - 2 * GRID_GAP,
    height: box.height - 2 * GRID_GAP,
  };
  const members = pickGridMembers(view, gridCapacity(inner, GRID_GAP));
  const packing = packGrid(members.length, inner, GRID_GAP);

  return {
    mode: 'grid',
    columns: packing.columns,
    tileWidth: packing.tileWidth,
    tileHeight: packing.tileHeight,
    // Jamais d'écran ici : un partage aurait forcé le mode `focus` au-dessus.
    tiles: members.map((p) => toTile(p, 'camera', facing)),
    overflow: everyone.length - members.length,
  };
}
