# Périmètre D — Enregistrement

Conception écrite le 2026-07-30, branche `feat/scope-d-recording`, coupée sur `main` à
`635c02f`. Quatrième des sous-projets de la barre de contrôle en séance ; les trois
autres sont A (périphériques), B (participants, fusionné) et C (interaction).

## Sur quoi ce document s'appuie

Deux sources, et rien d'autre.

1. **Le rapport de terrain** `.superpowers/sdd/2026-07-30-scope-D-recording.md` — lecture
   de la source de `suitenumerique/meet` @ `8cbcad76`, du diff de la PR amont **#794**,
   du bundle web déployé, et de deux réponses réelles de `meet.linagora.com`
   (`/api/v1.0/config/` et un `GET /rooms/{slug}/`). Aucun endpoint d'écriture n'y a été
   appelé. Ce fichier vit sous `.superpowers/`, **qui est ignoré par git** : personne ne
   pourra l'ouvrir depuis cette branche. Tous les faits qu'il porte et dont
   l'implémentation dépend sont donc **recopiés ici**, avec leur numéro de section
   d'origine. Ce document doit se suffire à lui-même.
2. **Des lectures faites dans ce dépôt**, citées `fichier:ligne`. Quand la ligne
   désigne `node_modules/livekit-client/dist/livekit-client.esm.mjs`, il s'agit du
   build ESM de `livekit-client@2.18.0`, la version épinglée dans `package.json`.

Ce qui n'est établi ni par l'un ni par l'autre est rassemblé en §2.4 et nommé comme non
établi. Aucun contrat d'API n'est inventé.

---

## 1. Le problème

