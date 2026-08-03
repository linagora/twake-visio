package com.linagora.twakevisio.segmentation

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
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

  // Une instance par processeur : elle garde des tampons, et deux capteurs
  // simultanés qui les partageraient produiraient des images entrelacées.
  private val conversion = FrameConversion()

  // Réutilisés d'une image à l'autre. Allouer un bitmap par image ferait passer
  // le ramasse-miettes plus souvent que la caméra ne produit d'images.
  private var maskBitmap: Bitmap? = null
  private var confidenceScratch = FloatArray(0)
  private var alphaScratch = IntArray(0)
  private var frameCount = 0L
  private var totalNanos = 0L

  // Le coût de chaque étape, cumulé. Une moyenne globale ne dit PAS où passe le
  // temps : elle a coûté une correction inutile. libyuv sur la conversion de
  // sortie devait rendre 40 ms d'après mon estimation ; la mesure en a rendu 15.
  // L'estimation portait sur une répartition jamais mesurée.
  private var convNanos = 0L
  private var segNanos = 0L
  private var maskNanos = 0L
  private var bgNanos = 0L
  private var compNanos = 0L
  private var outNanos = 0L

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
        val output = composite(i420, current, frame.rotation) ?: return frame
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
        Log.i(
          TAG,
          "détail — conv:${avg(convNanos)} seg:${avg(segNanos)} masque:${avg(maskNanos)} " +
            "fond:${avg(bgNanos)} compo:${avg(compNanos)} sortie:${avg(outNanos)}",
        )
      }
    }
  }

  private fun composite(
    i420: VideoFrame.I420Buffer,
    current: BackgroundEffect,
    rotation: Int,
  ): VideoFrame.Buffer? {
    val width = i420.width
    val height = i420.height

    // 1. L'image réduite pour MLKit. `SEGMENTATION_WIDTH` est la définition à
    //    laquelle l'étape 1 a mesuré 17,96 ms.
    //
    // **Et la même image sert à la composition quand les tailles coïncident.**
    // La capture est en 640x480 et `SEGMENTATION_WIDTH` vaut 640 : les deux
    // appels convertissaient donc les MÊMES 307 200 pixels, deux fois par image,
    // par la boucle Kotlin la plus chère du fichier. Le second était invisible à
    // la lecture parce que les deux lignes sont éloignées de quarante lignes et
    // que leurs variables portent des noms qui suggèrent des tailles
    // différentes.
    val conversionStart = SystemClock.elapsedRealtimeNanos()
    val scale = SEGMENTATION_WIDTH.toDouble() / width
    val segWidth = SEGMENTATION_WIDTH.coerceAtMost(width)
    val segHeight = if (segWidth == width) height else (height * scale).toInt().coerceAtLeast(1)
    val small = conversion.toScaledBitmap(i420, segWidth, segHeight)
    val sameSize = segWidth == width && segHeight == height
    val full = if (sameSize) small else conversion.toScaledBitmap(i420, width, height)
    convNanos += SystemClock.elapsedRealtimeNanos() - conversionStart

    // 2. Le masque, à la définition de l'entrée réduite.
    val segmentationStart = SystemClock.elapsedRealtimeNanos()
    val mask = Tasks.await(
      segmenter.process(InputImage.fromBitmap(small, 0)),
      SEGMENTATION_TIMEOUT_MS,
      TimeUnit.MILLISECONDS,
    )
    segNanos += SystemClock.elapsedRealtimeNanos() - segmentationStart
    val maskStart = SystemClock.elapsedRealtimeNanos()
    val confidences = mask.buffer
    confidences.rewind()

    // Un bitmap d'alpha : 255 là où la personne est, 0 ailleurs. C'est lui
    // qu'on agrandit — pas le masque flottant, qu'il faudrait interpoler à la
    // main.
    // Les confiances lues en UN SEUL bloc, pas flottant par flottant.
    //
    // `confidences.float` traverse une barrière de bornes à chaque appel, et il
    // y en a un par pixel : 307 200 pour une image 640x480, mesurés à 14,8 ms
    // avec la construction du bitmap. `asFloatBuffer().get(tableau)` est un
    // `memcpy`, après quoi la boucle ne touche que des tableaux.
    val pixelCount = mask.width * mask.height
    if (confidenceScratch.size < pixelCount) confidenceScratch = FloatArray(pixelCount)
    if (alphaScratch.size < pixelCount) alphaScratch = IntArray(pixelCount)
    confidences.asFloatBuffer().get(confidenceScratch, 0, pixelCount)
    val alphaPixels = alphaScratch
    for (index in 0 until pixelCount) {
      val confidence = confidenceScratch[index]
      // La confiance brute NE PEUT PAS servir d'alpha telle quelle, et c'est le
      // défaut qui rendait le sujet translucide : MLKit rend souvent 0,6 ou 0,8
      // à l'INTÉRIEUR de la personne, pas 1. « Probablement une personne »
      // devenait donc « à moitié transparente ».
      //
      // On durcit : opaque au-dessus du seuil haut, transparent en dessous du
      // seuil bas, et une rampe entre les deux. La rampe est ce qui garde un
      // bord doux plutôt qu'un découpage à l'emporte-pièce — c'est elle qui
      // évite l'aspect « autocollant » d'un masque binaire.
      val alpha = when {
        confidence >= OPAQUE_ABOVE -> 255
        confidence <= CLEAR_BELOW -> 0
        else -> (((confidence - CLEAR_BELOW) / (OPAQUE_ABOVE - CLEAR_BELOW)) * 255).toInt()
      }
      alphaPixels[index] = alpha.coerceIn(0, 255) shl 24
    }
    // `setPixels` sur un bitmap neuf plutôt que `createBitmap(tableau, …)` : ce
    // dernier exige un tableau de la taille EXACTE, ce qui interdirait de
    // réutiliser un tampon dimensionné une fois pour toutes.
    val maskSmall = Bitmap.createBitmap(mask.width, mask.height, Bitmap.Config.ARGB_8888)
    maskSmall.setPixels(alphaPixels, 0, mask.width, 0, 0, mask.width, mask.height)
    maskNanos += SystemClock.elapsedRealtimeNanos() - maskStart

    // 3. Le fond : flou de l'image elle-même, ou l'image choisie.
    val backgroundStart = SystemClock.elapsedRealtimeNanos()
    val background = when (current) {
      is BackgroundEffect.Blur -> cheapBlur(full)
      // PIVOTÉ, et c'est le défaut que le propriétaire a vu : la composition se
      // fait dans l'orientation NATIVE du capteur — 640x480 paysage — puis
      // `VideoFrame(…, rotation, …)` fait pivoter le tout à l'affichage. Un
      // fond dessiné tel quel arrivait donc couché. Le pivoter à contresens ici
      // le redresse une fois la rotation d'affichage appliquée.
      //
      // La personne, elle, n'a jamais eu ce problème : elle vient de la même
      // image paysage et subit la même rotation.
      is BackgroundEffect.Image -> orientToFrame(current.bitmap, width, height, rotation)
      BackgroundEffect.None -> return null
    }
    bgNanos += SystemClock.elapsedRealtimeNanos() - backgroundStart

    // 4. La composition. `DST_IN` garde la personne là où le masque est opaque ;
    //    le fond est dessiné d'abord, la personne découpée par-dessus. Tout est
    //    fait par `Canvas`, donc en natif — c'est ce qui rend le coût tenable.
    val compositionStart = SystemClock.elapsedRealtimeNanos()
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
    compNanos += SystemClock.elapsedRealtimeNanos() - compositionStart

    val outputStart = SystemClock.elapsedRealtimeNanos()
    val buffer = conversion.toI420Buffer(result)
    outNanos += SystemClock.elapsedRealtimeNanos() - outputStart

    small.recycle()
    maskSmall.recycle()
    // `full` peut ÊTRE `small` — les recycler tous deux relâcherait deux fois le
    // même bitmap. Inoffensif aujourd'hui, mais c'est exactement le genre
    // d'alias qui devient un plantage le jour où quelqu'un lit le bitmap après.
    if (!sameSize) full.recycle()
    cutout.recycle()
    result.recycle()
    // `orientToFrame` et `cheapBlur` rendent tous deux une COPIE : on relâche
    // toujours, et jamais le bitmap d'origine gardé en cache.
    background.recycle()

    return buffer
  }

  /**
   * Redresse et cadre un fond pour la composition.
   *
   * Deux opérations, dans cet ordre : pivoter de `-rotation` pour annuler la
   * rotation que l'affichage appliquera, puis RECADRER en conservant les
   * proportions. Un `drawBitmap` sur un rectangle plein étirerait l'image —
   * c'est ce que faisait la version précédente, et sur une vignette 107x60
   * étirée en 640x480 le résultat était méconnaissable.
   */
  private fun orientToFrame(source: Bitmap, width: Int, height: Int, rotation: Int): Bitmap {

    // Recadrage « couvrir », sur le rapport de l'image AFFICHÉE — pas celui du
    // tampon.
    //
    // Le tampon est en 640x480 paysage, mais la rotation de 90° le présente en
    // 480x640 portrait. Découper sur 640/480 revenait à cadrer pour un écran
    // couché : on prenait une bande horizontale du fond redressé, d'où l'effet
    // de zoom que le propriétaire a signalé.
    //
    // Une rotation de 90 ou 270 ÉCHANGE les côtés vus. C'est ce rapport-là qu'il
    // faut viser.
    val swapped = rotation % 180 != 0
    val displayWidth = if (swapped) height else width
    val displayHeight = if (swapped) width else height
    val targetRatio = displayWidth.toFloat() / displayHeight
    val sourceRatio = source.width.toFloat() / source.height
    val cropWidth: Int
    val cropHeight: Int
    if (sourceRatio > targetRatio) {
      cropHeight = source.height
      cropWidth = (cropHeight * targetRatio).toInt().coerceAtMost(source.width)
    } else {
      cropWidth = source.width
      cropHeight = (cropWidth / targetRatio).toInt().coerceAtMost(source.height)
    }
    // On découpe d'ABORD, à la bonne proportion d'affichage, PUIS on redresse.
    // L'ordre inverse — redresser puis découper — cadrait sur une image déjà
    // pivotée et reprenait le mauvais rapport.
    val cropped = Bitmap.createBitmap(
      source,
      (source.width - cropWidth) / 2,
      (source.height - cropHeight) / 2,
      cropWidth,
      cropHeight,
    )
    val matrix = Matrix().apply { postRotate(-rotation.toFloat()) }
    val upright = if (rotation % 360 == 0) cropped else Bitmap.createBitmap(
      cropped, 0, 0, cropped.width, cropped.height, matrix, true,
    )
    val scaled = Bitmap.createScaledBitmap(upright, width, height, true)
    if (upright !== cropped) upright.recycle()
    if (cropped !== source) cropped.recycle()
    return scaled
  }

  /**
   * Un flou par réductions et agrandissements SUCCESSIFS.
   *
   * La version précédente réduisait d'un coup d'un facteur 12 puis réétirait :
   * le résultat n'était pas un flou, c'étaient de gros carrés. Le propriétaire
   * l'a vu immédiatement sur appareil, et le commentaire qui promettait « un
   * flou convaincant » était faux.
   *
   * La correction tient à l'arithmétique du filtrage bilinéaire : il n'échantillonne
   * que les QUATRE voisins immédiats. Réduire d'un facteur 12 en une passe jette
   * donc 143 pixels sur 144 sans les moyenner — d'où les blocs. Enchaîner des
   * réductions de moitié fait entrer chaque pixel dans la moyenne à chaque
   * passe, ce qui approche un vrai noyau gaussien.
   *
   * Quatre allers-retours de moitié coûtent quelques opérations natives, là où
   * un noyau gaussien à la main coûterait la surface de l'image par le carré du
   * rayon.
   */
  private fun cheapBlur(source: Bitmap): Bitmap {
    var current = source
    var owned = false
    // Descente : quatre passes de moitié, soit un seizième de la définition.
    repeat(BLUR_PASSES) {
      val next = Bitmap.createScaledBitmap(
        current,
        (current.width / 2).coerceAtLeast(1),
        (current.height / 2).coerceAtLeast(1),
        true,
      )
      if (owned) current.recycle()
      current = next
      owned = true
    }
    // Remontée : on repasse par les mêmes paliers plutôt que d'étirer d'un
    // coup. Chaque palier remoyenne, et c'est ce qui efface les arêtes.
    repeat(BLUR_PASSES) {
      val next = Bitmap.createScaledBitmap(
        current,
        (current.width * 2).coerceAtMost(source.width),
        (current.height * 2).coerceAtMost(source.height),
        true,
      )
      current.recycle()
      current = next
    }
    return if (current.width == source.width && current.height == source.height) {
      current
    } else {
      val exact = Bitmap.createScaledBitmap(current, source.width, source.height, true)
      current.recycle()
      exact
    }
  }

  /** La moyenne d'une étape, en millisecondes, sur les images déjà traitées. */
  private fun avg(nanos: Long): String =
    if (frameCount == 0L) "—" else "%.1f".format(nanos / frameCount / 1_000_000.0)

  private companion object {
    const val TAG = "TwakeSegEffect"
    // La définition mesurée à l'étape 1 : 17,96 ms de médiane.
    const val SEGMENTATION_WIDTH = 640
    const val SEGMENTATION_TIMEOUT_MS = 200L
    // Quatre passes de moitié : un seizième de la définition, atteint par
    // moyennes successives plutôt que d'un seul saut.
    const val BLUR_PASSES = 4
    // Au-dessus : franchement la personne. En dessous : franchement le fond.
    // Entre les deux, une rampe de 0,25 de large, qui fait le bord doux.
    const val OPAQUE_ABOVE = 0.55f
    const val CLEAR_BELOW = 0.30f
  }
}
