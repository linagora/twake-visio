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
| K6 | commandes visibles / masquées en plein écran | 4 |
| K7 | bande rendue / absente selon le plein écran | 3 |

## Le recensement des EFFETS

**C'est la partie neuve, et elle vient des trois trous du lot précédent** — tous vivaient
dans des *instructions*, pas dans des *branches*. `AGENTS.md` en tire la règle : pour chaque
rappel passé à un pressable, énumérer les instructions de son corps ; chacune veut son
assertion.

| # | Gestionnaire | Instructions | Tâche |
| --- | --- | --- | --- |
| E1 | appui sur une vignette | `setPin(k => k === key ? null : key)` — **une** instruction, **deux** issues : épingler et désépingler. Les deux veulent leur test. | 2 |
| E2 | appui long sur une tuile | `setFullscreen(key)` | 3 |
| E3 | appui en plein écran | `setControlsVisible(true)` **et** armer la disparition — **deux** instructions | 4 |
| E4 | sortie du plein écran | `setFullscreen(null)` **et** désarmer le minuteur — **deux** instructions, et la seconde est celle qu'on oublie | 4 |

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

- [ ] **Step 4 : barre, mutations, commit**

| Mutation | Rouge attendu |
| --- | --- |
| `current === key ? null : key` → `key` | le test de désépinglage, seul |
| `onPress` non transmis au `Pressable` | le test d'épinglage |
| `testID` de tuile modifié | **beaucoup** — c'est voulu, ces tests existent déjà |

---

### Task 3 : le plein écran, l'état et le rendu

**Files:**
- Modify: `src/screens/room/call.tsx`, `src/screens/room/stage.tsx`
- Test: les deux specs

**Le plein écran ne passe pas par `selectLayout`.** Ce n'est pas une décision de
disposition, c'est un état de rendu : on sait déjà quelle tuile, on choisit de ne montrer
qu'elle. Le faire entrer dans la fonction pure la chargerait d'une notion d'écran qu'elle
n'a pas à connaître.

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
| D1 | un appui sur une vignette la fait monter sur la scène | capture avant / après |
| D2 | un second appui la fait redescendre | capture |
| D3 | un appui long masque bande **et** barre | capture |
| D4 | un appui en plein écran rappelle les commandes | capture, puis capture 4 s plus tard |
| D5 | l'épinglage passe devant un partage d'écran en cours | capture, avec un partage actif |

**Ce que même l'appareil ne prouvera pas**, et qu'il faut demander : qu'un appui long
déclenche au bon moment, et qu'un appui simple ne parte pas par accident pendant qu'on fait
défiler la bande. Cela se sent, cela ne se capture pas.