Une réunion tenue depuis le mobile ne peut pas être enregistrée. L'instance du
partenaire, `meet.linagora.com`, a l'enregistrement **activé** (`recording.is_enabled:
true`) et ses deux modes disponibles ; le client web les propose ; l'application mobile
n'a aucune commande et, plus grave, **aucun indicateur**. Un utilisateur mobile assis
dans une réunion qu'un participant web enregistre n'en sait rien.

Ce périmètre livre donc deux choses distinctes, qu'il ne faut pas confondre :

- **un indicateur d'état**, visible de *tout le monde*, parce que savoir qu'on est
  enregistré n'est pas un privilège d'organisateur ;
- **une commande**, réservée, qui démarre et arrête l'enregistrement d'écran.

L'application sait déjà si son instance offre la fonctionnalité :
`src/instance/discovery.ts:117` lit `recording.is_enabled` et le range dans
`InstanceFeatures.recording` (`src/instance/types.ts:2`). Ce drapeau n'est aujourd'hui
lu par aucun écran.

---

## 2. Le contrat réel du serveur

### 2.0 Le fait qui commande tout le reste : la production n'est pas `main`

`meet.linagora.com` **ne fait pas tourner `suitenumerique/meet` `main`**. Quatre
observations concordantes l'établissent (rapport §0) :

1. Sa réponse `/api/v1.0/config/` porte `recording.screen_recording_permission` et
   `recording.transcript_permission`. Ces clés n'existent **nulle part** dans `main` —
   ni dans `src/`, ni dans l'historique de `core/api/__init__.py`. Elles n'existent que
   dans la **PR #794, ouverte et non fusionnée**.
2. Sa réponse salon porte un bloc `recording_permissions`. Même constat.
3. Son bundle web envoie le jeton LiveKit de `start-subtitle` **dans le corps** ; `main`
   le lit dans l'en-tête `Authorization` depuis le commit `5d7a54e8` (2026-04-09). Le
   déployé est donc antérieur à cette date sur ce point.
4. Sa config ne contient ni `authenticated_users_can_edit_display_name` (ajouté
   2026-07-10) ni `documentation_url` (ajouté 2026-07-24), que `main` produit.

Coder contre `main` produirait une application qui ne marche pas contre la plateforme de
test du partenaire. Coder contre le déployé, c'est coder contre une PR qui peut encore
changer. L'arbitrage est en §3.1.

### 2.1 Ce que les deux versions partagent — le contrat que ce périmètre appelle

Les deux endpoints livrés ici ont **exactement le même contrat** sur `main` et sur le
déployé. La PR #794 ne touche que les `permission_classes` ; ni la route, ni le corps,
ni les codes de réponse. C'est le fait qui rend ce périmètre implémentable sans pari.

**`POST /api/v1.0/rooms/{pk}/start-recording/`** (rapport §1, `viewsets.py:367-438`)

`{pk}` accepte **un UUID ou un slug** : `RoomViewSet.get_object` (viewsets.py:248-254)
tente `uuid.UUID(pk)` puis retombe sur `slug=slugify(pk)`. C'est déjà ce dont
`fetchRoomAccess` dépend (`src/api/rooms.ts:32`).

Corps (`StartRecordingSerializer`, `api/serializers.py:252-269`) :

```jsonc
{
  "mode": "screen_recording" | "transcript",  // requis, ChoiceField strict
  "options": {                                 // optionnel, nullable
    "language": "fr",
    "transcribe": true,
    "collect_metadata": true,
    "original_mode": "transcript" | "screen_recording"
  }
}
```

`RecordingOptions` est un modèle pydantic portant `model_config = {"extra": "forbid"}` :
**toute clé inconnue dans `options` fait échouer la validation.**

| Code | Corps | Cause |
| --- | --- | --- |
| `201` | `{"message": "Recording successfully started for room {slug}"}` | succès |
| `400` | `{"detail": "Invalid request."}` | `mode` absent/invalide, ou `options` hors schéma |
| `403` | `{"detail": …}` | permission refusée |
| `404` | — | `RECORDING_ENABLE=False`, **ou** salon introuvable |
| `409` | `{"error": "A recording is already in progress for room {slug}"}` | contrainte d'unicité |
| `502` | `{"error": "Recording failed to start for room {slug}"}` | l'egress LiveKit a refusé |

Le `404` est **ambigu** et ne doit jamais être présenté comme « salon introuvable » :
une instance dont l'enregistrement est coupé répond 404, pas 403
(`@FeatureFlag.require("recording")` lève `Http404`).

**`POST /api/v1.0/rooms/{pk}/stop-recording/`** — aucun corps (rapport §2,
`viewsets.py:440-476`)

| Code | Corps | Cause |
| --- | --- | --- |
| `200` | `{"message": "Recording stopped for room {slug}."}` | succès |
| `404` | `{"detail": "No active recording found for this room."}` | aucun enregistrement au statut `active` |
| `500` | `{"error": "Recording failed to stop for room {slug}"}` | échec du worker |

**L'endpoint ne cible que le statut `active`.** Un enregistrement resté `initiated` —
worker jamais démarré — n'est **pas arrêtable**, et continue pourtant de bloquer la
contrainte `unique_initiated_or_active_recording_per_room`, qui couvre `{ACTIVE,
INITIATED}`. Un salon peut donc rester en 409 permanent sans qu'aucun appel client ne le
débloque. C'est un angle mort du backend, et il a une conséquence directe sur le dessin
du bouton (§5.3).

**Un seul enregistrement vivant par salon**, tous modes confondus (rapport §5,
`models.py:555-716`). Écran et transcription sont mutuellement exclusifs par contrainte
de base de données, pas par convention d'interface.

**Qui peut arrêter** : sur le déployé, `HasRecordingPermission` lit
`request.data.get("mode")` ; `stop-recording` n'ayant pas de corps, la classe retrouve le
mode via l'enregistrement `ACTIVE` du salon. **Il n'est pas exigé d'être celui qui a
démarré l'enregistrement pour l'arrêter** (rapport §4). Sur `main`, `HasPrivilegesOnRoom`
ne l'exige pas davantage.

### 2.2 Où les deux versions divergent

| | `main` amont | déployé (PR #794) |
| --- | --- | --- |
| Permission start/stop | `HasPrivilegesOnRoom` → `is_administrator_or_owner` | `HasRecordingPermission` → niveau **par mode** |
| Niveau résolu | — | `room.configuration[…_permission]` → `settings.RECORDING_*_PERMISSION` → défaut `"admin_owner"` |
| Valeurs possibles | — | `"admin_owner"` \| `"authenticated"` |
| Ce que l'instance annonce | — | `"authenticated"` pour **les deux** modes |
| Transport du jeton `start-subtitle` | en-tête `Authorization` | corps `{"token": …}` (**inféré**, §2.4) |

Ce que la production autorise réellement, lu dans sa réponse `/api/v1.0/config/`
(rapport §4) :

```json
"recording": {
  "is_enabled": true,
  "available_modes": ["screen_recording", "transcript"],
  "expiration_days": 30,
  "max_duration": 21600000,
  "screen_recording_permission": "authenticated",
  "transcript_permission": "authenticated"
}
```

Et dans une capture réelle d'un salon : `recording_permissions` aux deux à
`"authenticated"` alors que `is_administrable` vaut `false`. **Sur `meet.linagora.com`,
aujourd'hui, n'importe quel utilisateur authentifié peut enregistrer n'importe quel
salon auquel il a accès, même s'il n'en est ni administrateur ni propriétaire.**

`max_duration` (6 h) et `expiration_days` (30 j) sont **déclaratifs pour le client** : la
coupure réelle vient de l'egress LiveKit (`EGRESS_LIMIT_REACHED`) et l'expiration réelle
de la politique de cycle de vie du bucket. Le client web ajoute par-dessus une condition
PostHog sans aucune contrepartie backend : c'est du masquage d'interface, pas de la
sécurité.

### 2.3 L'état d'un enregistrement ne se lit dans aucun champ REST

C'est le point décisif, et il est vérifié des deux côtés (rapport §6).

**Il n'y a ni champ REST, ni scrutation.** L'état vit dans les **métadonnées de salon
LiveKit**. Le backend les fusionne — `RoomManagement.update_metadata` fait une fusion,
pas un remplacement :

| Moment | Écrivain | Effet sur `room.metadata` |
| --- | --- | --- |
| Démarrage accepté | `WorkerServiceMediator.start` (mediator.py:71) | `{"recording_mode": <mode>, "recording_status": "starting"}` |
| Egress `ACTIVE` | webhook `egress_updated` | `recording_status: "started"` |
| Egress `ENDING` | idem | `recording_status: "saving"` |
| Egress `ABORTED` | idem | `recording_status: "aborted"` |
| Egress terminé | webhook `egress_ended` (livekit_events.py:186) | **supprime les deux clés** |

Deux pièges de vocabulaire, à ne jamais confondre :

- Le vocabulaire des **métadonnées** est `starting` / `started` / `saving` / `aborted`.
- Le vocabulaire du **modèle** `Recording` est `initiated` / `active` / `stopped` /
  `saved` / `notification_succeeded` / `external_process_*` / `failed_to_*` / `aborted`.
  Il n'est jamais exposé au client en séance.
- `recording_mode` publié vaut `options["original_mode"] or recording.mode` : une
  transcription passée par un egress vidéo peut s'annoncer `transcript`.

Le bundle déployé lit exactement ces deux clés, et `Room.isRecording` **ne sert qu'à
départager le libellé « démarrage » / « en cours »** — il n'est jamais la source de
vérité de l'activité (rapport §6).

Le backend envoie par ailleurs des messages de données (`screenRecordingLimitReached`,
`transcriptionLimitReached`) : ce sont des toasts ponctuels, que quelqu'un arrivant en
cours de route rate. C'est précisément pour cela que l'état durable est dans les
métadonnées.

**Ce que j'ai vérifié moi-même dans le SDK**, et qui change le dessin :

`node_modules/livekit-client/dist/livekit-client.esm.mjs:26235-26243`

```js
this.handleRoomUpdate = room => {
  const oldRoom = this.roomInfo;
  this.roomInfo = room;
  if (oldRoom && oldRoom.metadata !== room.metadata) {
    this.emitWhenConnected(RoomEvent.RoomMetadataChanged, room.metadata);
  }
  if (oldRoom?.activeRecording !== room.activeRecording) {
    this.emitWhenConnected(RoomEvent.RecordingStatusChanged, room.activeRecording);
  }
};
```

- À la jonction, `handleRoomUpdate(joinResponse.room)` est appelé (`:25766`) alors que
  `this.roomInfo` est encore indéfini. `oldRoom` est donc faux et **`RoomMetadataChanged`
  n'est pas émis**. `this.roomInfo = room` s'exécute pourtant en premier, donc
  `room.metadata` est **juste immédiatement** (accesseur `:26501`).
  → **Une conception qui attend l'événement affiche « pas d'enregistrement » pendant
  toute la séance à quiconque rejoint une réunion déjà enregistrée.** L'état initial se
  *lit*, il ne s'attend pas. C'est la même leçon que `call.tsx:122-125`, mais ici ce
  n'est pas une convention : c'est le SDK.
- `emitWhenConnected` (`:27347-27357`) met l'événement en tampon si l'état est
  `Reconnecting`/`isResuming`, le rejoue après `RoomEvent.Reconnected`, l'émet si l'état
  est `Connected`, et **le jette silencieusement sinon** (`return false`).
- `Room.isRecording` (`:26466-26468`) rend `roomInfo.activeRecording`, documenté comme
  « if the current room has a participant with `recorder: true` in its JWT grant ».

Les quatre membres nécessaires existent bien en 2.18.0 :
`RoomEvent.RoomMetadataChanged` (`events.d.ts:195`), `RoomEvent.RecordingStatusChanged`
(`:289`), `RoomEvent.Reconnected` (`:29`), `Room.metadata` / `Room.isRecording`
(`Room.d.ts:143` / `:134`). Aucun appel API supplémentaire, aucune scrutation, et pas
besoin de `@livekit/components-react` — qui n'est d'ailleurs pas une dépendance de ce
dépôt.

### 2.4 Ce qui n'est pas établi

Rien de ce qui suit ne doit être codé comme si c'était acquis.

1. **Le transport du jeton de `start-subtitle` sur le déployé.** Inféré du fait que le
   bundle le met dans le corps et que seule la version antérieure à `5d7a54e8` l'y lit.
   Non testé — c'est un endpoint d'écriture qui dispatche un agent (rapport §3, §7).
2. **Que la production fasse tourner exactement la branche de la PR #794** plutôt qu'un
   fork portant le même travail. Ce qui est certain, c'est que le code déployé contient
   cette fonctionnalité et que `main` ne l'a pas (rapport §7).
3. **Qu'un enregistrement bloqué en `initiated` produise bien un 409 permanent.** Déduit
   de la contrainte et du filtre `status=ACTIVE` du stop ; non reproduit (rapport §7).
4. **Que `/api/v1.0/resource-accesses/` accepte un enregistrement comme `resource`.** Le
   rapport ne l'établit que pour les salons, ce qu'utilise `grantRoomAccess`
   (`src/api/rooms.ts:140`). Rien ne dit qu'un `RecordingAccess` se crée par cette route.
5. **Que l'application mobile puisse télécharger un enregistrement terminé.** L'accès au
   fichier passe par une sous-requête nginx vers `/api/v1.0/recordings/media-auth` ; son
   comportement derrière un jeton porteur OIDC plutôt qu'un cookie de session est marqué
   « non exploré » (rapport §7).
6. **La liste des codes de langue acceptés par whisperX.** La config n'en énumère aucun.
7. **La durée réelle de la phase `starting`.** Le rapport dit « plusieurs secondes »
   (§8.7) ; nous ne l'avons pas mesurée.
8. **Que DRF accepte un POST sans corps avec `content-type: application/json`.** Non
   établi ; §4.2 prend la précaution correspondante et dit pourquoi.

---

## 3. Arbitrages retenus

### Les deux imposés

**3.1 — Coder contre le déployé, avec la divergence isolée derrière une frontière
étroite et nommée.**
*Motif* : l'application doit marcher aujourd'hui contre `meet.linagora.com`, plateforme
de test du partenaire. Mais la PR #794 peut changer avant sa fusion : la divergence doit
être un point unique et documenté, pas une hypothèse diffuse.

*Ce que cet arbitrage coûte réellement, une fois §3.2 posé* : **rien, sur le chemin
d'écriture.** Les deux endpoints livrés ont un contrat identique dans les deux versions
(§2.1) ; seule la permission diverge, et la porte choisie en §3.2 est **l'intersection
stricte des deux** — voir §3.2. La frontière nommée existe donc pour le jour où l'on
voudra **élargir**, pas pour faire marcher aujourd'hui. Elle s'appelle
`canStartRecording()` et vit seule dans `src/call/recording.ts` (§4.1). Un basculement
coûte cette fonction et ses tests.

**3.2 — L'enregistrement est réservé aux salons administrables
(`RoomAccess.isAdministrable`, livré par le périmètre B), pas ouvert à tout utilisateur
authentifié.**
*Motif* : le backend de production laisse passer n'importe quel participant connecté.
Reproduire cette ouverture est un choix de gouvernance, et le défaut prudent est le bon
défaut par défaut.

> **Arbitrage renversable, et il appartient au partenaire.** Il a été pris ici pour ne
> pas bloquer la nuit. L'ouvrir consiste à lire `recording_permissions` dans la réponse
> salon — le champ existe déjà sur le déployé, il est simplement ignoré par
> `src/api/rooms.ts` — et à rendre `canStartRecording()` dépendante de lui. Un fichier.

*Effet de bord décisif, qui vaut d'être dit* : `is_administrator_or_owner` est **ce
qu'exige `main`** et **un sous-ensemble de ce qu'autorise le déployé** (`admin_owner` ⊂
`authenticated`, et un salon reconfiguré en `admin_owner` la redemande à l'identique).
Le garde-fou prudent est donc **le seul qui soit valide contre les deux versions du
serveur en même temps**. La prudence et la portabilité tombent ici sur la même décision.

### Les six tranchés ici

**3.3 — Les sous-titres ne sont pas livrés dans ce périmètre : ni bouton, ni fonction
d'API.**
*Motif* : trois faits vérifiés se cumulent. (a) `start-subtitle` est **irréversible** —
aucun `stop-subtitle` n'existe, `SubtitleService.stop_subtitle` lève
`NotImplementedError`, et l'agent tourne jusqu'à la fin de la séance (rapport §3). (b)
Le rendu mobile des transcriptions LiveKit **n'a pas été étudié** (rapport §7, « non
exploré ») : le bouton déclencherait donc un effet serveur définitif dont l'application
ne peut rien montrer à celui qui appuie. (c) Le transport de son jeton sur le déployé est
**inféré, pas vérifié** (§2.4.1), et c'est le seul endpoint du périmètre dont le contrat
ne soit pas établi. Un bouton irréversible, sans retour visible, contre un contrat
supposé, n'est pas une fonctionnalité : c'est un piège.
*Ce qui trancherait autrement* : que l'application sache afficher les transcriptions
LiveKit (périmètre C ou ultérieur) **et** qu'un appel réel confirme le transport. Le
bouton deviendrait alors honnête sous une seule forme : une confirmation explicite
disant que l'action ne s'annule pas, puis un état verrouillé pour le reste de la séance
— jamais un masquage local à la manière du web, qui laisse l'agent transcrire à l'insu de
l'utilisateur.

**3.4 — Un seul mode est démarrable : `screen_recording`. Les deux modes sont lus.**
*Motif* : les deux modes sont mutuellement exclusifs par contrainte de base (§2.1), donc
une seconde commande n'apporterait qu'un second état d'indisponibilité (`isAnotherModeStarted`
côté web) pour un artefact que l'application ne montre pas davantage. Mais le **chemin de
lecture** doit connaître les deux : un participant web peut démarrer une transcription, et
un indicateur qui répondrait « rien en cours » dans ce cas serait un mensonge sur un sujet
de consentement. Conséquence heureuse : avec un seul bouton, dont l'identité suit la phase
(§4.4), **l'exclusivité devient structurelle** — on ne peut pas démarrer pendant qu'une
chose tourne, puisque le bouton est alors un bouton d'arrêt.

**3.5 — Sans le droit d'enregistrer, la commande n'est pas affichée ; l'indicateur, si.**
*Motif* : le précédent du dépôt est de masquer, pas de griser — « proposer un geste voué
à échouer se lit comme une panne de l'application » (`participantsPanel.tsx:51-55`).
L'écran « demander à l'organisateur » du web est écarté : c'est une convention purement
cliente, sans **aucune** contrepartie backend (rapport §8.5), qui n'atteindrait que les
clients web présents à cet instant et implémentant la même convention. Mais l'indicateur
est traité à l'opposé : il est montré à **tout le monde**, parce que ce qu'on peut faire
et ce qu'on doit savoir sont deux questions différentes.

**3.6 — Pas d'accès aux enregistrements terminés, et aucun `RecordingAccess`
supplémentaire.**
*Motif* : le chemin de téléchargement n'est pas vérifié (§2.4.5) et la route de création
d'un `RecordingAccess` n'est pas établie (§2.4.4) — concevoir dessus serait inventer un
contrat. Par ailleurs `perform_create` ne crée un `RecordingAccess(role=OWNER)` que pour
l'appelant : un enregistrement démarré depuis le mobile ne sera visible que de celui qui
l'a démarré, dans `/recordings/` du client web. C'est une limite assumée et écrite (§8),
pas un oubli.
*Ce qui trancherait autrement* : une sonde de `GET {origin}/media/recordings/{id}.mp4`
avec un jeton porteur, contre un enregistrement réellement `saved`.

**3.7 — L'indicateur porte quatre phases plus le mode, jamais un booléen.**
*Motif* : `starting` dure plusieurs secondes avant que l'egress ne démarre. Un booléen
afficherait « pas d'enregistrement » pendant tout ce temps ; l'utilisateur appuierait une
seconde fois et récolterait un 409 « a recording is already in progress », qui se lit
comme une application cassée. Les quatre phases sont exactement le vocabulaire que le
serveur publie (§2.3) : on n'invente rien. `Room.isRecording` entre dans la dérivation
**uniquement** pour départager `starting` de `recording`, jamais pour décider qu'il se
passe quelque chose — c'est la règle vérifiée du bundle déployé, et la respecter garantit
que deux participants d'une même réunion, l'un sur mobile l'autre sur web, ne voient
jamais deux indicateurs contradictoires. Sur un signal de consentement, l'accord entre
clients est une valeur en soi.

**3.8 — Aucune clé `options` n'est envoyée, donc pas de sélecteur de langue.**
*Motif* : le corps émis est `{"mode": "screen_recording"}` et rien d'autre.
`RecordingOptions` porte `extra: "forbid"` (§2.1) — le corps le plus petit est le plus
sûr. `language` ne sert qu'à la transcription hors-ligne, que §3.4 ne démarre pas et que
nous ne demandons pas via `transcribe`. Et un sélecteur se construirait contre un
ensemble de codes que rien n'énumère (§2.4.6) : ce serait deviner.
*Ce qui trancherait autrement* : livrer le mode `transcript` (§3.4). `options.language`
partirait alors de la langue de l'appareil, que `resolveLocale()` calcule déjà
(`src/i18n/index.ts:26-29`), et non d'un nouvel écran.

---

## 4. Architecture

Quatre unités, et la même frontière que celle qui a réussi au périmètre B : **le pur
d'un côté, le branché de l'autre**, la coquille aussi bête que possible.

```
src/call/recording.ts        pur     état, transitions, politique, message d'erreur
src/call/recordingStore.ts   branché lecture de la Room, abonnement aux événements
src/api/recording.ts         branché les deux endpoints
src/screens/room/
  recordingIndicator.tsx     coquille  ce que tout le monde voit
  recordingControl.tsx       coquille  ce que seul un administrateur voit
