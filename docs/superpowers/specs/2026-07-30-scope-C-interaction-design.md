# Périmètre C — Interaction en séance : chat, réactions, main levée

Conception arrêtée le 2026-07-30. Troisième des quatre sous-projets de la barre de contrôle
en séance : B (participants) est fusionné, A (périphériques) est conçu le même soir, D
(enregistrement) aussi.

Source primaire : `.superpowers/sdd/2026-07-30-scope-C-interaction.md`, étude de terrain menée
dans la source de `suitenumerique/meet` (backend et frontend), dans `livekit-client` 2.18.0 et
dans `@livekit/react-native` 2.12.0. Les renvois `§n` sans autre précision désignent ses
sections. Les renvois `A §n` et `D §n` désignent les conceptions des périmètres A et D.

Les faits que ce document **ajoute** portent leur `fichier:ligne`, relevé dans le worktree
`scope-c` (branche `feat/scope-c-interaction`, coupée sur `main` à `635c02f`) ou dans
`node_modules/`. Aucun appel réseau n'a été fait, aucune instance sondée, aucun
`npm install` lancé.

Convention de lecture reprise du rapport et du périmètre A : **[V]** vérifié en lisant du
code, **[S]** supposé, non exécuté. Une décision qui repose sur un **[S]** le dit.

> **Avertissement hérité, à ne jamais perdre de vue.** Le §0 du rapport établit que le bundle
> web téléchargé est **antérieur** au dépôt `main` et le contredit sur la main levée : il lève
> la main par `setAttributes()` côté client, chemin que le grant `can_update_own_metadata=False`
> rend impossible (§3.4, **[V]**). **Rien de ce document ne s'appuie sur le bundle.** Le dépôt
> `main` fait foi partout.

---

## 0. Quatre corrections au rapport, vérifiées ici

Elles changent la conception. Elles sont en tête pour qu'un implémenteur ne reparte pas du
rapport seul.

### 0.1 L'obstacle (a) du §6.2 n'existe plus. Le périmètre B l'a levé.

Le rapport écrit que « après la jonction, le JWT LiveKit et l'UUID de salle ne sont
accessibles de nulle part dans l'app ». **C'était vrai à sa rédaction, ça ne l'est plus.**
Vérifié ligne à ligne :

- `src/screens/room/call.tsx:161` porte `const [access, setAccess] = useState<RoomAccess | null>(null)`.
- `src/screens/room/call.tsx:246` le remplit : `setAccess(result.value)`, dès que le serveur
  confirme l'accès et **avant** la négociation média.
- `src/call/types.ts:10-20` définit `RoomAccess = { room: Room; livekitUrl: string; token: string; isAdministrable: boolean }`.
- `src/call/types.ts:4` : `Room.id` est `string | null`.

**Le JWT LiveKit et l'identifiant de salon sont donc dans l'état de l'écran de séance.**
`toggle-hand` a ce qu'il lui faut sans aucun préalable. **[V]**

Reste vrai du rapport : `livekit.room` — le nom de salle LiveKit — est bien parsé
(`src/api/rooms.ts:13`) et **jamais recopié** dans `RoomAccess`. Ce périmètre n'en a pas
besoin : voir §3.1 pour la façon d'adresser le salon.

### 0.2 `TextStreamReader` rend des **deltas**, pas des cumuls. `readAll()` est sûr.

Le rapport marque **[S]** en §1.3 point 2 une incohérence potentielle : la documentation de
2.18.0 dit que l'itérateur rend « the entire string that has been received up to the current
point in time », alors que `@livekit/components-core` concatène ces valeurs — ce qui
dupliquerait.

**J'ai lu l'implémentation. Le commentaire est faux, le code ne l'est pas.**

`node_modules/livekit-client/src/room/data-stream/incoming/StreamReader.ts:213-254` — le
`next()` de `TextStreamReader[Symbol.asyncIterator]` rend `decoder.decode(result.value.content)`,
c'est-à-dire **le contenu décodé du seul chunk courant**. Et `readAll()`
(`StreamReader.ts:283-289`) fait `for await (const chunk of iterator) finalString += chunk`.
Si l'itérateur rendait des cumuls, `readAll()` — l'API principale de la classe — rendrait
`"a" + "ab" + "abc"`. Elle ne le fait pas.

> **Conséquence : `await reader.readAll()` rend le texte complet du message, et c'est le
> seul appel dont ce périmètre a besoin en réception.** Le `scan()` de `components-core` est
> correct lui aussi. Le **[S]** du rapport est levé. **[V]**

### 0.3 `STREAM_CHUNK_SIZE` compte des **octets**, et le découpage respecte les codepoints.

Le rapport écrit « des `streamChunk` de 15 000 caractères max ». C'est
`OutgoingDataStreamManager.ts:27` — `const STREAM_CHUNK_SIZE = 15_000` — mais il est passé à
`splitUtf8(text, STREAM_CHUNK_SIZE)` (`:148`), qui encode d'abord en UTF-8 puis découpe **en
octets**, en reculant tant que l'octet de coupe est une continuation `0b10xxxxxx`
(`node_modules/livekit-client/src/room/utils.ts:743-766`). **[V]**

Deux conséquences : la limite réelle est plus courte que 15 000 pour tout texte non-ASCII, et
aucune coupure ne tombe au milieu d'un codepoint — donc le `TextDecoder('utf-8', { fatal: true })`
du lecteur ne peut pas échouer sur une frontière de chunk. La borne de saisie retenue en §5.C6
n'existe donc **pas** pour éviter une casse ; elle existe pour rester sur le chemin
mono-chunk.

### 0.4 Ce que je n'ai pas pu vérifier, et qui reste **[S]**

- **La sémantique de `UpdateParticipantRequest.attributes` : fusion ou remplacement ?**
  (§3.6). `toggle_hand` n'envoie que `{"handRaisedAt": …}` ; si l'API serveur remplaçait la
  carte entière, lever la main effacerait `color`, `room_role` et `is_authenticated`
  (§3.2). Le `livekit-server-sdk` n'est pas installé ici et je n'ai pas d'instance.
  **Ce que ça change pour nous : rien de créé.** `toggle-hand` est le chemin **nominal de
  meet lui-même** — si la sémantique était destructive, le client web de meet serait déjà
  cassé par sa propre fonctionnalité. Le risque est **hérité**, pas introduit. Ce qui le
  trancherait : un appel réel, puis la lecture de `participant.attributes` depuis un second
  client.
- **`metadata="null"`** (§3.7) : même raisonnement, même conclusion. Signalé, pas bloquant.
- **Le comportement multi-chunk en conditions réelles.** §0.2 est une lecture de code, pas une
  exécution. La borne de §5.C6 nous garde du chemin non éprouvé.

---

## 1. Le problème

En séance, personne ne peut rien **dire**. La barre porte six commandes
(`src/screens/room/call.tsx:454-499`) : micro, caméra, retournement, partage, participants,
quitter. Toutes portent sur des périphériques ou sur la porte. Aucune ne permet d'écrire un
mot, de réagir, ni de demander la parole.

Recherche exhaustive du rapport (§6.1) : `publishData`, `sendText`, `registerTextStreamHandler`,
`DataReceived`, `setAttributes`, `ParticipantAttributesChanged`, `attributes` — **zéro
occurrence** dans `src/` et `app/`. Confirmé : aucun store, aucun contexte, aucun panneau.

Ce périmètre ajoute trois fonctions. Elles se ressemblent à l'écran et **ne se ressemblent en
rien sous le capot** : deux d'entre elles voyagent par les canaux de données LiveKit, la
troisième par un appel REST authentifié par un jeton que le client HTTP de l'application ne
sait pas porter. C'est cette dissemblance, et non les fonctions elles-mêmes, qui commande
l'architecture.

Un second problème, plus dur que le premier : **il ne reste pas de place dans la barre.**
Le périmètre A a mesuré que sept cibles y consomment déjà 357 dp sur les 360 dp d'un
téléphone standard (A §3, Q3). Trois boutons de plus n'est pas une option arithmétique. §4
y répond.

---

## 2. Les deux transports

### 2.1 Ce que chacun est

| | **Canal de données LiveKit** | **API REST de meet** |
|---|---|---|
| Porte | chat (`sendText`, topic `lk.chat`), réactions (`publishData`, sans topic) | main levée (`POST /api/v1.0/rooms/{pk}/toggle-hand/`) |
| Authentification | aucune en propre — le transport est celui de la séance déjà ouverte | `Authorization: Bearer <JWT LiveKit>`, **pas** la session OIDC (§3.1) |
| Qui reçoit | les participants **actuellement connectés**, en fan-out | l'appelant seul reçoit le `200` |
| Qui propage aux autres | le SFU, immédiatement | **personne, directement.** Le backend écrit un attribut participant ; c'est le **serveur LiveKit** qui diffuse (§3.3) |
| Nature de la donnée | un **événement** — il passe, puis il n'existe plus | un **état** — porté par le participant, maintenu côté serveur |
| Un arrivant tardif voit | **rien** | **tout, immédiatement** (§3.3, §4) |
| Survit à un `Disconnected` | non | oui, tant que le participant reste dans la salle LiveKit |
| Latence perçue | un aller simple | **deux allers-retours** : requête HTTP, puis poussée LiveKit |
| Accusé de réception | aucun. `publishData` et `sendText` résolvent quand la donnée est écrite sur le canal, pas quand elle est lue | `200 {"status":"success"}`, puis confirmation indépendante par l'attribut |

### 2.2 Ce que le canal de données garantit — et ce qu'il perd

**Garanti.** `reliable: true` assure l'ordre et la retransmission **à l'intérieur d'un canal
vivant**. `publishData` est **lossy par défaut** si l'option est omise
(`node_modules/livekit-client/dist/src/room/types.d.ts:46-58`, **[V]**) : meet le passe
explicitement à `true` (§2.1) et nous ferons pareil.

**Perdu.** Tout. Il n'y a **aucun tampon, aucun rejeu, aucun historique** — ni côté meet (aucun
modèle de message dans `models.py`, §1.5), ni côté LiveKit (fan-out vers les connectés). Un
message émis pendant qu'un participant est coupé lui est **définitivement** perdu (§4). Les
streams en vol au moment d'une coupure sont abandonnés (`clearControllers()`).

**Ce qui survit quand même, et que j'ai vérifié.** Les *handlers* enregistrés survivent :
`IncomingDataStreamManager` est construit **une fois** dans le constructeur de `Room`
(`node_modules/livekit-client/src/room/Room.ts:243`) et `handleDisconnect` n'appelle que
`clearControllers()` (`Room.ts:1566-1570`) — la `Map` `textStreamHandlers` n'est jamais vidée
(`IncomingDataStreamManager.ts:28-42`). **[V]** — le rapport marquait ce point **[S]** (§4).
Combiné au fait que `createCallSession()` construit `new Room()` une seule fois
(`src/call/connection.ts:75`) et ne la recrée jamais, **un handler attaché une fois vaut pour
toute la séance, reconnexions comprises.**

