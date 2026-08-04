# Mode invité — rejoindre une réunion sans compte

**Date** : 2026-08-04
**Décisions produit** : Michel-Marie, 2026-08-04

Une personne qui reçoit un lien de réunion doit pouvoir entrer depuis le mobile
**sans créer de compte** : en saisissant le code, ou en collant l'URL qu'on lui a
transmise. Le panneau de saisie est celui qui existe déjà en mode authentifié.

---

## Ce qui a été mesuré, et qui rend ce lot petit

Toutes les mesures ci-dessous ont été prises le **2026-08-04** contre
`https://meet.linagora.com`, **sans aucun en-tête d'autorisation**. Elles sont
reproductibles telles quelles.

### Le backend accepte déjà l'invité. Aucun changement serveur.

```sh
curl -s "https://meet.linagora.com/api/v1.0/rooms/test-mobile/?username=Camille%20Dupont"
```

→ **200**, avec un bloc `livekit` complet. Le jeton décodé :

```json
{
  "name": "Camille Dupont",
  "video": {
    "roomAdmin": false,
    "roomJoin": true,
    "canPublish": true,
    "canSubscribe": true,
    "canPublishData": true,
    "canPublishSources": ["camera", "microphone", "screen_share", "screen_share_audio"]
  },
  "attributes": { "room_admin": "false" },
  "nbf": 1785840865, "exp": 1785862465
}
```

Trois faits à retenir de ce corps :

- **`?username=` est lu par le serveur** et devient le `name` du jeton. Sans lui,
  le jeton porte `"name": "Anonymous"` — mesuré aussi. C'est donc ce paramètre,
  et rien d'autre, qui porte le nom d'un invité.
- **`roomAdmin: false`**, et le corps de la réponse porte `"is_administrable": false`.
- Le jeton vit **6 h** (`exp - nbf = 21600 s`), très au-delà d'une réunion.

### Le reste de la surface anonyme

| requête anonyme | réponse |
| --- | --- |
| `GET /api/v1.0/rooms/<slug inexistant>/` | **404** `{"detail":"No Room matches the given query."}` |
| `POST /api/v1.0/rooms/<slug>/request-entry/` `{"username":"Camille"}` | **200** `{"status":"accepted", …}` + jeton |
| `POST /api/v1.0/rooms/` (création) | **401** `Authentication credentials were not provided.` |
| `GET /api/v1.0/users/me/` | **401** |
| `GET /api/v1.0/rooms/` (liste) | **200** `{"count":0,…}` |

Le **404** — et non un 401 — sur un salon inexistant est le signal qui a tout
décidé : la requête anonyme franchit l'authentification et va jusqu'à la
recherche en base. Un invité ne peut simplement **rien créer**.

### Ce qu'un invité perd, et pourquoi ça ne coûte rien à implémenter

`/api/v1.0/config/` rend `screen_recording_permission: "authenticated"` et
`transcript_permission: "authenticated"`.

| l'invité garde | par quel chemin |
| --- | --- |
| caméra, micro, sortie audio | jeton de salle |
| chat, réactions, main levée | `src/call/chat.ts`, `reactions.ts`, `hands.ts`, `src/api/hand.ts` — **aucun n'accepte d'`Account`** |
| réception du partage, grille, épinglage | LiveKit |

| l'invité perd | ce qui le masque **déjà** |
| --- | --- |
| modération | `call.tsx:547` — `canModerate = access !== null && access.isAdministrable && roomId !== null`, et le serveur rend `is_administrable: false` |
| enregistrement | `screen_recording_permission: "authenticated"` |
| admission des arrivants | `useWaitingParticipants(…, canModerate && hasLobby)` — `call.tsx:569` |

**Conséquence directe : le repli `NO_ACCOUNT` de `call.tsx:140` reste inerte pour
un invité.** Son commentaire actuel justifie son innocuité par le fait que
`access` reste `null` sans compte — ce qui cesse d'être vrai pour un invité, qui
obtient bien un `access`. Mais la garde réelle du Hook est `canModerate`, et
`isAdministrable` vaut `false`. **Le commentaire doit donc être corrigé en même
temps que ce lot**, sans quoi il devient faux le jour de la livraison : la raison
qu'il donne ne tient plus, alors que sa conclusion tient toujours.

