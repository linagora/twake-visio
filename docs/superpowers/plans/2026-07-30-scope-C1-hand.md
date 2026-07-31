# Sous-périmètre C1 — Le socle d'interaction et la main levée : plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les
> étapes utilisent des cases à cocher (`- [ ]`).

**But :** en séance, demander la parole fonctionne de bout en bout. On lève la main, **tout le
monde la voit**, l'ordre de la file est celui du serveur, un arrivant tardif voit l'état
immédiatement, une reconnexion ne perd rien, et on la baisse **en un seul appui** sans rien
ouvrir.

**Architecture :** un module **pur** qui lit l'attribut, trie la file et calcule une position
(`src/call/hands.ts`) ; un module d'API d'**une seule fonction**, qui fait son propre `fetch`
parce que le client HTTP du dépôt ne peut structurellement pas porter son jeton
(`src/api/hand.ts`) ; deux lignes ajoutées à la frontière du SDK déjà existante
(`src/call/participants.ts`, `src/call/layout.ts`) ; et deux coquilles qui reçoivent leur état
sans rien calculer (`handControl.tsx`, `handBanner.tsx`). La frontière est celle des périmètres
A, B et D : la décision dans un module pur et testable, la coquille aussi bête que possible.

**Socle technique :** TypeScript strict (`noUncheckedIndexedAccess`), React Native 0.86, Expo
SDK 57, `react-native-paper` 5.15.3, `livekit-client` 2.18.0, Jest +
`@testing-library/react-native` 14.

**Source :** `docs/superpowers/specs/2026-07-30-scope-C-interaction-design.md`, dont ce plan ne
livre que le sous-périmètre **C1** (§11). Les renvois `§n` y renvoient. Le rapport de terrain
sous-jacent est `.superpowers/sdd/2026-07-30-scope-C-interaction.md`, **ignoré par git** : tous
les faits dont l'implémentation dépend sont recopiés ici, qui se suffit à lui-même.

**Ce plan a été prototypé et exécuté avant d'être écrit, câblage d'écran compris.** Les deux
modules, leurs specs, les deux coquilles, leurs specs, les modifications de
`participants.ts` / `layout.ts` / `moreMenu.tsx` / `call.tsx` et de leurs quatre specs, et les
sept locales ont été écrits dans ce worktree, lancés, puis supprimés. Résultat mesuré :

- **605 tests verts** sur 50 suites — mesuré : **546 tests / 46 suites** sur la branche propre,
  donc **59 tests et 4 fichiers de spec ajoutés** ;
- `npx tsc --noEmit` propre ; `npx eslint . --ext .ts,.tsx` sans erreur nouvelle (le seul
  avertissement est celui, pré-existant, de `src/i18n/index.ts:32`) ; `npx prettier --check .`
  vert ;
- **32 mutations éprouvées, 32 rouges** — la liste est en fin de document.

Le code littéral de ce plan est **celui qui a tourné**, passé au format Prettier du dépôt. Ce
qui n'a pas été prototypé est nommé en fin de document.

---

## L'arbitrage de tête : la place dans la barre. **C1 ne construit pas de panneau.**

La conception a été écrite le même soir que celle du périmètre D, **avant que D ne soit
implémenté**. Elle décrit (§4.3) un état du code qui n'existe plus. Voici l'état mesuré sur
cette branche, rebasée sur `main` qui porte B, A et D :

| Ce que §4.3 suppose | Ce que `main` porte aujourd'hui |
|---|---|
| `share-btn` est un `IconButton` **dans la barre** | `share-btn` est un `Menu.Item` **dans `MoreMenu`** (`moreMenu.tsx:66-76`) |
| C doit créer un `more-toggle` à sa place | `more-btn` **existe déjà** (`moreMenu.tsx:54-63`), icône `dots-vertical` |
| C doit inventer la surface de dépassement | `MoreMenu` **est** cette surface, et porte déjà deux commandes |
| Cette surface est un **panneau qui remplace la scène** | C'est un **`Menu`** de Paper — décision du périmètre D, donc du partenaire |
| §4.5 : « le contrôle d'enregistrement doit vivre dans le panneau `plus` » | Il y vit déjà (`recordingControl.tsx`, un `Menu.Item`) |

**La décision de ce plan : C1 garde le `Menu` de D. La main levée y entre comme troisième
entrée, et la file des mains levées comme bloc en lecture seule sous elle. Aucun panneau n'est
créé.**

### Pourquoi, en quatre raisons mesurées

**1. L'arithmétique de la barre est intacte et ce plan n'y touche pas d'un dp.**
`controlBar.ts:12` porte le calcul, vérifié ligne à ligne dans `call.tsx:637-711` : sept cibles
— `mic-toggle`, `camera-toggle`, `camera-menu-btn`, `audio-output-btn`, `more-btn`,
`participants-toggle`, `leave-btn` —

```
7 × 44 + 1 (paire caméra) + 5 × 8 (entre groupes) + 2 × 4 (marge de rangée) = 357 dp
```

sur un écran de 360 dp. Une huitième cible en demanderait `8 × 44 + 1 + 6 × 8 + 2 × 4 = 409 dp`,
soit **49 dp de trop**. Et il n'y a rien à gratter : 40 dp de cible donnerait 377 dp, toujours
hors budget et sous le minimum de 44 dp qu'Apple recommande et que A a déjà consenti à la place
des 48 dp de Material ; un écart nul donnerait 361 dp, avec des zones tactiles jointives.
**Ce plan n'ajoute aucune cible à la rangée.** Il ajoute une entrée dans un menu qui existe.

**2. Pour une commande unique, le menu est meilleur que le panneau, et l'écart est d'un geste.**
Menu : `plus` → `Lever la main` → le menu se referme, la vidéo n'a jamais disparu. Panneau :
`plus` → la scène disparaît → `Lever la main` → un troisième appui pour retrouver la vidéo.
Sur un écran dont la vidéo est la raison d'être (`call.tsx:609-612`, argument que B invoque déjà
pour refuser d'empiler les bandeaux), perdre la scène pour un seul appui est une régression.

**3. Convertir le `Menu` en panneau renverserait une décision du partenaire, pour rien.**
D a mesuré la même arithmétique, a choisi un menu, l'a livré avec ses tests, et y a **déplacé
le partage du lien** — un coût produit assumé (« partager passe d'un appui à deux »). Un
sous-périmètre dont le livrable est *un bouton et une liste* n'a pas à réécrire trois composants
et trois specs fraîchement fusionnés pour changer la forme d'une surface qui marche. §4.3 avait
raison **contre la barre de six boutons qu'elle voyait** ; elle n'a pas d'avis sur le menu de D,
qu'elle ne connaissait pas.

**4. La file des mains levées tient dans un `Menu` — et le précédent est dans ce dépôt.**
`Menu` de Paper accepte des enfants quelconques, pas seulement des `Menu.Item`
(`node_modules/react-native-paper/src/components/Menu/Menu.tsx:194`, `{children}` rendu tel
quel), et **enveloppe son contenu dans un `ScrollView` dès qu'il dépasse la fenêtre**
(`:687-693`, `scrollableMenuHeight`). Le précédent exact est `audioOutputControl.tsx:76-85` :
un `<View>` portant un `<Text>` non pressable, au milieu de `Menu.Item`s. La file est donc un
bloc de `Text` sous la commande, exactement « dans le conteneur *plus* » comme le veut §5.C16 —
même conteneur, autre forme.

### Ce que ça coûte, nommé

| Ce qui est perdu | Mesure |
|---|---|
| **La file n'est visible que menu ouvert.** | Deux appuis pour la consulter. C'est déjà ce que §5.C16 demandait (« dans le panneau `plus` »), à la forme près. |
| **La commande n'a pas d'état `loading`.** | Un `Menu.Item` n'en a pas. Voir E3 : pendant l'appel en vol la commande **n'est pas rendue**, comme `RecordingControl` le fait déjà. |
| **Le menu se referme sur l'appui.** | On ne voit donc pas le libellé basculer sous le doigt. Le retour, c'est le **bandeau** qui apparaît hors du menu — et c'est l'information juste, puisqu'elle vient de l'attribut. |

### Ce que ça coûte à C2 et C3 — et il faut le lire avant de commencer C2

**C2 (réactions) : le menu suffit, à un détail près.** Huit cibles de 44 dp en `flexWrap` sont
un `<View>` enfant de `Menu`, comme la file de C1 — la même mécanique, le même précédent. Deux
différences à trancher par C2, pas par C1 : la largeur du contenu d'un `Menu` est **intrinsèque**
(il faudra poser une largeur explicite pour obtenir 4 emoji par rangée), et les boutons d'emoji
n'étant pas des `Menu.Item`, **le menu ne se refermera pas tout seul** — ce qui est plutôt un
avantage : on peut en envoyer plusieurs. **C2 peut donc être livré sans panneau.**

**C3 (chat) : le menu ne suffit pas, et c'est C3 qui paiera la conversion.** Un `Menu` de Paper
monte son contenu dans un `Portal` absolument positionné, se ferme sur tout appui extérieur, et
n'a nulle part où mettre un clavier. Un fil qu'on lit, une zone de saisie et une `FlatList` n'y
vivent pas. **C3 devra donc convertir `MoreMenu` en `InteractionPanel`** — `more-btn` devient une
bascule de panneau, et les trois `Menu.Item` (`share-btn`, `recording-toggle`, `hand-toggle`)
deviennent trois lignes de panneau.

**Coût chiffré de cette conversion, tel qu'il sera au moment de C3** : 3 composants
(`moreMenu.tsx`, `recordingControl.tsx`, `handControl.tsx`) + 3 specs, plus l'état `panel` qui
remplace `participantsOpen` dans `call.tsx`, plus les assertions de `call.spec.tsx` qui ouvrent
le menu avant d'appuyer (**14 occurrences** de `getByTestId('more-btn')` après ce plan, contre 6
avant).

**Et C1 rend cette conversion moins chère, pas plus.** Après ce plan, les trois entrées du menu
ont **exactement la même forme** — un `Menu.Item` avec `titleStyle`, `rippleColor`,
`accessibilityLabel`, et un `setVisible(false)` avant son rappel. La conversion est un
remplacement uniforme, pas trois cas particuliers. Si C1 avait construit le panneau, il aurait
payé la même conversion **plus** l'invention d'un contenant dont il n'aurait rempli qu'un
huitième — et C3 l'aurait de toute façon retouché pour y loger le clavier.

**Ce qui renverserait cet arbitrage :** une décision produit selon laquelle la file des mains
levées doit être visible sans ouvrir quoi que ce soit. Elle demanderait alors sa propre bande
au-dessus de la scène, pas un panneau — et c'est un changement de C1, à faire avant C2.

---

## Écarts assumés avec la conception

Six points où ce plan ajoute à la conception, ou la corrige. Chacun est mesuré ici, sur cette
branche.

**E1 — Pas d'`InteractionPanel`, pas de `more-toggle`, pas de déplacement de `share-btn`.**
Voir l'arbitrage ci-dessus. §11.C1 liste « le remaniement de barre (`share-btn` → panneau,
`more-toggle` à sa place) ; `InteractionPanel` avec Partager le lien, le bouton Lever/Baisser et
la file des mains » : **la première moitié est déjà faite par D**, et la seconde devient
`HandControl` dans `MoreMenu`. Le `testID` `more-toggle` de §6.9 **n'existe pas** ; celui de D
s'appelle `more-btn`, et rien ne le renomme.

**E2 — Le point de contact avec D est sans objet : la `Snackbar` s'appelle déjà `notice`.**
§6.9 prévoit que D renomme `moderationError` en `actionError` et `moderation-error` en
`action-error`, et dit que C adoptera les nouveaux noms si D fusionne d'abord. Sur cette branche
la case s'appelle **déjà** `notice` / `setNotice` (`call.tsx:220`) et son `testID` est **déjà**
`call-notice` (`call.tsx:717`) — renommée par le périmètre A pour servir plusieurs commandes.
**Zéro renommage, zéro assertion touchée.** `MessageKey` gagne une seule variante.

**E3 — `loading` de §5.C17 n'existe pas sur un `Menu.Item` ; ce plan masque, comme D.**
§5.C17 demande « pendant la requête, le bouton est `loading`, jamais `disabled` », et son motif
est correct : `IconButton/utils.ts:88-93` teste `disabled` **avant** `customIconColor` et rend
`theme.colors.onSurfaceDisabled`, quasi-noir en schéma clair sur un fond forcé sombre.
`getMenuItemColor` fait de même pour un `Menu.Item`. Mais `Menu.Item` **n'a pas de prop
`loading`** : il n'y a rien à mettre en rotation.

Ce plan applique donc la règle d'`AGENTS.md` telle qu'elle est écrite — « ce qui n'est pas
actionnable n'est pas rendu » — et le précédent livré par D dans le même menu
(`recordingControl.tsx:37`, `if (busy) return null;`). **La moitié essentielle de C17 est
conservée intacte** : l'état du bouton suit l'attribut, jamais l'appui.

**E4 — Sept clés, pas six ; et deux de la liste de §6.11 n'étaient pas des ajouts.**
§6.11 annonce « C1 — 6 clés » et y compte `call.more`, **qui existe déjà** (`en.json:34`, posée
par D). Le repli sur `call.unnamedParticipant` existe aussi (`en.json:49`). En revanche §6.11
oublie deux clés dont l'écran a besoin : le **gabarit d'une ligne de file** (`{{position}}. {{name}}`,
sans quoi le numéro serait un littéral concaténé dans le composant — un texte non traduisible) et
le **rang affiché dans le bandeau** (`call.handPosition`), qui est la seule consommatrice de
`handPosition()` — fonction que §6.1 exporte et dont §11.C1 ne dit pas qui l'appelle. Total réel :
**7 clés nouvelles × 7 locales = 49 entrées**.

**E5 — La position est affichée dans le bandeau, pas seulement dans la file.**
§5.C16 met « la position dans la file, à côté de chaque nom » dans le panneau. Ce plan le fait
(tâche 5) **et** affiche son propre rang dans le bandeau (tâche 6). Motif : la file n'est visible
que menu ouvert (coût nommé ci-dessus), et l'information « à quel rang suis-je » est précisément
celle qu'on veut sans ouvrir quoi que ce soit. Elle est déjà calculée ; ne pas l'afficher
jetterait la seule information que le contrat serveur existe pour fournir.

**E6 — Le double de `Room` de `call.spec.tsx` devient un vrai émetteur. C'est un prérequis, pas
un confort.**
`call.spec.tsx:148-149` porte `on: () => mockRoom, off: () => mockRoom` — des inertes. Avec eux,
**aucun test de l'écran ne peut distinguer une vue relue d'une vue figée au montage**, et le
scénario central de C1 — le `200` n'affiche rien, c'est l'attribut qui, deux sauts plus tard,
fait apparaître le bandeau (§7.1) — serait intestable. La tâche 8 remplace ces deux inertes par
un enregistrement par nom d'événement, sur le modèle exact du `RoomProbe` de
`participants.spec.ts:60-89`. **Vérifié : les 68 tests existants de `call.spec.tsx` passent sans
modification après ce changement.**

---

## Contraintes globales

