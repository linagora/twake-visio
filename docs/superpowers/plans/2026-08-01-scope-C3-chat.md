# Sous-périmètre C3 — Le chat en séance : plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les étapes
> utilisent des cases à cocher (`- [ ]`).

---

## ⚠ Dépendance en tête : la surface d'accueil du chat

**Une conception de panneaux par le bas est en cours d'écriture en parallèle et produira
`docs/superpowers/specs/2026-08-01-bottom-sheets-design.md`. Au moment où ce plan est écrit, ce
document N'EXISTE PAS** — vérifié dans les six worktrees du dépôt et dans les six spécifications
suivies par git (`docs/superpowers/specs/`, branche `design/chat` à `603f91a`).

Ce plan ne l'attend pas et ne le devine pas. Il **nomme la frontière** que cette conception
viendra remplir, la décrit par ce qu'elle doit garantir plutôt que par ce qu'elle est, et
**concentre tout son coût dans la tâche 7**. Les tâches 1 à 6 ne dépendent d'aucune décision de
surface : elles livrent le module pur, le magasin, les clés, la valeur de plateforme, le corps de
chat et le double de test.

**Contrat de la surface d'accueil — quatre clauses, à honorer par la tâche 7 telle qu'elle est
écrite ici, ou par ce que la conception des panneaux dira à sa place :**

| Clause | Exigence exacte | Pourquoi ce n'est pas négociable |
|---|---|---|
| **Héberge un clavier** | La surface reste montée et visible pendant qu'un clavier logiciel est ouvert, et son bord inférieur reste au-dessus de lui. | Un `Menu` de `react-native-paper` monte son contenu dans un `Portal` qui se ferme au moindre appui extérieur — la zone de saisie disparaîtrait à l'instant où on la touche. C'est la raison, déjà écrite au plan C1, pour laquelle C3 paie la conversion. |
| **Hauteur** | Au moins la hauteur utile de l'écran moins la barre de commandes ; la liste des messages prend ce qui reste après l'en-tête, la ligne « pas d'historique » et la zone de saisie (`flex: 1`). | Un fil qu'on lit trois lignes à la fois n'est pas un chat. La conception (§4.4) accepte explicitement que « pendant qu'on écrit, on ne voit personne ». |
| **Fermeture** | Une commande de fermeture atteignable **en un seul appui depuis la surface elle-même**, clavier ouvert compris. | Le point d'entrée est un `Menu.Item` dans le menu « plus », pas la bascule `more-toggle` que §4.3 supposait : la surface n'a donc **pas** de bascule dans la barre et doit porter sa propre sortie. Voir écart **E2**. |
| **Contraste** | La surface ne pose **aucun** fond propre et hérite du `backgroundDark` de `call.tsx`, **ou** en pose un et force alors toutes les couleurs de texte posées dessus. | `AGENTS.md` : « On force la surface **et** le texte, ou ni l'un ni l'autre — une surface forcée sous un texte laissé au thème est le pire des trois cas. » Ce plan retient la première branche pour le panneau et la seconde pour la seule zone de saisie (tâche 5). |

**Ce que la tâche 7 livre par défaut, si le document des panneaux n'existe toujours pas :** le
panneau qui **remplace la scène**, exactement comme `ParticipantsPanel` (`call.tsx:669-681`) —
c'est ce que la conception du périmètre C décide en §4.3, c'est le seul patron déjà éprouvé dans
ce dépôt, et il n'ajoute **aucune dépendance** (§4.2 refuse explicitement `@gorhom/bottom-sheet`
ou équivalent).

**Ce qu'il faut faire si le document existe au moment de dérouler ce plan :** lire sa clause de
clavier, de hauteur, de fermeture et de contraste, les confronter au tableau ci-dessus, et
**ne réécrire que la tâche 7**. Les tâches 1 à 6 restent mot pour mot. `ChatPanel` (tâche 5) ne
connaît de son hôte que trois props — `chat`, `onSend`, `onClose` — et **aucune mesure, aucun
`Portal`, aucun `KeyboardAvoidingView`** : il tient dans une feuille inférieure aussi bien que
dans un panneau plein écran.

---

**But :** en séance, on écrit et on lit. Un message part, tous les connectés le voient, une
édition venue du web remplace le message d'origine au lieu d'en fabriquer un deuxième, un badge
dit qu'il y a du non-lu, une reconnexion ne vide pas le fil — et **l'écran dit en permanence que
rien n'est conservé**, parce que c'est vrai.

**Architecture :** un module **pur** qui porte les quatre règles du fil — fusion d'édition,
comptage des non-lus, regroupement, normalisation de la saisie (`src/call/chat.ts`) ; un magasin
**branché** qui enregistre un gestionnaire de flux sur la `Room`, émet, et rend un instantané
stable (`src/call/chatStore.ts`) ; une **coquille** qui reçoit son état et n'en calcule aucun
(`src/screens/room/chatPanel.tsx`) ; une **valeur de plateforme** rendue par une fonction plutôt
que lue par un composant (`src/ui/keyboard.ts`) ; et le câblage, seul à connaître à la fois le
menu, le panneau et le magasin (`moreMenu.tsx`, `call.tsx`). La frontière est celle des périmètres
A, B, C1 et D : la décision dans un module pur et testable, la coquille aussi bête que possible.

**Socle technique :** TypeScript strict (`noUncheckedIndexedAccess`), React Native 0.86, Expo SDK
57, `react-native-paper` 5.15.3, `livekit-client` 2.18.0, Jest + `@testing-library/react-native`
14. **Aucune dépendance ajoutée.**

**Source :** `docs/superpowers/specs/2026-07-30-scope-C-interaction-design.md`, dont ce plan ne
livre que le sous-périmètre **C3** (§11). Les renvois `§n` y renvoient. Le plan du sous-périmètre
C1, **fusionné**, est `docs/superpowers/plans/2026-07-30-scope-C1-hand.md` ; ce plan en reprend la
forme et deux de ses arbitrages.

**État mesuré de la branche `design/chat` (`603f91a`), avant toute écriture :**
**625 tests verts sur 51 suites**, `npx tsc --noEmit` propre, `npx eslint . --ext .ts,.tsx` sans
erreur nouvelle (le seul avertissement est celui, pré-existant, de `src/i18n/index.ts:32`).
Toute mesure de ce plan est relative à ces 625/51.

**Ce plan n'a pas été prototypé.** Contrairement au plan C1, dont chaque ligne avait tourné avant
d'être écrite, le code littéral ci-dessous est **écrit contre les sources lues** — `call.tsx`,
`moreMenu.tsx`, `controlBar.ts`, `participants.ts`, `recordingStore.ts`, les onze specs de
`src/call/` et `call.spec.tsx`, plus `livekit-client@2.18.0` et `react-native-paper@5.15.3` dans
`node_modules`. Chaque fait de SDK porte son `fichier:ligne`. **Les nombres de tests annoncés par
tâche sont des dénombrements du code de ce plan, pas des exécutions.**

---

## L'état du code, et les deux arbitrages qui en découlent

La conception a été écrite avant que D et C1 ne soient implémentés. Elle décrit (§4.3) un état qui
n'existe plus. Voici l'état **mesuré** sur cette branche :

| Ce que §4.3 suppose | Ce que `design/chat` porte aujourd'hui |
|---|---|
| `share-btn` est un `IconButton` **dans la barre** | `share-btn` est un `Menu.Item` **dans `MoreMenu`** (`moreMenu.tsx:77-87`) |
| C doit créer un `more-toggle` à sa place | `more-btn` **existe déjà** (`moreMenu.tsx:65-74`), icône `dots-vertical` |
| Cette surface est **un panneau qui remplace la scène** | C'est un **`Menu`** de Paper (décision du périmètre D), et il porte **déjà trois commandes** : partage, enregistrement, main levée |
| Le panneau accueille le chat comme **corps** | Il n'y a pas de panneau. **Le menu est plein** : trois `Menu.Item` plus le bloc de file des mains levées |
| §4.5 : le contrôle d'enregistrement doit vivre dans le panneau « plus » | Il y vit déjà (`recordingControl.tsx`, un `Menu.Item`) |

### Arbitrage 1 — Le chat n'entre pas dans le `Menu`. Il ouvre un panneau, et le `Menu` reste

C'est la conséquence directe du contrat de surface ci-dessus. `Menu` monte son contenu dans un
`<Portal>` et se referme sur tout appui extérieur ; il n'a nulle part où poser un clavier. Le plan
C1 l'avait annoncé mot pour mot : « **C3 devra donc convertir `MoreMenu` en `InteractionPanel`** ».

**Ce plan ne convertit pas `MoreMenu`.** Il y **ajoute une quatrième entrée**, `chat-btn`, qui
ferme le menu et ouvre un panneau. Trois raisons mesurées :

**1. La conversion complète coûterait trois composants et trois specs, pour zéro bénéfice au
chat.** `recordingControl.tsx` et `handControl.tsx` sont des `Menu.Item` livrés par D et par C1,
avec 14 tests dans `moreMenu.spec.tsx` et leurs specs propres. Les convertir en lignes de panneau
changerait l'expérience de deux commandes qui n'ont rien demandé — et le plan C1 a mesuré ce que
le menu leur apporte : « Menu : `plus` → `Lever la main` → le menu se referme, **la vidéo n'a
jamais disparu**. Panneau : `plus` → la scène disparaît → `Lever la main` → un troisième appui
pour retrouver la vidéo. » Le chat, lui, **veut** que la scène disparaisse (§4.4 l'écrit :
« pendant qu'on écrit, on ne voit personne »). Les deux besoins sont opposés ; les servir par la
même surface les dessert tous les deux.

**2. Le compte d'appuis est celui que la conception annonce.** §4.4 : « Chat, réactions et main
levée sont toutes derrière **deux appuis**. » Ici : `more-btn` (1) → `chat-btn` (2) → le panneau
est ouvert. **Exactement deux.** La conversion n'en aurait pas économisé un seul.

**3. C'est une tâche de moins à défaire si la conception des panneaux dit autre chose.** Tout ce
que ce plan écrit sur la surface tient dans la tâche 7 : un `Menu.Item`, un `Badge`, un état à
trois valeurs et un `KeyboardAvoidingView`. Convertir `MoreMenu` engagerait en plus deux
composants livrés — qu'il faudrait reconvertir.

**Ce qui renverserait cet arbitrage :** la conception des panneaux, si elle décide que **toutes**
les commandes du menu « plus » migrent vers une feuille. C'est alors une tâche de plus, à faire
**après** ce plan, et qui n'a rien de spécifique au chat.

### Arbitrage 2 — La rangée reste à sept cibles et à 357 dp. Ce plan n'y touche pas d'un dp

`controlBar.ts:12` porte le calcul, vérifié ligne à ligne dans `call.tsx:693-771` : sept cibles —
`mic-toggle`, `camera-toggle`, `camera-menu-btn`, `audio-output-btn`, `more-btn`,
`participants-toggle`, `leave-btn` —

```
7 × 44 + 1 (paire caméra) + 5 × 8 (entre groupes) + 2 × 4 (marge de rangée) = 357 dp
```

sur un écran de 360 dp. Une huitième cible en demanderait `8 × 44 + 1 + 6 × 8 + 2 × 4 = 409 dp`,
soit **49 dp de trop**, et il n'y a rien à gratter (40 dp de cible donnerait 377 dp, sous le
minimum de 44 dp qu'Apple recommande et que A a déjà consenti).

**Le seul ajout de ce plan dans la barre est un `Badge`**, et il ne consomme pas de largeur : il
est posé en `position: 'absolute'` dans un conteneur qui enveloppe `more-btn` **sans dimension
propre**, donc hors du flux de `styles.controls`. Le commentaire d'arithmétique de
`controlBar.ts:5-15` reste vrai mot pour mot après ce plan.

> **Le badge est porté par un bouton générique, et c'est un coût nommé.** §4.4 l'écrit :
> « Il ne dit pas *messages* mais *quelque chose dans le panneau*. Comme le chat est le seul
> producteur de badge, la convention s'apprend en une réunion — mais c'est une indirection. »
> Elle est écrite ici plutôt que découverte.

---

## Écarts assumés avec la conception

Sept points où ce plan ajoute à la conception, la corrige, ou refuse de trancher à sa place.
Chacun est mesuré sur cette branche.

**E1 — Pas d'`InteractionPanel`. Le chat a son propre panneau, `ChatPanel`.**
§6.8 décrit un `InteractionPanel` unique portant les props des trois sous-périmètres. Ce
contenant n'a jamais été construit : C1 a livré dans le `Menu` de D (son écart E1), et C2 n'est
pas livré. Fabriquer maintenant un contenant à quatre familles de props dont ce plan n'en
remplirait qu'une serait un **stand-in inerte** — exactement la classe de défaut que C1 a payée
en trois rondes de correction. `ChatPanel` porte trois props, toutes utilisées.

**E2 — `ChatPanel` porte sa propre fermeture, et cela coûte une septième clé.**
§4.3 fermait le panneau par un second appui sur `more-toggle`, qui était une bascule dans la
barre. Ici le point d'entrée est un `Menu.Item` : rouvrir le menu pour refermer le panneau
demanderait deux appuis, dont un sur une barre que le clavier vient de pousser. Le panneau porte
donc `chat-close`, et §6.11 n'a pas de clé pour lui. **Sept clés, pas six** — le plan C1 a fait le
même constat sur son propre décompte (son écart E4, « Sept clés, pas six »).

**E3 — `onSendChat` rend `Promise<boolean>`, pas `void`.**
§6.8 le déclare `(body: string) => void`, et §7.7 exige que « **LA ZONE DE SAISIE N'EST PAS
VIDÉE** » quand l'envoi échoue. Les deux sont incompatibles : avec un rappel `void`, la coquille
ne peut pas savoir si elle doit vider. La conception se contredit ; ce plan retient §7.7, qui
porte une exigence de comportement, contre §6.8, qui porte une signature. `ChatStore.send` rend
déjà `Promise<boolean>` (§6.7) : la valeur existe, il suffit de ne pas la jeter en route.

**E4 — Le gestionnaire de flux est enregistré à la CONSTRUCTION du magasin, pas à l'abonnement.**
C'est la différence de fond avec `createRoomViewStore` (`participants.ts:102-115`) et
`createRecordingStore` (`recordingStore.ts:47-56`), qui n'écoutent qu'à partir du premier abonné
puis périment leur valeur pour rattraper le trou. **Ces deux-là projettent un état** : la `Room`
porte encore la vérité, donc une fenêtre sans écoute se rattrape en relisant. **Un message est un
événement** : rien ne le porte après son passage, il n'y a **pas d'état présent à relire**, et
une fenêtre sans écoute est une perte définitive. Le magasin s'enregistre donc le plus tôt
possible et ne se détache qu'à `dispose()`. Voir la tâche 2, dont c'est la première mutation.

**E5 — `markRead()` retient le plus grand `sentAt` présent dans le fil, jamais `Date.now()`.**
§6.7 déclare `markRead()` sans dire ce qu'elle écrit. `sentAt` vient de `TextStreamInfo.timestamp`,
c'est-à-dire de l'horloge de **l'émetteur** ; `Date.now()` est celle du **récepteur**. Un pair en
avance de deux secondes laisserait son message non lu pour toujours. Le plus grand horodatage
présent est la seule valeur qui signifie « tout ce qui est à l'écran est lu ».

**E6 — Aucune heure n'est affichée à côté du nom d'auteur.**
Le commentaire de §6.6 décrit l'en-tête de groupe comme « (nom + heure) », mais §6.11 ne donne
**aucune clé de format d'heure**, et rien dans la conception ne tranche entre `Intl.DateTimeFormat`
— dont la disponibilité sous Hermes n'est vérifiée sur aucun appareil ici — et `date-fns` avec ses
sept paquets de locale à importer, ni ne fixe le fuseau que Jest devrait épingler pour qu'une
assertion soit déterministe. **Ce plan n'invente pas ce choix : il le signale** (voir « Ce qui
reste ouvert », point 2). `startsGroup` reste porteuse : c'est elle qui décide si la ligne
d'auteur réapparaît, et le retour de cette ligne après une minute de silence est le repère de
« nouveau tour de parole ».

**E7 — `editedAt` est écrit et n'est lu par aucun composant.**
§6.6 met `editedAt` dans `ChatMessage` et fait de sa pose la preuve de la règle d'édition, mais
**aucune clause de la conception ne dit qu'une édition se marque à l'écran**. Ce plan pose le
champ, le teste, et ne l'affiche pas — signalé plutôt qu'inventé (voir « Ce qui reste ouvert »,
point 3).

---