### 2.3 Ce que l'API REST garantit — et ce qu'elle perd

**Garanti.** L'horodatage `handRaisedAt` est posé **par le serveur** meet
(`timezone.now().isoformat()`, §3.2), donc l'ordre de la file est cohérent entre clients sans
dépendre de l'horloge des terminaux. L'état est reconstructible par n'importe quel arrivant en
lisant `participant.attributes`. C'est **la seule des trois fonctions dont l'état se
reconstruit** (§4).

**Perdu.** L'identité vient du **jeton**, jamais du corps : on ne peut lever ou baisser que
**sa propre** main (§3.1, **[V]**). Et `handRaisedAt` disparaît avec le participant : quitter
et revenir baisse la main.

**Le piège de latence.** L'API ne notifie personne. Elle écrit un attribut, et c'est LiveKit
qui diffuse. Entre l'appui et l'affichage il y a donc **deux sauts**, et le `200` HTTP n'est
**pas** la preuve que quiconque a vu quoi que ce soit. C'est ce qui dicte §7.1.

### 2.4 Quand ils désaccordent

Trois désaccords sont réels et doivent être traités, pas découverts :

1. **Le `200` arrive, l'attribut jamais.** Le backend a répondu, la poussée LiveKit se perd ou
   arrive après une coupure. L'écran affiche alors une main baissée alors que le serveur la
   croit levée. **Traitement : l'affichage suit l'attribut, jamais l'appui** (§7.1). L'écart
   se referme tout seul au premier `ParticipantAttributesChanged` ou `Reconnected` — les deux
   provoquent une relecture complète de la vue (§3.2).
2. **Le canal de données est mort, l'API répond.** Pendant une reconnexion, la main levée
   continue de marcher — c'est du HTTP — tandis que chat et réactions ne partent plus.
   **Traitement : `publishData` et `sendText` ne résolvent pas ; aucun écho local n'apparaît**
   (§5.T2), et le bandeau de reconnexion est déjà à l'écran (`call.tsx:446-452`).
3. **L'API est morte, le canal vit.** L'inverse : on peut écrire, pas lever la main. Le
   `ApiResult` en échec produit une `Snackbar` explicite (§8). Aucun des deux n'est masqué par
   l'autre.

**Il n'y a aucune tentative de réconcilier les deux transports.** Ils ne partagent ni store, ni
type, ni fichier. Une conception qui les unifierait derrière une abstraction commune paierait
cette abstraction pour cacher précisément ce que la ligne 1 du tableau ci-dessus rend
utile : que l'une des trois fonctions est de l'état et les deux autres des événements.

---

## 3. Les obstacles d'état du code

Cette section existe pour qu'un implémenteur ne perde pas une journée. Les deux obstacles sont
vérifiés dans le worktree.

### 3.1 (b) `authedFetch` ne peut pas porter le bearer LiveKit

**Le fait.** `src/api/client.ts:68-72` :

```ts
headers: {
  ...(init?.headers as Record<string, string> | undefined),
  accept: 'application/json',
  authorization: `Bearer ${token}`,
},
```

`authorization` est étalé **en dernier** : tout en-tête `authorization` passé via
`init.headers` est silencieusement écrasé. Et `token` vient exclusivement de
`getAccessToken(account.id, account.instance)` (`:76`), c'est-à-dire de l'**access token
OIDC**. Il n'existe ni paramètre, ni option, ni surcharge. **[V]**

Second fait, plus grave : sur `401`, `authedFetch` appelle `forceRefresh(...)` puis rejoue
(`src/api/client.ts:86-94`). Pour un endpoint authentifié par JWT LiveKit c'est la **mauvaise
récupération** — un `401` y signifie que le **jeton de salle** est invalide, et le
rafraîchissement OIDC consommerait un aller-retour SSO pour renvoyer exactement le même
en-tête erroné. **[V]**

**La solution retenue : un module d'un seul appel, qui ne connaît pas `Account`.**

`src/api/hand.ts` fait son propre `fetch`. Pas de client générique, pas de « bearer
pluggable » dans `authedFetch` : **il y a exactement un endpoint authentifié par jeton LiveKit
dans tout ce périmètre**, et généraliser pour un cas unique coûterait un paramètre de plus sur
chaque appel des cinq fonctions de `src/api/participants.ts` et des six de
`src/api/rooms.ts`, pour zéro appelant.

La signature ne prend **pas** d'`Account` :

```ts
export async function toggleHand(
  serverUrl: string,
  roomRef: string,
  livekitToken: string,
  raised: boolean,
): Promise<ApiResult<void>>;
```

*Motif du `serverUrl: string` plutôt que `account: Account`* : recevoir un `Account`
suggérerait que la fonction s'authentifie avec les identifiants du compte — la confusion exacte
qui produit l'obstacle (b). Passer l'URL nue rend visible, dans la signature, que le seul
secret utilisé est le jeton de salle. Effet de bord : la fonction se teste avec deux chaînes.

Trois règles internes, chacune l'inverse d'`authedFetch` :

1. **Aucun rafraîchissement OIDC. Aucun rejeu.** Un `401` est rendu tel quel.
2. **`AbortSignal.timeout(REQUEST_TIMEOUT_MS)`**, comme `authedFetch` (`client.ts:73`,
   `src/constants.ts:5` = 15 000 ms). Ce point-là est repris, pas inversé.
3. **La correspondance de statut est celle du contrat de `toggle_hand`** (§3.1), et elle
   n'utilise **jamais** `{ kind: 'unauthorized' }` :

| Statut | Ce que ça veut dire ici | `ApiError` rendu |
|---|---|---|
| `200` | `{"status":"success"}` | — (`{ ok: true, value: undefined }`) |
| `400` | `raised` absent ou non booléen — **notre bug**, on envoie toujours un booléen | `{ kind: 'server', status: 400 }` |
| `401` / `403` | le jeton de salle est invalide ou ne porte pas sur ce salon | `{ kind: 'forbidden' }` |
| `404` | `{"error":"Participant not found"}` — l'identité n'est pas dans la salle LiveKit | `{ kind: 'not-found' }` |
| autre | | `{ kind: 'server', status }` |
| `fetch` rejette | | `{ kind: 'network' }` |

> **Pourquoi jamais `unauthorized`.** `error.unauthorized` s'affiche « Session expired, please
> sign in again » (`src/i18n/locales/en.json:49`). Un `401` de `toggle-hand` ne dit **rien**
> de la session OIDC : elle est parfaitement valide. Afficher ce message enverrait
> l'utilisateur se reconnecter pour un problème qui n'est pas là. C'est le même défaut que
> `mapRefusal` corrige déjà côté SSO (`client.ts:8-13`).

**Ce que ce module ne fait pas** : il ne lit pas le corps de la réponse. `{"status":"success"}`
n'ajoute rien à `200`, et un `ApiResult<void>` est ce que consomment déjà les cinq actions de
`src/api/participants.ts`.

**Comment adresser le salon.** `roomRef` est `access.room.id ?? access.room.slug`.
`RoomViewSet.get_object()` tente `uuid.UUID(pk)` et retombe sur `slug=slugify(pk)` (§3.1,
**[V]**), donc les deux formes résolvent le même objet — et la permission
`HasLiveKitRoomAccess` compare ensuite `request.auth.video.room == str(obj.id)`, ce qui vaut
quel que soit le chemin d'adressage. `Room.id` étant `string | null` (`src/call/types.ts:4`),
le repli sur le slug **supprime purement et simplement le cas nul** que le périmètre B a dû
garder ailleurs (`call.tsx:188-195`). Ni garde, ni `?? ''`, ni route de la forme
`/api/v1.0/rooms//toggle-hand/`.

### 3.2 (c) `ParticipantAttributesChanged` n'est pas écouté, et les attributs ne sont pas projetés

**Le fait.** `src/call/participants.ts:17-31` déclare `ROOM_VIEW_EVENTS` — treize `RoomEvent`,
et `ParticipantAttributesChanged` n'en fait pas partie. `readParticipant()`
(`src/call/participants.ts:47-58`) projette `identity, name, isLocal, isSpeaking, lastSpokeAt,
joinedAt, camera` — **ni `attributes`, ni `metadata`**. La main levée étant portée par un
attribut participant, **rien de l'état actuel ne la verrait passer**. **[V]**

**La solution : deux lignes de plus, dans le module qui est déjà la frontière du SDK.**

1. `ROOM_VIEW_EVENTS` gagne `RoomEvent.ParticipantAttributesChanged`. Le nom sur le fil est
   `"participantAttributesChanged"`
   (`node_modules/livekit-client/dist/src/room/events.d.ts:180`) et sa signature au niveau
   `Room` est
   `(changedAttributes: Record<string, string>, participant: RemoteParticipant | LocalParticipant) => void`
   (`Room.d.ts:309`). **[V]** — le participant **local y est inclus**, ce qui est ce qui rend
   §7.1 possible.

   > Piège nommé : sur l'émetteur *participant-scoped*, l'événement s'appelle
   > `attributesChanged` et non `participantAttributesChanged`
   > (`Participant.d.ts:137`, **[V]**). Nous n'utilisons que la forme `Room`.

2. `readParticipant()` projette **un seul champ**, pas la carte :

```ts
// src/call/layout.ts — ParticipantView gagne :
  // Horodatage ISO 8601 posé par le serveur meet, `null` quand la main est
  // baissée. Le contrat backend distingue la chaîne vide (baissée) de
  // l'absence de clé (jamais levée) ; les deux se lisent `null` ici.
  readonly handRaisedAt: string | null;
```

*Pourquoi un champ et pas `attributes` en entier* : `ParticipantView` est décrit comme « ce
dont la sélection a besoin, et rien de plus » (`src/call/layout.ts:15-17`). Y verser une carte
de chaînes ouvertes ferait de ce type une passoire vers le SDK, ce que tout le fichier existe
pour éviter. Un champ nommé se teste, se documente, et ne transporte pas `color` ni `room_role`
dont personne ici n'a l'usage.

**Ce que cette addition coûte, nommé.** `ParticipantAttributesChanged` invalide désormais le
store de vue, donc `useCallLayout` recalcule sa mise en page à **chaque** main levée ou
baissée de n'importe qui. `selectLayout` est une fonction pure sur une poignée de participants
et `VideoTrack` est stable par référence de piste : c'est un re-rendu React, pas une
renégociation vidéo. Coût accepté ; l'alternative — un second store écoutant le seul événement
d'attributs — dupliquerait la lecture de la `Room` pour économiser des microsecondes.