```

### 4.1 `src/call/recording.ts` — le module pur

Aucun import de valeur : ni `livekit-client`, ni `react`, ni réseau. Seulement des types
(`ApiError`, `RoomAccess`, `InstanceFeatures`). Testable et éprouvable par mutation
exactement comme `src/rooms/waitingQueue.ts`.

```ts
export type RecordingMode = 'screen_recording' | 'transcript';

// Le vocabulaire des métadonnées, pas celui du modèle `Recording` (§2.3).
// `mode` vaut `null` quand un enregistrement tourne sous un nom que ce code ne
// connaît pas : on signale l'activité sans mentir sur sa nature.
export type RecordingState =
  | { readonly phase: 'idle'; readonly mode: null }
  | { readonly phase: 'starting'; readonly mode: RecordingMode | null }
  | { readonly phase: 'recording'; readonly mode: RecordingMode | null }
  | { readonly phase: 'saving'; readonly mode: RecordingMode | null }
  | { readonly phase: 'aborted'; readonly mode: RecordingMode | null };

// Les deux seules choses que la Room apporte. Les prendre en paramètres plutôt
// que de lire la Room garde ce module hors du SDK.
export type RoomRecordingSignal = {
  readonly metadata: string | undefined;
  readonly isRecording: boolean;
};

