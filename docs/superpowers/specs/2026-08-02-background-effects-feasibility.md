# Flou et arrière-plans virtuels sur React Native — étude de faisabilité

Note préparatoire au **Lot 3** de la refonte. Elle ne propose pas de conception :
elle établit ce qui est possible, et ce qui ne l'est pas, avant qu'un plan
promette l'un pour l'autre.

Demande du propriétaire, le 2026-08-02 :

> « Pour le flou et les fonds d'écran prendre les mêmes que ceux donnés par la
> DINUM : `https://github.com/suitenumerique/meet`. Ensuite il faut trouver la
> librairie et les fonctions élégantes qui permettent d'ajouter le flou
> background à l'utilisateur en détourant l'utilisateur. »

---

## Le fait central : la voie du web ne se transpose pas **[V]**

`src/frontend/package.json` de `suitenumerique/meet` déclare, relevé le
2026-08-02 :

| Paquet | Version | Nature |
| --- | --- | --- |
| `@livekit/track-processors` | 0.7.2 | **web** |
| `@mediapipe/tasks-vision` | 0.10.35 | **web** |

C'est là tout le détourage du client web : MediaPipe segmente la personne, et
`track-processors` compose le résultat sur un canevas dont il tire une nouvelle
piste.

**Aucune des deux ne fonctionne en React Native**, et pas par oubli d'emballage :

1. **`livekit-client` expose bien `setProcessor`** — `LocalVideoTrack.d.ts:46` —
   mais son contrat exige que le processeur produise un
   `processedTrack: MediaStreamTrack` (`processor/types.d.ts:25`). Sur le web,
   cette piste vient d'un `<canvas>.captureStream()` ou d'un
   `MediaStreamTrackGenerator`.
2. **`@livekit/react-native-webrtc` n'expose ni `captureStream`, ni
   `MediaStreamTrackGenerator`, ni `OffscreenCanvas`** — vérifié par balayage de
   ses déclarations. Il n'existe donc **aucun chemin JavaScript** entre une image
   de caméra et une nouvelle piste.
3. **Le SDK `@livekit/react-native` ne connaît pas les processeurs vidéo.** Les
   seules occurrences de « processor » dans ses sources sont
   `useTrackVolume.ts` et `useMultibandTrackVolume.ts` — de l'**audio**.
4. **`@mediapipe/tasks-vision` exige WebGL/WASM dans un navigateur.** Il n'y a pas
   de moteur de rendu pour lui dans une application native.

> **Conclusion : le flou d'arrière-plan n'est pas atteignable en installant une
> bibliothèque.** Aucune combinaison de paquets npm ne le rend possible dans
> cette application aujourd'hui.

## Ce qu'il faudrait réellement

Un **module natif par plateforme**, qui segmente et alimente WebRTC en amont du
JavaScript :

| | Segmentation | Injection dans WebRTC |
| --- | --- | --- |
| iOS | `VNGeneratePersonSegmentationRequest` (Vision), ou un modèle CoreML | `RTCVideoCapturer` personnalisé |
| Android | MLKit *Selfie Segmentation* | `VideoSource` / `CapturerObserver` personnalisé |

### La question qui décidait est tranchée : **oui, il y a une couture** **[V]**

Relevé le 2026-08-02 dans les sources natives, après que la première version de
cette note l'ait laissée ouverte. Les deux plateformes exposent de quoi
enregistrer une piste vidéo **sans forker `react-native-webrtc`**.

**Android — une couture explicite.** `WebRTCModule.java:487` :

```java
public void registerTrack(VideoTrack track, VideoSource source,
                          AbstractVideoCaptureController controller,
                          SurfaceTextureHelper surfaceTextureHelper)
```

`public`, et `AbstractVideoCaptureController` est une classe abstraite publique
avec **une seule** méthode abstraite (`getDeviceId()`). `CameraCaptureController`
et `ScreenCaptureController` en héritent déjà : un troisième — caméra + MLKit —
est architecturalement prévu.