**Le lecteur d'attribut est pur et tolérant :**

```ts
// src/call/hands.ts
export function readHandRaisedAt(
  attributes: Readonly<Record<string, string>> | undefined,
): string | null;
```

Le `| undefined` n'est pas une précaution contre le SDK — `Participant.attributes` est un
getter qui rend toujours un objet (`Participant.d.ts:60`, **[V]**). Il est là parce que **tous
les doubles de `Participant` du dépôt sont écrits à la main** derrière un
`as unknown as Participant` (`src/call/participants.spec.ts:22-31`,
`src/screens/room/call.spec.tsx:42-49`) : une projection qui jetterait sur un double
incomplet transformerait l'ajout d'un champ en panne de toute la suite. C'est la même défense
que `participant.name ?? ''` et `lastSpokeAt?.getTime() ?? null` juste à côté.

**Churn de tests à prévoir**, pour qu'il ne surprenne pas : les fixtures de
`src/call/participants.spec.ts` et de `src/screens/room/call.spec.tsx` gagnent `attributes`
là — et seulement là — où un test exerce réellement une main levée.

---

## 4. La place dans la barre

C'est le problème central de ce périmètre. Il se traite par l'arithmétique, pas par le goût.

### 4.1 L'arithmétique, après le périmètre A

Le périmètre A retire `switch-camera` et pose deux commandes (chevron caméra, sortie audio).
Sa géométrie mesurée (A §3, Q3) : sept cibles de 44 dp en six groupes, 1 dp à l'intérieur de la
paire caméra, 8 dp entre groupes, 4 dp de marge de rangée.

```
7 × 44 + 1 + 5 × 8 + 2 × 4 = 357 dp        (tient sur 360 dp et sur 375 pt)
```

Une cible de plus, en septième groupe :

```
8 × 44 + 1 + 6 × 8 + 2 × 4 = 409 dp        (49 dp de trop sur 360)
```

> **Un seul bouton de plus ne tient pas.** Pas trois : **un**. Et il n'y a pas de marge à
> gratter : 40 dp de cible donnerait 377 dp — toujours hors budget, et sous le minimum de 44 dp
> d'Apple que A a déjà consenti à la place des 48 dp de Material. Un écart nul donnerait 361 dp,
> avec des zones tactiles jointives.

L'arithmétique tranche donc avant tout arbitrage produit : **la barre est pleine.** Elle vaut
aussi pour le périmètre D, dont le contrôle d'enregistrement ne rentre pas davantage — voir
§4.5.

### 4.2 Ce qui est refusé, et pourquoi

