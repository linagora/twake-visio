# La grille adaptative : le nombre de tuiles vient de la boîte mesurée

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:executing-plans` ou
> `superpowers:subagent-driven-development` pour dérouler ce plan tâche par tâche. Les étapes
> utilisent des cases à cocher (`- [ ]`). Les trois tâches sont **strictement ordonnées** : la
> Tâche 2 importe le module que la Tâche 1 crée, et la Tâche 3 rend le champ que la Tâche 2 calcule.

**Goal :** implémenter la **moitié grille** de
`docs/superpowers/specs/2026-08-01-grid-and-pinning-design.md` — ses sections 1, 2 et 5. La moitié
épinglage a déjà été livrée (`2026-08-01-pin-and-fullscreen.md`) et ce plan ne la défait pas : il en
généralise le geste. Une caméra 16:9 posée dans la scène actuelle est encadrée de bandes noires sur
plus de la moitié de la hauteur d'un écran en portrait, et aucune valeur d'`objectFit` n'y échappe —
le défaut est une **mise en page**, pas un cadrage. La réponse tient en une phrase, et tout ce plan
la décline :

> **Le vide appartient à la marge de la page, jamais à l'intérieur d'une tuile.**

**Architecture :** un module nouveau, `src/call/grid.ts` — l'arithmétique d'empaquetage, séparée de
la sélection parce qu'elle ne connaît ni participant ni piste, seulement des nombres. `CallLayout`
devient une **union discriminée** (`mode: 'grid' | 'focus'`), `selectLayout` gagne une **boîte**
mesurée, et `stage.tsx` perd `useWindowDimensions()`. Le chemin de la mesure :

```
call.tsx                                    CallStage
─────────────────────────────────────────   ──────────────────────────────────
useState<Box | null>        ◀───────────────  onLayout sur la View racine
useState<string | null> pin ───────────────▶  rend le badge sur le focus
useCallLayout(room, facing, box, pin) ─────▶  layout: CallLayout | null
setPin(key)                 ◀───────────────  onPinTile(key), appui sur une tuile
```

**La coquille reste bête** : elle mesure, elle remonte, elle rend ce qu'on lui donne. Elle ne décide
ni le nombre de colonnes, ni la taille des tuiles, ni le mode, ni l'axe de la bande.

| | Fichiers touchés |
| --- | --- |
| Tâche 1 | `src/call/grid.ts` (créé), `src/call/grid.spec.ts` (créé) |
| Tâche 2 | `src/call/layout.ts`, `src/call/useCallLayout.ts`, `src/screens/room/stage.tsx`, `src/screens/room/call.tsx` (+ les quatre specs correspondantes) |
| Tâche 3 | `src/screens/room/stage.tsx`, `src/screens/room/stage.spec.tsx`, les **sept** locales |

**Tech Stack :** TypeScript strict, React Native 0.86, Expo SDK 57, react-native-paper 5.15.3,
`@livekit/react-native` 2.12.0, `livekit-client` 2.18.0, Jest 29 + `jest-expo` +
`@testing-library/react-native` 14. Aucune dépendance ajoutée.

---

## Global Constraints

- **`node_modules` est un lien symbolique.** Ne jamais lancer `npm install`, `npm ci`, `npm add` ni
  `npx expo install`. Ce plan n'ajoute aucune dépendance.
- **Barre de qualité, chaque tâche** : `npm test`, `npm run typecheck`, `npm run lint`,
  `npx prettier --check .` verts. Le lint conserve **trois avertissements préexistants**
  (`src/auth/oidc.ts:10`, `:11`, `src/i18n/index.ts:32`), sans rapport avec ce plan : les laisser.
  Jamais `--no-verify`.
- **Référence de départ** : `9fb635c`, **738 tests / 53 suites** (`npm test`, 2026-08-01). La
  spécification annonçait 625/51 ; elle a été écrite avant les lots des feuilles inférieures et de
  l'épinglage. C'est 738 qui fait foi.
- **Commits atomiques**, Conventional Commits, sujet à l'impératif et en sentence-case (le dépôt
  reconfigure `subject-case`).
- **Discipline de mutation** : chaque mutation ci-dessous a été **rejouée avant l'écriture de ce
  document**, et le nombre de rouges cité est celui **observé**, jamais supposé. Une mutation qui ne
  rougit rien est un trou de couverture, pas une bonne implémentation — ce plan en a trouvé un, et il
  est traité en Tâche 1.
- **Chaque extrait de test de ce plan a été EXÉCUTÉ** contre `9fb635c` avant d'être écrit ici, puis
  le code a été restauré. Les idiomes RNTL les plus risqués ont été isolés dans un composant jetable
  et vérifiés un par un (voir plus bas).

### Les quatre idiomes RNTL vérifiés par exécution, pas par lecture

`AGENTS.md` est catégorique : « du code de test cité sans avoir été ouvert ni exécuté » a produit
cinq erreurs dans un plan précédent. Les quatre mécanismes dont dépend tout ce lot ont donc été
exercés dans un fichier jetable, contre `9fb635c`, avant d'apparaître ici. Les quatre marchent :

1. **`fireEvent(el, 'layout', { nativeEvent: { layout: { x, y, width, height } } })` atteint bien
   `onLayout`.** RNTL ne dispose aucune vue : sans cet appel, `onLayout` **ne part jamais** et la
   coquille ne rend rien du tout. C'est le fait qui commande toute la Tâche 2.
2. **`screen.getAllByTestId(/^grid-row-/)` accepte une expression régulière**, ce qui permet de
   compter les rangées sans les nommer une par une.
3. **`toHaveStyle` traverse un `style` fourni sous forme de TABLEAU**
   (`[styles.gridTile, { width, height }]`), donc les dimensions calculées sont observables.
4. **Un double de `useTranslation` peut rendre `` `${key}:${count}` ``** quand on lui passe des
   options, et la clé nue sinon. C'est ce qui distingue « le compteur s'affiche » de « le compteur
   affiche le bon nombre » — sans quoi les deux cas produisent exactement le même texte.

### Ce qu'aucun test ne prouvera ici

Repris de la spécification, et vrai à la lettre :

- **Qu'un pouce de hauteur suffise à reconnaître un visage.** `MIN_TILE_HEIGHT = 160` a un sens
  physique — le dp vaut 1/160 de pouce — mais rien ne mesure qu'un pouce soit assez. C'est la
  décision la plus fragile du lot, et c'est elle qui fixe **toutes** les capacités : 5 en portrait, 6
  en paysage, 10 sur le pliable. Elle se falsifie sur appareil, avec du vrai monde.
- **Que l'arrangement d'aire maximale soit celui qu'on a envie de regarder.** À trois participants en
  paysage, la formule retient un `2 × 2` **avec une cellule vide** plutôt qu'une rangée propre de
  trois — 63 867 dp² contre 56 864, soit 12 % de plus par visage contre un trou visible en bas à
  droite. Vérifié par exécution ; l'aire lui donne raison, l'œil pourrait ne pas être d'accord.
- **Que le contraste du compteur soit lisible.** RNTL ne rastérise rien. Le test garde que la couleur
  explicite n'a pas été retirée, ce qui est une propriété du code, pas de l'image.
- **Que la grille tienne le budget de décodage.** Elle **borne** le nombre de tuiles là où rien ne le
  bornait — avec `adaptiveStream: false`, cinq tuiles restent cinq flux pleine résolution. « Ne peut
  pas dégrader » n'est pas « tient ».

---

## Tâche 1 : `src/call/grid.ts`, l'arithmétique et rien d'autre

**Files :**

- Create : `src/call/grid.ts`
- Create : `src/call/grid.spec.ts`

**Interfaces :**

- Consumes : rien. Aucun import, aucun SDK, aucune horloge.
- Produces : `Box`, `Packing`, `MIN_TILE_HEIGHT`, `TILE_ASPECT`, `GRID_GAP`,
  `packGrid(count, box, gap)`, `gridCapacity(box, gap)`.

La formule est celle de la spécification, § 1 :

```
pour c de 1 à n :
  r      = ceil(n / c)
  cellW  = (W - (c-1)·gap) / c
  cellH  = (H - (r-1)·gap) / r
  tuileW = min(cellW, cellH · A)      # on INSCRIT A dans la cellule
  tuileH = tuileW / A
  score  = tuileW · tuileH
