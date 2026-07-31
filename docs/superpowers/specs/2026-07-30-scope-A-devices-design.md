# Périmètre A — Périphériques et barre de contrôle

Conception arrêtée le 2026-07-30. Deuxième des quatre sous-projets de la barre de contrôle
en séance ; B (participants) est livré, C (interaction) et D (enregistrement) suivent.

Source primaire : `.superpowers/sdd/2026-07-30-scope-A-devices.md`, étude de terrain menée
dans les sources de `@livekit/react-native` 2.12.0, `@livekit/react-native-webrtc` 144.1.2,
`livekit-client` 2.18.0 et du client web de meet. Les renvois `§n` désignent ses sections.
Les faits que ce document ajoute portent leur `fichier:ligne`.

Convention de lecture reprise du rapport : **[V]** vérifié en lisant du code, **[S]** supposé,
non mesuré sur appareil. Une décision qui repose sur un **[S]** le dit.

---

## 1. Le problème

En séance, la barre porte six boutons (`src/screens/room/call.tsx:454-499`). Aucun ne donne
accès à un périphérique :

- Le son sort d'où la plateforme décide. Sur Android, sans casque, c'est le haut-parleur —
  ordre de préférence `bluetooth > headset > speaker > earpiece` subi, jamais choisi (§1.4).
  **Personne ne peut mettre le son sur l'écouteur pour ne pas être entendu du wagon, ni le
  ramener au haut-parleur après avoir débranché un casque que le système garde encore.**
- `switch-camera` (`call.tsx:469-475`) bascule entre deux faces. Sur un iPhone Pro,
  `enumerateDevices()` rend quatre ou cinq caméras (§2.1) : trois sont inatteignables.
- Le dépôt n'appelle jamais `AudioSession.getAudioOutputs()` ni `selectAudioOutput()`
  (§6.3). `src/call/media.ts` fait 29 lignes et trois fonctions.

Ce périmètre ajoute deux commandes : **choisir la sortie audio** et **choisir la caméra**.
Il n'ajoute pas de choix de micro, pour la raison développée en §2.

---

## 2. Ce que la plateforme interdit

Cette section existe pour qu'un implémenteur ne perde pas une journée à essayer une voie
fermée. Chaque ligne est un fait mesuré, pas une préférence.

### 2.1 Faits établis par le rapport

| Fait | Réf. | Ce qu'il ferme |
| --- | --- | --- |
| `AudioSession.getAudioDevices` n'existe pas | §1.1 | La surface réelle est `getAudioOutputs` / `selectAudioOutput` / `showAudioRoutePicker`, et rien d'autre |
| `getAudioOutputs()` a deux implémentations | §1.2 | Android interroge AudioSwitch ; **iOS rend la constante `['default','force_speaker']`, en dur, côté JS** |
| `switchActiveDevice('audiooutput', …)` **lève** en React Native | §3.3 | La sortie audio ne passe jamais par `livekit-client`. Le garde est `!document`, il ne peut pas être satisfait |
| `Room.getLocalDevices('audiooutput')` allume le micro pour rien | §3.4 | Ne jamais appeler `getLocalDevices`. La condition `isDummyDeviceOrEmpty` est toujours vraie sur mobile : `getUserMedia`, réénumération, `[]` |
| Android n'émet **aucun** événement de changement de périphérique | §1.5, §2.4 | `audioDeviceChangeListener` reste une lambda vide ; l'enum `Events` ne porte que du volume |
| `RoomEvent.MediaDevicesChanged` ne se déclenche jamais sur mobile | §3.2 | `isWeb()` est `typeof document !== 'undefined'` ; l'écouteur n'est pas posé |
| `enumerateDevices()` existe **et ment** pour l'audio | §2.1 | Android : un `audioinput` factice libellé `"Audio"`, zéro `audiooutput`. iOS : micros intégrés seulement, zéro `audiooutput` |
| Le `deviceId` audio est décoratif sur Android | §2.3 | `createAudioTrack` ne lit jamais `deviceId`. Un `switchActiveDevice('audioinput', …)` redémarre la piste sans rien changer |
| Le seul recours iOS est `showAudioRoutePicker()` | §1.3 | Une simulation de clic sur un `AVRoutePickerView` hors hiérarchie de vues. **[S]** motif fragile, non mesuré |
| `switchActiveDevice('videoinput', …)` est le chemin qui marche | §3.5 | Le `deviceId` est honoré ; Android le convertit en index (`Integer.parseInt`) |
| Le pré-écran n'a pas de liste | §1.2, §5.5 | `getAudioOutputs()` rend `[]` tant que `startAudioSession()` n'a pas tourné, et `connection.ts` ne l'ouvre qu'à `connect()` |
| Sur Android, un choix manuel **désarme** la bascule automatique | §5.3 | `preferredOutputList` « is ignored when an output is manually selected » |
| `configureAudio()` n'est pas un commutateur de séance | §1.4 | « Must be called prior to connecting to a Room ». Le levier « écouteur » d'iOS est donc hors d'atteinte en cours d'appel |
| `@livekit/react-native` ne ré-exporte ni `useMediaDeviceSelect` ni `useMediaDevices` | §4.2 | Le hook du web est doublement inutilisable : paquet web interdit par `AGENTS.md`, et son observateur ne se déclencherait jamais |

Ajout : `@livekit/components-react` **n'est pas une dépendance de ce dépôt**
(`package.json`, section `dependencies`). La tentation n'existe même pas au niveau du module.

### 2.2 Faits établis par cette conception

Neuf lectures faites ici, que le rapport ne portait pas. Elles changent la conception.

**N1 — Aucune API ne dit d'où sort le son, sur aucune des deux plateformes. [V]**
`AudioSwitchManager.selectedAudioDevice()` existe en Java
(`node_modules/@livekit/react-native/android/src/main/java/com/livekit/reactnative/audio/AudioSwitchManager.java:165`)
mais **n'est pas ponté** : les `@ReactMethod` de `LivekitReactNativeModule.kt` sont
`configureAudio`, `startAudioSession`, `stopAudioSession`, `getAudioOutputs`,
`selectAudioOutput`, et les processeurs audio — aucun getter de sortie courante.
Sur iOS, `getAudioOutputs` est une constante (§1.2). `getAudioOutputs()` rend donc ce qui est
**disponible**, jamais ce qui est **actif**.

C'est le fait le plus structurant de ce périmètre. Il commande le traitement de Q6.

**N2 — `selectAudioOutput()` ne peut pas échouer visiblement sur Android. [V]**
`LivekitReactNativeModule.kt:136-141` :

