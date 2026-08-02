import { MediaStreamTrack } from '@livekit/react-native-webrtc';
import { Track, type Room } from 'livekit-client';
import { requireOptionalNativeModule } from 'expo-modules-core';

// Les effets d'arrière-plan : flou et fonds virtuels.
//
// Ce module est la SEULE porte entre l'application et le natif. Les écrans
// n'appellent jamais le module natif directement — ils ne savent pas qu'il peut
// être absent, et c'est ce fichier qui répond `null` à leur place.

export type BackgroundEffect =
  | { readonly kind: 'none' }
  | { readonly kind: 'blur' }
  // 1 à 8, l'index du fond DINUM embarqué dans le module natif.
  | { readonly kind: 'image'; readonly index: number };

type NativeModule = {
  createCameraTrack: (
    width: number,
    height: number,
    fps: number,
    facingMode: string,
  ) => Promise<{
    id: string;
    kind: string;
    enabled: boolean;
    readyState: 'live' | 'ended';
    remote: boolean;
    peerConnectionId: number;
    deviceId: string;
  }>;
  setEffect: (kind: string, backgroundIndex: number) => void;
  backgroundCount: () => number;
};

const nativeModule = requireOptionalNativeModule<NativeModule>('TwakeSegmentation');

// iOS n'a pas ce module : le pendant Vision reste à écrire. Les écrans
// n'affichent donc AUCUN panneau d'effets là-bas — une commande qu'on ne peut
// pas honorer coûte plus cher que son absence.
export function areEffectsSupported(): boolean {
  return nativeModule !== null;
}

export function backgroundCount(): number {
  return nativeModule?.backgroundCount() ?? 0;
}

/**
 * Applique l'effet SANS toucher à la piste.
 *
 * C'est le point qui rend le réglage possible en pleine séance : le décorateur
 * natif reste branché en permanence et se contente de changer de mode. Aucune
 * piste reconstruite, donc aucune renégociation avec le serveur, aucune
 * coupure de vidéo chez les autres participants.
 */
export function applyEffect(effect: BackgroundEffect): void {
  if (nativeModule === null) return;
  nativeModule.setEffect(effect.kind, effect.kind === 'image' ? effect.index : 0);
}

/**
 * Crée la piste caméra qui porte l'effet, et la publie.
 *
 * `source: Track.Source.Camera` n'est PAS optionnel en pratique : sans lui le
 * serveur refuse la publication — `insufficient permissions` —, parce qu'une
 * piste brute n'annonce aucune source et que le jeton n'autorise que des
 * sources nommées. Mesuré à l'étape 3, pas déduit des types, où le champ est
 * marqué facultatif.
 */
export async function publishEffectCamera(
  room: Room,
  width = 640,
  height = 480,
  fps = 30,
  facingMode = 'user',
): Promise<MediaStreamTrack | null> {
  if (nativeModule === null) return null;
  const descriptor = await nativeModule.createCameraTrack(width, height, fps, facingMode);
  const track = new MediaStreamTrack({
    ...descriptor,
    constraints: {},
    settings: { deviceId: descriptor.deviceId, frameRate: fps, height, width },
  });
  await room.localParticipant.publishTrack(track as never, {
    simulcast: false,
    source: Track.Source.Camera,
  });
  return track;
}