```

**Les tables de la spécification ont été rejouées** (script Node, arithmétique flottante identique)
avant l'écriture de cette tâche. Elles sont exactes, aux quatre boîtes :

| boîte de contenu | capacité | arrangements retenus |
| --- | --- | --- |
| 435 × 892 (couverture, portrait) | **5** | n = 1–3 : `1 × n`, tuile 435,0 × 244,7 ; n = 4 : 391,1 × 220,0 ; n = 5 : 311,5 × 175,2 ; n = 6 : plancher |
| 961,85 × 383,08 (couverture, tournée) | **6** | n = 1 : 681,0 × 383,1 ; n = 2 : `2 × 1` ; n = 3–4 : `2 × 2`, 337,0 × 189,5 ; n = 5–6 : `3 × 2`, 317,9 × 178,8 ; n = 7 : plancher |
| 843,7 × 822,9 (pliable ouvert) | **10** | n = 9–10 : `2 × 5`, 286,9 × 161,4 |
| 822,9 × 843,7 (le même, tourné) | **10** | inchangé — l'orientation n'entre nulle part |

### Deux découvertes faites en éprouvant cette tâche, toutes deux corrigées ici

**1. Le filtre sur le plancher, dans `packGrid`, est du CODE MORT.** Écrit d'abord tel que la
spécification le décrit — « un arrangement n'est retenu que si `tuileH ≥ MIN_TILE_HEIGHT` » —, puis
muté : le retirer de `packGrid` fait **zéro rouge**. Ce n'est pas un trou de test, c'est un théorème.
Une tuile qui passe le plancher a une aire d'au moins `MIN_TILE_HEIGHT² · TILE_ASPECT` = **45 511
dp²** ; une tuile qui échoue en a strictement moins. L'arrangement d'aire maximale est donc **déjà**
celui d'aire maximale parmi ceux qui passent, dès qu'il en passe un. Vérifié ensuite par balayage
exhaustif — 12 comptes × 170 largeurs × 170 hauteurs, **zéro contre-exemple**.

> Le plancher n'appartient donc qu'à `gridCapacity`, qui décide **combien** de tuiles ; jamais à
> `packGrid`, qui décide seulement **comment les ranger**. Écrire le filtre aux deux endroits donne
> une garde qui n'en est pas une, et une mutation verte à jamais.

**2. `gridCapacity` doit être BORNÉE.** Écrite avec un `for (;;)`, elle a fait **tourner Jest
indéfiniment** sous la mutation « retirer le `Math.min` d'`arrangements` » : sans le `min`, une
colonne unique garde la même hauteur de tuile quel que soit `n`, et la condition d'arrêt n'arrive
jamais. La borne n'est pas un nombre choisi : c'est l'aire de la boîte divisée par celle d'une tuile
au plancher (8 en portrait, 15 sur le pliable, pour des capacités réelles de 5 et 10 — elle ne mord
jamais).

- [ ] **Step 1 : écrire les tests qui échouent**

Créer `src/call/grid.spec.ts`. Les quatre boîtes en tête, en dp de **contenu** — la marge de page est
retirée par l'appelant, ce module n'en connaît aucune :

```ts
const PORTRAIT: Box = { width: 435, height: 892 };
const LANDSCAPE: Box = { width: 961.85, height: 383.08 };
const FOLD_OPEN: Box = { width: 843.7, height: 822.9 };
const FOLD_TURNED: Box = { width: 822.9, height: 843.7 };
```

**Dix-huit cas**, groupés en trois `describe` : les constantes (3), `gridCapacity` (5), `packGrid`
(10). Les cinq qui portent la valeur du lot :

```ts
it('reste sur une seule colonne en portrait, là où deux tiendraient en largeur', () => {
  expect(packGrid(2, PORTRAIT, GRID_GAP).columns).toBe(1);
});

