# Sorties audio par appareil — conception

**Date** : 2026-08-02
**État** : conception, non implémentée. **Trois décisions attendent la confirmation du
propriétaire** — elles sont marquées comme telles et rien ne doit être écrit avant.
**Branche** : `design/audio-devices`, sur `bc59108`.
**Reprend** : `2026-07-30-scope-A-devices-design.md`, qui a livré `src/call/audioRoute.ts`,
`src/call/devices.ts` et `src/screens/room/audioOutputControl.tsx`. Ce document révise une
seule de ses décisions — celle qui dit que la sortie audio se présente **par catégorie**.

Convention de lecture reprise des périmètres A à D : **[V]** vérifié en lisant du code, en
désassemblant un binaire ou en exécutant une commande — la source est nommée à chaque fois ;
**[S]** supposé, non mesuré. Une décision qui repose sur un **[S]** le dit.

---

## Le besoin, dans les mots du propriétaire

Il utilise plusieurs casques et une Tesla. Aujourd'hui l'application liste des **catégories** :
une ligne « Bluetooth », et rien qui dise **lequel** de ses appareils recevra le son. Il veut
deux choses :

1. voir la liste **par appareil, nommé** ;
2. que la bascule vers le Bluetooth soit **automatique par défaut** — on allume un casque, le
   son suit ; on monte en voiture, le son suit la voiture.

Ce document dit ce que chacune coûte. Elles ne coûtent pas la même chose, et l'une des deux
est **déjà livrée sans que personne le lui ait dit**.

---

## Le second besoin est déjà satisfait — et c'est le premier fait à établir

`AudioSwitchManager.java:120-124` construit sa liste de préférence dans cet ordre :
`BluetoothHeadset`, `WiredHeadset`, `Speakerphone`, `Earpiece`. **[V]** L'application ne
l'écrase pas : `AudioSession.configureAudio()` n'est appelé nulle part dans `src/`
(`grep -rn "configureAudio" src/` → aucun résultat hors commentaires). **[V]**

À chaque appareil qui apparaît, `AbstractAudioSwitch.onDeviceConnected` l'ajoute à l'ensemble
disponible puis rappelle `selectAudioDevice(...)`, qui recalcule le meilleur appareil par
`getBestDevice()` **[V]** — désassemblé depuis
`audioswitch-89582c47c9a04c62f90aa5e57251af4800a62c9a-runtime.jar`. Bluetooth étant en tête de
liste, il gagne dès qu'il est actif.

**Donc : allumer un casque en séance route déjà le son vers lui, sans rien toucher.** C'est
conforme à ce que la mesure sur appareil rapporte — sélectionner Bluetooth route vers
`bt_sco_hs`, sélectionner le haut-parleur route vers `speaker`, couper le Bluetooth en pleine
séance retombe sur le haut-parleur. **[V, rapporté par le propriétaire, non reproduit ici]**

Une seule chose désarme ce comportement : **un choix manuel dans la feuille**. Et le texte de
la feuille le dit déjà (`call.outputManualUntilEnd`, `en.json:55`). **[V]**

> **Conséquence de méthode** : la partie « automatique » du besoin ne demande **aucun code**.
> Elle demande que l'interface cesse de donner l'impression du contraire. Tout le reste de ce
> document ne porte donc que sur le **nommage** et sur la **sélection par appareil**.

---

## Les faits, et leur source

### 1. Le pont JavaScript ne connaît que quatre chaînes **[V]**

`AudioSession.getAudioOutputs()` est typé `Promise<string[]>`
(`node_modules/@livekit/react-native/src/audio/AudioSession.ts:274-282`) ; son commentaire
énumère les quatre valeurs Android, et le type de `preferredOutputList`
(`AudioSession.ts:33`) les fixe formellement :
`('speaker' | 'earpiece' | 'headset' | 'bluetooth')[]`. `selectAudioOutput(deviceId: string)`
(`AudioSession.ts:291-293`) prend l'une d'elles.

`src/call/devices.ts:20-27` (`readAudioOutputs`) jette tout le reste et déduplique. C'est
correct pour ce que le pont rend, et c'est aussi ce qui plafonne l'écran.

### 2. Le nom existe côté natif, et il est jeté à une ligne précise **[V]**

`AudioDevice` est une classe scellée dont **chaque** variante porte un nom :

```
public abstract class com.twilio.audioswitch.AudioDevice {
  public abstract java.lang.String getName();
}
```

(`javap` sur le jar.) Les valeurs par défaut sont, en dur et **en anglais** :
`"Bluetooth"`, `"Wired Headset"`, `"Earpiece"`, `"Speakerphone"`
(`AudioDevice.kt`, `davidliu/audioswitch@dl/jitpack`). **[V]**

Le nom meurt ici :

