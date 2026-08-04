import AVFoundation
import CoreImage
import ExpoModulesCore
import WebRTC

/// Les huit fonds de la DINUM, embarqués dans le module.
private let backgroundCount = 8

/**
 Le pendant iOS de `TwakeSegmentationModule.kt`, avec la MÊME interface
 JavaScript — `src/call/backgroundEffect.ts` ne doit rien savoir de la
 plateforme.

 Trois des cinq fonctions d'Android manquent ici, et c'est délibéré :
 `benchmark` et `createSyntheticTrack` ont servi à décider si le chantier
 vivait, puis à prouver la plomberie ; cette décision est prise et cette preuve
 est faite. Les rejouer sur iOS mesurerait un autre moteur pour répondre à une
 question déjà tranchée.

 **Rien de ce fichier n'a tourné.** Le simulateur iOS ne publie ni caméra ni
 micro (`AGENTS.md`), donc la seule chose vérifiée à ce stade est que cela
 compile. C'est réel — le compilateur a corrigé plusieurs suppositions côté
 Android — mais ce n'est pas une preuve de fonctionnement, et il ne faut pas
 l'écrire ailleurs comme si c'en était une.
 */
public final class TwakeSegmentationModule: Module {

  // UN seul processeur pour toute la vie du module : il porte la requête Vision
  // et le contexte Core Image, tous deux chers à construire.
  private let processor = EffectFrameProcessor()

  // Les fonds décodés sont GARDÉS : relire un JPEG à chaque bascule serait payé
  // huit fois pour rien.
  private var backgrounds: [Int: CIImage] = [:]

  public func definition() -> ModuleDefinition {
    Name("TwakeSegmentation")

    AsyncFunction("createCameraTrack") {
      (width: Int, height: Int, fps: Int, facingMode: String) -> [String: Any] in
      try self.createCameraTrack(width: width, height: height, fps: fps, facingMode: facingMode)
    }

    // Bascule l'effet SANS toucher à la piste. C'est ce qui permet de changer
    // d'avis en pleine séance sans renégocier avec le serveur.
    Function("setEffect") { (kind: String, backgroundIndex: Int) in
      switch kind {
      case "blur":
        self.processor.setEffect(.blur)
      case "image":
        if let picture = self.loadBackground(backgroundIndex) {
          self.processor.setEffect(.image(picture))
        } else {
          self.processor.setEffect(.none)
        }
      default:
        self.processor.setEffect(.none)
      }
    }

    // Rendu par le natif plutôt que codé en dur côté JavaScript : deux listes à
    // tenir d'accord seraient une de trop, et c'est le natif qui porte les
    // fichiers.
    Function("backgroundCount") { backgroundCount }
  }

  /**
   Fabrique la piste caméra à effet et rend à JavaScript de quoi la reconstruire.

   Le retour n'est PAS un objet natif : c'est le descripteur qu'attend le
   constructeur de `MediaStreamTrack`. Une piste JavaScript n'est qu'un
   identifiant plus quelques champs — c'est ce fait qui rend toute la chaîne
   possible sans forker le moindre paquet, sur les deux plateformes.
   */
  private func createCameraTrack(
    width: Int,
    height: Int,
    fps: Int,
    facingMode: String,
  ) throws -> [String: Any] {
    // `appContext.nativeModule(named:)` et NON `RCTBridge.current()` : le second
    // rend `nil` en mode sans pont, que la nouvelle architecture active. Celui-ci
    // passe par l'hôte dans ce cas et par le pont sinon (`AppContext.swift:281`).
    guard let webRTCModule: NSObject = appContext?.nativeModule(named: "WebRTCModule") else {
      throw TwakeSegmentationError.webRTCModuleMissing
    }

    // Accès par clé plutôt que par en-tête. `WebRTCModule.h` déclare bien
    // `peerConnectionFactory` et `localTracks` en propriétés publiques, mais
    // l'importer depuis Swift lierait ce module à la disposition des en-têtes
    // d'un pod tiers. Le prix de ce choix est qu'une faute de frappe sur un nom
    // de clé ne se voit qu'à l'EXÉCUTION — d'où les erreurs nommées ci-dessous
    // plutôt qu'un `try!`.
    guard let factory = webRTCModule.value(forKey: "peerConnectionFactory") as? RTCPeerConnectionFactory
    else {
      throw TwakeSegmentationError.factoryMissing
    }
    guard let localTracks = webRTCModule.value(forKey: "localTracks") as? NSMutableDictionary else {
      throw TwakeSegmentationError.trackRegistryMissing
    }

    let position: AVCaptureDevice.Position = facingMode == "environment" ? .back : .front
    guard let device = Self.device(at: position) else {
      throw TwakeSegmentationError.noCamera(facingMode)
    }
    guard let format = Self.format(for: device, width: width, height: height) else {
      throw TwakeSegmentationError.noFormat(width, height)
    }

    let source = factory.videoSource()
    let trackId = UUID().uuidString
    let track = factory.videoTrack(with: source, trackId: trackId)

    // Le délégué se met à la PLACE de la source, traite, puis lui transmet.
    // C'est le même montage que `WebRTCModule+RTCMediaStream.m:152`, à ceci
    // près que la source n'est plus le premier maillon.
    let delegate = SegmentingCapturerDelegate(target: source, processor: processor)
    let capturer = RTCCameraVideoCapturer(delegate: delegate)
    let controller = TwakeCaptureController(capturer: capturer, delegate: delegate)

    // `captureController` posé par clé : c'est ce qui fait que `track.stop()`
    // depuis JavaScript RELÂCHE la caméra (`WebRTCModule+RTCMediaStream.m:432`
    // appelle `stopCapture` sans vérifier le type). Sans cette ligne, quitter
    // l'écran laisserait l'objectif allumé, témoin compris — le défaut que
    // `cameraPreview.ts` documente déjà.
    //
    // Les deux autres usages du champ (lignes 114 et 275) sont gardés par un
    // `isKindOfClass:`, donc ils ignorent proprement un objet qui n'est pas un
    // `CaptureController` : on perd `getSettings`, rien d'autre.
    track.setValue(controller, forKey: "captureController")

    capturer.startCapture(with: device, format: format, fps: fps)
    localTracks[trackId] = track

    return [
      "id": trackId,
      "kind": "video",
      "enabled": true,
      "readyState": "live",
      // `false` : c'est une piste LOCALE. Le constructeur JavaScript n'enregistre
      // ses écouteurs d'événements que dans ce cas.
      "remote": false,
      // `-1` est la convention de `react-native-webrtc` pour « pas encore
      // rattachée à une PeerConnection » : c'est ce que rend `getUserMedia`.
      "peerConnectionId": -1,
      "deviceId": device.uniqueID,
    ]
  }

