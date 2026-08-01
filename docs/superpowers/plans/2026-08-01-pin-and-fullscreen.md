# Épinglage et plein écran — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Un appui simple sur une vignette la fait monter sur la scène ; un appui long sur n'importe quelle tuile l'affiche en plein écran, sans bande ni barre de contrôle.

**Architecture :** `selectLayout` reste une fonction pure et gagne une troisième entrée, une clé de tuile épinglée. Le plein écran ne passe **pas** par elle : c'est un état de rendu, tenu par `call.tsx`, qui masque la barre et fait rendre une seule tuile. Aucune dépendance nouvelle.

**Tech Stack :** Expo SDK 57 / RN 0.86, `livekit-client` 2.18.0, `react-native-paper` 5.15.3, Jest + `@testing-library/react-native` 14.

**Conception :** `docs/superpowers/specs/2026-08-01-grid-and-pinning-design.md`, et sa décision du 2026-08-01 qui arrête les deux gestes.

## Global Constraints

- Aucune chaîne visible en dur : sept locales (`en fr es it de vi ru`), toutes remplies. `src/i18n/index.spec.ts` échoue si une clé manque **quelque part**, mais **pas** si elle manque **partout**.
- Aucun style en ligne : jamais de `style={{…}}`, toujours `StyleSheet.create` alimenté par `src/ui/tokens`.
- **Cet écran est sombre dans les deux schémas et Paper l'ignore** : tout texte, toute surface porte une couleur explicite issue des tokens. Jamais de `disabled` : on masque.
- Jamais `export default` hors de `app/`. Jamais `x as unknown as T` hors des `*.spec.*`.
- RNTL 14 est **asynchrone** : chaque `render` / `fireEvent` veut un `await`. `tsc` ne le signale pas.
- Barre par tâche : `npm test`, `npm run typecheck`, `npm run lint` (0 erreur ; l'avertissement de `src/i18n/index.ts:32` est toléré), `npx prettier --check .`. Départ : **674 tests, 53 suites**.
- **Committer d'abord, muter ensuite.**

---

## Le recensement des conditionnelles

| # | Conditionnelle | Tâche |
| --- | --- | --- |
| K1 | `pin === null` — scène par défaut / tuile épinglée | 1 |
| K2 | `pin` posé mais **ne résout pas** — retombe sur le défaut | 1 |
| K3 | `pinned` du résultat — vrai / faux | 1 |
| K4 | `fullscreen === null` — disposition normale / tuile seule | 3 |
| K5 | `fullscreen` posé mais **ne résout pas** — retombe sur le normal | 3 |
| K6 | commandes visibles / masquées en plein écran | 4 — **sans objet : la Tâche 4 n'a pas été livrée, voir sa correction** |
| K7 | bande rendue / absente selon le plein écran | 3 |

## Le recensement des EFFETS

**C'est la partie neuve, et elle vient des trois trous du lot précédent** — tous vivaient
dans des *instructions*, pas dans des *branches*. `AGENTS.md` en tire la règle : pour chaque
rappel passé à un pressable, énumérer les instructions de son corps ; chacune veut son
assertion.

| # | Gestionnaire | Instructions | Tâche |
| --- | --- | --- | --- |
| E1 | appui sur une vignette | `setPin(k => k === key ? null : key)` — **une** instruction, **deux** issues : épingler et désépingler. Les deux veulent leur test. — **livré autrement, voir la correction de la Tâche 2** | 2 |
| E2 | appui long sur une tuile | `setFullscreen(key)` — **l'appui long n'a jamais été livré, voir la correction de la Tâche 3** | 3 |
| E3 | appui en plein écran | `setControlsVisible(true)` **et** armer la disparition — **deux** instructions — **jamais livré, voir la correction de la Tâche 4** | 4 |
| E4 | sortie du plein écran | `setFullscreen(null)` **et** désarmer le minuteur — **deux** instructions, et la seconde est celle qu'on oublie — **jamais livré, voir la correction de la Tâche 4** | 4 |

**E4 est le trou probable de ce lot.** Un minuteur qu'on n'annule pas se déclenche sur un
composant démonté, ou rallume les commandes après coup. Il veut son test, et sa mutation.

## Ce qui a été vérifié par EXÉCUTION avant d'écrire ce plan

Une spécification jetable, montée contre HEAD puis supprimée. Trois faits, mesurés et non
déduits :

1. `fireEvent.press(el)` atteint `onPress` et **pas** `onLongPress`.
2. `fireEvent(el, 'longPress')` atteint `onLongPress` et **pas** `onPress`. Les deux gestes
   sont donc distinguables en test — rien n'oblige à simuler des durées.
3. `jest.useFakeTimers()` + `await act(async () => { jest.advanceTimersByTime(n); })` pilote
   bien un cycle affichage/disparition monté sur `setTimeout` dans un `useEffect`.

**Les trois faits restent vrais de RNTL ; deux d'entre eux ne servent plus à rien ici.** Aucun
`onLongPress` n'a été livré (voir la correction de la Tâche 3) et aucun minuteur de chrome non plus
(correction de la Tâche 4) : les points 2 et 3 ne décrivent plus aucun code de ce dépôt.
`grep -rn "onLongPress\|chromeVisible\|setControlsVisible" src/` ne rend rien.

---

### Task 1 : `selectLayout` gagne l'épinglage

**Files:**
- Modify: `src/call/layout.ts`
- Test: `src/call/layout.spec.ts`

**Interfaces:**
- Produit : `selectLayout(view, facing, pin)` et un champ `pinned` sur le résultat. Les tâches 2 et 3 en dépendent.

```ts
export type CallLayout = {
  readonly stage: Tile;
  // Vrai quand c'est l'épinglage qui a produit cette scène, faux quand c'est un
  // partage d'écran ou la parole. La coquille en tire un marqueur, pas une règle.
  readonly pinned: boolean;
  readonly filmstrip: readonly Tile[];
};

export function selectLayout(
  view: RoomView,
  facing: FacingMode,
  // Une clé de tuile, `${identity}:${source}`. `null` = rien d'épinglé.
  pin: string | null,
): CallLayout;
```

> ### Corrigé après implémentation : ni cette forme ni cette signature ne survivent à HEAD
>
> Ce que cette tâche a livré était juste **au moment où elle l'a livré**, et le lot suivant — la
> grille adaptative, `docs/superpowers/plans/2026-08-01-adaptive-grid.md` — l'a remplacé en entier.
> Contre HEAD :
>
> - `CallLayout` n'a plus de champ `stage` : c'est une **union discriminée**
>   (`src/call/layout.ts:99-125`), `{ mode: 'grid', columns, tileWidth, tileHeight, tiles, overflow }`
>   ou `{ mode: 'focus', focus, pinned, stripAxis, filmstrip }`. Le successeur direct de l'ancien
>   `stage` est `layout.focus`, et il n'existe qu'en mode `focus`.
> - `selectLayout` prend **quatre** arguments : `selectLayout(view, facing, box, pin)`
>   (`src/call/layout.ts:264-274`), la `box` étant la boîte mesurée par `onLayout`.
> - `useCallLayout` rend `CallLayout | null` — `null` tant que la mesure n'est pas arrivée.
>
> **L'ordre de priorité de la Step 1, lui, a survécu mot pour mot** : l'épinglage passe devant le
> partage d'écran, qui passe devant le reste (`src/call/layout.ts:287-310`). C'est la seule chose de
> cette tâche qu'on puisse encore lire dans le code, et c'est celle qui comptait. Les trois extraits
> de test de la Step 2 **ne compilent plus** : ils appellent `selectLayout` à trois arguments et
> lisent `layout.stage`.

- [ ] **Step 1 : la règle, et son ordre de priorité**

L'épinglage passe **devant** le partage d'écran. C'est tout son intérêt : sans cela, on ne
pourrait pas regarder un visage pendant qu'un support est partagé — le cas qui a fait
revenir cette fonction après qu'on l'eut retirée.

```ts
export function selectLayout(
  view: RoomView,
  facing: FacingMode,
  pin: string | null,
): CallLayout {
  // Toutes les tuiles candidates, dans l'ordre où la bande les montrerait. Sa
  // propre vignette ouvre la bande, à une place fixe.
  const everyone = [view.local, ...[...view.remotes].sort(compareStable)];
  const candidates = [
    ...everyone.map((p) => toTile(p, 'camera', facing)),
    ...everyone.filter((p) => p.screen !== null).map((p) => toTile(p, 'screen', facing)),
  ];

  // L'épinglage est RÉSOLU contre la vue présente à chaque rendu, jamais
  // « effacé ». Une personne qui part emporte sa tuile ; la clé reste posée et
  // ne résout plus, donc on retombe sur la règle ordinaire. Si elle revient,
  // l'épinglage reprend tout seul — et une reconnexion le conserve.
  const pinnedTile = pin === null ? undefined : candidates.find((t) => t.key === pin);

  const presenter = pickScreen(view);
  // Un partage ne se DISPUTE pas la scène avec la parole : il la prend. Mais un
  // épinglage passe devant lui : c'est une demande explicite, et elle gagne.
  const stage: Tile =
    pinnedTile ??
    (presenter === null
      ? toTile(pickStage(view), 'camera', facing)
      : toTile(presenter, 'screen', facing));

  const filmstrip = candidates.filter((tile) => tile.key !== stage.key);

  return { stage, pinned: pinnedTile !== undefined, filmstrip };
}
```

- [ ] **Step 2 : les tests, un par conditionnelle, des deux côtés**

K1, K2, K3. Les fixtures existantes du fichier fournissent déjà `person(...)`,
`fakeCamera(...)` et `roomView(...)` — **ouvre-les avant de les citer**, ce plan a déjà eu
tort sur ce point dans un lot précédent.

```ts
it('épingle la tuile demandée, même quand quelqu’un partage son écran', () => {
  // Le cas qui justifie toute la fonction : sans épinglage, l'écran prend la
  // scène et aucun visage ne peut y revenir.
  const view = roomView(
    person('u-moi', { camera: fakeCamera('cam-moi'), isLocal: true }),
    [person('u-ada', { camera: fakeCamera('cam-ada'), screen: fakeCamera('scr-ada'), screenSince: 1000 })],
  );

  const layout = selectLayout(view, 'user', 'u-ada:camera');

  expect(layout.stage.key).toBe('u-ada:camera');
  expect(layout.pinned).toBe(true);
  // La tuile promue quitte la bande, et l'écran y descend.
  expect(layout.filmstrip.map((t) => t.key)).toContain('u-ada:screen');
  expect(layout.filmstrip.map((t) => t.key)).not.toContain('u-ada:camera');
});

it('sans épinglage, l’écran garde la scène', () => {
  // K1, l'autre côté. MÊME vue, MÊME appel, seule la clé change : c'est la
  // paire qui prouve que `pin` est câblé, pas l'un des deux tests.
  const view = roomView(
    person('u-moi', { camera: fakeCamera('cam-moi'), isLocal: true }),
    [person('u-ada', { camera: fakeCamera('cam-ada'), screen: fakeCamera('scr-ada'), screenSince: 1000 })],
  );

  const layout = selectLayout(view, 'user', null);

  expect(layout.stage.key).toBe('u-ada:screen');
  expect(layout.pinned).toBe(false);
});

it('ignore un épinglage qui ne résout plus, sans rien casser', () => {
  // K2. Quelqu'un est parti ; la clé reste posée dans `call.tsx`. On retombe sur
  // la règle ordinaire plutôt que de rendre une scène vide.
  const view = roomView(person('u-moi', { camera: fakeCamera('cam-moi'), isLocal: true }), []);

  const layout = selectLayout(view, 'user', 'u-parti:camera');

  expect(layout.stage.key).toBe('u-moi:camera');
  expect(layout.pinned).toBe(false);
});
```

- [ ] **Step 3 : compléter les appelants**

`npx tsc --noEmit` nomme chaque site. `useCallLayout` relaie l'argument ; les autres passent
`null`. **Ne pas encore câbler de geste** — c'est la tâche 2.

- [ ] **Step 4 : barre complète**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`

- [ ] **Step 5 : prouver que les gardes mordent**

Committer d'abord. Une mutation à la fois, `git checkout --` entre chaque.

| Mutation | Rouge attendu |
| --- | --- |
| `pinnedTile ?? (…)` → `(…)` (l'épinglage ignoré) | le test d'épinglage sur un partage |
| l'épinglage placé **après** le partage | le même test, seul |
| `pinned: pinnedTile !== undefined` → `pinned: false` | les deux tests qui l'assertent |
| `candidates.find(...)` → `candidates[0]` | le test de l'épinglage qui ne résout plus |
| filtre de bande retiré | le test qui vérifie que la tuile promue quitte la bande |

**Ces comptes sont des PLANCHERS, pas des cibles.** Ils énumèrent par cible interrogée et
sous-comptent dès que deux tests partagent une clé. Plus de rouges que prévu n'est pas une
erreur : établis que la cause est la même, et dis-le.

---

### Task 2 : la coquille relaie l'appui, `call.tsx` tient l'épinglage

**Files:**
- Modify: `src/screens/room/stage.tsx`, `src/screens/room/call.tsx`
- Test: `src/screens/room/stage.spec.tsx`, `src/screens/room/call.spec.tsx`

**La coquille reste bête.** Elle rend ce qu'on lui donne et relaie un appui. Elle ne décide
rien : ni qui monte, ni ce que l'appui signifie. L'état vit dans `call.tsx`, parce que
`CallStage` est démontée quand le panneau des participants s'ouvre — un état tenu dans la
coquille serait perdu à chaque ouverture.

- [ ] **Step 1 : `CallStage` gagne deux props**

```ts
export type CallStageProps = {
  readonly layout: CallLayout;
  readonly onPressTile: (key: string) => void;
  readonly onLongPressTile: (key: string) => void;
};
```

Chaque `VideoTile` s'enveloppe d'un `Pressable` portant `onPress` et `onLongPress`, et
gardant le `testID` existant `` `tile-${tile.key}` `` — les tests actuels l'interrogent, et
rien ne doit les faire bouger. **La scène aussi est pressable** : un appui long doit
l'atteindre.

> ### Corrigé après implémentation : deux props génériques sont devenues cinq props par SURFACE
>
> `onPressTile` / `onLongPressTile` n'existent pas. `CallStageProps`
> (`src/screens/room/stage.tsx:293-337`) porte **un rappel par site d'appel**, et c'est délibéré :
> la coquille instancie `VideoTile` à trois endroits qui ne veulent pas dire la même chose sous le
> même doigt.
>
> | Surface | Prop | Ce qu'un appui fait |
> | --- | --- | --- |
> | scène du mode `focus` | `onPressStageTile: () => void` | bascule le plein écran sur elle (`stage.tsx:526`) |
> | cellule de grille | `onFullscreenTile: (key: string) => void` | ouvre le plein écran sur elle (`stage.tsx:448`) |
> | vignette de bande | `onPinTile: (key: string) => void` | épingle celle qu'on touche (`stage.tsx:560`) |
> | badge d'épinglage | `onUnpinTile: () => void` | désépingle — le seul geste qui le fasse (`stage.tsx:274`) |
> | tuile plein écran | `onExitFullscreen: () => void` | en sort (`stage.tsx:494`) |
>
> `onPressStageTile` et `onExitFullscreen` ne prennent **aucun argument** : il n'y a jamais qu'une
> tuile sur la scène, et `call.tsx` en connaît déjà la clé.
>
> **Et le nom de la prop de `VideoTile` n'est pas `onPress` mais `onTilePress`**
> (`stage.tsx:189`) — pas une coquetterie : `fireEvent.press` de RNTL 14 remonte la fibre jusqu'au
> premier ancêtre **hôte**, et un `Pressable` n'en est pas un ; une prop homonyme se laisse donc
> trouver sur la fibre du composant sans jamais prouver qu'il la relaie. C'est devenu une règle
> d'`AGENTS.md`, mesurée sur ce dépôt.

- [ ] **Step 2 : E1, l'effet à deux issues**

Dans `call.tsx` :

```tsx
const [pin, setPin] = useState<string | null>(null);

// Une seule instruction, DEUX issues : un second appui sur la tuile déjà
// épinglée la désépingle. C'est ce qui rend le geste réversible sans rien
// apprendre — et les deux issues veulent chacune leur test.
const handlePressTile = useCallback((key: string): void => {
  setPin((current) => (current === key ? null : key));
}, []);
```

> ### Corrigé après implémentation : le ternaire a été retiré. Un second appui ne désépingle PLUS.
>
> Ce que HEAD porte, c'est **une seule issue** (`src/screens/room/call.tsx:321-323`) :
>
> ```tsx
> const handlePinTile = useCallback((key: string): void => {
>   setPin(key);
> }, []);
> ```
>
> Trois faits enchaînés, et le troisième est celui qu'on ne voit pas en lisant le ternaire :
>
> 1. **La bande ne peut jamais porter la tuile déjà épinglée** : une tuile épinglée force le mode
>    `focus` et occupe la scène, et `selectLayout` la filtre hors de `filmstrip`
>    (`src/call/layout.ts:308`). Or la bande est le **seul** site qui appelle encore `onPinTile`
>    (`stage.tsx:560`). L'ambiguïté « épingler ou désépingler selon l'état courant » ne se présente
>    donc littéralement jamais à ce rappel.
> 2. **Le second appui sur la tuile désormais en scène bascule le plein écran**, il ne désépingle
>    pas — même surface, autre geste (`handlePressStageTile`, `call.tsx:355-357`). Deux sens sur un
>    même appui, c'était l'ambiguïté à supprimer.
> 3. **Désépingler est devenu le geste d'un badge dédié**, `pin-marker`, un `Pressable` imbriqué
>    dans celui de la tuile (`stage.tsx:271-286`) et câblé sur `handleUnpinTile`
>    (`call.tsx:362-364`). Une punaise discrète passait inaperçue sur appareil ; le badge porte un
>    libellé et un plancher tactile de 44 dp.
>
> Le motif est géométrique et il a été mesuré : épingler **redispose l'écran sous le doigt**, donc
> le second appui du parcours « deux appuis » ne tombait plus sur la même chose — à cinq en
> portrait il épinglait quelqu'un d'autre, à trois ou moins il tombait sur le badge et l'effet net
> était nul. Le raisonnement complet est dans `call.tsx:326-338`.

- [ ] **Step 3 : les tests**

```tsx
it('épingle la vignette qu’on touche', async () => { /* … */ });

// E1, la seconde issue. Sans CE test, une implémentation qui poserait
// `setPin(key)` sans jamais désépingler passerait le précédent.
it('désépingle au second appui sur la même tuile', async () => { /* … */ });
```

**Vérifié par exécution avant d'écrire ce plan** : `fireEvent.press` n'atteint que
`onPress`, jamais `onLongPress`. Les deux gestes se testent séparément sans simuler de
durée.

> ### Corrigé : le second test livré assert l'INVERSE de celui qui est écrit ci-dessus
>
> Il ne faut pas écrire « désépingle au second appui » : `call.spec.tsx:2260` garde exactement le
> contraire, et le nomme —
> `it('un second appui sur la tuile désormais en scène ne la désépingle pas : il bascule le plein écran')`.
> Il est doublé de `it('désépingle sur un appui du badge, jamais sur un appui de la tuile')`
> (`call.spec.tsx:2281`), qui est le test de la seule issue restante.
>
> Sa fixture mérite d'être notée, parce qu'elle n'est pas évidente et qu'elle découle du point 1
> ci-dessus : **il faut un partage d'écran pour pouvoir épingler du tout.** La bande n'existe qu'en
> mode `focus`, donc le test fait présenter Ada avant de toucher une vignette.

- [ ] **Step 4 : barre, mutations, commit**

| Mutation | Rouge attendu |
| --- | --- |
| `current === key ? null : key` → `key` | le test de désépinglage, seul |
| `onPress` non transmis au `Pressable` | le test d'épinglage |
| `testID` de tuile modifié | **beaucoup** — c'est voulu, ces tests existent déjà |

> ### Corrigé : la première mutation de ce tableau n'a plus de cible
>
> Il n'y a plus de ternaire à muter — c'est déjà `setPin(key)`. Les mutations que HEAD rend
> possibles à cet endroit sont les suivantes, et elles portent sur le **câblage par surface** :
>
> | Mutation | Rouge attendu |
> | --- | --- |
> | la cellule de grille câblée sur `onPinTile` au lieu de `onFullscreenTile` | les tests de plein écran depuis la grille |
> | la vignette de bande câblée sur `onFullscreenTile` au lieu de `onPinTile` | les tests d'épinglage |
> | `onTileUnpin` non transmis au badge | `'désépingle sur un appui du badge…'`, seul |
> | `onTilePress` non transmis au `Pressable` de `VideoTile` | **beaucoup** — mesuré ; c'est ce qui a justifié le renommage de la prop |
>
> Deux props de **même signature** (`onPinTile`, `onFullscreenTile`) branchées sur deux sites
> distincts, c'est précisément ce qui rend le mauvais câblage détectable — voir le commentaire de
> `CallStageProps.onPinTile` (`stage.tsx:321-322`).

---

### Task 3 : le plein écran, l'état et le rendu

**Files:**
- Modify: `src/screens/room/call.tsx`, `src/screens/room/stage.tsx`
- Test: les deux specs

**Le plein écran ne passe pas par `selectLayout`.** Ce n'est pas une décision de
disposition, c'est un état de rendu : on sait déjà quelle tuile, on choisit de ne montrer
qu'elle. Le faire entrer dans la fonction pure la chargerait d'une notion d'écran qu'elle
n'a pas à connaître.

> ### Corrigé après implémentation : **l'appui long n'a jamais été livré**
>
> Le geste retenu est **l'appui simple**, à chaque surface, et une surface ne porte qu'un seul
> geste. `grep -rn "onLongPress" src/` ne rend rien : ni `stage.tsx`, ni `call.tsx`, ni aucun test.
> Le fait de RNTL cité en préambule — `fireEvent(el, 'longPress')` atteint `onLongPress` et pas
> `onPress` — reste vrai ; il ne s'applique plus à aucun composant de ce dépôt.
>
> Le plein écran s'ouvre donc **par un appui simple** :
>
> - depuis une **cellule de grille**, sur elle (`stage.tsx:448` → `handleFullscreenTile`,
>   `call.tsx:336-338`) ;
> - depuis la **scène** du mode `focus`, sur la tuile qui s'y trouve, épinglée ou non
>   (`stage.tsx:526` → `handlePressStageTile`, `call.tsx:355-357`).
>
> Et il se referme par un appui simple **n'importe où sur l'unique tuile** (`stage.tsx:494` →
> `handleExitFullscreen`) : un aller-retour sur la même surface et le même geste, ce qui rend la
> Tâche 4 entièrement caduque — voir sa correction.
>
> La bande, elle, n'ouvre **jamais** le plein écran : un appui y épingle. C'est le seul endroit où
> l'on épingle encore, ce qui a une conséquence produit à dire tout haut — **épingler n'est
> atteignable que pendant qu'on partage un écran**, puisque la bande n'existe qu'en mode `focus`.
> Assumé : épingler sert à ramener un visage que le partage a chassé dans la bande ; hors partage,
> la grille montre déjà tout le monde et il n'y a rien à défaire (`call.tsx:316-320`).

- [ ] **Step 1 : l'état et la résolution**

```tsx
const [fullscreen, setFullscreen] = useState<string | null>(null);

// Résolu contre la disposition présente, comme l'épinglage : une tuile qui
// disparaît ne laisse pas l'écran figé sur du vide.
const fullscreenTile =
  fullscreen === null
    ? null
    : ([layout.stage, ...layout.filmstrip].find((t) => t.key === fullscreen) ?? null);
```

K4, K5. Quand `fullscreenTile` n'est pas `null` : la barre de contrôle **n'est pas rendue**,
et `CallStage` ne rend que cette tuile, sans bande.

> ### Corrigé : cet extrait **ne compile pas** contre HEAD, et la résolution a gagné une guérison
>
> `layout.stage` n'existe plus (voir la correction de la Tâche 1) et `layout` peut valoir `null`
> tant que la boîte n'est pas mesurée. Ce que porte `call.tsx:246-254` :
>
> ```tsx
> const visibleTiles: readonly Tile[] =
>   layout === null
>     ? []
>     : layout.mode === 'grid'
>       ? layout.tiles
>       : [layout.focus, ...layout.filmstrip];
>
> const fullscreenTile =
>   fullscreen === null ? null : (visibleTiles.find((t) => t.key === fullscreen) ?? null);
> ```
>
> **Et la résolution seule ne suffisait pas.** Une clé qui ne résout plus restait posée
> indéfiniment ; si sa cible revenait — reconnexion, ou une personne qui repart et rejoint sous la
> même identité — elle résolvait de nouveau et **rejetait l'écran dans un plein écran sans
> commandes**, sans que personne n'ait rien demandé. `call.tsx:273-275` efface donc la clé
> **pendant le rendu** dès qu'elle ne résout plus, et `call.tsx:304-306` fait la même chose pour
> l'épinglage. Pendant le rendu et jamais dans un effet : `react-hooks/set-state-in-effect`
> l'interdit, et un effet aurait laissé peindre un rendu intermédiaire périmé.
>
> Le troisième invariant de sortie, qui n'était nulle part dans ce plan : **tout ouvreur de panneau
> sort du plein écran**, par une porte unique (`openPanel`, `call.tsx:716-719`). Ouvrir un panneau
> démonte `CallStage`, qui porte le seul geste capable de sortir — sans cette ligne, l'écran
> s'enfermait. Aucun test ne peut la rougir aujourd'hui et il ne faut pas en fabriquer un ; le
> commentaire du code explique pourquoi elle n'est pas décorative pour autant.

- [ ] **Step 2 : les tests, les deux côtés de chaque conditionnelle**

```tsx
it('n’affiche que la tuile et masque les commandes en plein écran', async () => { /* … */ });
it('rend la bande et les commandes hors plein écran', async () => { /* … */ });
it('retombe sur la disposition normale si la tuile épinglée disparaît', async () => { /* … */ });
```

- [ ] **Step 3 : barre, mutations, commit**

| Mutation | Rouge attendu |
| --- | --- |
| barre rendue inconditionnellement | le test de masquage |
| bande rendue inconditionnellement | le même |
| `?? null` retiré de la résolution | le test de la tuile disparue |

---

### Task 4 : rappeler les commandes, et désarmer le minuteur

**Files:** `src/screens/room/call.tsx` + spec, et les sept locales.

**C'est la tâche où vit le trou probable de ce lot** — E3 et E4 portent chacun deux
instructions, et la seconde de E4 est celle qu'on oublie.

> ### Corrigé après implémentation : **cette tâche entière n'a pas été livrée, et n'a plus d'objet**
>
> `grep -rn "chromeVisible\|setControlsVisible\|CHROME_REVEAL_MS" src/` ne rend rien. Ni l'état, ni
> le `useEffect`, ni son minuteur, ni sa constante, ni aucune locale ne sont dans le dépôt.
>
> **Ce n'est pas un oubli, c'est une conséquence.** La Tâche 3 devait livrer un appui long pour
> entrer et un appui pour révéler les commandes ; ce qui a été livré est un **appui simple pour
> entrer et le même appui simple pour sortir**, sur la même surface (`stage.tsx:494` →
> `handleExitFullscreen`, `call.tsx:372-374`). La sortie n'est donc plus un état intermédiaire à
> révéler puis à laisser expirer — elle est immédiate, et **totale par construction**. Il n'y a plus
> rien à armer, donc plus rien à désarmer : le trou que cette tâche annonçait comme « probable » a
> été supprimé avec la machinerie qui le portait, pas gardé par un test.
>
> Le commentaire qui consigne l'arbitrage est à `call.tsx:366-374`.
>
> **Ce qui reste vrai, et qu'il ne faut pas perdre en supprimant cette tâche :** un état qui retire
> des commandes doit être accompagné du tableau de ses sorties, et la transition `entrée → sortie`
> doit être **totale sur les états atteignables**. C'est la règle que la conception a tirée de
> l'enfermement mesuré sur cette branche
> (`docs/superpowers/specs/2026-08-01-grid-and-pinning-design.md`, encadré « Le piège
> d'enfermement »). Elle est aujourd'hui tenue par trois choses et non par un minuteur : la sortie
> sur la tuile elle-même, la barre non rendue en plein écran (`CallControlBarProps.hidden`,
> `callControlBar.tsx:259`), et la porte unique `openPanel` qui sort du plein écran quoi qu'il
> arrive (`call.tsx:716-719`).
>
> **Les Steps 1 à 3 ci-dessous ne décrivent donc aucun code livré. Ne pas les dérouler.** Ils sont
> conservés pour ce qu'ils gardent : le raisonnement sur E3/E4, qui reste la bonne façon de
> recenser un effet à deux instructions.

- [ ] **Step 1 : E3 et E4**

```tsx
const [chromeVisible, setChromeVisible] = useState(false);

// E3 : afficher ET armer la disparition. E4 : la sortie du plein écran doit
// DÉSARMER, sinon le minuteur se déclenche sur un composant démonté ou rallume
// les commandes après coup. C'est la ligne qu'on oublie, et le `return` du
// `useEffect` est ce qui la rend automatique plutôt que manuelle.
useEffect(() => {
  if (!chromeVisible) return undefined;
  const id = setTimeout(() => setChromeVisible(false), CHROME_REVEAL_MS);
  return () => clearTimeout(id);
}, [chromeVisible]);
```

- [ ] **Step 2 : les tests, avec les faux timers**

**Vérifié par exécution** : `jest.useFakeTimers()` puis
`await act(async () => { jest.advanceTimersByTime(n); })` pilote bien ce cycle.

```tsx
it('rappelle les commandes sur un appui, puis les retire seules', async () => { /* … */ });

// E4. Sans CE test, un `useEffect` sans fonction de nettoyage passerait le
// précédent et laisserait un minuteur courir sur un composant démonté.
it('désarme le minuteur quand on quitte le plein écran', async () => { /* … */ });
```

- [ ] **Step 3 : barre, mutations, commit**

| Mutation | Rouge attendu |
| --- | --- |
| `return () => clearTimeout(id)` retiré | le test de désarmement, **seul** |
| `setTimeout` retiré | le test de disparition |
| délai porté à une valeur absurde | le test de disparition |

---

## Vérification sur appareil, à faire par l'agent lui-même

Nouveau, et c'est ce qui change pour ce lot : **le téléphone est branché et pilotable**.
`adb shell input tap X Y`, `adb shell input swipe X Y X Y 800` pour un appui long, et
`adb exec-out screencap -p -d <id>` pour capturer. Les deux écrans du pliable ont des
identifiants distincts — `dumpsys SurfaceFlinger --display-id` les donne.

| # | À constater | Comment |
| --- | --- | --- |
| D1 | un appui sur une vignette **de bande** la fait monter sur la scène | capture avant / après |
| D2 | ~~un second appui la fait redescendre~~ — **un appui sur le badge `pin-marker` la fait redescendre** | capture |
| D3 | ~~un appui long masque bande **et** barre~~ — **un appui simple sur la scène, ou sur une cellule de grille, masque bande et barre** | capture |
| D4 | ~~un appui en plein écran rappelle les commandes~~ — **un appui en plein écran en SORT** | capture |
| D5 | l'épinglage passe devant un partage d'écran en cours | capture, avec un partage actif |

Les trois lignes barrées décrivent les gestes que ce plan avait prévus ; voir les corrections des
Tâches 2, 3 et 4 pour ce qui a été livré à leur place. `adb shell input swipe` pour l'appui long
n'a plus d'usage ici.

**Ce que même l'appareil ne prouvera pas**, et qu'il faut demander : qu'un appui simple ne parte
pas par accident pendant qu'on fait défiler la bande, et — question née de l'arbitrage, celle-là —
qu'on trouve **comment épingler**, sachant que la bande n'apparaît que lorsque quelqu'un partage.
Cela se sent, cela ne se capture pas.