## Contraintes globales

- `@testing-library/react-native` 14 est **asynchrone** : `await render(...)`,
  `await fireEvent.press(...)`, `await fireEvent.changeText(...)`, `await view.rerender(...)`,
  `await view.unmount()`. Sans `await`, `screen` reste non lié et la requête suivante lève
  ``render` function has not been called``. `tsc` ne le voit pas : une promesse non attendue est
  une expression valide.
- Les écrans vivent dans `src/screens/`, jamais sous `app/` : `require.context` d'expo-router
  balaie tout `.tsx` du dossier et ferait entrer les tests dans le bundle.
- Exports **nommés** uniquement (`export default` n'est toléré que dans les routes sous `app/`).
  Aucun `enum` : unions de chaînes. `eslint.config.js` applique les deux.
- `x as unknown as T` est **interdit hors des fichiers `*.spec.*`**, où il est explicitement
  exempté. Corollaire : **aucun helper de test partagé n'est extrait par ce plan.** Il n'en existe
  aucun dans le dépôt — `person`, `view`, `ME` et `fakeRoom` sont **redéfinis localement dans
  chaque spec**, avec des signatures incompatibles entre fichiers, et un module `src/testing/*.ts`
  échouerait au lint sur ses propres `as unknown as Room`. Chaque spec de ce plan écrit ses
  doubles chez elle.
- Aucun style en ligne : `StyleSheet.create` alimenté par `src/ui/tokens`, ou les styles partagés
  de `src/screens/room/controlBar.ts`.
- Aucune chaîne visible en dur. Sept locales (`en fr es it de vi ru`), **toutes remplies** ;
  `src/i18n/index.spec.ts` échoue si une clé manque quelque part. Il passe en revanche sur une
  clé présente partout et remplie d'anglais recopié : les sept sont **traduites**, pas dupliquées.
  Le format est un **JSON plat, une seule profondeur, clés pointées littérales**
  (`"chat.title"`, jamais `{ "chat": { "title": … } }`).
- `react-hooks/set-state-in-effect` est une **erreur**, pas un avertissement : une garde qui pose
  un état passe par l'initialiseur paresseux du `useState`.
- Barre de qualité : `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`
  verts. Le lint a un avertissement pré-existant sur `src/i18n/index.ts:32` : le laisser.
- Commits atomiques, Conventional Commits, jamais de `--no-verify`. Sujet à la forme phrase
  autorisée (le dépôt surcharge `subject-case`).
- **Committer d'abord, muter ensuite.** Une mutation éprouvée sur du code non committé se perd au
  `git checkout --`. C'est pourquoi chaque tâche place son commit **avant** son étape de mutation.
- Chaque test ajouté doit être **éprouvé par mutation** : casser la règle qu'il prétend garder,
  constater le rouge, restaurer. Un test qui passe dans les deux cas ne garde rien.
- **Pour tout test qui vérifie qu'une valeur remonte : installer au moins deux éléments distincts,
  et viser le second.** Avec un seul, « transmet ce qu'on lui donne » et « rend toujours la même
  valeur en dur » sont indiscernables. **Et quand deux entrées sont sœurs** — deux `Menu.Item`
  voisins, deux sens d'une même bascule, deux messages du même auteur — **éprouver les deux.**
- **Jamais `npm install`, `npm ci` ni `npm add` dans ce worktree.** `node_modules` y est un lien
  symbolique vers l'arbre principal : une installation écrirait dans l'arbre partagé et casserait
  les autres worktrees. **Ce périmètre n'ajoute aucune dépendance.**

### Les quatre valeurs à garder visiblement distinctes dans les fixtures

§9.1 nomme le piège que B a payé : un test qui passe parce que ses données ne discriminent rien.
Dans ce sous-périmètre, quatre chaînes ne doivent **jamais** être égales ni interchangeables dans
une même fixture :

| Valeur | Exemple retenu partout dans ce plan |
|---|---|
| identité LiveKit | `'u-ada'`, `'u-bob'`, `'me'` |
| identifiant de flux (`TextStreamInfo.id`) | `'s-1'`, `'s-2'`, `'s-local'` |
| corps du message | `'bonjour'`, `'la suite'` |
| horodatage (`sentAt`) | `1_000`, `2_000`, `70_000` |

Et **le même `id` porté par deux identités différentes** est un cas de test à part entière
(tâche 1) : c'est le seul qui distingue une fusion correcte d'une fusion sur le seul `id`.

### La couleur : voir `AGENTS.md`, et rien d'autre

La règle générale — pourquoi cet écran est sombre dans les deux schémas alors que le thème Paper
suit le schéma système, quelles props doivent porter une couleur explicite, pourquoi aucun bouton
n'est `disabled`, ce qu'un test peut ou ne peut pas en prouver, et **pourquoi l'`iconColor` d'un
`IconButton` à icône-chaîne n'est joignable par aucun test** — vit dans **`AGENTS.md`, section
« Le fond de la séance est sombre dans les deux schémas. Paper ne le sait pas. »**. **La lire là,
jamais dans une copie.**

Ce qui est **spécifique aux composants de ce plan**, et qui ne se trouve pas dans `AGENTS.md` —
les six ratios sont **recalculés** depuis `src/ui/tokens/index.ts`, pas recopiés :

| Élément livré ici | Prop | Valeur | Fond | Ratio |
|---|---|---|---|---|
| `chat-title`, `chat-empty`, `chat-body-*` | `style` → `color` | `tokens.color.textDark` `#ECECEC` | `backgroundDark` `#0B0B0C` | **16,65:1** |
| `chat-not-kept`, `chat-author-*` (`variant="labelSmall"`) | `style` → `color` | `tokens.color.textDark` | `backgroundDark` | **16,65:1** — secondaire par la **taille**, jamais par un gris |
| `chat-input` | `style` → `backgroundColor` | `tokens.color.surfaceDark` `#121212` | — | la surface est forcée, **donc** les trois couleurs ci-dessous le sont aussi |
| `chat-input` | `textColor` | `tokens.color.textDark` | `surfaceDark` | **15,86:1** |
| `chat-input` | `placeholderTextColor` | `tokens.color.textDark` | `surfaceDark` | **15,86:1** |
| `chat-input` | `outlineColor` | `tokens.color.muted` `#6B7280` | `surfaceDark` | **3,88:1** — un liseré n'est pas du texte : le seuil applicable est celui des objets graphiques (3:1), pas 4,5:1 |
| `chat-input` | `activeOutlineColor` | `tokens.color.primaryDark` `#4D9AFF` | `surfaceDark` | **6,59:1** |
| `chat-btn` (un `Menu.Item`) | `titleStyle` | `barStyles.menuTitle` (`textDark`) | `surfaceDark` | **15,86:1** |
| `chat-btn` | `rippleColor` | `BAR_RIPPLE_COLOR` | — | affordance, pas lisibilité |
| `chat-unread` (un `Badge`) | **aucune couleur posée** | — | — | Paper appaire lui-même `theme.colors.error` et `theme.colors.onError` (`Badge.tsx:88-100`, lu). Schéma clair : `#C62828` + blanc = **5,62:1** ; schéma sombre : `#FF8A80` + `onError` = **5,73:1**. **Les deux passent, et en forcer un les casserait** — c'est exactement le piège que le périmètre A a nommé |

Deux repoussoirs, recalculés eux aussi : `tokens.color.muted` en **texte** donnerait **4,07:1**
sur `backgroundDark` et **3,88:1** sur `surfaceDark`, **sous** le seuil AA de 4,5:1 dans les deux
cas — il ne sert ici que de liseré ; et `tokens.color.primaryLight` (`#0057B8`), le repli de
`theme.colors.primary` en schéma clair, donne **2,86:1** sur `backgroundDark`.

**Le panneau ne pose aucun `backgroundColor`.** Il hérite du `backgroundDark` que `call.tsx:123`
force sur `styles.root` dans les deux schémas — le choix de `ParticipantsPanel`
(`participantsPanel.tsx:10-19`, `root` sans fond) et de `HandBanner`. **Le ratio dépend de ce
choix** : sur `backgroundDark` c'est 16,65:1, sur `surfaceDark` ce serait 15,86:1. La seule
surface propre du plan est celle de `chat-input`, et ses quatre couleurs sont posées avec elle.

**Et aucun bouton de ce plan n'est `disabled`**, nulle part. `IconButton/utils.ts:88-93` teste
`disabled` **avant** `customIconColor` et rend `theme.colors.onSurfaceDisabled` — quasi-noir en
schéma clair, sur un fond forcé sombre — qu'aucune couleur explicite ne rattrape. Le seul état
« occupé » du plan (l'envoi en vol, tâche 5) est une **garde par valeur**, comme `handBusy` dans
`call.tsx:500`.

### Ce que `readAll()` rend, et pourquoi ce plan ne s'en méfie pas

Le rapport de terrain marquait **[S]** une incohérence possible : la documentation de 2.18.0 dit
que l'itérateur de `TextStreamReader` rend « the entire string that has been received up to the
current point in time », alors que `@livekit/components-core` concatène ces valeurs — ce qui
dupliquerait. **La conception a lu l'implémentation et levé le doute** (§0.2, **[V]**) : le
`next()` rend `decoder.decode(result.value.content)`, c'est-à-dire **le seul chunk courant**, et
`readAll()` (`StreamReader.ts:283-289`) concatène. Si l'itérateur rendait des cumuls, `readAll()`
rendrait `"a" + "ab" + "abc"`.

> **`await reader.readAll()` rend le texte complet du message, et c'est le seul appel dont la
> réception a besoin.**

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/call/chat.ts` | **pur** : topic, bornes, fusion d'édition, non-lus, regroupement, normalisation. Ni réseau, ni SDK, ni React |
| `src/call/chat.spec.ts` | les six fonctions ligne à ligne, éprouvées par mutation |
| `src/call/chatStore.ts` | **branché** : enregistre `lk.chat`, émet, rend un instantané stable |
| `src/call/chatStore.spec.ts` | contre une fausse `Room` écrite à la main ; l'ordre `unregister` → `register`, la stabilité, la libération |
| les sept `src/i18n/locales/*.json` (modifiés) | **7 clés**, réellement traduites |
| `src/ui/keyboard.ts` | **pur** : la moitié plateforme du contrat de surface, rendue comme une valeur |
| `src/ui/keyboard.spec.ts` | les deux branches, jamais une seule |
| `src/screens/room/chatPanel.tsx` | coquille : en-tête, ligne « pas d'historique », fil, zone de saisie. Aucune mesure, aucun `Portal` |
| `src/screens/room/chatPanel.spec.tsx` | ce qui part avec quel argument, les couleurs explicites, le texte gardé sur échec |
| `src/screens/room/call.spec.tsx` (modifié, tâche 6) | le double de `Room` sait porter un flux de texte — **test seul, zéro test ajouté** |
| `src/screens/room/controlBar.ts` (modifié) | deux styles : l'ancre du menu et la pastille |
| `src/screens/room/moreMenu.tsx` (modifié) | quatrième entrée `chat-btn` ; `Badge` de non-lus sur l'ancre |
| `src/screens/room/moreMenu.spec.tsx` (modifié) | la quatrième entrée referme le menu **comme ses trois voisines** ; la pastille |
| `src/screens/room/call.tsx` (modifié) | le magasin, l'état à trois valeurs, deux gestionnaires, le panneau, le clavier |
| `src/screens/room/call.spec.tsx` (modifié, tâche 7) | le câblage de bout en bout |

---

### Task 1 : le module pur — la règle d'édition, les non-lus, le regroupement, la saisie

**Files:**
- Create: `src/call/chat.ts`
- Test: `src/call/chat.spec.ts`

**Interfaces:**
- Consumes : **rien.** Aucun import. C'est ce qui rend cette tâche committable seule et son
  `tsc` vert sans aucune autre.
- Produces :
  - `const CHAT_TOPIC: 'lk.chat'`
  - `const CHAT_GROUPING_MS: number` (60 000)
  - `const CHAT_MAX_LENGTH: number` (2 000)
  - `type ChatMessage = { readonly id: string; readonly identity: string; readonly name: string; readonly body: string; readonly sentAt: number; readonly editedAt: number | null; readonly isLocal: boolean }`
  - `messageKey(message: ChatMessage): string`
  - `appendMessage(log: readonly ChatMessage[], incoming: ChatMessage): readonly ChatMessage[]`
  - `unreadCount(log: readonly ChatMessage[], lastReadAt: number): number`
  - `startsGroup(log: readonly ChatMessage[], index: number): boolean`
  - `normaliseBody(input: string): string | null`

**Trois faits de SDK dont ce module dépend, et qu'il ne peut pas vérifier lui-même :**

1. `lk.chat` **n'est pas** une constante de `livekit-client`. La recherche exhaustive des
   littéraux `lk.*` dans 2.18.0 n'en donne qu'un, `lk.agent.pre-connect-audio-buffer` (§1.2). Le
   topic du chat vient de `@livekit/components-core`, qui **n'est pas une dépendance déclarée** de
   cette application. On l'écrit donc en dur, **ici, une seule fois**.
2. `TextStreamInfo.id` est unique **par flux**, pas par salon
   (`node_modules/livekit-client/dist/src/room/types.d.ts:94-110`). Deux émetteurs peuvent porter
   le même. **La clé est la paire (id, identity)** — c'est toute la raison d'être de `messageKey`
   et la moitié de la règle d'`appendMessage`.
3. `sendText` découpe par `splitUtf8(text, 15_000)`, c'est-à-dire **en octets**, en reculant tant
   que l'octet de coupe est une continuation `0b10xxxxxx` (`room/utils.ts:743-766`, §0.3). La
   borne de 2 000 **caractères** n'existe donc pas pour éviter une casse — aucune coupure ne peut
   tomber au milieu d'un codepoint — mais pour rester sur le chemin **mono-chunk**, le seul que la
   conception ait éprouvé.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/call/chat.spec.ts`, en entier :

```ts
import {
  appendMessage,
  CHAT_GROUPING_MS,
  CHAT_MAX_LENGTH,
  CHAT_TOPIC,
  messageKey,
  normaliseBody,
  startsGroup,
  unreadCount,
  type ChatMessage,
} from 'src/call/chat';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 's-1',
    identity: 'u-ada',
    name: 'Ada',
    body: 'bonjour',
    sentAt: 1_000,
    editedAt: null,
    isLocal: false,
    ...overrides,
  };
}

describe('CHAT_TOPIC', () => {
  it("porte le topic de meet, qu'aucune constante du SDK ne donne", () => {
    // Écrit en dur ici et nulle part ailleurs : `@livekit/components-core`,
    // d'où il vient, n'est pas une dépendance déclarée.
    expect(CHAT_TOPIC).toBe('lk.chat');
  });
});

describe('messageKey', () => {
  it("distingue deux messages de même identifiant venus d'émetteurs différents", () => {
    // Un `TextStreamInfo.id` est unique par flux, pas par salon : deux
    // vignettes qui partageraient une clé échangeraient leur contenu.
    expect(messageKey(message({ id: 's-1', identity: 'u-ada' }))).not.toBe(
      messageKey(message({ id: 's-1', identity: 'u-bob' })),
    );
  });

  it('rend la même clé pour le même message', () => {
    expect(messageKey(message({ id: 's-1', identity: 'u-ada' }))).toBe(
      messageKey(message({ id: 's-1', identity: 'u-ada', body: 'autre corps' })),
    );
  });
});

describe('appendMessage', () => {
  it('ajoute un message inconnu à la fin', () => {
    const log = appendMessage([message({ id: 's-1' })], message({ id: 's-2', body: 'la suite' }));

    expect(log.map((entry) => entry.id)).toEqual(['s-1', 's-2']);
    expect(log.map((entry) => entry.body)).toEqual(['bonjour', 'la suite']);
  });

  it("remplace un message de même id ET de même identité, EN PLACE", () => {
    // Une correction de faute de frappe ne doit pas faire sauter le message
    // hors de la conversation qu'il commente.
    const log = appendMessage(
      [message({ id: 's-1', body: 'bonjur' }), message({ id: 's-2', body: 'la suite' })],
      message({ id: 's-1', body: 'bonjour', sentAt: 9_000 }),
    );

    expect(log).toHaveLength(2);
    expect(log.map((entry) => entry.id)).toEqual(['s-1', 's-2']);
    expect(log[0]?.body).toBe('bonjour');
  });

  it("conserve le sentAt d'origine et pose editedAt", () => {
    const log = appendMessage(
      [message({ id: 's-1', sentAt: 1_000 })],
      message({ id: 's-1', body: 'corrigé', sentAt: 9_000 }),
    );

    expect(log[0]?.sentAt).toBe(1_000);
    expect(log[0]?.editedAt).toBe(9_000);
  });

  it("n'écrase jamais le message d'un autre, même à identifiant égal", () => {
    // Le seul test qui distingue une fusion correcte d'une fusion sur le seul
    // `id` : un participant ne réécrit pas le message d'un autre en rejouant
    // son identifiant de flux.
    const log = appendMessage(
      [message({ id: 's-1', identity: 'u-ada', body: 'bonjour' })],
      message({ id: 's-1', identity: 'u-bob', body: 'la suite' }),
    );

    expect(log).toHaveLength(2);
    expect(log.map((entry) => entry.identity)).toEqual(['u-ada', 'u-bob']);
  });

  it('ne modifie pas le tableau reçu', () => {
    const before: readonly ChatMessage[] = [message({ id: 's-1' })];

    appendMessage(before, message({ id: 's-1', body: 'corrigé' }));

    expect(before[0]?.body).toBe('bonjour');
  });
});

describe('unreadCount', () => {
  it('compte les messages distants postérieurs au dernier point de lecture', () => {
    const log = [
      message({ id: 's-1', sentAt: 1_000 }),
      message({ id: 's-2', sentAt: 2_000 }),
      message({ id: 's-3', sentAt: 3_000 }),
    ];

    expect(unreadCount(log, 1_000)).toBe(2);
  });

  it('ne compte jamais les siens', () => {
    // On vient de les écrire : les compter ferait clignoter la pastille sur
    // son propre message.
    const log = [
      message({ id: 's-1', sentAt: 2_000, isLocal: true, identity: 'me' }),
      message({ id: 's-2', sentAt: 3_000 }),
    ];

    expect(unreadCount(log, 1_000)).toBe(1);
  });

  it('exclut un message posté exactement au point de lecture', () => {
    // La borne est stricte : `>`, jamais `>=`. Sinon le message qui vient
    // d'être marqué lu redeviendrait non lu.
    expect(unreadCount([message({ sentAt: 2_000 })], 2_000)).toBe(0);
    expect(unreadCount([message({ sentAt: 2_001 })], 2_000)).toBe(1);
  });

  it('rend zéro sur un fil vide', () => {
    expect(unreadCount([], 0)).toBe(0);
  });
});

describe('startsGroup', () => {
  it('ouvre un groupe sur le premier message', () => {
    expect(startsGroup([message({ id: 's-1' })], 0)).toBe(true);
  });

  it("ouvre un groupe quand l'émetteur change", () => {
    const log = [
      message({ id: 's-1', identity: 'u-ada', sentAt: 1_000 }),
      message({ id: 's-2', identity: 'u-bob', sentAt: 1_001 }),
    ];

    expect(startsGroup(log, 1)).toBe(true);
  });

  it('regroupe deux messages rapprochés du même émetteur', () => {
    const log = [
      message({ id: 's-1', sentAt: 1_000 }),
      message({ id: 's-2', sentAt: 1_001 }),
    ];

    expect(startsGroup(log, 1)).toBe(false);
  });

  it('ne coupe pas à exactement CHAT_GROUPING_MS, mais une milliseconde plus tard', () => {
    // La borne, aux deux côtés : sans le second appel, un `>=` passerait.
    const exact = [
      message({ id: 's-1', sentAt: 1_000 }),
      message({ id: 's-2', sentAt: 1_000 + CHAT_GROUPING_MS }),
    ];
    const beyond = [
      message({ id: 's-1', sentAt: 1_000 }),
      message({ id: 's-2', sentAt: 1_001 + CHAT_GROUPING_MS }),
    ];

    expect(startsGroup(exact, 1)).toBe(false);
    expect(startsGroup(beyond, 1)).toBe(true);
  });

  it('rend faux sur un index hors du fil', () => {
    // `noUncheckedIndexedAccess` rend ce cas typé ; il est aussi réel qu'un
    // rendu qui court après une liste qui vient de raccourcir.
    expect(startsGroup([message()], 7)).toBe(false);
  });
});

describe('normaliseBody', () => {
  it('coupe les blancs de bord', () => {
    expect(normaliseBody('  bonjour  ')).toBe('bonjour');
  });

  it('rend null sur une saisie vide ou de blancs seuls', () => {
    expect(normaliseBody('')).toBeNull();
    expect(normaliseBody('   \n\t ')).toBeNull();
  });

  it('laisse passer une saisie de longueur exactement maximale', () => {
    const body = 'a'.repeat(CHAT_MAX_LENGTH);

    expect(normaliseBody(body)).toHaveLength(CHAT_MAX_LENGTH);
  });

  it('tronque au-delà de la borne', () => {
    const body = 'a'.repeat(CHAT_MAX_LENGTH + 1);

    expect(normaliseBody(body)).toHaveLength(CHAT_MAX_LENGTH);
  });

  it("ne coupe jamais une paire de substitution en deux", () => {
    // Un demi-emoji à l'écran, et un U+FFFD sur le fil après encodage. Même
    // discipline que `splitUtf8` côté SDK, qui recule tant que l'octet de
    // coupe est une continuation.
    const body = 'a'.repeat(CHAT_MAX_LENGTH - 1) + '😀' + 'b';

    // La coupe tomberait entre les deux moitiés de l'emoji : on recule.
    expect(normaliseBody(body)).toHaveLength(CHAT_MAX_LENGTH - 1);
    expect(normaliseBody(body)).not.toContain('\ud83d');
  });
});
```

**Vingt-deux tests.**

- [ ] **Step 2 : écrire le module**

`src/call/chat.ts`, en entier :

```ts
// `lk.chat` n'est PAS une constante de `livekit-client` : la recherche
// exhaustive des littéraux `lk.*` dans 2.18.0 n'en donne qu'un,
// `lk.agent.pre-connect-audio-buffer`. Le topic du chat vient de
// `@livekit/components-core`, qui n'est pas une dépendance déclarée de cette
// application. On l'écrit donc en dur, ici, une seule fois — et c'est cette
// constante que le magasin enregistre et que l'émission vise.
export const CHAT_TOPIC = 'lk.chat';

// La valeur de meet : au-delà d'une minute de silence, le message suivant
// reprend son en-tête d'auteur, même s'il vient de la même personne.
export const CHAT_GROUPING_MS = 60_000;

// Borne d'ÉMISSION seulement ; en réception, `readAll()` reconstitue n'importe
// quelle longueur et rien n'est tronqué. `sendText` découpe en
// `splitUtf8(text, 15_000)`, c'est-à-dire en OCTETS : 2 000 caractères tiennent
// sous cette borne pour n'importe quel texte, donc l'émission reste sur le
// chemin mono-chunk — le seul que la conception ait éprouvé.
export const CHAT_MAX_LENGTH = 2_000;

export type ChatMessage = {
  // `TextStreamInfo.id`, celui du SDK. Unique par flux, pas par salon : deux
  // émetteurs peuvent porter le même. La paire (id, identity) est la vraie
  // clé — voir `appendMessage` et `messageKey`.
  readonly id: string;
  readonly identity: string;
  // Vide quand l'émetteur a déjà quitté la salle : le nom se résout sur la
  // `Room` au moment de la réception, et la coquille pose son propre repli.
  readonly name: string;
  readonly body: string;
  readonly sentAt: number;
  readonly editedAt: number | null;
  readonly isLocal: boolean;
};

// La clé de liste ET de testID. Elle porte les deux moitiés de l'identité d'un
// message : un `id` seul ne les distingue pas, et deux vignettes qui
// partageraient une clé échangeraient leur contenu au moindre changement de
// liste.
export function messageKey(message: ChatMessage): string {
  return `${message.identity}#${message.id}`;
}

// LA règle de correction. Un message de même `id` ET de même `identity`
// REMPLACE l'existant EN PLACE, en conservant le `sentAt` d'origine et en
// posant `editedAt` ; sinon il est ajouté à la fin. L'ignorer produit un
// doublon à l'écran, pas une donnée manquante — c'est ainsi que le web édite.
//
// Même `id` mais identité DIFFÉRENTE : ajouté, jamais fusionné. Un participant
// ne réécrit pas le message d'un autre en rejouant son identifiant de flux.
//
// En place, et non déplacé en fin de fil : une correction de faute de frappe
// ne doit pas faire sauter le message hors de la conversation qu'il commente.
export function appendMessage(
  log: readonly ChatMessage[],
  incoming: ChatMessage,
): readonly ChatMessage[] {
  const existing = log.find(
    (message) => message.id === incoming.id && message.identity === incoming.identity,
  );
  if (existing === undefined) return [...log, incoming];

  const merged: ChatMessage = { ...incoming, sentAt: existing.sentAt, editedAt: incoming.sentAt };
  return log.map((message) => (message === existing ? merged : message));
}

// Les siens ne sont jamais non lus : on vient de les écrire. La borne est
// stricte, sans quoi le message qu'on vient de marquer lu redeviendrait non lu.
export function unreadCount(log: readonly ChatMessage[], lastReadAt: number): number {
  return log.filter((message) => !message.isLocal && message.sentAt > lastReadAt).length;
}

// Vrai quand la ligne doit porter son en-tête d'auteur : premier message, ou
// émetteur différent du précédent, ou plus de CHAT_GROUPING_MS depuis lui.
// Exactement CHAT_GROUPING_MS ne l'ouvre pas.
export function startsGroup(log: readonly ChatMessage[], index: number): boolean {
  const message = log[index];
  if (message === undefined) return false;
  const previous = log[index - 1];
  if (previous === undefined) return true;
  if (previous.identity !== message.identity) return true;
  return message.sentAt - previous.sentAt > CHAT_GROUPING_MS;
}

// Coupe les blancs, tronque à CHAT_MAX_LENGTH, rend `null` si rien ne reste.
// Le composant n'envoie que sur un non-`null` : il n'a aucune règle à lui.
//
// La coupe recule d'une unité UTF-16 quand elle tomberait entre les deux
// moitiés d'une paire de substitution — un demi-emoji à l'écran, et un U+FFFD
// sur le fil après encodage. C'est la même discipline que `splitUtf8` côté SDK.
export function normaliseBody(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= CHAT_MAX_LENGTH) return trimmed;

  const cut = trimmed.slice(0, CHAT_MAX_LENGTH);
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}
```

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/call/chat.spec.ts && npx tsc --noEmit
```

20 tests verts, `tsc` propre. **Cette tâche n'a aucune interdépendance** : elle n'importe rien.

- [ ] **Step 4 : committer**

`feat(call): Merge chat edits, count what is unread and bound the input`

- [ ] **Step 5 : éprouver par mutation**

Huit mutations. Chacune doit rendre `src/call/chat.spec.ts` **rouge**, puis être restaurée :

1. dans `appendMessage`, `message.id === incoming.id && message.identity === incoming.identity`
   → `message.id === incoming.id`
2. dans `appendMessage`, `sentAt: existing.sentAt` → `sentAt: incoming.sentAt`
3. dans `appendMessage`, `editedAt: incoming.sentAt` → `editedAt: null`
4. dans `appendMessage`, `return log.map(…)` → `return [...log.filter((m) => m !== existing), merged]`
   (déplace en fin de fil au lieu de remplacer en place)
5. dans `unreadCount`, `!message.isLocal && message.sentAt > lastReadAt` → `message.sentAt > lastReadAt`
6. dans `unreadCount`, `> lastReadAt` → `>= lastReadAt`
7. dans `startsGroup`, `> CHAT_GROUPING_MS` → `>= CHAT_GROUPING_MS`
8. dans `normaliseBody`, supprimer le recul de paire de substitution
   (`return cut;` au lieu du ternaire)

---

### Task 2 : le magasin — un flux, pas un état

**Files:**
- Create: `src/call/chatStore.ts`
- Test: `src/call/chatStore.spec.ts`

**Interfaces:**
- Consumes :
  - `CHAT_TOPIC`, `appendMessage`, `unreadCount`, `type ChatMessage` de `src/call/chat` (tâche 1)
  - `type Room`, `type TextStreamReader` de `livekit-client` — **en `import type` seulement**.
    Les deux sont bien exportés depuis la racine du paquet :
    `node_modules/livekit-client/dist/src/index.d.ts:46` porte
    `export type * from './room/data-stream/incoming/StreamReader'`.
- Produces :
  - `type ChatSnapshot = { readonly log: readonly ChatMessage[]; readonly unread: number }`
  - `type ChatStore = { subscribe: (onChange: () => void) => () => void; getSnapshot: () => ChatSnapshot; send: (body: string) => Promise<boolean>; markRead: () => void; dispose: () => void }`
  - `createChatStore(room: Room): ChatStore`

**Cinq faits de SDK, tous relevés dans `node_modules`, dont ce magasin dépend :**

1. `registerTextStreamHandler(topic, callback)` / `unregisterTextStreamHandler(topic)` existent au
   niveau `Room` (`dist/src/room/Room.d.ts:88-89`). **Le premier JETTE** si un gestionnaire existe
   déjà pour le topic (`DataStreamError`, raison `HandlerAlreadyRegistered` —
   `IncomingDataStreamManager.ts:30-37`) ; **le second n'est qu'un `Map.delete` et ne jette
   jamais** (`:40-42`).
2. `TextStreamHandler = (reader: TextStreamReader, participantInfo: { identity: string }) => void`
   (`StreamReader.d.ts:76-78`). **`participantInfo` ne porte QUE l'identité**, jamais un
   `Participant` : le nom se résout sur la `Room`.
3. `reader.info` est un `TextStreamInfo` qui étend `BaseStreamInfo` : `id: string`,
   `timestamp: number` (`types.d.ts:94-110`).
4. `sendText(text, options?): Promise<TextStreamInfo>` (`LocalParticipant.d.ts:177`), et
   `SendTextOptions.topic?: string` (`types.d.ts:15-21`).
5. `getParticipantByIdentity(identity): Participant | undefined` (`Room.d.ts:179`).

Et un fait de cycle de vie, vérifié par la conception (§2.2, **[V]**) : `IncomingDataStreamManager`
est construit **une fois** dans le constructeur de `Room` (`Room.ts:243`) et `handleDisconnect`
n'appelle que `clearControllers()` (`Room.ts:1566-1570`) — **la carte des gestionnaires n'est
jamais vidée**. Combiné au fait que `createCallSession()` construit `new Room()` une seule fois
(`connection.ts`) et ne la recrée jamais, **un gestionnaire attaché une fois vaut pour toute la
séance, reconnexions comprises**. C'est ce qui rend le fil survivant à une reconnexion (§7.9).

**Aucun abonnement à `RoomEvent.ChatMessage`.** Ce n'est **pas** un signal réseau dans meet : le
client web le ré-émet localement pour ses propres toasts (§1.4, **[V]**). S'y abonner ne recevrait
jamais rien.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/call/chatStore.spec.ts`, en entier :

```ts
import type { Room, TextStreamReader } from 'livekit-client';

import { CHAT_TOPIC } from 'src/call/chat';
import { createChatStore } from 'src/call/chatStore';

type StreamHandler = (reader: TextStreamReader, info: { identity: string }) => void;

// Un double de `Room` qui tient réellement la carte d'un gestionnaire par
// topic, et qui JETTE sur un second enregistrement — comme le vrai
// `IncomingDataStreamManager`. Sans ce jet, l'invariant « un seul
// enregistrement pour lk.chat » ne serait gardé par aucun test.
//
// `__mocks__/@livekit/react-native.ts` ne stubbe PAS `Room` : c'est
// précisément pour cela que `createChatStore` REÇOIT la Room en paramètre au
// lieu d'aller la chercher.
type RoomProbe = {
  readonly room: Room;
  readonly handlerFor: (topic: string) => StreamHandler | undefined;
  readonly registeredTopics: () => string[];
  readonly sendText: jest.Mock;
  readonly setLocalName: (name: string | undefined) => void;
};

function fakeRoom(remoteNames: Readonly<Record<string, string>> = {}): RoomProbe {
  const handlers = new Map<string, StreamHandler>();
  const sendText = jest.fn();
  let localName: string | undefined = 'Ada';

  const room = {
    localParticipant: {
      identity: 'me',
      get name(): string | undefined {
        return localName;
      },
      sendText,
    },
    getParticipantByIdentity(identity: string): unknown {
      const name = remoteNames[identity];
      return name === undefined ? undefined : { identity, name };
    },
    registerTextStreamHandler(topic: string, handler: StreamHandler): void {
      if (handlers.has(topic)) throw new Error(`handler already registered for ${topic}`);
      handlers.set(topic, handler);
    },
    unregisterTextStreamHandler(topic: string): void {
      handlers.delete(topic);
    },
  };

  return {
    room: room as unknown as Room,
    handlerFor: (topic: string) => handlers.get(topic),
    registeredTopics: () => Array.from(handlers.keys()),
    sendText,
    setLocalName: (name: string | undefined) => {
      localName = name;
    },
  };
}

// Un lecteur de flux minimal, du contrat exact que le gestionnaire lit :
// `info.id`, `info.timestamp`, et un `readAll()` qui rend le texte COMPLET.
function reader(id: string, timestamp: number, body: string): TextStreamReader {
  return {
    info: { id, timestamp },
    readAll: async () => body,
  } as unknown as TextStreamReader;
}

function failingReader(id: string, timestamp: number): TextStreamReader {
  return {
    info: { id, timestamp },
    readAll: async () => {
      throw new Error('flux tronqué');
    },
  } as unknown as TextStreamReader;
}

// Le gestionnaire lance une promesse et ne l'attend pas : sans ce vidage,
// l'assertion regarde le fil d'avant.
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.restoreAllMocks();
  // Un message entrant illisible est journalisé, pas affiché : on garde la
  // sortie de test propre tout en pouvant asserter l'appel.
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('createChatStore', () => {
  it('enregistre lk.chat dès la construction, avant tout abonnement', async () => {
    // Un message est un ÉVÉNEMENT, pas un état : rien ne le porte après son
    // passage. Un magasin qui n'écouterait qu'au premier abonné perdrait
    // définitivement ce qui arrive entre-temps — c'est LA différence avec
    // `createRoomViewStore`, qui peut périmer sa valeur et relire la Room.
    const probe = fakeRoom();

    createChatStore(probe.room);

    expect(probe.registeredTopics()).toEqual([CHAT_TOPIC]);
  });

  it('désenregistre avant d’enregistrer, donc deux constructions ne jettent pas', () => {
    // `registerTextStreamHandler` jette sur un doublon ;
    // `unregisterTextStreamHandler` ne jette jamais. Les deux dans cet ordre
    // rendent l'invariant vrai PAR CONSTRUCTION — y compris quand React
    // appelle deux fois l'initialiseur d'un `useState` en mode strict.
    const probe = fakeRoom();

    createChatStore(probe.room);

    expect(() => createChatStore(probe.room)).not.toThrow();
    expect(probe.registeredTopics()).toEqual([CHAT_TOPIC]);
  });

  it('part sur un fil vide et zéro non-lu', () => {
    // Un arrivant tardif ne voit rien : c'est le sujet de la ligne fixe du
    // panneau, et c'est la vérité du transport (aucun tampon, aucun rejeu).
    const store = createChatStore(fakeRoom().room);

    expect(store.getSnapshot()).toEqual({ log: [], unread: 0 });
  });

  it('rend la même valeur tant que rien ne bouge', () => {
    // Le contrat de `useSyncExternalStore` : une valeur neuve à chaque appel
    // fait boucler le rendu.
    const store = createChatStore(fakeRoom().room);

    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('ajoute un message reçu, avec son identifiant, son corps et son horodatage', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    await settle();

    expect(store.getSnapshot().log).toEqual([
      {
        id: 's-1',
        identity: 'u-ada',
        name: 'Ada',
        body: 'bonjour',
        sentAt: 1_000,
        editedAt: null,
        isLocal: false,
      },
    ]);
  });

  it('résout le nom sur la Room, et le laisse vide pour qui est déjà parti', async () => {
    // `participantInfo` ne porte QUE l'identité. La coquille posera son propre
    // repli sur un nom vide ; le magasin n'invente rien.
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    probe.handlerFor(CHAT_TOPIC)?.(reader('s-2', 2_000, 'parti'), { identity: 'u-zoe' });
    await settle();

    expect(store.getSnapshot().log.map((entry) => entry.name)).toEqual(['Ada', '']);
  });

  it('applique la règle d’édition sur un second message de même identifiant', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjur'), { identity: 'u-ada' });
    await settle();
    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 9_000, 'bonjour'), { identity: 'u-ada' });
    await settle();

    expect(store.getSnapshot().log).toHaveLength(1);
    expect(store.getSnapshot().log[0]?.body).toBe('bonjour');
    expect(store.getSnapshot().log[0]?.sentAt).toBe(1_000);
  });

  it('avertit ses abonnés à chaque message reçu', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);
    const onChange = jest.fn();
    store.subscribe(onChange);

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    await settle();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('cesse d’avertir un abonné qui s’est désabonné', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);
    const leaving = jest.fn();
    const staying = jest.fn();

    const unsubscribe = store.subscribe(leaving);
    store.subscribe(staying);
    unsubscribe();

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    await settle();

    expect(leaving).not.toHaveBeenCalled();
    expect(staying).toHaveBeenCalledTimes(1);
  });

  it('journalise un message illisible et ne l’ajoute pas', async () => {
    // Ce n'est l'action de personne : c'est le message d'un tiers, malformé ou
    // tronqué. Une Snackbar pour un incident qu'on ne peut ni causer ni
    // corriger est du bruit. Journalisé, pas caché.
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    probe.handlerFor(CHAT_TOPIC)?.(failingReader('s-1', 1_000), { identity: 'u-ada' });
    await settle();

    expect(store.getSnapshot().log).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('publie sur le topic du chat et pose l’écho local APRÈS la résolution', async () => {
    const probe = fakeRoom();
    probe.sendText.mockResolvedValue({ id: 's-local', timestamp: 5_000 });
    const store = createChatStore(probe.room);

    await expect(store.send('bonjour')).resolves.toBe(true);

    expect(probe.sendText).toHaveBeenCalledWith('bonjour', { topic: CHAT_TOPIC });
    expect(store.getSnapshot().log).toEqual([
      {
        id: 's-local',
        identity: 'me',
        name: 'Ada',
        body: 'bonjour',
        sentAt: 5_000,
        editedAt: null,
        isLocal: true,
      },
    ]);
  });

  it('rend false sans écho quand la publication échoue', async () => {
    // L'écho SIGNIFIE « c'est parti ». Le poser avant la résolution le ferait
    // mentir pendant une reconnexion.
    const probe = fakeRoom();
    probe.sendText.mockRejectedValue(new Error('canal fermé'));
    const store = createChatStore(probe.room);

    await expect(store.send('bonjour')).resolves.toBe(false);

    expect(store.getSnapshot().log).toEqual([]);
  });

  it('tolère un participant local sans nom', async () => {
    const probe = fakeRoom();
    probe.setLocalName(undefined);
    probe.sendText.mockResolvedValue({ id: 's-local', timestamp: 5_000 });
    const store = createChatStore(probe.room);

    await store.send('bonjour');

    expect(store.getSnapshot().log[0]?.name).toBe('');
  });

  it('remet les non-lus à zéro au marquage', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    probe.handlerFor(CHAT_TOPIC)?.(reader('s-2', 2_000, 'la suite'), { identity: 'u-ada' });
    await settle();
    expect(store.getSnapshot().unread).toBe(2);

    store.markRead();

    expect(store.getSnapshot().unread).toBe(0);
    // Le fil, lui, ne bouge pas : marquer lu n'efface rien.
    expect(store.getSnapshot().log).toHaveLength(2);
  });

  it('retient le plus grand horodatage du fil, jamais l’horloge locale', async () => {
    // `sentAt` vient de l'horloge de l'ÉMETTEUR. Un pair en avance de deux
    // secondes laisserait son message non lu pour toujours si le marquage
    // écrivait `Date.now()`.
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);
    const future = Date.now() + 3_600_000;

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', future, 'en avance'), { identity: 'u-ada' });
    await settle();
    store.markRead();

    expect(store.getSnapshot().unread).toBe(0);
  });

  it('compte comme non lu ce qui arrive après le marquage', async () => {
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);

    probe.handlerFor(CHAT_TOPIC)?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    await settle();
    store.markRead();
    probe.handlerFor(CHAT_TOPIC)?.(reader('s-2', 2_000, 'la suite'), { identity: 'u-ada' });
    await settle();

    expect(store.getSnapshot().unread).toBe(1);
  });

  it('n’avertit personne quand il n’y a rien à marquer', async () => {
    const probe = fakeRoom();
    const store = createChatStore(probe.room);
    const onChange = jest.fn();
    store.subscribe(onChange);

    store.markRead();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('détache exactement ce qu’il a attaché', () => {
    const probe = fakeRoom();
    const store = createChatStore(probe.room);

    store.dispose();

    expect(probe.registeredTopics()).toEqual([]);
  });

  it('n’avertit plus après dispose, même si une lecture se termine', async () => {
    // `readAll()` est asynchrone : une lecture lancée avant la libération peut
    // se terminer après. Sans le drapeau, React serait prévenu d'un
    // changement sur un magasin que l'écran a déjà lâché.
    const probe = fakeRoom({ 'u-ada': 'Ada' });
    const store = createChatStore(probe.room);
    const onChange = jest.fn();
    store.subscribe(onChange);

    const handler = probe.handlerFor(CHAT_TOPIC);
    handler?.(reader('s-1', 1_000, 'bonjour'), { identity: 'u-ada' });
    store.dispose();
    await settle();

    expect(onChange).not.toHaveBeenCalled();
  });
});
```

**Dix-neuf tests.**

- [ ] **Step 2 : écrire le magasin**

`src/call/chatStore.ts`, en entier :

```ts
import type { Room, TextStreamReader } from 'livekit-client';

import { appendMessage, CHAT_TOPIC, unreadCount, type ChatMessage } from 'src/call/chat';

export type ChatSnapshot = {
  readonly log: readonly ChatMessage[];
  readonly unread: number;
};

// Le contrat de `useSyncExternalStore` : `getSnapshot()` doit rendre la *même*
// valeur tant que rien n'a bougé, sans quoi le rendu boucle. `send` et
// `markRead` sont sur le magasin plutôt que sur l'écran parce que le point de
// lecture et le fil vivent ici, et nulle part ailleurs.
export type ChatStore = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => ChatSnapshot;
  // Ne rejette jamais — même contrat que `CallSession.connect`. `false` veut
  // dire « le message n'est pas parti » ; l'appelant garde alors le texte dans
  // la zone de saisie.
  send: (body: string) => Promise<boolean>;
  markRead: () => void;
  dispose: () => void;
};

export function createChatStore(room: Room): ChatStore {
  const listeners = new Set<() => void>();
  let log: readonly ChatMessage[] = [];
  let lastReadAt = 0;
  let snapshot: ChatSnapshot | null = null;
  let disposed = false;

  function invalidate(): void {
    // Une lecture lancée avant `dispose()` peut se terminer après : prévenir
    // React d'un changement sur un magasin que l'écran a lâché n'apprend rien
    // à personne.
    if (disposed) return;
    snapshot = null;
    // Copie de la liste : un abonné qui se désabonne en recevant l'avis ne
    // doit pas changer qui reçoit *cet* avis-là.
    for (const listener of Array.from(listeners)) listener();
  }

  function receive(reader: TextStreamReader, participantInfo: { identity: string }): void {
    const { id, timestamp } = reader.info;
    const { identity } = participantInfo;
    // `participantInfo` ne porte QUE l'identité, jamais un `Participant` : le
    // nom se résout sur la Room, et il vaut `''` si la personne est déjà
    // partie. La coquille pose alors son propre repli.
    const name = room.getParticipantByIdentity(identity)?.name ?? '';

    reader
      .readAll()
      .then((body) => {
        log = appendMessage(log, {
          id,
          identity,
          name,
          body,
          sentAt: timestamp,
          editedAt: null,
          isLocal: false,
        });
        invalidate();
      })
      .catch((error: unknown) => {
        // Ce n'est l'action de personne : c'est le message d'un tiers,
        // malformé ou tronqué. Une Snackbar pour un incident que
        // l'utilisateur ne peut ni causer ni corriger est du bruit.
        // Journalisé, pas caché.
        console.error('chat: an incoming message could not be read', error);
      });
  }

  // Enregistré À LA CONSTRUCTION, pas à l'abonnement — et c'est la seule
  // différence de fond avec `createRoomViewStore` et `createRecordingStore`.
  // Ces deux-là projettent un ÉTAT : ils peuvent n'écouter qu'à partir du
  // premier abonné, puis périmer leur valeur pour rattraper le trou, parce que
  // la Room porte encore la vérité. Un message est un ÉVÉNEMENT : rien ne le
  // porte après son passage, il n'y a pas d'état présent à relire, et une
  // fenêtre sans écoute est une perte définitive.
  //
  // `registerTextStreamHandler` JETTE si un gestionnaire existe déjà pour le
  // topic (`DataStreamError`, `HandlerAlreadyRegistered`), tandis que
  // `unregisterTextStreamHandler` n'est qu'un `Map.delete` et ne jette jamais.
  // Les deux lignes dans cet ordre rendent l'invariant « un seul
  // enregistrement pour lk.chat » vrai PAR CONSTRUCTION — y compris quand
  // React appelle deux fois l'initialiseur d'un `useState` en mode strict.
  room.unregisterTextStreamHandler(CHAT_TOPIC);
  room.registerTextStreamHandler(CHAT_TOPIC, receive);

  return {
    subscribe(onChange: () => void): () => void {
      listeners.add(onChange);
      // Aucune péremption ici, contrairement aux deux autres magasins : leur
      // valeur vient de la Room et a pu changer sans personne pour l'écouter,
      // la nôtre vit dans cette fermeture et ne bouge que par `invalidate()`.
      return () => {
        listeners.delete(onChange);
      };
    },

    getSnapshot(): ChatSnapshot {
      if (snapshot === null) snapshot = { log, unread: unreadCount(log, lastReadAt) };
      return snapshot;
    },

    async send(body: string): Promise<boolean> {
      try {
        const info = await room.localParticipant.sendText(body, { topic: CHAT_TOPIC });
        // L'écho local est fabriqué APRÈS la résolution, depuis l'`id` et
        // l'horodatage que le SDK vient de rendre. Sans eux il faudrait
        // inventer un identifiant, et un identifiant inventé casserait la
        // règle d'édition d'`appendMessage`. LiveKit ne renvoie pas à
        // l'émetteur son propre paquet : il n'y a aucun doublon à craindre.
        log = appendMessage(log, {
          id: info.id,
          identity: room.localParticipant.identity,
          name: room.localParticipant.name ?? '',
          body,
          sentAt: info.timestamp,
          editedAt: null,
          isLocal: true,
        });
        invalidate();
        return true;
      } catch {
        return false;
      }
    },

    markRead(): void {
      // Le plus grand horodatage PRÉSENT dans le fil, jamais `Date.now()` :
      // `sentAt` vient de l'horloge de l'émetteur, et un pair en avance de
      // deux secondes laisserait son message non lu pour toujours.
      const newest = log.reduce(
        (max, message) => (message.sentAt > max ? message.sentAt : max),
        lastReadAt,
      );
      if (newest === lastReadAt) return;
      lastReadAt = newest;
      invalidate();
    },

    dispose(): void {
      disposed = true;
      room.unregisterTextStreamHandler(CHAT_TOPIC);
      listeners.clear();
    },
  };
}
```

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/call/chatStore.spec.ts && npx tsc --noEmit
```

20 tests verts, `tsc` propre. Aucune autre suite n'est touchée : rien n'importe encore ce module.

- [ ] **Step 4 : committer**

`feat(call): Carry the chat thread on a LiveKit text stream`

- [ ] **Step 5 : éprouver par mutation**

Neuf mutations. Chacune doit rendre `src/call/chatStore.spec.ts` **rouge** :

1. déplacer les deux lignes `unregister` / `register` **dans `subscribe`** (le magasin devient un
   projecteur d'état alors qu'il porte un flux) — le test « enregistre lk.chat dès la
   construction » tombe
2. supprimer la ligne `room.unregisterTextStreamHandler(CHAT_TOPIC);` qui précède
   l'enregistrement — « deux constructions ne jettent pas » tombe
3. dans `send`, poser l'écho **avant** `await room.localParticipant.sendText(...)`
4. dans `send`, `sentAt: info.timestamp` → `sentAt: Date.now()`
5. dans `markRead`, `const newest = log.reduce(…)` → `const newest = Date.now()`
6. dans `markRead`, supprimer `if (newest === lastReadAt) return;`
7. dans `getSnapshot`, `if (snapshot === null)` → toujours reconstruire l'objet
8. dans `invalidate`, supprimer `if (disposed) return;`
9. dans `receive`, `?.name ?? ''` → `?.name ?? identity` (l'identité brute à l'écran)

---

### Task 3 : les sept clés, dans les sept locales

**Files:**
- Modify: `src/i18n/locales/en.json`, `fr.json`, `es.json`, `it.json`, `de.json`, `vi.json`,
  `ru.json`
- Test: `src/i18n/index.spec.ts` (existant, non modifié — il **échoue** dès qu'une locale manque
  une clé)

**Interfaces:**
- Consumes : rien.
- Produces : sept clés, dans sept fichiers. **49 entrées.**

§6.11 annonce « C3 — 6 clés » et n'en donne pas de septième pour la fermeture du panneau : voir
l'écart **E2**. Aucune clé n'est retirée. `call.unnamedParticipant` (déjà présent) sert de repli
au nom d'un émetteur vide, comme `handControl.tsx:67` le fait déjà pour la file des mains levées.

Les sept clés se posent **après le bloc `call.*` et avant `participants.title`**, dans chacun des
sept fichiers, à l'identique — les sept locales font exactement le même nombre de lignes, et
`index.spec.ts` compare les clés triées.

- [ ] **Step 1 : `en`**

```json
  "chat.title": "Chat",
  "chat.placeholder": "Write a message",
  "chat.send": "Send",
  "chat.close": "Close the chat",
  "chat.empty": "No messages yet",
  "chat.sendFailed": "Message not sent",
  "chat.notKept": "Messages are not kept. Nobody sees this thread after the meeting, and anyone joining later will not see what came before.",
```

- [ ] **Step 2 : `fr`**

```json
  "chat.title": "Discussion",
  "chat.placeholder": "Écrire un message",
  "chat.send": "Envoyer",
  "chat.close": "Fermer la discussion",
  "chat.empty": "Aucun message pour l'instant",
  "chat.sendFailed": "Message non envoyé",
  "chat.notKept": "Les messages ne sont pas conservés. Personne ne verra ce fil après la réunion, et qui arrive plus tard ne verra pas ce qui précède.",
```

- [ ] **Step 3 : `es`**

```json
  "chat.title": "Chat",
  "chat.placeholder": "Escribe un mensaje",
  "chat.send": "Enviar",
  "chat.close": "Cerrar el chat",
  "chat.empty": "Todavía no hay mensajes",
  "chat.sendFailed": "Mensaje no enviado",
  "chat.notKept": "Los mensajes no se conservan. Nadie verá esta conversación después de la reunión, y quien se una más tarde no verá lo anterior.",
```

- [ ] **Step 4 : `it`**

```json
  "chat.title": "Chat",
  "chat.placeholder": "Scrivi un messaggio",
  "chat.send": "Invia",
  "chat.close": "Chiudi la chat",
  "chat.empty": "Nessun messaggio per ora",
  "chat.sendFailed": "Messaggio non inviato",
  "chat.notKept": "I messaggi non vengono conservati. Nessuno vedrà questa conversazione dopo la riunione, e chi entra più tardi non vedrà quanto precede.",
```

- [ ] **Step 5 : `de`**

```json
  "chat.title": "Chat",
  "chat.placeholder": "Nachricht schreiben",
  "chat.send": "Senden",
  "chat.close": "Chat schließen",
  "chat.empty": "Noch keine Nachrichten",
  "chat.sendFailed": "Nachricht nicht gesendet",
  "chat.notKept": "Nachrichten werden nicht gespeichert. Nach der Besprechung sieht niemand mehr diesen Verlauf, und wer später dazukommt, sieht nicht, was vorher geschrieben wurde.",
```

- [ ] **Step 6 : `vi`**

```json
  "chat.title": "Trò chuyện",
  "chat.placeholder": "Nhập tin nhắn",
  "chat.send": "Gửi",
  "chat.close": "Đóng trò chuyện",
  "chat.empty": "Chưa có tin nhắn nào",
  "chat.sendFailed": "Tin nhắn chưa được gửi",
  "chat.notKept": "Tin nhắn không được lưu lại. Sau cuộc họp sẽ không ai xem được cuộc trò chuyện này, và người vào sau sẽ không thấy những gì đã trao đổi trước đó.",
```

- [ ] **Step 7 : `ru`**

```json
  "chat.title": "Чат",
  "chat.placeholder": "Написать сообщение",
  "chat.send": "Отправить",
  "chat.close": "Закрыть чат",
  "chat.empty": "Сообщений пока нет",
  "chat.sendFailed": "Сообщение не отправлено",
  "chat.notKept": "Сообщения не сохраняются. После встречи эту переписку никто не увидит, а тот, кто присоединится позже, не увидит написанного ранее.",
```

- [ ] **Step 8 : lancer et vérifier**

```
npx jest src/i18n && npx prettier --check src/i18n
```

Les deux tests de `index.spec.ts` verts, `prettier` vert.

- [ ] **Step 9 : committer**

`feat(i18n): Translate the in-meeting chat strings in seven locales`

- [ ] **Step 10 : éprouver par mutation**

Une mutation, qui garde le seul invariant que ce fichier de test porte :

1. retirer `"chat.notKept"` de `ru.json` seulement → `src/i18n/index.spec.ts` doit devenir rouge,
   sur `ru` et sur `ru` seul.

---

### Task 4 : la moitié plateforme du contrat de surface

**Files:**
- Create: `src/ui/keyboard.ts`
- Test: `src/ui/keyboard.spec.ts`

**Interfaces:**
- Consumes : `Platform` de `react-native`.
- Produces :
  - `type KeyboardMode = 'padding' | 'resize'`
  - `keyboardMode(): KeyboardMode`

**Pourquoi une fonction, et pas une lecture de `Platform` dans le composant.** Le préréglage Jest
fixe `Platform.OS` à `'ios'`. Un composant qui lirait `Platform` directement n'aurait **jamais**
sa branche Android rendue par un test. Le dépôt a déjà tranché ce point pour la route audio :
« Rendu comme une valeur plutôt que lu depuis `Platform` par le composant : c'est ce qui permet à
une spec de rendre les deux branches sans bouchonner `Platform` » (`src/call/audioRoute.ts:8-11`),
et `call.tsx:269` appelle `audioRouteControl()` puis passe le résultat en prop. **Même patron
ici.**

**Pourquoi les deux valeurs sont celles-là.** iOS **superpose** le clavier à la fenêtre : il faut
rendre au contenu la hauteur qu'il occupe, ce que fait `behavior="padding"`. Android **redimensionne
déjà** la fenêtre — `app.json` ne pose pas `android.softwareKeyboardLayoutMode`, et le défaut
d'Expo est `resize` — donc ajouter un rembourrage par-dessus décalerait deux fois.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/ui/keyboard.spec.ts`, en entier :

```ts
import { Platform } from 'react-native';

import { keyboardMode } from 'src/ui/keyboard';

describe('keyboardMode', () => {
  it("rend 'padding' sur iOS, où le clavier se superpose à la fenêtre", () => {
    jest.replaceProperty(Platform, 'OS', 'ios');

    expect(keyboardMode()).toBe('padding');
  });

  it("rend 'resize' ailleurs, où la fenêtre a déjà rétréci", () => {
    // Les deux branches, jamais une seule : avec une seule, une constante en
    // dur serait indiscernable d'une lecture correcte de la plateforme. Même
    // convention que `audioRoute.spec.ts`.
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(keyboardMode()).toBe('resize');
  });
});
```

**Deux tests.**

- [ ] **Step 2 : écrire le module**

`src/ui/keyboard.ts`, en entier :

```ts
import { Platform } from 'react-native';

// 'padding' : iOS superpose le clavier à la fenêtre, il faut donc rendre au
// contenu la hauteur qu'il occupe. 'resize' : Android redimensionne déjà la
// fenêtre — `app.json` ne pose pas `android.softwareKeyboardLayoutMode`, et le
// défaut d'Expo est `resize` — donc un rembourrage par-dessus décalerait deux
// fois.
//
// Rendu comme une valeur plutôt que lu depuis `Platform` par le composant :
// c'est ce qui permet à une spec de rendre les deux branches sans bouchonner
// la plateforme. Le préréglage Jest fixe `Platform.OS` à 'ios', donc sans cela
// la branche Android ne serait rendue par aucun test. Même patron
// qu'`audioRouteControl()` (`src/call/audioRoute.ts`).
export type KeyboardMode = 'padding' | 'resize';

export function keyboardMode(): KeyboardMode {
  return Platform.OS === 'ios' ? 'padding' : 'resize';
}
```

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/ui/keyboard.spec.ts && npx tsc --noEmit && npx eslint src/ui/keyboard.ts
```

- [ ] **Step 4 : committer**

`feat(ui): Tell the two platforms apart for keyboard avoidance`

- [ ] **Step 5 : éprouver par mutation**

Deux mutations :

1. `Platform.OS === 'ios' ? 'padding' : 'resize'` → `'padding'` en dur
2. `Platform.OS === 'ios'` → `Platform.OS === 'android'`

---

### Task 5 : la coquille de chat — elle reçoit son état, elle n'en calcule aucun

**Files:**
- Create: `src/screens/room/chatPanel.tsx`
- Test: `src/screens/room/chatPanel.spec.tsx`

**Interfaces:**
- Consumes :
  - `type ChatSnapshot` de `src/call/chatStore` (tâche 2)
  - `CHAT_MAX_LENGTH`, `messageKey`, `normaliseBody`, `startsGroup`, `type ChatMessage` de
    `src/call/chat` (tâche 1)
  - `BAR_HIT_SLOP`, `BAR_ICON_COLOR`, `BAR_RIPPLE_COLOR`, `barStyles` de
    `src/screens/room/controlBar` (existant, **non modifié par cette tâche**)
  - `tokens` de `src/ui/tokens`
  - les clés `chat.title`, `chat.close`, `chat.notKept`, `chat.empty`, `chat.placeholder`,
    `chat.send`, et `call.unnamedParticipant` (tâche 3)
- Produces :
  - `type ChatPanelProps = { readonly chat: ChatSnapshot; readonly onSend: (body: string) => Promise<boolean>; readonly onClose: () => void }`
  - `ChatPanel(props: ChatPanelProps): React.ReactElement`

**Ce que cette coquille ne connaît PAS de son hôte** — c'est là toute la frontière : ni sa hauteur,
ni sa position, ni le clavier, ni un `Portal`, ni un `KeyboardAvoidingView`. Elle se pose dans une
boîte `flex: 1` et demande trois choses seulement : `chat`, `onSend`, `onClose`.

**Quatre décisions de rendu, chacune avec sa raison :**

1. **`FlatList` `inverted`, alimentée par des rangées pré-calculées.** L'index 0 est rendu **en
   bas** : le message le plus récent est donc toujours visible, sans un seul appel impératif à
   `scrollToEnd` — appel qu'aucun test de RNTL ne pourrait exercer, puisque `onContentSizeChange`
   n'y est jamais déclenché. Les rangées sont construites **dans l'ordre du fil** — c'est l'ordre
   que `startsGroup` attend —, puis renversées une fois.
2. **La ligne « pas d'historique » est hors de la liste**, entre le titre et le fil : elle est
   permanente (§5.C1), et une `FlatList` `inverted` la poserait en bas.
3. **Aucun bouton n'est `disabled`.** L'envoi en vol est gardé **par valeur** (`sending`), comme
   `handBusy` dans `call.tsx:500` : le bouton reste rendu et coloré, un second appui ne part pas.
4. **Le nom local n'a pas de clé propre.** `call.you` appartient au sous-périmètre C2, qui n'est
   pas livré ; le magasin remplit déjà `name` depuis `room.localParticipant.name`, et le repli sur
   `call.unnamedParticipant` est celui de `handControl.tsx:67`, de `waitingBanner` et de
   `participantsPanel`.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/screens/room/chatPanel.spec.tsx`, en entier :

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { CHAT_MAX_LENGTH, type ChatMessage } from 'src/call/chat';
import type { ChatSnapshot } from 'src/call/chatStore';
import { tokens } from 'src/ui/tokens';
import { ChatPanel } from './chatPanel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 's-1',
    identity: 'u-ada',
    name: 'Ada',
    body: 'bonjour',
    sentAt: 1_000,
    editedAt: null,
    isLocal: false,
    ...overrides,
  };
}

function snapshot(log: readonly ChatMessage[], unread = 0): ChatSnapshot {
  return { log, unread };
}

async function sent(): Promise<boolean> {
  return true;
}

describe('ChatPanel', () => {
  it("dit en permanence que rien n'est conservé, fil vide compris", async () => {
    // Ce n'est pas un état d'erreur ni un état vide : c'est la vérité du
    // transport, et une interface qui ne la dit pas ment par omission.
    await render(<ChatPanel chat={snapshot([])} onSend={sent} onClose={jest.fn()} />);

    expect(screen.getByTestId('chat-not-kept')).toHaveTextContent('chat.notKept');
    expect(screen.getByTestId('chat-empty')).toHaveTextContent('chat.empty');
  });

  it('garde la ligne « pas conservé » quand le fil se remplit', async () => {
    await render(
      <ChatPanel chat={snapshot([message()])} onSend={sent} onClose={jest.fn()} />,
    );

    expect(screen.getByTestId('chat-not-kept')).toBeTruthy();
    expect(screen.queryByTestId('chat-empty')).toBe(null);
  });

  it('rend chaque message, et vise le second', async () => {
    // Deux messages, et l'assertion porte sur le SECOND : avec un seul, une
    // liste tronquée à son premier élément passerait.
    await render(
      <ChatPanel
        chat={snapshot([
          message({ id: 's-1', body: 'bonjour' }),
          message({ id: 's-2', body: 'la suite' }),
        ])}
        onSend={sent}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('chat-body-u-ada#s-2')).toHaveTextContent('la suite');
    expect(screen.getByTestId('chat-body-u-ada#s-1')).toHaveTextContent('bonjour');
  });

  it("ouvre un en-tête d'auteur au premier message et pas au suivant", async () => {
    await render(
      <ChatPanel
        chat={snapshot([
          message({ id: 's-1', sentAt: 1_000 }),
          message({ id: 's-2', sentAt: 1_500 }),
        ])}
        onSend={sent}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('chat-author-u-ada#s-1')).toHaveTextContent('Ada');
    expect(screen.queryByTestId('chat-author-u-ada#s-2')).toBe(null);
  });

  it("rouvre un en-tête quand l'émetteur change", async () => {
    await render(
      <ChatPanel
        chat={snapshot([
          message({ id: 's-1', identity: 'u-ada', name: 'Ada' }),
          message({ id: 's-2', identity: 'u-bob', name: 'Bob', sentAt: 1_500 }),
        ])}
        onSend={sent}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('chat-author-u-bob#s-2')).toHaveTextContent('Bob');
  });

  it("replie sur le libellé d'anonyme un nom vide, jamais sur l'identité", async () => {
    // Jamais d'identité brute ni de vide à l'écran : les deux se liraient
    // comme un défaut d'affichage plutôt que comme une personne sans nom.
    await render(
      <ChatPanel
        chat={snapshot([message({ name: '   ' })])}
        onSend={sent}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('chat-author-u-ada#s-1')).toHaveTextContent(
      'call.unnamedParticipant',
    );
    expect(screen.queryByText(/u-ada/)).toBe(null);
  });

  it('envoie la saisie normalisée et vide la zone', async () => {
    const onSend = jest.fn(async () => true);
    await render(<ChatPanel chat={snapshot([])} onSend={onSend} onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('chat-input'), '  bonjour  ');
    await fireEvent.press(screen.getByTestId('chat-send'));

    expect(onSend).toHaveBeenCalledWith('bonjour');
    await waitFor(() => expect(screen.getByTestId('chat-input').props.value).toBe(''));
  });

  it('garde le texte dans la zone quand l’envoi échoue', async () => {
    // Un message perdu qu'on doit retaper est une deuxième punition pour une
    // panne de réseau. C'est la moitié du traitement d'erreur.
    const onSend = jest.fn(async () => false);
    await render(<ChatPanel chat={snapshot([])} onSend={onSend} onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'bonjour');
    await fireEvent.press(screen.getByTestId('chat-send'));

    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('chat-input').props.value).toBe('bonjour');
  });

  it('n’envoie rien sur une saisie de blancs seuls', async () => {
    const onSend = jest.fn(async () => true);
    await render(<ChatPanel chat={snapshot([])} onSend={onSend} onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('chat-input'), '   ');
    await fireEvent.press(screen.getByTestId('chat-send'));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('ignore un second appui tant que le premier envoi est en vol', async () => {
    // La garde porte sur une VALEUR, pas sur `disabled` : Paper teste
    // `disabled` avant toute couleur explicite et rend un quasi-noir que rien
    // ne rattrape sur ce fond.
    let release = (): void => undefined;
    const onSend = jest.fn(
      async () =>
        await new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        }),
    );
    await render(<ChatPanel chat={snapshot([])} onSend={onSend} onClose={jest.fn()} />);

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'bonjour');
    await fireEvent.press(screen.getByTestId('chat-send'));
    await fireEvent.press(screen.getByTestId('chat-send'));

    expect(onSend).toHaveBeenCalledTimes(1);
    // Le bouton n'a pas disparu : la garde est une valeur, pas un `disabled`
    // ni un démontage.
    expect(screen.getByTestId('chat-send')).toBeTruthy();
    release();
  });

  it('borne la saisie à la longueur maximale', async () => {
    await render(<ChatPanel chat={snapshot([])} onSend={sent} onClose={jest.fn()} />);

    expect(screen.getByTestId('chat-input').props.maxLength).toBe(CHAT_MAX_LENGTH);
  });

  it('ferme sur demande, sans envoyer quoi que ce soit', async () => {
    const onClose = jest.fn();
    const onSend = jest.fn(async () => true);
    await render(<ChatPanel chat={snapshot([])} onSend={onSend} onClose={onClose} />);

    await fireEvent.press(screen.getByTestId('chat-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('porte une couleur explicite sur le titre, la ligne fixe, un auteur et un corps', async () => {
    // RNTL ne rastérise rien : ces assertions ne prouvent PAS qu'un texte est
    // lisible. Elles prouvent que la couleur explicite n'a pas été retirée —
    // c'est la cause qu'on garde, pas le symptôme. Sans `PaperProvider`
    // ancêtre, un `Text` dépouillé retombe sur `rgba(28, 27, 31, 1)`, et
    // l'égalité stricte fait échouer n'importe quel repli.
    await render(
      <ChatPanel
        chat={snapshot([message({ id: 's-1' }), message({ id: 's-2', sentAt: 1_500 })])}
        onSend={sent}
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByTestId('chat-title')).toHaveStyle({ color: tokens.color.textDark });
    expect(screen.getByTestId('chat-not-kept')).toHaveStyle({ color: tokens.color.textDark });
    expect(screen.getByTestId('chat-author-u-ada#s-1')).toHaveStyle({
      color: tokens.color.textDark,
    });
    // Le SECOND corps aussi : une couleur posée sur le premier laisserait les
    // suivants retomber sur le thème.
    expect(screen.getByTestId('chat-body-u-ada#s-2')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('porte une couleur explicite sur le fil vide', async () => {
    await render(<ChatPanel chat={snapshot([])} onSend={sent} onClose={jest.fn()} />);

    expect(screen.getByTestId('chat-empty')).toHaveStyle({ color: tokens.color.textDark });
  });

  it('force la surface de la zone de saisie ET le texte posé dessus', async () => {
    // On force la surface et le texte, ou ni l'un ni l'autre : une surface
    // forcée sous un texte laissé au thème est le pire des trois cas.
    //
    // Deux nœuds distincts, et c'est Paper qui l'impose : `TextInputOutlined`
    // EXTRAIT `backgroundColor` du `style` qu'on lui passe (`:91-99`) et le
    // remet à son liseré, rendu sous le `testID` fixe `text-input-outline`
    // (`Addons/Outline.tsx:36`) — même convention que le `menu-surface` que
    // `moreMenu.spec.tsx` vise déjà. La couleur du texte, elle, atterrit bien
    // dans le style du champ natif (`:404`, `color: inputTextColor`), que
    // notre `textColor` alimente.
    await render(<ChatPanel chat={snapshot([])} onSend={sent} onClose={jest.fn()} />);

    expect(screen.getByTestId('text-input-outline')).toHaveStyle({
      backgroundColor: tokens.color.surfaceDark,
    });
    expect(screen.getByTestId('chat-input')).toHaveStyle({ color: tokens.color.textDark });
  });
});
```

**Quinze tests.**

> **Ce que ces tests ne gardent PAS, et pourquoi.** L'`iconColor` de `chat-close` et de
> `chat-send` n'est joignable par aucune assertion : `IconButton.tsx:211` rend
> `<IconComponent color={iconColor} source={icon} />` **sans lui transmettre de `testID`**, et le
> chemin par défaut pose en plus `accessibilityElementsHidden` (`AGENTS.md`). Aucun des sept
> `IconButton` de la barre ne garde le sien, `leave-btn` compris ; on n'en fabrique pas un ici.
> Le `rippleColor` est hors de portée pour une autre raison : le préréglage Jest fixe
> `Platform.OS` à `'ios'`, donc `TouchableRipple.supported` est faux au **chargement du module** —
> `jest.replaceProperty` n'y suffirait pas. Les deux props sont **posées** dans le composant,
> jamais **assertées**.
>
> **`placeholderTextColor` n'est pas asserté non plus, et pour une raison mesurée.** Paper le
> transmet au natif à travers `placeholderTextColorBasedOnState`
> (`TextInputOutlined.tsx:209-210, 391`), qui vaut `'transparent'` tant que
> `parentState.displayPlaceholder` est faux — et cet état **part à `false`**
> (`TextInput.tsx:250-251`). Au premier rendu, une assertion d'égalité lirait donc
> `'transparent'`, pas notre couleur. La prop est **posée** dans le composant, jamais **assertée**.

- [ ] **Step 2 : écrire le composant**

`src/screens/room/chatPanel.tsx`, en entier :

```tsx
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { IconButton, Text, TextInput } from 'react-native-paper';

import {
  CHAT_MAX_LENGTH,
  messageKey,
  normaliseBody,
  startsGroup,
  type ChatMessage,
} from 'src/call/chat';
import type { ChatSnapshot } from 'src/call/chatStore';
import {
  BAR_HIT_SLOP,
  BAR_ICON_COLOR,
  BAR_RIPPLE_COLOR,
  barStyles,
} from 'src/screens/room/controlBar';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  // Aucun fond propre : le panneau hérite du `backgroundDark` que `call.tsx`
  // force sur `styles.root` dans les deux schémas, comme `ParticipantsPanel`.
  // Poser un fond sans en tirer les conséquences sur le texte est le pire des
  // trois cas.
  root: { flex: 1, padding: tokens.spacing.md, gap: tokens.spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  log: { flex: 1 },
  row: { paddingVertical: tokens.spacing.xs },
  composer: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  // La zone de saisie est la SEULE surface propre de ce panneau : elle porte
  // donc son fond ET ses quatre couleurs (voir les props ci-dessous).
  input: { flex: 1, backgroundColor: tokens.color.surfaceDark },
  // Sans cette couleur explicite, chaque libellé retombe sur
  // `theme.colors.onSurface`, qui suit le schéma système — quasi-noir sur un
  // fond forcé sombre. 16,65:1 avec.
  text: { color: tokens.color.textDark },
});

type Row = {
  readonly message: ChatMessage;
  readonly header: boolean;
};

type RowProps = {
  readonly row: Row;
};

// Une ligne, un message. L'en-tête d'auteur n'apparaît qu'en tête de groupe :
// c'est `startsGroup` qui le décide, à partir du fil dans son ordre réel — et
// non de l'ordre inversé dans lequel la liste le rend.
function ChatRow({ row }: RowProps): React.ReactElement {
  const { t } = useTranslation();
  const key = messageKey(row.message);
  const name = row.message.name.trim();

  return (
    <View testID={`chat-message-${key}`} style={styles.row}>
      {row.header ? (
        // Secondaire par la TAILLE, jamais par un gris : `tokens.color.muted`
        // donne 4,07:1 sur ce fond, sous le seuil AA de 4,5:1.
        <Text testID={`chat-author-${key}`} variant="labelSmall" style={styles.text}>
          {name.length > 0 ? name : t('call.unnamedParticipant')}
        </Text>
      ) : null}
      <Text testID={`chat-body-${key}`} style={styles.text}>
        {row.message.body}
      </Text>
    </View>
  );
}

export type ChatPanelProps = {
  readonly chat: ChatSnapshot;
  // Rend `true` quand le message est parti. §6.8 la déclare `void`, mais §7.7
  // exige que la zone de saisie NE SOIT PAS vidée sur échec : avec un rappel
  // `void`, la coquille ne peut pas savoir. La valeur existe déjà côté
  // magasin ; il suffit de ne pas la jeter en route.
  readonly onSend: (body: string) => Promise<boolean>;
  readonly onClose: () => void;
};

// Coquille : elle reçoit un instantané et deux rappels, elle ne va rien
// chercher elle-même et ne connaît RIEN de son hôte — ni sa hauteur, ni sa
// position, ni le clavier. Elle se pose dans une boîte `flex: 1`.
export function ChatPanel({ chat, onSend, onClose }: ChatPanelProps): React.ReactElement {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  // Une requête en vol, jamais un état désiré. Garde par VALEUR : `disabled`
  // est interdit sur cet écran, Paper le teste avant toute couleur explicite.
  const [sending, setSending] = useState(false);

  // Construites dans l'ordre du fil — celui que `startsGroup` attend — puis
  // renversées une fois pour la liste `inverted`, qui rend l'index 0 en bas.
  // C'est ce qui garde le message le plus récent visible sans un seul
  // `scrollToEnd` impératif, appel qu'aucun test ne pourrait exercer.
  const rows = useMemo<readonly Row[]>(
    () =>
      chat.log
        .map((message, index) => ({ message, header: startsGroup(chat.log, index) }))
        .reverse(),
    [chat.log],
  );

  const handleSend = (): void => {
    if (sending) return;
    const body = normaliseBody(draft);
    if (body === null) return;

    setSending(true);
    onSend(body)
      .then((ok) => {
        setSending(false);
        // Vidée seulement sur succès : un message perdu qu'on doit retaper est
        // une deuxième punition pour une panne de réseau.
        if (ok) setDraft('');
      })
      .catch(() => setSending(false));
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text testID="chat-title" variant="titleMedium" style={styles.text}>
          {t('chat.title')}
        </Text>
        {/* Le point d'entrée est un `Menu.Item`, pas une bascule de barre : ce
            panneau porte donc sa propre sortie, atteignable en un appui,
            clavier ouvert compris. */}
        <IconButton
          testID="chat-close"
          icon="close"
          iconColor={BAR_ICON_COLOR}
          rippleColor={BAR_RIPPLE_COLOR}
          style={barStyles.button}
          hitSlop={BAR_HIT_SLOP}
          onPress={onClose}
          accessibilityLabel={t('chat.close')}
        />
      </View>

      {/* Permanente, hors de la liste : c'est la vérité du transport, et une
          interface qui ne la dit pas ment par omission. Une `FlatList`
          inversée la poserait en bas. */}
      <Text testID="chat-not-kept" variant="labelSmall" style={styles.text}>
        {t('chat.notKept')}
      </Text>

      {rows.length === 0 ? (
        <Text testID="chat-empty" style={[styles.log, styles.text]}>
          {t('chat.empty')}
        </Text>
      ) : (
        <FlatList
          testID="chat-log"
          inverted
          style={styles.log}
          data={rows}
          keyExtractor={(row) => messageKey(row.message)}
          renderItem={({ item }) => <ChatRow row={item} />}
        />
      )}

      <View style={styles.composer}>
        <TextInput
          testID="chat-input"
          mode="outlined"
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder={t('chat.placeholder')}
          maxLength={CHAT_MAX_LENGTH}
          style={styles.input}
          // Les quatre couleurs, parce que le fond est forcé juste au-dessus.
          // Le liseré est le seul à ne pas venir de `textDark` : ce n'est pas
          // du texte, et le seuil applicable est celui des objets graphiques.
          textColor={tokens.color.textDark}
          placeholderTextColor={tokens.color.textDark}
          outlineColor={tokens.color.muted}
          activeOutlineColor={tokens.color.primaryDark}
        />
        <IconButton
          testID="chat-send"
          icon="send"
          iconColor={BAR_ICON_COLOR}
          rippleColor={BAR_RIPPLE_COLOR}
          style={barStyles.button}
          hitSlop={BAR_HIT_SLOP}
          onPress={handleSend}
          accessibilityLabel={t('chat.send')}
        />
      </View>
    </View>
  );
}
```

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/screens/room/chatPanel.spec.tsx && npx tsc --noEmit && npx eslint src/screens/room/chatPanel.tsx
```