it('passe à deux colonnes en paysage, pour le même nombre de tuiles', () => {
  // Même `count`, même fonction, l'autre réponse : une implémentation qui
  // rendrait une constante passerait le test précédent tout seul.
  expect(packGrid(2, LANDSCAPE, GRID_GAP).columns).toBe(2);
});

it('prend le moins de colonnes quand deux arrangements ont exactement la même aire', () => {
  // 580 × 328 avec deux tuiles : `1 × 2` et `2 × 1` donnent tous deux
  // 288 × 162 dp — égalité EXACTE, 46 656 dp² des deux côtés, et les deux
  // passent le plancher de 160. C'est le SEUL endroit où la règle « à
  // égalité, le moins de colonnes » est observable ; cette boîte a été
  // trouvée par balayage, pas devinée.
  const packing = packGrid(2, { width: 580, height: 328 }, GRID_GAP);

  expect(packing.columns).toBe(1);
  expect(packing.tileWidth).toBeCloseTo(288, 6);
  expect(packing.tileHeight).toBeCloseTo(162, 6);
});

it('en tient dix sur l’écran interne du pliable, dans les deux postures', () => {
  expect(gridCapacity(FOLD_OPEN, GRID_GAP)).toBe(10);
  expect(gridCapacity(FOLD_TURNED, GRID_GAP)).toBe(10);
});

it('rend quand même un arrangement quand aucun ne passe le plancher', () => {
  // Fonction TOTALE : elle ne rend jamais `null`. Seul cas où `tileHeight`
  // peut passer sous le plancher, et il est nommé.
  expect(packGrid(1, { width: 200, height: 100 }, GRID_GAP)).toEqual({
    columns: 1,
    rows: 1,
    tileWidth: expect.closeTo(177.777, 2),
    tileHeight: 100,
  });
});
```

Les treize autres : les trois constantes (`MIN_TILE_HEIGHT === 160`, `TILE_ASPECT === 16 / 9`,
`GRID_GAP === tokens.spacing.xs`) ; les capacités 5 et 6 ; la capacité plancher de 1 sur 200 × 100 ;
la propriété « tout compte annoncé respecte le plancher » balayée sur les deux boîtes du téléphone ;
`rows === ceil(n / c)` sur deux boîtes ; l'inscription du gabarit (`toBeCloseTo`, jamais une égalité
stricte : c'est un flottant) balayée sur trois boîtes ; **les deux branches du `min`** — largeur
commandante en portrait (435,0 = la largeur offerte), hauteur commandante en paysage (681,0311 <
961,85) ; l'entrée réelle du `gap` (`packGrid(2, LANDSCAPE, 4)` = 478,925 contre `gap = 0` =
480,925) ; et `packGrid(0, …)` qui rend un arrangement plutôt que de jeter.

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/call/grid.spec.ts`
Attendu : **ÉCHEC** — `Could not locate module src/call/grid`. Exécuté avant d'écrire cette tâche ;
c'est le bon motif d'échec, pas une assertion fausse.

- [ ] **Step 3 : implémenter `src/call/grid.ts`**

`arrangements()` privée, puis `packGrid` (aire maximale stricte, sans filtre de plancher — voir la
découverte 1) et `gridCapacity` (bornée — voir la découverte 2). Le commentaire de `packGrid` doit
**écrire** pourquoi il n'y a pas de filtre, sans quoi le prochain lecteur le rajoutera.

`GRID_GAP = 4` est repris **en clair**, jamais importé de `src/ui/tokens` : `src/call` est de
l'arithmétique et des règles, sans dépendance à la couche de style. C'est le test
`GRID_GAP === tokens.spacing.xs` qui empêche les deux de diverger.

- [ ] **Step 4 : lancer les tests**

Run : `npx jest src/call/grid.spec.ts` → **18/18**.
Run : `npm test` → **756/756, 54 suites** (738 + 18).

- [ ] **Step 5 : éprouver par mutation**

Neuf mutations, **rejouées avant l'écriture de cette tâche**, portée `npx jest src/call/grid.spec.ts`
(18 cas). Le rouge cité est celui **observé** :

