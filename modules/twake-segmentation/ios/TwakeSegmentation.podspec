Pod::Spec.new do |s|
  s.name           = 'TwakeSegmentation'
  s.version        = '1.0.0'
  s.summary        = "Flou et fonds virtuels pour la caméra, côté iOS"
  s.description    = "Le pendant iOS de modules/twake-segmentation/android : " \
                     "Vision pour la silhouette, Core Image pour la composition."
  s.author         = 'Linagora'
  s.homepage       = 'https://github.com/linagora/twake-visio'
  s.license        = { :type => 'AGPL-3.0' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/linagora/twake-visio.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # La MÊME version que `livekit-react-native-webrtc` déclare. Deux versions du
  # même binaire WebRTC dans un projet ne cohabitent pas : CocoaPods refuse, et
  # c'est heureux — deux `RTCPeerConnectionFactory` de générations différentes
  # échangeraient des objets incompatibles sans le dire.
  s.dependency 'WebRTC-SDK', '=144.7559.10'

  s.source_files = '**/*.{h,m,swift}'

  # Les huit fonds de la DINUM, embarqués comme sur Android. Un `resource_bundle`
  # et non `resources` : le second les poserait à la racine du paquet, où ils
  # entreraient en collision avec ceux d'un autre pod portant les mêmes noms —
  # et « 1.jpg » est exactement le genre de nom qui entre en collision.
  s.resource_bundles = { 'TwakeSegmentationBackgrounds' => ['backgrounds/*.jpg'] }
end
