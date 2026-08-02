# Reprise après interruption — ce qui a été mesuré le 2026-08-02

Appareil : Pixel 10 Pro Fold, Android 16 (API 36), build de développement, séance à deux
participants contre `meet.twake-dev.maudet.cloud`. Tout ce qui suit est un relevé, pas une
déduction ; chaque stimulus a été vérifié dans une source indépendante de celle qu'on
mesurait.

## Le symptôme et sa cause

Passage en arrière-plan pendant une séance, puis retour : la webcam est figée côté distant.

Android retire **caméra et micro** à une application d'arrière-plan. Mesuré à chaque cycle :

- `dumpsys media.camera` → `DISCONNECT device 1 … (PID 0)`, environ cinq secondes après le
  passage en arrière-plan. **`PID 0` désigne un retrait par le système** ; le même événement
  portant le pid de l'application est un départ volontaire. La distinction n'est pas
  cosmétique, elle a évité une fausse piste.
- `dumpsys audio` → `Recording active: false` sous le bloc `Mode owner`.
- `Playback active` reste `true` : on entend les autres, eux ne nous voient ni ne nous
  entendent plus.

Le processus survit (même pid), la session LiveKit survit, la vidéo distante continue
d'arriver. **Seule la capture locale meurt.**

### Pourquoi rien ne la reprenait

`livekit-client` **embarque** la reprise : `LocalTrack.handleAppVisibilityChanged()` rappelle
`restart()` au retour au premier plan. Elle est morte en React Native :

```js
addAppVisibilityListener() {
  if (isWeb()) {                       // isWeb() = typeof document !== 'undefined'
    document.addEventListener('visibilitychange', this.appVisibilityChangedListener);
  } else {
    this.isInBackground = false;       // ← React Native tombe ici
  }
}
```

Sans `document`, aucun écouteur n'est posé, `isInBackground` reste `false` à jamais, le
gestionnaire n'est jamais appelé.

### Le piège qui aurait fait passer un correctif nul pour un vrai

`setCameraEnabled(room, true)` **ne recapture rien**. `setTrackEnabled` ne rappelle
`createTracks()` que si **rien n'est publié** ; tant qu'une publication existe, il se
contente d'un `track.unmute()`. Or la publication survit à l'arrière-plan — LiveKit n'a
jamais su que le système avait pris la caméra.

Seul `restartTrack()` repasse par `getUserMedia`.

## La correction et sa vérification

`src/call/interruption.ts` → `useInterruptionRecovery(room)`, posé sur `call.tsx` et non sur
la barre de commandes, qui disparaît en plein écran.

Comparaison contrôlée : même appareil, même séance, mêmes six cycles, le crochet seul
changeant.

| | caméra reprise | tuile locale au retour |
| --- | --- | --- |
| **sans** | **0 / 6** | FIGÉE ×6 — captures identiques au pixel près |
| **avec** | **6/6, puis 3/3 après rétablissement = 9 / 9**, en 2–3 s | VIVANTE ×9 |

**Asymétrie mesurée** : le micro revient tout seul (`Recording active: true`, 6/6 dans le
contrôle négatif) ; la caméra jamais. Le micro est redémarré par prudence, pas par nécessité
constatée.

**Piège d'observation, à retenir** : avant le contrôle négatif, trois cycles épars avaient
donné deux reprises — de quoi croire à une intermittence et chercher une cause de course.
Seule la répétition à conditions fixées a montré 0/6. Une mesure éparse ne vaut pas une
série.

## Deux messages d'erreur observés en chemin, et ce qu'ils valent

### « Received leave request while trying to (re)connect » — PAS un défaut

```
ConnectionError { reason: 4 (LeaveRequest), context: 6 }
```

Émis par `livekit-client` au niveau **erreur**, donc bandeau rouge en développement. Il
apparaît quand le serveur met fin à la session pendant une tentative de reprise, après un
arrière-plan assez long pour que le socket de signalisation meure.

**Mesuré : le SDK enchaîne sur une reconnexion complète, qui réussit.** Trois cycles
d'arrière-plan de 90 secondes, trois fois les deux tuiles VIVANTES au retour, sans que
l'écran ne quitte la séance. Le compteur du bandeau était monté à 5 pendant que la séance se
portait bien.

**Il n'y a donc rien à dire à la personne**, et lui annoncer une séance terminée serait
faux. La machine à états de `src/call/connection.ts` couvre déjà le cas où la reconnexion
échoue pour de bon : `RoomEvent.Disconnected` → `disconnected` → `call.tsx` rend un écran
avec un bouton de sortie.

