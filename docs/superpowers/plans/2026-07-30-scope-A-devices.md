# Périmètre A — Périphériques et barre de contrôle : plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les
> étapes utilisent des cases à cocher (`- [ ]`).

**But :** en séance, choisir la sortie audio et choisir la caméra. Deux commandes ajoutées,
une retirée (`switch-camera`), sur une rangée qui tient sur un écran de 360 dp.

**Architecture :** un module **pur** qui parse et étiquette (`src/call/devices.ts`), deux
modules **branchés** et minces (`src/call/audioRoute.ts` pour la route audio,
`src/call/media.ts` étendu pour la caméra), deux composants qui reçoivent leur état
(`cameraMenu.tsx`, `audioOutputControl.tsx`), et un écran qui câble. La frontière est celle
du périmètre B : la décision dans un module pur et testable, la coquille aussi bête que
possible.

**Socle technique :** TypeScript strict, React Native 0.86, Expo SDK 57, react-native-paper
5.15.3, `@livekit/react-native` 2.12.0, `livekit-client` 2.18.0, Jest +
`@testing-library/react-native` 14.

**Source :** `docs/superpowers/specs/2026-07-30-scope-A-devices-design.md`. Les renvois `§n`
et `Nn` y renvoient. Le rapport de terrain sous-jacent est
`.superpowers/sdd/2026-07-30-scope-A-devices.md`.

---

## Écarts assumés avec la conception

Quatre points où ce plan ajoute à la conception, ou corrige un manque. Aucun ne la contredit ;
chacun est mesuré ici, dans ce dépôt, sur cette branche.

**E1 — `@livekit/react-native-webrtc` ne s'importe pas sous Jest.** La conception fait passer
`listCameras` par `mediaDevices.enumerateDevices()` importé de ce paquet (§4.2), sans dire ce
que cela coûte aux tests. Mesuré :

```
Invariant Violation: `new NativeEventEmitter()` requires a non-null argument.
  at .../@livekit/react-native-webrtc/lib/commonjs/EventEmitter.ts:9:23
  at .../@livekit/react-native-webrtc/lib/commonjs/index.ts:21:1
```

L'import **jette au chargement du module**. Comme `src/call/media.ts` est importé par
`call.spec.tsx`, `prejoin.spec.tsx` et `media.spec.ts`, l'ajout de cet import casse trois
suites d'un coup, sur une erreur qui ne nomme ni la caméra ni le périphérique. Un double
manuel `__mocks__/@livekit/react-native-webrtc.ts` est donc **obligatoire**, et il est créé
dans la même tâche que l'import. Placé à côté de `node_modules`, Jest le substitue
automatiquement à toutes les suites, sans `jest.mock(...)` — même mécanisme que
`__mocks__/@livekit/react-native.ts`.

**E2 — `PaperProvider` seul ne suffit pas à ouvrir un menu sous Jest.** La conception (N8,
§7.3) dit qu'une spec qui ouvre un menu doit envelopper son rendu dans un `PaperProvider`.
C'est nécessaire, et **insuffisant**. Mesuré sur cette branche :

| Recette | Ouvertures réussies |
| --- | --- |
| `PaperProvider` nu, appui immédiat | **19 / 20** |
| `+ theme={{ animation: { scale: 0 } }}` | **39 / 40** |
| `+ theme + vidage d'une frame avant l'appui` | **300 / 300** |

Le motif, en trois temps. `Menu` lance au montage une animation de **fermeture** (`visible`
est faux) dont le rappel remet son `rendered` à faux. Sous Jest, `NativeAnimatedModule` est
absent, donc `Animated` retombe sur son moteur JavaScript et ce rappel part sur un
`requestAnimationFrame` — **la frame suivante, même pour une durée nulle.** Un appui qui
arrive avant ce rappel voit son ouverture annulée, et `rendered` ne repasse plus jamais à
vrai : les deux effets qui pourraient le faire ont déjà consommé leur transition. `waitFor`
expire alors sur un menu qui ne s'ouvrira pas.

Il faut donc les deux : `animation.scale` à zéro pour que l'animation ne dure pas 250 ms, **et**
le vidage d'une frame avant chaque appui d'ouverture — y compris avant une **réouverture**,
puisque la fermeture précédente arme exactement le même rappel. La recette exacte est dans les
contraintes globales, une fois, avec son code.

**E3 — La conception oublie une clé i18n.** §6 nomme `call.deviceSwitchFailed` comme « un
seul message nouveau », mais le tableau de §4.7 ne la liste pas. Ce plan ajoute donc **treize**
clés, pas douze, et en retire une (`call.switchCamera`).

**E4 — La géométrie de la barre vit dans trois fichiers ; ce plan lui donne un seul foyer.**
§4.6 pose `styles.barButton` (`margin: 0, width: 44, height: 44, borderRadius: 22`) et un
`hitSlop` de `{ top: 8, bottom: 8, left: 0, right: 0 }` sur « chacun des sept `IconButton` ».
Or deux de ces sept boutons appartiennent à `cameraMenu.tsx` et `audioOutputControl.tsx`, pas
à `call.tsx`. Recopier la même géométrie et les mêmes couleurs dans trois fichiers est
exactement la forme du défaut bloquant du périmètre B — une contrainte qui vit entre trois
fichiers et qu'aucune revue de fichier ne voit. Ce plan crée donc
`src/screens/room/controlBar.ts`, qui porte la géométrie **et** les couleurs de la barre, et
que les trois fichiers importent. Pas de spec : une spec qui affirmerait `width: 44` ne ferait
que relire la constante (§7.4).

---

## Contraintes globales

- `@testing-library/react-native` 14 est **asynchrone** : `await render(...)`,
  `await fireEvent.press(...)`. Sans `await`, `screen` reste non lié et la requête suivante
  lève ``render` function has not been called``. `tsc` ne le voit pas : une promesse non
  attendue est une expression valide.
- Les écrans vivent dans `src/screens/`, jamais sous `app/` : `require.context`
  d'expo-router balaie tout `.tsx` du dossier et ferait entrer les tests dans le bundle.
- Exports **nommés** uniquement. `export default` n'est toléré que dans les fichiers de
  route sous `app/`.
- Aucun style en ligne : `StyleSheet.create` alimenté par `src/ui/tokens`.
- Aucune chaîne visible en dur. Sept locales (`en fr es it de vi ru`), **toutes remplies** ;
  `src/i18n/index.spec.ts` échoue si une clé manque. Il passe en revanche sur une clé remplie
  d'anglais recopié : les sept sont traduites, pas dupliquées.
- `react-hooks/set-state-in-effect` est une **erreur**, pas un avertissement : une garde qui
  pose un état passe par l'initialiseur paresseux du `useState`.
- Barre de qualité : `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`
  verts. Le lint a un avertissement pré-existant sur `src/i18n/index.ts:32` : le laisser.
- Commits atomiques, Conventional Commits, jamais de `--no-verify`.
- Chaque test ajouté doit être **éprouvé par mutation** : casser la règle qu'il prétend
  garder, constater le rouge, restaurer. Un test qui passe dans les deux cas ne garde rien.
  Pour tout test qui vérifie qu'une valeur part vers une fonction, **installer au moins deux
  éléments distincts et viser le second** : avec un seul, « transmet ce qu'on lui donne » et
  « renvoie toujours la même valeur en dur » sont indiscernables.

### La couleur : la règle que ce périmètre impose, et ce qu'un test en garde

`src/screens/room/call.tsx:87` force `tokens.color.backgroundDark` **dans les deux schémas**,
alors que le thème Paper suit le schéma système (`src/ui/theme.ts`). Un composant posé sur cet
écran qui ne dit pas sa couleur retombe donc sur `theme.colors.onSurface` — `#1A1A1A` en
schéma clair — soit **1,08:1** sur ce fond. Invisible. Le périmètre B a livré ce défaut avec
tous ses tests au vert.

**Tout élément visible ajouté sur cet écran pose une couleur explicite venue de
`src/ui/tokens`** :

| Élément | Prop | Valeur |
| --- | --- | --- |
| `Text` de `react-native-paper` | `style` → `color` | `tokens.color.textDark` |
| `Menu` | `contentStyle` → `backgroundColor` | `tokens.color.surfaceDark` |
| `Menu.Item` | `titleStyle` → `color` | `tokens.color.textDark` |
| `IconButton` | `iconColor` | `tokens.color.textDark` |
| `Button` en mode `text` ou `outlined` | `textColor` | `tokens.color.textDark` |
| `List.Item` | `titleStyle` → `color` | `tokens.color.textDark` |

Contrastes vérifiés à la main : `textDark` (`#ECECEC`) sur `surfaceDark` (`#121212`) →
**15,86:1** ; sur `backgroundDark` (`#0B0B0C`) → **16,65:1**. `tokens.color.muted` (`#6B7280`)
donne **3,88:1** sur `surfaceDark`, sous le seuil AA de 4,5:1 : **il ne s'utilise pas ici**.
Une hiérarchie visuelle se fait par la taille de texte (`variant="labelSmall"`), jamais par un
gris qui échoue au contraste.

Règle de composition : **on surcharge la surface et le texte, ou ni l'un ni l'autre.** Un
`Menu` laissé entièrement intact serait cohérent avec lui-même ; le piège n'apparaît qu'en
forçant l'un sans l'autre.

**Aucun test ne peut attraper cela** : RNTL ne calcule aucun style. C'est une contrainte de
relecture, pas de suite.

### Aucun bouton `disabled` sur cette barre

`node_modules/react-native-paper/src/components/IconButton/utils.ts:88-93` teste `disabled`
**avant** `customIconColor` et rend `theme.colors.onSurfaceDisabled` — `palette.neutral10`,
un quasi-noir, dans le thème MD3 **clair**. Aucune couleur explicite ne le rattrape.

Donc : **ce qui n'est pas actionnable n'est pas rendu.** On masque une commande indisponible,
on ne la grise pas. La règle vaut pour tous les boutons de cette rangée et pour les périmètres
C et D, qui en ajouteront.

### Toute spec qui ouvre un `Menu` de Paper — la recette, une seule fois

`Menu.tsx:645` monte son contenu dans un `<Portal>`, et `Portal/PortalConsumer.tsx:31-38`
jette « Looks like you forgot to wrap your root component with `Provider` » (N8). Mesuré :
sans `PaperProvider`, l'appui sur l'ancre **jette**. Et avec un `PaperProvider` nu, l'ouverture
est **instable** (E2).

La recette, à recopier telle quelle dans chaque spec qui ouvre un menu :

```tsx
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// `Menu` monte son contenu dans un `Portal`, qui jette sans `Provider` ancêtre.
// `animation.scale` à zéro ramène à zéro la durée de l'animation de fermeture
// que `Menu` lance au montage — sans quoi son rappel de fin, qui remet
// `rendered` à faux, tombe 250 ms plus tard et annule l'ouverture.
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

// Même à durée nulle, ce rappel part sur un `requestAnimationFrame` : sous Jest,
// `NativeAnimatedModule` est absent et `Animated` retombe sur son moteur
// JavaScript. Il tombe donc à la frame suivante, et un appui qui arrive avant
// lui voit son ouverture annulée — définitivement, les deux effets qui
// pourraient la relancer ayant déjà consommé leur transition.
//
// À appeler après le rendu, et après toute action qui **ferme** un menu, avant
// de le rouvrir : la fermeture arme exactement le même rappel. Mesuré : 39
// ouvertures sur 40 sans ce vidage, 300 sur 300 avec.
async function settleMenus(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}
```

et, après l'appui qui ouvre, **toujours** un `waitFor` : le contenu du `Portal` n'est jamais
présent au retour synchrone de `fireEvent.press`.

```tsx
await render(withPaper(<ComposantSousTest />));
await settleMenus();

await fireEvent.press(screen.getByTestId('camera-menu-btn'));
await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());
```

`act` et `waitFor` viennent de `@testing-library/react-native`. Le mock de
`react-native-safe-area-context` est le double officiel de la librairie, déjà utilisé par
`src/screens/room/call.spec.tsx:107-110`.

### `node_modules` est un lien symbolique

Ce dépôt de travail est un worktree ; `node_modules` pointe vers l'arbre principal partagé.
**Ne jamais lancer `npm install`, `npm ci`, `npm add` ni `npx expo install`.** Tout est déjà
présent. Ce périmètre n'ajoute **aucune dépendance** (Q2, §8).

### Les fabriques de `jest.mock` ne voient pas les `const` du module

`babel-plugin-jest-hoist` remonte `jest.mock` au-dessus des déclarations, et le transform
CommonJS place les `require` avant les `const`. Une fabrique qui référence directement un
`mockXxx` reçoit `undefined`. Elle doit passer par une **fermeture**, appelée plus tard :

```ts
Room: { getLocalDevices: (...args: unknown[]) => mockGetLocalDevices(...args) },
```

