import CoreImage
import CoreImage.CIFilterBuiltins
import CoreVideo
import Foundation
import Vision
import WebRTC

/// Ce que l'utilisateur a choisi. `none` est un état, pas une absence.
enum TwakeBackgroundEffect {
  case none
  case blur
  case image(CIImage)
}

/**
 Le cœur du pendant iOS : segmenter, puis composer.

 **Rien de ce fichier ne ressemble à son homologue Android, et c'est le point.**
 Là-bas, chaque image traverse deux conversions I420 ↔ ARGB écrites à la main,
 qui pèsent à elles seules le tiers du budget. Ici, `RTCVideoFrame` porte déjà
 un `CVPixelBuffer`, Vision le prend tel quel, Core Image compose sur le GPU et
 rend dans un autre `CVPixelBuffer`. **Aucune boucle par pixel n'est écrite
 nulle part.**

 Ce n'est donc pas une transposition du code Android : c'est le même effet obtenu
 par le chemin que la plateforme rend naturel. Transposer aurait reproduit des
 conversions qu'iOS n'impose pas.

 La contrepartie est qu'aucun chiffre n'est encore mesuré ici. Le simulateur ne
 publie ni caméra ni micro — c'est écrit dans `AGENTS.md` —, donc la mesure
 demande un iPhone branché. Tant qu'elle n'a pas eu lieu, ce fichier compile et
 rien de plus : **on ne saura pas ce qu'il coûte avant de l'avoir mesuré sur
 appareil**, et il ne faut pas écrire ailleurs qu'il est rapide.
 */
final class EffectFrameProcessor {

  /// Rendu GPU. `CIContext` est cher à construire et sûr à réutiliser.
  private let ciContext = CIContext(options: [.cacheIntermediates: false])

  /// `.balanced` plutôt que `.accurate` : le mode précis vise la photo, pas les
  /// 33 ms d'une image de flux. `.fast` rend un masque nettement plus grossier.
  private let request: VNGeneratePersonSegmentationRequest = {
    let request = VNGeneratePersonSegmentationRequest()
    request.qualityLevel = .balanced
    request.outputPixelFormat = kCVPixelFormatType_OneComponent8
    return request
  }()

  private let lock = NSLock()
  private var effect: TwakeBackgroundEffect = .none

  /// Le masque conservé entre deux images, pour la même raison qu'Android :
  /// une silhouette ne bouge pas en 33 ms, et redécouvrir la même à chaque
  /// image est le poste le plus cher de la chaîne.
  private var retainedMask: CIImage?
  private var frameIndex: UInt64 = 0

  private var pool: CVPixelBufferPool?
  private var poolWidth = 0
  private var poolHeight = 0

  func setEffect(_ next: TwakeBackgroundEffect) {
    lock.lock()
    effect = next
    if case .none = next { retainedMask = nil }
    lock.unlock()
  }

  func process(_ frame: RTCVideoFrame) -> RTCVideoFrame {
    lock.lock()
    let current = effect
    lock.unlock()

    // LE chemin rapide, et la raison pour laquelle le délégué peut rester
    // branché en permanence : aucun effet, aucun travail.
    if case .none = current { return frame }

    guard let rtcBuffer = frame.buffer as? RTCCVPixelBuffer else { return frame }
    let pixelBuffer = rtcBuffer.pixelBuffer
    let source = CIImage(cvPixelBuffer: pixelBuffer)
    let extent = source.extent

    frameIndex &+= 1
    if retainedMask == nil || frameIndex % UInt64(Self.segmentEvery) == 0 {
      retainedMask = makeMask(from: pixelBuffer, fitting: extent)
    }
    guard let mask = retainedMask else { return frame }

    let background: CIImage
    switch current {
    case .blur:
      // `clampedToExtent` AVANT le flou : sans lui, le flou échantillonne du
      // transparent au-delà des bords et rend un liseré sombre tout autour de
      // l'image. Le défaut est discret au centre et net dans les coins.
      background = source
        .clampedToExtent()
        .applyingGaussianBlur(sigma: Self.blurSigma)
        .cropped(to: extent)
    case let .image(picture):
      background = Self.cover(picture, in: extent)
    case .none:
      return frame
    }

    let blend = CIFilter.blendWithMask()
    blend.inputImage = source
    blend.backgroundImage = background
    blend.maskImage = mask
    guard let composited = blend.outputImage else { return frame }

    guard let output = makePixelBuffer(width: Int(extent.width), height: Int(extent.height)) else {
      return frame
    }
    ciContext.render(composited, to: output)

    return RTCVideoFrame(
      buffer: RTCCVPixelBuffer(pixelBuffer: output),
      rotation: frame.rotation,
      timeStampNs: frame.timeStampNs,
    )
  }