---

## Décisions produit

| # | question | décision |
| --- | --- | --- |
| 1 | serveur pour un code nu | `meet.linagora.com` par défaut, **plus une échappatoire « Changer »** dans la feuille. Un lien collé garde toujours SON hôte |
| 2 | où l'invité se nomme | dans le **pré-join**, l'encart « VOTRE NOM » devenant éditable. Mémorisé pour la fois suivante |
| 3 | entrée sur l'accueil | **détachée sous un filet**, libellée « Rejoindre sans compte ». La hiérarchie S'inscrire / Se connecter est préservée |
| 4 | lien collé d'un hôte inconnu | **accepté, l'hôte étant affiché**. L'allowlist des liens profonds reste stricte |

Décision 5, prise en fin de cadrage : l'entrée invité est **sur l'accueil
uniquement**, pas sur `/server`.

Le raisonnement derrière la décision 4 est le seul qui mérite d'être écrit :
**coller est un geste délibéré, un lien profond ne l'est pas.** Un lien profond
arrive sans qu'on l'ait demandé — d'où `parseMeetingLink` et son allowlist, qui
empêchent un SMS hostile de faire ouvrir un salon étranger. Un appui sur
« Coller » est une intention, et l'hôte est montré avant que quoi que ce soit ne
parte. Les deux chemins n'ont donc pas la même posture, et **ils ne partagent pas
la même fonction**.

---

## Architecture

Toute la chaîne `prejoin → lobby → call` passe aujourd'hui par
`authedFetch(account, …)`. Plutôt que de dupliquer chaque fonction en variante
anonyme, on introduit un type qui dit **qui frappe à la porte**, et le
branchement se fait **une seule fois**, dans la couche API.

```ts
// src/auth/visitor.ts
export type Visitor =
  | { readonly kind: 'account'; readonly account: Account }
  | { readonly kind: 'guest'; readonly serverUrl: string; readonly displayName: string };

// Le compte D'ABORD : quelqu'un de connecté n'est jamais un invité, même si une
// session invité traîne encore en mémoire.
export function getVisitor(): Visitor | null;
export function visitorServerUrl(visitor: Visitor): string;
export function visitorName(visitor: Visitor): string;
```

### Nouveaux fichiers — 3

| fichier | rôle |
| --- | --- |
| `src/auth/visitor.ts` | l'union ci-dessus et ses trois accesseurs |
| `src/auth/guest.ts` | la session invité, adossée à MMKV comme `accounts.ts` |
| `src/api/anon.ts` | `anonFetch<T>(serverUrl, path, init)` |

`anonFetch` n'a **ni porteur, ni rafraîchissement, ni rejeu de 401** : il n'y a
aucun jeton à rafraîchir, et rejouer à l'identique ne ferait que doubler la
requête. Il réutilise le `readResponse` de `src/api/client.ts`, qui doit donc y
être exporté — même mappage de statut, même distinction entre un 400 de
validation et le reste. Deux lectures de réponse divergentes seraient une de
trop.

### Fichiers modifiés — 10, plus les 7 locales

| fichier | changement |
| --- | --- |
| `src/api/client.ts` | exporte `readResponse` |
| `src/api/rooms.ts` | `fetchRoomAccess` et `requestEntry` prennent un `Visitor`, et branchent sur `kind`. Le nom d'invité part en `?username=` |
| `src/navigation/deepLinks.ts` | **ajoute** `parsePastedMeeting` ; `parseMeetingLink` n'est pas touchée |
| `src/screens/joinSheet.tsx` | rangée de serveur, collage réécrit, `onJoinRoom` remonte `{ slug, host }` |
| `src/screens/home.tsx` | passe `host` (celui du compte) et **pas** `onHostChange` |
| `src/screens/welcome.tsx` | filet, bouton, feuille |
| `src/screens/room/prejoin.tsx` | `getVisitor()` ; le nom devient éditable pour un invité |
| `src/screens/room/lobby.tsx` | `getVisitor()` |
| `src/screens/room/call.tsx` | `getVisitor()` en 4 endroits ; `handleShare` prend `visitorServerUrl()` ; sortie vers `/welcome` pour un invité ; **commentaire de `NO_ACCOUNT` corrigé** |
| `app/_layout.tsx` | un lien profond sans compte ouvre le pré-join invité |