- `@testing-library/react-native` 14 est **asynchrone** : `await render(...)`,
  `await fireEvent.press(...)`, `await view.rerender(...)`, `await view.unmount()`. Sans `await`,
  `screen` reste non lié et la requête suivante lève ``render` function has not been called``.
  `tsc` ne le voit pas : une promesse non attendue est une expression valide.
- Les écrans vivent dans `src/screens/`, jamais sous `app/` : `require.context` d'expo-router
  balaie tout `.tsx` du dossier et ferait entrer les tests dans le bundle.
- Exports **nommés** uniquement. `export default` n'est toléré que dans les fichiers de route
  sous `app/`. Aucun `enum` : unions de chaînes.
- Aucun style en ligne : `StyleSheet.create` alimenté par `src/ui/tokens`, ou les styles
  partagés de `src/screens/room/controlBar.ts`.
- Aucune chaîne visible en dur. Sept locales (`en fr es it de vi ru`), **toutes remplies** ;
  `src/i18n/index.spec.ts` échoue si une clé manque quelque part. Il passe en revanche sur une
  clé présente partout et remplie d'anglais recopié : les sept sont **traduites**, pas dupliquées.
- `react-hooks/set-state-in-effect` est une **erreur**, pas un avertissement : une garde qui pose
  un état passe par l'initialiseur paresseux du `useState`.
- Barre de qualité : `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`
  verts. Le lint a un avertissement pré-existant sur `src/i18n/index.ts:32` : le laisser.
- Commits atomiques, Conventional Commits, jamais de `--no-verify`. Sujet à la forme phrase
  autorisée (le dépôt surcharge `subject-case`).
- Chaque test ajouté doit être **éprouvé par mutation** : casser la règle qu'il prétend garder,
  constater le rouge, restaurer. Un test qui passe dans les deux cas ne garde rien. Chaque tâche
  nomme la sienne ; la liste complète est en fin de document.
- **Pour tout test qui vérifie qu'une valeur remonte : installer au moins deux éléments
  distincts, et viser le second.** Avec un seul, « transmet ce qu'on lui donne » et « rend
  toujours la même valeur en dur » sont indiscernables. **Et quand deux entrées sont sœurs
  — deux `Menu.Item` voisins, deux fonctions du même module, deux sens d'une même bascule —
  éprouver les deux.** C'est là que le piège s'est logé le plus souvent sur B, A et D.
- **Jamais `npm install`, `npm ci` ni `npm add` dans ce worktree.** `node_modules` y est partagé
  avec l'arbre principal (`/Users/mmaudet/work/twake-visio/node_modules`) : une installation
  écrirait dans l'arbre partagé et casserait les autres worktrees. **Ce périmètre n'ajoute
  aucune dépendance** : `livekit-client` 2.18.0 porte déjà les deux membres utilisés
  (`RoomEvent.ParticipantAttributesChanged`, `dist/src/room/events.d.ts:180` ;
  `Participant.attributes`, `dist/src/room/participant/Participant.d.ts:60`).

### La couleur : voir `AGENTS.md`, et rien d'autre

La règle générale — pourquoi cet écran est sombre dans les deux schémas alors que le thème Paper
suit le schéma système, quelles props doivent porter une couleur explicite, pourquoi aucun bouton
n'est `disabled`, et ce qu'un test peut ou ne peut pas en prouver — vit dans **`AGENTS.md`,
section « Le fond de la séance est sombre dans les deux schémas. Paper ne le sait pas. »**. Elle a
été corrigée cinq fois pendant l'exécution des périmètres A et D. **La lire là, jamais dans une
copie** : une copie divergerait à la sixième correction.

Ce qui est **spécifique aux composants de ce plan**, et qui ne se trouve pas dans `AGENTS.md` :

| Élément livré ici | Prop | Valeur | Fond | Ratio **recalculé** |
|---|---|---|---|---|
| `hand-toggle` (un `Menu.Item`) | `titleStyle` | `barStyles.menuTitle` (`textDark` `#ECECEC`) | `surfaceDark` `#121212` | **15,86:1** |
| `hand-toggle` | `rippleColor` | `BAR_RIPPLE_COLOR` | — | affordance, pas lisibilité |
| `hand-queue-title` et chaque `hand-queue-row-*` | `style` | `barStyles.menuNote` (`textDark`) | `surfaceDark` | **15,86:1** |
| `hand-banner-text`, `hand-banner-position` | `style` → `color` | `tokens.color.textDark` | `backgroundDark` `#0B0B0C` | **16,65:1** |
| `hand-lower` (`Button mode="text"`) | `textColor` | `tokens.color.primaryDark` `#4D9AFF` | `backgroundDark` | **6,92:1** |

Les cinq ratios ont été **recalculés** pour ce plan depuis les valeurs de `src/ui/tokens`, pas
recopiés : `16,65:1` et `15,86:1` reproduisent au centième les valeurs de `controlBar.ts:22` et
`:48`. Deux repoussoirs, recalculés eux aussi : `tokens.color.muted` (`#6B7280`) donne **4,07:1**
sur `backgroundDark` et **3,88:1** sur `surfaceDark`, **sous** le seuil AA de 4,5:1 dans les deux
cas — il ne s'utilise nulle part ici, la hiérarchie se fait par `variant="labelSmall"` ; et
`tokens.color.primaryLight` (`#0057B8`), le repli de `theme.colors.primary` en schéma clair,
donne **2,86:1** sur `backgroundDark`, ce qui est exactement le défaut que `hand-lower` évite en
posant `textColor`.

**La bande de bandeaux est le fond `backgroundDark` de `styles.root`, pas une surface propre.**
`HandBanner` ne pose **aucun** `backgroundColor` : c'est le choix de `RecordingIndicator`
(`recordingIndicator.tsx:14`, `root` sans fond) et non celui de `WaitingBanner`
(`waitingBanner.tsx:13`, `surfaceDark`). Les deux sont corrects, mais **le ratio dépend de ce
choix** : sur `backgroundDark` c'est 16,65:1, sur `surfaceDark` ce serait 15,86:1. Poser un fond
sans en tirer les conséquences sur le texte est le pire des trois cas (`AGENTS.md`).

### `ApiResult` : un échec ordinaire est une VALEUR, jamais un rejet

`ApiResult<T>` est `{ ok: true; value: T } | { ok: false; error: ApiError }`
(`src/api/types.ts:18`). Un 401, un 403, un 404, un 500 arrivent **résolus**, pas rejetés. Le
périmètre B a livré **deux** bogues sur ce point exact, et D a failli en livrer un troisième ; le
commentaire de `call.tsx:503-510` en garde la trace.

**Toute lecture d'un résultat d'API de ce plan passe par `result.ok`**, avec un `.catch()`
**séparé** pour l'exception inattendue. Il y a exactement **un** gestionnaire concerné
(`handleToggleHand`, tâche 8) et il est écrit en toutes lettres. Et `toggleHand` elle-même
(tâche 2) **ne rejette jamais** : un `fetch` qui lève est capturé et rendu
`{ ok: false, error: { kind: 'network' } }`.

### La place dans la barre est un invariant, pas une préférence

Voir l'arbitrage de tête. **Aucune tâche de ce plan ne rend une huitième cible dans
`styles.controls`.** Le commentaire d'arithmétique de `controlBar.ts:5-15` reste vrai mot pour
mot après ce plan, et aucune géométrie ne bouge. Une commande de plus passe par `MoreMenu` ; il
n'y a pas d'autre voie.

### Les deux obstacles d'état du code, et où chacun est payé

Ce sont les deux raisons pour lesquelles C1 vient en premier (§11.C1).

**Obstacle (b) — `authedFetch` écrase tout en-tête `authorization`.** `src/api/client.ts:68-72` :

```ts
headers: {
  ...(init?.headers as Record<string, string> | undefined),
  accept: 'application/json',
  authorization: `Bearer ${token}`,
},
```

`authorization` est étalé **en dernier** : un en-tête passé par `init.headers` est silencieusement
écrasé. Et `token` vient exclusivement de `getAccessToken(account.id, account.instance)` (`:76`),
c'est-à-dire de l'access token **OIDC**. Il n'existe ni paramètre, ni option, ni surcharge. Pire,
sur `401` `authedFetch` appelle `forceRefresh(...)` puis rejoue (`:86-94`) — pour un endpoint
authentifié par JWT LiveKit, un `401` signifie que le **jeton de salle** est invalide, et le
rafraîchissement OIDC consommerait un aller-retour SSO pour renvoyer exactement le même en-tête
erroné. **Payé par la tâche 2**, qui fait son propre `fetch`.

**Obstacle (c) — `ParticipantAttributesChanged` n'est écouté nulle part, et les attributs ne
sont pas projetés.** `src/call/participants.ts:17-31` déclare `ROOM_VIEW_EVENTS` — treize
`RoomEvent`, et celui-là n'y est pas. `readParticipant()` (`:47-58`) projette `identity, name,
isLocal, isSpeaking, lastSpokeAt, joinedAt, camera` — ni `attributes`, ni `metadata`. La main
levée vivant dans un attribut participant, **rien de l'état actuel ne la verrait passer.**
**Payé par les tâches 1 et 3**, en deux lignes dans le module qui est déjà la frontière du SDK.

Piège nommé, à ne pas se faire prendre : sur l'émetteur *participant-scoped* l'événement
s'appelle `attributesChanged` (`Participant.d.ts:137`) ; au niveau `Room` il s'appelle
`participantAttributesChanged` (`Room.d.ts:309`, `events.d.ts:180`) et **le participant local y
est inclus**. C'est la forme `Room` que nous utilisons, et c'est cette inclusion qui rend le flux
de §7.1 possible.

### Toute spec qui ouvre un `Menu` de Paper — la recette, une seule fois

`Menu.tsx` monte son contenu dans un `<Portal>`, qui jette sans `Provider` ancêtre. Et avec un
`PaperProvider` nu, l'ouverture est **instable** sous Jest (mesuré par le périmètre A : 39
ouvertures sur 40). La recette est **déjà en tête** de `call.spec.tsx:43-63` et de
`moreMenu.spec.tsx:13-32` ; les tâches 7 et 8 s'y branchent sans la réécrire :

```tsx
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

async function settleMenus(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}
```

et, après l'appui qui ouvre, **toujours** un `waitFor` : le contenu du `Portal` n'est jamais
présent au retour synchrone de `fireEvent.press`. `HandControl` rendu **seul** (tâche 5) n'a
besoin de rien de tout cela : un `Menu.Item` hors `Menu` se monte sans `Portal` — c'est ce que
fait déjà `recordingControl.spec.tsx`.

### Le mock de traduction : deux clés de ce plan interpolent

`call.handQueueEntry` et `call.handPosition` portent des variables. Le mock habituel du dépôt
(`t: (key) => key`) **les rendrait invisibles**, et un numéro codé en dur dans une coquille serait
indiscernable de celui que l'écran calcule — c'est exactement la classe de défaut « le texte
affiché n'est jamais asserté ». Les specs de `handControl`, `handBanner` et `call` utilisent donc :

```tsx
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}|${JSON.stringify(values)}`,
  }),
}));
```

**Vérifié : passer `call.spec.tsx` de l'ancien mock à celui-ci ne casse aucune de ses 68
assertions existantes** — aucune n'observe une clé interpolée.

