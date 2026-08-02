package com.linagora.twakevisio.segmentation

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.os.SystemClock
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import org.webrtc.VideoFrame
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Ce que l'utilisateur a choisi. `None` est un état, pas une absence. */
sealed interface BackgroundEffect {
  data object None : BackgroundEffect
  data object Blur : BackgroundEffect
  data class Image(val bitmap: Bitmap) : BackgroundEffect
}

/**
 * Le cœur de l'étape 4 : segmenter, puis composer.
 *
 * **La segmentation tourne à BASSE DÉFINITION et le masque est agrandi.** C'est
 * la décision du propriétaire, et la mesure de l'étape 1 la rendait obligatoire :
 * 17,96 ms à 480p mais 26,04 ms à 720p, sur 33,33 ms disponibles par image — et
 * à 720p une image sur vingt dépassait le budget à elle seule. Segmenter en
 * pleine définition ne laissait la place à rien d'autre.
 *
 * Le coût de ce choix est visible au CONTOUR, pas sur le sujet : la personne
 * reste nette, seule la frontière est un peu moins précise. C'est le compromis
 * que fait aussi le client web de la DINUM.
 *
 * `None` court-circuite tout et rend l'image d'origine. Le décorateur reste donc
 * en place en permanence, et activer un effet **ne reconstruit pas la piste** —
 * donc aucune renégociation au milieu d'une réunion.
 */
class EffectFrameProcessor : SegmentingCapturer.FrameProcessor {

  private val effect = AtomicReference<BackgroundEffect>(BackgroundEffect.None)

  // STREAM_MODE : le mode d'un flux, qui réutilise l'état d'une image à
  // l'autre. C'est celui qui a été mesuré à l'étape 1.
  private val segmenter = Segmentation.getClient(
    SelfieSegmenterOptions.Builder()
      .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
      .build(),
  )

  // Réutilisés d'une image à l'autre. Allouer un bitmap par image ferait passer
  // le ramasse-miettes plus souvent que la caméra ne produit d'images.
  private var maskBitmap: Bitmap? = null
  private var frameCount = 0L
  private var totalNanos = 0L

  fun setEffect(next: BackgroundEffect) {
    effect.set(next)
  }

  fun dispose() {
    segmenter.close()
    maskBitmap?.recycle()
    maskBitmap = null
  }

  override fun process(frame: VideoFrame): VideoFrame {
    val current = effect.get()
    // LE chemin rapide, et la raison pour laquelle le décorateur peut rester
    // branché en permanence : aucun effet, aucun travail.
    if (current is BackgroundEffect.None) return frame

    val started = SystemClock.elapsedRealtimeNanos()
    return try {
      val i420 = frame.buffer.toI420() ?: return frame
      try {
        val output = composite(i420, current) ?: return frame
        VideoFrame(output, frame.rotation, frame.timestampNs)
      } finally {
        i420.release()
      }
    } catch (error: Exception) {
      // Une image ratée ne doit JAMAIS interrompre l'appel : on publie
      // l'originale. Le journal dit ce qui s'est passé ; l'interlocuteur voit
      // une image sans effet plutôt qu'un écran noir.
      Log.w(TAG, "composition échouée, image d'origine publiée", error)
      frame
    } finally {
      frameCount += 1
      totalNanos += SystemClock.elapsedRealtimeNanos() - started
      // Une moyenne toutes les 120 images — quatre secondes à 30 i/s. Assez
      // rare pour ne pas peser, assez fréquent pour voir une dérive.
      if (frameCount % 120 == 0L) {
        Log.i(TAG, "coût moyen ${"%.2f".format(totalNanos / frameCount / 1_000_000.0)} ms " +
          "sur $frameCount images")
      }
    }
  }