**Une seconde rangée.** Coûte 44 + 8 = 52 dp de hauteur, en permanence, à tout le monde, y
compris à qui n'écrit jamais. Sur un téléphone de 800 dp dont il reste ~640 dp utiles, c'est
8 % de l'écran pris à la scène — laquelle est la raison d'être de cet écran (`call.tsx:439-441`,
et c'est l'argument que le périmètre B invoque déjà pour refuser d'empiler les bandeaux).
Refusé.

**Réduire les cibles.** Voir §4.1 : ne suffit pas, et dégrade en dessous d'un seuil déjà
consenti.

**Un défilement horizontal de la barre.** Cache des commandes derrière un geste qui n'est
signalé par rien, sur une rangée où se trouve « quitter ». Refusé.

**Une bibliothèque de feuille inférieure.** Aucune n'est installée (§6.3). En ajouter une —
`@gorhom/bottom-sheet` ou équivalent — pour poser un panneau que le périmètre B a déjà su
poser sans elle serait une dépendance nouvelle, à installer par `npx expo install`, dans un
arbre où `legacy-peer-deps=true` fait que **chaque paquet ajouté peut traîner des pairs
absents et invisibles** (`AGENTS.md`, trois précédents documentés). Refusé — non par principe,
mais parce que le bénéfice est nul : le panneau de B remplace la scène et cela marche.

### 4.3 La solution retenue

**Un seul point d'entrée dans la barre, et il ne s'ajoute pas : il remplace `share-btn`.**

- `share-btn` (`call.tsx:476-482`) **quitte la barre** et devient la première ligne du nouveau
  panneau.
- Un `IconButton` `more-toggle` (icône `dots-horizontal`) prend sa place, avec un `Badge` de
  non-lus quand le chat est livré.
- Il ouvre un **panneau qui remplace la scène**, exactement comme `ParticipantsPanel`
  (`call.tsx:430-442`) : même patron, même raison, aucune dépendance nouvelle.

La rangée après C :

```
mic · [caméra | chevron] · sortie audio · participants · plus · quitter
7 × 44 + 1 + 5 × 8 + 2 × 4 = 357 dp        — identique au périmètre A, au dp près
```

**Ce périmètre n'élargit pas la barre d'un seul dp.** Il en réattribue un slot.

Contenu du panneau, dans l'ordre : **Partager le lien** · **Lever / Baisser la main** + la
file des mains levées · **Réactions** (huit cibles, `flexWrap`) · **Chat** (le corps du
panneau).

Et une commande hors panneau, parce qu'elle n'est pas une commande : **quand votre main est
levée, la bande de bandeau de `call.tsx:446-452` — celle du message de reconnexion — porte
« Votre main est levée » et un bouton « Baisser ».** Un appui, sans ouvrir quoi que ce soit.

> L'asymétrie est délibérée. **Lever la main est un acte qu'on prépare ; la baisser est un acte
> qu'on subit** — le modérateur vient de vous donner la parole, et fouiller un panneau à ce
> moment-là est exactement le mauvais moment. Deux appuis pour lever, un pour baisser. C'est
> aussi la raison d'être du bandeau : sans lui, une main levée oubliée est invisible pour celui
> qui l'a levée.

### 4.4 Le coût, nommé

| Ce qui est perdu | Mesure |
|---|---|
| **Partager le lien passe d'un appui à deux.** | C'est le geste le plus fréquent en début de réunion. Il devient : `plus` → `Partager le lien`. |
| **Chat, réactions et main levée sont toutes derrière deux appuis.** | Aucune n'a de raccourci en barre. |
| **Pendant qu'on écrit, on ne voit personne.** | Le panneau remplace la scène. Avec le clavier ouvert, un panneau *superposé* laisserait de toute façon une bande de vidéo inexploitable. |
| **Le badge de non-lus est porté par un bouton générique.** | Il ne dit pas « messages » mais « quelque chose dans le panneau ». Comme le chat est le seul producteur de badge, la convention s'apprend en une réunion — mais c'est une indirection, et elle est écrite ici plutôt que découverte. |
| **La rangée reste hors budget sur un écran de 320 dp.** | 357 > 320. Ce n'est pas C qui l'y met : c'est déjà le cas après A, qui ne revendique que 360 dp et 375 pt. C ne l'aggrave pas d'un dp. |

Ce qui trancherait autrement le premier point : une mesure d'usage réel montrant que le
partage est plus fréquent que l'interaction. Nous n'en avons pas, et l'arithmétique, elle,
est certaine.

### 4.5 Note de dépendance aux périmètres A et D

**C ne peut pas fusionner avant A.** Sans A, la barre porte six `IconButton` à
l'encombrement Paper par défaut — 40 dp de boîte plus `margin: 6`
(`node_modules/react-native-paper/src/components/IconButton/IconButton.tsx:219-224`, **[V]**),
soit 52 dp chacun — avec `gap: tokens.spacing.md` (16) et `padding: tokens.spacing.md` (16)
(`call.tsx:90-96`) : `6 × 52 + 5 × 16 + 2 × 16 = 424 dp`. **Elle déborde déjà.** Toute
l'arithmétique de §4.1 suppose la géométrie de A. Ordre imposé : **A, puis C.**

**Après C, il n'y a plus de slot pour D.** Le contrôle `recording-toggle` que D décrit
(D §9) trouverait une rangée à 409 dp. **Il doit donc vivre dans le panneau `plus`**, en
première position, quand `canStart` est vrai — et n'être pas rendu du tout sinon, comme D le
demande déjà. C'est une conséquence arithmétique, pas une préférence ; mais c'est **une
décision que C ne peut pas prendre seul pour D** : elle est signalée ici, à valider au moment
de la fusion.

En revanche l'**indicateur** d'enregistrement de D reste où D le met — dans la bande de
`styles.banner` —, et **il partage désormais cette bande avec le bandeau de main levée** de
§4.3. Les deux sont des états durables, non des commandes ; les deux peuvent être vrais en même
temps. **Contrainte de fusion, à charge de qui fusionne le second des deux** : la bande empile
ses lignes (`flexDirection` par défaut, colonne) plutôt que d'en laisser une écraser l'autre.

---

## 5. Arbitrages retenus

Les quinze questions du §7 du rapport, plus quatre que la conception a fait apparaître.
Une ligne de décision, une ligne de motif. **Les renversables sont marqués : ils appartiennent
au partenaire, pas à ce document.**

### Chat

**C1 — L'absence d'historique est dite à l'écran, en permanence, et rien n'est persisté.**
Le fil vit dans le store de l'écran de séance. Il **survit aux reconnexions automatiques**
(le store n'est pas démonté, et le handler `lk.chat` non plus — §2.2) et **meurt avec la
séance**. Une ligne fixe en tête du fil : « Les messages ne sont pas conservés. Personne ne
verra ce fil après la réunion, et qui arrive plus tard ne verra pas ce qui précède. »
*Motif* : c'est la vérité (§1.5, quatre constats indépendants), et une interface qui ne la dit
pas ment par omission. La persistance MMKV — la troisième posture du rapport — fait apparaître
une question de conservation de données personnelles sur l'appareil qui dépasse l'ingénierie,
pour un bénéfice nul dans cette application : un vrai `Disconnected` **termine l'écran**
(`call.tsx:390-406`), il n'y a pas de « rejoindre sur place » à alimenter.

> **Renversable, et il appartient au partenaire** : persister le fil en MMKV pour la durée de
> la séance. `react-native-mmkv` est déjà une dépendance et n'est utilisé nulle part ici. Ce
> qui le trancherait : une position produit sur la conservation d'un fil de discussion sur
> l'appareil après la réunion.

**C2 — Pas de marqueur de trou après une reconnexion.**
*Motif* : le bandeau de reconnexion est visible pendant l'incident, et la ligne fixe de C1
cadre déjà l'ensemble. Ajouter un marqueur demande une variante `kind` dans `ChatMessage`,
donc une union dans le type que toutes les fonctions pures doivent traiter.

> **Renversable.** Ce qui le trancherait : un utilisateur qui ne comprend pas pourquoi la
> conversation « saute ». Le coût est une variante de type et une clé i18n.

**C3 — Pas de double écriture sur `lk-chat-topic`.**
*Motif* : sur tout serveur LiveKit ≥ 1.8.2 le paquet legacy porte `ignoreLegacy: true` et **est
jeté par tous les récepteurs** (§1.3, **[V]**). L'écrire ne servirait qu'à un récepteur
derrière un serveur < 1.8.2.

> **Renversable en une ligne** (`publishData(..., { reliable: true, topic: 'lk-chat-topic' })`
> après le `sendText`). Ce qui le trancherait : la matrice de versions LiveKit des instances
> cibles. Elle est **lisible au runtime** — `room.serverInfo?.version`
> (`node_modules/livekit-client/dist/src/room/Room.d.ts:55`, **[V]**) — mais nous ne l'avons
> pas mesurée, et ce périmètre ne l'interroge pas.

**C4 — Pas de pièces jointes. Divergence assumée avec le web.**
*Motif* : `OutgoingDataStreamManager` fait `file.stream().getReader()`, et le `Blob` de React
Native n'implémente ni `stream()`, ni `arrayBuffer()`, ni `text()` (§5, **[V]**). Ce n'est pas
un choix de périmètre, c'est une impossibilité de plateforme ; le contourner demanderait un
chemin dédié complet.

**C5 — On **reçoit** les éditions, on n'en **émet** pas.**
*Motif* : recevoir est une **exigence de correction** — un message de même `id` et de même
émetteur qui n'est pas fusionné produit un doublon à l'écran (§1.6, **[V]**). Émettre est un
choix de périmètre, et il ajoute une interface d'édition, une sélection de message et un
second chemin d'envoi.

**C6 — La saisie est bornée à 2 000 caractères.**
*Motif* : reste sur le chemin **mono-chunk** de `sendText` (§0.3 : la limite réelle est de
15 000 **octets**, `splitUtf8`), donc n'exerce jamais la réassemblage multi-chunk — le seul
chemin de §0.2 que je n'ai pas exécuté. Borne à l'émission seulement : en réception,
`readAll()` reconstitue n'importe quelle longueur.

**C7 — Pas de son, pas de notification hors premier plan, pas d'indicateur de frappe, pas
d'accusé de lecture, pas de réponse ni de mention.**
*Motif* : le son de meet est conditionné à `room.numParticipants < config.max_participants_for_sound`
(§7 Q11) — un champ de configuration que `src/instance/types.ts` ne lit pas et que ce
périmètre n'ira pas chercher pour un son. Les notifications demandent du push et un backend
meet qui sache en émettre : aucun endpoint d'abonnement n'existe (même conclusion que le
périmètre B). Le reste est du produit non demandé.

### Réactions

**C8 — Émettre **et** recevoir. Huit emoji, dans le panneau, jamais dans la barre.**
*Motif* : recevoir sans émettre rendrait le mobile spectateur d'une conversation à laquelle il
ne participe pas ; émettre sans recevoir est pire. Les huit tiennent dans le panneau en
`flexWrap` (44 dp de cible : 4 par rangée sur 360 dp, deux rangées), là où ils ne tiennent sur
aucune barre.

**C9 — Les emoji sont des glyphes Unicode, pas des images.**
*Motif* : le web rend `/assets/reactions/<valeur>.png` (§2.2) et nous n'avons pas ces assets.
La correspondance n'est pas un choix de goût : **les huit valeurs de meet sont les noms courts
Unicode eux-mêmes** — `thumbs-up`, `thumbs-down`, `clapping-hands`, `red-heart`,
`face-with-tears-of-joy`, `face-with-open-mouth`, `party-popper`, `folded-hands`. La table de
§6.4 est mécanique.

**C10 — L'écho local n'apparaît qu'après la résolution de `publishData`. Divergence avec le
web, assumée.**
*Motif* : meet affiche la réaction **avant** de publier (§2.5) ; l'écho ment alors quand la
publication échoue. Ici l'écho **signifie** « c'est parti ». Coût : une frame de latence sur un
canal ouvert, et **rien du tout** pendant une reconnexion — ce qui est l'information juste.

**C11 — La limite de débit est conservée à 10 / 1 000 ms, et son refus n'est signalé par
aucun message.**
*Motif* : la valeur est celle de meet (§2.4) et le mobile n'a aucune raison d'être plus
bavard sur le fil que le web. Le silence, lui, n'en est pas un : **grâce à C10, l'écho local
est le retour**. Un appui accepté produit une bulle, un appui refusé n'en produit pas. Une
`Snackbar` « trop vite » serait plus agaçante que le manque.

**C12 — Au plus six réactions visibles, chacune 3 000 ms, en bulles au-dessus de la scène —
pas d'animation flottante.**
*Motif* : 3 000 ms est la valeur de meet (`ANIMATION_DURATION`, §2.4). Le plafond de six borne
un flot (huit participants × 10/s). L'animation ascendante du web — `ANIMATION_DISTANCE`,
`FADE_OUT_THRESHOLD`, position horizontale aléatoire — est un travail de `reanimated` dont
aucun test ne peut rien dire, sur une grille vidéo de téléphone où elle masquerait des visages.

**C13 — Pas de vocalisation pour lecteur d'écran, ni de réglage.**
*Motif* : le web en fait un réglage utilisateur persisté en `localStorage` (§7 Q12). Il n'y a
**pas d'écran de préférences** dans cette application, et en créer un pour un seul réglage est
hors périmètre. Les huit boutons portent chacun un `accessibilityLabel` traduit ; c'est
l'émission qui est accessible, pas la réception.

> **Renversable, et c'est un choix d'accessibilité qui appartient au partenaire.** Ce qui le
> trancherait : une exigence d'accessibilité explicite. Le coût est un
> `AccessibilityInfo.announceForAccessibility` dans la coquille et le premier écran de
> préférences de l'application.

### Main levée

**C14 — La main n'est jamais relevée automatiquement au retour, et rien ne prévient.**
*Motif* : `handRaisedAt` disparaît avec le participant (§3.3). La relever pour le compte de
quelqu'un le ferait demander la parole sans l'avoir demandé. Prévenir demanderait de retenir
un état entre deux séances, ce que §5.C1 refuse par ailleurs — et le bandeau de §4.3 rend de
toute façon l'état courant impossible à ignorer.

**C15 — Le mobile n'expose pas « baisser la main de quelqu'un d'autre ».**
*Motif* : c'est un **autre endpoint et un autre mécanisme d'authentification** —
`POST /rooms/{id}/update-participant/`, session OIDC, `HasPrivilegesOnRoom` (§3.6). Ce serait
un troisième transport dans un périmètre qui en a déjà deux, pour une action que le
périmètre B n'a pas jugée nécessaire quand il a livré la modération.

> **Renversable, et il appartient au partenaire** : c'est un choix de gouvernance de
> réunion. Ce qui le trancherait : un besoin exprimé par des modérateurs. Le coût est une
> fonction de plus dans `src/api/participants.ts` — qui passe, elle, par `authedFetch` sans
> aucune difficulté — et un bouton dans le panneau de participants.

**C16 — La position dans la file est affichée, dans le panneau `plus`, à côté de chaque nom.**
*Motif* : l'horodatage est posé par le serveur précisément pour que cet ordre existe (§3.2,
verbatim du backend) ; ne pas l'afficher jetterait la seule information que le contrat
fournit. **Elle n'est pas affichée dans le panneau de participants de B** : ce panneau utilise
délibérément l'ordre stable de la `Room` et ne se réordonne pas (`call.tsx:171-178`), et une
main levée y ajouterait un tri mouvant que B a explicitement refusé. La file vit dans son
propre bloc, à côté du bouton qui la produit.

**C17 — L'état du bouton suit l'attribut, jamais l'appui. Pendant la requête, le bouton est
`loading`, jamais `disabled`.**
*Motif* : c'est le seul affichage qui ne peut pas mentir (§2.4 cas 1). Et `disabled` est
interdit sur cet écran : `IconButton/utils.ts:88-93` teste `disabled` **avant**
`customIconColor` et rend `theme.colors.onSurfaceDisabled` — quasi-noir en thème clair, sur
un fond sombre forcé — qu'aucune couleur explicite ne rattrape (`AGENTS.md` de A, **[V]**).
`loading` n'a pas ce défaut : `IconButton.tsx:210-213` rend un `ActivityIndicator` **avec
`color={iconColor}`**, donc avec notre couleur. **[V]**

### Transversal

**C18 — Un seul point d'entrée, et il remplace `share-btn`.** Voir §4.3. Motif :
arithmétique.

**C19 — Le compteur de non-lus est remis à zéro à l'ouverture du panneau, pas au défilement.**
*Motif* : c'est ce que fait le web (§7 Q13), c'est ce qui se teste sans rendu, et un compteur
qui dépendrait de la position de défilement demanderait d'instrumenter une `FlatList`.

**C20 — Aucun sous-titre, aucune transcription.**
*Motif* : le périmètre D a refusé de les livrer (D §3.3) et le fait qu'ils passeraient par
le même SDK ne les fait pas entrer ici. Ce document ne rouvre pas ce refus.

---

## 6. Architecture

Séparation reprise de B et de A : le **pur** d'un côté — décision, tri, normalisation,
éprouvable sans SDK ni rendu — et le **branché** de l'autre. Un fichier, une responsabilité.

Toutes les signatures ci-dessous sont des exports nommés (`export default` interdit hors
`app/`). Aucun `enum` : les unions de chaînes sont la règle du dépôt.

### 6.1 `src/call/hands.ts` — **pur**

```ts
import type { ParticipantView, RoomView } from 'src/call/layout';

// Une main levée, prête à afficher. `raisedAt` est déjà en millisecondes
// d'époque : le tri n'a plus rien à parser.
export type RaisedHand = {
  readonly identity: string;
  readonly name: string;
  readonly raisedAt: number;
  readonly isLocal: boolean;
};

// Contrat backend : chaîne vide = main baissée, absence de clé = jamais levée,
// horodatage ISO 8601 = levée. Les deux premiers cas se lisent `null`.
export function readHandRaisedAt(
  attributes: Readonly<Record<string, string>> | undefined,
): string | null;

// Le local d'abord parce qu'il est dans la file au même titre que les autres :
// prendre `RoomView` plutôt qu'un tableau rend cette inclusion structurelle.
// Tri croissant par horodatage, départage par `identity.localeCompare` — les
// deux règles du web (§3.5). Un horodatage que `Date.parse` rend `NaN` est
// ignoré : un serveur qui écrirait n'importe quoi ne doit pas décider qui parle.
export function raisedHands(view: RoomView): readonly RaisedHand[];

// Position 1-based dans la file, `null` si la main n'est pas levée.
export function handPosition(
  hands: readonly RaisedHand[],
  identity: string,
): number | null;

// Vrai quand la main du participant local est levée. Utilisé par le bouton et
// par le bandeau, qui doivent dire exactement la même chose.
export function isHandRaised(participant: ParticipantView): boolean;
```

### 6.2 `src/api/hand.ts` — **branché**, et volontairement pauvre

```ts
import type { ApiResult } from 'src/api/types';

// N'accepte pas d'`Account` : le seul secret utilisé est le jeton de salle, et
// une signature qui prendrait un compte laisserait croire l'inverse. Voir §3.1.
// Ne rafraîchit jamais l'OIDC, ne rejoue jamais, ne lit pas le corps.
export async function toggleHand(
  serverUrl: string,
  roomRef: string,
  livekitToken: string,
  raised: boolean,
): Promise<ApiResult<void>>;
```

Corps envoyé : `{"raised": true}` / `{"raised": false}`. `raised` est **requis** côté
serveur — pas de `required=False`, pas de défaut (§3.1) —, donc jamais omis.

Chemin : `${serverUrl}/api/v1.0/rooms/${encodeURIComponent(roomRef)}/toggle-hand/`.
L'`encodeURIComponent` reprend la précaution de `src/api/participants.ts:21`.

### 6.3 `src/call/participants.ts` et `src/call/layout.ts` — **modifiés**

- `ROOM_VIEW_EVENTS` gagne `RoomEvent.ParticipantAttributesChanged` (quatorzième entrée).
- `readParticipant()` gagne `handRaisedAt: readHandRaisedAt(participant.attributes)`.
- `ParticipantView` gagne `readonly handRaisedAt: string | null`.

Rien d'autre ne bouge : `createRoomViewStore` invalide déjà sur tout événement de la liste, et
`readRoomView` reconstruit la vue entière (`src/call/participants.ts:62-69, 85-90`).

### 6.4 `src/call/reactions.ts` — **pur**

```ts
// Les huit valeurs telles qu'elles circulent sur le fil. Union de chaînes et
// non `enum` : le dépôt les interdit, et meet les déclare justement en `enum`
// TypeScript côté web (§6.4 du rapport).
export type ReactionKey =
  | 'thumbs-up'
  | 'thumbs-down'
  | 'clapping-hands'
  | 'red-heart'
  | 'face-with-tears-of-joy'
  | 'face-with-open-mouth'
  | 'party-popper'
  | 'folded-hands';

export const REACTION_KEYS: readonly ReactionKey[];

// Les valeurs de meet SONT les noms courts Unicode : la table est mécanique,
// pas un choix esthétique.
export function reactionGlyph(key: ReactionKey): string;

export type Reaction = {
  readonly id: string;          // fourni par l'appelant : un module pur n'appelle pas crypto
  readonly key: ReactionKey;
  readonly identity: string;
  readonly name: string;        // vide quand l'émetteur a déjà quitté la salle
  readonly isLocal: boolean;
  readonly at: number;
};

// Le JSON exact que meet attend, `{"type":"reactionReceived","data":{"emoji":…}}`.
// Rendu en `string` : l'encodage octet est le travail de la couche branchée.
export function encodeReaction(key: ReactionKey): string;

// Le canal sans topic transporte TOUTE la famille NotificationType (§2.3).
// Cette fonction rend `null` pour tout ce qui n'est pas une réaction connue —
// un autre type, un emoji hors liste, un JSON invalide. Elle ne jette jamais.
export function parseReaction(json: string): ReactionKey | null;

export const REACTION_BURST: number;        // 10
export const REACTION_WINDOW_MS: number;    // 1000
export const REACTION_LIFETIME_MS: number;  // 3000
export const REACTION_MAX_VISIBLE: number;  // 6

// Rend la décision ET la fenêtre mise à jour : un limiteur qui muterait un
// tableau ne serait pas testable en table.
export function admitSend(
  recent: readonly number[],
  now: number,
): { readonly allowed: boolean; readonly recent: readonly number[] };

export function appendReaction(
  list: readonly Reaction[],
  next: Reaction,
): readonly Reaction[];

export function pruneReactions(
  list: readonly Reaction[],
  now: number,
): readonly Reaction[];
```

Table de `reactionGlyph` :

| Valeur sur le fil | Glyphe | Codepoints |
|---|---|---|
| `thumbs-up` | 👍 | U+1F44D |
| `thumbs-down` | 👎 | U+1F44E |
| `clapping-hands` | 👏 | U+1F44F |
| `red-heart` | ❤️ | U+2764 U+FE0F |
| `face-with-tears-of-joy` | 😂 | U+1F602 |
| `face-with-open-mouth` | 😮 | U+1F62E |
| `party-popper` | 🎉 | U+1F389 |
| `folded-hands` | 🙏 | U+1F64F |

### 6.5 `src/call/reactionStore.ts` — **branché**

```ts
import type { Room } from 'livekit-client';
import type { Reaction, ReactionKey } from 'src/call/reactions';

export type ReactionStore = {
  // Contrat de `useSyncExternalStore` : `getSnapshot()` rend la MÊME valeur
  // tant que rien n'a bougé, sinon le rendu boucle. Même patron que
  // `createRoomViewStore` (`src/call/participants.ts:73-76`).
  readonly subscribe: (onChange: () => void) => () => void;
  readonly getSnapshot: () => readonly Reaction[];
  // Ne rejette jamais — même contrat que `CallSession.connect`
  // (`src/call/connection.ts:173-175`). `false` = la limite de débit a refusé,
  // ou la publication a échoué. L'écho local n'est posé qu'en cas de `true`.
  readonly send: (key: ReactionKey) => Promise<boolean>;
  readonly dispose: () => void;
};

export function createReactionStore(room: Room): ReactionStore;
```

Ce que le store fait, et rien d'autre :

- s'abonne à `RoomEvent.DataReceived`. Signature à cinq arguments, tous facultatifs après le
  premier : `(payload: Uint8Array, participant?: RemoteParticipant, kind?: DataPacket_Kind,
  topic?: string, encryptionType?: Encryption_Type) => void`
  (`node_modules/livekit-client/dist/src/room/Room.d.ts:312`, **[V]**) ;
- décode en `string`, passe à `parseReaction`, **ignore silencieusement tout le reste** — c'est
  obligatoire, le canal sans topic transporte `participantMuted`, `roleChanged`,
  `screenRecordingStarted` et une douzaine d'autres (§2.3) ;
- résout le nom par `room.getParticipantByIdentity(identity)?.name ?? ''`
  (`Room.d.ts:179`, **[V]**) ;
- fabrique l'`id` par un compteur monotone interne (`${identity}#${counter}`), pour que le
  module pur reste pur ;
- publie par `room.localParticipant.publishData(bytes, { reliable: true })`
  (`LocalParticipant.d.ts:152`, **[V]**), **sans `topic`**, comme meet (§2.1) ;
- lance une purge à intervalle **uniquement quand la liste n'est pas vide**, et l'arrête
  quand elle se vide.

`dispose()` détache le handler et arrête l'intervalle. Appelé depuis le même nettoyage
d'effet que `session.dispose()` (`call.tsx:212-220`).

### 6.6 `src/call/chat.ts` — **pur**

```ts
// `lk.chat` n'est PAS une constante de `livekit-client` : recherche exhaustive
// des littéraux `lk.*` dans 2.18.0, le seul est `lk.agent.pre-connect-audio-buffer`
// (§1.2). Il vient de `@livekit/components-core`, qui n'est pas une dépendance
// déclarée. On l'écrit donc en dur, ici, une seule fois.
export const CHAT_TOPIC = 'lk.chat';
export const CHAT_GROUPING_MS: number;   // 60_000, la valeur de meet (§1.6)
export const CHAT_MAX_LENGTH: number;    // 2_000, voir §5.C6

export type ChatMessage = {
  readonly id: string;              // `TextStreamInfo.id`, celui du SDK
  readonly identity: string;
  readonly name: string;
  readonly body: string;
  readonly sentAt: number;
  readonly editedAt: number | null;
  readonly isLocal: boolean;
};

// LA règle de correction. Un message de même `id` ET de même `identity`
// REMPLACE l'existant en conservant le `sentAt` d'origine et en posant
// `editedAt` ; sinon il est ajouté à la fin (§1.6). L'ignorer produit un
// doublon à l'écran, pas une donnée manquante.
//
// Même `id` mais identité DIFFÉRENTE : ajouté, jamais fusionné. Un participant
// ne réécrit pas le message d'un autre en rejouant son identifiant de stream.
export function appendMessage(
  log: readonly ChatMessage[],
  incoming: ChatMessage,
): readonly ChatMessage[];

// Compte les messages non locaux dont `sentAt > lastReadAt`. Les siens ne sont
// jamais non lus.
export function unreadCount(
  log: readonly ChatMessage[],
  lastReadAt: number,
): number;

// Vrai quand la ligne doit porter son en-tête (nom + heure) : premier message,
// ou émetteur différent, ou plus de CHAT_GROUPING_MS depuis le précédent.
export function startsGroup(log: readonly ChatMessage[], index: number): boolean;

// Coupe les blancs, tronque à CHAT_MAX_LENGTH, rend `null` si rien ne reste.
// Le composant n'envoie que sur un non-`null` : il n'a aucune règle à lui.
export function normaliseBody(input: string): string | null;
```

### 6.7 `src/call/chatStore.ts` — **branché**

```ts
import type { Room } from 'livekit-client';
import type { ChatMessage } from 'src/call/chat';

export type ChatSnapshot = {
  readonly log: readonly ChatMessage[];
  readonly unread: number;
};

export type ChatStore = {
  readonly subscribe: (onChange: () => void) => () => void;
  readonly getSnapshot: () => ChatSnapshot;
  // Ne rejette jamais. `false` = le message n'est pas parti ; l'appelant garde
  // alors le texte dans la zone de saisie.
  readonly send: (body: string) => Promise<boolean>;
  readonly markRead: () => void;
  readonly dispose: () => void;
};

export function createChatStore(room: Room): ChatStore;
```

Quatre points d'implémentation qui ne se devinent pas :

1. **L'enregistrement est rendu idempotent par construction.**
   `registerTextStreamHandler` **jette** si un handler existe déjà pour le topic
   (`DataStreamError`, raison `HandlerAlreadyRegistered` —
   `node_modules/livekit-client/src/room/data-stream/incoming/IncomingDataStreamManager.ts:30-37`,
   **[V]**), tandis que `unregisterTextStreamHandler` n'est qu'un `Map.delete` et ne jette
   jamais (`:40-42`, **[V]**). Le constructeur du store fait donc, dans cet ordre :

   ```ts
   room.unregisterTextStreamHandler(CHAT_TOPIC);
   room.registerTextStreamHandler(CHAT_TOPIC, handler);
   ```

   Deux lignes, pas de `try/catch`, et l'invariant « un seul enregistrement pour `lk.chat` »
   (§1.3) devient vrai **par construction** — y compris si React appelle deux fois
   l'initialiseur d'un `useState` en mode strict.

2. **Réception.** Le handler reçoit
   `(reader: TextStreamReader, participantInfo: { identity: string })` — `participantInfo` est
   **uniquement** une identité, pas un `Participant`
   (`StreamReader.ts:297-300`, **[V]**). Il lit `reader.info.id` et `reader.info.timestamp`
   (`BaseStreamInfo`, `dist/src/room/types.d.ts:94-106`, **[V]**), résout le nom par
   `room.getParticipantByIdentity(...)`, puis `await reader.readAll()` — **qui rend le texte
   complet** (§0.2).

3. **Émission.** `room.localParticipant.sendText(body, { topic: CHAT_TOPIC })`
   (`LocalParticipant.d.ts:177`, **[V]**) rend un `TextStreamInfo` dont `.id` et `.timestamp`
   **fabriquent l'écho local**. C'est la raison d'écho-après-résolution : sans elle, il
   faudrait inventer un identifiant, et un identifiant inventé casserait la règle d'édition de
   `appendMessage`. LiveKit ne renvoie pas à l'émetteur son propre paquet ; il n'y a donc aucun
   doublon à craindre.

4. **Aucun abonnement à `RoomEvent.ChatMessage`.** Ce n'est **pas** un signal réseau dans meet :
   le web le ré-émet localement pour ses propres toasts (§1.4, **[V]**). S'y abonner ne
   recevrait jamais rien.

### 6.8 Les coquilles

**`src/screens/room/interactionPanel.tsx`** — remplace la scène, comme `ParticipantsPanel`.
Reçoit son état, n'en calcule aucun.

```ts
export type InteractionPanelProps = {
  readonly onShare: () => void;
  // Main levée — sous-périmètre C1
  readonly handRaised: boolean;
  readonly handBusy: boolean;
  readonly hands: readonly RaisedHand[];
  readonly onToggleHand: () => void;
  // Réactions — sous-périmètre C2
  readonly onSendReaction: (key: ReactionKey) => void;
  // Chat — sous-périmètre C3
  readonly chat: ChatSnapshot;
  readonly onSendChat: (body: string) => void;
};
```

Chaque sous-périmètre n'ajoute que ses propres props ; aucun ne réécrit les précédentes.

**`src/screens/room/reactionOverlay.tsx`** — bulles transitoires, posées en
`position: 'absolute'` dans la `View` racine, donc visibles que la scène ou le panneau soit
affiché.

```ts
export type ReactionOverlayProps = { readonly reactions: readonly Reaction[] };
```

### 6.9 `src/screens/room/call.tsx` — câblage

L'écran gagne :

```ts
// Remplace `participantsOpen` (`call.tsx:162`) : trois états s'excluent, deux
// booléens en autoriseraient quatre dont un impossible.
const [panel, setPanel] = useState<'none' | 'participants' | 'more'>('none');
const [handBusy, setHandBusy] = useState(false);
```

et deux magasins déclarés **avec les autres appels de Hook, avant les sorties anticipées** —
`useState(() => createChatStore(session.getRoom()))` et son homologue réactions, plus leurs
`useSyncExternalStore`. Ils sont créés par `useState` et non `useMemo` pour la raison déjà
écrite ligne 116-118 du fichier : React se réserve le droit de jeter un `useMemo`, et un store
jeté laisse derrière lui un handler `lk.chat` enregistré sur une `Room` vivante.

`handleShare` (`call.tsx:306-318`) ne change pas — seul son point d'appel se déplace du bouton
de barre vers le panneau.

Le nouveau bouton, à la place exacte de `share-btn` :

```tsx
<IconButton
  testID="more-toggle"
  icon="dots-horizontal"
  iconColor={tokens.color.textDark}
  style={styles.barButton}
  onPress={() => setPanel((current) => (current === 'more' ? 'none' : 'more'))}
  accessibilityLabel={t('call.more')}
/>
```

`styles.barButton` est celui du périmètre A : `{ margin: 0, width: 44, height: 44, borderRadius: 22 }`,
avec son `hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}`. Le `margin: 0` neutralise bien
le `margin: 6` de Paper, parce que la prop `style` **clôt** le tableau de styles
(`IconButton.tsx:171-184`, **[V]**), et `borderRadius` est relu depuis le style aplati
(`:158-161`, **[V]**) donc l'ondulation reste ronde.

Le `Badge` est posé **à côté** du bouton dans un conteneur `position: 'relative'`, jamais
comme enfant de l'`IconButton` — qui ne rend que son icône.

La `Snackbar` existante (`call.tsx:505-511`) est réutilisée telle quelle : seul le type
`MessageKey` (`call.tsx:38`) s'élargit.

> **Point de contact avec le périmètre D**, à signaler à la fusion : D renomme
> `moderationError` en `actionError` et le `testID` `moderation-error` en `action-error`
> (D §4.6.2, neuf assertions dans `call.spec.tsx`). **Ce renommage est celui de D.** Si D
> fusionne d'abord, C adopte les nouveaux noms ; sinon C garde les anciens et D fait le
> renommage. C n'y touche pas.

**Churn de tests dans `call.spec.tsx`, chiffré** : les quatre assertions sur `share-btn`
(lignes 398-399 et 413-414) demandent désormais un
`await fireEvent.press(screen.getByTestId('more-toggle'))` préalable. Rien d'autre du fichier
n'est touché par C.

### 6.10 Les couleurs, posées et mesurées

`call.tsx:87` force `backgroundDark` (`#0B0B0C`) dans les deux schémas, alors que le thème
Paper suit le schéma système (`src/ui/theme.ts:11-19`). Le périmètre B a livré deux composants
sans couleur explicite : **1,08:1**, du noir sur du noir. La règle d'`AGENTS.md` (version du
périmètre A) est **on surcharge les deux, ou aucun des deux**.