```kotlin
// LivekitReactNativeModule.kt:130-134
fun getAudioOutputs(promise: Promise) {
    val deviceIds = audioManager.availableAudioDevices()
        .mapNotNull { device -> AudioDeviceKind.fromAudioDevice(device)?.typeName }
    promise.resolve(Arguments.makeNativeArray(deviceIds))
}
```

`AudioDeviceKind.fromAudioDevice` compare `device.getClass()` aux quatre classes connues et
rend un `typeName` (`AudioDeviceKind.java:22-29`). L'objet est réduit à sa **classe**, et
`getName()` n'est jamais appelé. **C'est un défaut du pont, et il se corrige en une ligne.**

### 3. Mais AudioSwitch n'a qu'**un** emplacement Bluetooth — et c'est structurel **[V]**

C'est le fait qui décide de tout le document, et il n'apparaît pas à la lecture du pont.

`getAvailableAudioDevices()` n'est pas une liste construite : c'est la conversion d'un
ensemble.

```
public final java.util.List<AudioDevice> getAvailableAudioDevices();
   0: getfield  availableUniqueAudioDevices:Ljava/util/SortedSet;
   7: invokestatic CollectionsKt.toList
```

Et ce `SortedSet` est ordonné par `AudioDevicePriorityComparator`, dont le corps commence
par :

```kotlin
val o1Clazz = o1.javaClass
val o2Clazz = o2.javaClass
if (o1Clazz == o2Clazz) {
    return 0
}
```

Un `SortedSet` traite `compare(...) == 0` comme une **égalité**. Deux `BluetoothHeadset`,
quels que soient leurs noms, sont donc **le même élément** : le second est silencieusement
absorbé par `add()`. Vérifié à deux endroits — dans le bytecode du jar effectivement embarqué,
et dans la source à la tête de la branche `dl/jitpack` du fork (2026-05-18), où le comparateur
est **inchangé** et l'ensemble est devenu un `ConcurrentSkipListSet` du même comparateur
(`AbstractAudioSwitch.kt:177-178`). **[V]**

> **Deux casques allumés donnent une entrée. La Tesla et un casque donnent une entrée.**
> Ce n'est pas une limite du pont : c'est le modèle de données d'AudioSwitch, à toutes les
> versions inspectées.

`BluetoothHeadsetManager` le confirme du côté de la découverte : un seul champ `headsetProxy`,
et une méthode **privée et singulière** `getHeadsetName()` qui, quand le proxy voit plusieurs
appareils connectés, retourne le nom de celui dont `isAudioConnected()` est vrai —
un nom, jamais une liste. **[V]**

### 4. Pire : `isDeviceActive` ne vérifie pas le nom, il le recopie **[V]**

```
getHeadset(String name):
    if (!hasPermissions()) return null            // « Bluetooth unsupported, permissions not granted »
    if (headsetState != Disconnected)
        return BluetoothHeadset(name ?: getHeadsetName())
    return null
```

La méthode **renvoie l'appareil qu'on lui décrit**, sans jamais vérifier qu'un casque de ce
nom est connecté. Et `LegacyAudioDeviceScanner.isDeviceActive` s'appuie exactement là-dessus
pour un `BluetoothHeadset`. **[V]**

Donc, même en supposant qu'on parvienne à faire remonter deux noms jusqu'à l'écran :
`selectDevice(BluetoothHeadset("Sony WH-1000XM4"))` serait accepté sans broncher alors que
c'est la Tesla qui est en ligne. **Une sélection par nom, dans l'architecture actuelle, est un
mensonge d'interface qui compile.**

### 5. Sélectionner, c'est choisir une **classe** ; router, c'est `startBluetoothSco()` **[V]**

`AudioSwitchManager.selectAudioOutput(Class)` parcourt les appareils disponibles et prend le
**premier** de la classe demandée (`AudioSwitchManager.java:184-202`, le `break` est à la
ligne 193).

Et l'activation, en bout de chaîne, est :

```
AudioDeviceManager.enableBluetoothSco(boolean):
   22: invokevirtual android/media/AudioManager.startBluetoothSco:()V
   30: invokevirtual android/media/AudioManager.stopBluetoothSco:()V
```

**`startBluetoothSco()` ne prend aucun argument.** C'est le système qui décide vers quel
appareil SCO le son part. Aucune couche au-dessus ne peut le désigner.

Relevé dans `~/Library/Android/sdk/platforms/android-36/data/api-versions.xml` : **[V]**

| Méthode | Depuis | Dépréciée |
|---|---|---|
| `AudioManager.startBluetoothSco()` | 8 | **34** |
| `AudioManager.setSpeakerphoneOn(boolean)` | origine de la classe | **34** |
| `AudioManager.setCommunicationDevice(AudioDeviceInfo)` | **31** | — |
| `AudioManager.getAvailableCommunicationDevices()` | **31** | — |
| `AudioManager.clearCommunicationDevice()` | **31** | — |
| `AudioManager.getCommunicationDevice()` | **31** | — |
| `AudioManager.addOnCommunicationDeviceChangedListener(...)` | **31** | — |