  private fun composite(
    i420: VideoFrame.I420Buffer,
    current: BackgroundEffect,
  ): VideoFrame.Buffer? {
    val width = i420.width
    val height = i420.height

    // 1. L'image réduite pour MLKit. `SEGMENTATION_WIDTH` est la définition à
    //    laquelle l'étape 1 a mesuré 17,96 ms.
    val scale = SEGMENTATION_WIDTH.toDouble() / width
    val segWidth = SEGMENTATION_WIDTH
    val segHeight = (height * scale).toInt().coerceAtLeast(1)
    val small = FrameConversion.toScaledBitmap(i420, segWidth, segHeight)

    // 2. Le masque, à la définition de l'entrée réduite.
    val mask = Tasks.await(
      segmenter.process(InputImage.fromBitmap(small, 0)),
      SEGMENTATION_TIMEOUT_MS,
      TimeUnit.MILLISECONDS,
    )
    val confidences = mask.buffer
    confidences.rewind()

    // Un bitmap d'alpha : 255 là où la personne est, 0 ailleurs. C'est lui
    // qu'on agrandit — pas le masque flottant, qu'il faudrait interpoler à la
    // main.
    val alphaPixels = IntArray(mask.width * mask.height)
    for (index in alphaPixels.indices) {
      val confidence = confidences.float
      val alpha = (confidence * 255).toInt().coerceIn(0, 255)
      alphaPixels[index] = alpha shl 24
    }
    val maskSmall = Bitmap.createBitmap(alphaPixels, mask.width, mask.height, Bitmap.Config.ARGB_8888)

    // 3. L'image PLEINE, celle qu'on publie.
    val full = FrameConversion.toScaledBitmap(i420, width, height)

    // 4. Le fond : flou de l'image elle-même, ou l'image choisie.
    val background = when (current) {
      is BackgroundEffect.Blur -> cheapBlur(full)
      is BackgroundEffect.Image -> current.bitmap
      BackgroundEffect.None -> return null
    }

    // 5. La composition. `DST_IN` garde la personne là où le masque est opaque ;
    //    le fond est dessiné d'abord, la personne découpée par-dessus. Tout est
    //    fait par `Canvas`, donc en natif — c'est ce qui rend le coût tenable.
    val result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(result)
    val destination = Rect(0, 0, width, height)
    canvas.drawBitmap(background, null, destination, null)

    val cutout = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val cutoutCanvas = Canvas(cutout)
    cutoutCanvas.drawBitmap(full, 0f, 0f, null)
    val maskPaint = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
    cutoutCanvas.drawBitmap(maskSmall, null, destination, maskPaint)
    canvas.drawBitmap(cutout, 0f, 0f, null)

    val buffer = FrameConversion.toI420Buffer(result)

    small.recycle()
    maskSmall.recycle()
    full.recycle()
    cutout.recycle()
    result.recycle()
    if (background !== (current as? BackgroundEffect.Image)?.bitmap) background.recycle()

    return buffer
  }

  /**
   * Un flou par RÉDUCTION puis agrandissement, et non un vrai noyau gaussien.
   *
   * `RenderEffect.createBlurEffect` existe depuis l'API 31 et serait plus beau,
   * mais il s'applique à une vue, pas à un bitmap hors écran. `RenderScript` est
   * déprimé depuis l'API 31. Réduire d'un facteur 12 puis réétirer avec
   * filtrage bilinéaire donne un flou convaincant pour trois opérations
   * natives — et c'est le coût qui gouverne ici, pas la finesse.
   */
  private fun cheapBlur(source: Bitmap): Bitmap {
    val tinyWidth = (source.width / BLUR_FACTOR).coerceAtLeast(1)
    val tinyHeight = (source.height / BLUR_FACTOR).coerceAtLeast(1)
    val tiny = Bitmap.createScaledBitmap(source, tinyWidth, tinyHeight, true)
    val blurred = Bitmap.createScaledBitmap(tiny, source.width, source.height, true)
    tiny.recycle()
    return blurred
  }

  private companion object {
    const val TAG = "TwakeSegEffect"
    // La définition mesurée à l'étape 1 : 17,96 ms de médiane.
    const val SEGMENTATION_WIDTH = 640
    const val SEGMENTATION_TIMEOUT_MS = 200L
    const val BLUR_FACTOR = 12
  }
}