| Élément | Couleur posée | Sur | Rapport calculé |
|---|---|---|---|
| `iconColor` des boutons de barre | `tokens.color.textDark` | `backgroundDark` | 16,65:1 (mesure de A) |
| titre et corps du panneau | `tokens.color.textDark` | `backgroundDark` | 16,65:1 |
| nom d'émetteur, ligne « pas d'historique » | `tokens.color.textDark`, `variant="labelSmall"` | `backgroundDark` | 16,65:1 — secondaire par la **taille**, jamais par un gris. `tokens.color.muted` (`#6B7280`) échouerait |
| actions en `mode="text"` | `tokens.color.primaryDark` (`#4D9AFF`) | `backgroundDark` | **6,9:1** — `primaryLight` (`#0057B8`) tomberait à 2,86:1, comme B l'a déjà mesuré (`participantsPanel.tsx:61-64`) |
| bulle de réaction | fond `tokens.color.surfaceDark`, texte `tokens.color.textDark` | — | 15,86:1 (mesure de A) |
| `TextInput` du chat | `textColor` + `placeholderTextColor` + `outlineColor` + `activeOutlineColor`, tous depuis les tokens | `backgroundDark` | les quatre props existent (`react-native-paper/src/components/TextInput/types.tsx:55`, `lib/typescript/components/TextInput/TextInput.d.ts:49-75`, **[V]**) |
| `Badge` | **aucune couleur posée** | — | Paper l'appaire lui-même : `theme.colors.error` + `theme.colors.onError` (`Badge.tsx:89-97`, **[V]**). Schéma clair : `#C62828` + blanc = **5,62:1**. Schéma sombre : `#FF8A80` + `rgb(96,20,16)` = **5,73:1**. Les deux passent. **Forcer l'un des deux les casserait** : c'est exactement le piège de A |