16 tests verts. **Aucune autre suite n'est touchée** : rien ne rend encore ce composant.

- [ ] **Step 4 : committer**

`feat(call): Read and write the meeting chat in its own panel`

- [ ] **Step 5 : éprouver par mutation**

Dix mutations :

1. supprimer `<Text testID="chat-not-kept">` — la ligne fixe disparaît
2. dans `handleSend`, `if (ok) setDraft('')` → `setDraft('')` inconditionnel
3. dans `handleSend`, supprimer `if (sending) return;`
4. dans `handleSend`, supprimer `if (body === null) return;`
5. dans `handleSend`, `onSend(body)` → `onSend(draft)` (la normalisation sautée)
6. dans `rows`, `header: startsGroup(chat.log, index)` → `header: true`
7. dans `ChatRow`, `name.length > 0 ? name : t('call.unnamedParticipant')` → `row.message.identity`
8. dans `styles`, retirer `color: tokens.color.textDark` de `text`
9. dans `styles`, retirer `backgroundColor: tokens.color.surfaceDark` de `input`
10. sur `chat-input`, retirer `textColor={tokens.color.textDark}`

---

### Task 6 : le double de `Room` de `call.spec.tsx` sait porter un flux — **et rien d'autre ne bouge**

**Files:**
- Modify: `src/screens/room/call.spec.tsx` (**test seul, zéro test ajouté, zéro fichier de
  production touché**)

