import { RoomEvent, Track } from 'livekit-client';
import type { Participant, Room } from 'livekit-client';

import { readHandRaisedAt } from 'src/call/hands';
import type { VideoTrackRef, ParticipantView, RoomView } from 'src/call/layout';

// Tout ce qui peut changer ce qui s'affiche, et rien d'autre. Un événement
// oublié ici ne casse rien de visible en développement : il fige simplement une
// vignette sur l'appareil de quelqu'un d'autre. C'est pourquoi la liste est
// exportée et vérifiée nom par nom par le test.
//
// `RoomEvent.Reconnected` en fait partie : une reconnexion peut avoir changé le
// tableau des présents pendant la coupure, et rien d'autre ne le signalera.
//
// La bascule de caméra frontale/arrière n'y figure pas : elle passe par
// `restartTrack`, que `VideoTrack` suit lui-même via `TrackEvent.Restarted` sur
// la piste. La publication, elle, ne change pas.
export const ROOM_VIEW_EVENTS = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.ParticipantNameChanged,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.Reconnected,
  // La main levée vit dans un attribut de participant, et le serveur LiveKit
  // est le seul à la diffuser : sans cet événement, une main levée par
  // quelqu'un d'autre n'arriverait jamais à l'écran. Sur l'émetteur
  // participant-scoped l'événement s'appelle `attributesChanged` ; ici, au
  // niveau `Room`, c'est `participantAttributesChanged`, et le participant
  // local y est inclus.
  RoomEvent.ParticipantAttributesChanged,
] as const;

// `null` couvre les trois façons de ne pas avoir d'image, indiscernables à
// l'écran : rien n'est publié, la piste n'est pas — ou plus — souscrite, ou la
// caméra est coupée. La coquille pose alors un carton nommé plutôt qu'un
// rectangle noir, qu'on ne distinguerait pas d'une panne.
function readCamera(participant: Participant): VideoTrackRef | null {
  // On vise explicitement la source `Camera`. Un filtre sur les pistes vidéo
  // attraperait le partage d'écran et le poserait à la place du visage.
  const publication = participant.getTrackPublication(Track.Source.Camera);
  if (publication === undefined) return null;
  if (publication.track === undefined) return null;
  if (publication.isMuted) return null;
  return { participant, publication, source: Track.Source.Camera };
}

// La mémoire des partages. LiveKit n'horodate pas les publications : sans elle,
// « le plus récent gagne » n'a aucun ordre sur lequel s'appuyer.
//
// Alimentée à la LECTURE, jamais sur un événement. Une table remplie par
// `TrackSubscribed` manquerait tout partage déjà en cours à la jonction —
// exactement le piège que ce dépôt a payé deux fois, avec `RoomMetadataChanged`
// puis avec `ParticipantAttributesChanged`. On lit, on n'attend pas.
const screenSince = new Map<string, number>();

function readScreen(participant: Participant): VideoTrackRef | null {
  const publication = participant.getTrackPublication(Track.Source.ScreenShare);
  if (publication === undefined) return null;
  if (publication.track === undefined) return null;
  if (publication.isMuted) return null;
  return { participant, publication, source: Track.Source.ScreenShare };
}

// Rend l'instant de première vue, en l'enregistrant si la piste est inconnue.
function sinceFor(track: VideoTrackRef | null): number | null {
  if (track === null) return null;
  const sid = track.publication.trackSid;
  const known = screenSince.get(sid);
  if (known !== undefined) return known;
  const now = Date.now();
  screenSince.set(sid, now);
  return now;
}

// Purge les pistes disparues. Sans elle, un partage arrêté puis relancé
// reprendrait son ancien instant et perdrait sa priorité de « plus récent ».
function forgetAbsent(present: ReadonlySet<string>): void {
  for (const sid of [...screenSince.keys()]) {
    if (!present.has(sid)) screenSince.delete(sid);
  }
}

function readParticipant(participant: Participant): ParticipantView {
  const screen = readScreen(participant);
  return {
    identity: participant.identity,
    // Le SDK laisse `name` indéfini tant que le jeton n'en porte pas.
    name: participant.name ?? '',
    isLocal: participant.isLocal,
    isSpeaking: participant.isSpeaking,
    lastSpokeAt: participant.lastSpokeAt?.getTime() ?? null,
    joinedAt: participant.joinedAt?.getTime() ?? null,
    camera: readCamera(participant),
    screen,
    screenSince: sinceFor(screen),
    handRaisedAt: readHandRaisedAt(participant.attributes),
  };
}

// Traduit l'état de la Room en valeurs simples. C'est la seule frontière avec
// le SDK : au-delà, `src/call/layout` décide sans rien connaître de LiveKit.
export function readRoomView(room: Room): RoomView {
  const local = readParticipant(room.localParticipant);
  const remotes = Array.from(room.remoteParticipants.values()).map((participant) =>
    readParticipant(participant),
  );

  const present = new Set<string>();
  for (const view of [local, ...remotes]) {
    if (view.screen !== null) present.add(view.screen.publication.trackSid);
  }
  forgetAbsent(present);

  return { local, remotes };
}

// Le contrat de `useSyncExternalStore` : `getSnapshot()` doit rendre la *même*
// valeur tant que rien n'a bougé, sans quoi le rendu boucle.
export type RoomViewStore = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => RoomView;
};

export function createRoomViewStore(room: Room): RoomViewStore {
  const listeners = new Set<() => void>();
  let view: RoomView | null = null;

  // Périmer plutôt que relire : la lecture n'a lieu qu'au prochain
  // `getSnapshot()`, donc une rafale d'événements ne parcourt pas la Room
  // autant de fois qu'elle compte d'événements.
  function invalidate(): void {
    view = null;
    // Copie de la liste : un abonné qui se désabonne en recevant l'avis ne doit
    // pas changer qui reçoit *cet* avis-là.
    for (const listener of Array.from(listeners)) listener();
  }

  return {
    subscribe(onChange: () => void): () => void {
      if (listeners.size === 0) {
        for (const event of ROOM_VIEW_EVENTS) room.on(event, invalidate);
      }
      listeners.add(onChange);

      // Entre la lecture faite pendant le rendu et cette ligne, une piste a pu
      // arriver sans que personne n'écoutât. Périmer ici laisse React comparer
      // la vue d'avant à celle d'après l'abonnement — c'est ce qu'il fait juste
      // après avoir appelé `subscribe` — et rattraper ce trou. Sans cela,
      // l'écran resterait figé jusqu'au prochain événement, qui peut ne jamais
      // venir si la séance se stabilise là.
      view = null;

      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) {
          for (const event of ROOM_VIEW_EVENTS) room.off(event, invalidate);
        }
      };
    },

    getSnapshot(): RoomView {
      if (view === null) view = readRoomView(room);
      return view;
    },
  };
}