export function deriveRecordingState(signal: RoomRecordingSignal): RecordingState;
```

Règles de `deriveRecordingState`, chacune motivée :

| Entrée | Sortie | Pourquoi |
| --- | --- | --- |
| `metadata` indéfini, vide, non-JSON, ou non-objet | `idle` | le champ est une chaîne libre partagée avec d'autres fonctionnalités ; le parse est défensif, comme celui du web |
| pas de `recording_mode` | `idle` | `egress_ended` supprime les deux clés ; leur absence est l'état de repos |
| `recording_status: "starting"` | `starting` | — |
| `recording_status: "started"` et `isRecording` vrai | `recording` | règle exacte du bundle déployé |
| `recording_status: "started"` et `isRecording` faux | `starting` | idem — l'egress est accepté mais LiveKit ne l'a pas encore signalé |
| `recording_status: "saving"` | `saving` | — |
| `recording_status: "aborted"` | `aborted` | l'egress est mort ; le taire rendrait un échec indiscernable d'un non-démarrage |
| `recording_mode` présent, statut absent ou inconnu | `recording` | **sur-signaler, jamais sous-signaler** |
| `recording_mode` hors des deux valeurs connues | phase inchangée, `mode: null` | l'activité prime sur son étiquette |

La dernière ligne de sur-signalement **diverge délibérément du web**, dont la liste
`QP = ["starting","started","saving"]` est fermée et exclurait un statut inconnu. Le
motif : sur un indicateur de consentement, annoncer un enregistrement qui n'a pas lieu
est embarrassant ; taire un enregistrement qui a lieu est une trahison. C'est le même
raisonnement, dans l'autre sens, que `toEntryStatus` (`src/api/rooms.ts:164-171`), où
l'inconnu retombe sur l'option qui ne fait de mal à personne.

**La frontière de divergence, et la seule** (§3.1) :

```ts
// FRONTIÈRE DE DIVERGENCE `main` / déployé — tout ce qui suit vit ici et nulle
// part ailleurs.
//
//   `main`   : HasPrivilegesOnRoom  → is_administrator_or_owner exigé.
//   déployé  : HasRecordingPermission → niveau par mode, "authenticated" sur
//              meet.linagora.com aujourd'hui, donc strictement plus large.
//
// `isAdministrable` vaut exactement `is_administrator_or_owner`
// (src/call/types.ts:14-19). C'est l'intersection des deux contrats : tout appel
// que cette porte laisse passer est accepté par les deux serveurs.
//
// Pour élargir (arbitrage §3.2, qui appartient au partenaire) : lire
// `recording_permissions` dans la réponse salon — le champ y est déjà sur le
// déployé, `src/api/rooms.ts` l'ignore — et le brancher ici. Rien d'autre à
// toucher.
export function canStartRecording(
  features: InstanceFeatures,
  access: RoomAccess,
): boolean;
```

`features.recording` en fait partie : sans lui, l'instance répondrait 404 (§2.1) et le
bouton serait un geste voué à échouer.

Enfin, la traduction d'un échec en clé de message — pure, donc testable ligne à ligne, et
qui **n'a rien à faire dans le module d'API** (§4.2) :

```ts
export type RecordingAction = 'start' | 'stop';