Et un piège de matcher, mesuré : **`toHaveTextContent` compare la chaîne ENTIÈRE** quand on lui
passe une chaîne. `toHaveTextContent('"name":"Bob"')` échoue sur un contenu
`call.handQueueEntry|{"position":1,"name":"Bob"}`. Pour chercher un fragment, il faut une
expression régulière : `toHaveTextContent(/"name":"Bob"/)`.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/call/hands.ts` | **pur** : lit l'attribut, trie la file, calcule une position. Ni réseau, ni SDK, ni React |
| `src/call/hands.spec.ts` | les quatre fonctions ligne à ligne, éprouvées par mutation |
| `src/api/hand.ts` | l'unique endpoint à jeton LiveKit, son propre `fetch`, aucun rafraîchissement OIDC |
| `src/api/hand.spec.ts` | en-tête, corps, chemin, table de statuts, et **la preuve que l'OIDC n'est jamais touché** |
| `src/call/layout.ts` (modifié) | `ParticipantView` gagne `handRaisedAt: string \| null` |
| `src/call/layout.spec.ts` (modifié) | son `person()` gagne le champ |
| `src/call/participants.ts` (modifié) | `ROOM_VIEW_EVENTS` gagne un quatorzième événement ; `readParticipant` projette le champ |
| `src/call/participants.spec.ts` (modifié) | la projection, l'événement dans la liste, la relecture sur l'événement |
| les sept `src/i18n/locales/*.json` (modifiés) | **7 clés**, réellement traduites |
| `src/screens/room/handControl.tsx` | coquille : la commande **et** la file, dans le menu « plus » |
| `src/screens/room/handControl.spec.tsx` | les deux sens de la bascule, l'absence pendant l'appel, la numérotation |
| `src/screens/room/handBanner.tsx` | coquille : « votre main est levée » + rang + baisser en un appui |
| `src/screens/room/handBanner.spec.tsx` | le rendu conditionnel, le rang, le rang inconnu, les couleurs |
| `src/screens/room/moreMenu.tsx` (modifié) | accueille `HandControl` en troisième entrée |
| `src/screens/room/moreMenu.spec.tsx` (modifié) | composition et **fermeture du menu sur la troisième entrée aussi** |
| `src/screens/room/call.tsx` (modifié) | dérivation, garde, un gestionnaire, le bandeau, quatre props |
| `src/screens/room/call.spec.tsx` (modifié) | le double de `Room` devient un émetteur ; le câblage de bout en bout |

---

### Task 1 : le module pur — l'attribut, la file, la position

**Files:**
- Create: `src/call/hands.ts`
- Test: `src/call/hands.spec.ts`

**Interfaces:**
- Consumes :
  - `type ParticipantView` et `type RoomView` de `src/call/layout` — **en `import type` seulement**.
    Au moment d'écrire cette tâche, `ParticipantView` **ne porte pas encore** `handRaisedAt` : la
    tâche 3 l'ajoute. Écrire les deux dans le même commit, ou écrire la tâche 3 d'abord ; l'ordre
    retenu ici est 1 puis 3, et le `tsc` n'est vert qu'à la fin de la 3.
    Rappel de la forme courante (`src/call/layout.ts:18-32`) :
    ```ts
    export type ParticipantView = {
      readonly identity: string;
      readonly name: string;
      readonly isLocal: boolean;
      readonly isSpeaking: boolean;
      readonly lastSpokeAt: number | null;
      readonly joinedAt: number | null;
      readonly camera: CameraTrack | null;
      // ajouté par la tâche 3 :
      readonly handRaisedAt: string | null;
    };
    export type RoomView = {
      readonly local: ParticipantView;
      readonly remotes: readonly ParticipantView[];
    };
    ```
- Produces :
  - `const HAND_ATTRIBUTE: 'handRaisedAt'`
  - `type RaisedHand = { readonly identity: string; readonly name: string; readonly raisedAt: number; readonly isLocal: boolean }`
  - `readHandRaisedAt(attributes: Readonly<Record<string, string>> | undefined): string | null`
  - `isHandRaised(participant: ParticipantView): boolean`
  - `raisedHands(view: RoomView): readonly RaisedHand[]`
  - `handPosition(hands: readonly RaisedHand[], identity: string): number | null`

Le contrat backend, verbatim (`viewsets.py:880-883`) : *« LiveKit uses the handRaisedAt
participant attribute to signal hand state. An empty string means the hand is lowered; a
non-empty ISO 8601 timestamp means the hand is raised. The timestamp is used by clients to
determine the order in which participants raised their hands. »* Trois états, deux lectures :
horodatage = levée ; **chaîne vide** = baissée ; **clé absente** = jamais levée. Les deux derniers
sont indiscernables à l'écran, donc `null` tous les deux.

Le `| undefined` de `readHandRaisedAt` n'est **pas** une précaution contre le SDK :
`Participant.attributes` est un getter qui rend toujours un objet
(`Participant.d.ts:60`). Il est là parce que **tous les doubles de `Participant` du dépôt sont
écrits à la main** derrière un `as unknown as Participant` (`participants.spec.ts:22-31`,
`call.spec.tsx:89-97`) : une projection qui jetterait sur un double incomplet transformerait
l'ajout d'un champ en panne de toute la suite. C'est la même défense que `participant.name ?? ''`
et `lastSpokeAt?.getTime() ?? null` juste à côté.

`raisedHands` prend une `RoomView` et non un tableau : **le participant local est dans la file au
même titre que les autres**, et prendre la vue entière rend cette inclusion *structurelle* plutôt
que dépendante d'un appelant qui penserait à l'ajouter. Deux règles de tri, celles du web (§3.5) :
horodatage croissant, puis `identity.localeCompare` pour départager. Et un horodatage que
`Date.parse` rend `NaN` est **ignoré** : un serveur qui écrirait n'importe quoi ne doit pas
décider qui parle.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/call/hands.spec.ts`, en entier :

```ts
import { handPosition, isHandRaised, raisedHands, readHandRaisedAt } from 'src/call/hands';
import type { ParticipantView, RoomView } from 'src/call/layout';

function person(
  identity: string,
  handRaisedAt: string | null,
  options: { name?: string; isLocal?: boolean } = {},
): ParticipantView {
  return {
    identity,
    name: options.name ?? identity,
    isLocal: options.isLocal ?? false,
    isSpeaking: false,
    lastSpokeAt: null,
    joinedAt: null,
    camera: null,
    handRaisedAt,
  };
}

function view(local: ParticipantView, remotes: readonly ParticipantView[]): RoomView {
  return { local, remotes };
}

describe('readHandRaisedAt', () => {
  it('lit un horodatage', () => {
    expect(readHandRaisedAt({ handRaisedAt: '2026-07-30T10:00:00Z' })).toBe('2026-07-30T10:00:00Z');
  });

  it('lit la chaîne vide comme une main baissée', () => {
    expect(readHandRaisedAt({ handRaisedAt: '' })).toBeNull();
  });

  it('lit une clé absente comme une main baissée', () => {
    expect(readHandRaisedAt({ color: '#fff' })).toBeNull();
  });

  it('tolère une carte absente', () => {
    expect(readHandRaisedAt(undefined)).toBeNull();
  });

  it('ne lit aucun autre attribut que celui de la main', () => {
    expect(readHandRaisedAt({ room_role: '2026-07-30T10:00:00Z' })).toBeNull();
  });
});

describe('isHandRaised', () => {
  it('suit le champ projeté', () => {
    expect(isHandRaised(person('a', '2026-07-30T10:00:00Z'))).toBe(true);
    expect(isHandRaised(person('a', null))).toBe(false);
  });
});

describe('raisedHands', () => {
  it('trie par horodatage croissant', () => {
    const hands = raisedHands(
      view(person('me', null, { isLocal: true }), [
        person('b', '2026-07-30T10:00:02Z'),
        person('a', '2026-07-30T10:00:01Z'),
      ]),
    );

    expect(hands.map((hand) => hand.identity)).toEqual(['a', 'b']);
  });

  it("inclut le participant local à sa place dans l'ordre", () => {
    const hands = raisedHands(
      view(person('me', '2026-07-30T10:00:02Z', { isLocal: true }), [
        person('a', '2026-07-30T10:00:01Z'),
        person('z', '2026-07-30T10:00:03Z'),
      ]),
    );

    expect(hands.map((hand) => hand.identity)).toEqual(['a', 'me', 'z']);
    expect(hands.map((hand) => hand.isLocal)).toEqual([false, true, false]);
  });

  it("départage deux horodatages égaux par l'identité", () => {
    const hands = raisedHands(
      view(person('me', null, { isLocal: true }), [
        person('zoe', '2026-07-30T10:00:00Z'),
        person('ada', '2026-07-30T10:00:00Z'),
      ]),
    );

    expect(hands.map((hand) => hand.identity)).toEqual(['ada', 'zoe']);
  });

  it('reporte le nom de chaque participant, pas son identité', () => {
    const hands = raisedHands(
      view(person('me', null, { isLocal: true }), [
        person('u-1', '2026-07-30T10:00:01Z', { name: 'Ada' }),
        person('u-2', '2026-07-30T10:00:02Z', { name: 'Bob' }),
      ]),
    );

    expect(hands.map((hand) => hand.name)).toEqual(['Ada', 'Bob']);
  });

  it('ignore un horodatage que Date.parse ne sait pas lire', () => {
    const hands = raisedHands(
      view(person('me', null, { isLocal: true }), [
        person('a', 'pas une date'),
        person('b', '2026-07-30T10:00:01Z'),
      ]),
    );

    expect(hands.map((hand) => hand.identity)).toEqual(['b']);
  });

  it('rend une file vide quand personne ne lève la main', () => {
    expect(raisedHands(view(person('me', null, { isLocal: true }), [person('a', null)]))).toEqual(
      [],
    );
  });

  it('convertit l’horodatage en millisecondes d’époque', () => {
    const hands = raisedHands(
      view(person('me', '2026-07-30T10:00:00.000Z', { isLocal: true }), []),
    );

    expect(hands[0]?.raisedAt).toBe(Date.parse('2026-07-30T10:00:00.000Z'));
  });
});

describe('handPosition', () => {
  it('rend une position 1-based', () => {
    const hands = raisedHands(
      view(person('me', '2026-07-30T10:00:03Z', { isLocal: true }), [
        person('a', '2026-07-30T10:00:01Z'),
        person('b', '2026-07-30T10:00:02Z'),
      ]),
    );

    expect(handPosition(hands, 'a')).toBe(1);
    expect(handPosition(hands, 'b')).toBe(2);
    expect(handPosition(hands, 'me')).toBe(3);
  });

  it('rend null pour une identité absente de la file', () => {
    const hands = raisedHands(view(person('me', null, { isLocal: true }), []));

    expect(handPosition(hands, 'me')).toBeNull();
  });
});
```

Trois choses à remarquer dans ces fixtures, parce qu'elles sont le seul rempart contre un test
qui ne discrimine rien :

- `handPosition` est asserté sur **trois** identités dont la troisième est le local, et non sur la
  seule première : `index` au lieu de `index + 1` doit tomber, et un `return 1` en dur aussi ;
- `'trie par horodatage croissant'` installe **deux** distants et les fournit dans l'ordre
  inverse : une fonction qui rendrait la liste telle quelle passerait avec un seul ;
- `'ignore un horodatage que Date.parse ne sait pas lire'` garde un second participant **valide** :
  sans lui, `[]` serait aussi le résultat d'une fonction qui ne rend jamais rien.

- [ ] **Step 2 : écrire le module**

`src/call/hands.ts`, en entier :

```ts
import type { ParticipantView, RoomView } from 'src/call/layout';

// Le nom de l'attribut participant, tel que le backend meet l'écrit
// (`viewsets.py`, `attributes={"handRaisedAt": …}`) et tel que le serveur
// LiveKit le rediffuse. Une constante plutôt qu'un littéral recopié : la
// projection la lit, et les doubles de test doivent porter la même.
export const HAND_ATTRIBUTE = 'handRaisedAt';

// Une main levée, prête à afficher. `raisedAt` est déjà en millisecondes
// d'époque : le tri n'a plus rien à parser.
export type RaisedHand = {
  readonly identity: string;
  readonly name: string;
  readonly raisedAt: number;
  readonly isLocal: boolean;
};

// Contrat backend, verbatim : chaîne vide = main baissée, absence de clé =
// jamais levée, horodatage ISO 8601 = levée. Les deux premiers cas se lisent
// `null` : ils sont indiscernables à l'écran.
export function readHandRaisedAt(
  attributes: Readonly<Record<string, string>> | undefined,
): string | null {
  const raw = attributes?.[HAND_ATTRIBUTE];
  if (raw === undefined || raw === '') return null;
  return raw;
}

export function isHandRaised(participant: ParticipantView): boolean {
  return participant.handRaisedAt !== null;
}

// Le local d'abord parce qu'il est dans la file au même titre que les autres :
// prendre `RoomView` plutôt qu'un tableau rend cette inclusion structurelle.
export function raisedHands(view: RoomView): readonly RaisedHand[] {
  const hands: RaisedHand[] = [];
  for (const participant of [view.local, ...view.remotes]) {
    if (participant.handRaisedAt === null) continue;
    const raisedAt = Date.parse(participant.handRaisedAt);
    if (Number.isNaN(raisedAt)) continue;
    hands.push({
      identity: participant.identity,
      name: participant.name,
      raisedAt,
      isLocal: participant.isLocal,
    });
  }

  return hands.sort((a, b) =>
    a.raisedAt !== b.raisedAt ? a.raisedAt - b.raisedAt : a.identity.localeCompare(b.identity),
  );
}

export function handPosition(hands: readonly RaisedHand[], identity: string): number | null {
  const index = hands.findIndex((hand) => hand.identity === identity);
  return index === -1 ? null : index + 1;
}
```

`hands.sort(...)` mute un tableau **local**, jamais l'entrée : `hands` vient d'être construit dans
la fonction. Le type de retour `readonly RaisedHand[]` l'interdit ensuite à l'appelant.

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/call/hands.spec.ts
```

15 tests verts. `tsc` sera rouge tant que la tâche 3 n'a pas ajouté `handRaisedAt` à
`ParticipantView` : c'est attendu, et c'est la seule interdépendance de tout le plan.

- [ ] **Step 4 : éprouver par mutation**

Cinq mutations, une par règle. Chacune doit rendre `src/call/hands.spec.ts` rouge, puis être
restaurée :

1. `if (raw === undefined || raw === '') return null;` → `if (raw === undefined) return null;`
2. `a.raisedAt - b.raisedAt` → `b.raisedAt - a.raisedAt`
3. `: a.identity.localeCompare(b.identity),` → `: 0,`
4. supprimer `if (Number.isNaN(raisedAt)) continue;`
5. `return index === -1 ? null : index + 1;` → `return index === -1 ? null : index;`
6. `for (const participant of [view.local, ...view.remotes])` → `for (const participant of view.remotes)`

- [ ] **Step 5 : committer**

`feat(call): Read the raised-hand attribute and order the queue`

---

### Task 2 : l'appel à jeton LiveKit — obstacle (b)

**Files:**
- Create: `src/api/hand.ts`
- Test: `src/api/hand.spec.ts`

**Interfaces:**
- Consumes :
  - `type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError }` de
    `src/api/types` (`src/api/types.ts:18`)
  - `const REQUEST_TIMEOUT_MS: number` de `src/constants` (`src/constants.ts:5`, vaut `15_000`)
  - le `fetch` global. **Rien d'autre** : ni `authedFetch`, ni `Account`, ni `src/auth/session`.
- Produces :
  - `toggleHand(serverUrl: string, roomRef: string, livekitToken: string, raised: boolean): Promise<ApiResult<void>>`

**Le contrat serveur, vérifié dans la source de meet** (`viewsets.py:863-908`) :

```
POST /api/v1.0/rooms/{pk}/toggle-hand/
Authorization: Bearer <JWT LiveKit de la séance>       ← PAS la session OIDC
Content-Type: application/json
{ "raised": true }                                      ← requis, pas de défaut
```

| Statut | Ce que ça veut dire ici | `ApiError` rendu |
|---|---|---|
| `200` | `{"status":"success"}` | — (`{ ok: true, value: undefined }`) |
| `400` | `raised` absent ou non booléen — **notre bug**, on envoie toujours un booléen | `{ kind: 'server', status: 400 }` |
| `401` / `403` | le jeton de salle est invalide, ou ne porte pas sur ce salon | `{ kind: 'forbidden' }` |
| `404` | `{"error":"Participant not found"}` — l'identité n'est pas dans la salle LiveKit | `{ kind: 'not-found' }` |
| autre | | `{ kind: 'server', status }` |
| `fetch` rejette | | `{ kind: 'network' }` |

**Pourquoi jamais `unauthorized`.** `error.unauthorized` s'affiche « Session expired, please sign
in again » (`en.json:75`). Un `401` de `toggle-hand` ne dit **rien** de la session OIDC : elle est
parfaitement valide. Afficher ce message enverrait l'utilisateur se reconnecter pour un problème
qui n'est pas là. C'est le même défaut que `mapRefusal` corrige déjà côté SSO
(`src/api/client.ts:8-13`).

**Pourquoi une signature sans `Account`.** Recevoir un `Account` suggérerait que la fonction
s'authentifie avec les identifiants du compte — la confusion exacte qui produit l'obstacle (b).
Passer l'URL nue rend visible, **dans la signature**, que le seul secret utilisé est le jeton de
salle. Effet de bord utile : la fonction se teste avec deux chaînes.

**Pourquoi un module et non un paramètre de plus sur `authedFetch`.** Il y a **exactement un**
endpoint authentifié par jeton LiveKit dans tout le périmètre C. Généraliser pour un cas unique
coûterait un paramètre sur chacune des cinq fonctions de `src/api/participants.ts` et des six de
`src/api/rooms.ts`, pour zéro appelant.

Trois règles internes, chacune l'inverse d'`authedFetch` : **aucun rafraîchissement OIDC, aucun
rejeu** ; `AbortSignal.timeout(REQUEST_TIMEOUT_MS)` **repris** tel quel (`client.ts:73` — ce
point-là n'est pas inversé) ; **le corps de la réponse n'est jamais lu**, `{"status":"success"}`
n'ajoutant rien à `200`.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/api/hand.spec.ts`, en entier :

```ts
import { toggleHand } from 'src/api/hand';
import * as session from 'src/auth/session';

function ok(): Response {
  return { ok: true, status: 200 } as Response;
}

function status(code: number): Response {
  return { ok: false, status: code } as Response;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  jest.restoreAllMocks();
  fetchMock = jest.fn().mockResolvedValue(ok());
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('toggleHand', () => {
  it('poste sur la route du salon visé', async () => {
    await toggleHand('https://meet.linagora.com', 'r-2', 'jwt-1', true);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://meet.linagora.com/api/v1.0/rooms/r-2/toggle-hand/',
    );

    // Un seul salon ne distingue pas une référence transmise d'une route codée
    // en dur qui coïnciderait avec celle-ci.
    await toggleHand('https://autre.example', 'r-9', 'jwt-1', true);

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://autre.example/api/v1.0/rooms/r-9/toggle-hand/',
    );
  });

  it('échappe la référence de salon', async () => {
    await toggleHand('https://meet.linagora.com', 'salon été', 'jwt-1', true);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://meet.linagora.com/api/v1.0/rooms/salon%20%C3%A9t%C3%A9/toggle-hand/',
    );
  });

  it('porte le jeton LiveKit reçu en argument, et lui seul', async () => {
    await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-de-salle', true);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer jwt-de-salle');

    // Un second jeton, distinct : sans lui, un en-tête codé en dur passerait.
    await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-autre', true);

    const second = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((second.headers as Record<string, string>).authorization).toBe('Bearer jwt-autre');
  });

  it('ne rafraîchit jamais la session OIDC', async () => {
    const refresh = jest.spyOn(session, 'forceRefresh');
    const read = jest.spyOn(session, 'getAccessToken');

    await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);
    fetchMock.mockResolvedValue(status(401));
    await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);

    expect(refresh).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    // Et aucun rejeu : deux appels, deux requêtes.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('envoie le booléen demandé, dans les deux sens', async () => {
    await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      raised: true,
    });

    await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', false);
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      raised: false,
    });
  });

  it('rend un succès sans valeur', async () => {
    const result = await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('rend un 401 comme un refus de salle, jamais comme une session expirée', async () => {
    fetchMock.mockResolvedValue(status(401));

    const result = await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
  });

  it('rend un 403 comme un refus de salle', async () => {
    fetchMock.mockResolvedValue(status(403));

    const result = await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
  });

  it('rend un 404 comme une absence de participant', async () => {
    fetchMock.mockResolvedValue(status(404));

    const result = await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);

    expect(result).toEqual({ ok: false, error: { kind: 'not-found' } });
  });

  it('garde le statut des autres refus', async () => {
    fetchMock.mockResolvedValue(status(400));
    expect(await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true)).toEqual({
      ok: false,
      error: { kind: 'server', status: 400 },
    });

    fetchMock.mockResolvedValue(status(500));
    expect(await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true)).toEqual({
      ok: false,
      error: { kind: 'server', status: 500 },
    });
  });

  it('rend une panne réseau comme une valeur, sans lever', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const result = await toggleHand('https://meet.linagora.com', 'r-1', 'jwt-1', true);

    expect(result).toEqual({ ok: false, error: { kind: 'network' } });
  });
});
```

Les deux espions sur `src/auth/session` ne sont **pas** décoratifs, même si `src/api/hand.ts`
n'importe pas ce module : `authedFetch` appelle `getAccessToken` et `forceRefresh` **depuis la
même instance de module**. Le jour où quelqu'un « simplifie » `toggleHand` en la faisant passer
par `authedFetch`, ces deux assertions tombent. **Mesuré : cette réécriture rend les 11 tests du
fichier rouges.**

`{ ok: true, status: 200 } as Response` est une assertion **simple**, pas une double assertion à
travers `unknown` : elle passe l'interdit d'`eslint.config.js`, et l'exemption de ce dernier pour
les fichiers `*.spec.*` couvre de toute façon le `as unknown as typeof fetch` du `global.fetch`.

- [ ] **Step 2 : écrire le module**

`src/api/hand.ts`, en entier :

```ts
import type { ApiResult } from 'src/api/types';
import { REQUEST_TIMEOUT_MS } from 'src/constants';

// N'accepte pas d'`Account` : le seul secret utilisé est le jeton de salle, et
// une signature qui prendrait un compte laisserait croire l'inverse.
// `authedFetch` ne peut structurellement pas servir ici — il étale son propre
// `authorization` EN DERNIER (`client.ts:68-72`), donc il écrase le nôtre, et
// son jeton vient de `getAccessToken`, c'est-à-dire de l'OIDC. Pire, sur 401 il
// rafraîchit la session et rejoue : pour cet endpoint-là, un 401 veut dire que
// le jeton de SALLE est invalide, et un aller-retour SSO renverrait exactement
// le même en-tête erroné.
//
// Ne rafraîchit donc jamais l'OIDC, ne rejoue jamais, ne lit pas le corps :
// `{"status":"success"}` n'ajoute rien à un 200.
export async function toggleHand(
  serverUrl: string,
  roomRef: string,
  livekitToken: string,
  raised: boolean,
): Promise<ApiResult<void>> {
  const url = `${serverUrl}/api/v1.0/rooms/${encodeURIComponent(roomRef)}/toggle-hand/`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${livekitToken}`,
      },
      body: JSON.stringify({ raised }),
      // Repris d'`authedFetch`, et pas inversé : 15 000 ms.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: { kind: 'network' } };
  }

  if (response.ok) return { ok: true, value: undefined };
  // Jamais `unauthorized` : ce message-là dit « session expirée » et enverrait
  // l'utilisateur se reconnecter pour un problème qui n'est pas là.
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: { kind: 'forbidden' } };
  }
  if (response.status === 404) return { ok: false, error: { kind: 'not-found' } };
  return { ok: false, error: { kind: 'server', status: response.status } };
}
```

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/api/hand.spec.ts
```

11 tests verts. Cette tâche est **autonome** : `tsc` la valide sans les autres.

- [ ] **Step 4 : éprouver par mutation**

Six mutations, chacune rouge :

1. `if (response.status === 401 || response.status === 403) {` → `if (response.status === 403) {`
2. dans ce même bloc, `kind: 'forbidden'` → `kind: 'unauthorized'`
3. `${encodeURIComponent(roomRef)}` → `r-2` (une référence en dur qui coïncide avec le premier cas)
4. `` authorization: `Bearer ${livekitToken}` `` → `authorization: 'Bearer jwt-1'`
5. `body: JSON.stringify({ raised })` → `body: JSON.stringify({ raised: true })`
6. supprimer la ligne du `404`
7. **la plus utile** : réécrire tout le corps pour qu'il délègue à `authedFetch` avec un
   `headers: { authorization: … }` — c'est le raccourci que le module existe pour interdire. Les
   11 tests tombent.

- [ ] **Step 5 : committer**

`feat(api): Toggle the raised hand with the room token`

---

### Task 3 : la projection et l'événement — obstacle (c)

**Files:**
- Modify: `src/call/layout.ts`, `src/call/participants.ts`
- Modify (tests): `src/call/layout.spec.ts`, `src/call/participants.spec.ts`

**Interfaces:**
- Consumes :
  - `readHandRaisedAt(attributes: Readonly<Record<string, string>> | undefined): string | null`
    de `src/call/hands` (tâche 1)
  - `RoomEvent.ParticipantAttributesChanged` de `livekit-client` — vaut la chaîne
    `"participantAttributesChanged"` (`dist/src/room/events.d.ts:180`), signature au niveau `Room` :
    `(changedAttributes: Record<string, string>, participant: RemoteParticipant | LocalParticipant) => void`
    (`dist/src/room/Room.d.ts:309`)
  - `Participant.attributes: Readonly<Record<string, string>>`
    (`dist/src/room/participant/Participant.d.ts:60`)
- Produces :
  - `ParticipantView` gagne `readonly handRaisedAt: string | null`
  - `ROOM_VIEW_EVENTS` passe de 13 à **14** entrées
  - `readParticipant()` projette le champ

`ParticipantView` gagne **un champ nommé, jamais la carte d'attributs entière**. Ce type est
décrit comme « ce dont la sélection a besoin, et rien de plus » (`layout.ts:15-17`) ; y verser une
carte de chaînes ouvertes en ferait une passoire vers le SDK, ce que tout le fichier existe pour
éviter. Un champ nommé se teste, se documente, et ne transporte pas `color` ni `room_role` dont
personne ici n'a l'usage.

**Ce que cette addition coûte, nommé.** `ParticipantAttributesChanged` invalide désormais le store
de vue, donc `useCallLayout` recalcule sa mise en page à **chaque** main levée ou baissée de
n'importe qui. `selectLayout` est une fonction pure sur une poignée de participants et
`VideoTrack` est stable par référence de piste : c'est un re-rendu React, pas une renégociation
vidéo. Coût accepté ; l'alternative — un second store écoutant le seul événement d'attributs —
dupliquerait la lecture de la `Room` pour économiser des microsecondes, et c'est exactement ce que
la revue du périmètre D reprochait au troisième décalque de `createRoomSnapshotStore`.

**Ce que cette même addition rend gratuit, et qu'il faut savoir pour ne pas l'écrire deux fois.**
Deux des quatre promesses de §11.C1 — « un arrivant tardif voit l'état » et « une reconnexion ne
perd rien » — **ne coûtent aucune ligne de plus**, et il ne faut surtout pas leur en écrire :

- **Arrivant tardif.** `handRaisedAt` est de l'**état**, porté par le participant et maintenu par
  le serveur LiveKit, pas un événement qui passe. Le tout premier `getSnapshot()` lit
  `participant.attributes` sur les participants **déjà présents** (`participants.ts:115-118`,
  `readRoomView` est appelée à la première lecture, pas sur un événement). Aucun rejeu n'est
  nécessaire, et aucun n'existe. C'est ce que testent, sans le dire, les deux tests de la tâche 8
  qui posent les attributs **avant** le montage.
- **Reconnexion.** `RoomEvent.Reconnected` est **déjà** dans `ROOM_VIEW_EVENTS`
  (`participants.ts:30`, posé par le périmètre B) : la vue est relue de bout en bout au retour, et
  l'attribut, qui vit côté serveur, n'a pas bougé. Une reconnexion automatique
  (`Reconnecting` → `Reconnected`) n'émet **pas** `Disconnected`, donc rien n'est démonté ; et un
  vrai `Disconnected` **termine l'écran de séance** (`call.tsx:569-585`), donc il n'y a pas de cas
  « la main a disparu mais je suis toujours en réunion ».

> **Sur le magasin générique que la revue de D suggérait d'extraire.** `recordingStore.ts` et
> `participants.ts` sont deux décalques structurels, et la revue notait : si C1 en demande un
> troisième, extraire un `createRoomSnapshotStore` générique. **C1 n'en demande aucun.** La main
> levée passe par le magasin de vue qui existe déjà, à qui il suffit d'un événement de plus. Il
> n'y a donc rien à extraire ici, et l'extraction resterait un travail de deux appelants — la
> refactorisation la moins rentable qui soit. C2 (`reactionStore`) et C3 (`chatStore`) porteront
> la question, et **avec quatre appelants elle vaudra d'être posée**.

- [ ] **Step 1 : ajouter le champ au type**

Dans `src/call/layout.ts`, à la fin de `ParticipantView`, juste après `camera` :

```ts
  // `null` quand la caméra n'est pas publiée, qu'elle est coupée, ou que la
  // piste n'est pas souscrite. Les trois se ressemblent à l'écran : il n'y a
  // pas d'image.
  readonly camera: CameraTrack | null;
  // Horodatage ISO 8601 posé par le serveur meet, `null` quand la main est
  // baissée. Le contrat backend distingue la chaîne vide (baissée) de
  // l'absence de clé (jamais levée) ; les deux se lisent `null` ici. Un champ
  // nommé, jamais la carte d'attributs entière : ce type est « ce dont la
  // sélection a besoin, et rien de plus ».
  readonly handRaisedAt: string | null;
};
```

- [ ] **Step 2 : réparer le fixture de `layout.spec.ts`**

`tsc` signale immédiatement `src/call/layout.spec.ts:15`. Son `person()` construit un
`ParticipantView` complet avant d'étaler les surcharges ; il gagne une ligne, **avant** le
`...overrides` pour qu'un test puisse la surcharger :

```ts
function person(identity: string, overrides: Partial<ParticipantView> = {}): ParticipantView {
  return {
    identity,
    name: identity,
    isLocal: false,
    isSpeaking: false,
    lastSpokeAt: null,
    joinedAt: null,
    camera: null,
    handRaisedAt: null,
    ...overrides,
  };
}
```

C'est la seule ligne que `layout.spec.ts` change : `selectLayout` ne lit pas ce champ, et aucun de
ses 24 tests ne bouge.

- [ ] **Step 3 : écrire les tests de projection qui échouent**

Dans `src/call/participants.spec.ts`, le `PersonOptions` et le `person()` gagnent `attributes` :

```ts
type PersonOptions = {
  readonly name?: string;
  readonly isLocal?: boolean;
  readonly isSpeaking?: boolean;
  readonly lastSpokeAt?: Date;
  readonly joinedAt?: Date;
  readonly publications?: Partial<Record<Track.Source, FakePublication>>;
  readonly attributes?: Record<string, string>;
};

function person(identity: string, options: PersonOptions = {}): Participant {
  return {
    identity,
    name: options.name,
    isLocal: options.isLocal ?? false,
    isSpeaking: options.isSpeaking ?? false,
    lastSpokeAt: options.lastSpokeAt,
    joinedAt: options.joinedAt,
    // `Participant.attributes` est un getter qui rend toujours un objet ; le
    // double, lui, peut l'omettre — et c'est justement ce que la projection
    // doit tolérer.
    attributes: options.attributes,
    getTrackPublication: (source: Track.Source) => options.publications?.[source],
  } as unknown as Participant;
}
```

Deux tests de plus dans `describe('readRoomView')`, à placer juste **avant**
`it('lit aussi la caméra du participant local', …)` :

```ts
  it("projette l'horodatage de main levée de chaque participant", () => {
    // Deux distants, deux horodatages distincts : avec un seul, une valeur
    // codée en dur passerait.
    const { room } = fakeRoom(
      person('me', { isLocal: true, attributes: { handRaisedAt: '2026-07-30T10:00:03Z' } }),
      [
        person('bob', { attributes: { handRaisedAt: '2026-07-30T10:00:01Z' } }),
        person('cid', { attributes: { handRaisedAt: '2026-07-30T10:00:02Z' } }),
      ],
    );

    const view = readRoomView(room);

    expect(view.local.handRaisedAt).toBe('2026-07-30T10:00:03Z');
    expect(view.remotes.map((p) => p.handRaisedAt)).toEqual([
      '2026-07-30T10:00:01Z',
      '2026-07-30T10:00:02Z',
    ]);
  });

  it('lit une main baissée et un double sans attributs comme null', () => {
    // Le contrat backend écrit la chaîne vide pour une main baissée ; et tous
    // les doubles de `Participant` du dépôt sont écrits à la main, donc
    // incomplets. Les deux doivent donner `null`, jamais une exception.
    const { room } = fakeRoom(person('me', { isLocal: true, attributes: { handRaisedAt: '' } }), [
      person('bob'),
    ]);

    const view = readRoomView(room);

    expect(view.local.handRaisedAt).toBeNull();
    expect(view.remotes[0]?.handRaisedAt).toBeNull();
  });
```

Dans `it('s’abonne à tout ce qui change ce qui s’affiche', …)`, la liste attendue gagne une
entrée. Elle est déjà `.sort()`ée à la comparaison, donc la place dans le littéral est libre :

```ts
    expect(subscribedEvents()).toEqual(
      [
        'activeSpeakersChanged',
        'localTrackPublished',
        'localTrackUnpublished',
        'participantConnected',
        'participantDisconnected',
        'participantAttributesChanged',
        'participantNameChanged',
        'reconnected',
        'trackMuted',
        'trackPublished',
        'trackSubscribed',
        'trackUnmuted',
        'trackUnpublished',
        'trackUnsubscribed',
      ].sort(),
    );
```

Et un test de plus dans `describe('createRoomViewStore')`, juste après
`it('prévient et relit à chaque événement', …)` :

```ts
  it('relit la vue sur un changement d’attributs', () => {
    // Sans cet événement dans la liste, une main levée par quelqu'un d'autre
    // n'arriverait jamais à l'écran : le backend meet ne pousse rien, c'est le
    // serveur LiveKit qui diffuse l'attribut.
    const { room, remotes, emit } = fakeRoom(ME);
    remotes.set('bob', person('bob'));
    const store = createRoomViewStore(room);
    const listener = jest.fn();
    store.subscribe(listener);
    expect(store.getSnapshot().remotes[0]?.handRaisedAt).toBeNull();

    remotes.set('bob', person('bob', { attributes: { handRaisedAt: '2026-07-30T10:00:01Z' } }));
    emit('participantAttributesChanged');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().remotes[0]?.handRaisedAt).toBe('2026-07-30T10:00:01Z');
  });
```

Ce test-là est le seul qui prouve la chaîne complète du côté branché : il asserte l'état **avant**
(`toBeNull()`), déclenche l'événement, et asserte l'état **après**. Sans l'assertion préalable,
une projection qui rendrait toujours l'horodatage passerait.

- [ ] **Step 4 : écrire les deux lignes**

Dans `src/call/participants.ts`, l'import — placé avant celui de `layout`, l'ordre alphabétique du
bloc `src/…` :

```ts
import { RoomEvent, Track } from 'livekit-client';
import type { Participant, Room } from 'livekit-client';

import { readHandRaisedAt } from 'src/call/hands';
import type { CameraTrack, ParticipantView, RoomView } from 'src/call/layout';
```

La quatorzième entrée de `ROOM_VIEW_EVENTS`, à la fin de la liste :

```ts
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.Reconnected,
  // La main levée vit dans un attribut de participant, et le serveur LiveKit
  // est le seul à la diffuser : sans cet événement, une main levée par
  // quelqu'un d'autre n'arriverait jamais à l'écran. Sur l'émetteur
  // participant-scoped l'événement s'appelle `attributesChanged` ; ici, au
  // niveau `Room`, c'est `participantAttributesChanged`, et le participant
  // local y est inclus.
  RoomEvent.ParticipantAttributesChanged,
] as const;
```

Et la projection, dernière ligne de `readParticipant` :

```ts
function readParticipant(participant: Participant): ParticipantView {
  return {
    identity: participant.identity,
    // Le SDK laisse `name` indéfini tant que le jeton n'en porte pas.
    name: participant.name ?? '',
    isLocal: participant.isLocal,
    isSpeaking: participant.isSpeaking,
    lastSpokeAt: participant.lastSpokeAt?.getTime() ?? null,
    joinedAt: participant.joinedAt?.getTime() ?? null,
    camera: readCamera(participant),
    handRaisedAt: readHandRaisedAt(participant.attributes),
  };
}
```

**Rien d'autre ne bouge** : `createRoomViewStore` invalide déjà sur tout événement de la liste, et
`readRoomView` reconstruit la vue entière (`participants.ts:62-69`, `85-90`).

- [ ] **Step 5 : lancer et vérifier**

```
npx tsc --noEmit
npx jest src/call
```

`tsc` propre pour la première fois depuis la tâche 1. `participants.spec.ts` : 19 tests verts
(16 avant, 3 ajoutés). `layout.spec.ts`, `useCallLayout.spec.ts` : inchangés et verts —
`useCallLayout.spec.ts` fabrique ses `Participant` à la main sans `attributes`, et c'est
précisément le cas que le `| undefined` de `readHandRaisedAt` couvre.

- [ ] **Step 6 : éprouver par mutation**

1. supprimer `RoomEvent.ParticipantAttributesChanged` de la liste → `participants.spec.ts` rouge
   (2 tests) ;
2. `handRaisedAt: readHandRaisedAt(participant.attributes)` → `handRaisedAt: null` →
   `participants.spec.ts` rouge (2 tests), et `call.spec.tsx` rouge (4 tests) une fois la tâche 8
   écrite. **Mesuré : 6 tests rouges au total.**

- [ ] **Step 7 : committer**

`feat(call): Project the raised hand and listen for attribute changes`

---

### Task 4 : les sept clés, dans les sept locales

**Files:**
- Modify: `src/i18n/locales/{en,fr,es,it,de,vi,ru}.json`

**Interfaces:**
- Consumes : rien
- Produces : 7 clés × 7 locales = **49 entrées**. Aucune clé n'est retirée.

`src/i18n/index.spec.ts` compare les jeux de clés locale par locale : une clé manquante quelque
part le fait échouer. Il **passe en revanche** sur une clé présente partout et remplie d'anglais
recopié — les sept sont traduites.

Les clés vont **toutes après `call.unnamedParticipant`** et avant `participants.title`, pour que
le bloc `call.*` reste groupé comme il l'est déjà.

| Clé | Rôle | Où |
|---|---|---|
| `call.raiseHand` | libellé du `Menu.Item`, main baissée | tâche 5 |
| `call.lowerHand` | libellé du `Menu.Item` main levée, **et** du bouton du bandeau | tâches 5 et 6 |
| `call.handQueue` | titre du bloc de file | tâche 5 |
| `call.handQueueEntry` | gabarit d'une ligne : `{{position}}`, `{{name}}` | tâche 5 |
| `call.handRaised` | texte du bandeau | tâche 6 |
| `call.handPosition` | rang affiché dans le bandeau : `{{position}}` | tâche 6 |
| `call.handFailed` | `Snackbar` | tâche 8 |

Deux clés déjà présentes sont réutilisées et **ne sont pas recréées** : `call.more`
(`en.json:34`, le libellé d'accessibilité du bouton « plus », posé par D) et
`call.unnamedParticipant` (`en.json:49`, le repli d'un nom vide).

- [ ] **Step 1 : `en`**

```json
  "call.unnamedParticipant": "Unnamed participant",
  "call.raiseHand": "Raise hand",
  "call.lowerHand": "Lower hand",
  "call.handRaised": "Your hand is raised",
  "call.handPosition": "Number {{position}}",
  "call.handQueue": "Hands raised",
  "call.handQueueEntry": "{{position}}. {{name}}",
  "call.handFailed": "Could not change your hand",
```

- [ ] **Step 2 : `fr`**

```json
  "call.raiseHand": "Lever la main",
  "call.lowerHand": "Baisser la main",
  "call.handRaised": "Votre main est levée",
  "call.handPosition": "Position {{position}}",
  "call.handQueue": "Mains levées",
  "call.handQueueEntry": "{{position}}. {{name}}",
  "call.handFailed": "Impossible de changer l’état de votre main",
```

- [ ] **Step 3 : `es`**

```json
  "call.raiseHand": "Levantar la mano",
  "call.lowerHand": "Bajar la mano",
  "call.handRaised": "Tu mano está levantada",
  "call.handPosition": "Posición {{position}}",
  "call.handQueue": "Manos levantadas",
  "call.handQueueEntry": "{{position}}. {{name}}",
  "call.handFailed": "No se pudo cambiar el estado de tu mano",
```

- [ ] **Step 4 : `it`**

```json
  "call.raiseHand": "Alza la mano",
  "call.lowerHand": "Abbassa la mano",
  "call.handRaised": "La tua mano è alzata",
  "call.handPosition": "Posizione {{position}}",
  "call.handQueue": "Mani alzate",
  "call.handQueueEntry": "{{position}}. {{name}}",
  "call.handFailed": "Impossibile cambiare lo stato della tua mano",
```

- [ ] **Step 5 : `de`**

```json
  "call.raiseHand": "Hand heben",
  "call.lowerHand": "Hand senken",
  "call.handRaised": "Ihre Hand ist gehoben",
  "call.handPosition": "Position {{position}}",
  "call.handQueue": "Gehobene Hände",
  "call.handQueueEntry": "{{position}}. {{name}}",
  "call.handFailed": "Der Handstatus konnte nicht geändert werden",
```

- [ ] **Step 6 : `vi`**

```json
  "call.raiseHand": "Giơ tay",
  "call.lowerHand": "Hạ tay",
  "call.handRaised": "Tay của bạn đang giơ lên",
  "call.handPosition": "Vị trí {{position}}",
  "call.handQueue": "Những người giơ tay",
  "call.handQueueEntry": "{{position}}. {{name}}",
  "call.handFailed": "Không thể thay đổi trạng thái giơ tay",
```

- [ ] **Step 7 : `ru`**

```json
  "call.raiseHand": "Поднять руку",
  "call.lowerHand": "Опустить руку",
  "call.handRaised": "Ваша рука поднята",
  "call.handPosition": "Позиция {{position}}",
  "call.handQueue": "Поднятые руки",
  "call.handQueueEntry": "{{position}}. {{name}}",
  "call.handFailed": "Не удалось изменить состояние вашей руки",
```

- [ ] **Step 8 : lancer et vérifier**

```
npx jest src/i18n
npx prettier --check src/i18n/locales
```

- [ ] **Step 9 : éprouver par mutation**

Retirer `call.handQueueEntry` de `ru.json` : `src/i18n/index.spec.ts` doit devenir rouge en
nommant `ru`. Restaurer.

- [ ] **Step 10 : committer**

`feat(i18n): Translate the raised-hand strings in seven locales`

---

### Task 5 : la commande et la file, dans le menu

**Files:**
- Create: `src/screens/room/handControl.tsx`
- Test: `src/screens/room/handControl.spec.tsx`

**Interfaces:**
- Consumes :
  - `type RaisedHand = { readonly identity: string; readonly name: string; readonly raisedAt: number; readonly isLocal: boolean }`
    de `src/call/hands` (tâche 1)
  - `BAR_RIPPLE_COLOR: string` et
    `barStyles: { button; menuContent; menuTitle; menuTitleDanger; menuNote; check }` de
    `src/screens/room/controlBar` — on utilise `barStyles.menuTitle` (`color: textDark`) et
    `barStyles.menuNote` (`color: textDark` + `paddingHorizontal: 16` + `paddingVertical: 8`)
  - clés i18n : `call.raiseHand`, `call.lowerHand`, `call.handQueue`, `call.handQueueEntry`,
    `call.unnamedParticipant`
- Produces :
  - `type HandControlProps = { readonly raised: boolean; readonly busy: boolean; readonly hands: readonly RaisedHand[]; readonly onToggle: () => void }`
  - `HandControl(props: HandControlProps): React.ReactElement`
  - `testID` posés : `hand-toggle` (et son `hand-toggle-title` interne, celui de `Menu.Item`),
    `hand-queue`, `hand-queue-title`, `hand-queue-row-<identity>`

Un seul contrôle, dont l'identité suit l'attribut : l'exclusivité des deux sens n'a besoin
d'aucun état supplémentaire — on ne peut pas lever pendant que la main est levée, puisque la
commande est alors une baisse. C'est la forme exacte de `RecordingControl`, livré par D dans le
même menu.

**Pendant un appel en vol, la commande n'est pas rendue.** Voir E3. Le rendu de la **file**, lui,
ne dépend pas de `busy` : elle décrit l'état du salon, pas la requête en cours.

**Pas de `leadingIcon`.** `MenuItem.tsx:205` rend `<Icon source={leadingIcon} … color={iconColor} />`
où `iconColor` vient de `getMenuItemColor`, donc du **thème** : le quasi-noir du schéma clair sur
`surfaceDark`. C'est pour cette raison exacte que le périmètre A a dû sortir le glyphe de coche de
la résolution de `Menu.Item` (`menuCheck.tsx`, livré cassé deux fois avant d'être extrait).
L'identité de la commande passe par **le libellé**.

Les lignes de file sont des `Text` non pressables, pas des `Menu.Item` : **on ne peut pas baisser
la main de quelqu'un d'autre** (§5.C15 — c'est un autre endpoint et un autre mécanisme
d'authentification), et un `Menu.Item` promettrait une action qui n'existe pas. Le `testID` de
chaque ligne porte l'identité, ce qui permet de viser une ligne précise sans indexer un tableau
— la garde que `noUncheckedIndexedAccess` réclamerait sinon.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/screens/room/handControl.spec.tsx`, en entier :

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { RaisedHand } from 'src/call/hands';
import { tokens } from 'src/ui/tokens';
import { HandControl } from './handControl';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}|${JSON.stringify(values)}`,
  }),
}));

const ADA: RaisedHand = {
  identity: 'u-ada',
  name: 'Ada',
  raisedAt: Date.parse('2026-07-30T10:00:01Z'),
  isLocal: false,
};

const BOB: RaisedHand = {
  identity: 'u-bob',
  name: 'Bob',
  raisedAt: Date.parse('2026-07-30T10:00:02Z'),
  isLocal: true,
};

describe('HandControl', () => {
  it('propose de lever quand la main est baissée', async () => {
    const onToggle = jest.fn();
    await render(<HandControl raised={false} busy={false} hands={[]} onToggle={onToggle} />);

    expect(screen.getByTestId('hand-toggle')).toHaveTextContent('call.raiseHand');
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('propose de baisser quand la main est levée', async () => {
    const onToggle = jest.fn();
    await render(<HandControl raised busy={false} hands={[]} onToggle={onToggle} />);

    expect(screen.getByTestId('hand-toggle')).toHaveTextContent('call.lowerHand');
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('porte une couleur explicite sur le libellé de la commande', async () => {
    // `Menu.Item` calcule `titleColor` depuis le thème et le pose avant
    // `titleStyle` dans le tableau qu'il passe à son `Text` interne (`testID`
    // suffixé `-title`). Sans couleur explicite, le libellé retombe sur
    // `onSurface`, quasi-noir en schéma clair, sur une surface forcée sombre.
    await render(<HandControl raised={false} busy={false} hands={[]} onToggle={jest.fn()} />);

    expect(screen.getByTestId('hand-toggle-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('disparaît pendant un appel en vol plutôt que de se griser', async () => {
    // Paper teste `disabled` avant toute couleur explicite et rend un
    // quasi-noir qu'aucune couleur ne rattrape. On masque, on ne grise pas.
    await render(<HandControl raised={false} busy hands={[ADA]} onToggle={jest.fn()} />);

    expect(screen.queryByTestId('hand-toggle')).toBe(null);
    // Mais la file, elle, reste : elle ne dépend pas de la requête en vol.
    expect(screen.getByTestId('hand-queue')).toBeTruthy();
  });

  it('ne rend aucune file quand personne ne lève la main', async () => {
    await render(<HandControl raised={false} busy={false} hands={[]} onToggle={jest.fn()} />);

    expect(screen.queryByTestId('hand-queue')).toBe(null);
    expect(screen.queryByTestId('hand-queue-title')).toBe(null);
  });

  it('numérote la file dans son ordre, et vise la seconde entrée', async () => {
    // Deux mains, et l'assertion porte sur la SECONDE : avec une seule, une
    // position codée en dur à 1 passerait sans qu'on le voie.
    await render(<HandControl raised busy={false} hands={[ADA, BOB]} onToggle={jest.fn()} />);

    expect(screen.getByTestId('hand-queue-row-u-bob')).toHaveTextContent(
      'call.handQueueEntry|{"position":2,"name":"Bob"}',
    );
    expect(screen.getByTestId('hand-queue-row-u-ada')).toHaveTextContent(
      'call.handQueueEntry|{"position":1,"name":"Ada"}',
    );
  });

  it('affiche le nom de chaque main, jamais son identité', async () => {
    await render(<HandControl raised={false} busy={false} hands={[BOB]} onToggle={jest.fn()} />);

    // `toHaveTextContent` compare la chaîne ENTIÈRE quand on lui passe une
    // chaîne : seule une expression régulière cherche un fragment.
    expect(screen.getByTestId('hand-queue-row-u-bob')).toHaveTextContent(/"name":"Bob"/);
    expect(screen.queryByText(/u-bob/)).toBe(null);
  });

  it('replie sur le libellé d’anonyme un nom vide', async () => {
    // Jamais d'identité brute ni de vide à l'écran : les deux se liraient comme
    // un défaut d'affichage plutôt que comme une personne sans nom. Même repli
    // que `waitingBanner` et `participantsPanel`.
    await render(
      <HandControl
        raised={false}
        busy={false}
        hands={[{ ...ADA, name: '   ' }]}
        onToggle={jest.fn()}
      />,
    );

    expect(screen.getByTestId('hand-queue-row-u-ada')).toHaveTextContent(
      /"name":"call\.unnamedParticipant"/,
    );
  });

  it('porte une couleur explicite sur le titre et sur chaque ligne de file', async () => {
    await render(
      <HandControl raised={false} busy={false} hands={[ADA, BOB]} onToggle={jest.fn()} />,
    );

    expect(screen.getByTestId('hand-queue-title')).toHaveStyle({ color: tokens.color.textDark });
    // La seconde ligne aussi : une couleur posée sur le titre seul laisserait
    // les lignes retomber sur le thème.
    expect(screen.getByTestId('hand-queue-row-u-bob')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });
});
```

Ce fichier n'a **ni `PaperProvider`, ni `settleMenus`, ni mock de `safe-area-context`** : un
`Menu.Item` rendu hors d'un `Menu` ne passe pas par un `Portal`. C'est ce que fait déjà
`recordingControl.spec.tsx`.

- [ ] **Step 2 : écrire le composant**

`src/screens/room/handControl.tsx`, en entier :

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Menu, Text } from 'react-native-paper';

import type { RaisedHand } from 'src/call/hands';
import { BAR_RIPPLE_COLOR, barStyles } from 'src/screens/room/controlBar';

export type HandControlProps = {
  readonly raised: boolean;
  readonly busy: boolean;
  readonly hands: readonly RaisedHand[];
  readonly onToggle: () => void;
};

// La commande et la file, dans le menu « plus ». Un seul contrôle dont
// l'identité suit l'attribut : on ne peut pas lever pendant que la main est
// levée, puisque la commande est alors une baisse.
//
// Pendant un appel en vol, la commande n'est pas rendue plutôt que grisée —
// même règle que `RecordingControl`, et pour la même raison : Paper teste
// `disabled` avant toute couleur explicite et rend un quasi-noir sur cette
// surface sombre. La file, elle, reste : elle décrit l'état du salon, pas la
// requête en cours.
//
// Les lignes de file ne sont pas des `Menu.Item` : on ne peut pas baisser la
// main de quelqu'un d'autre, et un élément pressable promettrait une action
// qui n'existe pas.
export function HandControl({
  raised,
  busy,
  hands,
  onToggle,
}: HandControlProps): React.ReactElement {
  const { t } = useTranslation();
  const label = raised ? 'call.lowerHand' : 'call.raiseHand';

  return (
    <View>
      {busy ? null : (
        <Menu.Item
          testID="hand-toggle"
          title={t(label)}
          titleStyle={barStyles.menuTitle}
          rippleColor={BAR_RIPPLE_COLOR}
          accessibilityLabel={t(label)}
          onPress={onToggle}
        />
      )}
      {hands.length === 0 ? null : (
        <View testID="hand-queue">
          {/* Secondaire par la taille (`labelSmall`), jamais par un gris :
              `tokens.color.muted` donne 3,88:1 sur `surfaceDark`, sous le
              seuil AA. `barStyles.menuNote` porte `textDark`, 15,86:1. */}
          <Text testID="hand-queue-title" variant="labelSmall" style={barStyles.menuNote}>
            {t('call.handQueue')}
          </Text>
          {hands.map((hand, index) => (
            <Text
              key={hand.identity}
              testID={`hand-queue-row-${hand.identity}`}
              variant="labelSmall"
              style={barStyles.menuNote}
            >
              {t('call.handQueueEntry', {
                position: index + 1,
                name: hand.name.trim().length > 0 ? hand.name.trim() : t('call.unnamedParticipant'),
              })}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
```

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/screens/room/handControl.spec.tsx
npx prettier --check src/screens/room/handControl.tsx src/screens/room/handControl.spec.tsx
```

9 tests verts.

- [ ] **Step 4 : éprouver par mutation**

Cinq mutations, chacune rouge :

1. `position: index + 1,` → `position: 1,`
2. `const label = raised ? 'call.lowerHand' : 'call.raiseHand';` → les deux libellés intervertis
3. `{busy ? null : (` → `{(` (la commande est rendue pendant l'appel)
4. retirer `style={barStyles.menuNote}` de la **ligne** de file, en le laissant sur le titre
5. `name: hand.name.trim().length > 0 ? … : …` → `name: hand.identity`

- [ ] **Step 5 : committer**

`feat(call): Offer the raise-hand command and the queue in the more menu`

---

### Task 6 : le bandeau — un seul appui pour baisser

**Files:**
- Create: `src/screens/room/handBanner.tsx`
- Test: `src/screens/room/handBanner.spec.tsx`

**Interfaces:**
- Consumes :
  - `tokens` de `src/ui/tokens` (`tokens.color.textDark`, `tokens.color.primaryDark`,
    `tokens.spacing.sm`)
  - clés i18n : `call.handRaised`, `call.handPosition`, `call.lowerHand`
- Produces :
  - `type HandBannerProps = { readonly raised: boolean; readonly position: number | null; readonly onLower: () => void }`
  - `HandBanner(props: HandBannerProps): React.ReactElement | null`
  - `testID` posés : `hand-banner`, `hand-banner-text`, `hand-banner-position`, `hand-lower`

**L'asymétrie est délibérée** (§4.3) : lever la main est un acte qu'on prépare, la baisser est un
acte qu'on **subit** — le modérateur vient de donner la parole, et fouiller un menu à ce moment-là
est exactement le mauvais moment. Deux appuis pour lever, **un** pour baisser. Et c'est la seule
chose qui rende une main levée oubliée visible pour celui qui l'a levée : sans ce bandeau, l'état
ne se voit qu'en ouvrant le menu.

Il rend `null` au repos, **donc il est toujours monté et jamais enveloppé d'une condition** dans
`call.tsx` — c'est la forme de `WaitingBanner` et de `RecordingIndicator`, et c'est ce qui fait
que la bande empile ses lignes au lieu qu'une écrase l'autre (§4.5 : les deux états peuvent être
vrais en même temps).

**`position === null` alors que `raised` vaut `true` est un cas réel**, pas une précaution : un
horodatage que `Date.parse` refuse sort de la file (tâche 1) sans sortir de l'attribut. On dit
alors la main levée sans inventer un rang. Ne pas traiter ce cas afficherait « Position null ».

`hand-lower` est un `Button mode="text"` : **il n'a pas de fond propre**, donc son texte retombe
sur `theme.colors.primary`, qui suit le schéma système — `#0057B8` sur `backgroundDark` donne
**2,86:1**, sous AA. `tokens.color.primaryDark` (`#4D9AFF`) le porte à **6,92:1**. C'est le même
défaut, et la même correction, que `participantsPanel.tsx:61-64`.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/screens/room/handBanner.spec.tsx`, en entier :

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { HandBanner } from './handBanner';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}|${JSON.stringify(values)}`,
  }),
}));