Même règle que `src/screens/room/call.spec.tsx:52-55`.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/call/devices.ts` | **pur** : catégories de sortie, parsing des caméras, ordinaux, clés de nom. Ni SDK, ni `react-native`, ni `react` |
| `src/call/devices.spec.ts` | le cœur du périmètre, éprouvé par mutation |
| `src/call/audioRoute.ts` | **branché** : `AudioSession`, `Platform`. Ne touche jamais la `Room` |
| `src/call/audioRoute.spec.ts` | contre le double manuel de `@livekit/react-native` |
| `__mocks__/@livekit/react-native.ts` (modifié) | gagne `getAudioOutputs`, `selectAudioOutput`, `showAudioRoutePicker` |
| `__mocks__/@livekit/react-native-webrtc.ts` | **créé** : sans lui, l'import du paquet jette sous Jest (E1) |
| `src/call/media.ts` (modifié) | gagne `listCameras`, `selectCamera`, `readActiveCameraId` ; perd `switchCamera` |
| `src/call/media.spec.ts` (modifié) | les trois nouvelles fonctions ; les cinq cas de `switchCamera` disparaissent |
| `src/screens/room/controlBar.ts` | **créé** : géométrie et couleurs de la rangée, un seul foyer (E4) |
| `src/screens/room/cameraMenu.tsx` | coquille : le chevron et son menu de caméras |
| `src/screens/room/cameraMenu.spec.tsx` | câblage : quel `CameraChoice` part avec quel appui |
| `src/screens/room/audioOutputControl.tsx` | coquille : un bouton, deux profondeurs (Q2) |
| `src/screens/room/audioOutputControl.spec.tsx` | câblage, dans les deux modes |
| `src/screens/room/call.tsx` (modifié) | géométrie, retrait de `switch-camera`, câblage des deux commandes |
| `src/screens/room/call.spec.tsx` (modifié) | enveloppe `PaperProvider`, nouveaux cas |
| `src/i18n/locales/*.json` (modifiés) | treize clés ajoutées, une retirée, dans les sept locales |

---

### Task 1 : le module pur — catégories de sortie, caméras, ordinaux

**Files:**
- Create: `src/call/devices.ts`
- Test: `src/call/devices.spec.ts`

**Interfaces:**
- Consumes: rien. **Aucun import** de `livekit-client`, de `@livekit/react-native*`, de
  `react-native` ni de `react`. C'est ce qui le rend testable, et ce qui le garde honnête :
  il ne peut pas tricher en interrogeant le système.
- Produces :
  - `type AudioOutputKind = 'bluetooth' | 'headset' | 'speaker' | 'earpiece'`
  - `const AUDIO_OUTPUT_ORDER: readonly AudioOutputKind[]`
  - `readAudioOutputs(raw: readonly unknown[]): readonly AudioOutputKind[]`
  - `type AudioOutputNameKey = \`call.output.${AudioOutputKind}\``
  - `audioOutputNameKey(kind: AudioOutputKind): AudioOutputNameKey`
  - `type CameraFacing = 'user' | 'environment' | 'unknown'`
  - `type CameraNameKey = 'call.cameraFront' | 'call.cameraBack' | 'call.cameraUnknown'`
  - `type CameraChoice = { readonly deviceId: string; readonly facing: CameraFacing; readonly nameKey: CameraNameKey; readonly ordinal: number | null }`
  - `readCameras(raw: unknown): readonly CameraChoice[]`

Deux faits commandent ce module. `enumerateDevices()` est typé `Promise<unknown>` (N4) et son
champ `facing` n'appartient pas à `MediaDeviceInfo` : c'est le **seul endroit du dépôt** qui
regarde cette forme, et il la regarde **sans assertion de type**. Et `getAudioOutputs()` rend
un `string[]` venu d'un module natif non typé : les valeurs inconnues sont jetées.

La composition « nom + ordinal » n'est **pas** faite ici : le module rend un descripteur
(`nameKey`, `ordinal`), et c'est le composant qui appelle `t()`. Une chaîne composée en
JavaScript n'est pas traduisible.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/call/devices.spec.ts` :

```ts
import {
  AUDIO_OUTPUT_ORDER,
  audioOutputNameKey,
  readAudioOutputs,
  readCameras,
} from 'src/call/devices';

describe('readAudioOutputs', () => {
  it("ordonne selon la préférence automatique de LiveKit, quelle que soit la forme de l'entrée", () => {
    // L'ordre de présentation est celui de `preferredOutputList`
    // (bluetooth > headset > speaker > earpiece) : le haut de la liste est ce
    // que le système choisirait tout seul.
    expect(readAudioOutputs(['earpiece', 'speaker', 'bluetooth'])).toEqual([
      'bluetooth',
      'speaker',
      'earpiece',
    ]);
  });

  it("jette ce qui n'est pas une catégorie connue, y compris ce qui n'est pas une chaîne", () => {
    // `NativeModules.LivekitReactNativeModule` traverse un Proxy non typé :
    // rien ne garantit que le tableau ne contienne que des chaînes.
    expect(readAudioOutputs(['speaker', 'hdmi', 42, null, undefined, {}])).toEqual(['speaker']);
  });

  it('écrase les doublons', () => {
    expect(readAudioOutputs(['speaker', 'speaker', 'headset'])).toEqual(['headset', 'speaker']);
  });

  it('rend une liste vide sur une liste vide', () => {
    // Cas atteint au pré-écran : `getAudioOutputs()` rend `[]` tant que
    // `startAudioSession()` n'a pas tourné.
    expect(readAudioOutputs([])).toEqual([]);
  });

  it('expose les quatre catégories, dans leur ordre de préférence', () => {
    expect(AUDIO_OUTPUT_ORDER).toEqual(['bluetooth', 'headset', 'speaker', 'earpiece']);
  });
});

describe('audioOutputNameKey', () => {
  it('compose la clé de traduction de chaque catégorie', () => {
    // Deux catégories distinctes, jamais une seule : avec une seule, un retour
    // codé en dur serait indiscernable d'une composition correcte.
    expect(audioOutputNameKey('bluetooth')).toBe('call.output.bluetooth');
    expect(audioOutputNameKey('earpiece')).toBe('call.output.earpiece');
  });
});

describe('readCameras', () => {
  it("jette les entrées audio et les identifiants vides, comme le fait le web", () => {
    // Android rend un `audioinput` factice libellé "Audio", et zéro
    // `audiooutput` : un menu caméra qui ne filtrerait pas afficherait une
    // ligne « Audio ».
    expect(
      readCameras([
        { kind: 'audioinput', deviceId: 'audio-1', label: 'Audio' },
        { kind: 'videoinput', deviceId: '', facing: 'front' },
        { kind: 'videoinput', deviceId: '0', facing: 'front', label: 'camera-2-id' },
      ]),
    ).toEqual([{ deviceId: '0', facing: 'user', nameKey: 'call.cameraFront', ordinal: null }]);
  });

  it('traduit "front" en user et "unknown" en unknown', () => {
    // Android rend "front"/"environment" ; iOS peut rendre "unknown" pour une
    // caméra externe ou de position non spécifiée. `FacingMode` de `media.ts`
    // ne connaît que deux valeurs : la troisième s'arrête ici.
    expect(
      readCameras([
        { kind: 'videoinput', deviceId: 'a', facing: 'front' },
        { kind: 'videoinput', deviceId: 'b', facing: 'unknown' },
      ]),
    ).toEqual([
      { deviceId: 'a', facing: 'user', nameKey: 'call.cameraFront', ordinal: null },
      { deviceId: 'b', facing: 'unknown', nameKey: 'call.cameraUnknown', ordinal: null },
    ]);
  });

  it("ne pose pas d'ordinal quand une face ne compte qu'une caméra", () => {
    expect(
      readCameras([
        { kind: 'videoinput', deviceId: '0', facing: 'front' },
        { kind: 'videoinput', deviceId: '1', facing: 'environment' },
      ]).map((camera) => camera.ordinal),
    ).toEqual([null, null]);
  });

  it('numérote par face et non globalement', () => {
    // Deux avant et trois arrière donnent 1,2 et 1,2,3 — pas 1..5. Une fixture
    // où toutes les caméras seraient arrière ne prouverait rien de cette règle.
    const cameras = readCameras([
      { kind: 'videoinput', deviceId: 'f1', facing: 'front' },
      { kind: 'videoinput', deviceId: 'b1', facing: 'environment' },
      { kind: 'videoinput', deviceId: 'f2', facing: 'front' },
      { kind: 'videoinput', deviceId: 'b2', facing: 'environment' },
      { kind: 'videoinput', deviceId: 'b3', facing: 'environment' },
    ]);

    expect(cameras.map((camera) => [camera.deviceId, camera.ordinal])).toEqual([
      ['f1', 1],
      ['b1', 1],
      ['f2', 2],
      ['b2', 2],
      ['b3', 3],
    ]);
  });

  it("conserve l'ordre d'énumération, le seul que la plateforme donne", () => {
    // Sur Android, le `deviceId` **est** l'index d'énumération : réordonner
    // ferait pointer « Caméra arrière 2 » vers une autre caméra que celle que
    // la plateforme a numérotée ainsi.
    expect(
      readCameras([
        { kind: 'videoinput', deviceId: '1', facing: 'environment' },
        { kind: 'videoinput', deviceId: '0', facing: 'front' },
      ]).map((camera) => camera.deviceId),
    ).toEqual(['1', '0']);
  });

  it('survit à undefined, à un objet et à des entrées vides', () => {
    // `enumerateDevices()` est typé `Promise<unknown>` : rien ne garantit un
    // tableau, ni des objets bien formés dedans.
    expect(readCameras(undefined)).toEqual([]);
    expect(readCameras({ kind: 'videoinput' })).toEqual([]);
    expect(readCameras([{}, null, 'x'])).toEqual([]);
  });
});
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/call/devices`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : implémenter**

`src/call/devices.ts` :

```ts
// Les quatre catégories de sortie d'Android, et rien d'autre. Ce sont des
// catégories, pas des appareils : deux casques Bluetooth appairés se
// présentent comme une seule entrée « bluetooth », et le nom du casque n'est
// pas exposé.
export type AudioOutputKind = 'bluetooth' | 'headset' | 'speaker' | 'earpiece';

// L'ordre de présentation est celui de la préférence automatique de LiveKit
// (`preferredOutputList`) : le haut de la liste est ce que le système
// choisirait tout seul.
export const AUDIO_OUTPUT_ORDER: readonly AudioOutputKind[] = [
  'bluetooth',
  'headset',
  'speaker',
  'earpiece',
];

// Le module natif n'est pas typé : `NativeModules.LivekitReactNativeModule`
// traverse un Proxy sans contrat. Les valeurs inconnues sont jetées, les
// doublons écrasés, le reste ordonné.
export function readAudioOutputs(raw: readonly unknown[]): readonly AudioOutputKind[] {
  const seen = new Set<AudioOutputKind>();
  for (const value of raw) {
    const found = AUDIO_OUTPUT_ORDER.find((kind) => kind === value);
    if (found !== undefined) seen.add(found);
  }
  return AUDIO_OUTPUT_ORDER.filter((kind) => seen.has(kind));
}

export type AudioOutputNameKey = `call.output.${AudioOutputKind}`;

export function audioOutputNameKey(kind: AudioOutputKind): AudioOutputNameKey {
  return `call.output.${kind}`;
}

// `FacingMode` de `src/call/media.ts` ne connaît que deux valeurs. iOS peut
// rendre "unknown" pour une caméra externe ou de position non spécifiée : une
// troisième valeur est donc nécessaire ici, et elle ne remonte jamais jusqu'à
// `src/call/layout.ts`, qui n'a pas de miroir défini pour elle.
export type CameraFacing = 'user' | 'environment' | 'unknown';

export type CameraNameKey = 'call.cameraFront' | 'call.cameraBack' | 'call.cameraUnknown';

export type CameraChoice = {
  readonly deviceId: string;
  readonly facing: CameraFacing;
  readonly nameKey: CameraNameKey;
  // `null` quand la face ne compte qu'une caméra. Sinon 1, 2, 3… dans l'ordre
  // d'énumération — le seul que la plateforme donne, et sur Android c'est
  // littéralement l'index qui sert de `deviceId`.
  readonly ordinal: number | null;
};

const NAME_KEYS: Readonly<Record<CameraFacing, CameraNameKey>> = {
  user: 'call.cameraFront',
  environment: 'call.cameraBack',
  unknown: 'call.cameraUnknown',
};

// Les caméras sont nommées depuis `facing`, jamais depuis le `label` brut : sur
// Android celui-ci est l'identifiant Camera2, illisible. Le web affiche le
// `label` sans repli ; c'est une différence à traiter, pas à hériter.
function readFacing(value: unknown): CameraFacing {
  if (value === 'front' || value === 'user') return 'user';
  if (value === 'environment' || value === 'back') return 'environment';
  return 'unknown';
}

// `enumerateDevices()` est typé `Promise<unknown>` et son champ `facing`
// n'appartient pas à `MediaDeviceInfo`. Cette fonction est le seul endroit du
// dépôt qui regarde cette forme, et elle la regarde sans assertion de type :
// le narrowing par `typeof` et par l'opérateur `in` suffit.
//
// Parser et numéroter sont inséparables : l'ordinal dépend de la liste entière.
export function readCameras(raw: unknown): readonly CameraChoice[] {
  if (!Array.isArray(raw)) return [];
  const entries: readonly unknown[] = raw;

  const parsed: { deviceId: string; facing: CameraFacing }[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    if (!('kind' in entry) || entry.kind !== 'videoinput') continue;
    if (!('deviceId' in entry) || typeof entry.deviceId !== 'string') continue;
    if (entry.deviceId.length === 0) continue;
    parsed.push({
      deviceId: entry.deviceId,
      facing: 'facing' in entry ? readFacing(entry.facing) : 'unknown',
    });
  }

  const totals = new Map<CameraFacing, number>();
  for (const camera of parsed) totals.set(camera.facing, (totals.get(camera.facing) ?? 0) + 1);

  const running = new Map<CameraFacing, number>();
  return parsed.map((camera) => {
    const rank = (running.get(camera.facing) ?? 0) + 1;
    running.set(camera.facing, rank);
    return {
      deviceId: camera.deviceId,
      facing: camera.facing,
      nameKey: NAME_KEYS[camera.facing],
      // Un ordinal seulement quand la face en compte plus d'une : sinon
      // « Caméra avant 1 » sur un téléphone qui n'en a qu'une.
      ordinal: (totals.get(camera.facing) ?? 0) > 1 ? rank : null,
    };
  });
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx jest src/call/devices`
Attendu : PASSE (12 cas).

- [ ] **Step 5 : éprouver par mutation**

Quatre mutations, quatre rouges attendus :

1. Remplacer le corps de `readAudioOutputs` par `return raw as readonly AudioOutputKind[];` —
   les tests d'ordre, de valeurs inconnues et de doublons doivent rougir.
2. Remplacer `ordinal: (totals.get(camera.facing) ?? 0) > 1 ? rank : null` par
   `ordinal: rank` — le test « ne pose pas d'ordinal quand une face ne compte qu'une
   caméra » doit rougir.
3. Remplacer le compteur par face par un compteur global (`running` sans clé de face) — le
   test « numérote par face et non globalement » doit rougir.
4. Retirer `if (entry.deviceId.length === 0) continue;` — le test « jette les entrées audio
   et les identifiants vides » doit rougir.

Restaurer après chaque.

- [ ] **Step 6 : commit**

```bash
git add src/call/devices.ts src/call/devices.spec.ts
git commit -m "feat(call): Read the device lists the platform actually gives"
```

---

### Task 2 : la route audio, et le seul canal qu'elle a

**Files:**
- Create: `src/call/audioRoute.ts`
- Test: `src/call/audioRoute.spec.ts`
- Modify: `__mocks__/@livekit/react-native.ts`

**Interfaces:**
- Consumes: `readAudioOutputs`, `AudioOutputKind` de `src/call/devices` (Task 1) ;
  `AudioSession` de `@livekit/react-native` ; `Platform` de `react-native`
- Produces :
  - `type AudioRouteControl = 'menu' | 'system'`
  - `audioRouteControl(): AudioRouteControl`
  - `listAudioOutputs(): Promise<readonly AudioOutputKind[]>`
  - `selectAudioOutput(kind: AudioOutputKind): Promise<void>`
  - `openSystemRoutePicker(): Promise<void>`

Séparé de `media.ts` parce que rien ne les relie : la sortie audio **ne passe pas par la
`Room`** — `switchActiveDevice('audiooutput', …)` lève en React Native, son garde est
`!document` et ne peut pas être satisfait — ne connaît pas de piste, et ne partage aucune
donnée avec la caméra.

`selectAudioOutput` rend `Promise<void>` parce qu'**il n'y a rien d'autre à dire** :
`LivekitReactNativeModule.kt:136-141` poste son travail sur un `handler` et résout la promesse
avant que le runnable ne s'exécute ; un identifiant inconnu est un no-op silencieux (N2).
`showAudioRoutePicker` n'a même pas de resolver côté natif (N3). **Il n'existe aucun canal
d'échec pour la sortie audio, et la conception refuse d'en fabriquer un.**

`audioRouteControl()` rend une **valeur** plutôt que de laisser le composant lire `Platform` :
c'est ce qui permet à une spec de rendre les deux branches sans bouchonner `Platform`.

- [ ] **Step 1 : étendre le double manuel de `@livekit/react-native`**

Dans `__mocks__/@livekit/react-native.ts`, remplacer l'objet `AudioSession` par :

```ts
export const AudioSession = {
  startAudioSession: jest.fn(async (): Promise<void> => undefined),
  stopAudioSession: jest.fn(async (): Promise<void> => undefined),
  // Ajoutés pour `src/call/audioRoute.ts`. `getAudioOutputs` rend `string[]` et
  // non des `MediaDeviceInfo` : sur Android ce sont les quatre catégories
  // d'AudioSwitch, sur iOS la constante ['default', 'force_speaker'] écrite en
  // dur côté JS. Le double part de `[]`, ce que rend la vraie fonction tant que
  // `startAudioSession()` n'a pas tourné.
  getAudioOutputs: jest.fn(async (): Promise<string[]> => []),
  selectAudioOutput: jest.fn(async (): Promise<void> => undefined),
  showAudioRoutePicker: jest.fn(async (): Promise<void> => undefined),
};
```

- [ ] **Step 2 : écrire les tests qui échouent**

`src/call/audioRoute.spec.ts` :

```ts
import { AudioSession } from '@livekit/react-native';
import { Platform } from 'react-native';

import {
  audioRouteControl,
  listAudioOutputs,
  openSystemRoutePicker,
  selectAudioOutput,
} from 'src/call/audioRoute';

beforeEach(() => {
  jest.restoreAllMocks();
  jest.mocked(AudioSession.getAudioOutputs).mockReset().mockResolvedValue([]);
  jest.mocked(AudioSession.selectAudioOutput).mockReset().mockResolvedValue(undefined);
  jest.mocked(AudioSession.showAudioRoutePicker).mockReset().mockResolvedValue(undefined);
});

describe('audioRouteControl', () => {
  it("rend 'system' sur iOS, où la seule surface est le sélecteur de la plateforme", () => {
    // `getAudioOutputs()` y est une constante à deux entrées qui ne sont pas
    // des catégories : il n'y a pas de menu à peupler.
    jest.replaceProperty(Platform, 'OS', 'ios');

    expect(audioRouteControl()).toBe('system');
  });

  it("rend 'menu' ailleurs", () => {
    // Les deux branches, jamais une seule : avec une seule, une constante en
    // dur serait indiscernable d'une lecture correcte de la plateforme.
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(audioRouteControl()).toBe('menu');
  });
});

describe('listAudioOutputs', () => {
  it('normalise et ordonne ce que rend le module natif', async () => {
    jest.mocked(AudioSession.getAudioOutputs).mockResolvedValue(['speaker', 'bluetooth', 'hdmi']);

    await expect(listAudioOutputs()).resolves.toEqual(['bluetooth', 'speaker']);
  });

  it("rend une liste vide quand la session audio n'est pas ouverte", async () => {
    jest.mocked(AudioSession.getAudioOutputs).mockResolvedValue([]);

    await expect(listAudioOutputs()).resolves.toEqual([]);
  });

  it("jette les constantes iOS, qui ne sont pas des catégories", async () => {
    jest
      .mocked(AudioSession.getAudioOutputs)
      .mockResolvedValue(['default', 'force_speaker']);

    await expect(listAudioOutputs()).resolves.toEqual([]);
  });
});

describe('selectAudioOutput', () => {
  it('transmet la catégorie choisie, jamais une autre', async () => {
    // Deux appels distincts, et la seconde catégorie vérifiée : un appel qui
    // enverrait toujours 'speaker' passerait un test à une seule valeur.
    await selectAudioOutput('bluetooth');
    await selectAudioOutput('earpiece');

    expect(AudioSession.selectAudioOutput).toHaveBeenNthCalledWith(1, 'bluetooth');
    expect(AudioSession.selectAudioOutput).toHaveBeenNthCalledWith(2, 'earpiece');
  });
});

describe('openSystemRoutePicker', () => {
  it('appelle le sélecteur système', async () => {
    // Un test ne peut vérifier que l'appel : la méthode native simule un clic
    // sur une vue jamais insérée dans la hiérarchie, et n'a pas de resolver.
    await openSystemRoutePicker();

    expect(AudioSession.showAudioRoutePicker).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3 : lancer les tests pour les voir échouer**

Run : `npx jest src/call/audioRoute`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 4 : implémenter**

`src/call/audioRoute.ts` :

```ts
import { AudioSession } from '@livekit/react-native';
import { Platform } from 'react-native';

import { readAudioOutputs, type AudioOutputKind } from 'src/call/devices';

// 'system' : le sélecteur est celui d'iOS, on ne contrôle ni son apparence ni
// ses libellés. 'menu' : le nôtre, alimenté par `getAudioOutputs()`.
//
// Rendu comme une valeur plutôt que lu depuis `Platform` par le composant :
// c'est ce qui permet à une spec de rendre les deux branches sans bouchonner
// `Platform`.
export type AudioRouteControl = 'menu' | 'system';

export function audioRouteControl(): AudioRouteControl {
  return Platform.OS === 'ios' ? 'system' : 'menu';
}

// Rend `[]` tant que `startAudioSession()` n'a pas tourné — c'est-à-dire au
// pré-écran, jamais en séance. Sur iOS, rend toujours `[]` : les deux
// constantes de la plateforme ('default', 'force_speaker') ne sont pas des
// catégories que `readAudioOutputs` reconnaît, et le mode 'system' ne les
// utilise pas.
export async function listAudioOutputs(): Promise<readonly AudioOutputKind[]> {
  return readAudioOutputs(await AudioSession.getAudioOutputs());
}

// Ne rapporte jamais d'échec, et ce n'est pas un oubli : la promesse native est
// résolue avant que le travail ne soit posté sur son handler, et un identifiant
// inconnu est un no-op silencieux. La signature dit `Promise<void>` parce qu'il
// n'y a rien d'autre à dire ; l'appelant n'a pas d'échec à traiter.
//
// C'est aussi l'appel qui désarme la bascule automatique au branchement d'un
// casque, pour le reste de la séance : « preferredOutputList is ignored when an
// output is manually selected ».
export async function selectAudioOutput(kind: AudioOutputKind): Promise<void> {
  await AudioSession.selectAudioOutput(kind);
}

// iOS seulement. Le wrapper de LiveKit est déjà gardé par `Platform.OS === 'ios'`
// et la méthode native n'a pas de resolver : rien ne dit si le sélecteur est
// apparu. Sur Android l'appel résout sans rien faire.
export async function openSystemRoutePicker(): Promise<void> {
  await AudioSession.showAudioRoutePicker();
}
```

- [ ] **Step 5 : lancer les tests**

Run : `npm test`
Attendu : tout vert. Les suites qui utilisaient déjà le double de `@livekit/react-native`
(`src/call/connection.spec.ts`) ne sont pas affectées : l'objet n'a gagné que des méthodes.

- [ ] **Step 6 : éprouver par mutation**

1. Remplacer `Platform.OS === 'ios' ? 'system' : 'menu'` par `'menu'` — le premier test
   d'`audioRouteControl` doit rougir. Puis par `'system'` — le second doit rougir.
2. Remplacer le corps de `listAudioOutputs` par
   `return (await AudioSession.getAudioOutputs()) as readonly AudioOutputKind[];` — les tests
   de normalisation et des constantes iOS doivent rougir.
3. Remplacer `AudioSession.selectAudioOutput(kind)` par
   `AudioSession.selectAudioOutput('speaker')` — le test de `selectAudioOutput` doit rougir.

Restaurer après chaque.

- [ ] **Step 7 : commit**

```bash
git add src/call/audioRoute.ts src/call/audioRoute.spec.ts __mocks__/@livekit/react-native.ts
git commit -m "feat(call): Route the audio output through the only API that works"
```

---

### Task 3 : la caméra — lister, choisir, savoir laquelle filme

**Files:**
- Modify: `src/call/media.ts`
- Test: `src/call/media.spec.ts`
- Create: `__mocks__/@livekit/react-native-webrtc.ts`

**Interfaces:**
- Consumes: `readCameras`, `CameraChoice` de `src/call/devices` (Task 1) ; `mediaDevices` de
  `@livekit/react-native-webrtc` ; `Room` de `livekit-client` (type)
- Produces :
  - `listCameras(): Promise<readonly CameraChoice[]>`
  - `selectCamera(room: Room, deviceId: string): Promise<boolean>`
  - `readActiveCameraId(room: Room): string | null`
  - (inchangés : `FacingMode`, `setMicrophoneEnabled`, `setCameraEnabled`, `switchCamera` —
    ce dernier est supprimé en Task 6, pas ici)

Trois faits commandent cette tâche.

`Room.getLocalDevices('audiooutput')` **allume le micro pour rien** : sa condition
`isDummyDeviceOrEmpty` est toujours vraie sur mobile, et il enchaîne `getUserMedia`,
réénumération, `[]`. `listCameras` passe donc par `mediaDevices.enumerateDevices()`, jamais par
`Room.getLocalDevices`. Une assertion le garde.

`switchActiveDevice('videoinput', …)` est le chemin qui marche, mais son booléen **n'a de sens
que si une piste caméra est publiée** (N5). Caméra allumée, il compare
`unwrapConstraint(deviceId)` à `getSettings().deviceId` — une vérification réelle, et
`getSettings().deviceId` dit la caméra **réellement en service**, y compris quand Android est
arrivé là par son repli `facingMode` silencieux (N6). Caméra éteinte, `Promise.all([]).every(…)`
rend `true` sans rien vérifier. Le même appel **jette** aussi si `setDeviceId` jette. **Deux
canaux d'échec, les deux à rendre à l'appelant** : ne pas remplacer le booléen par `true` est
exactement le défaut que N5 rend possible.

`room.getActiveDevice('videoinput')` **fonctionne** en React Native : `activeDeviceMap` est
alimentée depuis `track.getDeviceId(false)` à chaque publication et à chaque redémarrage de
piste, sans normalisation — donc sans passer par le piège ci-dessus. Contrairement à la sortie
audio, la caméra courante est lisible.

- [ ] **Step 1 : créer le double manuel de `@livekit/react-native-webrtc`**

Sans lui, `import { mediaDevices } from '@livekit/react-native-webrtc'` fait tomber **toutes**
les suites qui importent `src/call/media.ts` sur
`Invariant Violation: new NativeEventEmitter() requires a non-null argument` (E1).

`__mocks__/@livekit/react-native-webrtc.ts` :

```ts
/**
 * Double manuel de `@livekit/react-native-webrtc`.
 *
 * L'index du vrai paquet construit un `NativeEventEmitter` au chargement du
 * module (`AudioDeviceModuleEvents.ts` → `EventEmitter.ts`), sur un module
 * natif qui n'existe pas sous Jest. L'import jette donc avant même qu'une
 * fonction ne soit appelée, et il jette pour toute suite qui importe
 * `src/call/media.ts` — soit `media.spec.ts`, `call.spec.tsx` et
 * `prejoin.spec.tsx`, sur un message qui ne nomme ni caméra ni périphérique.
 *
 * Placé à côté de `node_modules`, Jest le substitue automatiquement partout,
 * sans `jest.mock(...)` — même mécanisme que `__mocks__/@livekit/react-native.ts`.
 *
 * `enumerateDevices` est un `jest.fn()` rendant `Promise<unknown>`, la
 * signature réelle : le vrai passe-plat ne type pas son résultat, et c'est ce
 * qui justifie le module de parsing de `src/call/devices.ts`.
 */
