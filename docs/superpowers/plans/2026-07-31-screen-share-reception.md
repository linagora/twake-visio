# Réception du partage d'écran — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher l'écran partagé par un autre participant, lui donner la scène tant qu'il dure, et lui laisser toute la surface en paysage.

**Architecture:** `src/call/participants.ts` reste la seule frontière avec LiveKit et gagne la lecture de `Track.Source.ScreenShare` plus une table `trackSid → instant de première vue`, alimentée à la lecture. `src/call/layout.ts` reste une fonction pure et n'y compare que des nombres. `src/screens/room/stage.tsx` dérive son cadrage de la source de la tuile et bascule sa bande en colonne quand la fenêtre est plus large que haute.

**Tech Stack:** Expo SDK 57 / RN 0.86, `livekit-client` 2.18.0, `@livekit/react-native` 2.12.0, `react-native-paper` 5.15.3, Jest + `@testing-library/react-native` 14.

**Conception :** `docs/superpowers/specs/2026-07-31-screen-share-reception-design.md`

## Global Constraints

- Aucune chaîne visible en dur : sept locales (`en fr es it de vi ru`), toutes remplies avant fusion. `src/i18n/index.spec.ts` échoue si une clé manque quelque part.
- Aucun style en ligne : jamais de `style={{…}}`, toujours `StyleSheet.create` alimenté par `src/ui/tokens`.
- Jamais `export default` hors de `app/`. Jamais `x as unknown as T` hors des fichiers `*.spec.*`.
- `@testing-library/react-native` 14 est **asynchrone** : `render`, `fireEvent` et ses raccourcis, `renderHook` et `cleanup` rendent des promesses. Chaque appel prend `await`. `tsc` ne le signale pas.
- Barre de qualité par tâche : `npm test`, `npm run typecheck`, `npm run lint` (0 erreur ; l'unique avertissement de `src/i18n/index.ts:32` est toléré), `npx prettier --check .`.
- Jamais `npm install` dans un worktree : `node_modules` y est un lien symbolique. Jamais `--no-verify`. Stager des chemins explicites.
- **Committer d'abord, muter ensuite.** Une mutation appliquée sur du code non committé se perd au `git checkout --`.

### La contrainte structurelle, héritée du périmètre C1

Deux tâches sur huit, au périmètre C1, n'ont pas pu respecter leur propre frontière de fichiers : le typecheck cassait chez un voisin, et l'implémenteur a dû livrer un stand-in inerte. La règle qui en découle :

> **Toute tâche qui élargit un type consommé hors de son propre périmètre de fichiers est suspecte par construction.**

Chaque tâche de ce plan a été vérifiée committable seule. Le relevé qui l'établit :

- `ParticipantView` est **construit** en cinq endroits : `src/call/participants.ts` (le seul réel), plus les fixtures de `src/call/layout.spec.ts`, `src/call/hands.spec.ts` et `src/screens/room/participantsPanel.spec.tsx`. Il est **consommé** par `src/call/hands.ts`, `src/screens/room/call.tsx` et `src/screens/room/participantsPanel.tsx` — qui ne le construisent pas et ne cassent donc pas quand il s'élargit.
- `CameraTrack` est nommé dans `src/call/layout.ts`, `src/call/participants.ts`, `src/call/layout.spec.ts` et `src/screens/room/stage.spec.tsx`.
- `Tile` est construit dans `src/call/layout.ts` seul, et consommé par `src/screens/room/stage.tsx`.

**Conséquence, appliquée aux tâches 1 et 2** : élargir `ParticipantView` oblige à toucher ses cinq constructeurs dans le **même commit**. Ce n'est pas une entorse au découpage, c'est ce que le découpage doit prévoir.

---

## Structure des fichiers

| Fichier | Responsabilité | Tâches |
|---|---|---|
| `src/call/layout.ts` | Types partagés ; sélection pure de la scène et de la bande | 1, 2, 3, 4 |
| `src/call/participants.ts` | Seule frontière LiveKit ; lecture des pistes, mémoire des partages | 1, 2 |
| `src/screens/room/stage.tsx` | Coquille de rendu, sans décision | 5, 6 |
| `src/call/layout.spec.ts` | Sélection | 1, 2, 3, 4 |
| `src/call/participants.spec.ts` | Lecture et mémoire | 2 |
| `src/screens/room/stage.spec.tsx` | Rendu, cadrage, orientation | 5, 6 |

---

## Task 1: Renommer `CameraTrack` en `VideoTrackRef`

Renommage de type pur, sans changement de comportement. Il vient seul et en premier pour que les tâches suivantes n'aient plus à le porter.

**Files:**
- Modify: `src/call/layout.ts:12-13`
- Modify: `src/call/participants.ts:5,45`
- Modify: `src/call/layout.spec.ts:3,10`
- Modify: `src/screens/room/stage.spec.tsx:5,18-19`

**Interfaces:**
- Consomme : rien.
- Produit : le type `VideoTrackRef`, exporté par `src/call/layout.ts`, de définition inchangée — `NonNullable<VideoTrackProps['trackRef']>`. `CameraTrack` **disparaît** ; aucun alias de compatibilité.

- [ ] **Step 1 : renommer le type et son commentaire**

Dans `src/call/layout.ts`, remplacer les lignes 12-13 par :

```ts
// Ce module ne lit jamais l'intérieur d'une `VideoTrackRef` : il la transporte.
//
// Nommée par ce qu'elle est — une référence de piste vidéo — et non par ce
// qu'elle portait au départ. Depuis que le partage d'écran existe, la même forme
// transporte un écran aussi bien qu'un visage, et un type nommé « caméra » qui
// porte un écran est un mensonge que le prochain lecteur paiera.
export type VideoTrackRef = NonNullable<VideoTrackProps['trackRef']>;
```

- [ ] **Step 2 : propager le nom partout**

Run: `grep -rn "CameraTrack" src/`

Remplacer chaque occurrence par `VideoTrackRef` dans les quatre fichiers listés ci-dessus. Aucune autre modification.

- [ ] **Step 3 : vérifier qu'il n'en reste aucune**

Run: `grep -rn "CameraTrack" src/ ; echo "sorties attendues : aucune"`
Expected: aucune ligne.

- [ ] **Step 4 : barre complète**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`
Expected: 625 tests verts, 51 suites, typecheck propre, lint à 1 avertissement, format propre. **Le compte de tests ne bouge pas** : un renommage n'ajoute ni ne retire de comportement.

- [ ] **Step 5 : commit**

```bash
git add src/call/layout.ts src/call/participants.ts src/call/layout.spec.ts src/screens/room/stage.spec.tsx
git commit -m "refactor(call): Name the track ref for what it is, not what it carried"
```

---

## Task 2: Lire le partage d'écran et retenir depuis quand

Élargit `ParticipantView` **et** met à jour ses cinq constructeurs dans le même commit — voir la contrainte structurelle ci-dessus.

**Files:**
- Modify: `src/call/layout.ts` (type `ParticipantView`)
- Modify: `src/call/participants.ts` (lecture + mémoire)
- Modify: `src/call/layout.spec.ts` (fixtures)
- Modify: `src/call/hands.spec.ts` (fixtures)
- Modify: `src/screens/room/participantsPanel.spec.tsx` (fixture)
- Test: `src/call/participants.spec.ts`

**Interfaces:**
- Consomme : `VideoTrackRef` (tâche 1).
- Produit : `ParticipantView.screen: VideoTrackRef | null` et `ParticipantView.screenSince: number | null`. `screenSince` est un instant en millisecondes, `null` **si et seulement si** `screen` est `null`.

- [ ] **Step 1 : élargir le type**

Dans `src/call/layout.ts`, sous le champ `camera` de `ParticipantView` :

```ts
  // `null` couvre les mêmes trois cas que `camera` : rien n'est publié, la piste
  // n'est pas souscrite, ou elle est coupée.
  readonly screen: VideoTrackRef | null;
  // Instant de première vue de CETTE piste, en millisecondes, et jamais l'instant
  // où le partage a réellement commencé : LiveKit n'horodate pas les
  // publications — vérifié, la seule occurrence de `firstReceivedTime` dans
  // `livekit-client.esm.mjs` concerne les segments de transcription.
  //
  // `null` si et seulement si `screen` est `null`.
  readonly screenSince: number | null;
```

- [ ] **Step 2 : écrire les tests de lecture, qui échouent**

Dans `src/call/participants.spec.ts`, ajouter. **Les aides existent déjà dans ce
fichier** — `person(identity, options)`, `camera(overrides)`, `fakeRoom(local, remotes)`,
et la constante `ME` — et sont **positionnelles** : les employer telles quelles,
n'en créer aucune autre.

```ts
function screenPub(sid: string): FakePublication {
  return camera({ trackSid: sid, source: Track.Source.ScreenShare });
}

describe('lecture du partage d’écran', () => {
  it('rend la piste de partage, distincte de la caméra', () => {
    const alice = person('u-alice', {
      publications: {
        [Track.Source.Camera]: camera({ trackSid: 'cam-1' }),
        [Track.Source.ScreenShare]: screenPub('scr-1'),
      },
    });

    const view = readRoomView(fakeRoom(ME, [alice]));

    const seen = view.remotes[0];
    expect(seen?.camera?.publication.trackSid).toBe('cam-1');
    expect(seen?.screen?.publication.trackSid).toBe('scr-1');
  });

  // Les deux sid sont distincts par construction : une implémentation qui
  // rendrait la caméra dans les deux champs passerait un test qui les
  // confondrait.
  it('rend null quand la personne ne partage pas, sans confondre avec sa caméra', () => {
    const bob = person('u-bob', {
      publications: { [Track.Source.Camera]: camera({ trackSid: 'cam-2' }) },
    });

    const view = readRoomView(fakeRoom(ME, [bob]));

    expect(view.remotes[0]?.camera).not.toBeNull();
    expect(view.remotes[0]?.screen).toBeNull();
    expect(view.remotes[0]?.screenSince).toBeNull();
  });

  // La mémoire est bâtie sur la LECTURE, pas sur un événement : un partage déjà
  // en cours à la jonction n'émet rien, et une mémoire événementielle le
  // manquerait. Deux lectures successives doivent donc rendre le même instant.
  it('retient le même instant à travers deux lectures', () => {
    const alice = person('u-alice', {
      publications: { [Track.Source.ScreenShare]: screenPub('scr-1') },
    });
    const room = fakeRoom(ME, [alice]);

    const first = readRoomView(room).remotes[0]?.screenSince;
    const second = readRoomView(room).remotes[0]?.screenSince;

    expect(first).not.toBeNull();
    expect(second).toBe(first);
  });

  it('oublie un partage terminé, pour qu’un nouveau soit vu comme nouveau', () => {
    const partage = person('u-alice', {
      publications: { [Track.Source.ScreenShare]: screenPub('scr-1') },
    });
    const arrete = person('u-alice');

    readRoomView(fakeRoom(ME, [partage]));
    readRoomView(fakeRoom(ME, [arrete]));

    expect(readRoomView(fakeRoom(ME, [arrete])).remotes[0]?.screenSince).toBeNull();
  });
});
```

- [ ] **Step 3 : lancer, vérifier l'échec**

Run: `npx jest src/call/participants.spec.ts`
Expected: FAIL — `screen` et `screenSince` n'existent pas sur `ParticipantView`.

- [ ] **Step 4 : implémenter la lecture et la mémoire**

Dans `src/call/participants.ts`, sous `readCamera` :

```ts
// La mémoire des partages. LiveKit n'horodate pas les publications : sans elle,
// « le plus récent gagne » n'a aucun ordre sur lequel s'appuyer.
//
// Alimentée à la LECTURE, jamais sur un événement. Une table remplie par
// `TrackSubscribed` manquerait tout partage déjà en cours à la jonction —
// exactement le piège que ce dépôt a payé deux fois, avec `RoomMetadataChanged`
// puis avec `ParticipantAttributesChanged`. On lit, on n'attend pas.
const screenSince = new Map<string, number>();

function readScreen(participant: Participant): VideoTrackRef | null {
  const publication = participant.getTrackPublication(Track.Source.ScreenShare);
  if (publication === undefined) return null;
  if (publication.track === undefined) return null;
  if (publication.isMuted) return null;
  return { participant, publication, source: Track.Source.ScreenShare };
}

// Rend l'instant de première vue, en l'enregistrant si la piste est inconnue.
function sinceFor(track: VideoTrackRef | null): number | null {
  if (track === null) return null;
  const sid = track.publication.trackSid;
  const known = screenSince.get(sid);
  if (known !== undefined) return known;
  const now = Date.now();
  screenSince.set(sid, now);
  return now;
}

// Purge les pistes disparues. Sans elle, un partage arrêté puis relancé
// reprendrait son ancien instant et perdrait sa priorité de « plus récent ».
function forgetAbsent(present: ReadonlySet<string>): void {
  for (const sid of [...screenSince.keys()]) {
    if (!present.has(sid)) screenSince.delete(sid);
  }
}
```

Dans `readParticipant`, ajouter les deux champs :

```ts
  const screen = readScreen(participant);
  return {
    // … champs existants …
    camera: readCamera(participant),
    screen,
    screenSince: sinceFor(screen),
    handRaisedAt: readHandRaisedAt(participant.attributes),
  };
```

Dans `readRoomView`, après avoir construit la vue et **avant** de la rendre, purger :

```ts
  const present = new Set<string>();
  for (const view of [local, ...remotes]) {
    if (view.screen !== null) present.add(view.screen.publication.trackSid);
  }
  forgetAbsent(present);
```

- [ ] **Step 5 : compléter les cinq constructeurs**

Run: `npx tsc --noEmit`

Chaque erreur nomme un littéral de `ParticipantView` auquel il manque `screen` et `screenSince`. Les compléter avec `screen: null, screenSince: null` — sauf là où le test porte précisément sur un partage. Fichiers attendus : `src/call/layout.spec.ts`, `src/call/hands.spec.ts`, `src/screens/room/participantsPanel.spec.tsx`.

- [ ] **Step 6 : barre complète**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`
Expected: 629 tests verts (625 + 4), typecheck propre. **La ronde de correction de cette tâche a porté le total à 632** — les comptes ci-dessous en tiennent compte.

- [ ] **Step 7 : commit**

```bash
git add src/call/layout.ts src/call/participants.ts src/call/participants.spec.ts src/call/layout.spec.ts src/call/hands.spec.ts src/screens/room/participantsPanel.spec.tsx
git commit -m "feat(call): Read the shared screen and remember when it appeared"
```

- [ ] **Step 8 : éprouver par mutation, sur code committé**

Appliquer, lancer, noter combien de tests rougissent et lesquels, puis restaurer par `git checkout --` et vérifier `git status` vide.

| Mutation | Attendu |
|---|---|
| `readScreen` demande `Track.Source.Camera` | rouge — la piste rendue serait celle de la caméra |
| `sinceFor` rend `Date.now()` sans consulter la table | rouge sur « retient le même instant » |
| `forgetAbsent` ne supprime rien | rouge sur « oublie un partage terminé » |

Un test qui ne rougit pas sous sa mutation ne garde rien : le signaler dans le rapport plutôt que de le laisser passer.

---

## Task 3: Donner à la tuile sa source et une clé qui ne collisionne plus

**Files:**
- Modify: `src/call/layout.ts` (types `TileSource`, `Tile` ; fonction `toTile`)
- Modify: `src/call/layout.spec.ts`
- Modify: `src/screens/room/stage.spec.tsx` (les `testID` dérivent de la clé)

**Interfaces:**
- Consomme : `ParticipantView.screen` (tâche 2).
- Produit : `TileSource = 'camera' | 'screen'` ; `Tile.source: TileSource` ; `Tile.key` vaut désormais `` `${identity}:camera` `` ou `` `${identity}:screen` ``. `Tile.camera` est renommé **`Tile.track`** — le champ porte l'une ou l'autre source, le nom doit le dire.

- [ ] **Step 1 : écrire le test de clé, qui échoue**

Dans `src/call/layout.spec.ts` :

```ts
// Le commentaire d'origine disait vrai — « deux vignettes qui partagent une clé
// échangent leur vidéo au moindre changement de liste » — mais son hypothèse ne
// tient plus : une personne qui partage produit DEUX tuiles.
// CORRIGÉ APRÈS EXÉCUTION : la première rédaction interrogeait `selectLayout` et
// attendait une clé `:screen`, ce que le Step 3 de cette même tâche rend
// impossible — il n'y appelle `toTile` qu'avec `'camera'`, les écrans étant le
// travail de la tâche 4. Les deux instructions se contredisaient, et le test ne
// pouvait passer qu'en volant son périmètre à la tâche suivante.
//
// `toTile` est donc exportée et éprouvée directement. Ce n'est pas un
// contournement : `source` est une vraie entrée de cette fonction, et le
// livrable de cette tâche EST son contrat — format de clé, choix de piste,
// règle de miroir.
it('donne deux clés différentes au visage et à l’écran d’une même personne', () => {
  const alice = person('u-alice', {
    camera: fakeCamera('cam-1'),
    screen: fakeCamera('scr-1'),
    screenSince: 1000,
  });

  expect(toTile(alice, 'camera', 'user').key).toBe('u-alice:camera');
  expect(toTile(alice, 'screen', 'user').key).toBe('u-alice:screen');
  // La source elle-même, sans quoi la figer à 'camera' laisse la suite au vert.
  expect(toTile(alice, 'screen', 'user').source).toBe('screen');
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run: `npx jest src/call/layout.spec.ts`
Expected: FAIL — les clés valent l'identité nue.

- [ ] **Step 3 : implémenter**

Dans `src/call/layout.ts` :

```ts
export type TileSource = 'camera' | 'screen';
```

`Tile` gagne `readonly source: TileSource` ; son champ `camera` devient `track` ; son commentaire de clé devient :

```ts
  // `${identity}:${source}`, et non l'identité seule : depuis le partage
  // d'écran, une même personne produit deux tuiles. Deux vignettes qui
  // partageraient une clé échangeraient leur vidéo au moindre changement de
  // liste.
  readonly key: string;
```

`toTile` prend la source en paramètre :

```ts
function toTile(participant: ParticipantView, source: TileSource, facing: FacingMode): Tile {
  return {
    key: `${participant.identity}:${source}`,
    source,
    name: participant.name.trim(),
    track: source === 'screen' ? participant.screen : participant.camera,
    isLocal: participant.isLocal,
    isSpeaking: participant.isSpeaking,
    // Un écran n'est jamais en miroir : le retourner rendrait illisible tout
    // texte affiché dessus, ce qui est précisément ce qu'on partage.
    mirror: source === 'camera' && participant.isLocal && facing === 'user',
  };
}
```

`selectLayout` appelle `toTile(p, 'camera', facing)` partout pour l'instant ; la tâche 4 y ajoutera les écrans.

- [ ] **Step 4 : propager le renommage de `camera` en `track`**

Run: `npx tsc --noEmit`

Corriger `src/screens/room/stage.tsx` (`tile.camera` → `tile.track`) et les specs qui nomment ce champ. Le `testID` `tile-${tile.key}` change de valeur : mettre à jour `stage.spec.tsx` en conséquence.

- [ ] **Step 5 : barre complète**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`
Expected: 634 tests verts (632 + 2).

- [ ] **Step 6 : commit**

```bash
git add src/call/layout.ts src/call/layout.spec.ts src/screens/room/stage.tsx src/screens/room/stage.spec.tsx
git commit -m "feat(call): Give each tile its source and a key that cannot collide"
```

- [ ] **Step 7 : éprouver par mutation**

| Mutation | Attendu |
|---|---|
| `key` redevient `participant.identity` | rouge sur l'unicité des clés |
| `mirror` perd sa condition `source === 'camera'` | rouge — écrire le test s'il manque |

---

## Task 4: Un écran prend la scène, le plus récent gagne

**Files:**
- Modify: `src/call/layout.ts` (`selectLayout`, nouvelle fonction `pickScreen`)
- Modify: `src/call/layout.spec.ts`

**Interfaces:**
- Consomme : `ParticipantView.screen`, `.screenSince` (tâche 2) ; `toTile(p, source, facing)` (tâche 3).
- Produit : `selectLayout` inchangé de signature ; `CallLayout.stage` peut désormais porter `source: 'screen'`.

- [ ] **Step 1 : écrire les trois tests, qui échouent**

```ts
describe('un écran partagé prend la scène', () => {
  // Le locuteur est délibérément QUELQU'UN D'AUTRE que le présentateur : si les
  // deux étaient la même personne, une implémentation qui laisserait la parole
  // décider passerait par coïncidence.
  it('passe devant celui qui parle', () => {
    const alice = person('u-alice', { screen: fakeCamera('scr-1'), screenSince: 1000 });
    const bob = person('u-bob', { isSpeaking: true, camera: fakeCamera('cam-2') });

    const layout = selectLayout(view(ME, [alice, bob]), 'user');

    expect(layout.stage.source).toBe('screen');
    expect(layout.stage.key).toBe('u-alice:screen');
  });

  // L'ordre d'insertion est l'INVERSE de l'ordre attendu : un tri qui rendrait
  // le premier venu passerait sinon.
  it('retient le plus récent quand deux personnes partagent', () => {
    const ancien = person('u-alice', { screen: fakeCamera('scr-1'), screenSince: 1000 });
    const recent = person('u-bob', { screen: fakeCamera('scr-2'), screenSince: 2000 });

    const layout = selectLayout(view(ME, [recent, ancien]), 'user');

    expect(layout.stage.key).toBe('u-bob:screen');
  });

  it('rend la scène à la parole quand le partage cesse', () => {
    const alice = person('u-alice', { screen: null });
    const bob = person('u-bob', { isSpeaking: true, camera: fakeCamera('cam-2') });

    const layout = selectLayout(view(ME, [alice, bob]), 'user');

    expect(layout.stage.source).toBe('camera');
    expect(layout.stage.key).toBe('u-bob:camera');
  });

  it('montre le présentateur deux fois : son écran à la scène, son visage dans la bande', () => {
    const alice = person('u-alice', {
      camera: fakeCamera('cam-1'),
      screen: fakeCamera('scr-1'),
      screenSince: 1000,
    });

    const layout = selectLayout(view(ME, [alice]), 'user');

    expect(layout.stage.key).toBe('u-alice:screen');
    expect(layout.filmstrip.map((t) => t.key)).toContain('u-alice:camera');
  });

  it('laisse les autres partages dans la bande', () => {
    const a = person('u-a', { screen: fakeCamera('scr-1'), screenSince: 1000 });
    const b = person('u-b', { screen: fakeCamera('scr-2'), screenSince: 2000 });

    const layout = selectLayout(view(ME, [a, b]), 'user');

    expect(layout.stage.key).toBe('u-b:screen');
    expect(layout.filmstrip.map((t) => t.key)).toContain('u-a:screen');
  });
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run: `npx jest src/call/layout.spec.ts`
Expected: FAIL — la scène est toujours une caméra.

- [ ] **Step 3 : implémenter**

Dans `src/call/layout.ts`, au-dessus de `selectLayout` :

```ts
// Qui partage, et depuis le plus longtemps ? Rend `null` si personne ne partage.
//
// À égalité d'instant — le cas de la jonction, où tous les partages en cours
// sont découverts dans la même lecture — l'ordre stable départage. Arbitraire,
// mais déterministe : personne n'a de raison d'attendre l'un plutôt que l'autre,
// et une scène qui sauterait entre deux écrans serait pire que ce choix.
function pickScreen(view: RoomView): ParticipantView | null {
  let best: ParticipantView | null = null;
  for (const p of [view.local, ...view.remotes]) {
    if (p.screen === null || p.screenSince === null) continue;
    if (best === null) {
      best = p;
      continue;
    }
    const bestSince = best.screenSince ?? 0;
    if (p.screenSince > bestSince) best = p;
    else if (p.screenSince === bestSince && compareStable(p, best) < 0) best = p;
  }
  return best;
}
```

`selectLayout` devient :

```ts
export function selectLayout(view: RoomView, facing: FacingMode): CallLayout {
  const presenter = pickScreen(view);
  // Un partage ne se DISPUTE pas la scène avec la parole : il la prend. Présenter,
  // c'est demander qu'on regarde son écran pendant qu'on parle par-dessus.
  const stage: Tile =
    presenter === null
      ? toTile(pickStage(view), 'camera', facing)
      : toTile(presenter, 'screen', facing);

  const everyone = [view.local, ...[...view.remotes].sort(compareStable)];
  // Les visages d'abord, puis les autres écrans : une personne qui partage
  // apparaît donc deux fois, une fois par piste.
  const filmstrip = [
    ...everyone.map((p) => toTile(p, 'camera', facing)),
    ...everyone.filter((p) => p.screen !== null).map((p) => toTile(p, 'screen', facing)),
  ].filter((tile) => tile.key !== stage.key);

  return { stage, filmstrip };
}
```

Vérifier en relisant : la bande retirait auparavant la personne à la scène ; elle retire désormais **la tuile** à la scène, par sa clé. C'est ce qui permet au visage du présentateur d'y rester.

- [ ] **Step 4 : barre complète**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`
Expected: 639 tests verts (634 + 5).

- [ ] **Step 5 : commit**

```bash
git add src/call/layout.ts src/call/layout.spec.ts
git commit -m "feat(call): Let a shared screen take the stage while it lasts"
```

- [ ] **Step 6 : éprouver par mutation**

| Mutation | Attendu |
|---|---|
| `pickScreen` rend toujours `null` | rouge sur les quatre premiers tests |
| `p.screenSince > bestSince` devient `<` | rouge sur « retient le plus récent » |
| la bande filtre sur `identity` au lieu de `key` | rouge sur « montre le présentateur deux fois » |

---

## Task 5: Cadrer selon la source

**Files:**
- Modify: `src/screens/room/stage.tsx`
- Modify: `src/screens/room/stage.spec.tsx`

**Interfaces:**
- Consomme : `Tile.source` (tâche 3).
- Produit : rien pour les tâches suivantes.

- [ ] **Step 1 : écrire les tests, qui échouent**

**Aucun `testID` à ajouter.** `src/screens/room/stage.spec.tsx` bouchonne déjà
`VideoTrack` et lit ses props par `propsFor(sid)`, indexé sur
`trackRef.publication.trackSid`. Les aides du fichier — `tile(key, overrides)`,
`layout(stage, filmstrip)`, `fakeCamera(sid)` — s'emploient telles quelles.

```ts
describe('cadrage par source', () => {
  // On garde la VALEUR de la prop, jamais l'aspect : `AGENTS.md` est explicite,
  // aucun test ne peut prouver qu'une image est bien cadrée — seulement que la
  // valeur n'a pas été retirée.
  it('n’écrase jamais une diapositive, à la scène comme dans la bande', async () => {
    const scene = tile('alice:screen', { source: 'screen', track: fakeCamera('scr-1') });
    const vignette = tile('bob:screen', { source: 'screen', track: fakeCamera('scr-2') });

    await render(<CallStage layout={layout(scene, [vignette])} />);

    expect(propsFor('scr-1')?.objectFit).toBe('contain');
    expect(propsFor('scr-2')?.objectFit).toBe('contain');
  });

  // La caméra garde `contain` à la scène : `cover` y agrandirait une source 16:9
  // jusqu'à n'en montrer que 26 % — mesuré sur 1080×2364. Les deux sid sont
  // distincts, sans quoi une implémentation qui rendrait la même valeur partout
  // passerait.
  it('garde la caméra en contain à la scène, en cover dans la bande', async () => {
    const scene = tile('bob:camera', { source: 'camera', track: fakeCamera('cam-1') });
    const vignette = tile('ada:camera', { source: 'camera', track: fakeCamera('cam-2') });

    await render(<CallStage layout={layout(scene, [vignette])} />);

    expect(propsFor('cam-1')?.objectFit).toBe('contain');
    expect(propsFor('cam-2')?.objectFit).toBe('cover');
  });
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run: `npx jest src/screens/room/stage.spec.tsx`
Expected: FAIL — l'écran de la bande est rendu en `cover`.

- [ ] **Step 3 : implémenter**

Dans `src/screens/room/stage.tsx`, `VideoTile` cesse de recevoir `objectFit` et le
dérive :

```ts
type VideoTileProps = {
  readonly tile: Tile;
  // Ce que la PLACE veut, quand la source n'impose rien.
  readonly fitWhenCamera: 'cover' | 'contain';
  readonly size: StyleProp<ViewStyle>;
};
```

et, dans le corps :

```tsx
        <VideoTrack
          trackRef={tile.track}
          style={styles.video}
          // Un écran ne se rogne jamais, où qu'il soit posé : un texte coupé est
          // un texte perdu, et c'est précisément ce qu'on partage. La place ne
          // décide que pour une caméra.
          objectFit={tile.source === 'screen' ? 'contain' : fitWhenCamera}
          mirror={tile.mirror}
        />
```

Les deux appels deviennent `fitWhenCamera="contain"` pour la scène et
`fitWhenCamera="cover"` pour la bande. Remplacer le commentaire de la scène par :

```tsx
        {/* `contain` pour une caméra : `cover` agrandirait une source 16:9 sur un
            écran en portrait jusqu'à n'en montrer que 26 % — mesuré sur
            1080×2364. Aucune des deux valeurs n'est bonne ; les bandes noires
            sont un défaut de MISE EN PAGE, que la refonte de la grille traitera. */}
```

- [ ] **Step 4 : barre complète**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`
Expected: 641 tests verts (639 + 2).

- [ ] **Step 5 : commit**

```bash
git add src/screens/room/stage.tsx src/screens/room/stage.spec.tsx
git commit -m "feat(call): Never crop a shared screen, wherever it sits"
```

- [ ] **Step 6 : éprouver par mutation**

| Mutation | Attendu |
|---|---|
| `objectFit` redevient `fitWhenCamera` sans condition | rouge sur la vignette d'écran de la bande |
| la scène passe en `fitWhenCamera="cover"` | rouge sur « garde la caméra en contain » |

---

## Task 6: Laisser le paysage à la scène

**Files:**
- Modify: `src/screens/room/stage.tsx`
- Modify: `src/screens/room/stage.spec.tsx`

**Interfaces:**
- Consomme : rien des tâches précédentes.
- Produit : rien.

- [ ] **Step 1 : écrire le test, qui échoue**

```ts
// L'orientation se lit sur les DIMENSIONS de la fenêtre, jamais sur une API
// d'orientation : sur un pliable elles changent sans rotation. Mesuré sur Pixel
// 10 Pro Fold — couverture 1080×2364, écran interne 2076×2152.
describe('orientation', () => {
  it('empile la bande sous la scène en portrait', async () => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({
      width: 400, height: 800, scale: 1, fontScale: 1,
    });

    await render(<CallStage layout={layout(tile('bob:camera'), [tile('ada:camera')])} />);

    expect(screen.getByTestId('filmstrip')).toHaveProp('horizontal', true);
  });

  it('range la bande en colonne sur le côté en paysage', async () => {
    jest.spyOn(RN, 'useWindowDimensions').mockReturnValue({
      width: 800, height: 400, scale: 1, fontScale: 1,
    });

    await render(<CallStage layout={layout(tile('bob:camera'), [tile('ada:camera')])} />);

    expect(screen.getByTestId('filmstrip')).toHaveProp('horizontal', false);
  });
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run: `npx jest src/screens/room/stage.spec.tsx`
Expected: FAIL — la bande est toujours horizontale.

- [ ] **Step 3 : implémenter**

Dans `src/screens/room/stage.tsx`, ajouter les styles paysage :

```ts
  root: { flex: 1 },
  rootLandscape: { flexDirection: 'row' },
  filmstripColumn: {
    flexGrow: 0,
    width: tokens.spacing.xl * 3,
  },
  filmstripContentColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: tokens.spacing.xs,
    padding: tokens.spacing.xs,
  },
  thumbnailTileColumn: { height: tokens.spacing.xl * 3, borderRadius: tokens.radius.md },