describe('HandBanner', () => {
  it('ne rend rien tant que la main est baissée', async () => {
    await render(<HandBanner raised={false} position={3} onLower={jest.fn()} />);

    expect(screen.queryByTestId('hand-banner')).toBe(null);
  });

  it('dit la main levée et propose de la baisser en un appui', async () => {
    const onLower = jest.fn();
    await render(<HandBanner raised position={1} onLower={onLower} />);

    expect(screen.getByTestId('hand-banner-text')).toHaveTextContent('call.handRaised');
    await fireEvent.press(screen.getByTestId('hand-lower'));

    expect(onLower).toHaveBeenCalledTimes(1);
  });

  it('affiche la position reçue, pas une constante', async () => {
    const view = await render(<HandBanner raised position={2} onLower={jest.fn()} />);

    expect(screen.getByTestId('hand-banner-position')).toHaveTextContent(
      'call.handPosition|{"position":2}',
    );

    // Une seconde position, distincte : sans elle, un `1` codé en dur passerait.
    await view.rerender(<HandBanner raised position={5} onLower={jest.fn()} />);

    expect(screen.getByTestId('hand-banner-position')).toHaveTextContent(
      'call.handPosition|{"position":5}',
    );
  });

  it('tait la position quand elle est inconnue, sans taire le bandeau', async () => {
    // Cas réel, pas une précaution : un horodatage que `Date.parse` refuse sort
    // de la file sans sortir de l'attribut.
    await render(<HandBanner raised position={null} onLower={jest.fn()} />);

    expect(screen.getByTestId('hand-banner-text')).toBeTruthy();
    expect(screen.queryByTestId('hand-banner-position')).toBe(null);
  });

  it('porte une couleur explicite sur son texte et sur son action', async () => {
    // `call.tsx` force un fond sombre dans les deux schémas alors que le thème
    // Paper suit le schéma système : sans couleur explicite, 1,08:1.
    await render(<HandBanner raised position={2} onLower={jest.fn()} />);

    expect(screen.getByTestId('hand-banner-text')).toHaveStyle({ color: tokens.color.textDark });
    expect(screen.getByTestId('hand-banner-position')).toHaveStyle({
      color: tokens.color.textDark,
    });
    // `mode="text"` retombe sur `theme.colors.primary` — 2,86:1 sur ce fond.
    expect(screen.getByTestId('hand-lower')).toHaveTextContent('call.lowerHand');
  });
});
```

> **Ce que la dernière assertion ne prouve pas, et pourquoi elle est là quand même.** Le
> `textColor` d'un `Button` de Paper n'est **pas** joignable par `toHaveStyle` : le texte est rendu
> par un `Text` interne sans `testID` propre, et le `testID` du bouton porte sur le
> `TouchableRipple`. Le contenu, lui, est joignable — et une entrée dont le libellé aurait été
> intervertie avec celui d'ailleurs tomberait. La garde de couleur du bouton reste **hors de
> portée d'un test**, comme celle de l'`iconColor` d'un `IconButton` à icône-chaîne
> (`AGENTS.md`). Ne pas en fabriquer une.

- [ ] **Step 2 : écrire le composant**

`src/screens/room/handBanner.tsx`, en entier :

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  // La même bande que le message de reconnexion et que l'indicateur
  // d'enregistrement : au-dessus de la scène, hors de la barre. Pas de fond
  // propre — il hérite du `backgroundDark` que `call.tsx` force sur
  // `styles.root` dans les deux schémas, exactement comme
  // `recordingIndicator.tsx`. Les deux bandeaux s'empilent en colonne au lieu
  // qu'un écrase l'autre.
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.sm,
    paddingVertical: tokens.spacing.sm,
  },
  // `call.tsx` force un fond sombre dans les deux schémas alors que le thème
  // Paper suit le schéma système : sans cette couleur explicite, le libellé
  // retombe sur `theme.colors.onSurface` — 1,08:1, invisible. 16,65:1 avec.
  text: { color: tokens.color.textDark },
});

export type HandBannerProps = {
  readonly raised: boolean;
  readonly position: number | null;
  readonly onLower: () => void;
};

// Lever la main est un acte qu'on prépare ; la baisser est un acte qu'on subit
// — le modérateur vient de donner la parole, et fouiller un menu à ce
// moment-là est le mauvais moment. Deux appuis pour lever, un pour baisser.
// C'est aussi la seule chose qui rende une main levée oubliée visible pour
// celui qui l'a levée.
export function HandBanner({
  raised,
  position,
  onLower,
}: HandBannerProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!raised) return null;

  return (
    <View testID="hand-banner" style={styles.root}>
      <Text testID="hand-banner-text" style={styles.text}>
        {t('call.handRaised')}
      </Text>
      {/* `null` alors que la main est levée est un cas réel, pas une
          précaution : un horodatage que `Date.parse` refuse sort de la file
          sans sortir de l'attribut. On dit alors la main levée sans inventer
          un rang. */}
      {position === null ? null : (
        <Text testID="hand-banner-position" style={styles.text}>
          {t('call.handPosition', { position })}
        </Text>
      )}
      <Button
        testID="hand-lower"
        mode="text"
        // `mode="text"` n'a pas de fond propre : son texte retombe sur
        // `theme.colors.primary`, qui suit le schéma système — #0057B8 sur
        // `backgroundDark` tombe à 2,86:1. `primaryDark` donne 6,92:1.
        textColor={tokens.color.primaryDark}
        onPress={onLower}
      >
        {t('call.lowerHand')}
      </Button>
    </View>
  );
}
```

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/screens/room/handBanner.spec.tsx
npx prettier --check src/screens/room/handBanner.tsx src/screens/room/handBanner.spec.tsx
```

5 tests verts.

- [ ] **Step 4 : éprouver par mutation**

Trois mutations, chacune rouge :

1. supprimer `if (!raised) return null;`
2. `{t('call.handPosition', { position })}` → `{t('call.handPosition', { position: 1 })}`
3. retirer `style={styles.text}` de `hand-banner-text`

- [ ] **Step 5 : committer**

`feat(call): Show a banner while your own hand is raised`

---

### Task 7 : accueillir la commande dans le menu « plus »

**Files:**
- Modify: `src/screens/room/moreMenu.tsx`
- Modify (tests): `src/screens/room/moreMenu.spec.tsx`

**Interfaces:**
- Consumes :
  - `HandControl(props: { raised: boolean; busy: boolean; hands: readonly RaisedHand[]; onToggle: () => void }): React.ReactElement`
    de `src/screens/room/handControl` (tâche 5)
  - `type RaisedHand` de `src/call/hands` (tâche 1)
- Produces : `MoreMenuProps` gagne **quatre** props, toutes `readonly` :
  ```ts
  readonly handRaised: boolean;
  readonly handBusy: boolean;
  readonly hands: readonly RaisedHand[];
  readonly onToggleHand: () => void;
  ```

Le menu possède sa visibilité et **se referme lui-même avant d'appeler le rappel du parent** —
`HandControl` n'a rien à savoir du menu qui le contient, exactement comme `RecordingControl`. La
troisième entrée suit donc la règle des deux premières, sans exception : un menu qui reste ouvert
masque la scène et invite au second appui.

`HandControl` est rendu **après** `RecordingControl`, donc en dernier : les deux commandes rares
d'abord — partager, enregistrer — puis la commande fréquente et sa file, la plus proche du pouce
qui vient d'ouvrir le menu par le bas.

- [ ] **Step 1 : écrire les tests qui échouent**

Dans `src/screens/room/moreMenu.spec.tsx`, l'import et le fixture :

```tsx
import type { RaisedHand } from 'src/call/hands';
import type { RecordingState } from 'src/call/recording';
```

```tsx
const ADA: RaisedHand = {
  identity: 'u-ada',
  name: 'Ada',
  raisedAt: Date.parse('2026-07-30T10:00:01Z'),
  isLocal: false,
};
```

`Overrides` et `menu()` gagnent les quatre props :

```tsx
type Overrides = {
  recording?: RecordingState;
  canRecord?: boolean;
  recordingBusy?: boolean;
  handRaised?: boolean;
  handBusy?: boolean;
  hands?: readonly RaisedHand[];
  onShare?: () => void;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
  onToggleHand?: () => void;
};

