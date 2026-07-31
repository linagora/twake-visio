import { mediaDevices } from '@livekit/react-native-webrtc';
import type { Room } from 'livekit-client';

import { readCameras, type CameraChoice } from 'src/call/devices';

export type FacingMode = 'user' | 'environment';

export async function setMicrophoneEnabled(room: Room, enabled: boolean): Promise<void> {
  await room.localParticipant.setMicrophoneEnabled(enabled);
}

export async function setCameraEnabled(room: Room, enabled: boolean): Promise<void> {
  await room.localParticipant.setCameraEnabled(enabled);
}

// Passe par `mediaDevices.enumerateDevices()`, jamais par
// `Room.getLocalDevices` : celui-ci acquiert `getUserMedia` dès que sa liste
// filtrée est vide, ce qui allume le micro pour rien. N'est appelé qu'après
// `ensureMediaPermissions()`, donc avec la permission caméra déjà accordée —
// la barre de contrôle n'est rendue qu'à l'état `connected`.
export async function listCameras(): Promise<readonly CameraChoice[]> {
  return readCameras(await mediaDevices.enumerateDevices());
}

// Rend le booléen de `switchActiveDevice`. Il ne vaut vérification que si une
// piste caméra est publiée : caméra éteinte, `Promise.all([]).every(…)` rend
// `true` sans rien prouver, et seule la préférence est enregistrée dans
// `options.videoCaptureDefaults.deviceId` pour le prochain allumage. Caméra
// allumée, `false` dit qu'Android est retombé sur son repli `facingMode`.
//
// Peut aussi rejeter, après avoir restauré le `deviceId` précédent : deux
// canaux d'échec, les deux rendus à l'appelant tels quels.
export async function selectCamera(room: Room, deviceId: string): Promise<boolean> {
  return room.switchActiveDevice('videoinput', deviceId);
}

// Fiable en React Native, contrairement à son homologue audio : `activeDeviceMap`
// est alimentée à chaque publication et à chaque redémarrage de piste depuis
// `getSettings().deviceId`, qui dit la caméra réellement en service — y compris
// quand le repli `facingMode` d'Android a joué. Aucune API équivalente
// n'existe pour la sortie audio.
export function readActiveCameraId(room: Room): string | null {
  return room.getActiveDevice('videoinput') ?? null;
}