| # | Mutation | Rouges |
| --- | --- | ---: |
| A | critère d'aire remplacé par « le plus de colonnes » | **4** |
| B | égalité d'aire : `>` devient `>=` | **1** |
| C | gabarit non inscrit (`Math.min` supprimé) | **9** |
| D | écart ignoré en largeur | **2** |
| E | écart ignoré en hauteur | **1** |
| F | rangées : `Math.ceil` devient `Math.floor` | **3** |
| G | garde du compte nul supprimée | **1** |
| H | `gridCapacity` ignore le plancher | **4** |
| I | `gridCapacity` : `some` devient `every` | **3** |

La mutation B est celle qui compte : **un seul** rouge, le test de l'égalité d'aire — c'est une
mutation qui **localise**, pas une qui rassure. Restaurer après chaque.

- [ ] **Step 6 : commit**

```bash
git add src/call/grid.ts src/call/grid.spec.ts
git commit -m "feat(call): Pack a tile grid from a measured box and a template ratio"
```

---

## Tâche 2 : la boîte mesurée, l'union, et la grille

**Files :**

- Modify : `src/call/layout.ts`, `src/call/layout.spec.ts`
- Modify : `src/call/useCallLayout.ts`, `src/call/useCallLayout.spec.ts`
- Modify : `src/screens/room/stage.tsx`, `src/screens/room/stage.spec.tsx`
- Modify : `src/screens/room/call.tsx`, `src/screens/room/call.spec.tsx`

**Interfaces :**

- Consumes : `Box`, `GRID_GAP`, `TILE_ASPECT`, `gridCapacity`, `packGrid` de `src/call/grid`
- Produces : `CallLayout` (union discriminée), `StripAxis`,
  `selectLayout(view, facing, box, pin)`, `useCallLayout(room, facing, box, pin): CallLayout | null`,
  `CallStageProps` avec `onMeasureBox` et `onPinTile`

**Une seule tâche, et c'est délibéré.** L'union croise `layout.ts`, `useCallLayout.ts`, `stage.tsx`
et `call.tsx` ; aucun état intermédiaire ne passe `tsc`. La découper reviendrait à livrer des
worktrees qui ne compilent pas.

### Les trois règles, dans l'ordre

1. **L'épinglage résout** vers une tuile présente ⇒ `mode: 'focus'`, cette tuile en grand.
2. **Sinon, un partage d'écran existe** ⇒ `mode: 'focus'`, l'écran de `screenSince` le plus grand.
3. **Sinon** ⇒ `mode: 'grid'`.

La règle 2 est **conservée** et gagne un second motif : sous cette conception une tuile n'est jamais
letterboxée à l'intérieur, or un écran ne peut pas être rogné — « un texte coupé est un texte
perdu ». Un écran est donc le seul contenu qui exige un `contain`, donc une boîte à lui, donc le seul
qui ne peut pas entrer dans une cellule. **La règle ne découle plus seulement du produit, elle
découle de la géométrie.**

Ce que le mode `grid` **supprime**, et il faut le dire franchement : **la sélection du locuteur actif
comme grande scène disparaît quand personne ne partage et que rien n'est épinglé.** C'est le but.
`compareForStage` survit intégralement mais **change d'office** : il ne choisit plus *la* scène, il
**classe**, et ce classement ne sert qu'à décider qui obtient une cellule quand il y a plus de monde
que de cellules. `pickStage` disparaît ; à capacité 1, `pickGridMembers` **est** l'ancienne règle,
mot pour mot.

### Section 5 : le comparatif continu remplace la bascule binaire

`const landscape = width > height` **disparaît**, ainsi que le `useWindowDimensions()` qui
l'alimente. Le comparatif juste est `W / H` contre `TILE_ASPECT` :

- `W / H < TILE_ASPECT` ⇒ le mou est vertical ⇒ **la bande passe dessous** (`stripAxis: 'row'`) ;
- `W / H > TILE_ASPECT` ⇒ le mou est horizontal ⇒ **la bande passe sur le côté** (`'column'`).

**Vérifié par exécution, et c'est le calcul qui porte tout l'argument :** un prédicat `width > height`
donne **la même réponse** que le comparatif juste sur les deux boîtes du téléphone (0,49 et 2,48 sont
loin du seuil des deux côtés). Il ne diverge que sur le pliable ouvert — 851,7 × 830,9 dp, rapport
1,025 : le prédicat binaire dit `'column'`, la règle juste dit `'row'`. **Un seul test peut donc
attraper cette régression**, et c'est celui des deux postures du pliable. C'est ce que la mutation
confirme plus bas : 1 rouge, pas 3.

### `MIN_TILE_HEIGHT` est le seul nombre qui décide, et la marge de page est le second

`selectLayout` retire `2 × GRID_GAP` de la boîte mesurée avant d'empaqueter, et `stage.tsx` pose
exactement `padding: GRID_GAP` sur la page de la grille. **Les deux nombres ne peuvent pas
diverger** : c'est la même constante, et un test de `stage.spec.tsx` garde que la page la porte.

### Le geste : `onPressFilmstripTile` devient `onPinTile`

La bande et la grille disent **exactement la même chose** — « épingle celle-ci ». Un nom qui citerait
la bande mentirait au site de la grille. Le rappel de la scène (`onPressStageTile`, plein écran)
**reste distinct**, ce qui est précisément ce qui rend un mauvais câblage détectable.