```kotlin
@ReactMethod
fun selectAudioOutput(deviceId: String, promise: Promise) {
    audioManager.selectAudioOutput(AudioDeviceKind.fromTypeName(deviceId))
    promise.resolve(null)
}
```

`AudioSwitchManager.selectAudioOutput` poste son travail sur un `handler` : la promesse est
**déjà résolue** quand le runnable s'exécute. Et ce runnable ne fait rien si la catégorie
demandée n'est pas dans `availableAudioDevices()`, sans le signaler. Un `deviceId` inconnu
donne `fromTypeName(...) == null`, donc un no-op, résolu.

**N3 — `showAudioRoutePicker()` n'est pas une méthode à promesse. [V]**
`node_modules/@livekit/react-native/ios/LivekitReactNativeModule.m:15` :
`RCT_EXTERN_METHOD(showAudioRoutePicker)` — sans resolver ni rejecter. Le `await` du wrapper
JS attend `undefined`. **Rien ne dit si le sélecteur système est réellement apparu.**

N2 et N3 ensemble : **il n'existe aucun canal d'échec pour la sortie audio.** La conception
ne doit pas en fabriquer un.

**N4 — `enumerateDevices()` est typé `Promise<unknown>`. [V]**
`node_modules/@livekit/react-native-webrtc/lib/typescript/MediaDevices.d.ts` :
`enumerateDevices(): Promise<unknown>`. Toute lecture doit être narrowée à la main. Le champ
`facing` (§2.2 du rapport) n'appartient de toute façon pas à `MediaDeviceInfo`. C'est ce qui
justifie un module pur de parsing plutôt qu'une assertion de type.

**N5 — Le booléen de `switchActiveDevice('videoinput', …)` n'a de sens que si une piste
caméra est publiée. [V]** `node_modules/livekit-client/dist/livekit-client.esm.mjs:26830-26849`
et `:18175-18189`. Caméra allumée : `setDeviceId` rend
`unwrapConstraint(deviceId) === this._mediaStreamTrack.getSettings().deviceId` — une
vérification réelle. Caméra éteinte : `tracks` est vide, `Promise.all([]).every(...)` rend
`true` sans rien vérifier ; seule la préférence est enregistrée dans
`options.videoCaptureDefaults.deviceId`. Le même appel **jette** si `setDeviceId` jette, après
avoir restauré le `deviceId` précédent. **Deux canaux d'échec : la valeur et le rejet.**

**N6 — Le repli silencieux d'Android (§3.5) est détectable. [V]**
`CameraCaptureController.java:75` rend `currentDeviceId`, que `createVideoCapturer` pose à
l'index **réellement retenu**, y compris quand il est arrivé là par le repli `facingMode`
(`:269-312`). `AbstractVideoCaptureController.java:65` le met dans `getSettings()`. iOS fait
de même (`ios/RCTWebRTC/VideoCaptureController.m:200-202`). Donc `getSettings().deviceId`
dit la caméra réellement en service, et le booléen de N5 rend `false` quand le repli a joué.

Corollaire : **`room.getActiveDevice('videoinput')` fonctionne en React Native.**
`livekit-client.esm.mjs:26288-26293` et `:26301-26308` alimentent `activeDeviceMap` depuis
`track.getDeviceId(false)` — sans normalisation, donc sans passer par le piège §3.4 — à
chaque publication et à chaque redémarrage de piste. Contrairement à la sortie audio (N1),
**la caméra courante est lisible**.

**N7 — La barre déborde déjà, avant que ce périmètre n'ajoute quoi que ce soit.**
`node_modules/react-native-paper/src/components/IconButton/IconButton.tsx:156` :
`buttonSize = isV3 ? size + 2 * PADDING : size * 1.5`, avec `PADDING = 8` (`:22`) et
`size = 24` par défaut (`:124`) → **40 dp**. `styles.container` ajoute `margin: 6` (`:221`)
→ **52 dp d'encombrement horizontal par bouton**. `call.tsx:90-96` pose
`gap: tokens.spacing.md` (16) et `padding: tokens.spacing.md` (16).

    6 × 52 + 5 × 16 + 2 × 16 = 424 dp

Un téléphone Android de référence fait 360 dp de large ; l'iPhone le plus étroit encore
supporté, 375 pt. L'arithmétique est **[V]** ; la conséquence visuelle — RN met `flexShrink`
à 0 par défaut, donc les enfants ne se compriment pas — est **[S]**, non mesurée sur appareil.
**Ce périmètre ne peut pas se contenter d'ajouter des boutons.**

**N8 — Le `Menu` de `react-native-paper` exige un `PaperProvider` ancêtre, et les specs
existantes n'en ont pas. [V]** `Menu.tsx:645` monte son contenu dans un `<Portal>`, mais
seulement quand `rendered` est vrai — donc à la première ouverture, pas au montage.
`Portal/PortalConsumer.tsx:31-38` jette « Looks like you forgot to wrap your root component
with `Provider` ». Or `src/screens/room/call.spec.tsx` rend `<CallScreen />` nu.
Les specs existantes continueront de passer ; **toute spec qui ouvre un menu devra envelopper
le rendu dans un `PaperProvider`.**

**N9 — `disabled` sur un `IconButton` ignore `iconColor`, et fait revenir le défaut du
périmètre B. [V]** `node_modules/react-native-paper/src/components/IconButton/utils.ts:88-93` :

```ts
if (theme.isV3) {
  if (disabled) {
    return theme.colors.onSurfaceDisabled;
  }
  if (typeof customIconColor !== 'undefined') {
    return customIconColor;
  }
```

Le test de `disabled` **précède** celui de la couleur passée par l'appelant. Or
`onSurfaceDisabled` vaut `palette.neutral10` — un quasi-noir — dans le thème MD3 **clair**
(`styles/themes/v3/LightTheme.tsx:38`), et le thème de l'application suit le schéma système
(`src/ui/theme.ts`). Un bouton désactivé sur cette barre, sombre dans les deux schémas,
redevient donc du noir sur du noir, **et aucune couleur explicite ne peut le rattraper**.

Conséquence directe : **aucun `IconButton` de cette barre n'utilise `disabled`.** Ce qui n'est
pas actionnable n'est pas rendu. La règle vaut pour les périmètres C et D, qui ajouteront des
boutons ici.

Note connexe, relevée en vérifiant les contrastes : `tokens.color.muted` (`#6B7280`) donne
**3,88:1** sur `surfaceDark` et 4,07:1 sur `backgroundDark`, tous deux **sous** le seuil AA de
4,5:1. Il n'est utilisé nulle part aujourd'hui (`grep` sur `src/`), et ce périmètre ne
l'introduit pas. Sur cet écran, la hiérarchie visuelle se fait par la taille de texte, pas par
un gris qui échoue au contraste.