_Cette conclusion corrige une lecture antérieure de la même journée, qui tenait ce message
pour la mort silencieuse de la séance. Elle venait d'avoir observé des tuiles figées au même
moment — mais c'était le défaut de caméra ci-dessus, pas la session._

### Rejet de promesse non capturé sur le WebSocket — réel, mais en amont

```
Uncaught (in promise) Event { _type: "error",
  target: WebSocket { url: "wss://…/rtc/v1", readyState: 3 } }
```

Origine exacte, dans `livekit-client.esm.mjs` :

```js
readable: new ReadableStream({
  start(controller) {
    ws.onmessage = ({ data }) => controller.enqueue(data);
    ws.onerror = e => controller.error(e);   // ← l'Event brut devient l'erreur du flux
  },
```

L'`Event` d'erreur du socket erre le `ReadableStream` ; l'erreur n'est consommée par
personne, d'où le rejet non capturé. C'est le seul endroit de toute la pile qui transforme
un `error` de WebSocket en motif de rejet.

**Rien de tout cela n'est notre code**, et le dépôt s'interdit de rustiner `node_modules`
comme de poser un `override`. Effet réel : un écran rouge en développement, qui masque
l'application — il a coûté une fausse piste ce jour-là. En production, LogBox est désactivé
et le rejet est silencieux ; il ne fait pas tomber l'application.

**Ce qu'il ne faut pas faire** : poser un gestionnaire global de rejets non capturés pour
faire taire celui-ci. Il avalerait aussi les nôtres.

À remonter à `livekit-client`. En attendant, le connaître suffit : un écran rouge portant un
`Event` dont la cible est le socket `/rtc/v1` vient de là et n'indique aucun défaut de
l'application.

## La seconde moitié : le service de premier plan

Le crochet répare le *retour*. Il ne réparait pas l'*absence* : pendant tout le temps passé
hors de l'application, les autres ne voyaient ni n'entendaient la personne.

`modules/twake-call-service/` déclare un service typé `camera|microphone`, démarré une fois
le transport ouvert et arrêté au raccrochage comme au démontage. Vérifié sur appareil :

```
isForeground=true  foregroundId=1  types=0x000000C0
                                         └ 0x40 CAMERA | 0x80 MICROPHONE
foregroundNoti=Notification(channel=twakevisio.call category=call
                            ONGOING_EVENT|FOREGROUND_SERVICE)
```

Trois cycles d'arrière-plan : `Recording active` reste `true` et **plus aucun
`DISCONNECT … (PID 0)`** n'apparaît. Le système ne retire plus rien.

### Le `PID` du journal caméra distingue trois choses, et il faut les distinguer

| ce qu'on lit | ce que c'est |
| --- | --- |
| `DISCONNECT … (PID 0)` | le **système** retire la caméra — l'arrière-plan sans service |
| `DISCONNECT … (PID <le nôtre>)` | **nous** relâchons — départ de séance, ou `restartTrack()` |
| `DISCONNECT … (PID <le nôtre>)` suivi d'un `CONNECT` d'une autre application | une autre application **évince** notre client |

Confondre les deux premiers a failli faire conclure que le service ne servait à rien : les
paires `DISCONNECT`/`CONNECT` qui subsistaient après son installation portaient notre pid,
et c'était le crochet de reprise, pas le système.

## Une optimisation écrite, mesurée, et retirée

Le service rendant la reprise inutile dans le cas courant, une garde a été ajoutée pour ne
redémarrer que si la capture était réellement morte — en reprenant le prédicat de LiveKit
lui-même, `LocalTrack.needsReAcquisition` (`protected`) :

```ts
capture.readyState === 'live' && !capture.muted && capture.enabled;
```

**Elle est aveugle en React Native.** Protocole : ouvrir l'appareil photo du système pendant
une séance — une autre application au premier plan évince le client caméra même à travers le
service —, puis revenir.

| | avec la garde | sans la garde |
| --- | --- | --- |
| `dumpsys` pendant le vol | `DISCONNECT com.linagora.twakevisio` | idem |
| au retour | **aucun `CONNECT`**, tuile figée, et un second cycle n'y change rien | `CONNECT` en ~1 s, tuile vivante |

`mediaStreamTrack.readyState` reste donc `'live'`, `muted` faux et `enabled` vrai **après**
l'éviction. La garde a été retirée, et un test garde désormais la décision — il rougit dès
qu'on la réintroduit.