export type RecordingMessageKey =
  | 'recording.errorBusy'
  | 'recording.errorNotActive'
  | 'recording.errorUnavailable'
  | 'recording.errorForbidden'
  | 'recording.errorStartFailed'
  | 'recording.errorStopFailed'
  | 'error.network'
  | 'error.unauthorized';

export function recordingErrorMessage(
  action: RecordingAction,
  error: ApiError,
): RecordingMessageKey;
```

### 4.2 `src/api/recording.ts` — les deux endpoints

Même forme que `src/api/participants.ts` : fonctions nommées, `ApiResult<T>`, **aucune
retraduction d'erreur**. Le module rend ce que `authedFetch` lui donne ; c'est
`recordingErrorMessage` qui interprète, et l'écran qui affiche.

```ts
export function startRecording(
  account: Account,
  roomId: string,
): Promise<ApiResult<void>>;

export function stopRecording(
  account: Account,
  roomId: string,
): Promise<ApiResult<void>>;
```

- `startRecording` poste `{"mode":"screen_recording"}` — **le mode est une constante du
  module, pas un paramètre** : §3.4 n'en démarre qu'un, et YAGNI. Le jour où
  `transcript` sera livré, le paramètre s'ajoutera là.
- Aucune clé `options` (§3.8). `extra: "forbid"` punit toute clé de trop.
- `stopRecording` n'envoie **ni corps ni `content-type`**. Précaution motivée et non
  contractuelle (§2.4.8) : un `content-type: application/json` sur un corps vide fait
  échouer le parseur JSON de DRF, et le 400 qui en sortirait serait indiscernable d'une
  requête mal formée.
- `roomId` est l'UUID du salon, celui que `call.tsx:188` tient déjà (`access?.room.id`).
  Le slug conviendrait aussi (§2.1) ; on garde l'UUID par cohérence avec les trois
  actions de modération.

### 4.3 `src/call/recordingStore.ts` — le branché

Exactement la forme de `createRoomViewStore` (`src/call/participants.ts:78-120`), y
compris son contrat `useSyncExternalStore` : `getSnapshot()` doit rendre **la même
valeur** tant que rien n'a bougé, sinon le rendu boucle. Donc mémoïsation, et
invalidation par les événements.

```ts
export const RECORDING_EVENTS = [
  RoomEvent.RoomMetadataChanged,
  RoomEvent.RecordingStatusChanged,
  RoomEvent.Reconnected,
] as const;

export type RecordingStore = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => RecordingState;
};

export function createRecordingStore(room: Room): RecordingStore;
```

Trois événements, trois motifs distincts :

- `RoomMetadataChanged` — la source de vérité change (§2.3).
- `RecordingStatusChanged` — `activeRecording` bascule ; c'est la seconde moitié de la
  règle `started && isRecording` (§4.1).
- `Reconnected` — même raison que dans `ROOM_VIEW_EVENTS`
  (`src/call/participants.ts:11-12`) : ce qui a changé pendant la coupure n'est pas
  toujours annoncé. Ici le motif est plus précis : `emitWhenConnected`
  (`livekit-client.esm.mjs:27347-27357`) met les événements en tampon pendant une
  reconnexion et ne les rejoue **qu'après** avoir émis `Reconnected`, et il en **jette**
  tout simplement (`return false`) hors de ces deux fenêtres. Une ligne de coût, une
  fenêtre de perte fermée.

La liste est **exportée et vérifiée nom par nom** par son test, comme
`ROOM_VIEW_EVENTS` (`participants.ts:8-9`) : un événement oublié ne casse rien en
développement, il fige simplement l'indicateur sur l'appareil de quelqu'un d'autre.

`subscribe` périme la valeur au moment de l'abonnement, comme
`participants.ts:99-105` : entre la lecture faite pendant le rendu et l'abonnement, une
métadonnée a pu arriver sans personne pour l'écouter.

**Et surtout — `getSnapshot()` lit `room.metadata` directement.** Il n'attend aucun
événement pour le premier état. C'est ce qui fait que quelqu'un rejoignant une réunion
déjà enregistrée voit l'indicateur : le SDK n'émet **pas** `RoomMetadataChanged` à la
jonction (§2.3, `livekit-client.esm.mjs:26235-26243`).

### 4.4 Les deux coquilles

Elles reçoivent leur état et n'en calculent aucun.

```tsx
// src/screens/room/recordingIndicator.tsx
export type RecordingIndicatorProps = { readonly state: RecordingState };
export function RecordingIndicator(
  props: RecordingIndicatorProps,
): React.ReactElement | null;
```

Rend `null` quand `phase === 'idle'` — donc **toujours montée, jamais enveloppée d'une
condition**, comme `WaitingBanner` (`call.tsx:418-424`). Un libellé par phase, et
`recording.transcriptActive` au lieu de `recording.active` quand `mode === 'transcript'`.
`testID="recording-indicator"`.

```tsx
// src/screens/room/recordingControl.tsx
export type RecordingControlProps = {
  readonly state: RecordingState;
  readonly canStart: boolean;
  readonly busy: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
};
export function RecordingControl(
  props: RecordingControlProps,
): React.ReactElement | null;
```

- `canStart` faux → `null` (§3.5).
- `phase === 'idle'` → bouton de démarrage, icône pleine, `iconColor =
  tokens.color.textDark`, étiquette d'accessibilité `recording.start`.
- toute autre phase → bouton d'arrêt, icône carrée distincte, `iconColor =
  tokens.color.dangerDark`, étiquette `recording.stop`. Un seul bouton, dont l'identité
  suit la phase : l'exclusivité des modes n'a besoin d'aucun état supplémentaire (§3.4).
- `disabled={busy}` dans les deux cas.
- `testID="recording-toggle"`.

### 4.5 Les couleurs sont posées explicitement, et voici les mesures

`call.tsx` impose un fond sombre **dans les deux schémas** (`styles.root`,
`backgroundDark` `#0B0B0C`, `call.tsx:87`). `react-native-paper` fait retomber la couleur
de son texte sur `theme.colors.onSurface`, qui suit le schéma **système** : `#1A1A1A` en
clair. Le périmètre B a livré deux composants sans couleur explicite ; ils mesuraient
**1,08:1** sur `surfaceDark` et **1,13:1** sur `backgroundDark` — invisibles.

**Tout composant de ce périmètre pose une couleur explicite issue de `src/ui/tokens`.**
Ratios calculés contre `backgroundDark` (`#0B0B0C`), méthode WCAG 2.1, vérifiée contre
les deux valeurs déjà consignées dans le dépôt (`#0057B8` → 2,86:1, annoncé
`participantsPanel.tsx:63` ; retrouvé au centième) :