  /**
   Charge un fond depuis le paquet de ressources du module.

   Ils vivent dans le binaire, pas dans le bundle JavaScript : les faire
   traverser le pont demanderait de résoudre une URI d'asset Expo, de la lire en
   base64 et de la redécoder — trois étapes pour un fichier que l'application
   contient déjà.
   */
  private func loadBackground(_ index: Int) -> CIImage? {
    if let cached = backgrounds[index] { return cached }
    guard
      let bundleURL = Bundle(for: Self.self)
        .url(forResource: "TwakeSegmentationBackgrounds", withExtension: "bundle"),
      let bundle = Bundle(url: bundleURL),
      let url = bundle.url(forResource: String(index), withExtension: "jpg"),
      let picture = CIImage(contentsOf: url)
    else {
      NSLog("TwakeSegEffect: fond %d illisible", index)
      return nil
    }
    backgrounds[index] = picture
    return picture
  }

  private static func device(at position: AVCaptureDevice.Position) -> AVCaptureDevice? {
    RTCCameraVideoCapturer.captureDevices().first { $0.position == position }
      ?? RTCCameraVideoCapturer.captureDevices().first
  }

  /**
   Le format le plus proche de ce qui est demandé.

   `min(by:)` sur un écart plutôt qu'une correspondance exacte : les définitions
   offertes varient d'un modèle à l'autre, et exiger 640x480 rendrait `nil` sur
   un appareil qui ne propose que 640x360. Une caméra un peu différente vaut
   mieux qu'aucune caméra.
   */
  private static func format(
    for device: AVCaptureDevice,
    width: Int,
    height: Int,
  ) -> AVCaptureDevice.Format? {
    RTCCameraVideoCapturer.supportedFormats(for: device).min { lhs, rhs in
      distance(lhs, width, height) < distance(rhs, width, height)
    }
  }

  private static func distance(_ format: AVCaptureDevice.Format, _ width: Int, _ height: Int) -> Int {
    let size = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
    return abs(Int(size.width) - width) + abs(Int(size.height) - height)
  }
}

/**
 Ce que `react-native-webrtc` appellera pour arrêter la caméra.

 Il n'hérite PAS de leur `CaptureController` : le faire imposerait d'importer
 les en-têtes d'un pod tiers depuis Swift. Seul `stopCapture` est réellement
 envoyé sans vérification de type, et ObjC l'enverra à n'importe quel objet qui
 y répond.
 */
final class TwakeCaptureController: NSObject {

  private let capturer: RTCCameraVideoCapturer
  // Retenu, sinon personne d'autre ne le retient : `RTCCameraVideoCapturer`
  // garde son délégué en référence FAIBLE, et le nôtre serait libéré aussitôt
  // après la création — la caméra continuerait de capturer et plus une seule
  // image n'atteindrait la source. Une panne silencieuse et totale.
  private let delegate: SegmentingCapturerDelegate

  init(capturer: RTCCameraVideoCapturer, delegate: SegmentingCapturerDelegate) {
    self.capturer = capturer
    self.delegate = delegate
  }

  @objc func startCapture() {
    // La capture est démarrée par le module, qui seul connaît l'objectif et le
    // format. Rien à faire ici — mais la méthode existe, parce que le chemin
    // qui pose un `captureController` l'appelle parfois juste après.
  }

  @objc func stopCapture() {
    capturer.stopCapture()
  }
}

enum TwakeSegmentationError: Error, LocalizedError {
  case webRTCModuleMissing
  case factoryMissing
  case trackRegistryMissing
  case noCamera(String)
  case noFormat(Int, Int)

  var errorDescription: String? {
    switch self {
    case .webRTCModuleMissing:
      return "WebRTCModule introuvable : le pont natif n'est pas prêt"
    case .factoryMissing:
      return "peerConnectionFactory absent de WebRTCModule"
    case .trackRegistryMissing:
      return "localTracks absent de WebRTCModule"
    case let .noCamera(facing):
      return "Aucune caméra pour « \(facing) »"
    case let .noFormat(width, height):
      return "Aucun format proche de \(width)x\(height)"
    }
  }
}