export const mediaDevices = {
  enumerateDevices: jest.fn(async (): Promise<unknown> => []),
};
```

- [ ] **Step 2 : écrire les tests qui échouent**

Dans `src/call/media.spec.ts` : ajouter les imports en tête, étendre la fabrique de
`jest.mock('livekit-client', …)`, étendre `fakeRoom`, et ajouter les trois `describe`.

Imports à ajouter et à fusionner — **un seul** import par module, sans quoi le lint refuse le
doublon :

```ts
import { mediaDevices } from '@livekit/react-native-webrtc';

import {
  listCameras,
  readActiveCameraId,
  selectCamera,
  setCameraEnabled,
  setMicrophoneEnabled,
  switchCamera,
} from 'src/call/media';
```

Doubles à ajouter, à côté de `mockRestartTrack` :

```ts
const mockSwitchActiveDevice = jest.fn();
const mockGetActiveDevice = jest.fn();
const mockGetLocalDevices = jest.fn();
```

Fabrique de `jest.mock('livekit-client', …)`, à remplacer :

```ts
jest.mock('livekit-client', () => ({
  Track: { Source: { Camera: 'camera', ScreenShare: 'screen_share' } },
  // Une fermeture, jamais la référence directe : la fabrique de `jest.mock`
  // s'exécute avant l'initialisation des `const` de ce module. Elle n'est là
  // que pour prouver que `listCameras` ne l'appelle pas — `getLocalDevices`
  // acquiert `getUserMedia` dès que sa liste filtrée est vide, et allume donc
  // le micro pour rien.
  Room: { getLocalDevices: (...args: unknown[]) => mockGetLocalDevices(...args) },
}));
```

`fakeRoom`, à remplacer :

```ts
function fakeRoom(publications: Publications): Room {
  return {
    localParticipant: {
      setMicrophoneEnabled: mockSetMicrophoneEnabled,
      setCameraEnabled: mockSetCameraEnabled,
      getTrackPublication: (source: string) => publications[source],
    },
    switchActiveDevice: mockSwitchActiveDevice,
    getActiveDevice: mockGetActiveDevice,
  } as unknown as Room;
}
```

`beforeEach`, à compléter :

```ts
beforeEach(() => {
  mockSetMicrophoneEnabled.mockReset().mockResolvedValue(undefined);
  mockSetCameraEnabled.mockReset().mockResolvedValue(undefined);
  mockRestartTrack.mockReset().mockResolvedValue(undefined);
  mockSwitchActiveDevice.mockReset().mockResolvedValue(true);
  mockGetActiveDevice.mockReset().mockReturnValue(undefined);
  mockGetLocalDevices.mockReset();
  jest.mocked(mediaDevices.enumerateDevices).mockReset().mockResolvedValue([]);
});
```

Les trois `describe` à ajouter en fin de fichier :

```ts
describe('listCameras', () => {
  it("passe par mediaDevices et n'appelle jamais Room.getLocalDevices", async () => {
    // `getLocalDevices` acquiert `getUserMedia` dès que sa liste filtrée est
    // vide — ce qui est toujours le cas sur mobile pour l'audio — et allume
    // donc le micro pour rien. Le piège ne se paie pas sous Jest : il se paie
    // sur appareil, par une pastille d'enregistrement qui s'allume seule.
    jest.mocked(mediaDevices.enumerateDevices).mockResolvedValue([
      { kind: 'videoinput', deviceId: '0', facing: 'front', label: 'camera-2-id' },
      { kind: 'audioinput', deviceId: 'audio-1', label: 'Audio' },
    ]);

    const cameras = await listCameras();

    expect(cameras).toEqual([
      { deviceId: '0', facing: 'user', nameKey: 'call.cameraFront', ordinal: null },
    ]);
    expect(mockGetLocalDevices).not.toHaveBeenCalled();
  });

  it("rend une liste vide plutôt que de jeter quand l'énumération ne rend rien d'exploitable", async () => {
    jest.mocked(mediaDevices.enumerateDevices).mockResolvedValue(undefined);

    await expect(listCameras()).resolves.toEqual([]);
  });
});