| Jeton | Valeur | Ratio sur `#0B0B0C` | Verdict |
| --- | --- | --- | --- |
| `textDark` | `#ECECEC` | **16,66:1** | AAA — libellés de l'indicateur |
| `dangerDark` | `#FF8A80` | **8,62:1** | AAA — bouton d'arrêt |
| `primaryDark` | `#4D9AFF` | **6,92:1** | AAA — si un `Button` `text`/`outlined` est utilisé |
| `muted` | `#6B7280` | **4,07:1** | **échoue AA en texte normal** (4,5:1) |

`muted` est le seul jeton de couleur **sans variante par schéma** (`tokens/index.ts:22`)
et il ne passe pas ici. **Ne pas l'utiliser sur cet écran**, même pour un libellé
secondaire : `textDark` pour tout texte de l'indicateur.

Aucun style en ligne : `StyleSheet.create` alimenté par les jetons, comme partout
ailleurs.

### 4.6 Ce qui change dans `src/screens/room/call.tsx`

Sept modifications, toutes locales.

1. `MessageKey` s'élargit de `RecordingMessageKey` (union de types, une ligne).
2. `moderationError` devient **`actionError`**, et son `testID` `moderation-error`
   devient `action-error`. La case porte désormais aussi les échecs d'enregistrement :
   garder « moderation » serait un nom qui ment, ce que ce dépôt refuse ailleurs
   explicitement. Coût mesuré : **10 assertions mécaniques** dans `call.spec.tsx`
   (lignes 621 à 894). Le `Snackbar` lui-même (`call.tsx:505-511`) n'est **pas**
   dupliqué — c'est la consigne, et une seconde barre se disputerait la même place.
3. `const [busy, setBusy] = useState(false)` — vrai le temps d'un appel en vol.
4. `const recordingStore = useMemo(() => createRecordingStore(session.getRoom()),
   [session])` puis `useSyncExternalStore`, déclarés **avant les sorties anticipées**,
   comme `roomViewStore` (`call.tsx:177-178`).
5. `const canRecord = account !== null && roomId !== null && access !== null &&
   canStartRecording(account.instance.features, access)` — même forme que `canModerate`
   (`call.tsx:195`), `roomId !== null` inclus pour la même raison exactement : sans lui
   on fabriquait `/api/v1.0/rooms//mute-participant/`.
6. Deux gestionnaires qui **lisent `result.ok`** (§6).
7. `<RecordingIndicator />` dans la bande de `styles.banner`, `<RecordingControl />` dans
   la barre (§9).

---

## 5. Flux

### 5.1 À l'appui sur démarrer

1. `canRecord` est vrai, sinon le bouton n'existe pas.
2. `setBusy(true)`, le bouton se désactive.
3. `startRecording(account, roomId)`.
4. `.then((result) => …)` : `setBusy(false)`, puis `result.ok ? setActionError(null) :
   setActionError(recordingErrorMessage('start', result.error))`.
5. **Aucun état optimiste.** Les métadonnées sont la source unique ; poser un « en cours »
   local créerait une seconde source qui peut contredire la première.

Le serveur écrit `recording_status: "starting"` dès l'acceptation, à l'intérieur du
traitement de la requête (§2.3) ; le 201 et la poussée `RoomMetadataChanged` voyagent
donc en parallèle. Il reste une fenêtre courte où le 201 est reçu et la métadonnée pas
encore : le bouton y redevient « démarrer ». Un second appui y récolte un **409**, traduit
en « un enregistrement est déjà en cours » — un message juste, pas un mensonge. C'est la
dégradation choisie : **pas de minuterie, pas d'état inventé, une phrase exacte.**

### 5.2 Pendant l'attente de l'egress

`phase === 'starting'`. L'indicateur dit « démarrage de l'enregistrement… », visible de
tous. Le bouton est déjà un bouton d'arrêt. C'est précisément la phase que §3.7 refuse
d'effacer : sans elle, l'utilisateur ne saurait pas si son appui a été pris en compte.

### 5.3 L'arrêt, et pourquoi il n'est pas désactivé pendant `starting`

`stop-recording` ne cible que le statut `active` : appelé pendant `initiated`, il rend
**404** (§2.1). On pourrait donc désactiver le bouton d'arrêt pendant `starting`.

**On ne le fait pas.** Rien ne permet de distinguer « deux secondes se sont écoulées » de
« l'egress ne démarrera jamais », et ces deux situations ont la même phase. Griser serait
juste dans le premier cas et **terminal dans le second** : l'utilisateur resterait devant
un bouton mort, sur un enregistrement que l'angle mort du backend (§2.1) rend de toute
façon inarrêtable et qui bloque le salon en 409. Le bouton reste donc actif, et le 404
sur l'arrêt a **sa propre clé de message** — « l'enregistrement n'a pas encore démarré » —
plutôt que de tomber dans un « salon introuvable » qui serait faux.

Après un arrêt accepté : egress `ENDING` → `saving` → `egress_ended` → les clés
disparaissent → `idle`. La phase `saving` est visible : elle dit que le fichier s'écrit,
donc que l'enregistrement existe bel et bien.

### 5.4 En cas d'échec

Toujours le `Snackbar` déjà en place, jamais un autre. Le détail est en §6.

### 5.5 À la reconnexion

`call.tsx` rend la barre pour `connected` **et** `reconnecting` : les deux commandes
restent pressables, et elles partent en HTTP, indépendamment du transport LiveKit. Aucun
cas particulier n'est écrit. Si l'état des métadonnées a bougé pendant la coupure, il
revient par le tampon d'`emitWhenConnected`, rejoué après `Reconnected` — auquel le store
est abonné (§4.3). Si un enregistrement a démarré pendant la coupure et qu'un appui sur
« démarrer » le suit de trop près, le 409 le dit.

### 5.6 Quand un autre participant démarre un enregistrement

Rien n'est appelé, rien n'est scruté. La métadonnée change, `RoomMetadataChanged` est
poussé, le store se périme, l'indicateur apparaît — **pour tout le monde**, y compris
ceux qui n'ont pas le droit d'enregistrer (§3.5). Pour ceux qui l'ont, le bouton devient
un bouton d'arrêt : le serveur n'exige pas d'être celui qui a démarré (§2.1).

### 5.7 Quand on rejoint une réunion déjà enregistrée

C'est le cas que le SDK rend piégeux, et il est traité par construction :
`getSnapshot()` lit `room.metadata`, qui est juste dès la jonction, sans attendre
d'événement — lequel **n'arrive pas** (§2.3). Un indicateur bâti sur l'abonnement seul
resterait éteint toute la séance.

---

## 6. Gestion d'erreur — ce que voit l'utilisateur

Un échec ordinaire de ces deux fonctions est **une valeur, jamais un rejet** :
`ApiResult<T>` est `{ ok: true; value } | { ok: false; error }` (`src/api/types.ts:18`).
Le périmètre B a livré deux bogues sur ce point exact, dont un où le `.catch()` seul
n'attrapait rien — le commentaire de `call.tsx:361-368` en garde la trace. Les deux
gestionnaires de ce périmètre **lisent `result.ok`**, et gardent un `.catch()` séparé
pour l'exception inattendue :