**iOS — une couture plus fruste, mais réelle.** Pas de `registerTrack`, mais
`WebRTCModule.h:40-46` expose en propriétés **publiques** :

- `peerConnectionFactory` — de quoi créer un `RTCVideoSource` et un `RTCVideoTrack` ;
- `localTracks`, un `NSMutableDictionary` — de quoi y déposer la piste pour que
  JavaScript la référence.

Le chemin est donc : `RTCVideoCapturer` personnalisé → Vision → `RTCVideoSource`
→ dépôt dans `localTracks`.

> **Correction de la première version de cette note.** Elle concluait « il
> faudrait un module natif » sans dire si c'était seulement possible. Ça l'est,
> et sans forker : les deux paquets laissent la porte ouverte. Ce qui reste
> n'est pas un blocage d'architecture, c'est du travail.

**Ordre de grandeur, honnêtement** : deux implémentations natives distinctes, un
modèle de segmentation par plateforme, et le coût par image à mesurer sur un
appareil d'entrée de gamme. Ce n'est pas une tâche du Lot 3, c'est un chantier à
soi — mais un chantier *faisable*, pas un mur.

## Les arrière-plans de la DINUM **[V]**

Ils existent, et ils sont directement réutilisables — `suitenumerique/meet`,
`src/frontend/public/assets/backgrounds/` :

| | Fichiers | Poids |
| --- | --- | --- |
| Pleine résolution | `1.jpg` … `8.jpg` | ~8,9 Mo au total |
| Vignettes | `thumbnails/1.jpg` … `8.jpg` | **163 Ko au total** |

Les vignettes sont celles que le mockup importe déjà, et les seules à embarquer :
163 Ko pour huit choix est raisonnable, 8,9 Mo ne le serait pas dans un bundle
mobile.

**Mais elles ne servent à rien sans segmentation.** Un sélecteur d'arrière-plans
qui n'applique aucun arrière-plan est pire qu'absent : il promet une
fonctionnalité inexistante.

## Ce que le Lot 3 peut livrer, et ce qu'il ne peut pas

**Peut** — le pré-join refondu : aperçu caméra, bascules micro et caméra
gouvernées par les Réglages du Lot 1, choix du périphérique, et l'entrée en
séance.

**Ne peut pas, sans le chantier natif ci-dessus** — le flou, et les huit
arrière-plans.

> **Recommandation : ne pas afficher le panneau d'effets tant que la
> segmentation n'existe pas.** C'est la même règle que celle appliquée à la liste
> « -2 h → +24 h » du Lot 2, et pour la même raison : une surface qu'on ne peut
> pas honorer coûte plus cher que son absence.

## Ce qui reste à vérifier avant de trancher **[?]**

La question d'architecture est réglée (§ ci-dessus). Restent trois **mesures**,
qui décident du coût, pas de la possibilité :

1. **Le coût par image** de MLKit et de Vision sur les appareils visés — c'est
   lui qui dira si l'effet tient 30 images par seconde ou dégrade l'appel.
2. **Le comportement de `registerTrack` avec LiveKit** : une piste enregistrée
   par cette voie est-elle publiable telle quelle par
   `@livekit/react-native` ? La couture existe côté WebRTC ; que le SDK LiveKit
   la reprenne sans rien de plus n'est pas démontré.
3. **Un module tiers maintenu** existe-t-il déjà ? Aucun trouvé au 2026-08-02,
   mais la recherche n'a pas été exhaustive — et en trouver un changerait tout
   l'ordre de grandeur.

La première est la plus importante : un détourage à 8 images par seconde est
pire qu'aucun détourage.

## Ce que cela change pour le Lot 3 **[D]**

Rien, à court terme. Le Lot 3 livre le pré-join **sans** panneau d'effets — la
recommandation ci-dessus tient : une surface qu'on ne peut pas honorer coûte
plus cher que son absence.

Mais la note ne se conclut plus par « impossible ». Elle se conclut par **un
chantier chiffrable**, dont la première étape est la mesure n° 1, et qui peut
être ouvert quand le propriétaire le décidera.