describe('selectCamera', () => {
  it("vise videoinput et le deviceId reçu, jamais le premier venu", async () => {
    // Deux appels distincts, et le second vérifié : un appel qui enverrait
    // toujours le même identifiant passerait un test à une seule valeur.
    await selectCamera(fakeRoom({}), 'cam-front');
    await selectCamera(fakeRoom({}), 'cam-back');

    expect(mockSwitchActiveDevice).toHaveBeenNthCalledWith(1, 'videoinput', 'cam-front');
    expect(mockSwitchActiveDevice).toHaveBeenNthCalledWith(2, 'videoinput', 'cam-back');
  });

  it('rend le booléen du SDK tel quel', async () => {
    // `false` dit qu'Android est retombé sur son repli `facingMode` : la
    // caméra en service n'est pas celle qu'on a demandée. Remplacer ce
    // booléen par `true` supprimerait le seul signal qui existe.
    mockSwitchActiveDevice.mockResolvedValue(false);

    await expect(selectCamera(fakeRoom({}), 'cam-back')).resolves.toBe(false);
  });

  it('rend true quand le SDK confirme', async () => {
    mockSwitchActiveDevice.mockResolvedValue(true);

    await expect(selectCamera(fakeRoom({}), 'cam-back')).resolves.toBe(true);
  });

  it('laisse remonter le rejet, qui est le second canal', async () => {
    // `switchActiveDevice` jette si `setDeviceId` jette, après avoir restauré
    // le `deviceId` précédent. Un `.catch()` seul chez l'appelant ne verrait
    // pas le premier canal ; avaler le rejet ici masquerait le second.
    mockSwitchActiveDevice.mockRejectedValue(new Error('contrainte impossible'));

    await expect(selectCamera(fakeRoom({}), 'cam-back')).rejects.toThrow('contrainte impossible');
  });
});

describe('readActiveCameraId', () => {
  it('rend la caméra réellement en service', () => {
    mockGetActiveDevice.mockReturnValue('cam-back');

    expect(readActiveCameraId(fakeRoom({}))).toBe('cam-back');
    expect(mockGetActiveDevice).toHaveBeenCalledWith('videoinput');
  });

  it("rend null plutôt qu'undefined quand le SDK n'en connaît aucune", () => {
    // `getActiveDevice` rend `string | undefined` ; l'écran tient un
    // `string | null`. La conversion se fait ici, une fois.
    mockGetActiveDevice.mockReturnValue(undefined);

    expect(readActiveCameraId(fakeRoom({}))).toBe(null);
  });
});
```

- [ ] **Step 3 : lancer les tests pour les voir échouer**

Run : `npx jest src/call/media`
Attendu : ÉCHEC — `listCameras`, `selectCamera` et `readActiveCameraId` ne sont pas exportés.

- [ ] **Step 4 : implémenter**

Dans `src/call/media.ts`, ajouter les imports en tête :

```ts
import { mediaDevices } from '@livekit/react-native-webrtc';

import { readCameras, type CameraChoice } from 'src/call/devices';
```

et les trois fonctions en fin de fichier :

```ts
// Passe par `mediaDevices.enumerateDevices()`, jamais par
// `Room.getLocalDevices` : celui-ci acquiert `getUserMedia` dès que sa liste
// filtrée est vide, ce qui allume le micro pour rien. N'est appelé qu'après
// `ensureMediaPermissions()`, donc avec la permission caméra déjà accordée —
// la barre de contrôle n'est rendue qu'à l'état `connected`.
export async function listCameras(): Promise<readonly CameraChoice[]> {
  return readCameras(await mediaDevices.enumerateDevices());
}

// Rend le booléen de `switchActiveDevice`. Il ne vaut vérification que si une
// piste caméra est publiée : caméra éteinte, `Promise.all([]).every(…)` rend
// `true` sans rien prouver, et seule la préférence est enregistrée dans
// `options.videoCaptureDefaults.deviceId` pour le prochain allumage. Caméra
// allumée, `false` dit qu'Android est retombé sur son repli `facingMode`.
//
// Peut aussi rejeter, après avoir restauré le `deviceId` précédent : deux
// canaux d'échec, les deux rendus à l'appelant tels quels.
export async function selectCamera(room: Room, deviceId: string): Promise<boolean> {
  return room.switchActiveDevice('videoinput', deviceId);
}

// Fiable en React Native, contrairement à son homologue audio : `activeDeviceMap`
// est alimentée à chaque publication et à chaque redémarrage de piste depuis
// `getSettings().deviceId`, qui dit la caméra réellement en service — y compris
// quand le repli `facingMode` d'Android a joué. Aucune API équivalente
// n'existe pour la sortie audio.
export function readActiveCameraId(room: Room): string | null {
  return room.getActiveDevice('videoinput') ?? null;
}
```

- [ ] **Step 5 : lancer la suite complète**

Run : `npm test`
Attendu : tout vert. Le double de `@livekit/react-native-webrtc` s'applique automatiquement à
`call.spec.tsx` et `prejoin.spec.tsx`, qui importent `media.ts` sans le savoir.

- [ ] **Step 6 : éprouver par mutation**

1. Remplacer `return room.switchActiveDevice('videoinput', deviceId);` par
   `await room.switchActiveDevice('videoinput', deviceId); return true;` — le test « rend le
   booléen du SDK tel quel » doit rougir.
2. Remplacer `'videoinput'` par `'audioinput'` — le test de `selectCamera` doit rougir.
3. Remplacer `deviceId` par `'cam-front'` en dur — le second appel du même test doit rougir.
4. Remplacer `?? null` par `?? ''` dans `readActiveCameraId` — le second test doit rougir.
5. Envelopper l'appel de `selectCamera` d'un `try { … } catch { return false; }` — le test du
   rejet doit rougir.

Restaurer après chaque.

- [ ] **Step 7 : commit**

```bash
git add src/call/media.ts src/call/media.spec.ts __mocks__/@livekit/react-native-webrtc.ts
git commit -m "feat(call): List, pick and read back the camera in service"
```

---

### Task 4 : le chevron et son menu de caméras

**Files:**
- Create: `src/screens/room/controlBar.ts`
- Create: `src/screens/room/cameraMenu.tsx`
- Test: `src/screens/room/cameraMenu.spec.tsx`
- Modify: les sept fichiers de `src/i18n/locales/`

**Interfaces:**
- Consumes: `CameraChoice` de `src/call/devices` (Task 1) ; `tokens` de `src/ui/tokens`
- Produces :
  - depuis `src/screens/room/controlBar.ts` :
    - `const BAR_HIT_SLOP: { top: number; bottom: number; left: number; right: number }`
    - `const BAR_ICON_COLOR: string`
    - `const barStyles` — un `StyleSheet.create` portant `button`, `menuContent`, `menuTitle`,
      `menuNote`, `check`
  - depuis `src/screens/room/cameraMenu.tsx` :
    - `type CameraMenuProps = { readonly cameras: readonly CameraChoice[]; readonly activeDeviceId: string | null; readonly onOpen: () => void; readonly onSelect: (choice: CameraChoice) => void }`
    - `CameraMenu(props: CameraMenuProps): React.ReactElement`
  - testIDs stables, consommés par la Task 7 : `camera-menu-btn` (le chevron),
    `camera-option-<deviceId>` (une ligne), `camera-check-<deviceId>` (la coche)

Le composant possède son booléen `visible` — état d'affichage local, jamais métier — et appelle
`onOpen()` au moment de l'ouvrir, ce qui déclenche la relecture chez le parent. Deux lectures,
un seul instant : `MediaDevicesChanged` ne se déclenche jamais sur mobile, et rien d'autre ne
notifie. Une caméra branchée pendant que le menu est ouvert n'apparaîtra qu'à la réouverture.

`onSelect` rend le `CameraChoice` **entier**, pas seulement son `deviceId` : l'écran a besoin
de `facing` pour le miroir de la vignette locale (`src/call/layout.ts:119`).

Le chevron est **toujours rendu, jamais désactivé**. Un appareil qui ne rendrait qu'une caméra
ouvrirait un menu d'une ligne : légèrement inutile, jamais cassé — et `disabled` ramènerait le
noir sur noir (N9).

- [ ] **Step 1 : ajouter les cinq clés dans les sept locales**

À placer dans le bloc `call.*`, après `call.switchCamera` :

| Clé | `en` | `fr` |
|---|---|---|
| `call.cameraFront` | `Front camera` | `Caméra avant` |
| `call.cameraBack` | `Back camera` | `Caméra arrière` |
| `call.cameraUnknown` | `Camera` | `Caméra` |
| `call.cameraNumbered` | `{{name}} {{index}}` | `{{name}} {{index}}` |
| `call.selectCamera` | `Choose a camera` | `Choisir une caméra` |

| Clé | `es` | `it` |
|---|---|---|
| `call.cameraFront` | `Cámara frontal` | `Fotocamera anteriore` |
| `call.cameraBack` | `Cámara trasera` | `Fotocamera posteriore` |
| `call.cameraUnknown` | `Cámara` | `Fotocamera` |
| `call.cameraNumbered` | `{{name}} {{index}}` | `{{name}} {{index}}` |
| `call.selectCamera` | `Elegir una cámara` | `Scegli una fotocamera` |

| Clé | `de` | `vi` | `ru` |
|---|---|---|---|
| `call.cameraFront` | `Frontkamera` | `Máy ảnh trước` | `Фронтальная камера` |
| `call.cameraBack` | `Rückkamera` | `Máy ảnh sau` | `Основная камера` |
| `call.cameraUnknown` | `Kamera` | `Máy ảnh` | `Камера` |
| `call.cameraNumbered` | `{{name}} {{index}}` | `{{name}} {{index}}` | `{{name}} {{index}}` |
| `call.selectCamera` | `Kamera auswählen` | `Chọn máy ảnh` | `Выбрать камеру` |

`call.cameraNumbered` existe parce qu'une chaîne composée en JavaScript n'est pas traduisible :
le module pur rend `{ nameKey, ordinal }`, et le composant fait
`t('call.cameraNumbered', { name: t(nameKey), index: ordinal })`.

- [ ] **Step 2 : écrire les tests qui échouent**

`src/screens/room/cameraMenu.spec.tsx` :

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import type { CameraChoice } from 'src/call/devices';
import { CameraMenu } from './cameraMenu';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// `Menu` monte son contenu dans un `Portal`, qui jette sans `PaperProvider`
// ancêtre. Le double officiel de `react-native-safe-area-context` est requis
// par ce `Provider`, comme dans `call.spec.tsx`.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// `animation.scale` à zéro ramène à zéro la durée de l'animation de fermeture
// que `Menu` lance au montage — sans quoi son rappel de fin, qui remet
// `rendered` à faux, tombe 250 ms plus tard et annule l'ouverture.
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

// Même à durée nulle, ce rappel part sur un `requestAnimationFrame` : sous Jest,
// `NativeAnimatedModule` est absent et `Animated` retombe sur son moteur
// JavaScript. Mesuré : 39 ouvertures sur 40 sans ce vidage, 300 sur 300 avec.
async function settleMenus(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

const FRONT: CameraChoice = {
  deviceId: 'cam-front',
  facing: 'user',
  nameKey: 'call.cameraFront',
  ordinal: null,
};

const BACK: CameraChoice = {
  deviceId: 'cam-back',
  facing: 'environment',
  nameKey: 'call.cameraBack',
  ordinal: null,
};

describe('CameraMenu', () => {
  it("n'appelle pas onOpen au montage, et n'affiche rien", async () => {
    // La liste est relue à l'ouverture, et à ce moment seulement : c'est le
    // seul instant où l'utilisateur regarde. Une relecture au montage
    // énumérerait les caméras de toute séance, ouverte ou non.
    const onOpen = jest.fn();

    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={onOpen}
          onSelect={jest.fn()}
        />,
      ),
    );

    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.queryByTestId('camera-option-cam-back')).toBeNull();
  });

  it("demande une relecture à l'ouverture", async () => {
    const onOpen = jest.fn();

    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={onOpen}
          onSelect={jest.fn()}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('rend la caméra pressée, pas la première de la liste', async () => {
    // Deux caméras, jamais une seule, et la seconde visée : avec une seule,
    // « transmet la ligne pressée » et « renvoie toujours la première » seraient
    // indiscernables.
    const onSelect = jest.fn();

    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={onSelect}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));

    // Le `CameraChoice` entier, pas seulement son `deviceId` : l'écran a besoin
    // de `facing` pour le miroir de sa propre vignette.
    expect(onSelect).toHaveBeenCalledWith(BACK);
    expect(onSelect).not.toHaveBeenCalledWith(FRONT);
  });

  it('coche la caméra active, et elle seule', async () => {
    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId="cam-back"
          onOpen={jest.fn()}
          onSelect={jest.fn()}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(screen.getByTestId('camera-check-cam-back')).toBeTruthy());
    expect(screen.queryByTestId('camera-check-cam-front')).toBeNull();
  });

  it("ne coche rien quand aucune caméra n'est connue", async () => {
    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

    expect(screen.queryByTestId('camera-check-cam-front')).toBeNull();
    expect(screen.queryByTestId('camera-check-cam-back')).toBeNull();
  });

  it("s'ouvre sans jeter sur une liste vide", async () => {
    // `listCameras` peut rendre `[]` : le chevron ne peut pas être désactivé
    // (une couleur explicite est ignorée sur un bouton `disabled`), et un
    // message d'erreur pour une liste qu'on vient de demander à voir n'aide
    // personne à agir.
    await render(
      withPaper(
        <CameraMenu cameras={[]} activeDeviceId={null} onOpen={jest.fn()} onSelect={jest.fn()} />,
      ),
    );

    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    expect(screen.getByTestId('camera-menu-btn')).toBeTruthy();
  });

  it("compose un nom numéroté quand la face compte plusieurs caméras", async () => {
    // Un iPhone Pro rend plusieurs caméras arrière : nommées depuis `facing`
    // seul, elles porteraient toutes le même nom.
    const second: CameraChoice = { ...BACK, deviceId: 'cam-back-2', ordinal: 2 };
    const first: CameraChoice = { ...BACK, ordinal: 1 };

    await render(
      withPaper(
        <CameraMenu
          cameras={[first, second]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back-2')).toBeTruthy());
    // Le `t` bouchonné rend la clé : la composition passe par
    // `call.cameraNumbered`, pas par une concaténation en JavaScript.
    expect(screen.getAllByText('call.cameraNumbered')).toHaveLength(2);
  });

  it("affiche le nom nu quand la face n'a qu'une caméra", async () => {
    // L'autre borne : sans elle, une composition inconditionnelle passerait le
    // test précédent tout en affichant « Caméra avant 1 » sur un téléphone qui
    // n'a qu'une caméra avant.
    await render(
      withPaper(
        <CameraMenu
          cameras={[FRONT, BACK]}
          activeDeviceId={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(screen.getByText('call.cameraBack')).toBeTruthy());
    expect(screen.queryByText('call.cameraNumbered')).toBeNull();
  });
});
```