**Interfaces:**
- Consumes : `CHAT_TOPIC` de `src/call/chat` (tâche 1).
- Produces : rien d'exporté. Trois membres de plus sur `mockRoom`, une carte de gestionnaires, une
  fonction d'aide `receiveChat`, quatre lignes de réinitialisation dans le `beforeEach` existant.

**Pourquoi c'est une tâche à part, et pas une étape de la tâche 7.** Dès que `call.tsx` construira
un `createChatStore(session.getRoom())`, le double actuel de `Room` (`call.spec.tsx:146-181`)
**fera tomber les 68 tests de ce fichier au premier rendu** : il n'a ni
`registerTextStreamHandler`, ni `unregisterTextStreamHandler`, ni `sendText`, ni
`getParticipantByIdentity`. Séparer les deux commits est ce qui rend l'affirmation « **les 625
tests passent sans modification après ce changement** » vérifiable — le plan C1 avait fait le même
constat sur les inertes `on`/`off` (son écart E6) et l'avait payé en une étape noyée dans sa
tâche 8. **Ici c'est un commit à soi, et sa preuve est un compte de tests inchangé.**

- [ ] **Step 1 : ajouter au double ce que le flux exige**

Après le bloc `mockRoomHandlers` (`call.spec.tsx:144`), ajouter :