function menu(overrides: Overrides = {}): React.ReactElement {
  return withPaper(
    <MoreMenu
      recording={overrides.recording ?? IDLE}
      canRecord={overrides.canRecord ?? true}
      recordingBusy={overrides.recordingBusy ?? false}
      handRaised={overrides.handRaised ?? false}
      handBusy={overrides.handBusy ?? false}
      hands={overrides.hands ?? []}
      onShare={overrides.onShare ?? jest.fn()}
      onStartRecording={overrides.onStartRecording ?? jest.fn()}
      onStopRecording={overrides.onStopRecording ?? jest.fn()}
      onToggleHand={overrides.onToggleHand ?? jest.fn()}
    />,
  );
}
```

Le premier test du fichier gagne une ligne — rien du menu n'est monté avant l'ouverture :

```tsx
  it('ne montre rien avant l’ouverture', async () => {
    await render(menu());

    expect(screen.queryByTestId('recording-toggle')).toBe(null);
    expect(screen.queryByTestId('share-btn')).toBe(null);
    expect(screen.queryByTestId('hand-toggle')).toBe(null);
  });
```

Et **cinq tests de plus**, à la fin du `describe('MoreMenu')` :

```tsx
  it('lève la main et referme le menu, comme ses deux voisines', async () => {
    // Rien ne garantit qu'une entrée referme le menu parce que ses voisines le
    // font : le `setVisible(false)` est écrit une fois par entrée.
    const onToggleHand = jest.fn();
    const onShare = jest.fn();
    await render(menu({ onToggleHand, onShare }));

    await open();
    await waitFor(() => expect(screen.getByTestId('hand-toggle')).toBeTruthy());
    expect(screen.getByTestId('hand-toggle')).toHaveTextContent('call.raiseHand');
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    expect(onToggleHand).toHaveBeenCalledTimes(1);
    expect(onShare).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('hand-toggle')).toBe(null));
  });

  it('devient une baisse quand la main est levée', async () => {
    await render(menu({ handRaised: true }));

    await open();

    await waitFor(() => expect(screen.getByTestId('hand-toggle')).toBeTruthy());
    expect(screen.getByTestId('hand-toggle')).toHaveTextContent('call.lowerHand');
  });

  it('retire la commande pendant un appel en vol, sans toucher au reste', async () => {
    await render(menu({ handBusy: true, hands: [ADA] }));

    await open();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.queryByTestId('hand-toggle')).toBe(null);
    expect(screen.getByTestId('hand-queue')).toBeTruthy();
  });

  it('montre la file entière, la seconde entrée comprise', async () => {
    const bob: RaisedHand = {
      identity: 'u-bob',
      name: 'Bob',
      raisedAt: Date.parse('2026-07-30T10:00:02Z'),
      isLocal: true,
    };
    await render(menu({ hands: [ADA, bob] }));

    await open();

    await waitFor(() => expect(screen.getByTestId('hand-queue')).toBeTruthy());
    expect(screen.getByTestId('hand-queue-title')).toHaveTextContent('call.handQueue');
    // Deux entrées, et c'est la SECONDE qu'on vise : avec une seule, une liste
    // tronquée à son premier élément passerait. La numérotation elle-même est
    // gardée un étage plus bas, dans `handControl.spec.tsx` — le mock de `t`
    // de CE fichier ne rend pas les valeurs interpolées.
    expect(screen.getByTestId('hand-queue-row-u-bob')).toBeTruthy();
    expect(screen.getByTestId('hand-queue-row-u-ada')).toBeTruthy();
  });

  it('ne montre aucune file quand personne ne lève la main', async () => {
    await render(menu({ hands: [] }));

    await open();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.queryByTestId('hand-queue')).toBe(null);
  });
