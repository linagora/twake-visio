package com.linagora.twakevisio.segmentation

import android.graphics.Bitmap
import org.webrtc.JavaI420Buffer
import org.webrtc.YuvHelper
import org.webrtc.VideoFrame
import java.nio.ByteBuffer

/**
 * Les deux conversions que le traitement d'image impose, et rien d'autre.
 *
 * WebRTC parle **I420** — luminance pleine, chrominance à demi-résolution.
 * Android dessine en **ARGB**. Tout effet doit donc traverser la frontière deux
 * fois, et c'est la seule partie du pipeline qui se paie au pixel dans notre
 * code : le reste (mise à l'échelle, masquage, flou) est délégué à `Canvas` et
 * `Bitmap`, qui sont natifs.
 *
 * **Une CLASSE et non un objet, parce qu'elle garde des tampons.** Réutiliser
 * les tableaux d'une image à l'autre évite quelques mégaoctets d'allocation par
 * seconde ; les partager entre deux capteurs simultanés les corromprait. Une
 * instance par processeur, donc, et le partage devient impossible par
 * construction plutôt que par convention.
 *
 * Ventilation mesurée sur Pixel 10 Pro Fold, 480 images, avant cette passe :
 * `conv` 25,7 ms, `sortie` 1,2 ms. Le même nombre de pixels, vingt fois moins
 * cher dans le sens que libyuv couvre — c'est la mesure qui a désigné cette
 * boucle-ci comme le poste principal.
 */
class FrameConversion {

  // Les plans recopiés en tableaux natifs, réutilisés d'une image à l'autre.
  //
  // Lire un `ByteBuffer` direct par `get(index)` traverse une barrière de
  // bornes à CHAQUE pixel — trois fois par pixel ici. Une recopie en masse est
  // un seul `memcpy`, après quoi la boucle ne touche plus que des tableaux, que
  // le compilateur à la volée sait traiter.
  private var yBytes = ByteArray(0)
  private var uBytes = ByteArray(0)
  private var vBytes = ByteArray(0)
  private var pixels = IntArray(0)

  /**
   * I420 → `Bitmap` ARGB, en RÉDUISANT au passage.
   *
   * La réduction est faite DANS la boucle de conversion, pas après : convertir
   * en pleine définition puis réduire ferait le travail coûteux sur quatre fois
   * plus de pixels pour jeter les trois quarts. On échantillonne directement.
   *
   * L'échantillonnage est au plus proche voisin, sans moyenne. Pour alimenter un
   * réseau de segmentation c'est suffisant — il cherche une silhouette, pas du
   * détail — et une moyenne coûterait quatre lectures par pixel.
   */
  fun toScaledBitmap(buffer: VideoFrame.I420Buffer, targetWidth: Int, targetHeight: Int): Bitmap {
    val srcWidth = buffer.width
    val srcHeight = buffer.height
    val strideY = buffer.strideY
    val strideU = buffer.strideU
    val strideV = buffer.strideV
    val chromaHeight = (srcHeight + 1) / 2

    yBytes = grownTo(yBytes, strideY * srcHeight)
    uBytes = grownTo(uBytes, strideU * chromaHeight)
    vBytes = grownTo(vBytes, strideV * chromaHeight)
    copyPlane(buffer.dataY, yBytes)
    copyPlane(buffer.dataU, uBytes)
    copyPlane(buffer.dataV, vBytes)
    val luma = yBytes
    val chromaU = uBytes
    val chromaV = vBytes

    val count = targetWidth * targetHeight
    if (pixels.size < count) pixels = IntArray(count)
    val out = pixels

    for (targetY in 0 until targetHeight) {
      val sourceY = targetY * srcHeight / targetHeight
      val chromaRow = sourceY / 2
      val lumaRow = sourceY * strideY
      val uRow = chromaRow * strideU
      val vRow = chromaRow * strideV
      val outRow = targetY * targetWidth
      for (targetX in 0 until targetWidth) {
        val sourceX = targetX * srcWidth / targetWidth
        val chromaCol = sourceX / 2

        val y = luma[lumaRow + sourceX].toInt() and 0xFF
        val u = (chromaU[uRow + chromaCol].toInt() and 0xFF) - 128
        val v = (chromaV[vRow + chromaCol].toInt() and 0xFF) - 128

        // BT.601, en arithmétique entière. Les constantes sont celles de la
        // norme, décalées de 10 bits pour éviter le flottant : une conversion
        // par pixel, c'est le seul endroit où la micro-optimisation se justifie.
        val red = clamp8(y + ((1436 * v) shr 10))
        val green = clamp8(y - ((352 * u + 731 * v) shr 10))
        val blue = clamp8(y + ((1815 * u) shr 10))

        out[outRow + targetX] = (0xFF shl 24) or (red shl 16) or (green shl 8) or blue
      }
    }

    // `setPixels` sur un bitmap neuf plutôt que `createBitmap(pixels, …)` : le
    // second exige un tableau de la taille EXACTE, ce qui interdirait de
    // réutiliser un tampon dimensionné pour la plus grande des deux images.
    val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
    bitmap.setPixels(out, 0, targetWidth, 0, 0, targetWidth, targetHeight)
    return bitmap
  }