```tsx
// Le flux de chat, du côté du double. `registerTextStreamHandler` n'est pas
// une émission d'événement : c'est une carte d'un seul gestionnaire par topic,
// et le vrai JETTE sur un doublon. Le double jette aussi, sans quoi rien ne
// garderait l'ordre `unregister` → `register` que le magasin respecte.
type StreamHandler = (
  reader: { info: { id: string; timestamp: number }; readAll: () => Promise<string> },
  info: { identity: string },
) => void;

const mockTextStreamHandlers = new Map<string, StreamHandler>();
const mockSendText = jest.fn();
let mockLocalName: string | undefined;
```

Dans le littéral `mockRoom`, remplacer le `localParticipant` existant et ajouter trois méthodes :

```tsx
  localParticipant: {
    identity: 'me',
    isLocal: true,
    isSpeaking: false,
    get name(): string | undefined {
      return mockLocalName;
    },
    get attributes(): Record<string, string> {
      return mockLocalAttributes;
    },
    getTrackPublication: () => mockCameraPublication,
    sendText: mockSendText,
  },
```

```tsx
  registerTextStreamHandler(topic: string, handler: StreamHandler): void {
    if (mockTextStreamHandlers.has(topic)) {
      throw new Error(`handler already registered for ${topic}`);
    }
    mockTextStreamHandlers.set(topic, handler);
  },
  unregisterTextStreamHandler(topic: string): void {
    mockTextStreamHandlers.delete(topic);
  },
  // Le magasin y résout le nom d'un émetteur ; `remoteParticipants` est déjà
  // la carte que les tests de modération peuplent.
  getParticipantByIdentity(identity: string): unknown {
    return mockRoom.remoteParticipants.get(identity);
  },
```