### 2.3 Ce qu'il reste, une fois tout cela retiré

| Capacité | Android | iOS |
| --- | --- | --- |
| Lister les sorties audio | 4 catégories, jamais des appareils nommés | rien (2 constantes) |
| Choisir une sortie audio | oui, sans retour d'échec (N2) | non — seulement ouvrir le sélecteur système (§1.3, N3) |
| Savoir quelle sortie est active | **non** (N1) | **non** (N1) |
| Lister les caméras | oui, `label` illisible, `deviceId` = index | oui, `label` lisible |
| Choisir une caméra | oui, échec détectable (N5, N6) | oui |
| Savoir quelle caméra est active | oui (N6) | oui (N6) |
| Lister ou choisir un micro | non | non |

---

## 3. Arbitrages retenus

Six questions produit, tranchées le 2026-07-30. Elles ne se rouvrent pas ici ; elles
s'appliquent. Le motif est donné pour qu'une relecture coûte quelques minutes.

### Q1 — Pas de sélecteur de micro. Le micro reste une bascule.

Le choix de la route audio vit dans un **contrôle séparé**, avec sa propre icône.

*Motif* : il n'y a rien à sélectionner en entrée sur mobile (§2.1, §2.3). Un chevron sur le
micro qui ouvrirait en réalité la **sortie** mentirait sur ce qu'il fait. Divergence d'avec le
web, assumée : le chevron audio du web ouvre deux listes (§4.1), et la première n'existe pas
ici.

### Q2 — Un bouton, deux profondeurs.

`showAudioRoutePicker()` sur iOS, notre propre menu alimenté par `getAudioOutputs()` sur
Android. **Aucune dépendance nouvelle** : `react-native-avroutepicker`, que le JSDoc de
LiveKit suggère (§1.3), n'est pas ajouté.

*Motif* : cohérent en surface — un bouton, une icône, une place dans la barre — et honnête en
profondeur, chaque plateforme donnant ce qu'elle sait donner.

### Q3 — Le chevron est conservé, en cible tactile pleine.

Demande explicite du partenaire. Jamais un glyphe de 12 px collé au bouton : un
`IconButton` de plein droit, de la même classe de taille que ses voisins.

*Motif et forme exacte* — c'est N7 qui la détermine, pas le goût :

Sept cibles à 48 dp (recommandation Material) demandent `7 × 48 + gaps` > 385 dp : hors
budget. Sept cibles à 44 dp (recommandation Apple), avec un écart de 1 dp à l'intérieur de la
paire caméra et 8 dp entre groupes, et 4 dp de marge de rangée :

    6 groupes : mic · [caméra|chevron] · sortie · partage · participants · quitter
    7 × 44 + 1 + 5 × 8 + 2 × 4 = 357 dp

Cela tient sur 360 dp et sur 375 pt. **Le coût accepté, nommé** : 44 dp au lieu des 48 dp que
recommande Material sur Android. C'est le prix de sept commandes sur une rangée, et il est
compensé verticalement — voir §4.6.

Deux conséquences forcées par cette géométrie :

1. Le `margin: 6` de Paper est neutralisé par la prop `style`, qui est appliquée **en dernier**
   (`IconButton.tsx:171-184`, la prop `style` clôt le tableau) **[V]**.
2. Le `hitSlop` de 10 dp que Paper pose (`IconButton.tsx:200-204`) **[V]** est plus large que
   les écarts retenus : deux zones tactiles voisines se recouvriraient, et le recouvrement
   irait au frère rendu en dernier. Il est remplacé par `{ top: 8, bottom: 8, left: 0, right: 0 }` —
   généreux là où rien ne gêne, exact là où ça compte. `hitSlop` est bien dans le type de
   `IconButton` (`Props = Omit<$RemoveChildren<typeof TouchableRipple>, 'style'> & {…}`) et
   `{...rest}` est étalé **après** le `hitSlop` par défaut (`:206`) **[V]**.

### Q4 — Nommage normalisé, dans les sept locales.

Les catégories de sortie Android (`bluetooth`, `headset`, `speaker`, `earpiece`) sont
traduites. Les caméras sont nommées depuis `facing`, jamais depuis le `label` brut, **sur les
deux plateformes**.

*Motif* : le `label` Camera2 d'Android est un identifiant illisible (§2.1) ; le web, lui,
affiche le `label` brut sans repli (§4.2), ce qu'on ne peut pas hériter. Normaliser aussi sur
iOS donne une seule logique d'étiquetage.

*Conséquence à traiter* : un iPhone Pro rend plusieurs caméras arrière (§2.1). Nommées depuis
`facing` seul, elles porteraient toutes le même nom. Le nom reçoit donc un **ordinal quand et
seulement quand sa face compte plus d'une caméra** : « Caméra arrière », « Caméra arrière 2 »,
« Caméra arrière 3 ». L'ordre est celui de l'énumération — le seul que la plateforme donne, et
sur Android c'est littéralement l'index qui sert de `deviceId` (§2.1).

### Q5 — Aucune persistance entre séances.

*Motif* : fait mesuré (§5.3) — sur Android, un choix manuel désarme définitivement la bascule
automatique au branchement d'un casque. Persister ce choix le désarmerait pour toutes les
séances suivantes : l'utilisateur qui a un jour forcé le haut-parleur ne verrait plus jamais
son casque pris en compte automatiquement, sans comprendre pourquoi. `livekit-client` reconnaît
d'ailleurs lui-même que l'identité des périphériques n'est pas déterministe sur iOS (§9.2), et
le `deviceId` caméra d'Android est un index positionnel sans garantie de stabilité (§4.4).

`react-native-mmkv` est dans les dépendances et n'est pas utilisé ici.

### Q6 — L'angle mort Android, et ce que l'utilisateur n'aura pas

C'était le seul point resté ouvert. Voici le traitement retenu.

Les faits, réunis : Android n'émet rien (§1.5) ; la route bascule quand même toute seule
(§5.3) ; iOS émet `audioDeviceModuleDevicesUpdated`, un signal sans données (§2.4) ; et
**aucune des deux plateformes ne sait dire quelle sortie est active** (N1).

Ce dernier fait renverse la question. Le rapport proposait de sonder `getAudioOutputs()`
périodiquement (§1.5). **Le sondage n'apporte rien** : il rafraîchirait la liste de ce qui est
*disponible*, jamais de ce qui est *actif*. Même parfait, il ne réduirait pas l'écart. On paie
de la batterie pour une information qu'on n'obtient pas.