Le manifeste **fusionné** porte `<uses-sdk android:minSdkVersion="24"
android:targetSdkVersion="36"/>` — relevé dans
`android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml:4`,
arborescence générée par `expo prebuild`, donc non versionnée et à régénérer pour être
revue. Le défaut 36 vient d'Expo SDK 57
(`node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle:69` :
`targetSdkVersion project.ext.safeExtGet("targetSdkVersion", 36)`), le plancher 24 de
`app.json`. **[V]**

> **Les deux mécanismes de routage qu'AudioSwitch emploie sont dépréciés depuis l'API 34, et
> l'application cible la 36.** Ce n'est pas encore cassé — une API dépréciée fonctionne — mais
> cela change le cadre de la question 1 : le remplacement recommandé par la plateforme est
> exactement l'API qui donne les noms.

### 6. Un choix manuel désarme la préférence, mais seulement tant que l'appareil reste actif **[V]**

La documentation de LiveKit dit « This is ignored when an output is manually selected »
(`AudioSession.ts:10-11`). Le bytecode dit la même chose, en plus précis :

```
selectDevice(device):  userSelectedAudioDevice = device;  selectAudioDevice(false, device)

getBestDevice():
    if (userSelectedAudioDevice != null && scanner.isDeviceActive(userSelectedAudioDevice))
        return userSelectedAudioDevice
    return first(availableUniqueAudioDevices) { scanner.isDeviceActive(it) }
```

Donc le choix manuel gagne **tant que l'appareil choisi est actif**, et la préférence
automatique reprend la main dès qu'il ne l'est plus. `setUserSelectedAudioDevice` est
**`protected`** (`javap` sur `AbstractAudioSwitch`) : **aucun appelant extérieur ne peut
remettre le champ à `null`.** Il n'existe donc, ni en JavaScript ni en Java depuis
`AudioSwitchManager`, aucune valeur qui signifie « reviens en automatique ». **[V]**

### 7. Rien ne remonte l'état courant, ni un changement **[V]**

`AudioSwitchManager` expose `selectedAudioDevice()` (ligne 164-172) et un champ public
`audioDeviceChangeListener` (lignes 31-34). `LivekitReactNativeModule.kt` **n'utilise ni l'un
ni l'autre** : `grep -n "selectedAudioDevice\|audioDeviceChangeListener"` sur le module ne
rend rien, et le listener reste la lambda vide par défaut. **[V]**

C'est ce que les commentaires de `callControlBar.tsx:155-160` et `audioOutputControl.tsx:22`
constatent déjà : l'écran affiche ce que **nous** avons demandé, jamais ce que le système
fait.

### 8. L'API moderne existe, donne les noms **par appareil**, et donne l'événement **[V]**