```

Le premier de ces cinq est **le test que le périmètre D avait dû ajouter après coup** pour son
propre `share-btn` : rien ne garantit qu'une entrée referme le menu parce que sa voisine le fait.
Le fichier en compte désormais trois, un par entrée.

- [ ] **Step 2 : écrire la modification**

Dans `src/screens/room/moreMenu.tsx`, l'import — à sa place dans le bloc `src/…` :

```tsx
import type { RaisedHand } from 'src/call/hands';
import type { RecordingState } from 'src/call/recording';
import {
  BAR_HIT_SLOP,
  BAR_ICON_COLOR,
  BAR_RIPPLE_COLOR,
  barStyles,
} from 'src/screens/room/controlBar';
import { HandControl } from 'src/screens/room/handControl';
import { RecordingControl } from 'src/screens/room/recordingControl';
```

Les props :

```tsx
export type MoreMenuProps = {
  readonly recording: RecordingState;
  readonly canRecord: boolean;
  readonly recordingBusy: boolean;
  readonly handRaised: boolean;
  readonly handBusy: boolean;
  readonly hands: readonly RaisedHand[];
  readonly onShare: () => void;
  readonly onStartRecording: () => void;
  readonly onStopRecording: () => void;
  readonly onToggleHand: () => void;
};
```

La déstructuration :

```tsx
export function MoreMenu({
  recording,
  canRecord,
  recordingBusy,
  handRaised,
  handBusy,
  hands,
  onShare,
  onStartRecording,
  onStopRecording,
  onToggleHand,
}: MoreMenuProps): React.ReactElement {
```

Et la troisième entrée, juste après `<RecordingControl … />` et avant `</Menu>` :

```tsx
      <HandControl
        raised={handRaised}
        busy={handBusy}
        hands={hands}
        onToggle={() => {
          setVisible(false);
          onToggleHand();
        }}
      />
    </Menu>
  );
}
```

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/screens/room/moreMenu.spec.tsx
```

