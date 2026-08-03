import Foundation
import WebRTC

/**
 La caméra de WebRTC, avec un effet interposé.

 **Le point d'accroche iOS est plus simple que celui d'Android, et il vaut la
 peine de dire pourquoi.** Là-bas, il a fallu sous-classer
 `CameraCaptureController` de `react-native-webrtc` et décorer le `VideoCapturer`
 qu'elle construit, parce que rien d'autre n'était interposable. Ici,
 `RTCCameraVideoCapturer` reçoit son délégué à la construction
 (`WebRTCModule+RTCMediaStream.m:152` fait exactement cela avec la
 `RTCVideoSource`) : il suffit de se mettre à la place de la source et de lui
 transmettre l'image traitée.

 Aucune sous-classe, aucune méthode redéfinie, aucun couplage à une classe
 interne de `react-native-webrtc`.
 */
final class SegmentingCapturerDelegate: NSObject, RTCVideoCapturerDelegate {

  private let target: RTCVideoCapturerDelegate
  private let processor: EffectFrameProcessor

  init(target: RTCVideoCapturerDelegate, processor: EffectFrameProcessor) {
    self.target = target
    self.processor = processor
  }

  func capturer(_ capturer: RTCVideoCapturer, didCapture frame: RTCVideoFrame) {
    // L'image traitée est transmise à la source d'origine. Si le traitement
    // échoue, `process` rend l'image reçue telle quelle : l'interlocuteur voit
    // une image sans effet plutôt qu'un gel.
    target.capturer(capturer, didCapture: processor.process(frame))
  }
}