**Et aucun bouton de ce périmètre n'est `disabled`**, nulle part. Voir §5.C17. Une commande
indisponible n'est **pas rendue** — c'est le précédent de `participantsPanel.tsx:55` et de D.

Tous ces styles viennent d'un `StyleSheet.create` alimenté par `src/ui/tokens`. Aucun style en
ligne, comme l'exige `AGENTS.md`.

### 6.11 Les clés i18n, en entier

Sept locales (`en fr es it de vi ru`), toutes remplies. `src/i18n/index.spec.ts` échoue si une
clé manque quelque part — mais **il passe aussi sur une clé présente partout et remplie
d'anglais recopié**, ce qui reste un défaut ; les sept sont traduites, pas dupliquées.

**Sous-périmètre C1 — 6 clés**

| Clé | Rôle | Valeur `en` |
|---|---|---|
| `call.more` | libellé d'accessibilité du bouton de barre, titre du panneau | More |
| `call.raiseHand` | bouton, main baissée | Raise hand |
| `call.lowerHand` | bouton, main levée | Lower hand |
| `call.handRaised` | bandeau permanent | Your hand is raised |
| `call.handFailed` | `Snackbar` | Could not change your hand |
| `call.handQueue` | titre de la file | Hands raised |

**Sous-périmètre C2 — 11 clés**

| Clé | Rôle | Valeur `en` |
|---|---|---|
| `call.reactions` | titre de section | Reactions |
| `call.you` | émetteur d'une bulle locale | You |
| `call.reactionFailed` | `Snackbar` | Reaction not sent |
| `reaction.thumbsUp` … `reaction.please` | 8 libellés d'accessibilité | Thumbs up, Thumbs down, Clap, Heart, Laughing, Surprised, Celebration, Please |

**Sous-périmètre C3 — 6 clés**

| Clé | Rôle | Valeur `en` |
|---|---|---|
| `chat.title` | titre de section | Chat |
| `chat.placeholder` | zone de saisie | Write a message |
| `chat.send` | libellé d'accessibilité | Send |
| `chat.empty` | fil vide | No messages yet |
| `chat.sendFailed` | `Snackbar` | Message not sent |
| `chat.notKept` | ligne fixe en tête du fil (§5.C1) | Messages are not kept. Nobody sees this thread after the meeting, and anyone joining later will not see what came before. |

`call.unnamedParticipant` (déjà présent, `en.json:39`) sert de repli quand le nom d'un
émetteur est vide. Aucune clé n'est retirée par ce périmètre.

---

## 7. Flux

### 7.1 Lever la main

