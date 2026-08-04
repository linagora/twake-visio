import { MediaStream, MediaStreamTrack } from '@livekit/react-native-webrtc';
import { Track, type Room } from 'livekit-client';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useEffect, useState } from 'react';

// `'user'` ou `'environment'`, le vocabulaire de `getUserMedia` — celui que le
// contrôleur natif attend, et non le `'front'`/`'back'` d'AndroidX.
type FacingMode = 'user' | 'environment';

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

/**
 * Rechange d'objectif SANS perdre l'effet.
 *
 * **`switchActiveDevice` de LiveKit ne peut pas servir ici, et c'est mesuré :**
 * il remplace la piste publiée par une piste qu'il fabrique lui-même, où le
 * décorateur de segmentation n'est pas. Le propriétaire est passé en caméra
 * arrière, est revenu à l'avant, et son fond avait disparu — sans possibilité
 * d'en remettre un, puisque `setEffect` pilote un processeur dont plus aucune
 * piste publiée ne dépendait.
 *
 * On dépublie donc, et on republie une piste à effet sur le bon objectif. Le
 * fond, lui, n'a pas à être redemandé : le processeur natif est unique et garde
 * le dernier `setEffect`.
 *
 * `stopOnUnpublish` à `true` : sans lui la caméra précédente reste ACQUISE,
 * témoin allumé, et deux objectifs ouverts en même temps se disputent le
 * capteur sur certains appareils.
 */
export async function republishEffectCamera(
  room: Room,
  facingMode: FacingMode,
): Promise<MediaStreamTrack | null> {
  if (nativeModule === null) return null;
  const publication = room.localParticipant.getTrackPublication(Track.Source.Camera);
  const published = publication?.track;
  if (published !== undefined && published !== null) {
    await room.localParticipant.unpublishTrack(published, true);
  }
  return publishEffectCamera(room, 640, 480, 30, facingMode);
}

/**
 * L'aperçu du pré-join, alimenté par la piste À EFFET.
 *
 * Sans ceci, l'aperçu passait par `getUserMedia` et ne montrait donc AUCUN
 * effet : on choisissait un fond sans le voir. Le panneau existait, le natif
 * recevait bien `setEffect`, et pas une image ne traversait le décorateur —
 * un défaut invisible à la lecture, trouvé en pilotant l'application.
 *
 * Rend l'URL du flux à passer à `RTCView`, ou `null` — natif absent, caméra
 * coupée, ou acquisition en cours.
 */
export function createEffectPreviewStream(track: MediaStreamTrack): {
  readonly url: string;
  readonly stop: () => void;
} {
  const stream = new MediaStream([track]);
  return {
    url: stream.toURL(),
    // La piste est arrêtée explicitement : une caméra acquise et jamais
    // relâchée reste ALLUMÉE, témoin compris, après qu'on a quitté l'écran.
    // C'est le risque que `cameraPreview.ts` documente déjà.
    stop: () => {
      track.stop();
    },
  };
}

/**
 * L'aperçu du pré-join, à effet, avec son CYCLE DE VIE.
 *
 * Même exigence que `useCameraPreview`, et pour la même raison : une caméra
 * acquise et jamais relâchée reste allumée, témoin compris, après qu'on a
 * quitté l'écran — et cela ne se voit sur aucune capture.
 *
 * Le cas qui fuit est l'asynchrone : quitter l'écran pendant que
 * `createCameraTrack` résout laisserait une piste vivante que plus personne ne
 * référence. Le nettoyage ne peut pas l'arrêter, il ne la connaît pas encore ;
 * c'est donc la résolution elle-même qui doit le faire.
 */
export function useEffectCameraPreview(enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || nativeModule === null) return;
    let cancelled = false;
    let acquired: { stop: () => void } | null = null;

    createEffectCameraTrack()
      .then((track) => {
        if (track === null) return;
        const preview = createEffectPreviewStream(track);
        if (cancelled) {
          preview.stop();
          return;
        }
        acquired = preview;
        setUrl(preview.url);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
      acquired?.stop();
      setUrl(null);
    };
  }, [enabled]);

  return url;
}

/** La piste caméra à effet, SANS publication — pour l'aperçu. */
export async function createEffectCameraTrack(
  width = 640,
  height = 480,
  fps = 30,
  facingMode = 'user',
): Promise<MediaStreamTrack | null> {
  if (nativeModule === null) return null;
  const descriptor = await nativeModule.createCameraTrack(width, height, fps, facingMode);
  return new MediaStreamTrack({
    ...descriptor,
    constraints: {},
    settings: { deviceId: descriptor.deviceId, frameRate: fps, height, width },
  });
}