```ts
const handleStartRecording = (): void => {
  if (account === null || roomId === null) return;
  setBusy(true);
  startRecording(account, roomId)
    .then((result) => {
      setBusy(false);
      setActionError(result.ok ? null : recordingErrorMessage('start', result.error));
    })
    .catch(() => {
      setBusy(false);
      setActionError('error.network');
    });
};
```

Un succès efface l'erreur d'un essai précédent, comme les trois actions de modération.

Traduction, telle que `recordingErrorMessage` la fixe :

| `ApiError` | HTTP d'origine | `start` | `stop` |
| --- | --- | --- | --- |
| `network` | — | `error.network` | `error.network` |
| `unauthorized` | 401 après rejeu | `error.unauthorized` | `error.unauthorized` |
| `forbidden` | 403 | `recording.errorForbidden` | `recording.errorForbidden` |
| `not-found` | 404 | `recording.errorUnavailable` | `recording.errorNotActive` |
| `server` `status === 409` | 409 | `recording.errorBusy` | `recording.errorStopFailed` |
| `server` autre | 400, 500, 502 | `recording.errorStartFailed` | `recording.errorStopFailed` |
| `validation` | 400 conforme DRF | `recording.errorStartFailed` | `recording.errorStopFailed` |
| `lobby` | — | `recording.errorStartFailed` | `recording.errorStopFailed` |

Quatre remarques que cette table encode :

- **Le 404 ne dit pas la même chose selon l'action**, et `ApiError` ne sait pas d'où il
  vient : c'est le paramètre `action` qui le tranche. Sur `start` il est ambigu
  (fonctionnalité coupée **ou** salon inconnu, §2.1) et le message reste au niveau de
  cette ambiguïté — « l'enregistrement n'est pas disponible sur ce serveur » — sans
  jamais annoncer « salon introuvable », ce qui serait faux une fois sur deux.
- **Le 409 arrive en `{ kind: 'server', status: 409 }`** : `mapStatus`
  (`src/api/client.ts:52-56`) ne traite spécialement que 403 et 404, tout le reste tombe
  en `server` avec son statut. Il est donc lisible, et il l'est.
- **Le 400 de ces endpoints n'est pas une `validation`** : son corps est
  `{"detail": "Invalid request."}`, une chaîne et non une liste, ce que `readValidation`
  (`src/api/client.ts:39-49`) exige de chaque valeur. Il retombe donc en
  `{ kind: 'server', status: 400 }`. Un 400 ici signale de toute façon un corps mal
  formé, c'est-à-dire un bogue de l'application, pas une situation d'utilisateur.
- **`lobby` n'est jamais produit par `authedFetch`** — seul `fetchRoomAccess` le fabrique
  (`src/api/rooms.ts:40`). Il figure dans la table parce que l'union doit être traitée
  exhaustivement, pas parce que le cas existe.

**Aucun échec silencieux.** Tout `{ ok: false }` atteint la barre. Et l'échec qui ne passe
par aucun appel — un egress qui meurt de lui-même — est visible autrement : la phase
`aborted` porte son propre libellé dans l'indicateur, plutôt que de retomber
silencieusement en `idle`, où un enregistrement mort serait indiscernable d'un
enregistrement jamais démarré. Ce libellé disparaît de lui-même quand `egress_ended`
efface les clés (§2.3) ; si ce webhook n'arrivait pas, il resterait affiché — limite
nommée en §8.

Clés de traduction, **sept locales réellement traduites**. `src/i18n/index.spec.ts:17-22`
ne vérifie que la *présence* : une clé recopiée de l'anglais passe le test tout en étant
un défaut.

| Clé | en | fr |
| --- | --- | --- |
| `recording.start` | Record the meeting | Enregistrer la réunion |
| `recording.stop` | Stop the recording | Arrêter l'enregistrement |
| `recording.starting` | Starting the recording… | Démarrage de l'enregistrement… |
| `recording.active` | Recording in progress | Enregistrement en cours |
| `recording.transcriptActive` | Transcription in progress | Transcription en cours |
| `recording.saving` | Saving the recording | Sauvegarde de l'enregistrement |
| `recording.aborted` | The recording was interrupted | L'enregistrement a été interrompu |
| `recording.errorBusy` | A recording is already in progress | Un enregistrement est déjà en cours |
| `recording.errorNotActive` | The recording has not started yet | L'enregistrement n'a pas encore démarré |
| `recording.errorUnavailable` | Recording is not available on this server | L'enregistrement n'est pas disponible sur ce serveur |
| `recording.errorForbidden` | You are not allowed to record this meeting | Vous n'avez pas le droit d'enregistrer cette réunion |
| `recording.errorStartFailed` | The recording could not be started | L'enregistrement n'a pas pu démarrer |
| `recording.errorStopFailed` | The recording could not be stopped | L'enregistrement n'a pas pu être arrêté |

---

## 7. Ce qui est testable, et ce qu'un test ne peut pas prouver ici

### 7.1 Testable, et comment

- **`deriveRecordingState`** — le cœur, et il ne coûte rien à couvrir : métadonnée
  absente, vide, non-JSON, JSON scalaire, JSON sans les clés, chacun des quatre statuts,
  un statut inconnu, un mode inconnu, un mode sans statut, un statut sans mode, et les
  deux valeurs d'`isRecording` sur `"started"`. Pur, sans réseau ni rendu, éprouvable par
  mutation comme `src/rooms/waitingQueue.ts`.
- **`canStartRecording`** — la table de vérité `features.recording` × `isAdministrable`,
  quatre cas.
- **`recordingErrorMessage`** — les huit membres d'`ApiError` × deux actions, plus le 409
  distingué du reste des `server`.