```
appui sur « Lever la main »
  └─ handBusy déjà vrai ?  → on ne fait rien (garde par valeur, pas par `disabled`)
  └─ setHandBusy(true) ; le bouton passe en `loading`
  └─ toggleHand(serverUrl, access.room.id ?? access.room.slug, access.token, true)
       ├─ result.ok       → setHandBusy(false).  RIEN D'AUTRE.
       └─ !result.ok      → setHandBusy(false) ; Snackbar `call.handFailed`
  … indépendamment, plus tard :
  backend meet → API serveur LiveKit → RoomEvent.ParticipantAttributesChanged
    └─ createRoomViewStore.invalidate()
       └─ useSyncExternalStore → nouvelle RoomView
          └─ roomView.local.handRaisedAt !== null
             └─ le bouton devient « Baisser la main », le bandeau apparaît
```

**Le succès HTTP ne change rien à l'écran.** C'est l'attribut qui décide, et lui seul (§2.4).
`result.ok` se lit **explicitement** : `ApiResult` rend son échec ordinaire comme une **valeur**
`{ ok: false }`, jamais comme un rejet — un `.catch()` seul ne verrait jamais passer un 403.
C'est le bogue exact que le périmètre B a livré deux fois (`call.tsx:361-368`). Le `.catch()`
séparé reste, pour l'exception inattendue de `fetch`.

**Défaut connu, nommé** : entre le `200` et l'arrivée de l'attribut — deux sauts réseau — le
bouton a cessé de tourner et affiche encore l'ancien état. La fenêtre est de l'ordre d'une
poussée LiveKit. La refermer demanderait un « état désiré en attente », c'est-à-dire une
seconde source de vérité pour la durée d'un battement de cil. Accepté.

### 7.2 Baisser la main depuis le bandeau

Identique, `raised: false`, déclenché depuis le bouton du bandeau — un appui, sans ouvrir le
panneau. `handBusy` est partagé : les deux commandes portent sur le même état, et deux requêtes
concurrentes en sens opposé produiraient un résultat qui dépend de l'ordre d'arrivée côté
serveur.

### 7.3 Recevoir la main de quelqu'un d'autre

Aucun code dédié. `RoomEvent.ParticipantAttributesChanged` invalide le store de vue,
`readRoomView` relit **tous** les participants, `raisedHands()` retrie. Le fait que
`changedAttributes` ne contienne **que les clés modifiées** et non la carte complète (§3.3,
**[V]**) n'a aucune conséquence ici : nous ne lisons jamais l'argument de l'événement, seulement
`participant.attributes` sur la `Room`.

### 7.4 Arriver en cours de séance

- **Mains levées** : visibles **immédiatement**. Le premier `getSnapshot()` lit
  `participant.attributes` sur les participants déjà présents. Aucun rejeu n'est nécessaire
  (§3.3, **[V]**).
- **Chat** : **rien**. Le fil commence vide. La ligne fixe `chat.notKept` est déjà là et le
  dit — c'est tout l'objet de §5.C1.
- **Réactions** : rien à voir, elles sont éphémères par construction.

### 7.5 Envoyer une réaction

```
appui sur un emoji
  └─ admitSend(recent, Date.now())
       ├─ !allowed  → rien. Aucune bulle. Aucun message. (§5.C11)
       └─ allowed   → publishData(encodeReaction(key), { reliable: true })
            ├─ résolu  → appendReaction(local, { isLocal: true, … })  ← l'écho, ICI
            └─ rejeté  → aucune bulle ; l'appelant décide (§8)
```

### 7.6 Recevoir une réaction

```
RoomEvent.DataReceived (payload, participant, kind, topic, encryptionType)
  └─ TextDecoder → parseReaction(json)
       ├─ null           → ignoré. Silencieusement. C'est OBLIGATOIRE : le canal
       │                   sans topic porte une douzaine d'autres types (§2.3)
       └─ ReactionKey    → nom résolu par getParticipantByIdentity, appendReaction
```

Purge : un intervalle appelle `pruneReactions(list, Date.now())` tant que la liste n'est pas
vide, et s'arrête quand elle se vide.

### 7.7 Envoyer un message

```
appui sur « Envoyer »
  └─ normaliseBody(saisie)
       ├─ null   → rien (zone vide ou blancs seuls)
       └─ body   → sendText(body, { topic: 'lk.chat' })
            ├─ résolu  → info.id + info.timestamp → appendMessage(écho local)
            │            la zone de saisie est vidée
            └─ rejeté  → Snackbar `chat.sendFailed`
                         LA ZONE DE SAISIE N'EST PAS VIDÉE
```

Ne pas vider la zone sur échec est la moitié du traitement d'erreur : un message perdu qu'on
doit retaper est une deuxième punition pour une panne de réseau.

### 7.8 Recevoir un message, et une édition

```
handler lk.chat (reader, { identity })
  └─ id = reader.info.id ; sentAt = reader.info.timestamp
  └─ name = room.getParticipantByIdentity(identity)?.name ?? ''
  └─ await reader.readAll()               ← le texte COMPLET (§0.2)
       ├─ résolu  → appendMessage(log, { id, identity, name, body, sentAt, … })
       │             ├─ id + identity déjà présents → REMPLACE, garde sentAt,
       │             │                                pose editedAt
       │             └─ sinon                       → ajoute à la fin
       └─ rejeté  → console.error, message abandonné (§8)
```

### 7.9 Reconnexion

| | Ce qui se passe |
|---|---|
| **Main levée** | Rien à faire. L'attribut est côté serveur, `RoomEvent.Reconnected` est **déjà** dans `ROOM_VIEW_EVENTS` (`src/call/participants.ts:30`), la vue est relue. L'état revient de lui-même. |
| **Chat** | Le handler survit (§2.2, **[V]**). Le store survit — il n'est pas démonté. **Le fil reste à l'écran.** Ce que les autres ont écrit pendant la coupure est **définitivement perdu** (§4) et rien ne le signale (§5.C2). |
| **Réactions** | Le handler survit. Ce qui a été émis pendant la coupure est perdu, sans conséquence : la durée de vie est de 3 s. |

Une reconnexion automatique (`Reconnecting` → `Reconnected`) **n'émet pas** `Disconnected`
(§4, **[V]**), donc rien n'est démonté. Et un vrai `Disconnected` **termine l'écran de séance**
(`call.tsx:390-406`) : il n'y a pas de cas « le fil a disparu mais je suis toujours en
réunion ».

### 7.10 Raccrochage

`session.dispose()` (`call.tsx:216-219`) est appelé dans le nettoyage de l'effet. Les deux
`dispose()` des stores y sont ajoutés, **avant** celui de la session — les nettoyages
s'exécutent dans l'ordre de déclaration des effets, et détacher les handlers avant de jeter la
`Room` est la même précaution que le désabonnement de `setCallState`.

---

## 8. Gestion d'erreur — ce que voit l'utilisateur

Une seule `Snackbar`, celle qui existe déjà (`call.tsx:505-511`). Un échec silencieux est un
défaut ; un échec qui produit un message inexact en est un autre.

| Ce qui échoue | Ce que voit l'utilisateur | Ce qui reste vrai |
|---|---|---|
| `toggleHand` — réseau, 5xx, 403, 404 | `Snackbar` « Could not change your hand » | Le bouton n'a jamais bougé : il affiche l'attribut, qui n'a pas changé. Rien à annuler. |
| `toggleHand` — `401` | **Le même message.** Pas « session expirée ». | La session OIDC est valide ; c'est le jeton de salle qui ne l'est pas (§3.1). |
| `publishData` d'une réaction — rejeté | **Aucune bulle n'apparaît.** Et si l'appel n'est **pas** en `reconnecting`, `Snackbar` « Reaction not sent ». | La condition est portée par l'écran, qui connaît `callState` ; le store rend un `boolean` et ne décide rien. Pendant une reconnexion, le bandeau explique déjà. |
| Réaction refusée par la limite de débit | **Aucune bulle, aucun message.** | C'est le retour : l'écho local marque exactement les appuis qui comptent (§5.C11). |
| `sendText` — rejeté | `Snackbar` « Message not sent », **et le texte reste dans la zone de saisie**. | Rien n'est perdu. Un second appui réessaie. |
| `readAll()` d'un message entrant — rejeté | **Rien.** `console.error` seulement. | Ce n'est l'action de personne : c'est le message d'un tiers, malformé ou tronqué. Une `Snackbar` pour un incident que l'utilisateur ne peut ni causer ni corriger est du bruit. Le défaut est journalisé, pas caché. |
| Un paquet de données inconnu sur le canal sans topic | **Rien.** | C'est le fonctionnement normal : le canal porte une douzaine de types que ce périmètre ne traite pas (§2.3). |

**Ce qui n'existe pas, délibérément** : aucun réessai automatique nulle part. Ni sur
`toggleHand` (un rejeu masquerait un jeton invalide derrière une latence), ni sur les canaux de
données (le SDK gère déjà la retransmission à l'intérieur d'un canal vivant, et rejouer
au-dessus dupliquerait).

---

## 9. Ce qui est testable, et ce qu'un test ne peut pas prouver ici

### 9.1 Testable, et comment

**`src/call/hands.spec.ts`** — sans SDK, sans rendu. Le cœur du sous-périmètre C1.
Chaîne vide = baissée. Clé absente = baissée. `undefined` en entrée = baissée. Tri croissant.
Départage par `identity.localeCompare` à horodatage égal. `Date.parse` → `NaN` ignoré.
Position 1-based. Participant local inclus dans la file. File vide.

**`src/call/reactions.spec.ts`** — les huit valeurs acceptées et **le rejet de tout le reste** :
un `type` autre que `reactionReceived`, un emoji hors liste, un JSON invalide, une chaîne vide,
un objet sans `data`. La fenêtre de débit à ses bornes exactes : le dixième appel dans les
1 000 ms passe, le onzième non, le onzième à 1 001 ms passe. `pruneReactions` à exactement
3 000 ms. Le plafond de six.

**`src/call/chat.spec.ts`** — la règle d'édition dans ses trois cas : même `id` + même
`identity` → remplace, `sentAt` conservé, `editedAt` posé ; même `id` + identité **différente**
→ ajoute ; `id` différent → ajoute. `unreadCount` ignore les messages locaux. `startsGroup` à
exactement 60 000 ms. `normaliseBody` sur blancs seuls, sur 2 001 caractères, sur une chaîne
vide.