Le type déclaré de `mockRoom` (`call.spec.tsx:146-153`) gagne les trois signatures correspondantes.

**Aucune fonction d'aide n'est ajoutée par ce commit.** L'aide de réception (`receiveChat`)
appartient à la tâche 7, qui l'appelle : introduite ici, elle serait une fonction **non utilisée**,
et `@typescript-eslint/no-unused-vars` ferait tomber `npm run lint` sur un commit dont toute la
valeur est de ne rien casser. Les trois membres ajoutés ci-dessus, eux, sont tous consommés dès ce
commit — `mockTextStreamHandlers` par les deux méthodes, `mockSendText` par `localParticipant`,
`mockLocalName` par son accesseur et par le `beforeEach`.

Aucun import nouveau n'est nécessaire non plus : le double n'a pas besoin de `CHAT_TOPIC`, il
range les gestionnaires par la chaîne que le magasin lui passera.

Dans le `beforeEach` existant, à côté de `mockRoomHandlers.clear();` (`call.spec.tsx:288`) :

```tsx
  mockTextStreamHandlers.clear();
  mockSendText.mockReset().mockResolvedValue({ id: 's-local', timestamp: 5_000 });
  mockLocalName = 'Ada';
```

- [ ] **Step 2 : vérifier que rien n'a bougé**