```

et, dans `CallStage` :

```tsx
export function CallStage({ layout }: CallStageProps): React.ReactElement {
  const { width, height } = useWindowDimensions();
  // Les dimensions de la fenêtre, et non une API d'orientation : un pliable
  // change de forme sans tourner.
  const landscape = width > height;

  return (
    <View style={[styles.root, landscape ? styles.rootLandscape : null]}>
      <View style={styles.stage} testID="active-speaker">
        {/* … VideoTile de la scène, inchangé … */}
      </View>

      <ScrollView
        testID="filmstrip"
        horizontal={!landscape}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={landscape ? styles.filmstripColumn : styles.filmstrip}
        contentContainerStyle={landscape ? styles.filmstripContentColumn : styles.filmstripContent}
      >
        {layout.filmstrip.map((tile) => (
          <VideoTile
            key={tile.key}
            tile={tile}
            fitWhenCamera="cover"
            size={landscape ? styles.thumbnailTileColumn : styles.thumbnailTile}
          />
        ))}
      </ScrollView>
    </View>
  );
}
```

Le fragment `<>` devient un `View` : sans conteneur, on ne peut pas passer la disposition en ligne.

- [ ] **Step 4 : barre complète**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`
Expected: 643 tests verts (641 + 2).

- [ ] **Step 5 : commit**

```bash
git add src/screens/room/stage.tsx src/screens/room/stage.spec.tsx
git commit -m "feat(call): Give the stage the whole screen in landscape"
```

- [ ] **Step 6 : éprouver par mutation**

| Mutation | Attendu |
|---|---|
| `landscape` figé à `false` | rouge sur « range la bande en colonne » |
| `landscape` figé à `true` | rouge sur « empile la bande » |

---

## Ce qu'aucune de ces tâches ne prouve

Qu'une diapositive est **lisible** sur un écran de six pouces. À vérifier sur appareil, en paysage, avec un vrai support partagé depuis un vrai navigateur, avant de déclarer la fonction livrée. `AGENTS.md` le dit pour le contraste ; cela vaut ici pour la lisibilité.

Restent aussi hors de ce plan, et le resteront : émettre un partage depuis le mobile, l'épinglage, l'audio du partage, la refonte de la grille, et le déplacement de la barre de contrôle en paysage.