**`src/api/hand.spec.ts`** — contre un `global.fetch` bouchonné, patron établi du dépôt et
couvert par l'exemption `as unknown as` des fichiers `*.spec.*` (`AGENTS.md`). Ce fichier
existe pour prouver quatre choses, et ce sont exactement les quatre pièges de §3.1 :
1. l'en-tête `authorization` porte le **jeton LiveKit** passé en argument, pas autre chose ;
2. **`forceRefresh` n'est jamais appelé** — assertion sur un espion, pas sur un statut ;
3. un `401` ne rend **pas** `{ kind: 'unauthorized' }` ;
4. le corps est exactement `{"raised":true}` / `{"raised":false}`, et le chemin se termine
   par `/toggle-hand/`.

**`src/call/chatStore.spec.ts` et `src/call/reactionStore.spec.ts`** — contre une fausse
`Room` écrite à la main. `__mocks__/@livekit/react-native.ts` ne stubbe **pas** `Room` (§6.4) :
c'est précisément pour cela que les deux `create*Store` **reçoivent** la `Room` en paramètre au
lieu d'aller la chercher. On y prouve : que `unregisterTextStreamHandler` est appelé **avant**
`registerTextStreamHandler` ; que deux constructions successives ne jettent pas ; que
`getSnapshot()` rend la même référence tant que rien ne bouge ; que `dispose()` détache
exactement ce qui a été attaché ; qu'un paquet inconnu ne produit aucune notification.

**`src/screens/room/interactionPanel.spec.tsx` et le câblage dans `call.spec.tsx`** — quelle
action part avec quel argument, et rien de plus. Que `more-toggle` bascule le panneau. Que
`share-btn` s'y trouve désormais. Que le bandeau apparaît quand
`roomView.local.handRaisedAt !== null` et pas avant. Que l'échec de `toggleHand` produit la
`Snackbar` **et** que le succès l'efface — le test que le périmètre B avait dû ajouter après
coup.

**Le piège de fixtures, déjà payé par B et à ne pas repayer** : un test qui passe parce que ses
données ne discriminent pas. Dans ce périmètre, les valeurs à garder visiblement distinctes
sont l'**identité LiveKit**, l'**UUID de salon**, l'**identifiant de stream** (`TextStreamInfo.id`)
et l'**horodatage `handRaisedAt`**. Quatre chaînes, jamais interchangeables, jamais égales dans
une fixture.

### 9.2 Ce qu'un test ne peut pas prouver ici

- **Les couleurs.** RNTL ne rend pas les couleurs. Le piège de contraste — 1,08:1, noir sur
  noir — est **structurellement** hors de portée de la suite. Il ne se voit qu'en lisant le
  thème, le fond et le composant ensemble. Les mesures de §6.10 sont calculées depuis les
  valeurs de tokens, pas relevées à l'écran.
- **La largeur de la barre.** RNTL ne fait pas de mise en page. Les 357 dp de §4.1 sont de
  l'arithmétique sur des constantes, pas un rendu mesuré. **À vérifier sur un appareil de
  360 dp**, et c'est la première chose à faire après A.
- **Que quoi que ce soit soit arrivé à quelqu'un d'autre.** Chaque test de ce périmètre tient
  un seul bout du fil. Qu'un `publishData` soit relayé, qu'un `sendText` soit lu, qu'un
  attribut soit diffusé : **deux appareils sont la seule preuve**. Et le simulateur iOS ne
  publie ni caméra ni micro (`AGENTS.md`) — donc au moins un des deux est un appareil réel.
- **Que `readAll()` reconstitue un message multi-chunk.** §0.2 est une lecture
  d'implémentation, pas une exécution. `CHAT_MAX_LENGTH` nous garde de ce chemin ; il n'en
  reste pas moins non éprouvé, et un message de plus de 15 000 octets **reçu** d'un client web
  l'emprunterait.
- **Que `UpdateParticipantRequest` fusionne les attributs plutôt que de les remplacer** (§0.4).
  Si elle remplaçait, lever la main effacerait `color`, `room_role` et `is_authenticated` —
  que cette application ne lit pas, mais que le client web lit. Le risque est **hérité de
  meet**, pas introduit par nous : `toggle-hand` est son chemin nominal.
- **La cadence de 10/s en usage réel.** Elle est reprise du web sans mesure sur un écran
  tactile, où l'appui répété est plus facile qu'à la souris.

### 9.3 Les trois mesures à faire sur appareil, nommées

1. **La barre à 360 dp**, après fusion de A et de C. Sept cibles, aucune coupée, aucune
   jointive.
2. **La latence d'un aller-retour `toggle-hand`** : de l'appui à l'apparition du bandeau. C'est
   elle qui dit si le défaut nommé en §7.1 est imperceptible ou gênant.
3. **Un message de chat entre un mobile et un client web**, dans les deux sens, et une
   **édition** depuis le web — c'est le seul moyen de prouver la règle de `appendMessage`
   contre un émetteur réel.

---

## 10. Ce que ce périmètre ne fait pas

Écrit, donc opposable. Une limite tue n'est pas un livrable.

- **Aucun historique de chat, nulle part.** Ni serveur, ni local, ni MMKV. Le fil naît avec la
  séance et meurt avec elle. C'est dit à l'écran (§5.C1).
- **Aucun marqueur de trou après une reconnexion** (§5.C2). Les messages émis pendant la
  coupure sont perdus sans qu'on le signale.
- **Aucune pièce jointe, ni envoi ni réception.** Impossibilité de plateforme, pas choix de
  périmètre (§5.C4).
- **Aucune émission d'édition ni de suppression de message.** Les éditions reçues sont
  traitées ; les nôtres n'existent pas (§5.C5).
- **Aucune écriture sur `lk-chat-topic`** (§5.C3).
- **Aucun abonnement à `RoomEvent.ChatMessage`** : ce n'est pas un signal réseau dans meet
  (§1.4, **[V]**).
- **Aucun appel à `setAttributes()`** : le jeton émis par meet porte
  `can_update_own_metadata=False` (§3.4, **[V]**). Le chemin du bundle déployé ne peut pas
  fonctionner ; ne pas l'essayer.
- **Aucun moyen de baisser la main d'un autre** (§5.C15).
- **Aucune position de file dans le panneau de participants du périmètre B** (§5.C16). Le
  panneau de B n'est pas touché par ce périmètre — pas une ligne.
- **Aucune notification hors premier plan**, pour aucune des trois fonctions. Il faudrait du
  push et un backend meet qui sache en émettre ; aucun endpoint d'abonnement n'existe. Même
  conclusion que B.
- **Aucun son**, ni sur message reçu ni sur main levée (§5.C7).
- **Aucune vocalisation des réactions pour lecteur d'écran, ni réglage** (§5.C13).
- **Aucun indicateur de frappe, accusé de lecture, fil de réponses, mention ni recherche.**
- **Aucune animation flottante de réaction** (§5.C12).
- **Aucun sous-titre, aucune transcription** (§5.C20).
- **Aucune persistance de l'état non-lu** au-delà de la vie du store.
- **Aucune tolérance à un serveur LiveKit < 1.8.2** : sur un tel serveur, les messages émis
  depuis le mobile ne seraient pas vus des clients web anciens. C'est la conséquence assumée
  de §5.C3.

---

## 11. Le périmètre est trop gros pour un seul plan. Découpage en trois.

Trois fonctions, deux transports, deux modules purs, deux magasins branchés, un module d'API
qui contourne le client existant, un remaniement de barre et vingt-trois clés dans sept
locales. **C'est deux fois le périmètre B.** Un seul plan d'implémentation le rendrait
irrelisible et impossible à interrompre proprement.

Découpage retenu — **chacun livre un logiciel qui marche et se fusionne seul** :

### C1 — Le socle d'interaction et la main levée

*Livre* : le remaniement de barre (`share-btn` → panneau, `more-toggle` à sa place) ;
`InteractionPanel` avec Partager le lien, le bouton Lever/Baisser et la file des mains ; le
bandeau de main levée ; `src/api/hand.ts` (obstacle b) ; `ParticipantAttributesChanged` +
`handRaisedAt` (obstacle c) ; `src/call/hands.ts` ; 6 clés × 7 locales.

*Logiciel qui marche* : demander la parole fonctionne de bout en bout, tout le monde le voit,
l'ordre est juste, un arrivant tardif voit l'état, une reconnexion ne perd rien.

*Pourquoi en premier* : c'est lui qui paie les deux obstacles et la place dans la barre. Et
c'est **la seule des trois fonctions dont l'état est reconstructible** — donc celle qui est
honnête sans réserve.

*Dépendance dure* : **le périmètre A doit être fusionné avant** (§4.5).

### C2 — Les réactions

*Livre* : `src/call/reactions.ts`, `src/call/reactionStore.ts`, la rangée d'emoji dans le
panneau, `reactionOverlay.tsx` ; 11 clés × 7 locales.

*Logiciel qui marche* : réagir et voir réagir. Aucun couplage à C3.

*Pourquoi ici* : petit, autonome, et il introduit le canal `DataReceived` dont C3 n'a **pas**
besoin — ce qui prouve, s'il en était besoin, que les deux ne sont pas le même transport.

### C3 — Le chat

*Livre* : `src/call/chat.ts`, `src/call/chatStore.ts`, le corps de chat dans le panneau, le
`Badge` de non-lus, la ligne `chat.notKept` ; 6 clés × 7 locales.

*Logiciel qui marche* : écrire et lire, pendant la séance.

*Pourquoi en dernier* : c'est le plus gros — zone de saisie, clavier, liste, regroupement,
non-lus, règle d'édition — et c'est celui dont la valeur est la plus entamée par l'absence
d'historique. **Si la nuit est courte, c'est celui-ci qu'on coupe.** C1 et C2 livrés sans lui
forment un tout cohérent ; C3 livré sans C1 n'aurait même pas de panneau où vivre.

### Ce qui reste ouvert, et ce qui le trancherait

1. **Faut-il livrer C3 du tout, avec zéro historique ?** Le périmètre D a refusé les
   sous-titres pour un cas voisin — action irréversible, sans retour visible, sur un transport
   inféré. Le chat n'est **pas** ce cas : rien n'est irréversible, le retour est visible
   (l'écho local), le transport est vérifié. Le seul reproche possible est l'absence
   d'historique, et §5.C1 y répond par une ligne à l'écran plutôt que par un silence. **Ma
   position est donc : oui, livrable honnêtement.** Ce qui la renverserait : une décision
   produit selon laquelle un chat sans historique nuit plus qu'il ne sert sur mobile — où
   verrouiller l'écran est banal. **Cette décision-là appartient au partenaire.**
2. **La matrice de versions LiveKit des instances cibles** (§5.C3). Lisible au runtime par
   `room.serverInfo?.version` ; non mesurée ici.
3. **La place du contrôle d'enregistrement du périmètre D** (§4.5). Arithmétiquement forcée
   dans le panneau ; à confirmer avec D à la fusion.
