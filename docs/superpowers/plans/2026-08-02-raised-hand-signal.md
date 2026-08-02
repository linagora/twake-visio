# Signaler une main levée — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rendre visible sur l'écran principal, sans ouvrir quoi que ce soit, qu'une **autre**
personne demande la parole — et faire survivre au plein écran les deux bandeaux qui attendent
une réponse de vous.

**Architecture:** un sélecteur pur d'une ligne dans `src/call/hands.ts`, un composant de
présentation neuf `src/screens/room/raisedHandsBanner.tsx` (aucun état, aucun bouton, rend `null`
au repos), une ligne de plus dans la bande de `call.tsx`, et la **scission** de la garde de plein
écran qui enveloppait les trois bandeaux d'un seul bloc. Aucune plomberie : `raisedHands(roomView)`
est déjà calculé à `call.tsx:454` et déjà passé à la barre.

**Tech Stack:** React Native 0.86 / Expo SDK 57, `react-native-paper` 5.15.3,
`@testing-library/react-native` 14 (asynchrone), i18next à sept locales.

**Conception de référence :** `docs/superpowers/specs/2026-08-02-raised-hand-signal-design.md`
(à lire en entier avant la tâche 2 ; sa section « Ce qui transfère du chat » explique pourquoi ce
n'est pas une pastille).

---

## Global Constraints

Chaque tâche hérite implicitement de cette section.

- **Base :** branche `plan/hand`, partant de `main` à `3861227`. `node_modules` est un lien
  symbolique : **ne jamais lancer `npm install` ni `npx expo install`**.
- **La barre, à la fin de CHAQUE tâche, dans cet ordre :** `npm test`, `npm run typecheck`,
  `npm run lint`, `npx prettier --check .`. Les quatre doivent passer.
- **Ligne de base mesurée à `3861227` :** **936 tests / 62 suites**, **exactement 3 avertissements
  de lint** préexistants (`src/auth/oidc.ts:10`, `src/auth/oidc.ts:11`, `src/i18n/index.ts:32`),
  `prettier --check` propre, `tsc --noEmit` propre. Un quatrième avertissement est une régression.
- **Comptes attendus après chaque tâche** (mesurés, pas estimés — chacun des quatre états a été
  construit et exécuté) : **T1 → 939 / 62**, **T2 → 946 / 63**, **T3 → 946 / 63**,
  **T4 → 949 / 63**.
- **Aucun style en ligne.** Jamais de littéral `style={{…}}` : toujours `StyleSheet.create`
  alimenté par `src/ui/tokens`.
- **Couleur explicite obligatoire sur tout ce qui se pose sur cet écran.** `call.tsx` force
  `backgroundDark` dans les deux schémas ; le thème Paper, lui, suit le schéma système et fait
  retomber son texte sur `theme.colors.onSurface` = `textLight` en clair. Chaque `Text` de ce lot
  porte `color: tokens.color.textDark` — **16,65:1** sur `backgroundDark`, contre **1,08:1** sans.
- **Rendu conditionnellement, jamais basculé par une prop que le composant consomme.** Une prop
  qu'un composant Paper déstructure avant d'étaler le reste n'atteint **jamais** l'élément hôte :
  `props.visible` y vaut `undefined`, et une assertion dessus est verte dans les deux états
  (`Badge.tsx:59-60`, `Snackbar`, `KeyboardAvoidingView` — trois instances mesurées le
  2026-08-01). C'est la raison pour laquelle la pastille du chat est rendue conditionnellement, et
  c'est la même ici.
- **Aucun bouton dans le nouveau bandeau.** Ni `Button`, ni `IconButton` : donc aucune question de
  `rippleColor`, et aucune de `disabled` — que `IconButton/utils.ts:88-93` teste **avant**
  `customIconColor`, ce qu'aucune couleur explicite ne rattrape.
- **RNTL 14 est asynchrone :** `render`, `fireEvent`, `.press`, `.rerender`, `renderHook`,
  `cleanup` rendent tous des promesses. **Chaque appel prend `await`.** `tsc` ne le signale pas.
- **`toHaveTextContent` sous RNTL 14 compare la chaîne ENTIÈRE** (`exact = true` par défaut). Ce
  n'est pas `includes()`. Toutes les assertions de ce plan en tiennent compte.
- **Sept locales (`en fr es it de vi ru`), toutes remplies avant la fusion.** Aucune chaîne
  d'interface en dur. `src/i18n/index.spec.ts:17-22` exige l'**égalité exacte des ensembles de
  clés** entre les sept : **aucun suffixe de pluriel i18next** (`_one`, `_other`, …) — le russe a
  quatre catégories là où l'anglais en a deux, et tout suffixe casserait ce test.
- **Nommage des props de geste :** ce lot n'en introduit aucune, mais si l'on en ajoutait une, elle
  se préfixerait (`onRowPress`) et ne reprendrait jamais `onPress` tel quel.
- **Sujet de commit :** Conventional Commits, mode impératif, sentence-case autorisé (le dépôt
  surcharge `subject-case`).

### La règle du plein écran, telle que le propriétaire l'a arrêtée

À citer telle quelle, et elle vaut pour chaque cas que ce lot touche :

> **Le plein écran masque la barre et les commandes, jamais une demande qui attend une réponse.**

Application, cas par cas :

| Surface | En plein écran | Pourquoi |
| --- | --- | --- |
| `WaitingBanner` — quelqu'un frappe à la porte | **visible** (changement) | il attend votre réponse, et il est enfermé dehors |
| `RaisedHandsBanner` — la main d'un **autre** | **visible** (neuf) | il attend que vous lui donniez la parole |
| `HandBanner` — **votre propre** main | masqué (inchangé) | elle n'attend rien de vous : c'est un rappel, son destinataire est en face |
| `RecordingIndicator` | masqué (inchangé) | il énonce l'état du monde |
| `ReactionOverlay` | masqué (inchangé) | les bulles passent d'elles-mêmes |
| Message de reconnexion, `Snackbar` | visibles (inchangé) | **autre raison, inchangée** : leur absence rendrait l'écran trompeur |

**Conséquence documentaire, qui fait partie du travail et non de son après-coup.** Le commentaire
de `call.tsx:984-994` énonce aujourd'hui le critère comme « survit ce dont l'absence rendrait
l'écran TROMPEUR ». Ce critère décrivait exactement le code d'alors ; il ne décrira plus celui-ci,
puisqu'une main levée qu'on ne voit pas est **manquée** et non mensongère, et qu'elle survivra
quand même. Le critère de la tromperie ne disparaît pas pour autant : il reste la raison —
distincte — du message de reconnexion et de la `Snackbar`. **Deux raisons de survivre, donc, et non
une seule.**

**Il y a TROIS commentaires à réécrire** — le plan en annonçait deux, l'implémentation en a trouvé
un troisième (voir la correction dans la tâche 3, Step 4) : celui de la garde (`call.tsx:921-937`),
celui du message de reconnexion (`call.tsx:981-998`), qui énonce le critère de la tromperie comme
critère **unique** et donne « une demande d'admission, elle, est manquée sans que rien ne mente » en
exemple de ce qui **ne** survit **pas**, et celui du `ReactionOverlay` (`call.tsx:1050-1052`), qui
cite la règle remplacée comme si elle était courante. Les deux premiers sont prescrits mot pour mot
par les tâches 3 et 4, **à l'endroit du code** ; le troisième l'est par la correction de la tâche 3.
Aucun test ne rougit sur un commentaire : c'est la raison de les prescrire plutôt que de les laisser
à la relecture.

---

## Recensement : conditionnelles et effets, comptés AVANT d'écrire les tâches

`AGENTS.md` demande de compter les conditionnelles et les **instructions** de chaque gestionnaire
avant d'écrire les tests, d'exiger un test par conditionnelle dont la fixture rend la condition
vraie **et** fausse, et de **muter la branche, jamais le prédicat qui l'alimente**. Voici le
compte, écrit **par motif** puis multiplié par les fichiers qui l'instancient.

### Conditionnelles — 9 au total

| # | Où | Condition | Fixture vraie | Fixture fausse | Test |
| --- | --- | --- | --- | --- | --- |
| C1 | `hands.ts` `otherRaisedHands` | `!hand.isLocal` | une main distante | une main **locale** | T1-a |
| C2 | `raisedHandsBanner.tsx` | `first === undefined` | `hands={[]}` | `hands={[ADA]}` | T2-a / T2-b…g |
| C3 | `raisedHandsBanner.tsx` | `name.length > 0` | `'Ada'` | `'   '` | T2-b / T2-e |
| C4 | `raisedHandsBanner.tsx` | `others > 0` | 2 ou 3 mains | 1 main | T2-c / T2-d |
| C5 | `call.tsx` | `fullscreenTile === null` **→ `RecordingIndicator`** | hors plein écran | en plein écran | existant, conservé |
| C6 | `call.tsx` | `fullscreenTile === null` **→ `HandBanner`** | hors plein écran | en plein écran | existant, conservé |
| C7 | `call.tsx` | `fullscreenTile === null` **→ `ReactionOverlay`** | hors plein écran | en plein écran | existant, conservé |
| C8 | `call.tsx` | `WaitingBanner` **hors** de la garde | — | — | T3-a (inversé) |
| C9 | `call.tsx` | `RaisedHandsBanner` **hors** de la garde | — | — | T4-a |

**La scission multiplie les branches, et c'est précisément le compte qu'il fallait faire.** Avant
ce lot, `fullscreenTile === null` gouvernait **un** fragment de trois bandeaux plus l'incrustation
des réactions ; après, il gouverne **deux** locataires, et **deux** surfaces lui échappent
explicitement. Figer `fullscreenTile` rougirait dès qu'une seule des cinq est observée — c'est la
fausse assurance que `AGENTS.md` décrit. **Les mutations prescrites ci-dessous portent donc sur la
BRANCHE** : déplacer un élément d'un côté à l'autre de la garde, un par un.

### Effets — 0 gestionnaire, et c'est vérifié plutôt que supposé

`RaisedHandsBanner` **ne reçoit ni ne pose aucun rappel** : ni `onPress`, ni `onLongPress`, aucun
élément pressable. Il n'y a donc **aucun corps de gestionnaire dont énumérer les instructions**, et
aucune conditionnelle qui choisisse entre des rappels. C'est un fait de conception, pas un oubli du
recensement : la conception le prescrit (« Aucun bouton »), et c'est ce qui rend ce lot immunisé au
motif qui a produit les trois trous du lot des panneaux.

Côté `call.tsx`, le lot ajoute **une** expression (`useMemo` sur `otherRaisedHands`) et **zéro**
gestionnaire.

### Tableau des mutations, par motif

Chaque ligne a été **exécutée** contre l'implémentation de référence pendant la rédaction de ce
plan ; la colonne « rouges » donne le nombre de tests qui échouent réellement.

**Motif A — un filtre pur** (instancié par `otherRaisedHands`) :

| Mutation | Rouges | Test qui localise |
| --- | --- | --- |
| `!hand.isLocal` → `hand.isLocal` | 2 | T1-a, T1-b |
| `hands.filter(…)` → `hands` | 1 | T1-a |
| ajouter un `.sort()` par identité | 1 | T1-b |

**Motif B — une coquille de présentation à trois conditionnelles** (instancié par
`RaisedHandsBanner`) :

| Mutation | Rouges | Test qui localise |
| --- | --- | --- |
| garde `first === undefined` neutralisée | 1 | T2-a |
| `hands[0]` → `hands[1]` | 3 | T2-b (+ T2-c, T2-e par effet de bord) |
| `hands.length - 1` → `hands.length` | 2 | T2-c, T2-d |
| `others > 0` → `others >= 0` | 1 | T2-d |
| repli de nom supprimé | 1 | T2-e |
| `color` retirée de `styles.name` | 1 | T2-f |
| `color` retirée de `styles.others` | 1 | T2-f |
| `numberOfLines={1}` retiré | 1 | T2-g |
| `flexShrink: 1` retiré | 1 | T2-g |

**Motif C — une surface déplacée à travers la garde de plein écran** (instancié quatre fois dans
`call.tsx`) :

| Mutation | Rouges | Test qui localise |
| --- | --- | --- |
| `WaitingBanner` remis **dans** la garde | 1 | T3-a |
| `RaisedHandsBanner` mis **dans** la garde | 1 | T4-a |
| `RecordingIndicator` sorti **de** la garde | 1 | existant, « masque l'indicateur d'enregistrement » |
| `HandBanner` sorti **de** la garde | 1 | existant, « masque le bandeau de main levée » |

**Motif D — une valeur passée à une coquille** :

| Mutation | Rouges | Test qui localise |
| --- | --- | --- |
| `hands={otherHands}` → `hands={hands}` | 2 | T4-b, T4-c |

---

## Deux pièges de la conception, à ne pas défaire

**1. `theme.fonts.default` ne porte ni `fontSize` ni `lineHeight`.** Ces bandeaux rendent un `Text`
**sans `variant`**, qui retombe sur `theme.fonts.default` — un simple `regularType`
(`v3/tokens.tsx:216-218`). La hauteur d'une ligne n'est donc **pas dérivable** de la feuille de
style de Paper : elle est celle que la plateforme compose pour la taille par défaut de React
Native, et elle suit le `fontScale` de l'appareil. **Ce qui est exact :** les 16 dp de rembourrage,
`paddingVertical: tokens.spacing.sm` (= 8) de part et d'autre — `tokens.spacing.sm` vaut 8, vérifié
dans `src/ui/tokens/index.ts`. **Ce qui est un ordre de grandeur :** les ~20 dp de la ligne de
texte, et donc les ~128 dp du pire cas empilé. **Ne pas transformer l'un en l'autre** dans un
commentaire ou un test.

**2. La troncature du nom, décidée ici plutôt qu'héritée.** La conception dit qu'elle « n'est pas
prescrite ici » et signale que `participantsPanel.tsx` a payé exactement ce défaut — un nom écrasé
à **39 px** mesurés sur appareil. **Ce plan la prescrit**, et voici la décision entière :

- `flexShrink: 1` sur le `Text` du nom. **Ce n'est pas une précaution :** la valeur par défaut de
  Yoga en React Native est **0**, à l'inverse du web. Sans elle, une phrase longue ne se réduit
  pas et pousse le compte hors de l'écran — le défaut de `participantsPanel.tsx`, à l'identique.
- `numberOfLines={1}` sur ce même `Text`, pour que la réduction tronque au lieu de passer à la
  ligne. « Une seule rangée, jamais deux » est une exigence de la conception : la hauteur du
  bandeau doit rester indépendante du nombre de mains levées.
- Le `Text` du compte **ne porte rien** : le `flexShrink: 0` par défaut de React Native est déjà
  ce qu'on veut, et l'écrire explicitement produirait un style mort — donc une assertion qui ne
  prouve rien, ce que ce dépôt refuse.
- **Ce que la troncature coupe, et l'honnêteté due :** la phrase est **une seule clé**
  (`{{name}} raised their hand`), donc c'est la **fin** de la phrase qui disparaît, le verbe avant
  le nom. C'est le bon sens de coupe : le nom est la seule information que le compte ne peut pas
  porter, et c'est l'inverse exact du bogue de `participantsPanel.tsx`, où c'était le nom qui était
  écrasé. Découper la phrase en deux `Text` pour protéger le verbe **casserait les sept
  traductions** — l'allemand met le verbe à la fin (`{{name}} hat die Hand gehoben`), et l'ordre
  des mots n'est pas le même dans deux locales.
- **Ce qu'aucun test ne prouvera** reste vrai : qu'un nom allemand long soit lisible à côté du
  compte se vérifie sur appareil, en allemand, et nulle part ailleurs.

---

## Structure des fichiers

| Fichier | Rôle | Tâche |
| --- | --- | --- |
| `src/call/hands.ts` | **modifié** : `otherRaisedHands()`, une ligne pure | 1 |
| `src/call/hands.spec.ts` | **modifié** : `describe('otherRaisedHands')`, 3 tests | 1 |
| `src/i18n/locales/{en,fr,es,it,de,vi,ru}.json` | **modifiés** : 2 clés × 7 locales | 2 |
| `src/screens/room/raisedHandsBanner.tsx` | **créé** : la coquille de présentation | 2 |
| `src/screens/room/raisedHandsBanner.spec.tsx` | **créé** : 7 tests | 2 |
| `src/screens/room/call.tsx` | **modifié** : scission de la garde + **trois** commentaires | 3 |
| `src/screens/room/call.spec.tsx` | **modifié** : 1 test inversé, describe renommé | 3 |
| `src/screens/room/call.tsx` | **modifié** : `useMemo` + la ligne du bandeau | 4 |
| `src/screens/room/call.spec.tsx` | **modifié** : 3 tests neufs | 4 |

Aucun fichier sous `app/` : le composant est un export nommé sous `src/screens/room/`, son spec à
côté, et la route ne change pas.

---

### Task 1 : `otherRaisedHands`, le sélecteur pur

**Files:**

- Modify: `src/call/hands.ts` (ajout en fin de fichier, après `handPosition`)
- Test: `src/call/hands.spec.ts` (ajout en fin de fichier, après `describe('handPosition')`)

**Interfaces:**

- Consumes: `RaisedHand` (`src/call/hands.ts:11-16`), déjà porteur de `isLocal`. Les aides
  `person()` et `view()` du spec (`src/call/hands.spec.ts:3-25`) — elles existent, elles ont été
  ouvertes et exécutées ; `person(identity, handRaisedAt, { name?, isLocal? })` et
  `view(local, remotes)`.
- Produces: `otherRaisedHands(hands: readonly RaisedHand[]): readonly RaisedHand[]` — importée par
  la tâche 4 depuis `src/call/hands`.

**Le compte des conditionnelles pour cette tâche : 1** (C1, `!hand.isLocal`). Un test dont la
fixture la rend vraie **et** fausse, plus deux tests qui gardent des mutations distinctes.

- [ ] **Step 1 : élargir l'import du spec**

Dans `src/call/hands.spec.ts`, remplacer la première ligne :

```ts
import { handPosition, isHandRaised, raisedHands, readHandRaisedAt } from 'src/call/hands';
```

par :

```ts
import {
  handPosition,
  isHandRaised,
  otherRaisedHands,
  raisedHands,
  readHandRaisedAt,
} from 'src/call/hands';
```

(La forme multi-lignes est celle que `prettier` impose à cette longueur — vérifié par
`npx prettier --check`.)

- [ ] **Step 2 : écrire les trois tests qui échouent**

À ajouter **en fin** de `src/call/hands.spec.ts`, après le `describe('handPosition')` :

```ts
describe('otherRaisedHands', () => {
  it('ne garde que les mains des autres', () => {
    // La fixture porte une main LOCALE et deux distantes : sans les deux, une
    // implémentation qui ne filtre rien passerait.
    const hands = raisedHands(
      view(person('me', '2026-07-30T10:00:02Z', { isLocal: true }), [
        person('a', '2026-07-30T10:00:01Z'),
        person('z', '2026-07-30T10:00:03Z'),
      ]),
    );

    expect(otherRaisedHands(hands).map((hand) => hand.identity)).toEqual(['a', 'z']);
  });

  it('garde l’ordre reçu, sans le retrier', () => {
    // `z` avant `a` : l'ordre du tableau et l'ordre alphabétique divergent,
    // donc un tri de confort ajouté ici rougirait.
    const hands = raisedHands(
      view(person('me', null, { isLocal: true }), [
        person('z', '2026-07-30T10:00:01Z'),
        person('a', '2026-07-30T10:00:02Z'),
      ]),
    );

    expect(otherRaisedHands(hands).map((hand) => hand.identity)).toEqual(['z', 'a']);
  });

  it('ne modifie pas la file reçue', () => {
    // Même raisonnement que pour `raisedHands` et `handPosition` :
    // `readonly RaisedHand[]` n'arrête qu'un contournement qui respecte le
    // typage, et `filter` pourrait être réécrit un jour en `splice` en place.
    const hands = raisedHands(
      view(person('me', '2026-07-30T10:00:01Z', { isLocal: true }), [
        person('a', '2026-07-30T10:00:02Z'),
      ]),
    );
    const snapshot = hands.map((hand) => ({ ...hand }));

    otherRaisedHands(hands);

    expect(hands).toEqual(snapshot);
  });
});
```

- [ ] **Step 3 : les lancer, et vérifier qu'ils échouent POUR LA BONNE RAISON**

```bash
npx jest src/call/hands.spec.ts
```

Attendu — **exécuté pendant la rédaction de ce plan, contre `3861227` :**
`Tests: 3 failed, 18 passed, 21 total`, les trois avec
`TypeError: (0 , _hands.otherRaisedHands) is not a function`.

Un autre message — en particulier une erreur de compilation sur `person` ou `view` — signifie que
l'extrait a été mal recopié, pas que le plan a tort.

- [ ] **Step 4 : écrire l'implémentation minimale**

À ajouter **en fin** de `src/call/hands.ts`, après `handPosition` :

```ts
// Le complément de `raisedHands()`, qui inclut le local à dessein. Ce qui
// s'affiche sur l'écran principal, lui, ne doit PAS le compter : `HandBanner`
// porte déjà votre propre main sur la ligne du dessus, et l'y compter une
// seconde fois ferait dire « et 1 autre » là où il n'y a personne d'autre.
//
// L'ordre reçu est conservé tel quel — c'est `raisedHands()` qui trie, et il
// n'y a pas de seconde règle d'ordre à nommer ici. `isLocal` est déjà sur
// `RaisedHand` : rien à ajouter au type.
export function otherRaisedHands(hands: readonly RaisedHand[]): readonly RaisedHand[] {
  return hands.filter((hand) => !hand.isLocal);
}
```

- [ ] **Step 5 : vérifier que les trois passent**

```bash
npx jest src/call/hands.spec.ts
```

Attendu : `Tests: 21 passed, 21 total`.

- [ ] **Step 6 : prouver que les tests mordent (motif A)**

Appliquer chaque mutation, lancer `npx jest src/call/hands.spec.ts`, **la défaire**, et vérifier
le nombre de rouges :

| Mutation | Rouges attendus |
| --- | --- |
| `!hand.isLocal` → `hand.isLocal` | 2 (`ne garde que…`, `garde l'ordre…`) |
| `return hands.filter((hand) => !hand.isLocal);` → `return hands;` | 1 (`ne garde que…`) |
| `return [...hands].filter((hand) => !hand.isLocal).sort((a, b) => a.identity.localeCompare(b.identity));` | 1 (`garde l'ordre…`) |

Les trois comptes ont été mesurés. Un zéro rouge sur l'une de ces lignes est un trou de couverture,
pas un succès.

- [ ] **Step 7 : la barre complète**

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
```

Attendu : **939 tests / 62 suites**, `tsc` propre, **3 avertissements** de lint, prettier propre.

- [ ] **Step 8 : commit**

```bash
git add src/call/hands.ts src/call/hands.spec.ts
git commit -m "feat(call): Select the raised hands that are not yours"
```

---

### Task 2 : le bandeau, et ses sept traductions

**Files:**

- Modify: `src/i18n/locales/en.json`, `fr.json`, `es.json`, `it.json`, `de.json`, `vi.json`,
  `ru.json`
- Create: `src/screens/room/raisedHandsBanner.tsx`
- Test: `src/screens/room/raisedHandsBanner.spec.tsx`

**Interfaces:**

- Consumes: `RaisedHand` (`src/call/hands.ts:11-16`) ; `tokens` (`src/ui/tokens`), dont
  `tokens.color.textDark = '#ECECEC'` et `tokens.spacing.sm = 8`.
- Produces: `RaisedHandsBanner({ hands }: RaisedHandsBannerProps): React.ReactElement | null` et
  `RaisedHandsBannerProps = { readonly hands: readonly RaisedHand[] }` — consommés par la tâche 4.
  `testID` exposés : `raised-hands-banner` (la `View` racine), `raised-hands-banner-name`,
  `raised-hands-banner-others`.

**Le compte des conditionnelles pour cette tâche : 3** (C2, C3, C4), chacune avec une fixture
vraie **et** une fausse. **Le compte des gestionnaires : 0.**

- [ ] **Step 1 : ajouter les deux clés aux sept locales**

Dans **chacun** des sept fichiers, insérer les deux lignes **immédiatement après** la ligne
`"call.handQueueEntry": "{{position}}. {{name}}",` (elle existe à l'identique dans les sept, et
elle y est en position 62 — vérifié).

`en.json` :

```json
  "call.handRaisedBy": "{{name}} raised their hand",
  "call.handRaisedOthers": "{{count}} more waiting to speak",
```

`fr.json` :

```json
  "call.handRaisedBy": "{{name}} a levé la main",
  "call.handRaisedOthers": "{{count}} autre(s) en attente de parole",
```

`es.json` :

```json
  "call.handRaisedBy": "{{name}} ha levantado la mano",
  "call.handRaisedOthers": "{{count}} más esperando para hablar",
```

`it.json` :

```json
  "call.handRaisedBy": "{{name}} ha alzato la mano",
  "call.handRaisedOthers": "{{count}} in attesa di parlare",
```

`de.json` :

```json
  "call.handRaisedBy": "{{name}} hat die Hand gehoben",
  "call.handRaisedOthers": "noch {{count}} möchte(n) sprechen",
```

`vi.json` :

```json
  "call.handRaisedBy": "{{name}} đã giơ tay",
  "call.handRaisedOthers": "còn {{count}} người muốn phát biểu",
```

`ru.json` :

```json
  "call.handRaisedBy": "{{name}} поднял(а) руку",
  "call.handRaisedOthers": "ещё желающих выступить: {{count}}",
```

**Quatre faits sur ces chaînes, tous vérifiés à la source :**

1. **Aucun suffixe de pluriel.** `src/i18n/index.spec.ts:17-22` compare `Object.keys(en).sort()` à
   celles de chaque locale et exige l'égalité ; un `_one` / `_other` la casserait. Le russe a
   quatre catégories, l'anglais deux.
2. **`count` reste un mot-clé i18next même sans suffixe** : i18next cherche `clé_other`, ne la
   trouve pas, et retombe sur la clé nue. Le dépôt en a déjà le précédent en production :
   `waiting.others` vaut `"{{count}} autre(s) en attente"`, sans suffixe.
3. **Les formes sont d'abord justes à 1**, qui est le cas courant. Le russe accorde le passé au
   genre, que rien dans `RaisedHand` ne porte : `поднял(а)` est le même compromis que le
   `autre(s)` français déjà en place. L'italien et le russe évitent l'accord plutôt que de le
   parenthéser — « altri 1 » et « ещё 1 хотят » seraient faux à 1.
4. **Les clés sont bien 108 + 2 = 110 par locale.** Les sept fichiers en portent 108 à
   `3861227` — compté, pas supposé.

- [ ] **Step 2 : vérifier tout de suite que les sept ensembles restent égaux**

```bash
npx jest src/i18n
```

Attendu : `Tests: 2 passed, 2 total`. Une clé oubliée dans une seule locale fait échouer
« ne laisse aucune clé manquante dans une locale » en nommant la locale fautive.

- [ ] **Step 3 : écrire les sept tests qui échouent**

Créer `src/screens/room/raisedHandsBanner.spec.tsx` :

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { RaisedHand } from 'src/call/hands';
import { tokens } from 'src/ui/tokens';
import { RaisedHandsBanner } from './raisedHandsBanner';

// Interpolation rendue visible, comme dans `handBanner.spec.tsx` : sans elle,
// `t` rend la seule clé et un nom codé en dur — ou l'identité au lieu du nom —
// serait indiscernable de la bonne implémentation.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}|${JSON.stringify(values)}`,
  }),
}));