### Ce que la session invité persiste, et ce qu'elle ne persiste pas

MMKV garde `{ serverUrl, displayName }`. Android peut tuer le processus pendant
une séance et restaurer l'activité : une session en mémoire seule laisserait
l'écran d'appel sans serveur à interroger.

**Mais `app/index.tsx` ne change pas.** Il ne consulte que `getActiveAccount()`,
donc un démarrage à froid ramène toujours à l'accueil. Une session invité survit
à une mort de processus, jamais à une relance volontaire — c'est la distinction
voulue : le **nom** est une commodité qu'on mémorise, la **session** est
ponctuelle.

### Le trou que ce lot bouche au passage

`prejoin.tsx:141-142` sort de son effet quand le compte est `null` ; `access`
reste `null` ; la ligne 213 rend un `ActivityIndicator`. **Ouvrir un lien de
réunion sans compte donne donc un sablier éternel** — sans message, sans sortie,
sans retour. Le mode invité en fait le chemin nominal.

---

## La feuille « Rejoindre »

C'est **le même composant**, avec une capacité en plus. Sa règle actuelle —
« remonte le SLUG, pas une route : la navigation appartient à l'appelant » — est
conservée ; elle remonte désormais un couple.

```ts
type Props = {
  readonly visible: boolean;
  readonly onSheetDismiss: () => void;
  readonly onJoinRoom: (target: { slug: string; host: string }) => void;
  readonly host: string;
  // ABSENT = la rangée de serveur n'est pas rendue du tout. UNE seule prop
  // porte la capacité ET le rappel : deux props à tenir d'accord seraient une
  // de trop, et `home.tsx` n'a aucun serveur à choisir.
  readonly onHostChange?: (host: string) => void;
  readonly testID: string;
};
```

`home.tsx` ne passe pas `onHostChange` : la feuille reste, pour une personne
connectée, exactement celle d'aujourd'hui.

La garde de cette prop est `expect(screen.queryByTestId('…-host')).toBe(null)` —
une conséquence **observable**, jamais `props.onHostChange`. Une prop qu'un
composant consomme lui-même n'atteint pas l'élément hôte, et une assertion dessus
serait verte dans les deux états.

### Le collage

`parseMeetingLink` **n'est pas touchée**. Une fonction sœur naît à côté, pour ce
qui vient d'un appui délibéré :

```ts
// src/navigation/deepLinks.ts
export type PastedTarget = { readonly slug: string; readonly host: string | null };
export function parsePastedMeeting(text: string): PastedTarget | null;
```

`host: null` signifie « aucune information d'hôte » : l'appelant garde le sien.

Quatre tentatives, dans cet ordre, sur le texte **détouré** :

1. le texte entier comme URL `https:` → `{ slug, host }`
2. sinon, **la première sous-chaîne `https://…` trouvée dans le texte** → idem
3. sinon, le texte entier comme `twakevisio://room/<slug>` → `{ slug, host: null }`
4. sinon, le texte entier contre `/^[a-z]{3}-?[a-z]{4}-?[a-z]{3}$/i` → `{ slug, host: null }`
5. sinon `null`

La tentative 2 n'est pas un luxe : « Rejoins-moi : https://…/abc-defg-hij à 14 h »
est la forme sous laquelle un lien circule réellement dans un message.

Les segments réservés (`api`, `admin`, `callback`, …) et le jeu de caractères de
`isRoomSegment` continuent de s'appliquer à toute URL.

#### Le piège du code nu, et pourquoi la tentative 4 est stricte

`normalizeCodeInput` jette tout ce qui n'est pas `[a-z]` puis tronque à dix. Lui
passer une phrase entière lui ferait rendre dix lettres — donc un code
« complet », donc parfaitement bogus, qui remplirait les dix cases et proposerait
de rejoindre un salon qui n'existe pas.

> **Le code nu n'est accepté que sur une correspondance du motif appliquée au
> TEXTE ENTIER, jamais après normalisation.**

Donc : `abc-defg-hij` ✔, `abcdefghij` ✔, `Rejoins-moi : abc-defg-hij` ✘.