Pour la même raison, **l'écouteur iOS n'est pas posé** : l'événement dit « reinterroge », mais
sur iOS `getAudioOutputs()` est une constante (§1.2) — la seconde interrogation rendrait
exactement la première.

Décisions :

1. **Aucun sondage. Aucun écouteur.** Ni sur Android, ni sur iOS.
2. **La liste est relue à chaque ouverture du menu**, et à ce moment seulement. C'est le seul
   instant où l'utilisateur regarde, et le seul où une lecture est utile.
3. **Le contrôle n'affiche jamais un état système.** Son icône est fixe (`volume-high`) : une
   icône de casque affichée pendant que le son sort du haut-parleur serait précisément le
   mensonge d'interface que §5.3 décrit.
4. **La coche du menu marque notre propre choix, pas l'état du système.** Avant tout choix
   manuel, rien n'est coché et une ligne dit que le son suit l'appareil branché. Après, la
   coche marque ce que *nous* avons demandé, et la ligne devient : le son ne suivra plus
   l'appareil branché pour le reste de la séance — ce qui est **[V]** exactement ce que fait
   `AudioSession` (§5.3).
5. **La séance remet tout à zéro.** `stopAudioSession()` au raccrochage
   (`src/call/connection.ts:250,284`) rend son routage automatique à la plateforme, et Q5
   garantit qu'aucun choix ne franchit la frontière d'une séance.

**Ce que l'utilisateur ne pourra pas avoir, écrit noir sur blanc** : l'application ne peut
pas lui dire d'où sort le son. Elle peut lui dire ce qu'il a demandé, et ce qui est
disponible. Sur Android, entre deux ouvertures du menu, un casque branché ou débranché ne
produit aucun changement à l'écran — mais la liste est juste dès qu'il rouvre le menu, et le
son, lui, a bien suivi. Aucune conception ne fait mieux avec ces API.

### Q7 et Q8 — non listées dans les arbitrages, tranchées ici

Le rapport posait huit questions ; les six ci-dessus ont été arbitrées. Les deux autres se
règlent par les faits, sans arbitrage produit.

**Q7 — Pas de sélecteur au pré-écran.** `getAudioOutputs()` rend `[]` tant que
`startAudioSession()` n'a pas tourné (§1.2), et `connection.ts:186` ne l'ouvre qu'à
l'intérieur d'`attempt()`. L'y transposer demanderait d'ouvrir la session audio pendant que
l'utilisateur hésite au pré-écran, donc de détourner le routage audio de tout l'appareil pour
une décision qui n'est pas prise. Et Q5 supprime la persistance, donc il n'y aurait rien à
transporter du pré-écran vers la séance. Hors périmètre, et le motif est définitif, pas
provisoire.

**Q8 — `switch-camera` est retiré.** Trois raisons, dont une décisive :

- N7 : sans ce retrait la rangée porterait huit cibles, ce qui ne tient sur aucun téléphone
  supporté. C'est ce retrait qui rend le périmètre A implantable.
- Sa fonction est un sous-ensemble strict du menu caméra : Q4 nomme les caméras par leur face,
  donc « Caméra arrière » **est** la destination de la bascule.
- La bascule binaire ignore trois caméras sur cinq sur un iPhone Pro (§6.3).

**Ce qui est perdu, nommé** : le retournement passe d'un appui à deux (chevron, puis
« Caméra arrière »). C'est le geste le plus fréquent sur téléphone, et il devient plus lent.
Ce qui le trancherait autrement : une mesure d'usage réel. Nous n'en avons pas, et la
contrainte de largeur, elle, est arithmétique.

---

## 4. Architecture

Séparation reprise du périmètre B, qui en a tiré un grand bénéfice : le **pur** d'un côté
— décision, normalisation, étiquetage, testable sans SDK ni rendu — et le **branché** de
l'autre. Un fichier, une responsabilité.

### 4.1 `src/call/devices.ts` — pur

Aucun import de `livekit-client`, de `@livekit/react-native*`, de `react-native` ni de
`react`. C'est ce qui le rend testable, et c'est ce qui le garde honnête : il ne peut pas
tricher en interrogeant le système.

```ts
// Les quatre catégories de sortie d'Android, et rien d'autre. Ce sont des
// catégories, pas des appareils : deux casques Bluetooth appairés se
// présentent comme une seule entrée « bluetooth » (§1.2).
export type AudioOutputKind = 'bluetooth' | 'headset' | 'speaker' | 'earpiece';

// L'ordre de présentation est celui de la préférence automatique de LiveKit
// (`preferredOutputList`, §1.4) : le haut de la liste est ce que le système
// choisirait tout seul.
export const AUDIO_OUTPUT_ORDER: readonly AudioOutputKind[];

// Le module natif n'est pas typé (`NativeModules.LivekitReactNativeModule`
// traverse un Proxy non typé, `LKNativeModule.ts`). Les valeurs inconnues sont
// jetées, les doublons écrasés, le reste ordonné.
export function readAudioOutputs(raw: readonly unknown[]): readonly AudioOutputKind[];

export type AudioOutputNameKey = `call.output.${AudioOutputKind}`;
export function audioOutputNameKey(kind: AudioOutputKind): AudioOutputNameKey;

// `FacingMode` de `src/call/media.ts` ne connaît que deux valeurs. iOS peut
// rendre `"unknown"` pour une caméra externe ou de position non spécifiée
// (§2.2) : une troisième valeur est donc nécessaire ici, et elle ne remonte
// jamais jusqu'à `layout.ts`.
export type CameraFacing = 'user' | 'environment' | 'unknown';

export type CameraNameKey = 'call.cameraFront' | 'call.cameraBack' | 'call.cameraUnknown';

export type CameraChoice = {
  readonly deviceId: string;
  readonly facing: CameraFacing;
  readonly nameKey: CameraNameKey;
  // `null` quand la face ne compte qu'une caméra. Sinon 1, 2, 3… dans l'ordre
  // d'énumération — le seul que la plateforme donne (Q4).
  readonly ordinal: number | null;
};

// `enumerateDevices()` est typé `Promise<unknown>` (N4) et son champ `facing`
// n'appartient pas à `MediaDeviceInfo`. Cette fonction est le seul endroit du
// dépôt qui regarde cette forme, et elle la regarde sans assertion de type.
// Les entrées sans `deviceId`, ou dont `kind` n'est pas `videoinput`, sont
// jetées — comme le fait le web (§4.2).
export function readCameras(raw: unknown): readonly CameraChoice[];
```

`readCameras` fait deux choses — parser et numéroter — parce qu'elles sont inséparables :
l'ordinal dépend de la liste entière.