- [ ] **Step 3 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/cameraMenu`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 4 : créer le foyer de la barre**

`src/screens/room/controlBar.ts` :

```ts
import { StyleSheet } from 'react-native';

import { tokens } from 'src/ui/tokens';

// Sept cibles sur une rangée. `IconButton` de Paper fait 40 dp de côté plus
// `margin: 6`, soit 52 dp d'encombrement : six suffisaient à demander 424 dp
// sur un téléphone qui en fait 360. La marge de Paper est neutralisée par la
// prop `style`, appliquée en dernier, et la cible ramenée à 44 dp — la
// recommandation Apple, au lieu des 48 dp de Material. Le coût est nommé, et
// il est compensé verticalement par le `hitSlop` ci-dessous.
//
//     7 × 44 + 1 (dans la paire caméra) + 5 × 8 + 2 × 4 = 357 dp
//
// `borderRadius` est relu depuis le `style` aplati par `IconButton`, donc
// l'ondulation reste ronde.
export const barStyles = StyleSheet.create({
  button: { margin: 0, width: 44, height: 44, borderRadius: 22 },
  // Cet écran est sombre dans les deux schémas alors que le thème Paper suit
  // le schéma système. Un `Menu` laissé intact serait cohérent avec lui-même ;
  // le piège n'apparaît qu'en forçant la surface sans le texte, ou l'inverse.
  // Les deux sont donc forcés : 15,86:1.
  menuContent: { backgroundColor: tokens.color.surfaceDark },
  menuTitle: { color: tokens.color.textDark },
  // Secondaire par la taille (`variant="labelSmall"`), jamais par un gris :
  // `tokens.color.muted` donne 3,88:1 sur cette surface, sous le seuil AA.
  menuNote: {
    color: tokens.color.textDark,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  // La coche du menu. Sa seule fonction est d'occuper la gouttière d'icône
  // d'un `Menu.Item` ; sa couleur vient de l'icône que Paper y pose.
  check: { width: 24, height: 24 },
});

// 16,65:1 sur `backgroundDark`. Aucun `IconButton` de cette barre ne porte
// `disabled` : Paper teste `disabled` avant la couleur passée par l'appelant et
// rend `onSurfaceDisabled`, un quasi-noir en schéma clair, sur un fond sombre.
// Ce qui n'est pas actionnable n'est pas rendu.
export const BAR_ICON_COLOR = tokens.color.textDark;

// Le `hitSlop` de 10 dp que Paper pose par défaut est plus large que les écarts
// retenus : deux zones tactiles voisines se recouvriraient, et le recouvrement
// irait au frère rendu en dernier. Généreux là où rien ne gêne, exact là où ça
// compte. `{...rest}` est étalé après le défaut de Paper, donc celui-ci gagne.
export const BAR_HIT_SLOP = { top: 8, bottom: 8, left: 0, right: 0 };
```

Pas de spec : une spec qui affirmerait `width: 44` ne ferait que relire la constante. Le
débordement se mesure sur appareil, pas sous Jest.

- [ ] **Step 5 : implémenter le composant**

`src/screens/room/cameraMenu.tsx` :

```tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { IconButton, Menu } from 'react-native-paper';

import type { CameraChoice } from 'src/call/devices';
import { BAR_HIT_SLOP, BAR_ICON_COLOR, barStyles } from 'src/screens/room/controlBar';

export type CameraMenuProps = {
  readonly cameras: readonly CameraChoice[];
  readonly activeDeviceId: string | null;
  readonly onOpen: () => void;
  // Le `CameraChoice` entier, pas seulement son `deviceId` : l'écran a besoin
  // de `facing` pour le miroir de sa propre vignette.
  readonly onSelect: (choice: CameraChoice) => void;
};

// Le chevron est toujours rendu, jamais désactivé. Un appareil qui ne rendrait
// qu'une caméra ouvrirait un menu d'une ligne : légèrement inutile, jamais
// cassé — et `disabled` ferait revenir le noir sur noir.
export function CameraMenu({
  cameras,
  activeDeviceId,
  onOpen,
  onSelect,
}: CameraMenuProps): React.ReactElement {
  const { t } = useTranslation();
  // État d'affichage local, jamais métier : le parent n'a rien à en savoir.
  const [visible, setVisible] = useState(false);

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      // La barre est en bas de l'écran.
      anchorPosition="top"
      contentStyle={barStyles.menuContent}
      anchor={
        <IconButton
          testID="camera-menu-btn"
          icon="chevron-up"
          iconColor={BAR_ICON_COLOR}
          style={barStyles.button}
          hitSlop={BAR_HIT_SLOP}
          onPress={() => {
            setVisible(true);
            // La liste est relue à l'ouverture, et à ce moment seulement :
            // aucun événement de changement de périphérique n'existe sur
            // mobile, et c'est le seul instant où quelqu'un regarde.
            onOpen();
          }}
          accessibilityLabel={t('call.selectCamera')}
        />
      }
    >
      {cameras.map((camera) => (
        <Menu.Item
          key={camera.deviceId}
          testID={`camera-option-${camera.deviceId}`}
          titleStyle={barStyles.menuTitle}
          leadingIcon={
            camera.deviceId === activeDeviceId
              ? () => <View testID={`camera-check-${camera.deviceId}`} style={barStyles.check} />
              : undefined
          }
          // Composé par i18next, jamais en JavaScript : une chaîne assemblée
          // ici ne serait pas traduisible.
          title={
            camera.ordinal === null
              ? t(camera.nameKey)
              : t('call.cameraNumbered', { name: t(camera.nameKey), index: camera.ordinal })
          }
          onPress={() => {
            setVisible(false);
            onSelect(camera);
          }}
        />
      ))}
    </Menu>
  );
}
```

- [ ] **Step 6 : lancer les tests**

Run : `npx jest src/screens/room/cameraMenu && npx jest src/i18n`
Attendu : PASSE (8 cas de `cameraMenu`, `src/i18n/index.spec.ts` vert).

- [ ] **Step 7 : éprouver par mutation**

1. Remplacer `onSelect(camera)` par `onSelect(cameras[0] as CameraChoice)` — le test « rend la
   caméra pressée, pas la première de la liste » doit rougir.
2. Déplacer `onOpen()` du `onPress` vers le corps du composant — le test « n'appelle pas
   onOpen au montage » doit rougir.
3. Remplacer la condition de `leadingIcon` par `true` — le test de la coche doit rougir sur
   `camera-check-cam-front`. Puis par `undefined` — il doit rougir sur `camera-check-cam-back`.
4. Remplacer la condition de `title` par la seule branche `call.cameraNumbered` — le test
   « affiche le nom nu » doit rougir. Puis par la seule branche `t(camera.nameKey)` — le test
   du nom numéroté doit rougir.

Restaurer après chaque.

- [ ] **Step 8 : commit**

```bash
git add src/screens/room/controlBar.ts src/screens/room/cameraMenu.tsx src/screens/room/cameraMenu.spec.tsx src/i18n/locales
git commit -m "feat(call): Offer every camera behind a chevron of its own"
```

---

### Task 5 : la sortie audio — un bouton, deux profondeurs

**Files:**
- Create: `src/screens/room/audioOutputControl.tsx`
- Test: `src/screens/room/audioOutputControl.spec.tsx`
- Modify: les sept fichiers de `src/i18n/locales/`

**Interfaces:**
- Consumes: `AudioRouteControl` de `src/call/audioRoute` (Task 2) ; `audioOutputNameKey` et
  `AudioOutputKind` de `src/call/devices` (Task 1) ; `BAR_HIT_SLOP`, `BAR_ICON_COLOR`,
  `barStyles` de `src/screens/room/controlBar` (Task 4)
- Produces :
  - `type AudioOutputControlProps = { readonly mode: AudioRouteControl; readonly outputs: readonly AudioOutputKind[]; readonly chosen: AudioOutputKind | null; readonly onOpen: () => void; readonly onSelect: (kind: AudioOutputKind) => void; readonly onSystemPicker: () => void }`
  - `AudioOutputControl(props: AudioOutputControlProps): React.ReactElement`
  - testIDs stables, consommés par la Task 8 : `audio-output-btn`,
    `audio-output-option-<kind>`, `audio-output-check-<kind>`, `audio-output-note`

En `mode === 'system'`, le composant rend **un seul bouton** qui appelle `onSystemPicker` : pas
de menu, pas de liste, pas de coche — sur iOS il n'y a rien à peupler. En `mode === 'menu'`, un
bouton qui ouvre un `Menu` de `outputs`, coché sur `chosen`, précédé de sa ligne d'explication.
Même icône, même place, même libellé d'accessibilité dans les deux modes.

`chosen` est **ce que nous avons demandé**, jamais l'état du système : aucune API ne dit d'où
sort le son, sur aucune des deux plateformes (N1). L'icône est fixe (`volume-high`) — une icône
de casque affichée pendant que le son sort du haut-parleur serait exactement le mensonge
d'interface qu'on veut éviter.

La ligne d'explication est le seul moment où l'utilisateur apprend ce qu'il vient de faire :
un choix manuel **désarme la bascule automatique** pour le reste de la séance.

- [ ] **Step 1 : ajouter les sept clés dans les sept locales**

| Clé | `en` | `fr` |
|---|---|---|
| `call.output.bluetooth` | `Bluetooth` | `Bluetooth` |
| `call.output.headset` | `Wired headset` | `Casque filaire` |
| `call.output.speaker` | `Speaker` | `Haut-parleur` |
| `call.output.earpiece` | `Earpiece` | `Écouteur` |
| `call.audioOutput` | `Audio output` | `Sortie audio` |
| `call.outputFollowsDevice` | `Sound follows the device you plug in` | `Le son suit l'appareil que vous branchez` |
| `call.outputManualUntilEnd` | `Sound will no longer follow a plugged-in device for the rest of this meeting` | `Le son ne suivra plus l'appareil branché pour le reste de la réunion` |

| Clé | `es` | `it` |
|---|---|---|
| `call.output.bluetooth` | `Bluetooth` | `Bluetooth` |
| `call.output.headset` | `Auriculares con cable` | `Auricolari con filo` |
| `call.output.speaker` | `Altavoz` | `Altoparlante` |
| `call.output.earpiece` | `Auricular` | `Ricevitore` |
| `call.audioOutput` | `Salida de audio` | `Uscita audio` |
| `call.outputFollowsDevice` | `El sonido sigue al dispositivo que conecte` | `L'audio segue il dispositivo che colleghi` |
| `call.outputManualUntilEnd` | `El sonido ya no seguirá al dispositivo conectado durante el resto de la reunión` | `L'audio non seguirà più il dispositivo collegato per il resto della riunione` |

| Clé | `de` |
|---|---|
| `call.output.bluetooth` | `Bluetooth` |
| `call.output.headset` | `Kabelgebundenes Headset` |
| `call.output.speaker` | `Lautsprecher` |
| `call.output.earpiece` | `Hörmuschel` |
| `call.audioOutput` | `Audioausgabe` |
| `call.outputFollowsDevice` | `Der Ton folgt dem angeschlossenen Gerät` |
| `call.outputManualUntilEnd` | `Der Ton folgt für den Rest dieser Besprechung keinem angeschlossenen Gerät mehr` |

| Clé | `vi` |
|---|---|
| `call.output.bluetooth` | `Bluetooth` |
| `call.output.headset` | `Tai nghe có dây` |
| `call.output.speaker` | `Loa ngoài` |
| `call.output.earpiece` | `Loa thoại` |
| `call.audioOutput` | `Đầu ra âm thanh` |
| `call.outputFollowsDevice` | `Âm thanh đi theo thiết bị bạn cắm vào` |
| `call.outputManualUntilEnd` | `Âm thanh sẽ không còn đi theo thiết bị được cắm vào trong phần còn lại của cuộc họp` |

| Clé | `ru` |
|---|---|
| `call.output.bluetooth` | `Bluetooth` |
| `call.output.headset` | `Проводная гарнитура` |
| `call.output.speaker` | `Динамик` |
| `call.output.earpiece` | `Разговорный динамик` |
| `call.audioOutput` | `Вывод звука` |
| `call.outputFollowsDevice` | `Звук следует за подключаемым устройством` |
| `call.outputManualUntilEnd` | `Звук больше не будет следовать за подключённым устройством до конца встречи` |

- [ ] **Step 2 : écrire les tests qui échouent**

`src/screens/room/audioOutputControl.spec.tsx` :

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import { AudioOutputControl } from './audioOutputControl';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// Voir `cameraMenu.spec.tsx` : sans `animation.scale` à zéro et sans le vidage
// d'une frame avant l'appui, l'ouverture du menu est instable sous Jest.
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

async function settleMenus(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

describe('AudioOutputControl, mode système', () => {
  it('ouvre le sélecteur de la plateforme sans monter de menu', async () => {
    // Sur iOS, `getAudioOutputs()` est une constante à deux entrées qui ne sont
    // pas des catégories : il n'y a rien à lire et rien à peupler.
    const onSystemPicker = jest.fn();
    const onOpen = jest.fn();

    await render(
      withPaper(
        <AudioOutputControl
          mode="system"
          outputs={['bluetooth', 'speaker']}
          chosen={null}
          onOpen={onOpen}
          onSelect={jest.fn()}
          onSystemPicker={onSystemPicker}
        />,
      ),
    );

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    expect(onSystemPicker).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.queryByTestId('audio-output-option-speaker')).toBeNull();
    expect(screen.queryByTestId('audio-output-note')).toBeNull();
  });
});

