package com.linagora.twakevisio.segmentation

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import org.webrtc.CapturerObserver
import org.webrtc.JavaI420Buffer
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoFrame
import java.nio.ByteBuffer

/**
 * Un capteur qui produit des images d'une COULEUR UNIE, à cadence fixe.
 *
 * C'est l'étape 3 du chantier « flou d'arrière-plan », et son unique raison
 * d'être est de séparer deux questions que l'on ne saurait pas départager si
 * elles étaient posées ensemble :
 *
 *   1. la plomberie fonctionne-t-elle — une piste fabriquée par nous
 *      atteint-elle bien l'autre participant ?
 *   2. la segmentation fonctionne-t-elle ?
 *
 * Écrites d'un bloc, un écran noir chez le pair ne dirait pas laquelle des deux
 * est en cause. Ici il n'y a NI caméra NI MLKit : si le pair voit un aplat vert,
 * la plomberie est prouvée, et l'étape 4 n'a plus qu'à remplacer la source des
 * images.
 *
 * L'aplat n'est pas figé : sa teinte varie lentement, sur un cycle de quelques
 * secondes. Une couleur strictement constante est indiscernable d'une image
 * GELÉE — le défaut le plus courant d'un capteur mal branché —, et ce dépôt a
 * déjà payé une fois pour avoir pris une sonde muette pour une mesure.
 */
class SolidColorCapturer(
  private val width: Int,
  private val height: Int,
  private val fps: Int,
) : VideoCapturer {
  private var observer: CapturerObserver? = null
  private var thread: HandlerThread? = null
  private var handler: Handler? = null
  private var running = false
  private var startedAtNanos = 0L

  override fun initialize(
    surfaceTextureHelper: SurfaceTextureHelper?,
    context: Context?,
    capturerObserver: CapturerObserver?,
  ) {
    observer = capturerObserver
  }

  override fun startCapture(width: Int, height: Int, framerate: Int) {
    if (running) return
    running = true
    startedAtNanos = System.nanoTime()
    val worker = HandlerThread("TwakeSolidColorCapturer")
    worker.start()
    thread = worker
    handler = Handler(worker.looper)
    observer?.onCapturerStarted(true)
    scheduleNextFrame()
  }

  override fun stopCapture() {
    running = false
    handler?.removeCallbacksAndMessages(null)
    observer?.onCapturerStopped()
    thread?.quitSafely()
    thread = null
    handler = null
  }

  override fun changeCaptureFormat(width: Int, height: Int, framerate: Int) {
    // Rien : ce capteur n'a qu'un format. Le vrai capteur de l'étape 4 en aura
    // plusieurs, et c'est ici qu'il les prendra en compte.
  }

  override fun dispose() {
    stopCapture()
  }

  // `false`, et ce n'est pas anodin : `createVideoTrack` passe cette valeur à
  // `createVideoSource` (`GetUserMediaImpl.java:421`). Un `true` ferait traiter
  // la piste comme un PARTAGE D'ÉCRAN par l'encodeur — cadence et débit réglés
  // pour du texte immobile, pas pour un visage.
  override fun isScreencast(): Boolean = false

  private fun scheduleNextFrame() {
    val periodMs = (1000L / fps).coerceAtLeast(1L)
    handler?.postDelayed({
      if (running) {
        pushFrame()
        scheduleNextFrame()
      }
    }, periodMs)
  }

  /**
   * Une image I420 pleine, poussée à l'observateur.
   *
   * I420 et non RGB : c'est le format que WebRTC encode, et lui donner autre
   * chose imposerait une conversion que le pipeline ferait de toute façon.
   * Y porte la luminance, U et V la chrominance à demi-résolution — d'où les
   * trois tampons de tailles différentes.
   */
  private fun pushFrame() {
    val elapsedSeconds = (System.nanoTime() - startedAtNanos) / 1_000_000_000.0
    // Une teinte qui DÉRIVE, pour qu'une image gelée se voie. Cycle de 6 s.
    val phase = ((elapsedSeconds / 6.0) % 1.0)
    val luma = (110 + 60 * kotlin.math.sin(phase * 2 * Math.PI)).toInt().coerceIn(16, 235)

    val chromaWidth = (width + 1) / 2
    val chromaHeight = (height + 1) / 2
    val yBuffer = ByteBuffer.allocateDirect(width * height)
    val uBuffer = ByteBuffer.allocateDirect(chromaWidth * chromaHeight)
    val vBuffer = ByteBuffer.allocateDirect(chromaWidth * chromaHeight)

    val yByte = luma.toByte()
    for (index in 0 until width * height) yBuffer.put(index, yByte)
    // U bas et V bas donnent un vert franc — la couleur la moins ambiguë à
    // reconnaître sur un écran, et celle qu'aucune caméra ne produirait par
    // accident sur un mur.
    for (index in 0 until chromaWidth * chromaHeight) {
      uBuffer.put(index, 60.toByte())
      vBuffer.put(index, 60.toByte())
    }

    val buffer = JavaI420Buffer.wrap(
      width,
      height,
      yBuffer,
      width,
      uBuffer,
      chromaWidth,
      vBuffer,
      chromaWidth,
      null,
    )
    val frame = VideoFrame(buffer, 0, SystemClock.elapsedRealtimeNanos())
    observer?.onFrameCaptured(frame)
    frame.release()
  }
}
