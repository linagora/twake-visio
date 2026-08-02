package com.linagora.twakevisio.segmentation

import android.content.Context
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReadableMap
import com.oney.WebRTCModule.CameraCaptureController
import org.webrtc.CameraEnumerator
import org.webrtc.VideoCapturer

/**
 * La caméra de WebRTC, avec un effet interposé.
 *
 * **Toute la gestion caméra est HÉRITÉE** — énumération des objectifs, choix du
 * format le plus proche, face avant/arrière, reprise après une interruption
 * système. `CameraCaptureController` fait déjà tout cela, et c'est ce qui aurait
 * représenté le vrai coût de ce chantier si on l'avait réécrit.
 *
 * On ne surcharge que `createVideoCapturer()`, pour envelopper le capteur que la
 * classe mère a construit. Six lignes utiles.
 */
class EffectCaptureController(
  context: Context,
  cameraEnumerator: CameraEnumerator,
  constraints: ReadableMap,
  private val processor: EffectFrameProcessor,
) : CameraCaptureController(context, cameraEnumerator, constraints) {

  override fun createVideoCapturer(): VideoCapturer? {
    // `super` peut rendre `null` — aucune caméra utilisable. On propage plutôt
    // que d'envelopper un néant : `createVideoTrack` sait traiter le `null`,
    // un décorateur autour de rien planterait à la première image.
    val camera = super.createVideoCapturer() ?: return null
    return SegmentingCapturer(camera, processor)
  }

  companion object {
    /**
     * Les contraintes que la classe mère lit, sous la forme qu'elle attend.
     *
     * Elle appelle `constraints.getInt("width")` **dans son constructeur**, avant
     * toute validation : une clé manquante y lève, et le message ne nommerait
     * ni la caméra ni l'effet. D'où cette fabrique plutôt qu'une carte montée à
     * la main sur les sites d'appel.
     */
    fun constraintsOf(width: Int, height: Int, fps: Int, facingMode: String): ReadableMap =
      Arguments.createMap().apply {
        putInt("width", width)
        putInt("height", height)
        putInt("frameRate", fps)
        putString("facingMode", facingMode)
      }
  }
}
