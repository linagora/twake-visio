import type { VideoTrackProps } from '@livekit/react-native';

import type { FacingMode } from 'src/call/media';

// La référence de piste que `VideoTrack` accepte. Elle est prise sur les props
// du composant plutôt qu'importée de `@livekit/components-react` : ce paquet-là
// n'est pas une dépendance déclarée de l'application — il n'arrive que dans les
// bagages de `@livekit/react-native` — et `AGENTS.md` demande de préférer ce que
// ce dernier réexporte lui-même. Le type est ainsi ancré sur le seul contrat qui
// compte vraiment, celui du composant qui va la recevoir.
//
// Ce module ne lit jamais l'intérieur d'une `CameraTrack` : il la transporte.
export type CameraTrack = NonNullable<VideoTrackProps['trackRef']>;

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
  readonly camera: CameraTrack | null;
};

// Il y a toujours un participant local — une séance sans soi n'existe pas —
// donc la scène n'est jamais vide, et `stage` n'est jamais `null`.
export type RoomView = {
  readonly local: ParticipantView;
  readonly remotes: readonly ParticipantView[];
};

export type Tile = {
  // Clé React. C'est l'identité LiveKit, unique dans un salon : deux vignettes
  // qui partagent une clé échangent leur vidéo au moindre changement de liste.
  readonly key: string;
  // Nettoyé, éventuellement vide. La coquille n'a donc qu'un seul cas d'absence
  // à traiter, et aucune règle de nom ne lui incombe.
  readonly name: string;
  readonly camera: CameraTrack | null;
  readonly isLocal: boolean;
  readonly isSpeaking: boolean;
  readonly mirror: boolean;
};

export type CallLayout = {
  readonly stage: Tile;
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

function toTile(participant: ParticipantView, facing: FacingMode): Tile {
  return {
    key: participant.identity,
    name: participant.name.trim(),
    camera: participant.camera,
    isLocal: participant.isLocal,
    isSpeaking: participant.isSpeaking,
    // Le miroir ne concerne que sa propre image, et seulement en caméra
    // frontale : c'est le reflet auquel on s'attend en se regardant. Retourner
    // un distant, ou la caméra arrière, rendrait tout texte filmé illisible.
    mirror: participant.isLocal && facing === 'user',
  };
}

// Fonction pure : mêmes entrées, mêmes vignettes. Tout ce qui décide de ce qui
// s'affiche est ici ; la coquille de rendu ne fait que poser la liste.
export function selectLayout(view: RoomView, facing: FacingMode): CallLayout {
  const stage = pickStage(view);

  // Sa propre vignette ouvre la bande, à une place fixe. La chercher parmi des
  // vignettes qui bougent, c'est ne jamais savoir si l'on est cadré.
  const filmstrip = [view.local, ...[...view.remotes].sort(compareStable)]
    // Personne n'apparaît deux fois : la scène retire de la bande celui qu'elle
    // montre. Quand on est seul, la bande devient vide — et c'est juste.
    .filter((participant) => participant.identity !== stage.identity)
    .map((participant) => toTile(participant, facing));

  return { stage: toTile(stage, facing), filmstrip };
}