15 tests verts (10 avant, 5 ajoutés). `call.spec.tsx` est rouge à ce stade : `CallScreen` ne passe
pas encore les quatre props. C'est la tâche 8.

- [ ] **Step 4 : éprouver par mutation**

1. `onToggle={() => { setVisible(false); onToggleHand(); }}` → `onToggle={onToggleHand}` : le test
   « lève la main et referme le menu » doit tomber, et lui seul.
2. `hands={hands}` → `hands={[]}` : « montre la file entière » doit tomber.

- [ ] **Step 5 : committer**

`feat(call): Host the raise-hand command in the more menu`

---

### Task 8 : le câblage dans la séance

**Files:**
- Modify: `src/screens/room/call.tsx`
- Modify (tests): `src/screens/room/call.spec.tsx`

**Interfaces:**
- Consumes :
  - `toggleHand(serverUrl: string, roomRef: string, livekitToken: string, raised: boolean): Promise<ApiResult<void>>`
    de `src/api/hand` (tâche 2)
  - `raisedHands(view: RoomView): readonly RaisedHand[]`,
    `isHandRaised(participant: ParticipantView): boolean`,
    `handPosition(hands: readonly RaisedHand[], identity: string): number | null`
    de `src/call/hands` (tâche 1)
  - `HandBanner(props: { raised: boolean; position: number | null; onLower: () => void }): React.ReactElement | null`
    de `src/screens/room/handBanner` (tâche 6)
  - `MoreMenuProps` étendu de quatre props (tâche 7)
  - l'existant : `roomView` (`call.tsx:229`), `access: RoomAccess | null` (`:210`),
    `account: Account | null` (`:204`), `notice`/`setNotice` (`:220`), `MessageKey` (`:64-70`)
- Produces : rien d'exporté de nouveau. `MessageKey` gagne `'call.handFailed'`.

**Le flux, et il tient en une phrase : le succès HTTP ne change rien à l'écran.**

```
appui sur « Lever la main »
  └─ handBusy déjà vrai ?  → on ne fait rien (garde par VALEUR, jamais par `disabled`)
  └─ setHandBusy(true) ; la commande disparaît du menu
  └─ toggleHand(serverUrl, access.room.id ?? access.room.slug, access.token, !handRaised)
       ├─ result.ok       → setHandBusy(false) ; setNotice(null).  RIEN D'AUTRE.
       └─ !result.ok      → setHandBusy(false) ; setNotice('call.handFailed')
  … indépendamment, plus tard :
  backend meet → API serveur LiveKit → RoomEvent.ParticipantAttributesChanged
    └─ createRoomViewStore.invalidate() → useSyncExternalStore → nouvelle RoomView
       └─ roomView.local.handRaisedAt !== null
          └─ la commande devient « Baisser la main », le bandeau apparaît
```

C'est l'attribut qui décide, et lui seul (§2.4) : entre le `200` et l'arrivée de l'attribut il y a
**deux sauts réseau**, et le `200` n'est **pas** la preuve que quiconque a vu quoi que ce soit.

**Défaut connu, nommé et accepté** : dans cette fenêtre, la commande a cessé d'être masquée et
affiche encore l'ancien libellé. La refermer demanderait un « état désiré en attente »,
c'est-à-dire une seconde source de vérité pour la durée d'un battement de cil.

**`roomRef` supprime le cas nul.** `RoomViewSet.get_object()` tente `uuid.UUID(pk)` et retombe sur
`slug=slugify(pk)` ; la permission `HasLiveKitRoomAccess` compare ensuite
`request.auth.video.room == str(obj.id)`, ce qui vaut quel que soit le chemin d'adressage.
`Room.id` étant `string | null` (`src/call/types.ts:4`), `access.room.id ?? access.room.slug`
**supprime purement et simplement** le cas que le périmètre B a dû garder ailleurs
(`call.tsx:511-512`, la garde `if (account === null || roomId === null) return;` que portent les
trois actions de modération, et son commentaire `:496-510`). Ni garde, ni `?? ''`, ni route de la
forme `/api/v1.0/rooms//toggle-hand/`.

**Pourquoi `handBusy` est partagé entre le menu et le bandeau.** Les deux commandes portent sur le
même état, et deux requêtes concurrentes en sens opposé produiraient un résultat qui dépend de
leur ordre d'arrivée au serveur. `HandControl` retire sa commande pendant l'appel ; le bandeau,
lui, **garde la sienne** — sans quoi baisser la main deviendrait impossible au moment précis où on
veut la baisser. La garde est donc portée par la **valeur** `handBusy` dans `handleToggleHand`, et
c'est elle qui protège le chemin du bandeau.

- [ ] **Step 1 : faire du double de `Room` un vrai émetteur**

Voir E6. Dans `src/screens/room/call.spec.tsx`, `remoteParticipant()` gagne un troisième
paramètre :

```tsx
function remoteParticipant(
  identity: string,
  name: string,
  attributes: Record<string, string> = {},
): unknown {
  return {
    identity,
    name,
    isLocal: false,
    isSpeaking: false,
    attributes,
    getTrackPublication: () => undefined,
  };
}
```

Puis, juste avant la déclaration de `mockRoom` :

```tsx
// Les attributs du participant local, posés par le test qui en a besoin. Un
// accesseur, pas un champ figé : `readRoomView` les relit à chaque
// invalidation, et c'est ce qui permet de simuler l'attribut arrivant du
// serveur LiveKit **après** l'appui.
let mockLocalAttributes: Record<string, string> = {};

// Les gestionnaires attachés par les magasins, rangés par nom d'événement.
// L'ancien double rendait `on`/`off` inertes : aucun test ne pouvait alors
// distinguer une vue relue d'une vue figée au montage. `emitRoom` est la seule
// façon de faire arriver un changement d'attributs comme le fait le serveur.
const mockRoomHandlers = new Map<string, (() => void)[]>();
```

`mockRoom` change de type et de corps :

```tsx
const mockRoom: {
  localParticipant: unknown;
  remoteParticipants: Map<string, unknown>;
  readonly metadata: string | undefined;
  readonly isRecording: boolean;
  on: (event: string, handler: () => void) => unknown;
  off: (event: string, handler: () => void) => unknown;
} = {
  localParticipant: {
    identity: 'me',
    isLocal: true,
    isSpeaking: false,
    get attributes(): Record<string, string> {
      return mockLocalAttributes;
    },
    getTrackPublication: () => mockCameraPublication,
  },
  remoteParticipants: new Map<string, unknown>(),
  get metadata(): string | undefined {
    return mockRoomMetadata;
  },
  get isRecording(): boolean {
    return mockRoomIsRecording;
  },
  on(event: string, handler: () => void): unknown {
    mockRoomHandlers.set(event, [...(mockRoomHandlers.get(event) ?? []), handler]);
    return mockRoom;
  },
  off(event: string, handler: () => void): unknown {
    const attached = mockRoomHandlers.get(event) ?? [];
    const index = attached.indexOf(handler);
    if (index !== -1) attached.splice(index, 1);
    if (attached.length === 0) mockRoomHandlers.delete(event);
    return mockRoom;
  },
};

// Fait arriver un événement de Room comme le ferait le SDK, dans un `act` :
// les magasins invalident, React relit, l'écran se réaffiche.
async function emitRoom(event: string): Promise<void> {
  await act(async () => {
    for (const handler of Array.from(mockRoomHandlers.get(event) ?? [])) handler();
  });
}
```

Le `beforeEach` gagne deux remises à zéro, à côté de `mockRoom.remoteParticipants.clear()` :

```tsx
  mockRoom.remoteParticipants.clear();
  mockRoomHandlers.clear();
  mockLocalAttributes = {};
  mockRoomMetadata = undefined;
  mockRoomIsRecording = false;
```

Et le mock de `react-i18next` rend l'interpolation visible :

```tsx
// Interpolation rendue visible : sans elle, `t` rend la seule clé et un
// nombre codé en dur dans une coquille serait indiscernable du nombre calculé
// par l'écran.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}|${JSON.stringify(values)}`,
  }),
}));
```

Enfin, l'import du module d'API, dans le bloc `src/…` :

```tsx
import * as hand from 'src/api/hand';
```

- [ ] **Step 2 : vérifier que rien n'a bougé**

```
npx jest src/screens/room/call.spec.tsx
```

**68 tests verts, aucun modifié.** C'est la mesure qui autorise le reste de la tâche : le double
est devenu vivant sans changer ce que les tests existants observent. Si un test tombe ici,
**arrêter** et comprendre lequel des magasins réagit désormais à un événement qu'il ignorait.

- [ ] **Step 3 : écrire les tests de câblage qui échouent**

À la fin de `src/screens/room/call.spec.tsx`, un nouveau `describe` :

```tsx
describe('CallScreen, main levée', () => {
  // Un accès dont l'identifiant de salon ET le jeton diffèrent de ceux de
  // `GRANTED` : c'est la seule façon de distinguer une valeur transmise d'une
  // constante qui coïnciderait avec le fixture par défaut.
  const HAND_ACCESS: ApiResult<RoomAccess> = {
    ok: true,
    value: {
      room: { id: 'r-7', slug: 'reunion', name: 'Réunion', accessLevel: 'public' },
      livekitUrl: 'wss://livekit.linagora.com',
      token: 'jwt-de-salle',
      isAdministrable: false,
    },
  };

  async function openMenu(): Promise<void> {
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('hand-toggle')).toBeTruthy());
  }

  it('lève la main du salon et du jeton que le serveur a rendus', async () => {
    const toggle = jest.spyOn(hand, 'toggleHand').mockResolvedValue({ ok: true, value: undefined });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(HAND_ACCESS);

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() =>
      expect(toggle).toHaveBeenCalledWith('https://meet.linagora.com', 'r-7', 'jwt-de-salle', true),
    );
  });

  it("retombe sur le slug quand le salon n'a pas d'identifiant", async () => {
    // `Room.id` est `string | null`, et `RoomViewSet.get_object()` accepte les
    // deux formes : le repli supprime le cas nul au lieu de fabriquer
    // `/api/v1.0/rooms//toggle-hand/`.
    const toggle = jest.spyOn(hand, 'toggleHand').mockResolvedValue({ ok: true, value: undefined });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
      ok: true,
      value: {
        room: { id: null, slug: 'salon-sans-uuid', name: 'R', accessLevel: 'public' },
        livekitUrl: 'wss://livekit.linagora.com',
        token: 'jwt-de-salle',
        isAdministrable: false,
      },
    });

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() => expect(toggle.mock.calls[0]?.[1]).toBe('salon-sans-uuid'));
  });

  it("n'affiche rien de plus au succès HTTP : c'est l'attribut qui décide", async () => {
    // Le `200` ne prouve pas que quiconque a vu quoi que ce soit. Le backend
    // écrit un attribut, et c'est le serveur LiveKit qui le diffuse — deux
    // sauts plus loin.
    jest.spyOn(hand, 'toggleHand').mockResolvedValue({ ok: true, value: undefined });

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() => expect(hand.toggleHand).toHaveBeenCalled());
    expect(screen.queryByTestId('hand-banner')).toBeNull();

    // … puis l'attribut arrive, et lui seul fait apparaître le bandeau.
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:00Z' };
    await emitRoom('participantAttributesChanged');

    expect(screen.getByTestId('hand-banner')).toBeTruthy();
  });

  it('baisse la main depuis le bandeau, en un seul appui', async () => {
    // Lever est un acte qu'on prépare, baisser un acte qu'on subit : deux
    // appuis pour lever, un pour baisser, sans ouvrir aucun menu.
    const toggle = jest.spyOn(hand, 'toggleHand').mockResolvedValue({ ok: true, value: undefined });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(HAND_ACCESS);
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:00Z' };

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('hand-banner')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('hand-lower'));

    await waitFor(() =>
      expect(toggle).toHaveBeenCalledWith('https://meet.linagora.com', 'r-7', 'jwt-de-salle', false),
    );
  });

  it('ignore un second appui tant que la requête est en vol', async () => {
    // `HandControl` retire sa commande pendant l'appel ; le bandeau, lui,
    // garde la sienne — sans quoi baisser la main deviendrait impossible au
    // moment précis où on veut la baisser. La garde est donc portée par la
    // valeur `handBusy`, jamais par un `disabled`. Deux requêtes concurrentes
    // en sens opposé produiraient un résultat qui dépend de leur ordre
    // d'arrivée au serveur.
    let settle: (value: ApiResult<void>) => void = () => undefined;
    const toggle = jest.spyOn(hand, 'toggleHand').mockReturnValue(
      new Promise<ApiResult<void>>((resolve) => {
        settle = resolve;
      }),
    );
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:00Z' };

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('hand-lower')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('hand-lower'));
    await fireEvent.press(screen.getByTestId('hand-lower'));

    expect(toggle).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle({ ok: true, value: undefined });
    });
  });

  it('montre sa position dans la file, celle du serveur et pas la première', async () => {
    // Deux mains levées avant la sienne : avec une seule, une position codée
    // en dur à 1 passerait.
    mockRoom.remoteParticipants.set(
      'u-ada',
      remoteParticipant('u-ada', 'Ada', { handRaisedAt: '2026-07-30T10:00:01Z' }),
    );
    mockRoom.remoteParticipants.set(
      'u-bob',
      remoteParticipant('u-bob', 'Bob', { handRaisedAt: '2026-07-30T10:00:02Z' }),
    );
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:03Z' };

    await render(withPaper(<CallScreen />));

    await waitFor(() => expect(screen.getByTestId('hand-banner-position')).toBeTruthy());
    // Troisième, pas première : un `position={1}` codé en dur dans la coquille
    // passerait sans les deux mains levées avant la sienne.
    expect(screen.getByTestId('hand-banner-position')).toHaveTextContent(
      'call.handPosition|{"position":3}',
    );
  });

  it('montre la file entière dans le menu, dans son ordre', async () => {
    mockRoom.remoteParticipants.set(
      'u-bob',
      remoteParticipant('u-bob', 'Bob', { handRaisedAt: '2026-07-30T10:00:02Z' }),
    );
    mockRoom.remoteParticipants.set(
      'u-ada',
      remoteParticipant('u-ada', 'Ada', { handRaisedAt: '2026-07-30T10:00:01Z' }),
    );

    await render(withPaper(<CallScreen />));
    await openMenu();

    expect(screen.getByTestId('hand-queue-row-u-ada')).toBeTruthy();
    expect(screen.getByTestId('hand-queue-row-u-bob')).toBeTruthy();
    // Ada a levé la main une seconde avant Bob : c'est l'horodatage du serveur
    // qui ordonne, pas l'ordre d'insertion dans la Map du SDK.
    const rows = screen.getAllByTestId(/^hand-queue-row-/);
    expect(nth(rows, 0).props.testID).toBe('hand-queue-row-u-ada');
  });

  it("dit l'échec sans bouger l'état affiché", async () => {
    // L'échec ordinaire de `toggleHand` est une *valeur* résolue, jamais un
    // rejet : un `.catch()` seul ne verrait pas passer un 403.
    jest.spyOn(hand, 'toggleHand').mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.handFailed'),
    );
    expect(screen.queryByTestId('hand-banner')).toBeNull();
  });

  it('ne confond pas un 401 de salle avec une session expirée', async () => {
    // `error.unauthorized` s'affiche « Session expired » : un 401 de
    // `toggle-hand` ne dit rien de la session OIDC, qui est valide.
    jest.spyOn(hand, 'toggleHand').mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.handFailed'),
    );
    expect(screen.getByTestId('call-notice')).not.toHaveTextContent('error.unauthorized');
  });

  it('porte aussi un rejet inattendu jusqu’à la barre', async () => {
    jest.spyOn(hand, 'toggleHand').mockRejectedValue(new Error('boom'));

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.handFailed'),
    );
  });

  it('efface le message quand un essai suivant réussit', async () => {
    const toggle = jest
      .spyOn(hand, 'toggleHand')
      .mockResolvedValue({ ok: false, error: { kind: 'network' } });

    await render(withPaper(<CallScreen />));
    await openMenu();
    await fireEvent.press(screen.getByTestId('hand-toggle'));
    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.handFailed'),
    );

    toggle.mockResolvedValue({ ok: true, value: undefined });
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('hand-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('hand-toggle'));

    await waitFor(() => expect(screen.getByTestId('call-notice')).toHaveTextContent(''));
  });
});
```

`nth()` est déjà en tête du fichier (`call.spec.tsx:21-25`) : `getAllByTestId` rend un tableau, et
`noUncheckedIndexedAccess` refuse d'y indexer sans preuve. `ApiResult` et `RoomAccess` sont déjà
importés (`:10`, `:15`).

- [ ] **Step 4 : écrire le câblage**

Dans `src/screens/room/call.tsx`, l'import du module d'API — à sa place alphabétique, **avant**
le bloc `src/api/participants` :

```ts
import { toggleHand } from 'src/api/hand';
import {
  muteParticipant,
  removeParticipant,
  updateParticipantRole,
  type ParticipantRole,
} from 'src/api/participants';
```

celui du module pur, après `src/call/devices` :

```ts
import { handPosition, isHandRaised, raisedHands } from 'src/call/hands';
```

et celui de la coquille, avant `src/screens/room/moreMenu` :

```ts
import { HandBanner } from 'src/screens/room/handBanner';
```

`MessageKey` gagne une variante :

```ts
type MessageKey =
  | 'error.network'
  | 'error.unauthorized'
  | 'call.ended'
  | 'call.permissionsDenied'
  | 'call.deviceSwitchFailed'
  | 'call.handFailed'
  | RecordingMessageKey;