Note d'étiquetage : la composition « nom + ordinal » n'est pas faite ici. Le module rend un
**descripteur** (`nameKey`, `ordinal`) ; c'est le composant qui appelle `t()`. Une chaîne
composée en JavaScript ne serait pas traduisible.

### 4.2 `src/call/media.ts` — étendu, et allégé

```ts
export type FacingMode = 'user' | 'environment';          // inchangé
export async function setMicrophoneEnabled(room: Room, enabled: boolean): Promise<void>;  // inchangé
export async function setCameraEnabled(room: Room, enabled: boolean): Promise<void>;      // inchangé

// Passe par `mediaDevices.enumerateDevices()` importé de
// `@livekit/react-native-webrtc` (export vérifié, `src/index.ts:91`), jamais
// par `Room.getLocalDevices` : celui-ci acquiert `getUserMedia` dès que la
// liste filtrée est vide (§3.4). N'est appelé qu'après
// `ensureMediaPermissions()` (`call.tsx:253`), donc avec la permission caméra
// déjà accordée.
export async function listCameras(): Promise<readonly CameraChoice[]>;

// Rend le booléen de `switchActiveDevice`. Il ne vaut vérification que si une
// piste caméra est publiée (N5) ; caméra éteinte, il vaut `true` sans rien
// prouver, et seule la préférence est enregistrée pour le prochain allumage.
// Peut aussi rejeter : deux canaux d'échec, les deux à traiter.
export async function selectCamera(room: Room, deviceId: string): Promise<boolean>;

// Fiable en React Native, contrairement à son homologue audio : `activeDeviceMap`
// est alimentée à chaque publication et à chaque redémarrage de piste depuis
// `getSettings().deviceId`, qui dit la caméra réellement en service (N6).
export function readActiveCameraId(room: Room): string | null;
```

**`switchCamera` est supprimé**, avec le bouton `switch-camera` (Q8). Ses cinq cas de
`media.spec.ts` disparaissent avec lui ; la clé `call.switchCamera` sort des sept locales.

### 4.3 `src/call/audioRoute.ts` — branché, et mince

Séparé de `media.ts` parce que rien ne les relie : la sortie audio ne passe pas par la `Room`
(§3.3), ne connaît pas de piste, et ne partage aucune donnée avec la caméra.

```ts
// 'system' : le sélecteur est celui d'iOS, on ne contrôle ni son apparence ni
// ses libellés (§1.3). 'menu' : le nôtre.
// Rendu comme une valeur plutôt que lu depuis `Platform` par le composant :
// c'est ce qui permet à une spec de rendre les deux branches sans bouchonner
// `Platform`.
export type AudioRouteControl = 'menu' | 'system';
export function audioRouteControl(): AudioRouteControl;

// `[]` tant que `startAudioSession()` n'a pas tourné (§1.2) — c'est-à-dire au
// pré-écran, jamais en séance. Sur iOS, rend toujours `[]` : les deux
// constantes de la plateforme (`default`, `force_speaker`) ne sont pas des
// catégories que `readAudioOutputs` reconnaît, et le mode 'system' ne les
// utilise pas.
export async function listAudioOutputs(): Promise<readonly AudioOutputKind[]>;

// Ne rapporte jamais d'échec : la promesse native est résolue avant que le
// travail ne soit posté, et un identifiant inconnu est un no-op silencieux
// (N2). La signature dit `Promise<void>` parce qu'il n'y a rien d'autre à
// dire ; l'appelant n'a pas d'échec à traiter.
export async function selectAudioOutput(kind: AudioOutputKind): Promise<void>;

// iOS seulement. Le wrapper de LiveKit est déjà gardé par `Platform.OS === 'ios'`
// (`AudioSession.ts:300-304`), et la méthode native n'a pas de resolver (N3) :
// rien ne dit si le sélecteur est apparu.
export async function openSystemRoutePicker(): Promise<void>;
```

### 4.4 `src/screens/room/cameraMenu.tsx`

```tsx
export type CameraMenuProps = {
  readonly cameras: readonly CameraChoice[];
  readonly activeDeviceId: string | null;
  readonly onOpen: () => void;
  readonly onSelect: (choice: CameraChoice) => void;
};

export function CameraMenu(props: CameraMenuProps): React.ReactElement;
```

Le composant possède son booléen `visible` — état d'affichage local, jamais métier — et
appelle `onOpen()` au moment de l'ouvrir, ce qui déclenche la relecture chez le parent. Il
rend le chevron (`chevron-up`, comme le web, §4.1) et son `Menu` ancré dessus, avec
`anchorPosition="top"` puisque la barre est en bas.

`onSelect` rend le `CameraChoice` entier, pas seulement son `deviceId` : l'écran a besoin de
`facing` pour le miroir de la vignette locale (`src/call/layout.ts:119`).

Le chevron est **toujours rendu, jamais désactivé** (N9). Un appareil qui ne rendrait qu'une
caméra ouvrirait un menu d'une ligne : légèrement inutile, jamais cassé. Le cas est de toute
façon théorique sur téléphone, et le traiter coûterait une énumération anticipée dont
personne n'a besoin.

### 4.5 `src/screens/room/audioOutputControl.tsx`

```tsx
export type AudioOutputControlProps = {
  readonly mode: AudioRouteControl;
  readonly outputs: readonly AudioOutputKind[];
  // Ce que *nous* avons demandé pendant cette séance, jamais l'état du système
  // — il n'est pas lisible (N1, Q6).
  readonly chosen: AudioOutputKind | null;
  readonly onOpen: () => void;
  readonly onSelect: (kind: AudioOutputKind) => void;
  readonly onSystemPicker: () => void;
};

export function AudioOutputControl(props: AudioOutputControlProps): React.ReactElement;
```

En `mode === 'system'`, le composant rend **un seul bouton** qui appelle `onSystemPicker` :
pas de menu, pas de liste, pas de coche. En `mode === 'menu'`, un bouton qui ouvre un `Menu`
de `outputs`, coché sur `chosen`, précédé de la ligne d'explication de Q6.

Même icône, même place, même libellé d'accessibilité dans les deux modes (Q2).

### 4.6 `src/screens/room/call.tsx` — câblage et géométrie

L'écran gagne quatre états et cinq rappels, et perd `handleSwitchCamera`.

```ts
const [cameras, setCameras] = useState<readonly CameraChoice[]>([]);
const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
const [outputs, setOutputs] = useState<readonly AudioOutputKind[]>([]);
const [chosenOutput, setChosenOutput] = useState<AudioOutputKind | null>(null);
```

