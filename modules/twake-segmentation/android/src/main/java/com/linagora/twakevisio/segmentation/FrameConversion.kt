package com.linagora.twakevisio.segmentation

import android.graphics.Bitmap
import org.webrtc.JavaI420Buffer
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
 * **C'est donc ici que se joue le budget.** La mesure de l'étape 1 disait 17,96 ms
 * pour la seule segmentation à 480p, sur 33,33 ms disponibles. Ce qui reste doit
 * couvrir ces deux conversions plus la composition.
 */
object FrameConversion {

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
    val pixels = IntArray(targetWidth * targetHeight)

    val yPlane = buffer.dataY
    val uPlane = buffer.dataU
    val vPlane = buffer.dataV
    val strideY = buffer.strideY
    val strideU = buffer.strideU
    val strideV = buffer.strideV

    for (targetY in 0 until targetHeight) {
      val sourceY = targetY * srcHeight / targetHeight
      val chromaRow = (sourceY / 2)
      for (targetX in 0 until targetWidth) {
        val sourceX = targetX * srcWidth / targetWidth
        val chromaCol = (sourceX / 2)

        val luma = (yPlane.get(sourceY * strideY + sourceX).toInt() and 0xFF)
        val chromaU = (uPlane.get(chromaRow * strideU + chromaCol).toInt() and 0xFF) - 128
        val chromaV = (vPlane.get(chromaRow * strideV + chromaCol).toInt() and 0xFF) - 128

        // BT.601, en arithmétique entière. Les constantes sont celles de la
        // norme, décalées de 10 bits pour éviter le flottant : une conversion
        // par pixel, c'est le seul endroit où la micro-optimisation se justifie.
        val red = clamp8(luma + ((1436 * chromaV) shr 10))
        val green = clamp8(luma - ((352 * chromaU + 731 * chromaV) shr 10))
        val blue = clamp8(luma + ((1815 * chromaU) shr 10))

        pixels[targetY * targetWidth + targetX] =
          (0xFF shl 24) or (red shl 16) or (green shl 8) or blue
      }
    }

    return Bitmap.createBitmap(pixels, targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
  }

  /**
   * `Bitmap` ARGB → tampon I420, à la définition du bitmap.
   *
   * La chrominance est écrite une fois sur quatre pixels — c'est ce que veut
   * dire « 4:2:0 ». Écrire les quatre donnerait le même résultat visuel pour
   * quatre fois le travail.
   */
  fun toI420Buffer(bitmap: Bitmap): VideoFrame.I420Buffer {
    val width = bitmap.width
    val height = bitmap.height
    val pixels = IntArray(width * height)
    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)

    val chromaWidth = (width + 1) / 2
    val chromaHeight = (height + 1) / 2
    val yBuffer = ByteBuffer.allocateDirect(width * height)
    val uBuffer = ByteBuffer.allocateDirect(chromaWidth * chromaHeight)
    val vBuffer = ByteBuffer.allocateDirect(chromaWidth * chromaHeight)

    for (row in 0 until height) {
      for (col in 0 until width) {
        val pixel = pixels[row * width + col]
        val red = (pixel shr 16) and 0xFF
        val green = (pixel shr 8) and 0xFF
        val blue = pixel and 0xFF

        val luma = ((66 * red + 129 * green + 25 * blue + 128) shr 8) + 16
        yBuffer.put(row * width + col, clamp8(luma).toByte())

        if (row % 2 == 0 && col % 2 == 0) {
          val chromaU = ((-38 * red - 74 * green + 112 * blue + 128) shr 8) + 128
          val chromaV = ((112 * red - 94 * green - 18 * blue + 128) shr 8) + 128
          val index = (row / 2) * chromaWidth + (col / 2)
          uBuffer.put(index, clamp8(chromaU).toByte())
          vBuffer.put(index, clamp8(chromaV).toByte())
        }
      }
    }

    return JavaI420Buffer.wrap(
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
  }

  private fun clamp8(value: Int): Int = if (value < 0) 0 else if (value > 255) 255 else value
}