Le compromis n'est pas symétrique : une reprise inutile coûte une seconde de coupure, une
reprise manquée coûte la caméra pour le reste de la séance.

## iOS : ce qui s'aligne, ce qui ne peut pas, et ce qui n'est pas mesuré

**La moitié « absence » ne s'aligne pas, et ce n'est pas un manque de travail : iOS
n'autorise pas la capture caméra en arrière-plan.** Il n'existe aucun équivalent du service
de premier plan pour la vidéo. Le mieux atteignable est donc : l'audio continue, la vidéo
s'arrête, et la caméra est reprise au retour. `UIBackgroundModes: ["audio"]` est ajouté pour
la première partie.

`voip` n'est **pas** déclaré : il est réservé aux applications qui reçoivent des pousses
PushKit, et le déclarer sans s'en servir expose à un refus de l'App Store.

**La moitié « retour » compte donc DOUBLE sur iOS**, puisque c'est la seule qui existe.

### Le défaut iOS trouvé en relisant le crochet

`useInterruptionRecovery` marquait une interruption sur **tout** état qui n'était pas
`'active'`. Or `'inactive'` n'est émis que par iOS, et pour des interactions passagères :
centre de contrôle, volet de notifications, aperçu du sélecteur d'applications, bandeau
d'appel entrant. Aucune ne retire la capture.

La reprise étant inconditionnelle — voir le bloc encadré de `src/call/interruption.ts` —
chacune de ces interactions aurait coupé la caméra une seconde au retour. Le crochet ne
retient plus que `'background'` ; iOS passant par `'inactive'` **avant** `'background'`,
rien n'est manqué.

Vérifié sur Android : le cycle arrière-plan → retour déclenche toujours la reprise, paire
`DISCONNECT`/`CONNECT` portant notre pid, les deux tuiles vivantes.

### Le reste se referme tout seul, par construction

Les deux modules natifs déclarent `"platforms": ["android"]`, donc
`requireOptionalNativeModule` rend `null` sur iOS et chaque chemin se referme sans bruit :
`startCallService` sort, `watchPreferredDevice` rend une fonction inerte,
`routeToPreferredDevice` rend `false` sur une liste vide. `ensureNotificationPermission` est
déjà gardée par `Platform.OS !== 'android'`.

Le routage audio n'a rien à aligner : `audioRouteControl()` rend `'system'` sur iOS, la
route passe par AVAudioSession, qui bascule seul vers un casque Bluetooth.

### RIEN DE TOUT CELA N'EST MESURÉ SUR IOS

Il n'y a pas d'appareil iOS ici, et `AGENTS.md` consigne que **le simulateur ne publie ni
caméra ni micro**. Ce qui précède est donc : une correction dictée par la sémantique
documentée d'`AppState`, une entrée de configuration, et une lecture des gardes de
plateforme. Les trois se tiennent, aucune n'a été observée à l'exécution sur iOS.

**À mesurer sur un appareil, dans cet ordre :** ouvrir le centre de contrôle en séance et
vérifier que la caméra ne se coupe PAS ; passer en arrière-plan et vérifier que l'audio
continue et que la vidéo reprend au retour ; recevoir un appel téléphonique pendant une
séance.

## Ce qui reste ouvert

**La sortie audio ne suit pas le casque.** Mesuré trois fois, dans trois états : casque
Bluetooth connecté et `Active communication device: type:earpiece`. Le son sort de l'écouteur
du téléphone alors qu'un casque est sur la tête, jusqu'à ce que la personne le choisisse à la
main. La première ligne de la feuille annonce pourtant « Le son suit l'appareil que vous
branchez ».

La cause est structurelle : sur le chemin `'devices'`, AudioSwitch n'est plus démarré — c'est
lui qui appelait `startBluetoothSco()` — et rien ne l'a remplacé. `AUDIO_OUTPUT_ORDER`
(`src/call/devices.ts`) porte déjà la priorité voulue (`bluetooth`, `headset`, `speaker`,
`earpiece`) et `manualOutput` (`callControlBar.tsx`) sait déjà si un choix humain a été fait.
Il manque l'appel qui les relie.

**Personne n'écoute `onDevicesChanged`.** Le module natif émet l'événement à chaque
changement de route ; aucun abonné n'existe côté JavaScript. C'est ce qui servirait à suivre
un casque branché en cours de séance.

Ces deux points touchent au routage audio, donc à ce que les gens entendent. Non tranché.