```

Un état, juste après `recordingBusy` :

```ts
  const [recordingBusy, setRecordingBusy] = useState(false);
  // Une requête en vol, jamais un état désiré : l'affichage suit l'attribut,
  // et lui seul. Partagé par la commande du menu et par le bandeau, qui
  // portent sur le même état — deux requêtes concurrentes en sens opposé
  // produiraient un résultat qui dépend de leur ordre d'arrivée au serveur.
  const [handBusy, setHandBusy] = useState(false);
```

Trois dérivations, juste après le `useMemo` qui construit `participants` :

```ts
  // La file est dérivée de la même vue, sans second magasin : le store est
  // déjà invalidé par `ParticipantAttributesChanged`, et `readRoomView`
  // reconstruit la vue entière.
  const hands = useMemo(() => raisedHands(roomView), [roomView]);
  const handRaised = isHandRaised(roomView.local);
  const handRank = handPosition(hands, roomView.local.identity);
```

Le gestionnaire, juste avant `handleToggleParticipants` :

```ts
  // L'état du bouton suit l'attribut, jamais l'appui : c'est le seul affichage
  // qui ne peut pas mentir. Le `200` HTTP ne change rien à l'écran — le
  // backend écrit un attribut, et c'est le serveur LiveKit qui le diffuse,
  // deux sauts plus loin.
  //
  // `result.ok` d'abord, un `.catch()` séparé pour l'exception inattendue :
  // l'échec ordinaire de `toggleHand` est une *valeur* résolue, jamais un
  // rejet — un `.catch()` seul ne verrait jamais passer un 403.
  //
  // La garde porte sur `handBusy` par *valeur* : `disabled` est interdit sur
  // cet écran, Paper le teste avant toute couleur explicite.
  const handleToggleHand = (): void => {
    if (account === null || access === null || handBusy) return;
    setHandBusy(true);
    toggleHand(
      account.instance.serverUrl,
      // `RoomViewSet.get_object()` tente l'UUID puis retombe sur le slug : les
      // deux formes résolvent le même objet, et le repli supprime purement et
      // simplement le cas `room.id === null`.
      access.room.id ?? access.room.slug,
      access.token,
      !handRaised,
    )
      .then((result) => {
        setHandBusy(false);
        setNotice(result.ok ? null : 'call.handFailed');
      })
      .catch(() => {
        setHandBusy(false);
        setNotice('call.handFailed');
      });
  };
```

Le bandeau, juste après `<RecordingIndicator … />` et avant le ternaire du panneau :

```tsx
      <RecordingIndicator state={recordingState} />

      {/* Une main levée oubliée serait invisible pour qui l'a levée : ce
          bandeau la dit, et la baisse en un seul appui. Ne rend rien au repos,
          donc toujours monté, jamais enveloppé d'une condition. La bande
          empile ses lignes : l'indicateur d'enregistrement et celui-ci
          peuvent être vrais en même temps. */}
      <HandBanner raised={handRaised} position={handRank} onLower={handleToggleHand} />
```

Et les quatre props du menu :

```tsx
        <MoreMenu
          recording={recordingState}
          canRecord={canRecord}
          recordingBusy={recordingBusy}
          handRaised={handRaised}
          handBusy={handBusy}
          hands={hands}
          onShare={handleShare}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          onToggleHand={handleToggleHand}
        />
```

**Rien d'autre ne bouge dans `call.tsx`** : ni `styles.controls`, ni le nombre de cibles, ni
`handleShare`, ni la `Snackbar`, ni le ternaire `participantsOpen`.

- [ ] **Step 5 : lancer la barre entière**

```
npx tsc --noEmit
npx jest
npx eslint . --ext .ts,.tsx
npx prettier --check .
```

**Attendu : 605 tests verts sur 50 suites**, `tsc` propre, un seul avertissement de lint (celui,
pré-existant, de `src/i18n/index.ts:32`), `prettier` vert.

- [ ] **Step 6 : éprouver par mutation**

Huit mutations sur `call.tsx`, chacune rouge :

1. `!handRaised,` → `true,` — le test « baisse la main depuis le bandeau » tombe
2. `access.room.id ?? access.room.slug,` → `access.room.slug,`
3. `access.token,` → `'lk',` (le jeton du fixture `GRANTED`, celui que `HAND_ACCESS` évite)
4. `setNotice(result.ok ? null : 'call.handFailed');` → `setNotice(null);`
5. supprimer le `setNotice('call.handFailed')` du `.catch()`
6. `position={handRank}` → `position={1}`
7. `hands={hands}` → `hands={[]}`
8. `if (account === null || access === null || handBusy) return;` → retirer `|| handBusy`

- [ ] **Step 7 : committer**

`feat(call): Raise and lower your hand from the meeting`

---

## Ce que ce plan ne fait pas

Écrit, donc opposable. Une limite tue n'est pas un livrable.

- **Aucun panneau, aucun `InteractionPanel`, aucun `more-toggle`.** Voir l'arbitrage de tête.
  C3 paiera la conversion, et ce plan la rend uniforme.
- **Aucune réaction, aucun chat.** Ce sont C2 et C3. Aucun fichier de ce plan ne les prépare, et
  aucune prop de `MoreMenuProps` ne leur est réservée d'avance.
- **Aucun `src/call/handStore.ts`.** La main levée passe par le magasin de vue existant ; il n'y a
  pas de troisième décalque à écrire, donc pas de `createRoomSnapshotStore` à extraire.
- **Aucun appel à `setAttributes()`.** Le jeton émis par meet porte
  `can_update_own_metadata=False` (§3.4) : le chemin du bundle web déployé ne peut pas
  fonctionner. Ne pas l'essayer.
- **Aucun moyen de baisser la main d'un autre** (§5.C15). C'est un autre endpoint
  (`POST /rooms/{id}/update-participant/`), une autre authentification (session OIDC) et une autre
  permission (`HasPrivilegesOnRoom`). **Renversable, et cela appartient au partenaire** : le coût
  serait une fonction de plus dans `src/api/participants.ts` — qui passe, elle, par `authedFetch`
  sans aucune difficulté — et un bouton dans le panneau de participants.
- **La main n'est jamais relevée automatiquement au retour, et rien ne prévient** (§5.C14).
  `handRaisedAt` disparaît avec le participant ; la relever pour le compte de quelqu'un le ferait
  demander la parole sans l'avoir demandé.
- **Aucune position de file dans le panneau de participants du périmètre B** (§5.C16). Ce panneau
  utilise délibérément l'ordre stable de la `Room` et ne se réordonne pas ; une main levée y
  ajouterait un tri mouvant que B a explicitement refusé. **Le panneau de B n'est pas touché par
  ce plan — pas une ligne.**
- **Aucun son, aucune notification hors premier plan, aucune vocalisation.** Il faudrait du push
  et un backend meet qui sache en émettre ; aucun endpoint d'abonnement n'existe. Même conclusion
  que B et que D.
- **Aucun réessai automatique.** Un rejeu masquerait un jeton invalide derrière une latence.
- **Aucune bascule vers `unauthorized`**, jamais, sur ce chemin.

---

## Ce qu'aucun test de ce plan ne prouve

- **Les couleurs perçues.** RNTL ne rastérise rien : le contraste ne se mesure qu'en lisant le
  thème, le fond et le composant ensemble — ou sur un appareil. Les cinq ratios du tableau des
  contraintes globales sont **calculés depuis les valeurs de tokens**, pas relevés à l'écran. Les
  `toHaveStyle` prouvent seulement que la couleur explicite n'a pas été retirée.
- **La largeur de la barre.** RNTL ne fait pas de mise en page. Les 357 dp sont de l'arithmétique
  sur des constantes. Ce plan n'y touche pas, mais la vérification sur un appareil de 360 dp reste
  due depuis le périmètre A.
- **Que la file tienne dans la hauteur du menu.** `Menu` calcule `scrollableMenuHeight` et
  enveloppe son contenu dans un `ScrollView` **au-delà de la fenêtre** — lu dans la source
  (`Menu.tsx:497-545`, `:687-693`), **jamais exécuté sous Jest**, qui ne mesure aucune vue. Une
  réunion à quinze mains levées est le cas à regarder sur appareil.
- **Que quoi que ce soit soit arrivé à quelqu'un d'autre.** Chaque test tient un seul bout du fil.
  Qu'un attribut soit réellement diffusé par le serveur LiveKit : **deux appareils sont la seule
  preuve**, et le simulateur iOS ne publie ni caméra ni micro (`AGENTS.md`) — donc au moins un des
  deux est un appareil réel.
- **Que `UpdateParticipantRequest` fusionne les attributs plutôt que de les remplacer.**
  `toggle_hand` n'envoie que `{"handRaisedAt": …}` ; si l'API serveur remplaçait la carte entière,
  lever la main effacerait `color`, `room_role` et `is_authenticated` — que cette application ne
  lit pas, mais que le client web lit. **Le risque est hérité de meet, pas introduit ici** :
  `toggle-hand` est son chemin nominal, et si la sémantique était destructive le client web serait
  déjà cassé par sa propre fonctionnalité. Ce qui le trancherait : un appel réel, puis la lecture
  de `participant.attributes` depuis un second client.
- **La latence réelle des deux sauts.** C'est elle qui dit si le défaut nommé en tâche 8 est
  imperceptible ou gênant. À mesurer : de l'appui à l'apparition du bandeau.

### Les trois mesures à faire sur appareil

1. **La barre à 360 dp**, sept cibles, aucune coupée, aucune jointive.
2. **La latence d'un aller-retour `toggle-hand`**, de l'appui à l'apparition du bandeau.
3. **Une main levée entre un mobile et un client web**, dans les deux sens — le seul moyen de
   prouver que l'attribut circule, et que l'ordre de la file est le même des deux côtés.

---

## Journal de prototypage

Tout le code de ce plan a été écrit, lancé et supprimé dans le worktree `scope-c` avant que le
plan ne soit rédigé. Ce qui suit est mesuré, pas estimé.

**Barre de qualité finale du prototype** : 605 tests / 50 suites verts, contre **546 / 46**
mesurés sur la branche propre avant toute écriture. `tsc` propre, `eslint` sans erreur nouvelle,
`prettier --check .` vert.

**Répartition des 59 tests ajoutés** : `hands.spec.ts` 15 · `hand.spec.ts` 11 ·
`handControl.spec.tsx` 9 · `handBanner.spec.tsx` 5 · `participants.spec.ts` +3 ·
`moreMenu.spec.tsx` +5 · `call.spec.tsx` +11 (dont 1 ajouté **après** la première passe de
mutation, voir ci-dessous). Somme : 15 + 11 + 9 + 5 + 3 + 5 + 11 = 59.

**32 mutations éprouvées, 32 rouges.** Les six du module pur, les sept du module d'API (dont la
réécriture vers `authedFetch`), les deux de la projection, les cinq de `HandControl`, les trois de
`HandBanner`, les deux de `MoreMenu`, les huit de `call.tsx`.

**Ce que la mutation a trouvé et qu'une relecture n'aurait pas trouvé — quatre choses :**

1. **Un test qui ne compilait pas comme prévu.** `toHaveTextContent('"name":"Bob"')` compare la
   chaîne **entière**, pas un fragment : il faut une expression régulière. Deux tests de
   `handControl.spec.tsx` étaient rouges à la première exécution.
2. **Un mock de traduction qui rendait une valeur invisible.** Avec `t: (key) => key`, le test de
   position dans `call.spec.tsx` passait sur un `position={1}` codé en dur. Le mock a été rendu
   interpolant — et **vérifié : aucune des 68 assertions existantes du fichier n'en souffre**.
3. **Une garde entièrement non couverte.** `if (… || handBusy) return;` **survivait** à sa
   mutation : `HandControl` masque sa commande pendant l'appel, donc aucun test ne pouvait
   appuyer deux fois — sauf par le bandeau, dont la commande, elle, reste. Le test « ignore un
   second appui tant que la requête est en vol » a été écrit pour cela, et il tue la mutation.
4. **Un test de menu dont le titre promettait plus que l'assertion.** Le test de file dans
   `moreMenu.spec.tsx` s'annonçait « avec les positions » alors que le mock de `t` de ce
   fichier-là ne les rend pas. Il a été renommé, et la garde de numérotation laissée à
   `handControl.spec.tsx`, où elle mord.

**Ce qui n'a pas été prototypé** — donc ce qu'un implémenteur doit surveiller :

- l'ordre exact des trois entrées à l'écran (le prototype rend `HandControl` en dernier ; rien
  dans les tests ne l'impose, seul l'ordre du JSX le décide) ;
- le rendu réel du `ScrollView` du `Menu` sur une file longue (voir ci-dessus) ;
- tout ce qui demande deux appareils.