  /** Le tableau s'il suffit, un neuf sinon. Jamais de rétrécissement. */
  private fun grownTo(array: ByteArray, length: Int): ByteArray =
    if (array.size >= length) array else ByteArray(length)

  /**
   * Recopie un plan dans un tableau.
   *
   * `duplicate()` et non le tampon lui-même : lire déplace la position, et le
   * même `I420Buffer` est lu plusieurs fois par image quand la segmentation
   * tourne à une autre définition que la composition. Une lecture destructive
   * rendrait la deuxième vide — sans erreur, avec une image noire pour seul
   * symptôme.
   */
  private fun copyPlane(plane: ByteBuffer, into: ByteArray) {
    val view = plane.duplicate()
    view.rewind()
    view.get(into, 0, minOf(into.size, view.remaining()))
  }

  /**
   * `Bitmap` ARGB → tampon I420, par **libyuv**.
   *
   * La version précédente parcourait les 307 200 pixels en Kotlin et calculait
   * la luminance et la chrominance à la main. Mesurée dans la chaîne complète,
   * elle est passée de cette boucle à **1,2 ms** — vingt fois moins.
   *
   * `YuvHelper.ABGRToI420` fait le même travail en SIMD natif : c'est libyuv,
   * déjà embarqué dans WebRTC, donc aucune dépendance ajoutée. Vérifié par
   * `javap` sur l'archive réellement liée, pas supposé d'après une
   * documentation — et c'est ce même relevé qui dit qu'aucune conversion dans
   * l'autre sens n'est exposée, d'où la boucle Kotlin qui subsiste ci-dessus.
   *
   * **`ABGR` et non `ARGB`, et ce n'est pas une coquille.** libyuv nomme ses
   * formats par l'ordre des OCTETS en mémoire ; Android nomme `ARGB_8888` par
   * l'ordre des composantes dans un entier. Sur une machine petit-boutiste, les
   * deux désignent la même disposition. Prendre le nom d'Android au pied de la
   * lettre donnerait des couleurs inversées.
   */
  fun toI420Buffer(bitmap: Bitmap): VideoFrame.I420Buffer {
    val width = bitmap.width
    val height = bitmap.height
    val chromaWidth = (width + 1) / 2
    val chromaHeight = (height + 1) / 2

    val argb = ByteBuffer.allocateDirect(width * height * 4)
    bitmap.copyPixelsToBuffer(argb)
    argb.rewind()

    val yBuffer = ByteBuffer.allocateDirect(width * height)
    val uBuffer = ByteBuffer.allocateDirect(chromaWidth * chromaHeight)
    val vBuffer = ByteBuffer.allocateDirect(chromaWidth * chromaHeight)

    YuvHelper.ABGRToI420(
      argb, width * 4,
      yBuffer, width,
      uBuffer, chromaWidth,
      vBuffer, chromaWidth,
      width, height,
    )

    return JavaI420Buffer.wrap(
      width, height,
      yBuffer, width,
      uBuffer, chromaWidth,
      vBuffer, chromaWidth,
      null,
    )
  }

  private fun clamp8(value: Int): Int = if (value < 0) 0 else if (value > 255) 255 else value
}