Relevé dans `android-36/android.jar` : `AudioDeviceInfo` porte `getId(): int`,
`getType(): int`, `getProductName(): CharSequence` et `getAddress(): String` (celui-ci depuis
l'API 28), avec `TYPE_BLUETOOTH_SCO` et `TYPE_BLUETOOTH_A2DP`. **[V]**

`getAvailableCommunicationDevices()` rend une `List<AudioDeviceInfo>` — **une entrée par
appareil**, pas par catégorie —, `setCommunicationDevice(info)` en désigne un et rend un
booléen, `clearCommunicationDevice()` rend la main au système, et
`addOnCommunicationDeviceChangedListener` notifie les changements de route **y compris ceux
qu'un autre composant provoque**. C'est très exactement l'ensemble de ce qui manque.

### 9. Le correctif amont existe déjà — et il n'est pas arrivé **[V]**

`node_modules/@livekit/react-native/android/build.gradle:130` épingle :

```
api 'com.github.davidliu:audioswitch:89582c47c9a04c62f90aa5e57251af4800a62c9a'
```

Ce commit est daté du **2023-10-16** (« Stop bluetooth sco on deactivate (#3) »,
API GitHub). La branche par défaut du fork, `dl/jitpack`, contient depuis le **2026-04-20** :

- `scanners/CommunicationDeviceScanner.kt` — `@RequiresApi(S)`, découverte par
  `getAvailableCommunicationDevices()`, rafraîchie par `registerAudioDeviceCallback` **et**
  `addOnCommunicationDeviceChangedListener` ;
- `CommDeviceAudioSwitch.kt` — « routes playout using `AudioManager.setCommunicationDevice` …
  instead of toggling speakerphone and Bluetooth SCO », dont `onActivate` appelle
  `setCommunicationDevice(deviceInfo)` et `onDeactivate` appelle `clearCommunicationDevice()` ;
- et, dans `onDeviceDisconnected`, un vrai retour à l'automatique :
  `if (userSelectedAudioDevice == audioDevice) userSelectedAudioDevice = null`.

Et la conversion porte le nom **par appareil** :

```kotlin
internal fun AudioDeviceInfo.toTwilioAudioDevice(): AudioDevice? = when {
    type == TYPE_BLUETOOTH_SCO || type == TYPE_BLUETOOTH_A2DP ->
        AudioDevice.BluetoothHeadset(productName.toString())
    …
}
```

`@livekit/react-native` a publié **2.11.1 le 2026-06-18** et **2.12.0 le 2026-07-23**
(`npm view @livekit/react-native time`) : **deux versions, plus de trois mois**, sans que
l'épingle bouge. Le jar présent dans le cache Gradle ne contient effectivement que
`LegacyAudioDeviceScanner` — pas de `CommunicationDeviceScanner`, pas de
`CommDeviceAudioSwitch`. **[V]**

C'est la mesure la plus utile qu'on ait sur le **délai d'un aller-retour amont** : du code
déjà écrit et déjà fusionné dans une dépendance que l'éditeur contrôle lui-même n'a pas
atteint une release en trois mois et deux versions mineures.

### 10. …et il ne suffirait pas **[V]**

`CommDeviceAudioSwitch` hérite d'`AbstractAudioSwitch`, donc du `SortedSet` du fait 3, donc du
comparateur qui rend `0` pour deux appareils de même classe. **Même à la tête du fork, deux
casques Bluetooth restent une seule entrée.** Le scanner moderne découvre les deux, avec leurs
noms ; l'ensemble en jette un.

Un correctif amont qui livrerait ce que le propriétaire demande doit donc toucher **trois**
choses, dans cet ordre de dépendance : le comparateur et l'ensemble d'`AbstractAudioSwitch`
(fork `davidliu/audioswitch`) → l'énumération et la sélection d'`AudioSwitchManager` et du
pont (`@livekit/react-native`) → une release. Ce n'est pas un aller-retour, c'est une chaîne
de trois dépôts.

### 11. La Tesla n'est rien de spécial — et c'est une bonne nouvelle **[V, rapporté]**

Appairée, classe `0x240408` (Audio/Vidéo → mains-libres), UUID incluant `0x111e` (Handsfree).
C'est un appareil HFP ordinaire. **Il n'y a aucun code spécifique à reconnaître**, et il ne
faut surtout pas en écrire : tout ce qui vaut pour elle vaut pour n'importe quel kit
mains-libres. Relevé sur l'appareil du propriétaire ; non reproduit dans ce worktree.

### 12. Les permissions sont déjà en place, et c'est déjà motivé **[V]**

Le manifeste fusionné porte `BLUETOOTH_CONNECT`, `MODIFY_AUDIO_SETTINGS`, `RECORD_AUDIO`,
`CAMERA`. `src/call/permissions.ts:41-50` demande `BLUETOOTH_CONNECT` à l'exécution au-delà de
l'API 31, séparément des permissions média pour qu'un refus ne bloque pas l'entrée en séance.

`BluetoothHeadsetManager$DefaultPermissionsCheckStrategy` teste `android.permission.BLUETOOTH`
**ou** `android.permission.BLUETOOTH_CONNECT` selon la version (bytecode). Sans ce grant,
`getHeadset()` rend `null` et la ligne Bluetooth **disparaît sans se signaler** — ce que le
commentaire de `permissions.ts:27-40` documente déjà.

**Rien de nouveau n'est requis** pour lire des noms via `AudioDeviceInfo` : le SDK 36 ne porte
aucune annotation `@RequiresPermission` sur `getAvailableCommunicationDevices`,
`setCommunicationDevice` ni `AudioDeviceInfo.getProductName` (`annotations.zip`, recherche
vide). L'absence d'annotation n'est **pas** une preuve — voir « ce que je n'ai pas pu établir ».

### 13. Un module natif a une forme supportée qui respecte la génération continue **[V]**

`expo-modules-autolinking` cherche les modules locaux dans `./modules` par défaut
(`build/commands/autolinkingOptions.js:170-172` : `nativeModulesDir` sinon
`resolvePathMaybe('./modules', appRoot)`).

Un module Expo local vit donc dans `modules/`, **versionné**, autolié sans entrée dans
`app.json` et sans toucher `android/`, qui reste gitignoré et régénéré par `expo prebuild`.
C'est compatible avec la règle du dépôt ; ce serait le premier module natif de ce projet.

---

> ### Décision du 2026-08-02, prise par le propriétaire : **le périmètre complet**, choix par appareil compris
>
> Ce document recommandait un module en **lecture seule** — afficher le vrai nom, laisser
> AudioSwitch piloter — et de reporter le choix entre deux Bluetooth jusqu'à ce qu'une mesure
> en voiture prouve qu'il est cassé. **Cette recommandation a été écartée.** Le périmètre
> retenu est le complet : reprendre le volant à AudioSwitch et sélectionner par appareil.
>
> Ce que cela engage, et qui reste vrai malgré la décision :
>
> - Il faut porter le **focus audio, le mode audio et le cycle SCO** d'une application de
>   visioconférence en production. Deux choses qui arbitrent le même canal restent la cause
>   classique du « le son rebascule tout seul ».
> - `startBluetoothSco()` et `setSpeakerphoneOn()` sont **dépréciés depuis l'API 34** alors que
>   le manifeste vise 36 : reprendre le pilotage veut dire passer à
>   `setCommunicationDevice`, donc un **plancher API 31** à garder pendant que `minSdkVersion`
>   reste à 24.
> - Le comparateur d'AudioSwitch rend `0` pour deux appareils de même classe, et un `SortedSet`
>   y lit une égalité : **le second Bluetooth n'est jamais ajouté**. Le nom seul ne suffirait
>   donc pas à en choisir un — ce qui est précisément l'argument qui rend cette décision
>   cohérente.
> - `getHeadset(name)` **rend le nom qu'on lui passe** sans vérifier qu'un casque de ce nom
>   soit connecté. Toute sélection par nom bâtie sur AudioSwitch serait un mensonge
>   d'interface qui compile : raison de plus de ne pas la bâtir dessus.
>
> **La mesure en voiture reste due, et elle n'est plus un préalable mais un garde-fou** : elle
> dira si Android choisissait déjà correctement, donc si le pilotage repris fait mieux ou
> moins bien que ce qu'il remplace. Sans elle, aucun moyen de savoir si la reprise est un
> progrès.
>
> **Livraison amont** : module Expo local d'abord, PR à `@livekit/react-native` ensuite —
> recommandation suivie. Ni fork, ni `patch-package`.

## Les trois questions

Chacune se termine par une recommandation. **Aucune n'est arrêtée : ce sont trois décisions
que le propriétaire doit confirmer.**

### Q1 — Qui tient le volant en dernier ressort

**Le risque, nommé.** AudioSwitch gère aujourd'hui, ensemble : la route, le focus audio
(`setAudioFocus`), le mode audio (`MODE_IN_COMMUNICATION`), le cycle de vie SCO et le
haut-parleur. Si nous appelons `setCommunicationDevice()` depuis un module à nous pendant
qu'il tourne, **deux arbitres tiennent le même canal**. Le prochain
`onDeviceConnected` — un casque qui s'allume, la voiture qui se connecte — rappelle
`selectAudioDevice(...)` puis `onActivate`, donc `startBluetoothSco()` ou
`setSpeakerphoneOn()`, et écrase notre choix. C'est la cause classique du « le son est reparti
tout seul », et c'est **invisible en test** : RNTL ne route rien.

**Peut-on le désarmer proprement ?** Non. `shouldHandleAudioRouting()` rend
`forceHandleAudioRouting || audioMode == MODE_IN_COMMUNICATION || audioMode == MODE_IN_CALL`
(`AbstractAudioSwitch.kt:335-339` à la tête du fork ; la méthode existe à l'identique dans le
jar embarqué, `protected final boolean shouldHandleAudioRouting()` sous `javap`) **[V]**. Le
seul levier exposé par le pont est
`configureAudio({android:{audioTypeOptions:{audioMode:'normal'}}})` — ce qui couperait le
routage d'AudioSwitch **et** placerait la séance hors du mode communication, que la
documentation du module désigne nommément comme la condition pour que les micros Bluetooth
fonctionnent (`AudioSession.ts:127-136`). C'est un échange perdant.

Prendre le volant, c'est donc **remplacer** `AudioSwitchManager`, pas cohabiter avec lui.

> **Recommandation Q1 — laisser AudioSwitch conduire. N'ajouter aucun second arbitre.**
> Notre module natif, s'il existe, est en **lecture seule** : `getAvailableCommunicationDevices()`,
> `getCommunicationDevice()`, `addOnCommunicationDeviceChangedListener`. Jamais
> `setCommunicationDevice`, jamais `clearCommunicationDevice`. Écrire reste le travail
> d'AudioSwitch, par `AudioSession.selectAudioOutput(kind)`, inchangé.
>
> **Ce que ça donne** : le nom réel de l'appareil qui reçoit le son, une liste par appareil à
> l'affichage, et — pour la première fois — un **état constaté** et un **événement de
> changement**, qui lèvent les deux angles morts que le périmètre A avait dû assumer.
> **Ce que ça ne donne pas** : choisir *lequel* de deux casques Bluetooth reçoit le son.
>
> **Le raisonnement** : la moitié la moins chère du besoin est aussi celle qui répond à la
> phrase exacte du propriétaire — « je ne peux pas savoir lequel il va utiliser ». La moitié
> chère (choisir) exige de déplacer AudioSwitch, ce qui met à notre charge le focus audio, le
> mode et le cycle SCO d'une application de visioconférence en production. Et le fait 3 dit
> que même un amont parfait ne la donnerait pas sans une refonte de son modèle de données.

### Q2 — Ce que la feuille montre quand plusieurs appareils sont connectés

Les contraintes, toutes mesurées plus haut : une seule entrée Bluetooth possible (fait 3) ; un
nom disponible seulement pour le Bluetooth, les autres catégories n'ayant que des constantes
anglaises en dur — `"Wired Headset"`, `"Speakerphone"`, `"Earpiece"` (fait 2) — que les
libellés localisés du dépôt (`call.output.*`, sept locales) battent à plate couture.

> **Recommandation Q2 — le nom remplace le libellé de la seule ligne Bluetooth ; les trois
> autres restent des catégories localisées.**
>
> - **Bluetooth** : le `productName` de l'appareil vers lequel le son part réellement
>   (« Tesla Model 3 », « WH-1000XM4 »). Un nom lu, jamais deviné.
> - **Filaire, haut-parleur, écouteur** : `call.output.headset`, `.speaker`, `.earpiece`,
>   inchangés. Ce ne sont pas des produits, ce sont des sorties de l'appareil.
> - **Nom absent, illisible, ou permission refusée** : repli sur `call.output.bluetooth`,
>   c'est-à-dire le libellé d'aujourd'hui. Jamais la chaîne anglaise en dur d'AudioSwitch,
>   jamais un identifiant technique, jamais une ligne vide.
> - **Deux appareils connectés** : **une seule ligne**, portant le nom de celui qui reçoit
>   effectivement le son. Afficher deux lignes dont une seule est honorable serait pire que la
>   situation actuelle — l'utilisateur appuierait sur la seconde et rien ne changerait,
>   silencieusement (fait 4).
> - **La note** : `call.outputFollowsDevice` reste, et devient enfin exacte au lieu d'être
>   approximative — le son suit ce qu'on allume, et l'écran le nomme.
>   `call.outputManualUntilEnd` reste aussi : le fait 6 le confirme mot pour mot.
>
> **Ce que ça change pour le propriétaire** : il ne choisira toujours pas entre deux casques,
> mais il **saura**, avant d'appuyer, lequel parle. Dans son cas d'usage — un casque à la fois,
> puis la voiture — c'est la totalité de la question qu'il se pose.
>
> **Une seule clé i18n nouvelle serait nécessaire** si l'on voulait distinguer un nom d'une
> catégorie à l'écran. Recommandation : **aucune**. Le nom se substitue au libellé dans la même
> ligne, avec la même icône et la même coche. YAGNI.

### Q3 — Module natif local, ou contribution en amont

Le nom existe déjà côté natif et n'est perdu qu'au pont (fait 2) : c'est un défaut réel, et il
mérite d'être corrigé en amont. Mais le fait 9 mesure ce que coûte l'attente, et le fait 10 dit
que la correction utile touche trois dépôts.

> **Recommandation Q3 — les deux, dans cet ordre, et sans dépendance de l'un à l'autre.**
>
> 1. **D'abord un module Expo local en lecture seule**, dans `modules/` (fait 13). Il ne
>    dépend d'aucun tiers, il ne modifie aucune route, il ship à notre calendrier, et son
>    périmètre est petit : trois lectures et un abonnement. Gardé par
>    `Build.VERSION.SDK_INT >= 31` (fait 5) ; sous ce plancher il rend une liste vide et
>    l'écran retombe **exactement** sur le comportement d'aujourd'hui — pas de branche
>    d'interface supplémentaire, pas de message.
> 2. **Ensuite, une PR sur `@livekit/react-native`** qui transporte `getName()` à travers le
>    pont et bumpe l'épingle AudioSwitch vers un commit postérieur au 2026-04-20. Elle est
>    petite, elle est manifestement juste, et elle profite à tout le monde. **Elle ne bloque
>    rien chez nous** : si elle est fusionnée et publiée, notre module devient redondant et se
>    supprime en un commit — ce qui est exactement l'issue souhaitable.
> 3. **Pas de fork d'AudioSwitch, pas de patch-package, pas de `postinstall`.** Le fait 10
>    montre que le correctif complet est une refonte du modèle de données d'une bibliothèque
>    tierce ; la porter nous-mêmes serait un engagement de maintenance sans rapport avec la
>    taille du besoin.
>
> **Le raisonnement sur le délai** : trois mois et deux versions mineures n'ont pas suffi à
> faire arriver du code déjà fusionné chez l'éditeur lui-même. Faire dépendre une
> fonctionnalité produit de ce calendrier serait un pari sur autrui. Un module local de
> lecture est le seul chemin dont nous tenons les deux bouts.

---

## iOS : cette fonctionnalité n'y fait **rien**, et voici pourquoi

`audioRouteControl()` rend `'system'` sur iOS (`src/call/audioRoute.ts:14-16`), et l'écran
délègue au sélecteur de la plateforme (`audioOutputControl.tsx:62`). Ce n'est pas une lacune à
combler ici, pour trois raisons mesurées :

1. **Il n'y a rien à énumérer.** `getAudioOutputs` est une **constante** côté Swift :
   `resolve(["default", "force_speaker"])`
   (`node_modules/@livekit/react-native/ios/LiveKitReactNativeModule.swift:128-131`), et le
   JavaScript court-circuite même l'appel natif (`AudioSession.ts:275-276`). **[V]**
2. **Il n'y a rien à sélectionner.** `selectAudioOutput` mappe uniquement vers
   `overrideOutputAudioPort(.none)` ou `(.speaker)` (`LiveKitReactNativeModule.swift:133-147`).
   Aucun appareil Bluetooth nommé n'y est adressable. **[V]**
3. **Le sélecteur système est déjà la bonne réponse.** `showAudioRoutePicker` construit un
   `AVRoutePickerView` jamais inséré dans la hiérarchie et simule un `.touchUpInside` sur son
   bouton interne (`LiveKitReactNativeModule.swift:113-126`) — sans resolver, donc sans moyen
   de savoir s'il est apparu, ce que `audioRoute.ts:39-44` documente déjà. Ce sélecteur montre
   les appareils **nommés**, y compris CarPlay et les AirPods : iOS résout nativement le besoin
   du propriétaire, avec une interface qu'Apple maintient.

> **Décision : rien n'est ajouté sur iOS. `audioRouteControl()` continue de rendre `'system'`,
> et le module natif de la Q3 est Android seulement.** Le mettre au même niveau demanderait de
> lire `AVAudioSession.currentRoute.outputs[].portName` — faisable **[S]**, non mesuré — pour
> un gain limité au **libellé** du bouton, puisque la sélection resterait celle du sélecteur
> système. Hors périmètre, et à rouvrir seulement si quelqu'un le demande.

---

## Hors périmètre, explicitement

- **Choisir entre deux appareils Bluetooth.** Motivé par les faits 3, 4 et 10 : impossible sans
  déplacer AudioSwitch. C'est la seule partie du besoin que ce document ne livre pas, et elle
  est nommée comme telle.
- **Prendre en charge le focus audio, le mode audio ou le cycle SCO.** Q1.
- **Persister un choix ou un appareil entre deux séances.** Déjà tranché au périmètre A
  (§Q5) : persister un choix manuel désarmerait la bascule automatique **pour toujours**,
  c'est-à-dire exactement le contraire du besoin exprimé ici.
- **Un sélecteur de micro.** Déjà tranché au périmètre A (§Q1), et rien ici ne le rouvre.
- **Du code spécifique à la Tesla, ou à tout modèle.** Fait 11.
- **Quoi que ce soit sur iOS.** Ci-dessus.
- **Forker AudioSwitch, ou patcher `node_modules`.** Q3.

---

## Mesuré en voiture le 2026-08-02 : la bascule automatique fonctionne

La mesure que ce document portait comme le point non établi qui conditionnait tout le reste
a été faite, sur un build **release** installé sur le Pixel — donc sans Metro, sans câble et
sans sonde, dans les conditions réelles.

**Résultat : le propriétaire s'est connecté depuis la voiture et la bascule s'est faite
toute seule.** Aucun geste, aucune ouverture de la feuille de sortie audio.

Ce que cela établit :

- La reprise du volant à AudioSwitch — `setCommunicationDevice` et compagnie — **n'a pas
  cassé la bascule automatique**. C'était le risque principal du périmètre complet, et le
  seul qu'aucun test ne pouvait approcher.
- Le son n'a pas oscillé entre deux routes, donc rien n'indique le symptôme des « deux
  pilotes sur le même canal » que la décision faisait courir.
- ~~Le module natif, jusqu'ici **compilé, lié et jamais exécuté**, s'exécute et fait ce qu'on
  attend de lui.~~ **Affirmation retirée le même jour, elle allait trop loin.** Une bascule
  automatique se produit AUSSI par AudioSwitch, qui est le repli quand le module n'est pas
  chargé : ce test ne distingue donc pas les deux. Et une mesure ultérieure, séance en cours
  et deux participants à l'écran, a relevé `mode (internal) = NORMAL` — or notre module comme
  AudioSwitch posent tous deux `MODE_IN_COMMUNICATION` en démarrant. Aucun des deux n'avait
  donc configuré le moteur audio à cet instant. Ce que le test de la voiture établit se
  réduit à : **le son a suivi**. Par quel chemin reste inconnu.

Ce que cela n'établit **pas**, et qui reste ouvert :

- Ce que la feuille affichait à ce moment-là — un nom, deux noms, ou une catégorie. C'est
  la seconde moitié du besoin d'origine (« je ne sais pas lequel il va prendre »), et elle
  n'est toujours pas constatée avec **deux** appareils Bluetooth connectés en même temps.
- Le retour : est-ce que le son revient au casque en quittant la voiture ?
- Le cas où un choix manuel a été fait AVANT de monter, qui désarme la bascule pour le
  reste de la séance.

## Ce que je n'ai pas pu établir

- **Le comportement quand deux appareils Bluetooth sont connectés en même temps** — c'est-à-dire
  **le cas exact du propriétaire**, et la mesure manquante la plus importante du document. Les
  relevés sur appareil rapportés portent sur **un** appareil à la fois. Le fait 3 dit que le
  second sera absorbé par l'ensemble ; il ne dit **pas** vers lequel des deux
  `startBluetoothSco()` enverra le son, parce que c'est le système qui tranche.
  **Si Android donne déjà le bon résultat — le dernier connecté, ou la voiture — alors tout le
  besoin se réduit au nommage**, donc à un module de lecture seule, et il n'y a plus de
  question 1. Sinon, il faut savoir quelle règle il applique avant de concevoir quoi que ce
  soit d'autre. **Protocole : casque allumé, entrer en séance, démarrer la voiture, noter où va
  le son ; puis l'ordre inverse ; puis éteindre l'un des deux en séance.**
- **Si `AudioDeviceInfo.getProductName()` rend un vrai nom d'appareil Bluetooth sans
  `BLUETOOTH_CONNECT` accordé.** L'absence d'annotation `@RequiresPermission` dans le SDK 36
  n'est pas une preuve — `annotations.zip` n'est pas exhaustif —, et le nom d'un appareil
  Bluetooth est une surface historiquement protégée. Le grant est de toute façon déjà demandé
  (fait 12) ; ce qui reste à vérifier est ce qui s'affiche **après un refus**, et si le repli
  de la Q2 se déclenche bien.
- **Si `getAvailableCommunicationDevices()` reste cohérent pendant qu'AudioSwitch manipule
  SCO.** Le module de la Q1 lirait un état que quelqu'un d'autre est en train de changer.
  Rien ne dit que la lecture est stable pendant une transition — c'est précisément l'endroit où
  une lecture seule pourrait quand même mentir. **À mesurer avant d'écrire l'interface, pas
  après.**
- **La proportion réelle d'appareils sous l'API 31** dans la base installée visée. Le plancher
  est 24, la borne du fait 5 est 31 ; personne n'a chiffré ce que représente l'intervalle. Cela
  ne change pas la conception — le repli est le comportement actuel — mais cela change
  l'appréciation du gain.
- **Le délai réel d'une PR sur `@livekit/react-native`.** Le fait 9 mesure la latence d'un
  changement **déjà fusionné** chez eux ; il ne mesure pas le temps de revue d'une
  contribution extérieure. Aucune issue amont ouverte sur le sujet
  (recherche GitHub sur `livekit/client-sdk-react-native` : quatre résultats, tous clos et sans
  rapport).
- **Le comportement du BLE Audio / LE Audio.** `toTwilioAudioDevice` du fork traite
  `TYPE_BLE_HEADSET` et `TYPE_BLE_SPEAKER` — le jar embarqué, non. Aucun appareil LE Audio
  n'est entré dans cette analyse.

---

## Ce que ça vaut, honnêtement

Le besoin se scinde en deux, et les deux moitiés n'ont pas le même prix.

| | Coût | Ce que ça donne |
|---|---|---|
| **Bascule automatique** | **zéro** | déjà livré (§ « Le second besoin est déjà satisfait ») — reste à ne pas le contredire à l'écran |
| **Nommer l'appareil en cours** | un module Expo local, lecture seule, Android ≥ 31 | le propriétaire sait lequel de ses appareils parle, et l'écran cesse de mentir par omission |
| **Choisir entre deux appareils Bluetooth** | remplacer AudioSwitch, ou une chaîne de trois dépôts en amont | la moitié du besoin qui n'est pas livrée |

**La troisième ligne ne vaut pas son prix aujourd'hui**, et c'est une conclusion, pas une
esquive : elle met à notre charge le focus audio, le mode audio et le cycle SCO d'une
application de visioconférence en production, pour un cas — deux appareils Bluetooth
simultanément actifs — dont **on ne sait même pas encore s'il est cassé** (première puce des
inconnues). Le dépôt a déjà écrit, au périmètre A, qu'il préférait ne pas afficher plutôt
qu'afficher faux ; le fait 4 montre qu'une sélection par nom serait précisément un affichage
faux qui compile.

**L'ordre recommandé est donc : mesurer d'abord, livrer le nommage, laisser le choix ouvert.**
Si la mesure des deux appareils montre qu'Android fait déjà le bon choix, la ligne 3 disparaît
du besoin. Si elle montre le contraire, elle reviendra avec un argument chiffré, ce qu'elle n'a
pas aujourd'hui.