```
npx jest src/screens/room/call.spec.tsx
```

**Le compte de tests doit être identique à celui d'avant ce commit.** Un test ajouté ici serait un
test que ce commit n'a pas les moyens d'exercer : aucun code de production ne lit encore ces
membres.

```
npx jest && npx tsc --noEmit && npx eslint . --ext .ts,.tsx
```

**625 tests / 51 suites**, exactement comme avant.

- [ ] **Step 3 : committer**

`test(call): Let the Room double carry a text stream`

- [ ] **Step 4 : éprouver par mutation**

Ce commit **n'ajoute aucune assertion** : il n'y a donc **aucune mutation à éprouver**, et c'est
la bonne réponse plutôt qu'une mutation inventée. La seule vérification qui compte est celle du
step 2 : **625, avant comme après**. Un compte différent voudrait dire que le double a changé un
comportement observé par un test existant.

---

### Task 7 : la surface d'accueil — l'entrée, la pastille, le panneau, le clavier

> **C'est la tâche qui porte la frontière décrite en tête de ce plan.** Si
> `docs/superpowers/specs/2026-08-01-bottom-sheets-design.md` existe au moment de la dérouler, la
> relire d'abord et **ne réécrire que cette tâche** : les six précédentes ne présument rien de la
> surface.

**Files:**
- Modify: `src/screens/room/controlBar.ts`
- Modify: `src/screens/room/moreMenu.tsx`
- Modify: `src/screens/room/moreMenu.spec.tsx`
- Modify: `src/screens/room/call.tsx`
- Modify: `src/screens/room/call.spec.tsx`

**Un seul commit pour ces cinq fichiers, et ce n'est pas négociable.** `MoreMenuProps` gagne deux
props **requises** (`unread`, `onOpenChat`) ; `call.tsx` est **le seul constructeur** de ce type
dans tout le dépôt. Les séparer laisserait `tsc` rouge chez le voisin entre les deux commits —
c'est exactement le défaut que deux tâches sur huit du sous-périmètre C1 ont livré. **Qui construit
le type élargi et qui le consomme voyagent ensemble.** Vérifié : `grep -rn "<MoreMenu" src/` ne
donne que `call.tsx:737` et `moreMenu.spec.tsx:60`.

**Interfaces:**
- Consumes :
  - `createChatStore`, `type ChatSnapshot` de `src/call/chatStore` (tâche 2)
  - `ChatPanel` de `src/screens/room/chatPanel` (tâche 5)
  - `keyboardMode` de `src/ui/keyboard` (tâche 4)
  - `KeyboardAvoidingView` de `react-native` ; `Badge` de `react-native-paper`
  - les clés `chat.title`, `chat.sendFailed` (tâche 3)
- Produces (élargissements, tous consommés dans le même commit) :
  - `barStyles.anchor`, `barStyles.badge` — consommés par `moreMenu.tsx` **seul**
  - `MoreMenuProps` gagne `readonly unread: number` et `readonly onOpenChat: () => void` —
    construits par `call.tsx` **seul**
  - `MessageKey` (type local à `call.tsx`) gagne `'chat.sendFailed'` — **aucun consommateur hors
    du fichier**

- [ ] **Step 1 : les deux styles partagés**

Dans `src/screens/room/controlBar.ts`, ajouter à `barStyles`, après `button` :

```ts
  // L'ancre du menu « plus » : un conteneur SANS dimension propre, dont le
  // seul rôle est de donner à la pastille un parent positionné. La cible reste
  // 44 dp et la pastille est hors flux, donc la rangée vaut toujours 357 dp —
  // le calcul ci-dessus n'a pas bougé d'un dp.
  anchor: { position: 'relative' },
  // Aucune couleur posée : Paper appaire lui-même `theme.colors.error` et
  // `theme.colors.onError` (`Badge.tsx:88-100`). En schéma clair #C62828 sur
  // blanc donne 5,62:1, en schéma sombre #FF8A80 sur son `onError` 5,73:1 :
  // les deux passent, et en forcer un seul les casserait.
  badge: { position: 'absolute', top: 2, right: 2 },
```

- [ ] **Step 2 : écrire les tests de menu qui échouent**

Dans `src/screens/room/moreMenu.spec.tsx`, ajouter `unread` et `onOpenChat` au type `Overrides` et
à la fabrique `menu()` :

```tsx
  unread?: number;
  onOpenChat?: () => void;
```

```tsx
      unread={overrides.unread ?? 0}
      onOpenChat={overrides.onOpenChat ?? jest.fn()}
```

et cinq tests, à la fin du `describe('MoreMenu')` :

```tsx
  it('ouvre le chat et referme le menu, comme ses trois voisines', async () => {
    // Rien ne garantit qu'une entrée referme le menu parce que ses voisines le
    // font : le `setVisible(false)` est écrit une fois par entrée.
    const onOpenChat = jest.fn();
    const onShare = jest.fn();
    await render(menu({ onOpenChat, onShare }));

    await open();
    await waitFor(() => expect(screen.getByTestId('chat-btn')).toBeTruthy());
    expect(screen.getByTestId('chat-btn')).toHaveTextContent('chat.title');
    await fireEvent.press(screen.getByTestId('chat-btn'));

    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(onShare).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('chat-btn')).toBe(null));
  });

  it('porte une couleur explicite sur le libellé du chat', async () => {
    await render(menu());

    await open();

    await waitFor(() => expect(screen.getByTestId('chat-btn-title')).toBeTruthy());
    expect(screen.getByTestId('chat-btn-title')).toHaveStyle({ color: tokens.color.textDark });
  });

  it('ne montre aucune pastille sans non-lu', async () => {
    await render(menu({ unread: 0 }));

    expect(screen.getByTestId('chat-unread').props.visible).toBe(false);
  });

  it('montre le nombre de non-lus, menu fermé', async () => {
    // La pastille vit sur l'ANCRE, pas dans le menu : elle doit être visible
    // sans rien ouvrir, sinon elle n'avertit personne.
    await render(menu({ unread: 3 }));

    expect(screen.getByTestId('chat-unread').props.visible).toBe(true);
    expect(screen.getByTestId('chat-unread')).toHaveTextContent('3');
  });

  it('rend un nombre transmis, pas une constante', async () => {
    // Deux valeurs distinctes, jamais une seule.
    const view = await render(menu({ unread: 3 }));
    expect(screen.getByTestId('chat-unread')).toHaveTextContent('3');

    await view.rerender(menu({ unread: 7 }));

    expect(screen.getByTestId('chat-unread')).toHaveTextContent('7');
  });
```

- [ ] **Step 3 : écrire la modification du menu**

Dans `src/screens/room/moreMenu.tsx` : importer `View` de `react-native` et `Badge` de
`react-native-paper`, élargir les props, envelopper l'ancre, insérer l'entrée.

```tsx
export type MoreMenuProps = {
  readonly recording: RecordingState;
  readonly canRecord: boolean;
  readonly recordingBusy: boolean;
  readonly handRaised: boolean;
  readonly handBusy: boolean;
  readonly hands: readonly RaisedHand[];
  // Le chat est le seul producteur de pastille : elle est donc portée par un
  // bouton générique et dit « quelque chose dans le menu », pas « des
  // messages ». C'est une indirection, elle est écrite plutôt que découverte.
  readonly unread: number;
  readonly onShare: () => void;
  readonly onStartRecording: () => void;
  readonly onStopRecording: () => void;
  readonly onToggleHand: () => void;
  readonly onOpenChat: () => void;
};
```

L'ancre :

```tsx
      anchor={
        // Un conteneur sans dimension propre : la pastille est hors flux, la
        // cible reste 44 dp, la rangée reste à 357 dp.
        <View style={barStyles.anchor}>
          <IconButton
            testID="more-btn"
            icon="dots-vertical"
            iconColor={BAR_ICON_COLOR}
            rippleColor={BAR_RIPPLE_COLOR}
            style={barStyles.button}
            hitSlop={BAR_HIT_SLOP}
            onPress={() => setVisible(true)}
            accessibilityLabel={t('call.more')}
          />
          {/* Aucune couleur posée : Paper appaire lui-même `error` et
              `onError`, et les deux schémas passent le seuil AA. En forcer un
              casserait l'autre. Posée à CÔTÉ du bouton, jamais comme son
              enfant — un `IconButton` ne rend que son icône. */}
          <Badge testID="chat-unread" visible={unread > 0} style={barStyles.badge}>
            {unread}
          </Badge>
        </View>
      }
```

et l'entrée, **entre `RecordingControl` et `HandControl`** :

```tsx
      {/* Placée avant la main levée, dont le bloc de file n'est pas pressable :
          les trois commandes restent groupées, et la file garde le bas du
          menu où on ne la prendra pas pour une liste d'actions. */}
      <Menu.Item
        testID="chat-btn"
        title={t('chat.title')}
        titleStyle={barStyles.menuTitle}
        rippleColor={BAR_RIPPLE_COLOR}
        accessibilityLabel={t('chat.title')}
        onPress={() => {
          setVisible(false);
          onOpenChat();
        }}
      />
```

- [ ] **Step 4 : écrire les tests d'écran qui échouent**

Dans `src/screens/room/call.spec.tsx`, ajouter l'import du topic — c'est ce commit-ci qui
l'utilise, pas le précédent :

```tsx
import { CHAT_TOPIC } from 'src/call/chat';
```

puis, après `emitRoom` (`call.spec.tsx:185-189`), l'aide de réception, et enfin un `describe` :

```tsx
// Fait arriver un message entrant comme le fait le SDK : un lecteur dont
// `info` porte l'identifiant de flux et l'horodatage, et dont `readAll()`
// résout sur le texte COMPLET. Le gestionnaire lance une promesse sans
// l'attendre, d'où le vidage à l'intérieur de l'`act`.
async function receiveChat(
  identity: string,
  id: string,
  body: string,
  sentAt = 1_000,
): Promise<void> {
  const handler = mockTextStreamHandlers.get(CHAT_TOPIC);
  if (handler === undefined) throw new Error('aucun gestionnaire lk.chat enregistré');
  await act(async () => {
    handler({ info: { id, timestamp: sentAt }, readAll: async () => body }, { identity });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('CallScreen — le chat', () => {
  async function openChat(): Promise<void> {
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('chat-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('chat-btn'));
    await waitFor(() => expect(screen.getByTestId('chat-title')).toBeTruthy());
  }

  it('remplace la scène par le chat, et la rend au retour', async () => {
    // Le panneau remplace la scène plutôt que de se poser par-dessus : les
    // deux se disputeraient la même vidéo. La barre, elle, reste en place.
    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('active-speaker')).toBeTruthy());

    await openChat();

    expect(screen.queryByTestId('active-speaker')).toBe(null);
    expect(screen.getByTestId('leave-btn')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('chat-close'));

    await waitFor(() => expect(screen.getByTestId('active-speaker')).toBeTruthy());
    expect(screen.queryByTestId('chat-title')).toBe(null);
  });

  it("n'ouvre jamais deux panneaux à la fois", async () => {
    // Trois états s'excluent ; deux booléens en autoriseraient quatre, dont un
    // impossible.
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));
    await render(withPaper(<CallScreen />));
    await fireEvent.press(screen.getByTestId('participants-toggle'));
    await waitFor(() => expect(screen.getAllByTestId('participant-row').length).toBeGreaterThan(0));

    await openChat();

    expect(screen.queryByTestId('participant-row')).toBe(null);
  });

  it('affiche un message reçu du serveur', async () => {
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));
    await render(withPaper(<CallScreen />));

    await receiveChat('u-bob', 's-1', 'bonjour');
    await openChat();

    expect(screen.getByTestId('chat-body-u-bob#s-1')).toHaveTextContent('bonjour');
  });

  it('compte les non-lus sans ouvrir le panneau, puis les efface à l’ouverture', async () => {
    // Deux messages, jamais un seul : avec un seul, une pastille codée en dur
    // à 1 passerait.
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));
    await render(withPaper(<CallScreen />));

    await receiveChat('u-bob', 's-1', 'bonjour', 1_000);
    await receiveChat('u-bob', 's-2', 'la suite', 2_000);

    expect(screen.getByTestId('chat-unread')).toHaveTextContent('2');

    await openChat();

    expect(screen.getByTestId('chat-unread').props.visible).toBe(false);
  });

  it('envoie sur le topic du chat et vide la zone', async () => {
    mockSendText.mockResolvedValue({ id: 's-local', timestamp: 5_000 });
    await render(withPaper(<CallScreen />));
    await openChat();

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'bonjour');
    await fireEvent.press(screen.getByTestId('chat-send'));

    await waitFor(() => expect(mockSendText).toHaveBeenCalledWith('bonjour', { topic: 'lk.chat' }));
    expect(screen.getByTestId('chat-input').props.value).toBe('');
    expect(screen.getByTestId('chat-body-me#s-local')).toHaveTextContent('bonjour');
  });

  it('signale un envoi échoué et garde le texte', async () => {
    mockSendText.mockRejectedValue(new Error('canal fermé'));
    await render(withPaper(<CallScreen />));
    await openChat();

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'bonjour');
    await fireEvent.press(screen.getByTestId('chat-send'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('chat.sendFailed'),
    );
    expect(screen.getByTestId('chat-input').props.value).toBe('bonjour');
  });

  it('efface l’avertissement quand un envoi suivant réussit', async () => {
    // Le test que le périmètre B avait dû ajouter après coup : un succès doit
    // effacer l'erreur d'un essai précédent.
    mockSendText.mockRejectedValueOnce(new Error('canal fermé'));
    mockSendText.mockResolvedValue({ id: 's-local', timestamp: 5_000 });
    await render(withPaper(<CallScreen />));
    await openChat();

    await fireEvent.changeText(screen.getByTestId('chat-input'), 'bonjour');
    await fireEvent.press(screen.getByTestId('chat-send'));
    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('chat.sendFailed'),
    );

    await fireEvent.press(screen.getByTestId('chat-send'));

    // La `Snackbar` de Paper ne rend RIEN quand elle est masquée : le motif du
    // dépôt est `queryByTestId(…).toBeNull()`, jamais un contenu vide
    // (`call.spec.tsx:1165`).
    await waitFor(() => expect(screen.queryByTestId('call-notice')).toBeNull());
  });

  it('enregistre lk.chat une seule fois, et le libère au démontage', async () => {
    // Un gestionnaire laissé sur une Room vivante est une fuite qu'aucun écran
    // ne rattrape ; deux enregistrements feraient jeter le SDK.
    const view = await render(withPaper(<CallScreen />));

    expect(mockTextStreamHandlers.has('lk.chat')).toBe(true);

    await view.unmount();

    expect(mockTextStreamHandlers.has('lk.chat')).toBe(false);
  });
});
```

**Huit tests.**

- [ ] **Step 5 : écrire le câblage**

Dans `src/screens/room/call.tsx` :

Imports — ajouter `KeyboardAvoidingView` à l'import `react-native`, `createChatStore` de
`src/call/chatStore`, `ChatPanel` de `src/screens/room/chatPanel`, `keyboardMode` de
`src/ui/keyboard`.

`MessageKey` gagne une variante :

```ts
  | 'call.handFailed'
  | 'chat.sendFailed'
```

`participantsOpen` (`call.tsx:215`) est **remplacé** :

```ts
  // Trois états qui s'excluent, et non deux booléens : deux booléens
  // autoriseraient quatre combinaisons dont une impossible — les deux panneaux
  // ouverts sur la même région d'écran.
  const [panel, setPanel] = useState<'none' | 'participants' | 'chat'>('none');
```