describe('AudioOutputControl, mode menu', () => {
  it("demande une relecture à l'ouverture, jamais au montage", async () => {
    const onOpen = jest.fn();

    await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen={null}
          onOpen={onOpen}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );
    expect(onOpen).not.toHaveBeenCalled();

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("n'ouvre pas le sélecteur système en mode menu", async () => {
    // L'autre borne du mode : sans elle, un composant qui appellerait les deux
    // rappels passerait le test du mode système.
    const onSystemPicker = jest.fn();

    await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={onSystemPicker}
        />,
      ),
    );

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    expect(onSystemPicker).not.toHaveBeenCalled();
  });

  it('envoie la catégorie pressée, pas la première de la liste', async () => {
    // Deux catégories, jamais une seule, et la seconde visée.
    const onSelect = jest.fn();

    await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen={null}
          onOpen={jest.fn()}
          onSelect={onSelect}
          onSystemPicker={jest.fn()}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-option-speaker'));

    expect(onSelect).toHaveBeenCalledWith('speaker');
    expect(onSelect).not.toHaveBeenCalledWith('bluetooth');
  });

  it('coche ce que nous avons demandé, et rien avant un choix', async () => {
    // La coche marque notre propre choix, jamais l'état du système : aucune
    // API ne dit d'où sort le son.
    const view = await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-bluetooth')).toBeNull();
    expect(screen.queryByTestId('audio-output-check-speaker')).toBeNull();

    await view.rerender(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen="speaker"
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );

    await waitFor(() => expect(screen.getByTestId('audio-output-check-speaker')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-bluetooth')).toBeNull();
  });

  it("change la ligne d'explication après un choix", async () => {
    // C'est la seule occasion qu'a l'utilisateur d'apprendre qu'il vient de
    // désarmer la bascule automatique pour le reste de la séance.
    const view = await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('audio-output-note')).toHaveTextContent('call.outputFollowsDevice'),
    );

    await view.rerender(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={['bluetooth', 'speaker']}
          chosen="speaker"
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );

    await waitFor(() =>
      expect(screen.getByTestId('audio-output-note')).toHaveTextContent(
        'call.outputManualUntilEnd',
      ),
    );
  });

  it("s'ouvre sur sa seule explication quand la liste est vide", async () => {
    // Rien n'a échoué : `getAudioOutputs()` rend `[]` tant que la session audio
    // n'est pas ouverte. Pas d'erreur à afficher.
    await render(
      withPaper(
        <AudioOutputControl
          mode="menu"
          outputs={[]}
          chosen={null}
          onOpen={jest.fn()}
          onSelect={jest.fn()}
          onSystemPicker={jest.fn()}
        />,
      ),
    );

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-note')).toBeTruthy());
  });
});
```

- [ ] **Step 3 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/audioOutputControl`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 4 : implémenter**

`src/screens/room/audioOutputControl.tsx` :

```tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { IconButton, Menu, Text } from 'react-native-paper';

import type { AudioRouteControl } from 'src/call/audioRoute';
import { audioOutputNameKey, type AudioOutputKind } from 'src/call/devices';
import { BAR_HIT_SLOP, BAR_ICON_COLOR, barStyles } from 'src/screens/room/controlBar';

export type AudioOutputControlProps = {
  readonly mode: AudioRouteControl;
  readonly outputs: readonly AudioOutputKind[];
  // Ce que *nous* avons demandé pendant cette séance, jamais l'état du système
  // — il n'est lisible sur aucune des deux plateformes.
  readonly chosen: AudioOutputKind | null;
  readonly onOpen: () => void;
  readonly onSelect: (kind: AudioOutputKind) => void;
  readonly onSystemPicker: () => void;
};

export function AudioOutputControl({
  mode,
  outputs,
  chosen,
  onOpen,
  onSelect,
  onSystemPicker,
}: AudioOutputControlProps): React.ReactElement {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  // Même icône, même place, même libellé d'accessibilité dans les deux modes :
  // cohérent en surface, honnête en profondeur. L'icône est fixe — une icône de
  // casque affichée pendant que le son sort du haut-parleur serait un mensonge
  // d'interface, et rien ne permet de savoir d'où il sort.
  const button = (onPress: () => void): React.ReactElement => (
    <IconButton
      testID="audio-output-btn"
      icon="volume-high"
      iconColor={BAR_ICON_COLOR}
      style={barStyles.button}
      hitSlop={BAR_HIT_SLOP}
      onPress={onPress}
      accessibilityLabel={t('call.audioOutput')}
    />
  );

  // Sur iOS il n'y a rien à peupler : `getAudioOutputs()` y est une constante à
  // deux entrées qui ne sont pas des catégories. Le seul recours est le
  // sélecteur de la plateforme, dont on ne contrôle ni l'apparence ni les
  // libellés — et dont rien ne dit s'il est apparu.
  if (mode === 'system') return button(onSystemPicker);

  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchorPosition="top"
      contentStyle={barStyles.menuContent}
      anchor={button(() => {
        setVisible(true);
        // La liste est relue à l'ouverture, et à ce moment seulement : Android
        // n'émet aucun événement de changement de périphérique.
        onOpen();
      })}
    >
      <View>
        {/* Secondaire par la taille, jamais par un gris. C'est la seule
            occasion qu'a l'utilisateur d'apprendre qu'un choix manuel désarme
            la bascule automatique pour le reste de la séance. */}
        <Text testID="audio-output-note" variant="labelSmall" style={barStyles.menuNote}>
          {chosen === null ? t('call.outputFollowsDevice') : t('call.outputManualUntilEnd')}
        </Text>
      </View>
      {outputs.map((kind) => (
        <Menu.Item
          key={kind}
          testID={`audio-output-option-${kind}`}
          titleStyle={barStyles.menuTitle}
          leadingIcon={
            kind === chosen
              ? () => <View testID={`audio-output-check-${kind}`} style={barStyles.check} />
              : undefined
          }
          title={t(audioOutputNameKey(kind))}
          onPress={() => {
            setVisible(false);
            onSelect(kind);
          }}
        />
      ))}
    </Menu>
  );
}
```

- [ ] **Step 5 : lancer les tests**

Run : `npx jest src/screens/room/audioOutputControl && npx jest src/i18n`
Attendu : PASSE (7 cas, `src/i18n/index.spec.ts` vert).

- [ ] **Step 6 : éprouver par mutation**

1. Remplacer `onSelect(kind)` par `onSelect('bluetooth')` — le test « envoie la catégorie
   pressée » doit rougir.
2. Retirer la sortie anticipée `if (mode === 'system')` — le test du mode système doit rougir
   (le menu monterait, et `onSystemPicker` ne serait pas appelé).
3. Remplacer `button(onSystemPicker)` par `button(onOpen)` — le test du mode système doit
   rougir sur les deux assertions de rappel.
4. Remplacer la condition de la note par la seule branche `call.outputFollowsDevice` — le test
   de la ligne d'explication doit rougir.
5. Remplacer la condition de `leadingIcon` par `true` — le test de la coche doit rougir.

Restaurer après chaque.

- [ ] **Step 7 : commit**

```bash
git add src/screens/room/audioOutputControl.tsx src/screens/room/audioOutputControl.spec.tsx src/i18n/locales
git commit -m "feat(call): Let the sound be chosen, and say what cannot be known"
```

---

### Task 6 : la rangée à sept cibles, et le retrait de `switch-camera`

**Files:**
- Modify: `src/screens/room/call.tsx`
- Modify: `src/call/media.ts`
- Modify: `src/call/media.spec.ts`
- Modify: `src/screens/room/call.spec.tsx`
- Modify: les sept fichiers de `src/i18n/locales/`

**Interfaces:**
- Consumes: `BAR_HIT_SLOP`, `BAR_ICON_COLOR`, `barStyles` de `src/screens/room/controlBar`
  (Task 4)
- Produces: une barre à cinq boutons à la géométrie définitive, prête à en recevoir deux de
  plus. `switchCamera` n'existe plus dans `src/call/media.ts`.

C'est ce retrait qui rend le périmètre implantable : sans lui, la rangée porterait huit cibles,
ce qui ne tient sur aucun téléphone supporté. La fonction de `switch-camera` est un
sous-ensemble strict du menu caméra — « Caméra arrière » **est** la destination de la bascule —
et sa bascule binaire ignore trois caméras sur cinq sur un iPhone Pro.

**Ce qui est perdu, nommé** : le retournement passe d'un appui à deux. C'est le geste le plus
fréquent sur téléphone, et il devient plus lent. Ce qui le trancherait autrement serait une
mesure d'usage réel ; nous n'en avons pas, et la contrainte de largeur, elle, est arithmétique.

Après cette tâche, l'écran n'a plus de commande de caméra : c'est temporaire, et la Task 7 la
rend. Chaque commit reste vert.

- [ ] **Step 1 : écrire les tests qui échouent**

Dans `src/screens/room/call.spec.tsx` :

Supprimer les deux tests qui reposent sur `switch-camera` — « porte la face courante de la
caméra jusqu'au miroir de sa propre image » et « repart de la face renvoyée par le module
média ». La Task 7 rend une couverture équivalente par le menu caméra.

Retirer `jest.spyOn(media, 'switchCamera').mockResolvedValue('environment');` du `beforeEach`.

Dans le test « expose la barre de contrôle une fois connecté », **supprimer** la ligne
`expect(screen.getByTestId('switch-camera')).toBeTruthy();`, et ajouter à la suite de ce test
celui-ci :

```tsx
  it("n'expose plus la bascule binaire de caméra", async () => {
    // Sa fonction est un sous-ensemble strict du menu caméra, sa bascule
    // ignore trois caméras sur cinq sur un iPhone Pro, et sans ce retrait la
    // rangée porterait huit cibles — ce qui ne tient sur aucun téléphone
    // supporté.
    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    expect(screen.queryByTestId('switch-camera')).toBeNull();
  });
```

Dans `src/call/media.spec.ts` : supprimer le `describe('switchCamera', …)` entier (cinq cas) et
retirer `switchCamera` de l'import. **Rien d'autre.** `mockRestartTrack` reste utilisé par
`roomWithCamera`, et `roomWithCamera` par les `describe` de `setMicrophoneEnabled` et de
`setCameraEnabled` : aucune déclaration ne devient orpheline, donc aucun `no-unused-vars`.

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/call`
Attendu : ÉCHEC — `switch-camera` est encore rendu.

- [ ] **Step 3 : retirer `switchCamera` du module média**

Dans `src/call/media.ts` : supprimer la fonction `switchCamera` et, avec elle, l'import
`import { Track } from 'livekit-client';` devenu inutile. Conserver
`import type { Room } from 'livekit-client';`, `FacingMode`, `setMicrophoneEnabled`,
`setCameraEnabled`, et les trois fonctions de la Task 3.

`FacingMode` reste exporté : `src/call/layout.ts` et `src/screens/room/call.tsx` en dépendent.

- [ ] **Step 4 : appliquer la géométrie dans `call.tsx`**

Ajouter l'import :

```tsx
import { BAR_HIT_SLOP, BAR_ICON_COLOR, barStyles } from 'src/screens/room/controlBar';
```

Retirer `switchCamera` de l'import de `src/call/media`, et supprimer `handleSwitchCamera`.

Remplacer l'entrée `controls` du `StyleSheet.create` et ajouter `cameraGroup` :

```tsx
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    // 8 dp entre groupes, 4 dp de marge de rangée : c'est ce qui fait tenir
    // sept cibles de 44 dp sur 357 dp, donc sur un écran de 360.
    gap: tokens.spacing.sm,
    padding: tokens.spacing.xs,
  },
  // 1 dp à l'intérieur de la paire caméra : elle se lit comme une paire, ce que
  // le web obtient avec `gap: '1px'`.
  cameraGroup: { flexDirection: 'row', alignItems: 'center', gap: 1 },
```

Supprimer le bloc `<IconButton testID="switch-camera" … />`, et poser sur les cinq
`IconButton` restants `style={barStyles.button}`, `hitSlop={BAR_HIT_SLOP}` et
`iconColor={BAR_ICON_COLOR}` — sauf `leave-btn`, qui garde `tokens.color.dangerDark` :

```tsx
      <View style={styles.controls}>
        <IconButton
          testID="mic-toggle"
          icon={micOn ? 'microphone' : 'microphone-off'}
          iconColor={BAR_ICON_COLOR}
          style={barStyles.button}
          hitSlop={BAR_HIT_SLOP}
          onPress={handleToggleMic}
          accessibilityLabel={t('call.muted')}
        />
        {/* La paire caméra : la bascule et, en Task 7, le chevron qui lui colle. */}
        <View style={styles.cameraGroup}>
          <IconButton
            testID="camera-toggle"
            icon={cameraOn ? 'video' : 'video-off'}
            iconColor={BAR_ICON_COLOR}
            style={barStyles.button}
            hitSlop={BAR_HIT_SLOP}
            onPress={handleToggleCamera}
            accessibilityLabel={t('prejoin.cameraOff')}
          />
        </View>
        <IconButton
          testID="share-btn"
          icon="share-variant"
          iconColor={BAR_ICON_COLOR}
          style={barStyles.button}
          hitSlop={BAR_HIT_SLOP}
          onPress={handleShare}
          accessibilityLabel={t('call.share')}
        />
        <IconButton
          testID="participants-toggle"
          icon="account-multiple"
          iconColor={BAR_ICON_COLOR}
          style={barStyles.button}
          hitSlop={BAR_HIT_SLOP}
          onPress={handleToggleParticipants}
          accessibilityLabel={t('participants.title')}
        />
        <IconButton
          testID="leave-btn"
          icon="phone-hangup"
          // La variante sombre : #C62828 sur #0B0B0C tombe à 3,4:1, sous le
          // seuil WCAG AA, et la scène est sombre dans les deux schémas.
          iconColor={tokens.color.dangerDark}
          style={barStyles.button}
          hitSlop={BAR_HIT_SLOP}
          onPress={handleLeave}
          accessibilityLabel={t('call.leave')}
        />
      </View>
```

- [ ] **Step 5 : retirer `call.switchCamera` des sept locales**

Supprimer la ligne `"call.switchCamera": …` de `en`, `fr`, `es`, `it`, `de`, `vi` et `ru`.
`src/i18n/index.spec.ts` échoue si elle n'est retirée que d'une partie d'entre elles.

- [ ] **Step 6 : lancer la suite complète**

```bash
npm test && npm run typecheck && npm run lint
```

Attendu : tout vert. `typecheck` est ce qui prouve que `switchCamera` n'a plus d'appelant.

- [ ] **Step 7 : éprouver par mutation**

Remettre le bloc `<IconButton testID="switch-camera" …/>` — le test « n'expose plus la bascule
binaire de caméra » doit rougir. Restaurer.

Remettre `"call.switchCamera"` dans le seul `en.json` — `src/i18n/index.spec.ts` doit rougir.
Restaurer.

- [ ] **Step 8 : commit**

```bash
git add src/screens/room/call.tsx src/screens/room/call.spec.tsx src/call/media.ts src/call/media.spec.ts src/i18n/locales
git commit -m "refactor(call): Fit seven targets on one row, and drop the binary flip"
```

---

### Task 7 : câbler le menu caméra dans la séance

**Files:**
- Modify: `src/screens/room/call.tsx`
- Test: `src/screens/room/call.spec.tsx`
- Modify: les sept fichiers de `src/i18n/locales/`

**Interfaces:**
- Consumes: `CameraChoice` de `src/call/devices` (Task 1) ; `listCameras`, `selectCamera`,
  `readActiveCameraId` de `src/call/media` (Task 3) ; `CameraMenu` de
  `src/screens/room/cameraMenu` (Task 4), avec ses testIDs `camera-menu-btn`,
  `camera-option-<deviceId>`, `camera-check-<deviceId>`
- Produces : le `Snackbar` partagé s'appelle désormais `notice`, son testID `call-notice`.
  La Task 8 s'appuie sur `withPaper` introduit ici.

Le `Snackbar` du périmètre B est **réutilisé, pas dupliqué** : deux Snackbars se
superposeraient au même endroit de l'écran. Le changement est un renommage, pas une refonte —
une seule case d'erreur suffisait pour trois actions de modération qui ne partent qu'un geste à
la fois ; elle suffit pour cinq.

L'état local n'avance **que sur un vrai succès**, comme `handleToggleMic` : l'interface ne doit
jamais annoncer une caméra qui n'est pas celle qui filme.

- [ ] **Step 1 : ajouter `call.deviceSwitchFailed` dans les sept locales**

| Locale | Valeur |
|---|---|
| `en` | `Could not switch camera` |
| `fr` | `Impossible de changer de caméra` |
| `es` | `No se pudo cambiar de cámara` |
| `it` | `Impossibile cambiare fotocamera` |
| `de` | `Kamera konnte nicht gewechselt werden` |
| `vi` | `Không thể đổi máy ảnh` |
| `ru` | `Не удалось переключить камеру` |

- [ ] **Step 2 : préparer `call.spec.tsx`**

Ajouter les imports en tête :

```tsx
import { PaperProvider } from 'react-native-paper';