function hand(identity: string, name: string, raisedAt: number): RaisedHand {
  return { identity, name, raisedAt, isLocal: false };
}

const ADA = hand('u-ada', 'Ada', 1);
const BOB = hand('u-bob', 'Bob', 2);
const CARL = hand('u-carl', 'Carl', 3);

describe('RaisedHandsBanner', () => {
  it('ne rend rien quand personne d’autre ne lève la main', async () => {
    await render(<RaisedHandsBanner hands={[]} />);

    expect(screen.queryByTestId('raised-hands-banner')).toBe(null);
  });

  it('nomme la première main de la file, pas une position codée en dur', async () => {
    // Deux mains, puis les deux mêmes dans l'autre sens : avec une seule
    // fixture, `hands[1]` — ou un nom en dur — passerait aussi bien.
    const view = await render(<RaisedHandsBanner hands={[ADA, BOB]} />);

    expect(screen.getByTestId('raised-hands-banner-name')).toHaveTextContent(
      'call.handRaisedBy|{"name":"Ada"}',
    );

    await view.rerender(<RaisedHandsBanner hands={[BOB, ADA]} />);

    expect(screen.getByTestId('raised-hands-banner-name')).toHaveTextContent(
      'call.handRaisedBy|{"name":"Bob"}',
    );
  });

  it('compte les autres sans compter celui qu’il nomme', async () => {
    // Deux comptes distincts : avec un seul, `hands.length` passerait pour
    // `hands.length - 1` sur la moitié des fixtures possibles.
    const view = await render(<RaisedHandsBanner hands={[ADA, BOB, CARL]} />);

    expect(screen.getByTestId('raised-hands-banner-others')).toHaveTextContent(
      'call.handRaisedOthers|{"count":2}',
    );

    await view.rerender(<RaisedHandsBanner hands={[ADA, BOB]} />);

    expect(screen.getByTestId('raised-hands-banner-others')).toHaveTextContent(
      'call.handRaisedOthers|{"count":1}',
    );
  });

  it('tait le compte quand une seule main est levée, sans taire le bandeau', async () => {
    await render(<RaisedHandsBanner hands={[ADA]} />);

    expect(screen.getByTestId('raised-hands-banner-name')).toBeTruthy();
    expect(screen.queryByTestId('raised-hands-banner-others')).toBe(null);
  });

  it('affiche un repli traduit quand le nom est vide', async () => {
    // Un nom d'espaces, pas une chaîne vide : c'est `trim()` qui décide, et un
    // test sur `''` seul laisserait passer une implémentation sans `trim()`.
    await render(<RaisedHandsBanner hands={[hand('u-x', '   ', 1)]} />);

    expect(screen.getByTestId('raised-hands-banner-name')).toHaveTextContent(
      'call.handRaisedBy|{"name":"call.unnamedParticipant"}',
    );
  });

  it('porte une couleur explicite sur ses deux textes', async () => {
    // `call.tsx` force un fond sombre dans les deux schémas alors que le thème
    // Paper suit le schéma système : sans couleur explicite, 1,08:1. RNTL ne
    // rastérise rien — ce test garde que la CAUSE n'a pas été retirée, jamais
    // que le texte est lisible.
    await render(<RaisedHandsBanner hands={[ADA, BOB]} />);

    expect(screen.getByTestId('raised-hands-banner-name')).toHaveStyle({
      color: tokens.color.textDark,
    });
    expect(screen.getByTestId('raised-hands-banner-others')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('tronque la phrase plutôt que de pousser le compte hors de l’écran', async () => {
    // `flexShrink` vaut 0 par défaut sous Yoga, à l'inverse du web : sans ces
    // deux-là, un nom allemand long pousse le compte hors de l'écran — le
    // défaut mesuré à 39 px dans `participantsPanel.tsx`. `numberOfLines`
    // atteint bien l'élément hôte : `Text` de Paper ne déstructure que
    // `style`, `variant` et `theme` avant d'étaler le reste.
    await render(<RaisedHandsBanner hands={[ADA, BOB]} />);

    const name = screen.getByTestId('raised-hands-banner-name');
    expect(name).toHaveProp('numberOfLines', 1);
    expect(name).toHaveStyle({ flexShrink: 1 });
  });
});
```

**Deux faits qui ne se devinent pas et qu'il ne faut pas re-vérifier à la main :**

- **`numberOfLines` atteint bien l'élément hôte**, contrairement à `visible` sur un `Badge`.
  `react-native-paper/src/components/Typography/Text.tsx:85` ne déstructure que
  `{ style, variant, theme: initialTheme, ...rest }` et étale `...rest` sur le `NativeText`
  (lignes 154 et 165). **Ouvert en source, et l'assertion a été exécutée : elle passe avec la prop
  et rougit sans.** C'est l'exception, pas la règle : la règle générale de `AGENTS.md` est qu'une
  prop consommée par le composant n'arrive jamais jusque-là.
- **`toHaveStyle` fait une correspondance de sous-ensemble** : `styles.name` porte
  `{ color, flexShrink }` et les deux assertions distinctes passent toutes deux. Exécuté.

- [ ] **Step 4 : les lancer, et vérifier qu'ils échouent POUR LA BONNE RAISON**

```bash
npx jest src/screens/room/raisedHandsBanner.spec.tsx
```

Attendu — **exécuté contre `3861227` :** `Test Suites: 1 failed`, `Tests: 0 total`, avec
`Cannot find module './raisedHandsBanner' from 'src/screens/room/raisedHandsBanner.spec.tsx'`.
Zéro test exécuté est ici le bon échec : le module n'existe pas encore.

- [ ] **Step 5 : écrire le composant**

Créer `src/screens/room/raisedHandsBanner.tsx` :

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import type { RaisedHand } from 'src/call/hands';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  // La même bande que `RecordingIndicator` et `HandBanner` : au-dessus de la
  // scène, hors de la barre. Pas de fond propre — il hérite du `backgroundDark`
  // que `call.tsx` force sur `styles.root` dans les deux schémas. C'est une
  // LIGNE de la bande, pas une carte : `WaitingBanner`, lui, pose son propre
  // `surfaceDark`, et les deux fonds ne donnent pas le même ratio.
  //
  // Une seule rangée, jamais deux : le compte se pose À CÔTÉ du nom, ce qui rend
  // la hauteur du bandeau indépendante du nombre de mains levées.
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
  //
  // `flexShrink: 1` n'est pas une précaution : la valeur par défaut de Yoga en
  // React Native est 0, à l'inverse du web. Sans lui, une phrase longue ne se
  // réduit pas et pousse le compte hors de l'écran — le défaut exact que
  // `participantsPanel.tsx` a payé, mesuré à 39 px de nom restant. Avec lui,
  // plus `numberOfLines={1}`, c'est la FIN de la phrase qui se tronque, donc le
  // verbe avant le nom. La phrase est une seule clé, et le rester : les sept
  // traductions posent `{{name}}` à des places différentes — l'allemand met le
  // verbe à la fin — et la découper pour protéger le verbe casserait l'ordre
  // des mots.
  name: { color: tokens.color.textDark, flexShrink: 1 },
  others: { color: tokens.color.textDark },
});

export type RaisedHandsBannerProps = {
  // Les mains des AUTRES, déjà triées par `raisedHands()` : la coquille ne
  // choisit ni qui filtrer ni dans quel ordre. Prendre `hands[0]` est de la
  // présentation, pas de la sélection — d'où l'absence d'un `firstRaised()`
  // symétrique de `firstWaiting`, dont l'ordre, lui, est une règle de domaine.
  readonly hands: readonly RaisedHand[];
};

// Ce que `HandBanner` ne dit pas et n'a jamais prétendu dire : qu'un AUTRE
// demande la parole. Sans lui la file ne vit que dans la feuille « Plus », que
// personne n'ouvre sans raison — la fonction était livrée et inutilisable.
//
// Aucun bouton, et c'est délibéré : donner la parole est un acte de la réunion,
// pas de l'application. Cela écarte du même coup les deux pièges de cet écran,
// le `rippleColor` et le `disabled` — dont aucune couleur explicite ne rattrape
// le second (`IconButton/utils.ts:88-93`).
//
// Rendu conditionnellement, jamais basculé par une prop `visible` : Paper
// consomme `visible` avant d'étaler le reste (`Badge.tsx:59-60`), donc l'état ne
// serait joignable par aucune assertion. Rend `null` au repos, comme les trois
// autres locataires de la bande.
export function RaisedHandsBanner({ hands }: RaisedHandsBannerProps): React.ReactElement | null {
  const { t } = useTranslation();
  // `noUncheckedIndexedAccess` rend `hands[0]` optionnel : la file vide et
  // l'absence de premier sont la MÊME condition, il n'y en a pas deux à écrire.
  const first = hands[0];
  if (first === undefined) return null;

  // Même repli que `waitingBanner.tsx`, `handControl.tsx`, `stage.tsx` et
  // `participantsPanel.tsx` : jamais une identité brute, jamais un vide — les
  // deux se lisent comme une panne d'affichage plutôt que comme une personne.
  const name = first.name.trim();
  const label = name.length > 0 ? name : t('call.unnamedParticipant');
  const others = hands.length - 1;

  return (
    <View testID="raised-hands-banner" style={styles.root}>
      <Text testID="raised-hands-banner-name" style={styles.name} numberOfLines={1}>
        {t('call.handRaisedBy', { name: label })}
      </Text>
      {/* Rendu seulement à partir de 1 : « et 0 autre » à côté d'un nom est du
          bruit, et un « 0 » traînerait dans l'arbre d'accessibilité. */}
      {others > 0 ? (
        <Text testID="raised-hands-banner-others" style={styles.others}>
          {t('call.handRaisedOthers', { count: others })}
        </Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 6 : vérifier que les sept passent**

```bash
npx jest src/screens/room/raisedHandsBanner.spec.tsx
```

Attendu : `Tests: 7 passed, 7 total`.

- [ ] **Step 7 : prouver que les tests mordent (motif B)**

Appliquer chaque mutation, lancer le spec, **la défaire**. Les neuf comptes ont été mesurés sur la
version exacte ci-dessus :

| Mutation | Rouges attendus |
| --- | --- |
| `if (first === undefined) return null;` → `if (first === undefined && hands.length < 0) return null;` | 1 |
| `const first = hands[0];` → `const first = hands[1];` | 3 |
| `const others = hands.length - 1;` → `const others = hands.length;` | 2 |
| `{others > 0 ?` → `{others >= 0 ?` | 1 |
| `const label = name.length > 0 ? name : t('call.unnamedParticipant');` → `const label = name;` | 1 |
| `name: { color: tokens.color.textDark, flexShrink: 1 },` → `name: { flexShrink: 1 },` | 1 |
| `others: { color: tokens.color.textDark },` → `others: {},` | 1 |
| retirer ` numberOfLines={1}` | 1 |
| `name: { color: tokens.color.textDark, flexShrink: 1 },` → `name: { color: tokens.color.textDark },` | 1 |

- [ ] **Step 8 : la barre complète**

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
```

Attendu : **946 tests / 63 suites**, `tsc` propre, **3 avertissements** de lint, prettier propre.
Le composant n'est encore importé nulle part et le lint ne s'en plaint pas — vérifié.

- [ ] **Step 9 : commit**

```bash
git add src/i18n/locales src/screens/room/raisedHandsBanner.tsx src/screens/room/raisedHandsBanner.spec.tsx
git commit -m "feat(call): Add the banner that names who is asking to speak"
```

---

### Task 3 : la règle du plein écran change — le bandeau d'admission y survit

**Files:**

- Modify: `src/screens/room/call.tsx:921-957` (le commentaire de la garde et le fragment gardé)
- Modify: `src/screens/room/call.tsx:981-998` (le commentaire du message de reconnexion)
- Modify: `src/screens/room/call.spec.tsx:2653-2704` (le `describe` et son premier test)

**Interfaces:**

- Consumes: rien de neuf. `WaitingBanner`, `RecordingIndicator`, `HandBanner` et
  `fullscreenTile` sont déjà en place.
- Produces: la garde de plein écran n'enveloppe plus que `RecordingIndicator` et `HandBanner`.
  La tâche 4 s'appuie sur cette forme.

**Cette tâche n'ajoute aucun test : elle en INVERSE un.** Le compte reste à 946.

> **Pourquoi cette tâche vient avant l'arrivée du nouveau bandeau.** Le commentaire de `call.tsx`
> énonce le critère de survie ; le réécrire une fois pour le bandeau qui existe déjà, puis lui
> ajouter une clause à la tâche 4, laisse le dépôt cohérent **après chaque tâche**. L'ordre
> inverse aurait posé un commentaire faux pendant une tâche entière.

- [ ] **Step 1 : inverser le test existant, et renommer le describe qui le porte**

Dans `src/screens/room/call.spec.tsx`, remplacer **le bloc de commentaire et la ligne de
`describe`** (aujourd'hui `describe('CallScreen, plein écran, tout le reste disparaît', () => {`) :

```tsx
// « Le plein écran masque la barre et les commandes, jamais une demande qui
// attend une réponse. » La règle arbitrée le 2026-08-02, qui remplace « une
// tuile, et rien d'autre ».
//
// Quatre surfaces, et le describe couvre les deux camps : ce qui SURVIT parce
// qu'il attend une réponse de vous — quelqu'un frappe à la porte, quelqu'un
// d'autre lève la main —, et ce qui DISPARAÎT parce qu'il ne fait que décrire
// l'état du monde — l'enregistrement, votre propre main, les bulles.
//
// Les tests du second camp font l'aller-retour : sans le retour, une
// implémentation qui ne rendrait plus jamais le bandeau passerait aussi. Ceux
// du premier assertent en plus l'ABSENCE de `mic-toggle`, sans quoi un plein
// écran qui n'aurait jamais pris les rendrait verts pour la mauvaise raison.
describe('CallScreen, plein écran, ce qui disparaît et ce qui reste', () => {
```

Puis remplacer **le premier `it` de ce describe** — celui qui commence par
`it("masque le bandeau d'admission en plein écran, et le rend au retour", …)`, avec le commentaire
de quatre lignes qui ouvre son corps (« La conséquence acceptée : … ») — par :

```tsx
  // INVERSÉ le 2026-08-02. Ce test affirmait le contraire, et son commentaire
  // parlait d'une « conséquence acceptée ». Elle ne l'est plus : la règle est
  // devenue « le plein écran masque la barre et les commandes, jamais une
  // demande qui attend une réponse », et quelqu'un enfermé dehors en est une.
  it("garde le bandeau d'admission visible en plein écran", async () => {
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));
    jest
      .spyOn(participants, 'listWaitingParticipants')
      .mockResolvedValue({ ok: true, value: [{ id: 'lobby-1', username: 'Ada' }] });
    mockRoom.remoteParticipants.set('u-bob', remoteParticipant('u-bob', 'Bob'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(screen.getByTestId('waiting-banner')).toBeTruthy());

    await enterFullscreen('u-bob:camera');

    expect(screen.getByTestId('waiting-banner')).toBeTruthy();
    expect(screen.queryByTestId('mic-toggle')).toBeNull();
  });
```

Les trois autres `it` du describe — enregistrement, main levée, bulles — **ne bougent pas** : ils
gardent les branches C5, C6 et C7, qui restent vraies.

Deux faits sur cette fixture, tous deux hérités du test existant et vérifiés : le `beforeEach` du
describe pose `jest.useFakeTimers()`, sans quoi le `setInterval` de cinq secondes de
`useWaitingParticipants` ne partirait jamais et le bandeau n'existerait pas ; et
`enterFullscreen(key)` (`call.spec.tsx:87-90`) appuie une fois sur la cellule de grille puis attend
la disparition de `mic-toggle`. La seconde assertion du test est donc redondante avec l'aide — et
elle vaut d'être écrite quand même, puisqu'elle rend le test lisible sans ouvrir l'aide.

- [ ] **Step 2 : le lancer, et vérifier qu'il échoue POUR LA BONNE RAISON**

```bash
npx jest src/screens/room/call.spec.tsx
```

Attendu — **exécuté contre `3861227` :** `Tests: 1 failed, 121 passed, 122 total`, l'échec étant
`Unable to find an element with testID: waiting-banner` sur
`garde le bandeau d'admission visible en plein écran`. C'est exactement le bon échec : à `HEAD`, le
bandeau est bien masqué.

- [ ] **Step 3 : scinder la garde et réécrire le commentaire**

Dans `src/screens/room/call.tsx`, remplacer **tout le bloc** qui va de
`{/* **En plein écran : une tuile, et rien d'autre.** …` jusqu'au `) : null}` qui referme le
fragment des trois bandeaux (aujourd'hui les lignes 921 à 957) par :

```tsx
      {/* **En plein écran : la barre et les commandes disparaissent, jamais
          une demande qui attend une réponse.**

          C'est la règle arbitrée le 2026-08-02. Elle remplace « une tuile, et
          rien d'autre », qui masquait les trois bandeaux sans distinguer ce
          qu'ils disaient, et elle se lit en deux temps :

          — ce qui ATTEND UNE RÉPONSE DE VOUS survit, et se pose donc HORS de
            la garde ci-dessous. Quelqu'un frappe à la porte : il reste enfermé
            dehors tant que personne ne répond ;
          — ce qui DÉCRIT SEULEMENT L'ÉTAT DU MONDE disparaît, et reste dans la
            garde. L'indicateur d'enregistrement énonce un fait. VOTRE propre
            main levée ne vous demande rien : c'est un rappel, son destinataire
            est en face. Les bulles de réaction passent d'elles-mêmes.

          (Le critère écrit ici jusqu'au 2026-08-02 était « survit ce dont
          l'absence rendrait l'écran TROMPEUR ». Il décrivait exactement le code
          d'alors ; il ne décrit plus celui-ci, puisqu'une main levée qu'on ne
          voit pas est MANQUÉE et non mensongère, et qu'elle survit désormais
          quand même. Ce critère-là n'a pas disparu pour autant : il reste la
          raison — distincte — du message de reconnexion et de la `Snackbar`
          plus bas. Deux raisons de survivre, donc, et non une seule.)

          Une ternaire, et non une prop `hidden` comme celle de
          `CallControlBar` : celle-ci existe parce que la barre POSSÈDE quatre
          états de périphérique qu'un démontage effacerait. Ces deux-ci sont des
          coquilles pures — aucun état, aucun effet — donc les démonter ne perd
          rien.

          L'ORDRE DE LA BANDE est inchangé — admission, enregistrement, votre
          main — et il le reste dans les deux cas, la garde n'encadrant que les
          deux dernières lignes. */}

      {/* Ne rend rien tant que personne n'attend. */}
      <WaitingBanner
        participant={firstWaiting(waiting)}
        remaining={Math.max(waiting.length - 1, 0)}
        onAnswer={handleAnswerEntry}
      />

      {fullscreenTile === null ? (
        <>
          {/* Vu de tout le monde, y compris de qui n'a aucun bouton : ne rend
              rien au repos. */}
          <RecordingIndicator state={recordingState} />

          {/* Une main levée oubliée serait invisible pour qui l'a levée : ce
              bandeau la dit, et la baisse en un seul appui. Ne rend rien au
              repos. La bande empile ses lignes : l'indicateur d'enregistrement
              et celui-ci peuvent être vrais en même temps. */}
          <HandBanner raised={handRaised} position={handRank} onLower={handleToggleHand} />
        </>
      ) : null}
```

- [ ] **Step 4 : réécrire le SECOND commentaire, celui du message de reconnexion**

**Il y a deux commentaires à corriger dans ce fichier, pas un.** Celui du message de reconnexion
(`call.tsx:981-998`) énonce lui aussi l'ancienne règle, et trois de ses affirmations deviennent
fausses à l'instant où le Step 3 est appliqué :

- « DÉLIBÉRÉMENT HORS de la garde de plein écran, **à l'inverse des trois bandeaux** » — ils ne
  sont plus trois, et l'un d'eux est désormais dehors comme lui ;
- « La règle arbitrée est "en plein écran, une tuile et rien d'autre, **sans exception**" » — ce
  n'est plus la règle ;
- « **une demande d'admission, elle, est manquée sans que rien ne mente** » — donnée en exemple de
  ce qui NE survit pas, et qui survit maintenant.

Remplacer donc **tout le bloc de commentaire** qui précède
`{callState.status === 'reconnecting' ? (` par :

```tsx
      {/* La reconnexion se dit : sans cela la personne regarde une image figée
          en croyant que c'est cassé, et raccroche alors que ça se rétablit.

          HORS de la garde de plein écran, comme le bandeau d'admission
          au-dessus — mais pour une RAISON DIFFÉRENTE, et c'est elle qui vaut
          d'être écrite. La règle du 2026-08-02 fait survivre ce qui attend une
          réponse DE VOUS ; ce message-ci n'en attend aucune. Il survit parce
          que son absence rendrait l'écran TROMPEUR : une image figée sans rien
          qui dise pourquoi se lit exactement comme un plantage. Même raison
          pour le `Snackbar` plus bas.

          Deux critères, donc, et non un seul — et ni l'un ni l'autre n'est
          « ce qui n'offre aucune commande » : `RecordingIndicator` n'en offre
          aucune, ne trompe personne, n'attend rien de vous, et il est bien
          masqué quelques lignes plus haut. Arbitré explicitement, pas hérité.

          (La première rédaction de ce commentaire disait « ce qui offre une
          COMMANDE », ce qui décrivait mal le code : la revue de la
          spécification de la main levée l'a relevé, et elle avait raison. La
          deuxième posait la tromperie comme critère UNIQUE et donnait la
          demande d'admission en exemple de ce qui ne survit pas — exact
          jusqu'au 2026-08-02, faux depuis.) */}
```

**Le corps du `{callState.status === 'reconnecting' ? … }` ne bouge pas**, ni la `Snackbar`, ni la
**garde** du `ReactionOverlay` (`call.tsx:1050-1052`) : les bulles restent bien masquées.

- [ ] **Step 4 bis : le TROISIÈME commentaire, celui du `ReactionOverlay`**

**CORRECTION posée à l'implémentation, le 2026-08-02.** Ce plan affirmait ici que le commentaire du
`ReactionOverlay` « reste exact ». Sa **conclusion** l'est — les bulles restent masquées — mais sa
**raison** ne l'est plus, et c'est elle que le commentaire écrit : « pour la même raison que les
trois bandeaux ci-dessus : en plein écran, une tuile et rien d'autre ». Deux affirmations fausses
dès le Step 3 appliqué — ils ne sont plus trois dans la garde mais deux, et la règle citée est celle
que le commentaire de la garde vient de déclarer **remplacée**, vingt lignes plus haut. Livré tel
quel, le fichier énoncerait l'ancienne règle comme courante à côté de celle qui la remplace : c'est
exactement le défaut que les deux autres réécritures corrigent.

Remplacer donc le premier paragraphe de ce commentaire par :

```tsx
      {/* Dernier enfant de `styles.root` : peint au-dessus de tout le reste de
          l'écran, bandeaux et barre de contrôle compris. Ne rend rien au
          repos — mais elle est bel et bien enveloppée, pour la même raison que
          l'indicateur d'enregistrement et votre propre main levée ci-dessus :
          des bulles qui passent d'elles-mêmes ne font que décrire l'état du
          monde, et n'attendent aucune réponse de vous. La condition est
          séparée de la leur parce que sa POSITION l'est : ce calque doit
          rester le dernier enfant, sans quoi il passe sous la barre.
```

Le second paragraphe (`chatOpen`, `BOTTOM_GUARD`) ne bouge pas.

**Rien d'autre ne bouge dans ce fichier à cette tâche.** Aucun test ne rougit sur un commentaire —
c'est précisément pourquoi il est prescrit ici, à l'endroit du code, plutôt que laissé à la
relecture.

- [ ] **Step 5 : vérifier que le test inversé passe, et que les trois autres tiennent**

```bash
npx jest src/screens/room/call.spec.tsx
```

Attendu : `Tests: 122 passed, 122 total`.

- [ ] **Step 6 : prouver que la garde mord aux trois endroits (motif C, 3 des 4 instances)**

| Mutation | Rouges attendus | Test qui localise |
| --- | --- | --- |
| remettre `<WaitingBanner …/>` **dans** le fragment gardé | 1 | `garde le bandeau d'admission visible en plein écran` |
| sortir `<RecordingIndicator …/>` **du** fragment gardé | 1 | `masque l'indicateur d'enregistrement en plein écran` |
| sortir `<HandBanner …/>` **du** fragment gardé | 1 | `masque le bandeau de main levée en plein écran` |

Les trois comptes ont été mesurés. **Ne pas muter `fullscreenTile` lui-même** : figer le prédicat
rougirait plusieurs tests à la fois et ne localiserait rien — c'est la mutation qui rassure, pas
celle qui prouve.

- [ ] **Step 7 : la barre complète**

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
```

Attendu : **946 tests / 63 suites** — inchangé, puisqu'un test a été réécrit et non ajouté.
`tsc` propre, **3 avertissements**, prettier propre.

- [ ] **Step 8 : commit**

```bash
git add src/screens/room/call.tsx src/screens/room/call.spec.tsx
git commit -m "feat(call): Keep the admission banner visible in fullscreen"
```

---

### Task 4 : brancher le bandeau dans la bande

**Files:**

- Modify: `src/screens/room/call.tsx` — import, `useMemo`, une clause de commentaire, une ligne
  de JSX
- Test: `src/screens/room/call.spec.tsx` — 3 tests neufs

**Interfaces:**

- Consumes: `otherRaisedHands` (tâche 1) ; `RaisedHandsBanner` et `RaisedHandsBannerProps`
  (tâche 2) ; `hands`, déjà calculé à `call.tsx:454`.
- Produces: rien pour d'autres tâches — c'est la dernière.

- [ ] **Step 1 : écrire les trois tests qui échouent**

Dans `src/screens/room/call.spec.tsx`, **deux tests dans `describe('CallScreen, main levée')`**, à
insérer **juste avant** `it('montre la file entière dans le menu, dans son ordre', …)` :

```tsx
  it('signale sur l’écran principal la main d’un autre, jamais la sienne', async () => {
    // Le filtre observé dans ses deux états, sur le même rendu : d'abord la
    // seule main locale — `HandBanner` la porte, le nouveau bandeau non —,
    // puis une main distante qui le fait apparaître.
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:00Z' };

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('hand-banner')).toBeTruthy());
    expect(screen.queryByTestId('raised-hands-banner')).toBeNull();

    mockRoom.remoteParticipants.set(
      'u-ada',
      remoteParticipant('u-ada', 'Ada', { handRaisedAt: '2026-07-30T10:00:01Z' }),
    );
    await emitRoom('participantAttributesChanged');

    expect(screen.getByTestId('raised-hands-banner-name')).toHaveTextContent(
      'call.handRaisedBy|{"name":"Ada"}',
    );
    expect(screen.queryByTestId('raised-hands-banner-others')).toBeNull();
  });

  it('nomme la première main de la file, et compte les autres', async () => {
    // Bob inséré AVANT Ada dans la Map du SDK, mais levé une seconde APRÈS :
    // c'est l'horodatage du serveur qui ordonne, jamais l'ordre d'insertion.
    // Et la main locale, la plus ancienne des trois, ne compte pas — sans quoi
    // le compte dirait 2.
    mockRoom.remoteParticipants.set(
      'u-bob',
      remoteParticipant('u-bob', 'Bob', { handRaisedAt: '2026-07-30T10:00:02Z' }),
    );
    mockRoom.remoteParticipants.set(
      'u-ada',
      remoteParticipant('u-ada', 'Ada', { handRaisedAt: '2026-07-30T10:00:01Z' }),
    );
    mockLocalAttributes = { handRaisedAt: '2026-07-30T10:00:00Z' };

    await renderCall();

    await waitFor(() => expect(screen.getByTestId('raised-hands-banner')).toBeTruthy());
    expect(screen.getByTestId('raised-hands-banner-name')).toHaveTextContent(
      'call.handRaisedBy|{"name":"Ada"}',
    );
    expect(screen.getByTestId('raised-hands-banner-others')).toHaveTextContent(
      'call.handRaisedOthers|{"count":1}',
    );
  });
```

Et **un test dans `describe('CallScreen, plein écran, ce qui disparaît et ce qui reste')`** (le
describe renommé à la tâche 3), à insérer **juste après** le test
`garde le bandeau d'admission visible en plein écran` :

```tsx
  // La seconde moitié de la même règle : une main levée attend qu'on donne la
  // parole. `mic-toggle` absent prouve qu'on est bien EN plein écran — sans
  // cette seconde assertion, un plein écran qui n'aurait jamais pris rendrait
  // le test vert pour la mauvaise raison.
  it('garde le bandeau des mains levées visible en plein écran', async () => {
    mockRoom.remoteParticipants.set(
      'u-bob',
      remoteParticipant('u-bob', 'Bob', { handRaisedAt: '2026-07-30T10:00:01Z' }),
    );

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('raised-hands-banner')).toBeTruthy());

    await enterFullscreen('u-bob:camera');

    expect(screen.getByTestId('raised-hands-banner')).toBeTruthy();
    expect(screen.queryByTestId('mic-toggle')).toBeNull();
  });
```

**Cinq faits sur ces fixtures, tous ouverts en source et exécutés :**

- `mockLocalAttributes` (`call.spec.tsx:228`) est une variable de module, remise à `{}` par le
  `beforeEach` général (`call.spec.tsx:460`) ; la coquille du participant local la relit à chaque
  lecture.
- `remoteParticipant(identity, name, attributes = {})` (`call.spec.tsx:176-194`) prend bien un
  troisième argument d'attributs — c'est le chemin qu'utilisent déjà les tests de position dans la
  file.
- `emitRoom('participantAttributesChanged')` (`call.spec.tsx:334-338`) enveloppe l'appel dans
  `act` : rien d'autre n'est à envelopper.
- `renderCall()` mesure la scène ; sans elle `useCallLayout` rend `null` et aucune tuile n'existe,
  donc `enterFullscreen` n'aurait rien à presser.
- Le `t` bouchonné de ce fichier (`call.spec.tsx:372-377`) interpole en
  `` `${key}|${JSON.stringify(values)}` ``, d'où la forme exacte des chaînes attendues. Et
  `toHaveTextContent` compare la chaîne **entière** : ces chaînes sont donc le contenu complet du
  `Text`, pas un fragment.

- [ ] **Step 2 : les lancer, et vérifier qu'ils échouent POUR LA BONNE RAISON**

```bash
npx jest src/screens/room/call.spec.tsx
```

Attendu — **exécuté :** `Tests: 3 failed, 122 passed, 125 total`, avec

- `signale sur l’écran principal…` → `Unable to find an element with testID: raised-hands-banner-name`
- `nomme la première main de la file…` → `Unable to find an element with testID: raised-hands-banner`
- `garde le bandeau des mains levées visible…` → `Unable to find an element with testID: raised-hands-banner`

- [ ] **Step 3 : brancher le sélecteur et le composant**

Trois modifications dans `src/screens/room/call.tsx`, à faire dans cet ordre.

**a.** Élargir l'import de `hands` (`call.tsx:21`) :

```tsx
import { handPosition, isHandRaised, otherRaisedHands, raisedHands } from 'src/call/hands';
```

**b.** Ajouter l'import du composant. L'ordre alphabétique du groupe `src/screens/room/` place
`raisedHandsBanner` **avant** `reactionOverlay` — donc, entre les lignes 40 et 41 actuelles :

```tsx
import { RaisedHandsBanner } from 'src/screens/room/raisedHandsBanner';
```

**c.** Dériver la file des autres, **immédiatement après** `const handRank = …` (`call.tsx:456`) :

```tsx
  // Les mains des AUTRES, et rien de plus : `HandBanner` porte déjà la vôtre
  // sur la ligne du dessus, et l'y compter une seconde fois ferait dire « et
  // 1 autre » à un écran où il n'y a personne d'autre.
  const otherHands = useMemo(() => otherRaisedHands(hands), [hands]);
```

(`useMemo` est déjà importé dans ce fichier ; `hands` est lui-même mémoïsé sur `roomView`.)

- [ ] **Step 4 : poser la ligne dans la bande, et compléter le commentaire de la garde**

**a.** Dans le commentaire réécrit à la tâche 3, remplacer la première puce :

```
          — ce qui ATTEND UNE RÉPONSE DE VOUS survit, et se pose donc HORS de
            la garde ci-dessous. Quelqu'un frappe à la porte : il reste enfermé
            dehors tant que personne ne répond ;
```

par :

```
          — ce qui ATTEND UNE RÉPONSE DE VOUS survit, et se pose donc HORS de
            la garde ci-dessous. Quelqu'un frappe à la porte : il reste enfermé
            dehors tant que personne ne répond. Quelqu'un d'autre lève la main :
            il attend qu'on lui donne la parole ;
```

et, dans le même commentaire, remplacer sa dernière phrase :

```
          L'ORDRE DE LA BANDE est inchangé — admission, enregistrement, votre
          main — et il le reste dans les deux cas, la garde n'encadrant que les
          deux dernières lignes. */}
```

par :

```
          L'ORDRE DE LA BANDE est inchangé — admission, enregistrement, votre
          main, les mains des autres — et il le reste dans les quatre
          combinaisons, la garde n'encadrant que le bloc du milieu. */}
```

**b.** Ajouter la quatrième ligne de la bande **après** le `) : null}` qui referme le fragment
gardé, et **avant** le commentaire « Les trois corps qui s'excluent » :

```tsx

      {/* La seule chose qui disait, sur l'écran principal, qu'un AUTRE demande
          la parole : sans elle la file ne vivait que dans une feuille que le
          président n'a aucune raison d'ouvrir. Ne rend rien au repos, et ne
          porte aucun bouton — donner la parole est un acte de la réunion, pas
          de l'application. */}
      <RaisedHandsBanner hands={otherHands} />
```

**Ce placement — en dernier, après `HandBanner` — est prescrit par la conception et sa raison est
mécanique** : le bandeau apparaît et disparaît sous le pouce ; placé au-dessus, il déplacerait
`hand-lower`, le bouton conçu pour être atteignable en un seul appui au moment précis où le
modérateur vous donne la parole. Placé en dessous, il ne bouge rien.

**L'ordre visuel tient dans les quatre combinaisons** : admission, enregistrement, votre main, les
mains des autres — la garde n'encadrant que le bloc du milieu, sortir de ce bloc ne réordonne rien.

**c. CORRECTION posée à l'implémentation, le 2026-08-02 : un décompte que cette tâche périme.**
`call.tsx:221` explique pourquoi `box` est mesurée plutôt que lue de `useWindowDimensions()`, « qui
ignore la barre de contrôle, les encoches et les **trois** bandeaux ». La bande en porte quatre à
partir d'ici. Écrire « les bandeaux », sans le compte : il n'y a rien à compter à cet endroit, et un
nombre y sera faux au bandeau suivant.

- [ ] **Step 5 : vérifier que les trois passent**

```bash
npx jest src/screens/room/call.spec.tsx
```

Attendu : `Tests: 125 passed, 125 total`.

- [ ] **Step 6 : prouver que les tests mordent (motif C, 4ᵉ instance ; motif D)**

| Mutation | Rouges attendus | Test qui localise |
| --- | --- | --- |
| mettre `<RaisedHandsBanner …/>` **dans** le fragment gardé | 1 | `garde le bandeau des mains levées visible en plein écran` |
| `<RaisedHandsBanner hands={otherHands} />` → `hands={hands}` | 2 | `signale… jamais la sienne`, `nomme la première main…` |

Les deux comptes ont été mesurés. La seconde mutation est celle qui prouve que le filtre de la
tâche 1 est **réellement branché** — sans elle, une coquille qui recevrait la file entière rendrait
un bandeau d'apparence correcte dans toutes les fixtures à main locale absente.

- [ ] **Step 7 : la barre complète**

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
```

Attendu : **949 tests / 63 suites**, `tsc` propre, **3 avertissements** de lint, prettier propre.

- [ ] **Step 8 : commit**

```bash
git add src/screens/room/call.tsx src/screens/room/call.spec.tsx
git commit -m "feat(call): Show on the main screen that someone else is asking to speak"
```

---

## Ce que le lot ne fait pas, explicitement

Repris de la conception, et inchangé :

- **Aucune notion de « vu ».** Le bandeau est vrai tant qu'une main est levée. Pas de `markSeen`,
  pas d'ensemble de mains acquittées, pas de bouton « fermer » — un tel mécanisme ne permettrait
  que de faire disparaître un état encore vrai, c'est-à-dire de masquer une demande de parole
  toujours en attente. C'est le piège de ce lot, parce que le chat en contient un exemplaire
  complet et fonctionnel (`chatStore.ts:47`, `readKeys`) : **un message est un événement, une main
  levée est un état.**
- **Ni son ni vibration.** Le web conditionne son son à `config.max_participants_for_sound`, que
  `src/instance/types.ts` ne lit pas ; le dépôt n'a ni `expo-haptics`, ni `expo-av`/`expo-audio`,
  ni `expo-notifications` ; et il n'existe aucun écran de réglages où couper un son. À rouvrir avec
  un écran de réglages, jamais avant.
- **Aucun marqueur sur la tuile vidéo**, ni dans le panneau des participants. Le premier
  demanderait quatre surfaces (grille, bande, scène, plein écran) et ne dirait rien d'une main
  levée hors capacité d'affichage ; le second est encore un panneau à ouvrir.
- **Aucune pastille** sur `more-btn` : deux pastilles de 20 dp sur la même ancre de 44 dp se
  touchent, et les fusionner en un seul nombre additionnerait des messages non lus et des mains
  levées.
- **Baisser la main de quelqu'un d'autre**, toute notification hors premier plan, toute
  persistance entre deux séances.

**Et le corollaire, qui doit être dit** : une main levée puis baissée pendant que vous regardiez
ailleurs ne laisse **aucune trace**. Ce n'est pas un défaut de ce dessin — c'est une propriété de
la signalisation par état, et aucun dessin fondé sur `handRaisedAt` ne peut faire autrement, le
contrat backend ne conservant pas d'historique (`hands.ts:18-20`).

## Ce qu'aucun test de ce plan ne prouvera

1. **Qu'un bandeau au-dessus de la vidéo se remarque réellement** pendant qu'on regarde quelqu'un
   parler. C'est toute la question du lot, et elle ne se tranche qu'en réunion, sur appareil, avec
   quelqu'un qui lève la main sans prévenir.
2. **Que la bande empilée reste supportable** dans le pire cas — enregistrement, votre main, celle
   d'un autre. L'arithmétique est calculée depuis la feuille de style de Paper, pas mesurée, et la
   hauteur d'une ligne de texte n'en est pas dérivable (voir « Deux pièges »).
3. **Qu'un nom allemand long reste lisible** à côté du compte. La troncature est prescrite et
   gardée par un test, mais RNTL ne rastérise rien : ce test prouve que la cause n'a pas été
   retirée, pas que le résultat est lisible.
4. **Qu'un texte soit lisible sur le fond forcé sombre.** Même raison. Les ratios cités
   (16,65:1 avec la couleur, 1,08:1 sans) se lisent en composant thème, fond et composant — ou sur
   appareil.

## Ce que la conception dit et que ce plan corrige

**Un seul point, et il porte sur une décision plutôt que sur un fait.** La conception écrit, dans
« Ce qu'aucun test ne prouvera » : « La rangée n'a pas de troncature prescrite ici ». C'était exact
au moment où elle a été écrite, et c'est une lacune plutôt qu'une erreur — elle nommait le risque
sans le trancher. **Ce plan le tranche** (voir « Deux pièges de la conception », point 2) :
`flexShrink: 1` et `numberOfLines={1}` sur le `Text` du nom, rien sur celui du compte, et la coupe
tombe sur la fin de la phrase plutôt que sur le nom.

Le reste de la conception a été vérifié à la source et tient : les six faits de « Ce que le code
dit aujourd'hui », l'arithmétique de la bande, la non-dérivabilité de la hauteur de ligne, la
contrainte de `src/i18n/index.spec.ts` sur les suffixes de pluriel, et les sept traductions telles
qu'elles y figurent.

Sa **décision 8** — « en plein écran, masqué » — a été écartée par le propriétaire, avec les deux
conséquences que ce plan porte : le bandeau des mains levées y reste visible, **et** le bandeau
d'admission aussi.

## Relecture finale

**Ce document se corrige à la FIN, une fois, contre le code livré.** Un errata placé en tête
n'atteint personne : `scripts/task-brief PLAN N` n'extrait que le texte d'une seule tâche. Si une
tâche se révèle fausse en cours de route, la correction qui compte est celle qu'on pose **dans la
tâche**, à l'endroit du code fautif — et la relecture d'ensemble se fait après la tâche 4, jamais
au milieu.

### Relecture faite, le 2026-08-02, contre le code livré

**Tout ce qui était mesuré s'est vérifié à l'identique** : la ligne de base (936 / 62), les quatre
comptes de fin de tâche (939, 946, 946, 949), les quatre échecs attendus **au message près**, et les
**16 comptes de rouges** des quatre tableaux de mutations — aucun écart, aucun zéro rouge.

**Une seule affirmation s'est révélée fausse**, et elle porte sur un commentaire : celui du
`ReactionOverlay`, que la tâche 3 déclarait rester exact. La correction est posée **dans la tâche 3**
(Step 4 bis), pas ici. Elle a une cause identifiable, et c'est la même que celle qui avait déjà rendu
le commentaire de la reconnexion faux deux fois : le critère a été vérifié sur les surfaces que la
tâche **touche**, pas sur toutes celles que l'écran **porte**. La garde du `ReactionOverlay` est un
quatrième site qui cite la règle, et il ne bougeait pas — donc il n'a pas été relu.

**Un décompte a été périmé par la tâche 4** (`call.tsx:221`, « les trois bandeaux ») ; sa correction
est posée dans la tâche 4, Step 4 c.

**Ce qui reste invérifié est exactement la liste de « Ce qu'aucun test de ce plan ne prouvera »** :
rien n'a été exécuté sur appareil, et les quatre points y restent ouverts.