Le magasin, **avec les autres Hooks, avant les sorties anticipées** :

```ts
  // `useState` et non `useMemo`, contrairement aux deux autres magasins :
  // celui-ci enregistre un gestionnaire de flux DÈS SA CONSTRUCTION, et React
  // se réserve le droit de jeter un `useMemo`. Un magasin jeté laisserait
  // derrière lui un gestionnaire `lk.chat` sur une Room vivante. Même raison
  // que la session, ligne 157-160.
  const [chatStore] = useState(() => createChatStore(session.getRoom()));
  const chat = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);
```

L'effet de libération, **déclaré avant celui de l'abonnement de session** (`call.tsx:304`) — les
nettoyages s'exécutent dans l'ordre de déclaration, et détacher le gestionnaire avant de jeter la
`Room` est la même précaution que le désabonnement de `setCallState` :

```ts
  useEffect(() => () => chatStore.dispose(), [chatStore]);
```

Trois gestionnaires, et un remplacement :

```ts
  // Le compteur repart de zéro à l'OUVERTURE, jamais au défilement : un
  // compteur qui dépendrait de la position de défilement demanderait
  // d'instrumenter une `FlatList`.
  const handleOpenChat = (): void => {
    chatStore.markRead();
    setPanel('chat');
  };

  const handleCloseChat = (): void => setPanel('none');

  // `send` ne rejette jamais : son échec ordinaire est une valeur `false`.
  // Le booléen remonte jusqu'à la coquille, qui garde le texte dans la zone de
  // saisie quand le message n'est pas parti — un message perdu qu'on doit
  // retaper est une deuxième punition pour une panne de réseau. Un succès
  // efface l'erreur d'un essai précédent, comme les cinq autres actions.
  const handleSendChat = async (body: string): Promise<boolean> => {
    const ok = await chatStore.send(body);
    setNotice(ok ? null : 'chat.sendFailed');
    return ok;
  };

  const handleToggleParticipants = (): void => {
    setPanel((current) => (current === 'participants' ? 'none' : 'participants'));
  };
```

Le rendu — la racine devient un `KeyboardAvoidingView` :

```tsx
  // La racine, et non le seul panneau : sur iOS le clavier se superpose à la
  // fenêtre entière, et rembourrer le panneau seul laisserait la barre de
  // commandes — donc « quitter » — sous le clavier. Sans clavier ouvert, le
  // rembourrage vaut zéro et cette vue se comporte exactement comme la `View`
  // qu'elle remplace. `keyboardMode()` est une VALEUR : c'est ce qui permet à
  // une spec de rendre les deux branches sans bouchonner `Platform`.
  <KeyboardAvoidingView
    style={styles.root}
    behavior={keyboardMode() === 'padding' ? 'padding' : undefined}
  >
```

La région de panneau :

```tsx
      {/* Le panneau remplace la scène plutôt que de se poser par-dessus : les
          deux se disputeraient la même vidéo, qui est la raison d'être de cet
          écran. La barre de contrôle, elle, reste en place dans les trois cas —
          quitter reste toujours possible. */}
      {panel === 'participants' ? (
        <ParticipantsPanel
          participants={participants}
          canModerate={canModerate}
          onMute={handleMuteParticipant}
          onRemove={handleRemoveParticipant}
          onRole={handleChangeParticipantRole}
        />
      ) : panel === 'chat' ? (
        <ChatPanel chat={chat} onSend={handleSendChat} onClose={handleCloseChat} />
      ) : (
        // Parti pris mobile : locuteur actif en grand, vignettes en bande.
        <CallStage layout={layout} />
      )}
```

et `<MoreMenu>` gagne deux props :

```tsx
          unread={chat.unread}
          onOpenChat={handleOpenChat}
```

- [ ] **Step 6 : lancer la barre entière**

```
npx jest && npx tsc --noEmit && npx eslint . --ext .ts,.tsx && npx prettier --check .
```

Attendu : **625 + 22 + 19 + 2 + 15 + 5 + 8 = 696 tests sur 55 suites** (les quatre suites
nouvelles étant `chat.spec.ts`, `chatStore.spec.ts`, `keyboard.spec.ts`, `chatPanel.spec.tsx`).
`tsc` propre ; `eslint` sans erreur nouvelle (l'avertissement de `src/i18n/index.ts:32` reste).

**Si le compte diffère, ne pas ajuster le nombre : trouver quel test manque.**

- [ ] **Step 7 : committer**

`feat(call): Open the meeting chat from the more menu`

- [ ] **Step 8 : éprouver par mutation**

Dix mutations :

1. dans `moreMenu.tsx`, supprimer `setVisible(false);` de `chat-btn`
2. dans `moreMenu.tsx`, `visible={unread > 0}` → `visible={true}`
3. dans `moreMenu.tsx`, `{unread}` → `{1}`
4. dans `moreMenu.tsx`, retirer `titleStyle={barStyles.menuTitle}` de `chat-btn`
5. dans `call.tsx`, supprimer `chatStore.markRead();` de `handleOpenChat`
6. dans `call.tsx`, `setNotice(ok ? null : 'chat.sendFailed');` →
   `if (!ok) setNotice('chat.sendFailed');` — le succès n'efface plus l'erreur d'un essai
   précédent
7. dans `call.tsx`, `return ok;` → `return true;` (la zone se vide même sur échec)
8. dans `call.tsx`, supprimer l'effet `useEffect(() => () => chatStore.dispose(), [chatStore]);`
9. dans `call.tsx`, `useState(() => createChatStore(...))` → `useMemo(() => createChatStore(...), [session])`
   — **mutation à surveiller** : elle peut **survivre**, parce qu'aucun test ne fait jeter un
   `useMemo` à React. Si elle survit, **ne pas fabriquer un test pour elle** : la noter ici comme
   non couverte, et laisser le commentaire du code porter la raison. C'est la même situation que
   le `useState(createCallSession)` de la ligne 160, qu'aucun test ne garde non plus.
10. dans `call.tsx`, `panel === 'participants' ? … : panel === 'chat' ? …` → intervertir les deux
    branches

---

## Ce que ce plan ne fait pas

Écrit, donc opposable. Une limite tue n'est pas un livrable.

- **Aucun historique de chat, nulle part.** Ni serveur, ni local, ni MMKV. Le fil naît avec la
  séance et meurt avec elle. **C'est dit à l'écran, en permanence** (§5.C1) — c'est la ligne
  `chat.notKept`, et elle est gardée par un test.
- **Aucun marqueur de trou après une reconnexion** (§5.C2). Les messages émis pendant la coupure
  sont perdus sans qu'on le signale ; le bandeau de reconnexion est visible pendant l'incident, et
  la ligne fixe cadre déjà l'ensemble. **Renversable** : le coût est une variante `kind` dans
  `ChatMessage`, donc une union que toutes les fonctions pures doivent traiter, plus une clé i18n.
- **Aucune écriture sur `lk-chat-topic`** (§5.C3). Sur tout serveur LiveKit ≥ 1.8.2 le paquet
  legacy porte `ignoreLegacy: true` et est jeté par tous les récepteurs. **Renversable en une
  ligne.** Ce qui le trancherait : la matrice de versions LiveKit des instances cibles, lisible au
  runtime par `room.serverInfo?.version` (`Room.d.ts:55`), non mesurée ici.
- **Aucune pièce jointe, ni envoi ni réception** (§5.C4). `OutgoingDataStreamManager` fait
  `file.stream().getReader()`, et le `Blob` de React Native n'implémente ni `stream()`, ni
  `arrayBuffer()`, ni `text()`. **Impossibilité de plateforme, pas choix de périmètre.**
- **Aucune émission d'édition ni de suppression** (§5.C5). Les éditions **reçues** sont traitées —
  c'est une exigence de correction, pas un confort : sans elle, un message de même `id` produit un
  doublon à l'écran.
- **Aucun abonnement à `RoomEvent.ChatMessage`** : ce n'est pas un signal réseau dans meet
  (§1.4, **[V]**). S'y abonner ne recevrait jamais rien.
- **Aucun son, aucune notification hors premier plan, aucun indicateur de frappe, aucun accusé de
  lecture, aucune réponse, aucune mention, aucune recherche** (§5.C7).
- **Aucune conversion de `MoreMenu` en panneau.** Les trois commandes livrées par D et par C1
  restent des `Menu.Item`. Voir l'arbitrage 1.
- **Aucun `InteractionPanel`**, et aucune prop réservée d'avance à C2 : `MoreMenuProps` et
  `ChatPanelProps` ne portent que ce que ce plan remplit.
- **Aucune réaction.** C'est C2, et rien de ce plan ne le prépare — le chat passe par `sendText`
  sur un topic, les réactions par `publishData` sans topic : **ce ne sont pas le même transport**.
- **Aucun réessai automatique.** Le SDK gère déjà la retransmission à l'intérieur d'un canal
  vivant, et rejouer au-dessus dupliquerait.
- **Aucun bouton `disabled`**, nulle part.

---

## Ce qu'aucun test de ce plan ne prouve

- **Les couleurs perçues.** RNTL ne rastérise rien : le contraste ne se mesure qu'en lisant le
  thème, le fond et le composant ensemble — ou sur un appareil. Les neuf ratios du tableau des
  contraintes globales sont **calculés depuis les valeurs de tokens**, pas relevés à l'écran. Les
  `toHaveStyle` prouvent seulement que la couleur explicite n'a pas été retirée.
- **Que le clavier tienne.** Aucun test de RNTL n'ouvre de clavier. `keyboardMode()` est gardée
  aux deux branches ; ce que `KeyboardAvoidingView` en fait **sur un appareil** ne l'est pas. C'est
  la première chose à regarder après la fusion, et sur les deux plateformes : iOS superpose,
  Android redimensionne.
- **Que la liste défile, ni qu'elle soit inversée à l'écran.** RNTL rend les cellules d'une
  `FlatList` mais ne fait pas de mise en page. L'ordre des `testID` dans l'arbre est observable ;
  ce qui apparaît en bas de l'écran ne l'est pas.
- **La largeur de la barre.** RNTL ne mesure rien. Les 357 dp sont de l'arithmétique sur des
  constantes ; ce plan n'y touche pas, mais la vérification sur un appareil de 360 dp reste due
  depuis le périmètre A — **et la pastille en fait désormais partie** : elle est hors flux, ce que
  seul un rendu réel confirme.
- **Que `readAll()` reconstitue un message multi-chunk.** §0.2 est une lecture d'implémentation,
  pas une exécution. `CHAT_MAX_LENGTH` nous garde de ce chemin **à l'émission** ; un message de
  plus de 15 000 octets **reçu** d'un client web l'emprunterait.
- **Que quoi que ce soit soit arrivé à quelqu'un d'autre.** Chaque test tient un seul bout du fil.
  Qu'un `sendText` soit lu, qu'une édition venue du web fusionne : **deux appareils sont la seule
  preuve**, et le simulateur iOS ne publie ni caméra ni micro (`AGENTS.md`) — donc au moins un des
  deux est un appareil réel.
- **Que le gestionnaire survive réellement à une reconnexion.** §2.2 est une lecture de
  `Room.ts:243` et `Room.ts:1566-1570`, jamais une exécution.

### Les quatre mesures à faire sur appareil

1. **Le clavier**, sur iOS et sur Android : la zone de saisie et le bouton « quitter » restent
   au-dessus de lui, dans les deux cas.
2. **La barre à 360 dp**, sept cibles plus la pastille : aucune coupée, aucune jointive, la
   pastille ne pousse rien.
3. **Un message entre un mobile et un client web**, dans les deux sens.
4. **Une édition depuis le web** — le seul moyen de prouver la règle d'`appendMessage` contre un
   émetteur réel.

---

## Ce qui reste ouvert, et ce qui le trancherait

Cinq points. **Aucun n'est inventé par ce plan** : chacun est un endroit où la conception ne
tranche pas, ou où une décision appartient au partenaire.

1. **La surface d'accueil.** `docs/superpowers/specs/2026-08-01-bottom-sheets-design.md` n'existe
   pas au moment d'écrire ce plan. La tâche 7 livre le panneau qui remplace la scène — la décision
   de §4.3, le patron de `ParticipantsPanel`, zéro dépendance nouvelle. **Ce qui le trancherait :**
   ce document, dont les clauses de clavier, de hauteur, de fermeture et de contraste sont à
   confronter au tableau de tête. Seule la tâche 7 est concernée.
2. **L'heure à côté du nom d'auteur.** §6.6 la mentionne dans un commentaire de code, §6.11 ne
   donne aucune clé pour la formater, et la conception ne choisit ni `Intl.DateTimeFormat` —
   disponibilité sous Hermes non vérifiée ici — ni `date-fns` avec ses sept paquets de locale, ni
   le fuseau que Jest devrait épingler pour qu'une assertion soit déterministe. **Ce qui le
   trancherait :** une décision sur le format et sur la source de localisation. Le coût est une
   fonction pure de plus, son test, et un fuseau fixé dans `jest.config.js`.
3. **Le marquage d'une édition à l'écran.** `ChatMessage.editedAt` est écrit par `appendMessage` et
   lu par aucun composant de ce plan. §5.C5 exige de **traiter** les éditions reçues — ce qui est
   une exigence de correction, satisfaite — mais aucune clause ne dit qu'une édition se **signale**.
   **Ce qui le trancherait :** une position produit. Le coût est une clé i18n et un conditionnel
   dans `ChatRow`.
4. **Les non-lus qui arrivent pendant que le panneau est ouvert.** §5.C19 dit « remis à zéro à
   l'ouverture du panneau, pas au défilement », et son motif porte sur le défilement. Appliquée à
   la lettre, un message reçu **pendant** que le panneau est ouvert compte comme non lu jusqu'à la
   prochaine ouverture : on referme, et la pastille annonce des messages qu'on vient de lire. **Ce
   plan applique §5.C19 à la lettre et signale la conséquence.** Le coût de la refermer est une
   ligne — `chatStore.markRead()` dans `handleCloseChat` —, et c'est une décision de conception,
   pas de plan.
5. **Faut-il livrer C3 du tout, avec zéro historique ?** §11 pose la question et y répond : « rien
   n'est irréversible, le retour est visible (l'écho local), le transport est vérifié. Le seul
   reproche possible est l'absence d'historique, et §5.C1 y répond par une ligne à l'écran plutôt
   que par un silence. **Ma position est donc : oui, livrable honnêtement.** » **Le partenaire a
   tranché : le chat sans historique est acceptable, et l'absence est mise à l'écran plutôt que
   tue.** Ce plan l'exécute. Reste ouvert, et appartient au partenaire : **persister le fil en
   MMKV pour la durée de la séance** (§5.C1, marqué renversable). `react-native-mmkv` est déjà une
   dépendance et n'est utilisé nulle part ici ; ce qui le trancherait est une position produit sur
   la conservation d'un fil de discussion **sur l'appareil, après la réunion**.

---

## Récapitulatif des commits

Sept tâches, sept commits, **chacun vert seul** : `npm test`, `npm run typecheck`, `npm run lint`
et `npm run format:check` passent à chaque étape de la séquence, jamais seulement à la fin.

| # | Sujet | Fichiers | Tests |
|---|---|---|---|
| 1 | `feat(call): Merge chat edits, count what is unread and bound the input` | `chat.ts`, `chat.spec.ts` | +22 |
| 2 | `feat(call): Carry the chat thread on a LiveKit text stream` | `chatStore.ts`, `chatStore.spec.ts` | +19 |
| 3 | `feat(i18n): Translate the in-meeting chat strings in seven locales` | 7 × `locales/*.json` | +0 |
| 4 | `feat(ui): Tell the two platforms apart for keyboard avoidance` | `keyboard.ts`, `keyboard.spec.ts` | +2 |
| 5 | `feat(call): Read and write the meeting chat in its own panel` | `chatPanel.tsx`, `chatPanel.spec.tsx` | +15 |
| 6 | `test(call): Let the Room double carry a text stream` | `call.spec.tsx` | **+0, et c'est la preuve** |
| 7 | `feat(call): Open the meeting chat from the more menu` | `controlBar.ts`, `moreMenu.tsx(+spec)`, `call.tsx(+spec)` | +13 |

**Total attendu : 696 tests / 55 suites**, contre 625 / 51 mesurés sur `design/chat` à `603f91a`.

**Le seul commit qui touche plus d'un composant est le septième**, et il le doit à une raison
nommée : `MoreMenuProps` gagne deux props requises, et `call.tsx` en est le seul constructeur.
Les six autres ne franchissent aucune frontière de fichier qu'ils ne referment pas eux-mêmes.