import type { CameraChoice } from 'src/call/devices';
```

Ajouter l'enveloppe et les fixtures, après `grantedAccess` :

```tsx
// `CameraMenu` monte son contenu dans un `Portal`, qui jette sans
// `PaperProvider` ancêtre. `animation.scale` à zéro ramène à zéro la durée de
// l'animation de fermeture que `Menu` lance au montage — sans quoi son rappel
// de fin, qui remet `rendered` à faux, tombe 250 ms plus tard et annule
// l'ouverture. Tous les rendus de ce fichier passent par ici, y compris ceux
// qui n'ouvrent aucun menu : une seule voie vaut mieux que deux, et
// l'enveloppement de tous les rendus existants a été vérifié sans régression.
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

// Même à durée nulle, ce rappel part sur un `requestAnimationFrame` : sous Jest,
// `NativeAnimatedModule` est absent et `Animated` retombe sur son moteur
// JavaScript. Appelé avant chaque appui qui **ouvre** un menu — après le rendu
// comme après une fermeture, qui arme exactement le même rappel. Mesuré : 39
// ouvertures sur 40 sans ce vidage, 300 sur 300 avec.
async function settleMenus(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

const FRONT_CAMERA: CameraChoice = {
  deviceId: 'cam-front',
  facing: 'user',
  nameKey: 'call.cameraFront',
  ordinal: null,
};

const BACK_CAMERA: CameraChoice = {
  deviceId: 'cam-back',
  facing: 'environment',
  nameKey: 'call.cameraBack',
  ordinal: null,
};

const UNKNOWN_CAMERA: CameraChoice = {
  deviceId: 'cam-unknown',
  facing: 'unknown',
  nameKey: 'call.cameraUnknown',
  ordinal: null,
};
```

Remplacer **toutes** les occurrences de `render(<CallScreen />)` par
`render(withPaper(<CallScreen />))`, sans exception — y compris dans les tests qui n'ouvrent
aucun menu. L'opération a été vérifiée mécaniquement : les tests existants restent tous verts
une fois enveloppés.

Ajouter au `beforeEach`, à la suite des espions de `media` :

```tsx
  jest.spyOn(media, 'listCameras').mockResolvedValue([]);
  jest.spyOn(media, 'readActiveCameraId').mockReturnValue(null);
  jest.spyOn(media, 'selectCamera').mockResolvedValue(true);
```

Renommer les assertions du Snackbar : les neuf occurrences de `'moderation-error'` — dans
`screen.getByTestId` comme dans `screen.queryByTestId` — deviennent `'call-notice'`.

- [ ] **Step 3 : écrire les tests qui échouent**

Ajouter un `describe` en fin de `call.spec.tsx` :

```tsx
describe('CallScreen, choix de la caméra', () => {
  it("relit la liste et la caméra en service à l'ouverture du chevron, jamais avant", async () => {
    // Aucun abonnement, aucun sondage : `MediaDevicesChanged` ne se déclenche
    // jamais sur mobile, et rien d'autre ne notifie. L'ouverture est le seul
    // instant où une lecture est utile.
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());
    expect(media.listCameras).not.toHaveBeenCalled();
    expect(media.readActiveCameraId).not.toHaveBeenCalled();

    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(media.listCameras).toHaveBeenCalledTimes(1));
    expect(media.readActiveCameraId).toHaveBeenCalledWith(mockRoom);
  });

  it('demande la caméra pressée, jamais la première de la liste', async () => {
    // Deux caméras, jamais une seule, et la seconde visée : avec une seule,
    // « transmet le deviceId reçu » et « envoie toujours le même » seraient
    // indiscernables. `cam-back` ne ressemble ni à `r-1` (le salon) ni à `me`
    // (l'identité LiveKit locale).
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));

    await waitFor(() => expect(media.selectCamera).toHaveBeenCalledWith(mockRoom, 'cam-back'));
  });

  it('coche la caméra que le SDK dit en service, pas la première de la liste', async () => {
    // Deux caméras, jamais une seule, et la seconde désignée comme active :
    // avec une seule, « transmet ce que rend `readActiveCameraId` » et
    // « coche toujours la première » seraient indiscernables. C'est aussi ce
    // qui prouve que la lecture est bien câblée jusqu'à la prop du menu.
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);
    jest.spyOn(media, 'readActiveCameraId').mockReturnValue('cam-back');

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());
    await settleMenus();

    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(screen.getByTestId('camera-check-cam-back')).toBeTruthy());
    expect(screen.queryByTestId('camera-check-cam-front')).toBeNull();
  });

  it("porte la face de la caméra retenue jusqu'au miroir de sa propre image", async () => {
    // La face vit dans l'état de l'écran, le miroir se décide dans la
    // sélection : si l'écran ne prend pas la face du `CameraChoice` retenu, sa
    // propre image reste retournée après le passage en caméra arrière, et tout
    // ce qu'elle filme devient illisible.
    mockCameraPublication = { trackSid: 'ts-me', source: 'camera', isMuted: false, track: {} };
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(VideoTrack).toHaveBeenCalled());
    expect(jest.mocked(VideoTrack).mock.lastCall?.[0].mirror).toBe(true);

    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));

    await waitFor(() => expect(jest.mocked(VideoTrack).mock.lastCall?.[0].mirror).toBe(false));
  });

  it("ne touche pas au miroir quand la face de la caméra retenue est indéterminée", async () => {
    // iOS peut rendre "unknown" pour une caméra externe. `FacingMode` n'a pas
    // de miroir défini pour elle : la face précédente reste en vigueur, plutôt
    // que de retourner l'image sur une valeur qui ne veut rien dire.
    mockCameraPublication = { trackSid: 'ts-me', source: 'camera', isMuted: false, track: {} };
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, UNKNOWN_CAMERA]);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(VideoTrack).toHaveBeenCalled());
    expect(jest.mocked(VideoTrack).mock.lastCall?.[0].mirror).toBe(true);

    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-unknown')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('camera-option-cam-unknown'));

    await waitFor(() => expect(media.selectCamera).toHaveBeenCalledWith(mockRoom, 'cam-unknown'));
    expect(jest.mocked(VideoTrack).mock.lastCall?.[0].mirror).toBe(true);
  });

  it('annonce le repli silencieux quand le SDK rend false', async () => {
    // Sur Android, un `deviceId` invalide retombe sur le `facingMode` sans
    // rien dire : sans ce message, l'appui semble n'avoir servi à rien.
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);
    jest.spyOn(media, 'selectCamera').mockResolvedValue(false);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.deviceSwitchFailed');
    });
  });

  it('annonce aussi le rejet, qui est le second canal', async () => {
    // `switchActiveDevice` jette si `setDeviceId` jette. Un `.catch()` seul ne
    // verrait pas le premier canal ; ne lire que le booléen ne verrait pas
    // celui-ci.
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);
    jest.spyOn(media, 'selectCamera').mockRejectedValue(new Error('contrainte impossible'));

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));

    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.deviceSwitchFailed');
    });
  });

  it("efface le message quand l'essai suivant réussit", async () => {
    // Même règle que les actions de modération : un succès efface l'échec
    // précédent. Sans ce test, remplacer `setNotice(null)` par un no-op
    // laisserait les précédents verts.
    jest.spyOn(media, 'listCameras').mockResolvedValue([FRONT_CAMERA, BACK_CAMERA]);
    const select = jest.spyOn(media, 'selectCamera');
    select.mockResolvedValueOnce(false);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-back')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('camera-option-cam-back'));
    await waitFor(() => {
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.deviceSwitchFailed');
    });

    select.mockResolvedValueOnce(true);
    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));
    await waitFor(() => expect(screen.getByTestId('camera-option-cam-front')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('camera-option-cam-front'));

    await waitFor(() => expect(screen.queryByTestId('call-notice')).toBeNull());
  });

  it("n'affiche rien quand l'énumération échoue, et ouvre un menu vide", async () => {
    // Un message d'erreur pour une liste que l'utilisateur vient tout juste de
    // demander à voir n'aide personne à agir, et le chevron ne peut pas être
    // désactivé.
    jest.spyOn(media, 'listCameras').mockRejectedValue(new Error('énumération refusée'));

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('camera-menu-btn')).toBeTruthy());

    await settleMenus();
    await fireEvent.press(screen.getByTestId('camera-menu-btn'));

    await waitFor(() => expect(media.listCameras).toHaveBeenCalled());
    expect(screen.queryByTestId('call-notice')).toBeNull();
    expect(screen.getByTestId('camera-menu-btn')).toBeTruthy();
  });
});
```

- [ ] **Step 4 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/call`
Attendu : ÉCHEC — `camera-menu-btn` introuvable.

- [ ] **Step 5 : implémenter**

Dans `src/screens/room/call.tsx` :

Ajouter aux imports :

```tsx
import type { CameraChoice } from 'src/call/devices';
import {
  listCameras,
  readActiveCameraId,
  selectCamera,
  setCameraEnabled,
  setMicrophoneEnabled,
  type FacingMode,
} from 'src/call/media';
import { CameraMenu } from 'src/screens/room/cameraMenu';
```

Étendre `MessageKey` :

```tsx
type MessageKey =
  | 'error.network'
  | 'error.unauthorized'
  | 'call.ended'
  | 'call.permissionsDenied'
  | 'call.deviceSwitchFailed';
```

Renommer l'état du Snackbar — `moderationError` devient `notice`, `setModerationError` devient
`setNotice` — et mettre à jour le commentaire qui le précède ainsi que les quatre gestionnaires
de modération. Le `Snackbar` en fin de rendu :

```tsx
      {/* Toujours montée, comme le veut l'exemple de `react-native-paper` :
          seul `visible` bascule. Une seule case pour cinq actions — modération
          et changement de caméra — qui ne partent qu'un geste à la fois. Deux
          Snackbars se superposeraient au même endroit de l'écran. */}
      <Snackbar
        testID="call-notice"
        visible={notice !== null}
        onDismiss={() => setNotice(null)}
      >
        {notice !== null ? t(notice) : ''}
      </Snackbar>
```

Ajouter les deux états, à côté de `facing` :

```tsx
  // Relus à chaque ouverture du menu, et à ce moment seulement : aucun
  // événement de changement de périphérique n'existe sur mobile.
  const [cameras, setCameras] = useState<readonly CameraChoice[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
```

Ajouter les deux gestionnaires, à la place de `handleSwitchCamera` :

```tsx
  // Deux lectures, un seul instant. `listCameras` peut rejeter : un message
  // d'erreur pour une liste que l'utilisateur vient tout juste de demander à
  // voir n'aiderait personne à agir, et le menu s'ouvre vide.
  const handleOpenCameraMenu = (): void => {
    listCameras()
      .then((list) => {
        setCameras(list);
        setActiveCameraId(readActiveCameraId(session.getRoom()));
      })
      .catch(() => undefined);
  };

  // Deux canaux d'échec, les deux traités : le booléen dit qu'Android est
  // retombé sur son repli `facingMode`, le rejet dit que la contrainte a été
  // refusée. L'état local n'avance que sur un vrai succès — même discipline que
  // `handleToggleMic`, qui remet l'icône où elle était quand la commande
  // échoue : l'interface ne doit jamais annoncer une caméra qui n'est pas celle
  // qui filme.
  //
  // Caméra éteinte, le booléen vaut `true` sans rien prouver : c'est correct,
  // la préférence est enregistrée et le prochain `setCameraEnabled(true)` la
  // prendra. Rien à distinguer côté écran.
  const handleSelectCamera = (choice: CameraChoice): void => {
    selectCamera(session.getRoom(), choice.deviceId)
      .then((switched) => {
        if (!switched) {
          setNotice('call.deviceSwitchFailed');
          return;
        }
        setActiveCameraId(choice.deviceId);
        // `'unknown'` n'a pas de miroir défini : la face précédente reste en
        // vigueur plutôt que de retourner l'image sur une valeur qui ne veut
        // rien dire.
        if (choice.facing !== 'unknown') setFacing(choice.facing);
        setNotice(null);
      })
      .catch(() => setNotice('call.deviceSwitchFailed'));
  };
```

Le commentaire de `facing` change : il n'est plus posé par `switchCamera` mais par le
`CameraChoice` retenu.

```tsx
  // Le SDK n'expose pas la face courante d'une piste : c'est l'écran qui la
  // conserve, et il la reprend du `CameraChoice` que le menu lui rend.
  const [facing, setFacing] = useState<FacingMode>('user');
```

Enfin, poser le chevron dans la paire caméra :

```tsx
        <View style={styles.cameraGroup}>
          <IconButton
            testID="camera-toggle"
            icon={cameraOn ? 'video' : 'video-off'}
            iconColor={BAR_ICON_COLOR}
            style={barStyles.button}
            hitSlop={BAR_HIT_SLOP}
            onPress={handleToggleCamera}
            accessibilityLabel={t('prejoin.cameraOff')}
          />
          <CameraMenu
            cameras={cameras}
            activeDeviceId={activeCameraId}
            onOpen={handleOpenCameraMenu}
            onSelect={handleSelectCamera}
          />
        </View>
```

- [ ] **Step 6 : lancer la suite complète**

```bash
npm test && npm run typecheck && npm run lint
```

Attendu : tout vert.

- [ ] **Step 7 : éprouver par mutation**

1. Remplacer `selectCamera(session.getRoom(), choice.deviceId)` par
   `selectCamera(session.getRoom(), 'cam-front')` — « demande la caméra pressée » doit rougir.
2. Retirer la garde `if (!switched)` — « annonce le repli silencieux » doit rougir.
3. Retirer le `.catch()` — « annonce aussi le rejet » doit rougir.
4. Remplacer `if (choice.facing !== 'unknown') setFacing(choice.facing);` par
   `setFacing(choice.facing as FacingMode);` — « ne touche pas au miroir quand la face est
   indéterminée » doit rougir.
5. Retirer entièrement l'appel à `setFacing` — « porte la face de la caméra retenue jusqu'au
   miroir » doit rougir.
6. Remplacer `setNotice(null)` du chemin de succès par un no-op — « efface le message quand
   l'essai suivant réussit » doit rougir.