  /**
   Le masque de silhouette, mis à l'échelle de l'image.

   Vision rend un masque à SA définition, pas à celle de l'entrée — souvent bien
   plus petit. Le composer sans l'agrandir découperait la personne dans un coin
   de l'image. C'est la même mise à l'échelle que fait `drawBitmap(mask, null,
   destination, …)` côté Android, ici portée par une transformation affine que
   Core Image applique sur le GPU.
   */
  private func makeMask(from pixelBuffer: CVPixelBuffer, fitting extent: CGRect) -> CIImage? {
    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, options: [:])
    do {
      try handler.perform([request])
    } catch {
      // Une image ratée ne doit JAMAIS interrompre l'appel : on garde le masque
      // précédent, et à défaut l'appelant publiera l'image d'origine.
      NSLog("TwakeSegEffect: segmentation échouée — %@", error.localizedDescription)
      return retainedMask
    }
    guard let observation = request.results?.first else { return retainedMask }

    let raw = CIImage(cvPixelBuffer: observation.pixelBuffer)
    let scaleX = extent.width / raw.extent.width
    let scaleY = extent.height / raw.extent.height
    return raw.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))
  }

  /**
   Cadre une image de fond en « couvrir », sans jamais l'étirer.

   Le défaut que le propriétaire a vu sur Android était exactement celui-là :
   une image dessinée sur un rectangle plein est ÉTIRÉE, et un fond au mauvais
   rapport devient méconnaissable. On agrandit donc du facteur le plus grand des
   deux, puis on centre et on rogne.
   */
  private static func cover(_ picture: CIImage, in extent: CGRect) -> CIImage {
    let scale = max(extent.width / picture.extent.width, extent.height / picture.extent.height)
    let scaled = picture.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let offsetX = extent.midX - scaled.extent.midX
    let offsetY = extent.midY - scaled.extent.midY
    return scaled
      .transformed(by: CGAffineTransform(translationX: offsetX, y: offsetY))
      .cropped(to: extent)
  }

  /**
   Un tampon de sortie tiré d'une RÉSERVE, jamais alloué à l'image.

   `CVPixelBufferCreate` par image ferait passer le ramasse-miettes plus souvent
   que la caméra ne produit d'images — c'est la même raison qui fait réutiliser
   les tampons côté Android, où elle a valu 3,5x sur la conversion d'entrée.
   */
  private func makePixelBuffer(width: Int, height: Int) -> CVPixelBuffer? {
    if pool == nil || poolWidth != width || poolHeight != height {
      let attributes: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        // Sans cette clé, Core Image ne peut pas écrire dans le tampon par le
        // GPU et retombe silencieusement sur un chemin logiciel.
        kCVPixelBufferIOSurfacePropertiesKey as String: [:] as CFDictionary,
      ]
      var created: CVPixelBufferPool?
      CVPixelBufferPoolCreate(kCFAllocatorDefault, nil, attributes as CFDictionary, &created)
      pool = created
      poolWidth = width
      poolHeight = height
    }
    guard let pool else { return nil }
    var buffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &buffer)
    return buffer
  }

  /// Une segmentation toutes les DEUX images, comme sur Android — où la mesure
  /// a montré que MLKit pesait 44 % du coût pour redécouvrir une silhouette
  /// immobile. Le chiffre iOS reste à mesurer sur appareil.
  private static let segmentEvery = 2

  /// Le rayon du flou. Core Image fait un VRAI gaussien sur le GPU, là où
  /// Android enchaîne des réductions de moitié faute de mieux.
  private static let blurSigma = 12.0
}
