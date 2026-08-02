package com.linagora.twakevisio.segmentation

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.os.SystemClock
import android.util.Log
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.Segmentation
import com.google.mlkit.vision.segmentation.SegmentationMask
import com.google.mlkit.vision.segmentation.Segmenter
import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions
import com.facebook.react.bridge.ReactApplicationContext
import com.google.android.gms.tasks.Tasks
import com.oney.WebRTCModule.WebRTCModule
import org.webrtc.VideoTrack
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.TimeUnit

private const val TAG = "TwakeSegBench"

/**
 * MESURE, et rien d'autre. Ce module ne participe à aucune fonctionnalité : il
 * répond à l'étape 1 de `docs/superpowers/specs/2026-08-02-background-effects-feasibility.md`,
 * qui décide si le chantier du flou vit ou meurt.
 *
 * > Sous ~24 images par seconde, on s'arrête. Un détourage à 8 i/s est pire
 * > qu'aucun détourage.
 *
 * Il ne touche NI la caméra NI WebRTC, et c'est délibéré : la même spec exige
 * que la segmentation soit mesurée AVANT que la plomberie soit écrite, sinon un
 * échec ne dit pas laquelle des deux moitiés est en cause.
 *
 * **Ce que ce chiffre vaut, et ce qu'il ne vaut pas.** Il mesure l'inférence sur
 * un `Bitmap` ARGB synthétique. Un vrai pipeline vidéo alimente
 * `InputImage.fromMediaImage` en YUV, dont le coût de conversion diffère — donc
 * le chiffre rendu ici est un PLANCHER, jamais un plafond. S'il est déjà trop
 * lent, la vraie chaîne le sera davantage, et la conclusion tient. S'il est
 * rapide, il reste à confirmer sur des images de caméra.
 */
class TwakeSegmentationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TwakeSegmentation")

    // Rend les temps en MILLISECONDES par image, plus les images par seconde
    // qui s'en déduisent. `AsyncFunction` parce que l'inférence bloque, et
    // qu'un module Expo ne doit pas bloquer le fil JavaScript.
    AsyncFunction("benchmark") { width: Int, height: Int, iterations: Int ->
      runBenchmark(width, height, iterations)
    }

    // ÉTAPE 3 : une piste de couleur unie, publiable. Elle ne sert à rien
    // d'autre qu'à prouver que la plomberie tient — voir `SolidColorCapturer`.
    AsyncFunction("createSyntheticTrack") { width: Int, height: Int, fps: Int ->
      createSyntheticTrack(width, height, fps)
    }
  }

  /**
   * Fabrique une piste vidéo et rend à JavaScript de quoi la reconstruire.
   *
   * Le retour n'est PAS un objet natif : c'est le descripteur qu'attend le
   * constructeur de `MediaStreamTrack` (`MediaStreamTrack.ts:54`). Une piste
   * JavaScript n'est qu'un identifiant plus quelques champs — c'est ce fait qui
   * rend toute la chaîne possible sans forker le moindre paquet.
   */
  private fun createSyntheticTrack(width: Int, height: Int, fps: Int): Map<String, Any> {
    val reactContext = appContext.reactContext as? ReactApplicationContext
      ?: throw IllegalStateException("Aucun contexte React : le pont natif n'est pas prêt")

    // Le module de `react-native-webrtc`, obtenu par le registre du pont. C'est
    // la MÊME instance que celle qu'utilise `getUserMedia` : la piste
    // fabriquée ici atterrit donc dans le registre où JavaScript la cherchera.
    val webRTCModule = reactContext.getNativeModule(WebRTCModule::class.java)
      ?: throw IllegalStateException("WebRTCModule introuvable")

    val controller = SyntheticCaptureController(width, height, fps)
    // Tout est fait ici : source, piste, SurfaceTextureHelper, inscription au
    // registre et démarrage de la capture (`GetUserMediaImpl.java:399-430`).
    val track: VideoTrack = webRTCModule.createVideoTrack(controller)
      ?: throw IllegalStateException("createVideoTrack a rendu null")

    Log.i(TAG, "piste de synthèse créée : ${track.id()} (${width}x$height @ $fps)")

    return mapOf(
      "id" to track.id(),
      "kind" to "video",
      "enabled" to true,
      "readyState" to "live",
      // `false` : c'est une piste LOCALE. Le constructeur JS n'enregistre ses
      // écouteurs d'événements que dans ce cas (`MediaStreamTrack.ts:68-70`).
      "remote" to false,
      // `-1` est la convention de `react-native-webrtc` pour « pas encore
      // rattachée à une PeerConnection » : c'est ce que rend `getUserMedia`.
      "peerConnectionId" to -1,
      "deviceId" to SyntheticCaptureController.DEVICE_ID,
    )
  }

  private fun runBenchmark(width: Int, height: Int, iterations: Int): Map<String, Any> {
    // STREAM_MODE, et non SINGLE_IMAGE_MODE : c'est le mode d'un flux vidéo,
    // celui qui réutilise l'état d'une image à l'autre. Mesurer l'autre
    // donnerait un chiffre qu'aucun appel n'observerait jamais.
    val options = SelfieSegmenterOptions.Builder()
      .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)
      .build()
    val segmenter: Segmenter = Segmentation.getClient(options)

    val bitmap = syntheticFrame(width, height)
    val image = InputImage.fromBitmap(bitmap, 0)

    return try {
      // Une passe de chauffe, JAMAIS comptée : le premier appel charge le
      // modèle et alloue ses tampons. L'inclure ferait passer un coût unique
      // pour un coût par image — l'erreur qui rendrait la mesure inutilisable.
      Tasks.await(segmenter.process(image), 30, TimeUnit.SECONDS)

      val samples = LongArray(iterations)
      for (index in 0 until iterations) {
        val startNanos = SystemClock.elapsedRealtimeNanos()
        val mask: SegmentationMask =
          Tasks.await(segmenter.process(image), 30, TimeUnit.SECONDS)
        // Le masque est LU, pas seulement reçu : `process` peut rendre avant
        // que le tampon soit rempli, et une mesure qui ne touche pas le
        // résultat mesurerait la file d'attente plutôt que l'inférence.
        mask.buffer.rewind()
        val first = mask.buffer.float
        samples[index] = SystemClock.elapsedRealtimeNanos() - startNanos
        if (first < -1f) Log.v(TAG, "masque inattendu")
      }

      samples.sort()
      val medianNanos = samples[samples.size / 2]
      val p95Nanos = samples[(samples.size * 95) / 100]
      val medianMs = medianNanos / 1_000_000.0
      val p95Ms = p95Nanos / 1_000_000.0

      val result = mapOf(
        "width" to width,
        "height" to height,
        "iterations" to iterations,
        "medianMs" to medianMs,
        "p95Ms" to p95Ms,
        // Les i/s de la MÉDIANE. Le p95 est rendu à côté parce que c'est lui
        // qui produit les à-coups qu'on voit à l'œil.
        "fps" to if (medianMs > 0) 1000.0 / medianMs else 0.0,
      )
      Log.i(TAG, "MLKit selfie ${width}x${height} : médiane ${"%.2f".format(medianMs)} ms " +
        "(${"%.1f".format(1000.0 / medianMs)} i/s), p95 ${"%.2f".format(p95Ms)} ms")
      result
    } finally {
      segmenter.close()
    }
  }

  /**
   * Une image SYNTHÉTIQUE, mais pas uniforme : un dégradé radial clair sur fond
   * sombre, la forme la plus proche d'un buste que l'on puisse dessiner sans
   * caméra.
   *
   * Le contenu ne change pas le coût — le réseau parcourt le même graphe quelle
   * que soit l'image — mais une image UNIE inviterait à douter du chiffre, et
   * un doute sur une mesure coûte plus cher que dix lignes de dessin.
   */
  private fun syntheticFrame(width: Int, height: Int): Bitmap {
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(Color.rgb(24, 26, 30))
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.shader = RadialGradient(
      width / 2f,
      height * 0.55f,
      height * 0.45f,
      Color.rgb(226, 198, 172),
      Color.rgb(24, 26, 30),
      Shader.TileMode.CLAMP,
    )
    canvas.drawCircle(width / 2f, height * 0.55f, height * 0.45f, paint)
    return bitmap
  }
}