7. Déplacer `handleOpenCameraMenu()` dans un `useEffect` de montage — « relit la liste à
   l'ouverture, jamais avant » doit rougir.

Restaurer après chaque.

- [ ] **Step 8 : commit**

```bash
git add src/screens/room/call.tsx src/screens/room/call.spec.tsx src/i18n/locales
git commit -m "feat(call): Pick a camera from the meeting, and say when it fails"
```

---

### Task 8 : câbler la sortie audio dans la séance

**Files:**
- Modify: `src/screens/room/call.tsx`
- Test: `src/screens/room/call.spec.tsx`

**Interfaces:**
- Consumes: `audioRouteControl`, `listAudioOutputs`, `selectAudioOutput`,
  `openSystemRoutePicker`, `AudioRouteControl` de `src/call/audioRoute` (Task 2) ;
  `AudioOutputKind` de `src/call/devices` (Task 1) ; `AudioOutputControl` de
  `src/screens/room/audioOutputControl` (Task 5), avec ses testIDs `audio-output-btn`,
  `audio-output-option-<kind>`, `audio-output-check-<kind>`, `audio-output-note` ; `withPaper`
  de `call.spec.tsx` (Task 7)
- Produces: rien qu'une autre tâche consomme. Dernière tâche du périmètre.

Aucun sondage, aucun écouteur, ni sur Android ni sur iOS. Le rapport proposait de sonder
`getAudioOutputs()` périodiquement ; **le sondage n'apporte rien** — il rafraîchirait la liste
de ce qui est *disponible*, jamais de ce qui est *actif*. Même parfait, il ne réduirait pas
l'écart, et on paierait de la batterie pour une information qu'on n'obtient pas. L'écouteur
iOS n'est pas posé non plus : ce qu'il inviterait à relire est une constante.

`chosenOutput` est posé **immédiatement**, pas dans un `.then()` : la promesse native est
résolue avant que le travail ne soit posté sur son handler, et un identifiant inconnu est un
no-op silencieux (N2). Attendre la résolution n'apporterait aucune information supplémentaire ;
l'état enregistre ce qui a été **demandé**, et le menu l'affiche comme tel.

Aucune persistance entre séances : un choix manuel désarme définitivement la bascule
automatique côté Android. Le persister désarmerait la bascule pour toutes les séances
suivantes, sans que personne ne comprenne pourquoi. `stopAudioSession()` au raccrochage rend
son routage à la plateforme.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter les imports en tête de `call.spec.tsx` :

```tsx
import * as audioRoute from 'src/call/audioRoute';
```

Ajouter au `beforeEach`, à la suite des espions de `media` :

```tsx
  // 'menu' par défaut : c'est la branche qui a quelque chose à montrer. Les
  // tests du mode 'system' la surchargent.
  jest.spyOn(audioRoute, 'audioRouteControl').mockReturnValue('menu');
  jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue([]);
  jest.spyOn(audioRoute, 'selectAudioOutput').mockResolvedValue();
  jest.spyOn(audioRoute, 'openSystemRoutePicker').mockResolvedValue();
```

Ajouter un `describe` en fin de fichier :

```tsx
describe('CallScreen, sortie audio', () => {
  it("relit la liste à l'ouverture du menu, jamais avant", async () => {
    // Aucun sondage, aucun écouteur : rafraîchir la liste ne dirait jamais
    // d'où sort le son, seulement ce qui est disponible.
    jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue(['bluetooth', 'speaker']);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    expect(audioRoute.listAudioOutputs).not.toHaveBeenCalled();

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(audioRoute.listAudioOutputs).toHaveBeenCalledTimes(1));
  });

  it('demande la catégorie pressée, jamais la première de la liste', async () => {
    // Deux catégories, jamais une seule, et la seconde visée.
    jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue(['bluetooth', 'speaker']);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-option-speaker'));

    await waitFor(() => expect(audioRoute.selectAudioOutput).toHaveBeenCalledWith('speaker'));
    expect(audioRoute.selectAudioOutput).not.toHaveBeenCalledWith('bluetooth');
  });

  it('coche ce qui a été demandé à la réouverture, et prévient du désarmement', async () => {
    // La coche marque notre propre choix, jamais l'état du système. Et la
    // ligne d'explication est la seule occasion d'apprendre que la bascule
    // automatique vient d'être désarmée pour le reste de la séance.
    jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue(['bluetooth', 'speaker']);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-note')).toHaveTextContent(
      'call.outputFollowsDevice',
    ));
    await fireEvent.press(screen.getByTestId('audio-output-option-speaker'));

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-check-speaker')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-bluetooth')).toBeNull();
    expect(screen.getByTestId('audio-output-note')).toHaveTextContent('call.outputManualUntilEnd');
  });

  it("n'affiche aucun message quand une sortie est choisie", async () => {
    // Il n'existe aucun canal d'échec : afficher un succès serait du bruit,
    // afficher un échec serait une invention.
    jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue(['bluetooth', 'speaker']);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-option-speaker'));

    await waitFor(() => expect(audioRoute.selectAudioOutput).toHaveBeenCalled());
    expect(screen.queryByTestId('call-notice')).toBeNull();
  });

  it("ouvre le sélecteur de la plateforme sur iOS, sans rien lire", async () => {
    // `getAudioOutputs()` y est une constante à deux entrées qui ne sont pas
    // des catégories : il n'y a rien à peupler et rien à relire.
    jest.spyOn(audioRoute, 'audioRouteControl').mockReturnValue('system');

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(audioRoute.openSystemRoutePicker).toHaveBeenCalledTimes(1));
    expect(audioRoute.listAudioOutputs).not.toHaveBeenCalled();
    expect(screen.queryByTestId('audio-output-note')).toBeNull();
  });

  it("n'ouvre pas le sélecteur système en mode menu", async () => {
    // L'autre borne du mode : sans elle, un écran qui appellerait les deux
    // rappels passerait le test précédent.
    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(audioRoute.listAudioOutputs).toHaveBeenCalled());
    expect(audioRoute.openSystemRoutePicker).not.toHaveBeenCalled();
  });

  it("ouvre un menu sur sa seule explication quand la liste est vide", async () => {
    // Rien n'a échoué : pas de message.
    jest.spyOn(audioRoute, 'listAudioOutputs').mockResolvedValue([]);

    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-note')).toBeTruthy());
    expect(screen.queryByTestId('call-notice')).toBeNull();
  });
});
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/call`
Attendu : ÉCHEC — `audio-output-btn` introuvable.

- [ ] **Step 3 : implémenter**

Dans `src/screens/room/call.tsx` :

Ajouter aux imports :

```tsx
import {
  audioRouteControl,
  listAudioOutputs,
  openSystemRoutePicker,
  selectAudioOutput,
} from 'src/call/audioRoute';
import { AudioOutputControl } from 'src/screens/room/audioOutputControl';
```

et **fusionner** l'import de type de `src/call/devices` posé par la Task 7 — un seul par
module, sans quoi le lint refuse le doublon :

```tsx
import type { AudioOutputKind, CameraChoice } from 'src/call/devices';
```

Ajouter les deux états, à la suite de `activeCameraId` :

```tsx
  const [outputs, setOutputs] = useState<readonly AudioOutputKind[]>([]);
  // Ce que *nous* avons demandé pendant cette séance, jamais l'état du système :
  // aucune API ne dit d'où sort le son, sur aucune des deux plateformes. Rien
  // n'est persisté entre deux séances — un choix manuel désarme la bascule
  // automatique côté Android, et le persister la désarmerait pour toujours.
  const [chosenOutput, setChosenOutput] = useState<AudioOutputKind | null>(null);
```

Lire le mode à chaque rendu, à côté de `roomId` :

```tsx
  // Une valeur, pas une lecture de `Platform` par le composant : c'est ce qui
  // permet à une spec de rendre les deux branches sans bouchonner la
  // plateforme.
  const routeControl = audioRouteControl();
```

Ajouter les trois gestionnaires, à la suite de `handleSelectCamera` :

```tsx
  // La liste est relue à chaque ouverture du menu, et à ce moment seulement.
  // Sur Android, entre deux ouvertures, un casque branché ou débranché ne
  // produit aucun changement à l'écran — et rien ne le permettrait : la
  // plateforme n'émet aucun événement, et aucune API ne dit d'où sort le son.
  // La liste est juste dès la réouverture, et le son, lui, a bien suivi.
  const handleOpenAudioOutput = (): void => {
    listAudioOutputs()
      .then(setOutputs)
      .catch(() => undefined);
  };

  // Posé immédiatement, pas dans un `.then()` : la promesse native est résolue
  // avant que le travail ne soit posté sur son handler, et un identifiant
  // inconnu est un no-op silencieux. Attendre n'apprendrait rien de plus.
  // L'état enregistre ce qui a été *demandé*, et le menu l'affiche comme tel —
  // jamais comme un état constaté.
  const handleSelectAudioOutput = (kind: AudioOutputKind): void => {
    setChosenOutput(kind);
    // Aucune branche d'échec, parce qu'il n'en existe aucune : afficher un
    // succès serait du bruit, afficher un échec serait une invention.
    selectAudioOutput(kind).catch(() => undefined);
  };

  // Rien ne dit si le sélecteur de la plateforme est apparu : la méthode native
  // n'a pas de resolver, et elle simule un clic sur une vue jamais insérée dans
  // la hiérarchie. Il n'y a donc rien à lire, et rien à afficher.
  const handleOpenSystemRoutePicker = (): void => {
    openSystemRoutePicker().catch(() => undefined);
  };
```

Poser le contrôle dans la rangée, entre la paire caméra et `share-btn` :

```tsx
        <AudioOutputControl
          mode={routeControl}
          outputs={outputs}
          chosen={chosenOutput}
          onOpen={handleOpenAudioOutput}
          onSelect={handleSelectAudioOutput}
          onSystemPicker={handleOpenSystemRoutePicker}
        />
```

- [ ] **Step 4 : lancer la barre complète**

```bash
npm test && npm run typecheck && npm run lint && npm run format:check
```

Attendu : tout vert.

- [ ] **Step 5 : éprouver par mutation**

1. Remplacer `selectAudioOutput(kind)` par `selectAudioOutput('bluetooth')` — « demande la
   catégorie pressée » doit rougir.
2. Remplacer `setChosenOutput(kind)` par un no-op — « coche ce qui a été demandé à la
   réouverture » doit rougir sur la coche **et** sur la ligne d'explication.
3. Remplacer `mode={routeControl}` par `mode="menu"` en dur — « ouvre le sélecteur de la
   plateforme sur iOS » doit rougir. Puis par `mode="system"` — « n'ouvre pas le sélecteur
   système en mode menu » doit rougir.
4. Déplacer `handleOpenAudioOutput()` dans un `useEffect` de montage — « relit la liste à
   l'ouverture du menu, jamais avant » doit rougir.
5. Ajouter `setNotice('error.network')` dans `handleSelectAudioOutput` — « n'affiche aucun
   message quand une sortie est choisie » doit rougir.

Restaurer après chaque.

- [ ] **Step 6 : commit**

```bash
git add src/screens/room/call.tsx src/screens/room/call.spec.tsx
git commit -m "feat(call): Choose where the sound comes out, without pretending to know"
```

---

## Les trois mesures à faire sur appareil, nommées

Aucune ne bloque la fusion ; toutes les trois bloquent la confiance.

1. **`BLUETOOTH_CONNECT` sur Android 12+.** `app.json` déclare `CAMERA`, `RECORD_AUDIO`,
   `MODIFY_AUDIO_SETTINGS` ; le manifeste de `@livekit/react-native` déclare les permissions
   Bluetooth héritées, pré-API 31. L'AAR `com.github.davidliu:audioswitch` vient de JitPack et
   n'est pas dans `node_modules` : impossible de savoir sans build s'il fusionne
   `BLUETOOTH_CONNECT`. **La question : `getAudioOutputs()` voit-il un casque Bluetooth sans
   demande de permission à l'exécution ?** Si non, `src/call/permissions.ts` gagne une demande
   conditionnelle — c'est le seul endroit qui changerait, et le module existe déjà.
2. **Le sélecteur iOS apparaît-il ?** `showAudioRoutePicker` simule un clic sur un
   `AVRoutePickerView` jamais inséré dans la hiérarchie de vues, et n'a pas de resolver. Si
   non, le contrôle de sortie n'a rien à offrir sur iOS et Q2 se rouvre. Le simulateur ne
   publie ni caméra ni micro : appareil réel obligatoire.
3. **La rangée à sept cibles sur un écran de 360 dp.** L'arithmétique donne 357 dp ; la mesure
   dira si elle tient avec la densité de police du système poussée au maximum.

---

## Ce que ce plan ne fait pas

- **Pas de sélecteur de micro.** Il n'y a rien à sélectionner : Android rend un `audioinput`
  factice libellé « Audio », iOS ne rend que ses micros intégrés, et le `deviceId` audio est
  décoratif sur Android — `createAudioTrack` ne le lit jamais.
- **Pas d'affichage de la sortie audio courante.** Aucune API ne la rend.
  `AudioSwitchManager.selectedAudioDevice()` existe en Java mais n'est pas ponté. L'application
  dit ce qui est disponible et ce qui a été demandé, jamais ce qui est actif.
- **Pas de nom de casque Bluetooth.** Android rend la catégorie `"bluetooth"`, iOS ne rend
  rien. Deux casques appairés se présentent comme une seule entrée.
- **Pas de sondage, pas d'écouteur de branchement.** Ils ne rapporteraient rien qu'on ne sache
  déjà.
- **Pas de persistance entre séances.** Elle désarmerait la bascule automatique pour toujours.
  `react-native-mmkv` est dans les dépendances et n'est pas utilisé ici.
- **Pas de sélecteur au pré-écran.** `getAudioOutputs()` y rend `[]` par construction, et il
  n'y aurait rien à transporter vers la séance puisque rien n'est persisté.
- **Pas d'appel à `configureAudio()`.** Il doit précéder la connexion, donc le levier
  « écouteur par défaut » d'iOS reste hors d'atteinte en séance. L'écouteur reste choisissable
  sur Android, où c'est une entrée de `getAudioOutputs()`, et **pas sur iOS** — la seule
  asymétrie de fond que Q2 ne masque pas.
- **Pas de dépendance nouvelle.** Ni `react-native-avroutepicker`, ni
  `@livekit/components-react`, qui est un paquet web et n'est même pas installé.
- **Pas de retournement en un appui.** Le geste passe à deux appuis, et c'est le coût nommé du
  retrait de `switch-camera`.
- **Pas de réglages audio avancés.** Le web a un onglet « Audio settings » et des effets
  d'arrière-plan derrière ses chevrons. Rien de cela n'est ici, et rien n'en dépend.
- **Aucune vérification sur appareil.** Comme tout le reste de ce socle, ce périmètre est
  validé contre des doubles. Les couleurs ne sont pas rendues sous Jest, la géométrie non plus,
  et les périphériques réels ne sont pas énumérables : les fixtures viennent de la lecture des
  sources natives, pas d'une mesure.
