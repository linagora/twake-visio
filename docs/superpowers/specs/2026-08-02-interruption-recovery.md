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

## Ce qui reste ouvert

**Aucun service de premier plan n'est déclaré** (`app.json` n'en porte pas). Le crochet
répare le *retour* ; il ne répare pas l'*absence*. Pendant tout le temps passé hors de
l'application, les autres ne voient ni n'entendent la personne. C'est la moitié du problème
qui reste, et elle demande un plugin de configuration, un service natif typé
`camera|microphone` et une notification permanente.