`facing` reste — il alimente `useCallLayout` — et n'est plus posé par `switchCamera` mais
par le `CameraChoice` retenu, en ignorant `'unknown'` (qui n'a pas de miroir défini).

La rangée `styles.controls` change conformément à Q3 : `gap: tokens.spacing.sm` (8),
`padding: tokens.spacing.xs` (4). Un style `styles.barButton` est passé à chacun des sept
`IconButton` : `{ margin: 0, width: 44, height: 44, borderRadius: 22 }` — `borderRadius` est
relu depuis le `style` aplati par `IconButton.tsx:158-161` **[V]**, donc l'ondulation reste
ronde. Et `hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}`.

Ordre retenu, de gauche à droite : `mic-toggle`, `camera-toggle`, le chevron, la sortie audio,
`share-btn`, `participants-toggle`, `leave-btn`. Le chevron colle au bouton caméra (1 dp), les
autres écarts valent 8 dp : la paire se lit comme une paire, ce que le web obtient avec
`gap: '1px'` (§4.1).

**Couleur : la règle, et pourquoi elle est écrite ici.** `call.tsx:87` force
`backgroundDark` dans les deux schémas, alors que le thème Paper suit le schéma système
(`src/ui/theme.ts`). Le périmètre B a livré deux composants sans couleur de texte explicite,
qui sont retombés sur `theme.colors.onSurface` — `#1A1A1A` en schéma clair — soit 1,08:1 sur
le fond sombre. Invisible.

La règle pour ce périmètre : **on surcharge les deux, ou aucun des deux.** Un `Menu` de Paper
laissé intact est cohérent avec lui-même — sa surface vient de `theme.colors.elevation`, son
texte de `theme.colors.onSurface`, les deux du même schéma. Le piège n'apparaît qu'en forçant
l'un sans l'autre. Comme cet écran est sombre dans les deux schémas, les deux menus sont
forcés sombres :

- `contentStyle` → `tokens.color.surfaceDark` (`#121212`)
- `titleStyle` de chaque `Menu.Item` → `tokens.color.textDark` — **15,86:1**
- la ligne d'explication de Q6 → `tokens.color.textDark` également, en `variant="labelSmall"` :
  elle est secondaire par la taille, pas par un gris. `tokens.color.muted` y échouerait au
  contraste (3,88:1, N9)
- `iconColor` de chaque `IconButton` → `tokens.color.textDark` sur `backgroundDark` —
  **16,65:1** — comme les six boutons existants

Aucun de ces styles n'est en ligne : tous viennent d'un `StyleSheet.create` alimenté par
`src/ui/tokens`, comme l'exige `AGENTS.md`.

Et **aucun bouton de cette barre n'est `disabled`** : c'est le seul état où une couleur
explicite est ignorée par Paper, et il ramène le noir sur noir (N9).

### 4.7 Les clés i18n, en entier

Douze clés ajoutées, une retirée, dans les sept locales (`en fr es it de vi ru`).
`src/i18n/index.spec.ts` échoue si l'une manque quelque part — mais **il passe aussi sur une
clé présente partout et remplie d'anglais recopié**, ce qui reste un défaut. Les sept sont
traduites, pas dupliquées.

| Clé | Rôle | Valeur `en` |
| --- | --- | --- |
| `call.output.bluetooth` | catégorie de sortie (Q4) | Bluetooth |
| `call.output.headset` | catégorie de sortie | Wired headset |
| `call.output.speaker` | catégorie de sortie | Speaker |
| `call.output.earpiece` | catégorie de sortie | Earpiece |
| `call.audioOutput` | libellé d'accessibilité et titre du menu | Audio output |
| `call.outputFollowsDevice` | ligne d'explication, avant tout choix (Q6) | Sound follows the device you plug in |
| `call.outputManualUntilEnd` | ligne d'explication, après un choix (Q6, §5.3) | Sound will no longer follow a plugged-in device for the rest of this meeting |
| `call.cameraFront` | nom de caméra depuis `facing` (Q4) | Front camera |
| `call.cameraBack` | nom de caméra depuis `facing` | Back camera |
| `call.cameraUnknown` | face non déterminée (iOS, §2.2) | Camera |
| `call.cameraNumbered` | composition d'un ordinal (Q4) | {{name}} {{index}} |
| `call.selectCamera` | libellé d'accessibilité du chevron | Choose a camera |
| ~~`call.switchCamera`~~ | **retirée** avec le bouton (Q8) | — |

`call.cameraNumbered` existe parce qu'une chaîne composée en JavaScript n'est pas traduisible :
le module pur rend `{ nameKey, ordinal }`, et le composant fait
`t('call.cameraNumbered', { name: t(nameKey), index })` quand `ordinal` n'est pas `null`.

`call.outputFollowsDevice` et `call.outputManualUntilEnd` ne sont posées que sur Android : en
mode `'system'`, il n'y a ni menu ni ligne à afficher.

---

## 5. Flux de données

### 5.1 À l'ouverture du contrôle caméra

`CameraMenu` bascule son `visible` et appelle `onOpen`. `call.tsx` :

```
listCameras()                       → setCameras
readActiveCameraId(session.getRoom()) → setActiveCameraId
```

Deux lectures, un seul instant. Aucun abonnement, aucun sondage : `MediaDevicesChanged` ne se
déclenche jamais (§3.2) et rien d'autre ne notifie. Une caméra USB branchée pendant que le
menu est ouvert n'apparaîtra qu'à la réouverture — cas assez rare sur téléphone pour ne pas
peser sur la conception.

### 5.2 À la sélection d'une caméra

```
selectCamera(room, choice.deviceId)
  ├─ true  → setActiveCameraId(choice.deviceId)
  │          si choice.facing !== 'unknown' → setFacing(choice.facing)
  │          setNotice(null)
  ├─ false → setNotice('call.deviceSwitchFailed')       // repli silencieux d'Android (N5, N6)
  └─ rejet → setNotice('call.deviceSwitchFailed')
```

L'état local n'avance que sur un vrai succès. C'est la même discipline que `handleToggleMic`
(`call.tsx:280-286`), qui remet l'icône où elle était quand la commande échoue : l'interface
ne doit jamais annoncer une caméra qui n'est pas celle qui filme.

Caméra éteinte, `selectCamera` rend `true` sans rien prouver (N5) : c'est correct, la
préférence est bien enregistrée et le prochain `setCameraEnabled(true)` la prendra. Rien à
distinguer côté écran.

### 5.3 À l'ouverture du contrôle de sortie audio

Sur Android : `listAudioOutputs()` → `setOutputs`, puis le menu s'ouvre. Sur iOS : rien à
lire, `openSystemRoutePicker()` part directement — il n'y a pas de menu à peupler.

Si la liste rend `[]` sur Android — cas possible avant `startAudioSession()`, §1.2, mais
inatteignable ici puisque la barre n'est rendue qu'à l'état `connected` (`call.tsx:408-414`)
— le menu s'ouvre sur sa seule ligne d'explication. Pas d'erreur : rien n'a échoué.

### 5.4 À la sélection d'une sortie

```
selectAudioOutput(kind)  →  setChosenOutput(kind)
```

Pas de branche d'échec, parce qu'il n'y en a pas (N2). `setChosenOutput` enregistre ce qui a
été **demandé**, ce que le menu affiche comme tel — jamais comme un état constaté.

C'est aussi l'instant où la bascule automatique est désarmée pour le reste de la séance
(§5.3). Le passage de la ligne d'explication de « le son suit l'appareil branché » à « le son
ne suivra plus l'appareil branché » est déclenché par `chosenOutput !== null`, et il est la
seule occasion qu'a l'utilisateur d'apprendre ce qu'il vient de faire.

### 5.5 Au branchement d'un casque en cours de séance

**Android** : la route bascule seule tant qu'aucun choix manuel n'a été fait (§5.3). Rien ne
change à l'écran, et rien ne peut changer (N1, Q6). Après un choix manuel, la route ne bascule
plus — et la ligne du menu l'a dit au moment du choix.

**iOS** : `AVAudioSession` bascule seule **[S]** (§5.3, non mesuré). L'événement
`audioDeviceModuleDevicesUpdated` existe (§2.4) et n'est pas écouté, pour la raison donnée en
Q6 : ce qu'il inviterait à relire est une constante.

### 5.6 À la reconnexion

`connection.ts` ouvre la session audio dans `attempt()` (`:186`) et ne la referme qu'à
`disconnect()` ou `dispose()` (`:250,284`) **[V]**. Une reconnexion interne au SDK —
`RoomEvent.Reconnecting` puis `Reconnected`, `connection.ts:148-157` — ne repasse pas par
`attempt()`. **La session audio reste ouverte, et le choix de sortie reste en vigueur.**

Côté caméra, la préférence vit dans `room.options.videoCaptureDefaults.deviceId`
(`livekit-client.esm.mjs:26833`) **[V]**, que le SDK réutilise en republiant la piste. **[S]**
Le comportement d'AudioSwitch à travers un redémarrage ICE n'a pas été tracé ligne à ligne :
c'est la mesure à faire si un utilisateur rapporte que le son revient au haut-parleur après
une coupure réseau.

Un raccrochage suivi d'une nouvelle séance repart de zéro : `stopAudioSession()` rend le
routage à la plateforme, et Q5 garantit qu'aucun choix ne franchit cette frontière.

---

## 6. Gestion d'erreur

Le périmètre B a livré un `Snackbar` dans `call.tsx:505-511`, toujours monté, dont seul
`visible` bascule. **Il est réutilisé, pas dupliqué** : deux Snackbars se superposeraient au
même endroit de l'écran.

Le changement est un renommage, pas une refonte : `moderationError` devient `notice`, et
`testID="moderation-error"` devient `testID="call-notice"`. Une case d'erreur suffisait pour
trois actions de modération qui ne partent qu'un geste à la fois (`call.tsx:164-169` en donne
le motif) ; elle suffit pour cinq. Les assertions correspondantes de `call.spec.tsx` suivent
le renommage — mécanique, quelques lignes.