| ce qui est collé | résultat |
| --- | --- |
| `https://meet.acme.com/abc-defg-hij` | `{ slug: 'abc-defg-hij', host: 'meet.acme.com' }` |
| `Rejoins-moi : https://meet.acme.com/abc-defg-hij à 14 h` | idem |
| `twakevisio://room/abc-defg-hij` | `{ slug: 'abc-defg-hij', host: null }` |
| `abc-defg-hij` | `{ slug: 'abc-defg-hij', host: null }` |
| `Rejoins-moi : abc-defg-hij` | `null` |
| `https://meet.acme.com/api` | `null` — segment réservé |

### La rangée de serveur

- hôte **connu** (`listKnownHosts()`) → affiché seul ;
- hôte **hors allowlist** → précédé d'un marqueur, en couleur d'**information**
  et non en `danger` : ce n'est pas une erreur, c'est un fait à lire.

« Changer » remplace la rangée par un champ **dans la même feuille**, sans écran
supplémentaire. Un hôte saisi est normalisé en `https://<hôte>` ; un scheme autre
que `https` ou un chemin sont refusés.

---

## Pré-join, salle d'attente, séance

| écran | pour un invité |
| --- | --- |
| **pré-join** | l'encart « VOTRE NOM » (`prejoin.tsx:287-294`) devient un `TextInput`, pré-rempli du nom mémorisé |
| **salle d'attente** | inchangée dans sa forme ; `getVisitor()` au lieu de `getActiveAccount()` |
| **séance** | rien à ajouter : tout ce que l'invité garde passe par le jeton de salle |
| **sortie** | `/welcome` pour un invité, `/home` pour un compte |

**Nom vide → le bouton « Rejoindre » n'est pas rendu.** C'est la forme retenue
par le dépôt (`joinSheet.tsx:161`), et elle est ici **obligatoire** : le pré-join
est un écran sombre, et `IconButton/utils.ts:88-93` teste `disabled` avant
`customIconColor`, donc aucune couleur explicite ne rattrape un bouton grisé.
Masquer, jamais griser.

**L'Historique n'enregistre pas les visites d'un invité.** Un invité n'a pas cet
onglet, et `rememberVisit` écrit dans un magasin local à l'appareil : les entrées
ressortiraient dans l'Historique de la personne qui se connectera ensuite sur ce
téléphone.

### Un point NON MESURÉ, à trancher avant d'écrire le code

Toutes les mesures portent sur un salon `access_level: "public"`. Créer un salon
`trusted` ou `restricted` demande un compte : **ce que le serveur rend à un
anonyme sur un tel salon n'a pas pu être observé.**

À exécuter dès qu'un salon non public existe :

```sh
# Sans aucun en-tête d'autorisation, sur un salon trusted PUIS restricted :
curl -s -i "https://meet.linagora.com/api/v1.0/rooms/<slug>/?username=Test" | head -20
curl -s -i -X POST "https://meet.linagora.com/api/v1.0/rooms/<slug>/request-entry/" \
     -H 'content-type: application/json' -d '{"username":"Test"}' | head -20
```

Les deux issues sont traitées, et **aucune n'est supposée** :

- **200 sans bloc `livekit`** → `fetchRoomAccess` rend déjà `{ kind: 'lobby' }`,
  et la salle d'attente scrute `request-entry`. Rien à écrire.
- **401 / 403** → un message « cette réunion demande un compte » **avec une
  action « Se connecter »**, et non un « accès refusé » muet qui laisserait la
  personne sans issue.

---

## Internationalisation

Sept locales (`en fr es it de vi ru`), toutes remplies avant fusion —
`src/i18n/index.spec.ts` échoue si une clé manque quelque part. Les fichiers de
locales sont une **surface d'ajout partagée** : si ce lot est découpé en
sous-lots parallèles, elle doit être comptée explicitement.

**9 clés nouvelles**, dans les 7 fichiers (63 entrées) :

| clé | sens |
| --- | --- |
| `welcome.joinAsGuest` | « Rejoindre sans compte » |
| `join.server` | l'intitulé de la rangée de serveur |
| `join.serverChange` | « Changer » |
| `join.serverUnknown` | l'hôte n'est pas une instance connue |
| `join.serverPrompt` | l'invite du champ de saisie d'hôte |
| `join.serverInvalid` | hôte saisi invalide |
| `prejoin.yourNamePrompt` | l'invite du champ de nom |
| `guest.signInRequired` | « cette réunion demande un compte » |
| `guest.signIn` | l'action associée |