**Conséquence assumée, et elle change un parcours utilisateur :** le plein écran ne s'ouvre que
depuis la scène du mode `focus`. Depuis la grille, il faut donc **deux appuis sur la même tuile** —
le premier épingle et la porte sur la scène, le second bascule le plein écran. Ce n'est pas un
artifice de test : c'est le parcours réel, et c'est la conséquence directe du fait qu'un appui sur
une cellule ne peut pas vouloir dire deux choses.

### Le fait qui commande toute la spec d'écran, et qu'il faut lire avant d'écrire une ligne

**Sous Jest, `onLayout` ne part JAMAIS tout seul** — RNTL ne dispose aucune vue. Sans mesure,
`useCallLayout` rend `null` et `CallStage` ne pose **aucune tuile**. Les **96** sites
`await render(withPaper(<CallScreen />))` de `call.spec.tsx` deviennent donc `await renderCall()`,
qui rend puis mesure une fois, comme le ferait la première trame sur appareil :

```ts
const PORTRAIT_BOX = { width: 443, height: 900 };

// Toléré absent : les écrans d'erreur et d'attente de connexion sortent avant
// de monter `CallStage`, et le panneau des participants la démonte.
async function measureStage(box = PORTRAIT_BOX): Promise<void> {
  const root = screen.queryByTestId('stage-root');
  if (root === null) return;
  await fireEvent(root, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: box.width, height: box.height } },
  });
}
```

**Piège vérifié** : un remplacement global de `await render(withPaper(<CallScreen />))` touche aussi
la ligne **à l'intérieur** de l'aide, et produit une récursion infinie
(`RangeError: Maximum call stack size exceeded`). Corriger cette ligne-là à la main. Et **un** site
capture le résultat du rendu (`const view = await renderCall(); … view.unmount()`) : l'aide doit donc
rendre `Awaited<ReturnType<typeof render>>`, pas `void`.

**Bonne nouvelle mesurée** : la boîte vit dans `call.tsx`, pas dans `CallStage`. Elle **survit** au
démontage du panneau des participants, donc aucun test n'a besoin de remesurer après l'avoir refermé.

- [ ] **Step 1 : écrire les tests qui échouent**

**`src/call/layout.spec.ts`** — deux aides de rétrécissement en tête, parce que `tsc` refuse de lire
`tiles` sans savoir qu'on est en `grid` (un `expect(l.mode).toBe('grid')` ne rétrécit rien, et un
`as` mentirait au premier test qui se tromperait de mode) :

```ts
function asGrid(layout: CallLayout): Extract<CallLayout, { mode: 'grid' }> {
  if (layout.mode !== 'grid') throw new Error(`mode attendu 'grid', obtenu '${layout.mode}'`);
  return layout;
}
```

Quatre boîtes, **marge de page comprise** (donc 8 dp de plus que celles de `grid.spec.ts`) :
`PORTRAIT` 443 × 900 (capacité 5), `LANDSCAPE` 969,85 × 391,08 (6), `ONE_CELL` 443 × 308 (**1**),
`THREE_CELLS` 443 × 528 (**3**). Les deux dernières ont été calculées, pas devinées.

Les **33** appels existants gagnent la boîte en troisième argument. Le premier `describe` — l'ancien
« la scène » — devient **« le classement par la parole, observé à une seule cellule »** sur
`ONE_CELL` : chacun de ses neuf tests est l'ancien test de scène, mot pour mot, `layout.stage.key`
devenant `asGrid(layout).tiles[0]?.key`. **Rien de la règle n'est perdu.**

Puis quatre `describe` nouveaux — l'ordre des cellules (5 cas), la coupe au-delà de la capacité
(5 cas), la géométrie (2 cas), la précédence (5 cas) — et un pour l'axe de la bande (3 cas). Les
trois qui portent le lot :

```ts
it('garde ceux qui parlent, pas ceux qui sont arrivés les premiers', () => {
  // Le locuteur est placé en DERNIÈRE position d'arrivée : un tri qui
  // garderait simplement les premiers arrivés l'exclurait, et ce test
  // rougirait. Trois cellules, quatre distants plus soi.
  const layout = selectLayout(
    view(ME, [
      person('ada', { joinedAt: 1 }),
      person('bob', { joinedAt: 2 }),
      person('cid', { joinedAt: 3 }),
      person('zoe', { joinedAt: 4, isSpeaking: true }),
    ]),
    'user',
    THREE_CELLS,
    null,
  );

  // Soi en tête hors classement, puis les deux mieux classés — rangés dans
  // l'ordre stable, jamais dans celui du classement.
  expect(asGrid(layout).tiles.map((t) => t.key)).toEqual(['me:camera', 'ada:camera', 'zoe:camera']);
});

it('cède sa propre cellule au premier distant quand il n’y en a qu’une', () => {
  const layout = selectLayout(view(ME, [person('ada')]), 'user', ONE_CELL, null);

  expect(asGrid(layout).tiles.map((t) => t.key)).toEqual(['ada:camera']);
  expect(asGrid(layout).overflow).toBe(1);
});

it('répond pareil dans les deux postures du pliable ouvert', () => {
  // 851,7 × 830,9 dp puis l'inverse : les deux sont SOUS le seuil de 1,778,
  // donc la bande reste dessous des deux côtés. C'est LE test qui mord si le
  // comparatif redevient `width > height`.
  const open: Box = { width: 851.7, height: 830.9 };
  const turned: Box = { width: 830.9, height: 851.7 };

  expect(asFocus(selectLayout(SHARING, 'user', open, null)).stripAxis).toBe('row');
  expect(asFocus(selectLayout(SHARING, 'user', turned, null)).stripAxis).toBe('row');
});
```