- **`startRecording` / `stopRecording`** — contre un `fetch` bouchonné : l'URL exacte, la
  méthode, le corps **strictement** `{"mode":"screen_recording"}` (l'absence de toute
  autre clé est un assert, à cause d'`extra: "forbid"`), l'absence de corps et de
  `content-type` sur l'arrêt, et — le plus important — qu'un 403, un 409 ou un 502 rendent
  `{ ok: false }` **sans lever**.
- **`createRecordingStore`** — contre un faux `Room` portant `metadata`, `isRecording`,
  `on`, `off` : que `getSnapshot()` rende une valeur juste **avant tout événement** (c'est
  le test du cas « rejoindre en cours d'enregistrement », §5.7), que sa valeur soit
  *identique* tant que rien ne bouge, que la liste `RECORDING_EVENTS` soit exactement
  celle attendue **nom par nom**, et que le désabonnement détache bien.
- **Les deux coquilles** — leur câblage, jamais leur apparence : quel rappel part sur
  quel appui, que rien ne soit rendu quand `canStart` est faux, que le bouton d'arrêt
  soit rendu dès `starting`, que l'indicateur ne rende rien en `idle` et que le libellé
  suive le mode.
- **L'écran** — que l'échec atteigne la barre : un `startRecording` bouché en
  `{ ok: false }` doit produire le message, et un succès l'effacer. C'est exactement le
  test qui aurait attrapé les deux bogues du périmètre B.

Le piège déjà rencontré au périmètre B vaut ici : des données qui ne discriminent pas.
Les fixtures de métadonnées doivent porter des statuts **différents** entre les cas, sans
quoi une dérivation qui rendrait toujours la même phase passerait inaperçue.

### 7.2 Ce qu'un test ne peut pas prouver

1. **Que le serveur de production accepte notre corps.** Rien dans ce dépôt n'appelle
   `meet.linagora.com`. Le contrat est lu dans la source de `main` et la PR #794 ne le
   touche pas — mais aucun test n'attraperait un changement de forme du corps. Seul un
   appel réel le prouve.
2. **Que `isAdministrable` signifie toujours `is_administrator_or_owner` sur le build
   déployé.** Toute la politique repose là-dessus (§3.2).
3. **La durée réelle de `starting`.** Un faux `Room` prouve la machine à états, jamais une
   durée. Or la décision de ne pas griser l'arrêt (§5.3) s'appuie sur le fait que cette
   phase est courte — mesurable seulement sur appareil contre une instance réelle.
4. **Que `egress_ended` efface bien les clés**, donc que `saving` et `aborted` soient
   transitoires. Lu dans la source du backend, jamais observé par nous.
5. **Que LiveKit pousse effectivement `RoomMetadataChanged` à un participant absent au
   moment du changement.** Notre conception ne s'y fie pas — elle lit — et l'abonnement à
   `Reconnected` est une assurance, pas une preuve.
6. **Le contraste perçu.** Jest ne rend aucun pixel : les ratios de §4.5 sont calculés,
   pas mesurés, et seule une lecture sur appareil en schéma clair dirait s'ils tiennent.
   Mais la **cause** du bogue à 1,08:1 du périmètre B, elle, est gardable : une égalité
   stricte `toHaveStyle({ color: … })` échoue dès que la couleur explicite est retirée,
   quel que soit le repli qui la remplace. Voir la section de contraste d'`AGENTS.md`,
   qui borne aussi les deux surfaces hors de portée.
7. **Qu'un enregistrement bloqué en `initiated` produise un 409 permanent** (§2.4.3) :
   nous ne savons pas le provoquer.

---

## 8. Ce que ce périmètre ne fait pas

Écrit, donc opposable. Une limite tue n'est pas un livrable.

- **Pas de sous-titres.** Ni bouton, ni fonction d'API, ni affichage (§3.3). La
  divergence de transport du jeton (§2.2) reste documentée ici pour celui qui les
  livrera : elle n'existe dans aucun fichier de code.
- **Pas de mode `transcript` démarrable.** Il est lu et nommé, jamais déclenché (§3.4).
- **Pas d'accès aux enregistrements terminés** : ni liste, ni téléchargement, ni
  suppression (§3.6). L'artefact se récupère depuis le client web.
- **Un enregistrement démarré depuis le mobile n'est visible que de celui qui l'a
  démarré.** `perform_create` ne crée un `RecordingAccess(role=OWNER)` que pour
  l'appelant ; les autres organisateurs ne le retrouveront pas dans `/recordings/`. Nous
  n'ajoutons aucun accès, faute d'une route établie (§2.4.4).
- **Pas de `options.language`, ni de sélecteur** (§3.8).
- **Pas de compte à rebours sur `max_duration`**, ni d'avertissement d'expiration. Les
  deux valeurs sont déclaratives ; la coupure réelle vient de l'egress et l'expiration du
  cycle de vie du bucket (§2.2). Afficher un décompte que le serveur ne garantit pas
  serait une promesse.
- **Pas de traitement des messages de données `screenRecordingLimitReached` /
  `transcriptionLimitReached`.** Ce sont des notifications ponctuelles, que quiconque
  arrive après rate ; l'état durable est déjà couvert par les métadonnées (§2.3).
- **Pas de consentement demandé aux participants.** Le backend n'expose rien de tel ;
  l'indicateur informe, il ne négocie pas.
- **Pas de sortie de l'angle mort du backend.** Un enregistrement resté `initiated` bloque
  le salon en 409 et **aucun appel client ne peut le débloquer** (§2.1). L'application
  affiche des messages exacts ; elle ne répare pas. Le correctif est en amont.
- **La phase `aborted` peut rester affichée** si `egress_ended` n'arrive jamais. Elle
  n'est effacée par rien d'autre. Accepté : la nettoyer nous-mêmes demanderait une
  minuterie et un état local, c'est-à-dire une seconde source de vérité.
- **Pas de notification hors application.** Même raison qu'au périmètre B : il faudrait
  des notifications push et un backend meet qui sache les émettre.

---

## 9. Note de dépendance — la barre de contrôle appartient au périmètre A

Le périmètre A remanie en parallèle la barre de contrôle de `src/screens/room/call.tsx`.
**Ce document ne fixe pas la position du bouton dans la barre**, et ne suppose rien de sa
forme finale. Il fixe ce qui doit survivre à ce remaniement :

**Ce qui ne dépend pas du périmètre A, et ne doit pas y être déplacé.**
L'**indicateur** n'est pas une commande : il est vu par des gens qui n'ont aucun bouton
(§3.5). Il se pose dans la bande de `styles.banner` (`call.tsx:88`, celle du message de
reconnexion), au-dessus de la scène, hors de la barre. Cette partie du périmètre est
indépendante de A, et c'est la partie critique — celle du consentement.

**Ce que le périmètre A doit placer, exprimé sans supposer sa forme.**

- **Un seul contrôle**, pas deux. Son identité suit la phase : démarrer en `idle`, arrêter
  partout ailleurs.
- **Il n'existe pas** quand `canStart` est faux — il n'est ni grisé ni masqué par une
  opacité : il n'est pas rendu.
- **Trois états visibles** : disponible, désactivé pendant un appel en vol (`busy`), et
  « arrêt » avec une couleur d'alerte.
- **Il doit être distinguable au doigt du bouton « quitter ».** Les deux emploient
  `dangerDark` — l'un parce que rouge est la convention de l'enregistrement, l'autre parce
  que `dangerLight` tombe à 3,4:1 sur ce fond (`tokens/index.ts:5`). Deux boutons rouges
  voisins dans la même barre invitent au raccrochage accidentel pendant un enregistrement.
  **Contrainte de placement, à charge du périmètre A** : icônes nettement distinctes
  (carré d'arrêt contre combiné raccroché) et non adjacents.
- Son `testID` est `recording-toggle`, ses libellés d'accessibilité `recording.start` /
  `recording.stop`.

**Deux points de contact dans le fichier partagé**, à signaler au moment de la fusion :

1. Le renommage de `moderationError` en `actionError` et du `testID` `moderation-error` en
   `action-error` (§4.6.2) — 10 assertions mécaniques dans `call.spec.tsx`. La `Snackbar`
   elle-même n'est pas touchée.
2. Deux appels de Hook supplémentaires (`useMemo` + `useSyncExternalStore`) déclarés avec
   les autres, **avant** les sorties anticipées.
