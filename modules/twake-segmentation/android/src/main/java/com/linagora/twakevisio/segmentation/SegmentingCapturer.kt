package com.linagora.twakevisio.segmentation

import android.content.Context
import org.webrtc.CapturerObserver
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoFrame

/**
 * Un capteur qui en ENVELOPPE un autre et traite chaque image au passage.
 *
 * Le décorateur est la seule façon de ne pas réécrire la caméra. `Camera2Capturer`
 * de WebRTC gère l'énumération, le choix du format, la rotation, la bascule
 * avant/arrière et la reprise après interruption — tout cela est déjà là, et
 * réimplémenté à la main ce serait le vrai coût de ce chantier, pas la
 * segmentation.
 *
 * Ce qu'on interpose est minuscule : `initialize()` reçoit l'observateur de
 * WebRTC, et on lui donne le NÔTRE. Chaque image passe alors par
 * `frameProcessor` avant d'atteindre la source vidéo.
 *
 * **Le processeur peut rendre l'image d'origine**, et c'est le mode « aucun
 * effet » : le décorateur reste en place, ne coûte qu'un appel de fonction, et
 * activer le flou ne demande plus de reconstruire la piste — donc pas de
 * renégociation avec le serveur au milieu d'une réunion. C'est ce qui rend
 * tenable l'exigence « réglable en séance ».
 */
class SegmentingCapturer(
  private val delegate: VideoCapturer,
  private val frameProcessor: FrameProcessor,
) : VideoCapturer by delegate {

  /** Ce qu'un effet doit savoir faire : rendre une image, à partir d'une image. */
  fun interface FrameProcessor {
    /**
     * Rend l'image à publier. Peut rendre `frame` telle quelle.
     *
     * **Qui relâche quoi**, parce que s'y tromper plante l'encodeur et non le
     * traitement — donc le symptôme ne désignerait pas la cause :
     *
     * - `frame` appartient au capteur délégué, qui la relâche au retour de
     *   `onFrameCaptured`. **Le processeur ne doit jamais la relâcher.**
     * - une image NEUVE rendue par le processeur est relâchée par le
     *   décorateur, après transmission.
     */
    fun process(frame: VideoFrame): VideoFrame
  }

  override fun initialize(
    surfaceTextureHelper: SurfaceTextureHelper?,
    context: Context?,
    capturerObserver: CapturerObserver?,
  ) {
    // L'observateur qu'on donne au délégué n'est pas celui de WebRTC : c'est le
    // nôtre, qui traite puis transmet. Tout le reste de l'interface est délégué
    // par `by delegate` — c'est la seule méthode qu'il fallait détourner.
    delegate.initialize(surfaceTextureHelper, context, ProcessingObserver(capturerObserver))
  }

  private inner class ProcessingObserver(
    private val downstream: CapturerObserver?,
  ) : CapturerObserver {
    override fun onCapturerStarted(success: Boolean) {
      downstream?.onCapturerStarted(success)
    }

    override fun onCapturerStopped() {
      downstream?.onCapturerStopped()
    }

    override fun onFrameCaptured(frame: VideoFrame) {
      val processed = frameProcessor.process(frame)
      downstream?.onFrameCaptured(processed)
      // On ne relâche QUE ce qu'on a créé. `frame` appartient au capteur
      // délégué, qui la relâche au retour de cette méthode : la relâcher ici
      // aussi ferait tomber son compteur de références sous zéro.
      if (processed !== frame) processed.release()
    }
  }
}