**Attention, piège rencontré :** l'axe de la bande n'existe **qu'en mode `focus`**. Les trois tests
d'axe ont besoin d'un fixateur qui y entre — un partage d'écran est le plus court.

**`src/screens/room/stage.spec.tsx`** — le `const RN: typeof import('react-native') = require(...)`
et son `eslint-disable` **disparaissent** : plus rien n'espionne `useWindowDimensions`, puisque l'axe
arrive dans `layout.stripAxis`. Les quatre `describe` d'orientation restent, avec les mêmes cinq
assertions, mais pilotés par la prop plutôt que par un espion. S'y ajoutent un `describe` « mesure »
(4 cas) et un `describe` « mode grille » (10 cas). Les deux qui comptent :

```ts
it('porte quand même la racine mesurable, sans quoi la mesure n’arriverait jamais', async () => {
  // Le piège exact : rendre `null` en entier tant que la boîte est inconnue
  // retire du même coup le `onLayout` qui la ferait connaître. L'écran reste
  // alors vide pour toujours, et aucun test de disposition ne le voit.
  await renderStage(null);

  expect(screen.getByTestId('stage-root')).toHaveProp('onLayout', expect.any(Function));
});

it('les découpe en rangées de deux quand la grille en compte deux', async () => {
  // Le MÊME nombre de tuiles, l'autre valeur de `columns`.
  await renderStage(gridLayout([tile('me:camera'), tile('ada:camera'), tile('bob:camera')], 2));

  expect(screen.getAllByTestId(/^grid-row-/)).toHaveLength(2);
  // Et le REMPLISSAGE, pas seulement le compte.
  const first = screen.getByTestId('grid-row-0');
  expect(within(first).getByTestId('tile-me:camera')).toBeTruthy();
  expect(within(first).getByTestId('tile-ada:camera')).toBeTruthy();
  expect(within(screen.getByTestId('grid-row-1')).getByTestId('tile-bob:camera')).toBeTruthy();
});
```

**`src/call/useCallLayout.spec.ts`** — deux cas nouveaux, en paire : `null` tant que la boîte l'est,
et la disposition dès qu'elle arrive. **C'est la paire qui prouve que `box` est câblée**, pas l'un
des deux pris seul.

**`src/screens/room/call.spec.tsx`** — l'aide `enterFullscreen(key)` (deux appuis, voir plus haut) et
les **treize** tests qui supposaient une scène par défaut, réécrits vers `grid`. Un seul change de
sens, et c'est instructif :

```ts
// Les deux clés se comportent DIFFÉREMMENT, et c'est tout l'objet de ce test.
// L'ÉPINGLAGE reprend quand la personne revient : comportement voulu et écrit.
expect(screen.getByTestId('pin-marker')).toBeTruthy();
// Le PLEIN ÉCRAN, lui, ne doit pas revenir : il retirerait toutes les commandes.
expect(screen.getByTestId('mic-toggle')).toBeTruthy();
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/call src/screens/room`
Attendu : **ÉCHEC** — `selectLayout` n'accepte que trois arguments, `CallLayout` n'a pas de `mode`,
`stage-root` n'existe pas. Les erreurs sont de compilation et de requête, jamais des assertions
fausses : vérifié en exécutant chaque bloc contre `9fb635c` avant de l'écrire ici.

- [ ] **Step 3 : implémenter**