Ce que la Snackbar affiche, et ce qu'elle n'affiche pas :

| Événement | Retour visible | Pourquoi |
| --- | --- | --- |
| `selectCamera` rend `false` | `call.deviceSwitchFailed` | Le repli silencieux d'Android a joué (N5, N6). Sans ce message, l'appui semble n'avoir servi à rien |
| `selectCamera` rejette | `call.deviceSwitchFailed` | Le rejet est le second canal (N5) ; un `.catch()` seul ne verrait pas le premier |
| `selectCamera` réussit | efface la Snackbar | Même règle que les trois actions de modération (`call.tsx:369-374`) : un succès efface l'échec précédent |
| `selectAudioOutput` | **rien** | Il n'existe aucun canal d'échec (N2). Afficher un succès serait du bruit, afficher un échec serait une invention |
| `openSystemRoutePicker` | **rien** | La méthode native n'a pas de resolver (N3). Rien à lire |
| `listCameras` rend `[]` ou rejette | **rien**, menu vide | Le chevron ne peut pas être désactivé (N9), et un message d'erreur pour une liste que l'utilisateur vient tout juste de demander à voir n'aide personne à agir |
| `listAudioOutputs` rend `[]` | **rien**, menu avec sa seule explication | Rien n'a échoué |

Un seul message nouveau. C'est délibéré : quatre des sept lignes ci-dessus n'ont pas d'échec
observable, et la conception refuse d'en simuler un.

---

## 7. Ce qui est testable, et comment

`@testing-library/react-native` 14 est **asynchrone** : `render`, `fireEvent` et ses
raccourcis, `renderHook` et `cleanup` rendent tous des promesses, et `tsc` ne voit pas un
`await` manquant — une promesse non attendue est une expression valide. Chaque appel est
attendu, sans exception.

### 7.1 `src/call/devices.spec.ts` — le cœur du périmètre

Module pur, aucun bouchon. C'est là que porte l'effort, et c'est ce qui sera éprouvé par
mutation comme le reste du projet.

