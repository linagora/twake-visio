import { MediaStreamTrack } from '@livekit/react-native-webrtc';
import type { Room } from 'livekit-client';
import { requireOptionalNativeModule } from 'expo-modules-core';

// ÉTAPE 3 du chantier « flou d'arrière-plan » : la PLOMBERIE, prouvée seule.
//
// Ce module publie une piste que l'application a fabriquée elle-même, sans
// caméra et sans segmentation. Si un pair voit un aplat vert qui dérive, alors
// la chaîne complète est prouvée :
//
//   capteur natif → VideoSource → VideoTrack → descripteur → MediaStreamTrack
//   → publishTrack → l'autre participant
//
// L'étape 4 ne changera que le premier maillon. Écrire les deux d'un bloc
// rendrait un écran noir chez le pair indéchiffrable : segmentation en panne,
// ou plomberie en panne ?

// Le contrat COMPLET de `MediaStreamTrackInfo` (`MediaStreamTrack.ts:15-24`),
// et non les six champs que j'avais relevés d'abord : `constraints` et
// `settings` en font partie. C'est `tsc` qui l'a dit, pas une relecture — et
// c'est la deuxième fois sur ce chantier qu'une lecture partielle produit une
// affirmation fausse.
//
// Les deux sont des objets libres. `settings` est ce que rendrait
// `track.getSettings()` : on y met la définition réelle, seule chose qu'un
// consommateur puisse vouloir en lire.
export type SyntheticTrackDescriptor = {
  readonly id: string;
  readonly kind: string;
  readonly enabled: boolean;
  readonly readyState: 'live' | 'ended';
  readonly remote: boolean;
  readonly peerConnectionId: number;
  readonly deviceId: string;
};

type NativeSegmentationModule = {
  createSyntheticTrack: (
    width: number,
    height: number,
    fps: number,
  ) => Promise<SyntheticTrackDescriptor>;
};

const nativeModule = requireOptionalNativeModule<NativeSegmentationModule>('TwakeSegmentation');

// `null` quand le module natif est absent — iOS, et Jest. JAMAIS une piste
// factice : un objet qui ressemble à une piste sans en être une échouerait plus
// loin, à la publication, sur un message qui ne nommerait pas la cause.
export function isSyntheticTrackSupported(): boolean {
  return nativeModule !== null;
}

/**
 * Fabrique la piste côté natif et la reconstruit côté JavaScript.
 *
 * **Le fait qui rend tout cela possible** : une `MediaStreamTrack` de
 * `react-native-webrtc` n'est pas un objet natif, c'est un IDENTIFIANT plus
 * quelques champs (`MediaStreamTrack.ts:54`). La construire depuis un
 * descripteur est donc légitime, pas un détournement — c'est exactement ce que
 * fait `getUserMedia`, qui reçoit le même descripteur par le pont.
 */
export async function createSyntheticTrack(
  width = 640,
  height = 480,
  fps = 30,
): Promise<MediaStreamTrack | null> {
  if (nativeModule === null) return null;
  const descriptor = await nativeModule.createSyntheticTrack(width, height, fps);
  return new MediaStreamTrack({
    ...descriptor,
    // Aucune contrainte : la piste n'a pas été négociée, elle a été fabriquée.
    constraints: {},
    settings: {
      deviceId: descriptor.deviceId,
      frameRate: fps,
      height,
      width,
    },
  });
}

/**
 * Publie la piste dans la séance en cours.
 *
 * `publishTrack` accepte une `MediaStreamTrack` brute — `LocalTrack |
 * MediaStreamTrack` (`LocalParticipant.d.ts:132`) —, donc rien à envelopper.
 *
 * `simulcast: false` : notre source ne produit qu'une définition, et laisser
 * LiveKit en dériver trois ferait encoder deux flux que personne ne demandera.
 * Ce sera à revoir à l'étape 4, quand la source sera une vraie caméra.
 */
export async function publishSyntheticTrack(room: Room, track: MediaStreamTrack): Promise<void> {
  await room.localParticipant.publishTrack(track as never, { simulcast: false });
}