Dans l'ordre : `layout.ts` (union, `pickStripAxis`, `rankBySpeech`, `pickGridMembers`, la branche
grille de `selectLayout`), `useCallLayout.ts` (`box: Box | null`, retour nullable, **dépendances sur
les deux NOMBRES et jamais sur l'objet** — `onLayout` en reconstruit un à chaque mesure), `stage.tsx`
(`handleLayout` + `testID="stage-root"` sur la racine **commune aux trois dispositions**, `TileGrid`,
`rowsOf`, `axisStyle`), puis `call.tsx` (`useState<Box | null>`, `visibleTiles` sur l'union,
`handlePinTile`).

Deux points à ne pas rater :

- **Le `onLayout` va sur la racine commune**, jamais dans chaque branche : le poser par branche le
  ferait disparaître de celle qu'on oublierait, et le plein écran est justement celle-là.
- **`stageKey` vaut `null` en mode grille** ; la garde `if (stageKey !== null)` existe pour le
  typage, jamais pour un cas atteint — même précédent que `if (account === null || roomId === null)`
  sur les trois actions de modération de `call.tsx`.

- [ ] **Step 4 : lancer la suite complète**

Run : `npm test` → **785/785, 54 suites**. `npx tsc --noEmit`, `npx eslint .` (3 avertissements
préexistants), `npx prettier --check .` propres.

- [ ] **Step 5 : éprouver par mutation**

Portée `npx jest src/call src/screens/room` (539 cas) sauf mention. Rouges **observés** :

| # | Mutation | Rouges |
| --- | --- | ---: |
| a | `stripAxis` redevient `width > height` | **1** |
| b | `onLayout` retiré de la racine | **20** |
| c | la racine ne passe jamais en rangée | **1** (portée `stage.spec.tsx`) |
| d | `ScrollView` toujours `horizontal` | **1** (idem) |
| e | `contentContainerStyle` figé en rangée | **1** (idem) |
| f | style de bande figé en rangée | **1** (idem) |
| g | taille de vignette figée en rangée | **1** (idem) |
| h | `useCallLayout` ignore la boîte (jamais `null`) | **2** |
| i | `handleLayout` ne remonte rien | **19** |
| j | `call.tsx` ne pose jamais la boîte | **17** (portée `call.spec.tsx`) |
| k | la coquille rend des tuiles avant la mesure | **1** (portée `stage.spec.tsx`) |
| l | précédence inversée : l'écran passe devant l'épinglage | **2** |
| m | l'écran ne prend plus le focus | **14** |
| n | ordre des cellules par la parole | **4** |
| o | la coupe garde les premiers arrivés | **1** |
| p | sa propre cellule n'est plus réservée | **28** |
| q | à une cellule, elle revient à soi | **9** |
| r | le débordement est toujours nul | **2** |
| s | la marge de page n'est pas retirée | **1** |
| t | la capacité est ignorée | **11** |
| u | une seule colonne, toujours | **1** |
| v | largeur et hauteur de tuile échangées | **1** |
| w | `rowsOf` ignore `columns` : une seule rangée | **2** (portée `src/screens/room`) |
| x | une cellule ne relaie plus l'épinglage | **12** |
| y | la grille n'est jamais rendue | **30** |

**Les mutations c à g sont les cinq branches de `stripAxis`, prises une par une : un rouge chacune.**
C'est ce que `AGENTS.md` demande — muter la branche, jamais le prédicat qui l'alimente. La mutation a,
qui mute le prédicat, ne donne **1** rouge et testerait la somme des cinq gardes : elle localise
moins bien, et si elle était la seule on croirait les cinq couvertes.

- [ ] **Step 6 : commit**

```bash
git add src/call/layout.ts src/call/layout.spec.ts src/call/useCallLayout.ts \
        src/call/useCallLayout.spec.ts src/screens/room/stage.tsx \
        src/screens/room/stage.spec.tsx src/screens/room/call.tsx src/screens/room/call.spec.tsx
git commit -m "feat(call): Lay participants out on a grid sized by the measured box"
```

---

## Tâche 3 : le débordement, un compte et jamais un défilement

**Files :**

- Modify : `src/screens/room/stage.tsx`, `src/screens/room/stage.spec.tsx`
- Modify : les **sept** locales `src/i18n/locales/*.json`

**Interfaces :**

- Consumes : `layout.overflow`, calculé par la Tâche 2
- Produces : rien de nouveau — un `View` et un `Text` de plus dans `TileGrid`

Au-delà de la capacité, les tuiles restantes ne sont pas rendues et un `+N` les représente. **Jamais
un défilement :** il entrerait en conflit avec le geste d'épinglage, il n'a aucune position de repos
naturelle, et `ParticipantsPanel` est déjà, dans ce dépôt, la surface qui répond à « qui est là » —
distincte de « ce que je regarde ».

**Une clé, dans les sept locales**, sur le précédent exact de `waiting.others` (`{{count}}` dans une
clé unique, sans suffixe de pluriel — le dépôt ne s'en sert nulle part) :

| locale | `call.moreParticipants` |
| --- | --- |
| en | `+{{count}} not shown` |
| fr | `+{{count}} non affiché(s)` |
| es | `+{{count}} sin mostrar` |
| it | `+{{count}} non mostrati` |
| de | `+{{count}} nicht angezeigt` |
| vi | `+{{count}} không hiển thị` |
| ru | `ещё {{count}} не показаны` |

**Doctrine de contraste, obligatoire ici.** Ce `Text` vient de `react-native-paper`, et l'écran
d'appel est sombre dans les deux schémas alors que Paper l'ignore (`AGENTS.md`). Sans couleur
explicite il retomberait sur `onSurface` — un quasi-noir en schéma **clair**, qui est le défaut de la
plupart des appareils, sur un fond quasi noir. Le fond du badge est **opaque** et non translucide :
la grille est pleine par définition dès que ce compteur existe, donc il se pose forcément sur une
image dont personne ici ne connaît la couleur.

- [ ] **Step 1 : élargir le double de `useTranslation`**

Sans cela, aucun test ne peut distinguer « le compteur s'affiche » de « il affiche le bon nombre » :

```ts
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { readonly count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));
```

Les assertions existantes du fichier ne passent aucune option et continuent de lire la clé nue :
vérifié par exécution, aucune ne casse.

- [ ] **Step 2 : écrire les tests qui échouent**

Six cas, dans un `describe('compteur de débordement')` : absent à `overflow: 0`, présent à 1, le
**nombre exact** à 4 puis à 2 (deux comptes distincts — un composant qui afficherait un texte fixe,
ou qui passerait le nombre de tuiles montrées au lieu du débordement, passerait un seul des deux), la
couleur explicite, le fond opaque.

```ts
it('annonce le nombre exact de personnes non montrées, jamais un libellé nu', async () => {
  await renderStage(gridLayout([tile('me:camera')], 1, 4));

  expect(screen.getByTestId('grid-overflow-text')).toHaveTextContent('call.moreParticipants:4');
});
```

**`toHaveTextContent` avec une CHAÎNE compare la chaîne entière sous RNTL 14** (`AGENTS.md`) : c'est
bien ce qu'on veut ici, et c'est pour cela que le double doit rendre exactement
`` `${key}:${count}` ``.

- [ ] **Step 3 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/stage.spec.tsx`
Attendu : **ÉCHEC** — `grid-overflow` introuvable. Et `npx jest src/i18n` reste vert tant que la clé
n'est ajoutée nulle part : c'est **une clé ajoutée à `en.json` seul** qui le fait rougir. Ajouter les
sept d'un coup.

- [ ] **Step 4 : implémenter**

Deux styles (`overflowBadge`, `overflowText`) et un bloc conditionnel à la fin de `TileGrid`,
`position: 'absolute'` en bas à droite de la page — coin opposé au badge d'épinglage, qui vit en haut
à gauche de sa tuile : les deux ne peuvent pas se recouvrir.

- [ ] **Step 5 : lancer la suite complète**

Run : `npm test` → **791/791, 54 suites**.

- [ ] **Step 6 : éprouver par mutation**

Portée `npx jest src/screens/room/stage.spec.tsx` (55 cas). Rouges **observés** :

| # | Mutation | Rouges |
| --- | --- | ---: |
| A | le compteur est toujours posé (`> 0` → `>= 0`) | **1** |
| B | le compteur n'est jamais posé | **5** |
| C | le compte n'est pas transmis au libellé | **2** |
| D | le compte devient celui des tuiles montrées | **1** |
| E | la couleur explicite du compteur est retirée | **1** |
| F | le fond opaque du compteur est retiré | **1** |

- [ ] **Step 7 : commit**

```bash
git add src/screens/room/stage.tsx src/screens/room/stage.spec.tsx src/i18n/locales
git commit -m "feat(call): Count the participants the grid could not show"
```

---

## Ce que ce plan NE fait pas, et pourquoi

- **`call.pin`, `call.unpin` et `accessibilityActions`** — la spécification les demande à sa
  section 4, au titre d'un **appui long** invisible pour un lecteur d'écran. Ce geste n'a jamais été
  livré : la moitié épinglage a retenu un **appui simple**, décision consignée dans la spécification
  elle-même (encadré « Corrigé après implémentation »). Un appui simple sur un `Pressable` est
  déjà offert par TalkBack et VoiceOver ; une action d'accessibilité personnalisée n'ajouterait
  qu'un doublon, et son effet réel n'est de toute façon pas vérifiable sous Jest. **Trois des
  quatre clés annoncées par la spécification sont donc sans objet ; seule `call.moreParticipants`
  est ajoutée.**
- **Un défilement de la grille** — motivé en section 2 de la spécification.
- **Activer `adaptiveStream`** — orthogonal, et ne se vérifie que sur appareil.
- **Lire `TrackPublication.dimensions`** pour adapter le rapport des tuiles aux sources réelles :
  une grille qui se recompose parce qu'un autre participant a tourné son téléphone est pire que 20 %
  de marge.
- **Déplacer la barre de contrôle** quand la boîte s'élargit. Ses 52 dp sont déjà dans la boîte
  mesurée.

## Ce qui reste à constater sur appareil

1. **`MIN_TILE_HEIGHT = 160`** : un pouce suffit-il à reconnaître quelqu'un, à cinq en portrait ?
2. **Le `2 × 2` à trois personnes en paysage**, avec sa cellule vide : l'aire dit oui, l'œil dira
   peut-être non.
3. **La densité réelle de l'écran interne du pliable**, jamais mesurée : les 843,7 × 822,9 dp la
   supposent égale à celle de la couverture. Le **rapport** 0,965, lui, n'en dépend pas — et c'est
   lui qui porte l'argument contre `width > height`.
4. **Le rapport d'image que publient réellement les participants.** Si une majorité de sources se
   révélait en portrait, **c'est `TILE_ASPECT` qu'il faudrait revoir en premier**, pas la formule.
5. **Le budget de décodage et la thermique** à cinq tuiles, `adaptiveStream` désactivé.
6. **Le parcours en deux appuis** vers le plein écran : se découvre-t-il ?

## Auto-relecture

- Les deux tables de fichiers touchés (préambule et par tâche) sont cohérentes : la Tâche 1 ne
  partage aucun fichier avec les deux autres ; les Tâches 2 et 3 partagent `stage.tsx` et sa spec,
  d'où leur ordre strict.
- **Chaque nombre d'arrangement, de capacité et de rapport cité ici a été calculé par exécution**,
  jamais recopié de la spécification : les quatre tables de la section 1 de celle-ci sont exactes, et
  l'égalité d'aire de 580 × 328 a été trouvée par balayage, pas construite à la main.
- **Chaque extrait de test a été exécuté contre `9fb635c`** avant d'être écrit ici, et le code a été
  restauré. Les quatre idiomes RNTL dont dépend le lot ont été isolés dans un composant jetable et
  vérifiés séparément — c'est ce qui a permis d'écrire la Tâche 2 sans supposer que
  `fireEvent(…, 'layout', …)` atteindrait `onLayout`.
- **Les trois tables de mutation portent des rouges OBSERVÉS**, avec leur portée. Une mutation a
  donné zéro rouge lors de cette mise à l'épreuve — le filtre de plancher de `packGrid` — et la
  Tâche 1 la traite comme `AGENTS.md` le demande : ce n'était pas un test manquant, c'était du code
  mort, et il est supprimé plutôt que gardé.
- Le compte de tests annoncé à chaque tâche (756, 785, 791) a été relevé, pas estimé. Le point de
  départ est **738/53** et non les 625/51 de la spécification, écrite avant deux autres lots.
- La seule chaîne visible ajoutée est `call.moreParticipants`, remplie dans les sept locales ;
  `src/i18n/index.spec.ts` échoue si l'une manque. Les trois autres clés annoncées par la
  spécification sont explicitement écartées, avec leur motif, plutôt qu'omises en silence.
