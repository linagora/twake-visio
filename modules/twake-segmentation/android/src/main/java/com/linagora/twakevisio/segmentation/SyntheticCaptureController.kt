package com.linagora.twakevisio.segmentation

import com.oney.WebRTCModule.AbstractVideoCaptureController
import org.webrtc.VideoCapturer

/**
 * Le contrat que `WebRTCModule.createVideoTrack` attend, rempli au minimum.
 *
 * `AbstractVideoCaptureController` a DEUX méthodes abstraites, et pas une seule
 * comme une première lecture tronquée me l'avait fait écrire :
 * `createVideoCapturer()` (ligne 107) et `getDeviceId()` (ligne 41). Tout le
 * reste porte une implémentation par défaut.
 *
 * `createVideoCapturer()` et non `initializeVideoCapturer()` : la seconde est
 * concrète et se contente d'appeler la première (ligne 37-39). La surcharger
 * marcherait, mais court-circuiterait le point d'extension prévu.
 *
 * C'est ce qui rend l'étape 3 petite : la source vidéo, la piste, le
 * `SurfaceTextureHelper` et l'inscription au registre sont déjà écrits dans
 * `GetUserMediaImpl.java:399-430`. On n'apporte que les images.
 *
 * L'étape 4 remplacera `SolidColorCapturer` par un capteur caméra + MLKit, et
 * **rien d'autre ne changera** : ni cette classe, ni le module, ni le
 * JavaScript. C'est l'intérêt d'avoir prouvé la plomberie séparément.
 */
class SyntheticCaptureController(
  width: Int,
  height: Int,
  fps: Int,
) : AbstractVideoCaptureController(width, height, fps) {

  override fun createVideoCapturer(): VideoCapturer =
    SolidColorCapturer(targetWidth, targetHeight, targetFps)

  // Un identifiant qui ne peut PAS être confondu avec une caméra réelle.
  // `getUserMedia` rend `deviceId` dans les réglages de la piste, et un
  // consommateur qui verrait « 0 » ou « 1 » croirait tenir la caméra frontale.
  override fun getDeviceId(): String = DEVICE_ID

  companion object {
    const val DEVICE_ID = "twake-synthetic"
  }
}