**Et une clé existante à RÉÉCRIRE, dans les 7 fichiers.** `join.pasteFailed` dit
aujourd'hui, en français : « Ce lien ne pointe pas vers un serveur de réunion
connu. » **C'est la formulation exacte de la règle que la décision 4 abroge** —
un hôte inconnu est désormais accepté, et le seul échec restant est un
presse-papiers qui ne contient ni lien ni code. Le laisser en place ferait dire à
l'écran une règle qui n'existe plus.

> C'est l'application directe d'une leçon déjà payée par ce dépôt : **un site qui
> CITE une règle en dépend autant qu'un site qui l'applique.** Avant de livrer,
> `grep` la formulation abrogée dans tout `src/` — ici « serveur de réunion
> connu » et ses six traductions — et traiter chaque occurrence comme un site à
> corriger.

---

## Tests

`*.spec.ts(x)` colocalisés, aucun instantané. Barre : `npm test`,
`npm run typecheck`, `npm run lint` au vert.

Recensement **par branche et par instruction de gestionnaire**, comme le dépôt
l'impose. Chaque conditionnelle veut un test dont la fixture rend la condition
vraie **et** fausse, et dont l'assertion observe la valeur que cette condition
sélectionne.

| unité | ce qui doit rougir sous mutation |
| --- | --- |
| `parsePastedMeeting` | les 5 tentatives, chacune atteinte **et** manquée — dont le refus de la phrase-avec-code, qui est le cas qui trompe ; et le segment réservé |
| `JoinSheet` | rangée rendue / non rendue selon la présence d'`onHostChange` ; marqueur présent sur hôte inconnu, absent sur hôte connu ; `onJoinRoom` remonte l'hôte **courant** et non le défaut ; le collage d'un hôte inconnu **change** l'hôte affiché |
| `getVisitor` | compte présent → `account` ; compte absent + invité → `guest` ; les deux absents → `null` |
| `fetchRoomAccess` / `requestEntry` | branche `account` → `authedFetch` ; branche `guest` → `anonFetch` **avec `?username=`** — une ligne par branche, nommant la fixture qui l'atteint |
| pré-join invité | bouton rendu / non rendu selon que le nom est vide ; le nom saisi **atteint la requête** ; le nom mémorisé pré-remplit le champ |
| sortie de séance | `/welcome` pour un invité, `/home` pour un compte — une ligne par destination |
| `anonFetch` | n'envoie **aucun** en-tête `authorization` ; ne rejoue pas un 401 |

### Trois rappels qui ont déjà coûté à ce dépôt

- **Assertir une conséquence observable, jamais une prop consommée.** `visible`,
  `behavior` et consorts valent `undefined` sur l'élément hôte : l'assertion est
  verte dans les deux états.
- **`@testing-library/react-native` 14 est asynchrone** : `render`, `fireEvent`,
  `.press`, `.changeText` veulent tous un `await`. `tsc` ne préviendra pas.
- **Chaque extrait de test cité par le plan d'implémentation doit avoir été
  EXÉCUTÉ contre HEAD** — `npx jest <fichier>` sur une copie jetable — et doit
  échouer, de la bonne façon. Un extrait qui jette un `TypeError` est
  indiscernable par lecture d'un extrait qui marche.

Les gardes de couleur explicite s'appliquent aux nouveaux textes du pré-join
(écran sombre) : `toHaveStyle({ color: tokens.color.textDark })`. Elles ne
s'appliquent **pas** à la feuille, qui est claire — mais son fond de `Surface`
reste gardé par le précédent de `bottomSheet.spec.tsx`.

---

## Hors périmètre

- Créer une réunion en invité — le serveur rend **401**, ce n'est pas une
  décision produit.
- Un « accueil invité » avec onglets : l'accueil reste l'écran d'accueil, la
  sortie de séance y ramène.
- L'entrée invité sur `/server` — décision 5, accueil uniquement.
- Élargir l'allowlist des **liens profonds** : elle reste stricte, et c'est le
  cœur de la décision 4.
