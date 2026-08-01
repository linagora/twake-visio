import type { VideoTrackProps } from '@livekit/react-native';

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

export type CallLayout = {
  readonly stage: Tile;
  // Vrai quand c'est l'épinglage qui a produit cette scène, faux quand c'est un
  // partage d'écran ou la parole. La coquille en tire un marqueur, pas une règle.
  readonly pinned: boolean;
  readonly filmstrip: readonly Tile[];
};

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

// Qui mérite la grande surface. Trois règles, dans cet ordre :
//
//   1. celui qui parle passe devant celui qui s'est tu, même récemment — sans
//      quoi l'on regarde quelqu'un qui vient de finir sa phrase pendant qu'un
//      autre parle ;
//   2. à parole égale, le plus récent — c'est ce qui garde le dernier locuteur
//      en place au lieu de vider la scène ou de la faire sauter au silence ;
//   3. à défaut, l'ordre stable, pour que deux entrants muets ne se disputent
//      pas la scène à chaque rendu.
function compareForStage(a: ParticipantView, b: ParticipantView): number {
  if (a.isSpeaking !== b.isSpeaking) return a.isSpeaking ? -1 : 1;
  const spokeA = a.lastSpokeAt ?? Number.NEGATIVE_INFINITY;
  const spokeB = b.lastSpokeAt ?? Number.NEGATIVE_INFINITY;
  if (spokeA !== spokeB) return spokeB - spokeA;
  return compareStable(a, b);
}

// La scène revient toujours à un distant s'il y en a un, jamais à soi : on tient
// le téléphone, on n'a pas besoin de se voir en grand. Le participant local ne
// prend la scène que lorsqu'il est seul — un rectangle noir ferait croire à une
// panne à celui qui arrive le premier.
//
// La sélection porte sur la *personne*, pas sur la piste : un locuteur dont la
// caméra est coupée garde la scène. La faire dépendre de la présence d'une
// image, ce serait changer de scène chaque fois que quelqu'un coupe sa caméra,
// et finir par regarder quelqu'un qui se tait.
function pickStage(view: RoomView): ParticipantView {
  let stage: ParticipantView | null = null;
  for (const remote of view.remotes) {
    if (stage === null || compareForStage(remote, stage) < 0) stage = remote;
  }
  return stage ?? view.local;
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
  // Un partage ne se DISPUTE pas la scène avec la parole : il la prend. Mais un
  // épinglage passe devant lui : c'est une demande explicite, et elle gagne.
  const stage: Tile =
    pinnedTile ??
    (presenter === null
      ? toTile(pickStage(view), 'camera', facing)
      : toTile(presenter, 'screen', facing));

  const filmstrip = candidates.filter((tile) => tile.key !== stage.key);

  return { stage, pinned: pinnedTile !== undefined, filmstrip };
}
