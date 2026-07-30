import { Track } from 'livekit-client';
import type { Room } from 'livekit-client';

export type FacingMode = 'user' | 'environment';

export async function setMicrophoneEnabled(room: Room, enabled: boolean): Promise<void> {
  await room.localParticipant.setMicrophoneEnabled(enabled);
}

export async function setCameraEnabled(room: Room, enabled: boolean): Promise<void> {
  await room.localParticipant.setCameraEnabled(enabled);
}

// Bascule réellement d'une face à l'autre et renvoie la face obtenue. Le SDK
// n'expose pas la face courante, c'est donc à l'appelant de la conserver.
export async function switchCamera(room: Room, current: FacingMode): Promise<FacingMode> {
  // On vise explicitement la source `Camera`. Un filtre sur les pistes vidéo
  // attraperait le partage d'écran, et lui appliquer une contrainte de face
  // remplacerait l'écran partagé par le visage de la personne devant tout le
  // monde. `getTrackPublication` est aussi la seule voie typée : la surcharge
  // de `LocalParticipant` rend une `LocalTrackPublication`, dont la piste
  // expose `restartTrack` — ce que le `TrackPublication` générique ne fait pas.
  const track = room.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
  if (track === undefined) return current;

  const next: FacingMode = current === 'user' ? 'environment' : 'user';
  await track.restartTrack({ facingMode: next });
  return next;
}
