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

## Les trois mesures : deux tranchées, une seule ouverte

La première version de cette note en laissait trois en suspens. **Deux sont
réglées** — relevées dans les sources installées le 2026-08-02, pas déduites.

### Mesure n° 2 — publier une piste enregistrée : **OUI, et sans forker** **[V]**

C'était la question qui décidait de tout : la couture existe côté WebRTC, mais
que `@livekit/react-native` reprenne la piste sans rien de plus n'était pas
démontré. Il le fait, et la chaîne se vérifie en quatre maillons :

| # | Fait | Source |
| --- | --- | --- |
| 1 | `registerTrack(VideoTrack, VideoSource, AbstractVideoCaptureController, SurfaceTextureHelper)` est `public` | `WebRTCModule.java:487` |
| 2 | `MediaStreamTrack` est une classe JS ordinaire, construite depuis un **descripteur** `{id, kind, enabled, readyState, remote, peerConnectionId}` — **rien ne la lie à `getUserMedia`** | `MediaStreamTrack.ts:54-70` |
| 3 | elle est **exportée** du paquet, donc constructible depuis l'extérieur | `index.ts:85` |
| 4 | `publishTrack(track: LocalTrack \| MediaStreamTrack, …)` accepte une piste brute | `LocalParticipant.d.ts:132` |

**Le maillon qu'on croyait manquant est le n° 2.** Une piste JS n'est pas un
objet natif : c'est un **identifiant** plus quelques champs. Un module natif qui
appelle `registerTrack` et rend ce descripteur à JavaScript suffit donc — JS
construit la `MediaStreamTrack`, `livekit-client` la publie, et ni
`react-native-webrtc` ni le SDK LiveKit n'ont besoin d'être modifiés.

Côté iOS, la couture est confirmée dans la version installée :
`peerConnectionFactory` (ligne 40) et `localTracks` (ligne 46) sont des
propriétés **publiques** de `WebRTCModule.h`.

### Mesure n° 3 — un module tiers maintenu : **NON, mais l'architecture est éprouvée** **[V]**

Aucun paquet publié ne fait cela pour React Native + LiveKit. Ce qui existe est
soit **web** (`@livekit/track-processors`, MediaPipe), soit lié à un **autre
SDK** (`@100mslive/react-native-video-plugin`, pour 100ms et non LiveKit).

En revanche, **la voie a été parcourue** : Margelo décrit publiquement une
implémentation dont le flux est exactement celui que cette note propose —
`VisionCamera → moteur d'effets natif → VideoSource LiveKit → encodeur WebRTC`.
C'est du sur-mesure, pas un paquet à installer : cela **valide l'architecture
sans livrer le code**.

**Ce que ça change quand même** : `react-native-vision-camera` remplace le
capteur de WebRTC et rend les images au natif, ce qui évite d'écrire un
`AbstractVideoCaptureController` complet à partir de zéro. Le module à écrire se
réduit alors à : segmenter l'image, composer, pousser dans le `VideoSource`.
`react-native-vision-camera` n'est **pas** installé ici — c'est une dépendance à
ajouter, avec sa propre compatibilité SDK à vérifier.

### Mesure n° 1 — le coût par image : **toujours ouverte, et c'est la seule** **[?]**

MLKit et Vision sur les appareils visés. Elle ne se fait **que sur appareil**, et
elle décide du coût, plus de la possibilité. Un détourage à 8 images par seconde
est pire qu'aucun détourage.

C'est désormais **le seul inconnu** de ce chantier.

### Au passage, un fait qui ne concerne pas ce chantier **[V]**

`WebRTCModule.h:48-49` expose `frameCryptors` et `keyProviders`. **Le chiffrement
de bout en bout n'est donc pas un manque natif** : la machinerie est là, dans le
paquet installé. Ce qui manque est côté JavaScript — `new Room()` est construit
sans options E2EE (`connection.ts:76`) — et surtout la décision de **comment la
clé circule**. Voir la spec du Lot 4, où la mention « Chiffré » a été retirée
faute de pouvoir la mesurer.

## Ce que cela change pour le Lot 3 **[D]**

Rien, à court terme. Le Lot 3 a livré le pré-join **sans** panneau d'effets — la
recommandation ci-dessus tient : une surface qu'on ne peut pas honorer coûte
plus cher que son absence.

Mais la note ne se conclut plus par « impossible ». Elle se conclut par **un
chantier chiffrable**, dont la première étape est la mesure n° 1.

## L'ordre dans lequel ce chantier doit être fait **[D]**

Écrit après que deux des trois mesures aient été tranchées. L'ordre n'est pas
esthétique : chaque étape peut **tuer** le chantier, et elles sont rangées de la
moins chère à la plus chère.

| # | Étape | Ce qu'elle décide | Coût |
| --- | --- | --- | --- |
| 1 | mesurer MLKit sur un Android visé, hors de l'application — une activité jetable, un compteur d'images | si l'effet tient 30 i/s. **Sous ~24, on s'arrête ici** | quelques heures, un appareil |
| 2 | idem `VNGeneratePersonSegmentationRequest` sur iOS | même verdict, l'autre plateforme | idem, un iPhone réel — le simulateur ne publie pas de caméra |
| 3 | prouver la chaîne SANS segmentation : `registerTrack` d'une piste **de couleur unie**, publiée et vue par un second participant | que les quatre maillons du § « mesure n° 2 » tiennent **en exécution**, pas seulement dans les déclarations | un module natif minimal, Android d'abord |
| 4 | brancher la segmentation mesurée à l'étape 1 sur la chaîne prouvée à l'étape 3 | rien — c'est de l'assemblage | le gros du travail |
| 5 | le panneau d'effets, les huit arrière-plans DINUM (163 Ko de vignettes) | rien | petit, et **jamais avant l'étape 4** |

**L'étape 3 avant l'étape 4, et c'est le point de méthode.** Un module qui
segmente ET publie, écrit d'un bloc, ne dit pas laquelle des deux moitiés est en
cause quand rien n'arrive. Une piste unie qui apparaît chez le pair prouve la
plomberie ; c'est l'application, dans ce dépôt, de la règle « mesurer le
stimulus, pas seulement la réponse ».

**Et jamais l'étape 5 en premier**, quel que soit le confort de la livrer : un
sélecteur d'arrière-plans qui n'applique aucun arrière-plan est exactement la
surface qu'on ne peut pas honorer.

## Sources

- [Margelo — Building a Video Call App with Filters](https://blog.margelo.com/building-videocall-app-with-filters)
- [livekit/track-processors-js](https://github.com/livekit/track-processors-js) — **web uniquement**
- [@100mslive/react-native-video-plugin](https://www.npmjs.com/package/@100mslive/react-native-video-plugin) — autre SDK
- [react-native-webrtc #1502](https://github.com/react-native-webrtc/react-native-webrtc/issues/1502) — la même question, posée en amont