- `readAudioOutputs` : jette les valeurs inconnues, y compris ce qui n'est pas une chaîne
  (le module natif n'est pas typé) ; écrase les doublons ; ordonne selon `AUDIO_OUTPUT_ORDER`
  quelle que soit la forme de l'entrée ; rend `[]` sur `[]`.
- `readCameras` : jette les `audioinput` et les `deviceId` vides comme le web (§4.2) ; mappe
  `"front" → 'user'` (Android §2.1) et `"unknown" → 'unknown'` (iOS §2.2) ; ne pose pas
  d'ordinal quand une face n'a qu'une caméra ; en pose un à partir de deux, numéroté par face
  et non globalement (deux caméras avant et trois arrière donnent 1,2 et 1,2,3) ; survit à
  `undefined`, à un objet, à un tableau d'objets vides.

Le piège que le périmètre B a documenté vaut ici : des données qui ne discriminent pas. Une
fixture où toutes les caméras seraient arrière ne prouverait rien de la numérotation par face.

### 7.2 `src/call/media.spec.ts` et `src/call/audioRoute.spec.ts`

`media.spec.ts` a déjà son double de `Room` (`fakeRoom`) et sa fabrique de publications ; il
gagne `selectCamera` et `readActiveCameraId`, et perd les cinq cas de `switchCamera`.

Ce qui vaut d'être prouvé :

- `selectCamera` transmet bien `'videoinput'` et le `deviceId`, et **rend le booléen du SDK
  tel quel** — ne pas le remplacer par `true` est exactement le défaut que N5 rend possible.
- `listCameras` appelle `mediaDevices.enumerateDevices` et **jamais** `Room.getLocalDevices` :
  une assertion `expect(mockGetLocalDevices).not.toHaveBeenCalled()` porte directement le
  piège §3.4, qui autrement se paierait par un micro qui s'allume tout seul.
- `audioRouteControl()` rend `'system'` sur iOS et `'menu'` ailleurs, en bouchonnant
  `Platform.OS` — le seul endroit du périmètre qui ait besoin de ce bouchon.

### 7.3 Les composants

`cameraMenu.spec.tsx` et `audioOutputControl.spec.tsx` : le câblage, jamais l'apparence.
Quel `deviceId` part avec quel appui, `onOpen` appelé à l'ouverture et pas au montage, un
menu vide qui s'ouvre sans jeter, la coche sur le bon élément, `mode='system'` qui n'ouvre
aucun menu et appelle `onSystemPicker`. Et, puisque N9 en fait une règle : **aucun bouton de
la barre ne porte `disabled`**, ce qu'une spec peut affirmer directement sur les props rendues.

**Toute spec qui ouvre un menu doit envelopper le rendu dans un `PaperProvider`** (N8), sans
quoi le `Portal` jette au moment de l'ouverture. Les spécifications existantes de `call.tsx`,
qui n'ouvrent aucun menu, ne sont pas concernées — mais celles que ce périmètre y ajoutera le
seront.

### 7.4 Ce qu'un test ne peut pas prouver ici

C'est la partie qui compte, parce qu'elle dit où l'assurance s'arrête.

- **Les couleurs ne sont pas rendues.** Aucun style calculé n'existe sous Jest : les rapports
  de contraste de §4.6 sont vérifiés à la main, pas par la suite. C'est précisément comme cela
  que le périmètre B a livré du 1,08:1 avec ses tests au vert.
- **La géométrie n'est pas rendue.** Les 44 dp et les 8 dp de §4.6 sont des constantes d'un
  `StyleSheet` ; une spec qui les affirmerait ne ferait que relire la constante. Le débordement
  de N7 se mesure sur appareil, pas sous Jest.
- **Les périphériques réels ne sont pas énumérables.** `mediaDevices` est bouchonné : rien ne
  prouve qu'Android rend bien `"0"` et `"1"`, ni qu'un iPhone Pro rend cinq caméras. Les
  fixtures viennent de la lecture des sources natives (§2.1), pas d'une mesure.
- **Rien ne prouve que le sélecteur iOS apparaît.** `showAudioRoutePicker` simule un clic sur
  une vue jamais insérée dans la hiérarchie (§1.3) et n'a pas de resolver (N3). Un test ne
  peut vérifier que l'appel, pas l'effet.
- **Rien ne prouve le désarmement de la bascule automatique.** Il est lu dans le JSDoc de
  `AudioSession` **[V]** et gouverne toute la formulation de Q6, mais il ne s'observe que sur
  appareil.

### 7.5 Les trois mesures à faire sur appareil, nommées

1. **`BLUETOOTH_CONNECT` sur Android 12+.** `app.json` déclare `CAMERA`, `RECORD_AUDIO`,
   `MODIFY_AUDIO_SETTINGS` ; le manifeste de `@livekit/react-native` déclare les permissions
   Bluetooth héritées, pré-API 31 (§5.4). L'AAR `com.github.davidliu:audioswitch` vient de
   JitPack et n'est pas dans `node_modules` : impossible de savoir sans build s'il fusionne
   `BLUETOOTH_CONNECT`. **La question à trancher : `getAudioOutputs()` voit-il un casque
   Bluetooth sans demande de permission à l'exécution ?** Si non,
   `src/call/permissions.ts` gagne une demande conditionnelle — c'est le seul endroit qui
   changerait, et le module existe déjà.
2. **Le sélecteur iOS apparaît-il ?** (§1.3, N3.) Si non, le contrôle de sortie n'a rien à
   offrir sur iOS et Q2 se rouvre. Le simulateur ne publie ni caméra ni micro : appareil réel
   obligatoire.
3. **La rangée à sept cibles sur un écran de 360 dp.** N7 donne l'arithmétique ; la mesure
   dira si les 357 dp calculés tiennent avec la densité de police du système poussée au
   maximum.

---

## 8. Ce que ce périmètre ne fait pas

Des limites écrites, parce qu'une limite tue se paie deux fois.

- **Pas de sélecteur de micro.** Il n'y a rien à sélectionner (Q1, §2.1, §2.3).
- **Pas d'affichage de la sortie audio courante.** Aucune API ne la rend (N1). L'application
  dit ce qui est disponible et ce qui a été demandé, jamais ce qui est actif.
- **Pas de nom de casque Bluetooth.** « AirPods de Michel » n'est pas exposé : Android rend
  la catégorie `"bluetooth"`, iOS ne rend rien (§1.2). Deux casques appairés se présentent
  comme une seule entrée.
- **Pas de sondage, pas d'écouteur de branchement.** Ils ne rapporteraient rien qu'on ne
  sache déjà (Q6).
- **Pas de persistance entre séances.** Elle désarmerait la bascule automatique pour toujours
  (Q5, §5.3).
- **Pas de sélecteur au pré-écran.** La liste y est vide par construction (Q7, §1.2, §5.5).
- **Pas d'appel à `configureAudio()`.** Il doit précéder la connexion (§1.4), donc le levier
  « écouteur par défaut » d'iOS reste hors d'atteinte en séance. L'écouteur reste choisissable
  sur Android, où c'est une entrée de `getAudioOutputs()` (§5.2), et **pas sur iOS** — la
  seule asymétrie de fond que Q2 ne masque pas.
- **Pas de dépendance nouvelle.** Ni `react-native-avroutepicker` (Q2), ni
  `@livekit/components-react`, qui est un paquet web et n'est même pas installé.
- **Pas de retournement en un appui.** `switch-camera` est retiré (Q8) ; le geste passe à
  deux appuis.
- **Pas de réglages audio avancés.** Le web a un onglet « Audio settings » et des effets
  d'arrière-plan derrière ses chevrons (§4.1). Rien de cela n'est ici, et rien n'en dépend.
- **Aucune dépendance envers les périmètres B, C ou D.** Le seul contact avec B est le
  `Snackbar` partagé (§6) et le renommage de son `testID`.
