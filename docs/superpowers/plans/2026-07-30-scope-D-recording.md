# Périmètre D — Enregistrement : plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les
> étapes utilisent des cases à cocher (`- [ ]`).

**But :** en séance, **tout le monde** voit qu'un enregistrement est en cours — y compris qui
rejoint une réunion déjà enregistrée, et y compris quand c'est un participant web qui l'a
démarré ; et un administrateur de salon peut le démarrer et l'arrêter.

**Architecture :** un module **pur** qui dérive l'état, tranche la permission et nomme les
échecs (`src/call/recording.ts`), un module **branché** qui lit la Room et s'abonne
(`src/call/recordingStore.ts`), un module d'API à deux fonctions (`src/api/recording.ts`),
et trois coquilles qui reçoivent leur état : l'indicateur, la commande, et la surface qui
porte la commande. La frontière est celle des périmètres A et B : la décision dans un module
pur et testable, la coquille aussi bête que possible.

**Socle technique :** TypeScript strict, React Native 0.86, Expo SDK 57, react-native-paper
5.15.3, `livekit-client` 2.18.0, Jest + `@testing-library/react-native` 14.

**Source :** `docs/superpowers/specs/2026-07-30-scope-D-recording-design.md`. Les renvois `§n`
y renvoient. Le rapport de terrain sous-jacent est
`.superpowers/sdd/2026-07-30-scope-D-recording.md`, **ignoré par git** : tous les faits dont
l'implémentation dépend ont été recopiés dans la conception, qui se suffit à elle-même.

**Ce plan a été prototypé et exécuté avant d'être écrit.** Les neuf modules, leurs specs, la
modification des sept locales et le câblage de `call.tsx` ont été écrits dans ce worktree,
lancés, puis supprimés. Résultat mesuré : **537 tests verts** (458 avant, 79 ajoutés), `tsc`
propre, `eslint` sans erreur nouvelle, `prettier --check` vert, et **huit mutations éprouvées
rouges**. Le code littéral de ce plan est celui qui a tourné, passé au format Prettier du
dépôt. Ce qui n'a pas été prototypé est nommé en fin de document.

---

## Écarts assumés avec la conception

Cinq points où ce plan ajoute à la conception, ou la corrige. Chacun est mesuré ici, sur cette
branche.

**E1 — Le renommage de §4.6.2 est déjà fait ; il n'y a rien à renommer.**
La conception demande de renommer `moderationError` en `actionError` et le `testID`
`moderation-error` en `action-error`, et chiffre ce coût à « 10 assertions mécaniques ». Sur
cette branche, rebasée sur `main` qui porte les périmètres A et B, la case s'appelle **déjà**
`notice` / `setNotice` (`call.tsx:209`) et son `testID` est **déjà** `call-notice` — renommée
exprès par le périmètre A pour servir cinq actions, et vérifiée : 17 occurrences de
`call-notice` dans `call.spec.tsx`. La modification 2 de §4.6 est donc **sans objet**. On
réutilise `notice` tel quel : **zéro assertion touchée**.

**E2 — La barre est pleine ; ce plan crée la surface qui manque, et y déplace le partage.**
Mesuré dans `controlBar.ts` : `7 × 44 + 1 + 5 × 8 + 2 × 4 = 357 dp` sur un écran de 360. Une
huitième cible demanderait `8 × 44 + 1 + 6 × 8 + 2 × 4 = 409 dp`, et aucun resserrement ne
sauve l'arithmétique (44 dp × 8 = 352 dp de boutons seuls, plus 8 dp de marge de rangée =
360 dp *exactement*, sans un seul espace entre deux cibles). **La commande d'enregistrement ne
rentre pas dans la barre.** §9 renvoyait le placement au périmètre A, qui est fusionné et n'a
pas laissé de place ; la conception du périmètre C propose un panneau derrière un bouton
« plus », mais C n'est pas implémenté.

Ce plan crée donc cette surface sous la forme d'un **menu de dépassement** (`moreMenu.tsx`),
ancré sur un `IconButton` « plus », et y **déplace le partage du lien**. La barre garde
**exactement sept cibles et 357 dp** : le commentaire d'arithmétique de `controlBar.ts` reste
vrai mot pour mot, et aucune autre géométrie ne bouge.

Pourquoi un menu et non un panneau qui remplace la scène : le panneau du périmètre C n'existe
pas, son contenu n'est pas connu, et en inventer un pour une seule commande coûterait un
composant, un troisième terme au ternaire `participantsOpen ? … : …` et une bascule de plus
dans la barre — pour montrer une ligne. Le menu a déjà son précédent exact dans ce dépôt
(`audioOutputControl.tsx` : ancre `IconButton`, `anchorPosition="top"`,
`contentStyle={barStyles.menuContent}`).

Pourquoi le partage plutôt qu'une autre commande : c'est la seule de la rangée qu'on n'utilise
**qu'une fois par réunion**, au tout début. Micro, caméra et sortie audio se manipulent en
continu ; le panneau de participants sert à répondre aux demandes d'entrée et à modérer, à
répétition. Le coût est nommé : **partager passe de un appui à deux**. Le `testID` `share-btn`
ne change pas, et le coût mesuré sur les tests est de **2 assertions** (`call.spec.tsx`,
lignes 432-433 et 447-448), qui ouvrent désormais le menu avant d'appuyer.

Bénéfice non prévu par §9 : la contrainte « le bouton d'enregistrement doit être distinguable
au doigt du bouton quitter, et non adjacent » devient **structurelle**. La commande n'est plus
dans la barre du tout ; elle est deux appuis plus loin, derrière un menu. Deux rouges voisins
ne peuvent plus se produire.

**E3 — `disabled={busy}` de §4.4 contredit `AGENTS.md` ; la règle du dépôt gagne.**
`AGENTS.md` interdit tout bouton `disabled` sur cet écran :
`react-native-paper` teste `disabled` **avant** la couleur passée par l'appelant et rend
`theme.colors.onSurfaceDisabled`, un quasi-noir en schéma clair, sur un fond que `call.tsx`
force sombre dans les deux schémas. Aucune couleur explicite ne le rattrape. Un `Menu.Item`
désactivé suit la même règle (`MenuItem.tsx:154`, `getMenuItemColor`).

Donc : pendant un appel en vol, **la commande n'est pas rendue**. On masque, on ne grise pas —
le précédent est `participantsPanel.tsx`. La fenêtre est celle d'un aller-retour HTTP, l'appui
a de toute façon refermé le menu, et l'indicateur, lui, reste affiché : rien n'est perdu de ce
que l'utilisateur doit savoir. La prop garde son nom `busy`, comme le veut §4.4.

**E4 — La conception ne dit pas où vit la table libellé/phase ; ce plan la met dans le pur.**
§4.4 demande « un libellé par phase, et `recording.transcriptActive` au lieu de
`recording.active` quand `mode === 'transcript'` », sans dire qui décide. Ce plan ajoute
`recordingLabelKey(state)` à `src/call/recording.ts`. Motif : c'est exactement la classe de
défaut que les deux périmètres précédents ont livrée — « le texte affiché n'est jamais
asserté, donc le mauvais champ est invisible ». Une fonction pure la rend éprouvable ligne à
ligne, et la coquille redevient bête. La coquille asserte quand même son texte (§7.1).

**E5 — Pas d'icône dans le menu, et c'est une contrainte de couleur, pas un goût.**
§4.4 demande « icône pleine » pour démarrer et « icône carrée distincte » pour arrêter — un
dessin pensé pour un `IconButton` dans la barre. Dans un `Menu.Item`, `MenuItem.tsx:205` rend
`<Icon source={leadingIcon} … color={iconColor} />` où `iconColor` vient de
`getMenuItemColor`, donc du thème : le quasi-noir du schéma clair sur `surfaceDark`. C'est
pour cette raison exacte que le périmètre A a dû sortir le glyphe de coche de la résolution de
`Menu.Item` (`menuCheck.tsx`, livré cassé deux fois avant d'être extrait). L'identité de la
commande passe donc par **le libellé et sa couleur** : `textDark` pour démarrer,
`dangerDark` (8,62:1) pour arrêter. Ajouter un second glyphe direct créerait un deuxième
endroit à casser pour rien.

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
  Pour tout test qui vérifie qu'une valeur remonte, **installer au moins deux éléments
  distincts et viser le second** : avec un seul, « transmet ce qu'on lui donne » et « rend
  toujours la même valeur en dur » sont indiscernables. Les fixtures de métadonnées de ce
  périmètre portent des statuts **différents** d'un cas à l'autre pour la même raison.
- **Jamais `npm install`, `npm ci` ni `npm add` dans ce worktree.** `node_modules` y est un
  **lien symbolique** vers l'arbre principal (`/Users/mmaudet/work/twake-visio/node_modules`) :
  une installation écrirait dans l'arbre partagé et casserait les autres worktrees. Aucune
  dépendance n'est ajoutée par ce périmètre — `livekit-client` 2.18.0 porte déjà les quatre
  membres utilisés (`RoomEvent.RoomMetadataChanged` `events.d.ts:195`,
  `RoomEvent.RecordingStatusChanged` `:289`, `RoomEvent.Reconnected` `:29`, `Room.metadata` /
  `Room.isRecording` `Room.d.ts:143` / `:134`).

### La couleur : la règle que ce périmètre impose, et ce qu'un test en garde

`src/screens/room/call.tsx:109` force `tokens.color.backgroundDark` **dans les deux schémas**,
alors que le thème Paper suit le schéma système (`src/ui/theme.ts`). Un composant posé sur cet
écran qui ne dit pas sa couleur retombe sur `theme.colors.onSurface` — `#1A1A1A` en schéma
clair — soit **1,08:1** sur ce fond. Invisible. Le périmètre B a livré ce défaut avec tous ses
tests au vert ; le périmètre A a livré sa variante d'ondulation, **1,13:1**, avec tous ses
tests au vert aussi.

**Tout élément visible ajouté par ce périmètre pose une couleur explicite venue de
`src/ui/tokens`, et passe par `src/screens/room/controlBar.ts` quand la barre en porte déjà
une.**

| Élément | Prop | Valeur | Ratio sur le fond visé |
| --- | --- | --- | --- |
| `Text` de l'indicateur | `style` → `color` | `tokens.color.textDark` | **16,66:1** sur `#0B0B0C` |
| `IconButton` « plus » | `iconColor` | `BAR_ICON_COLOR` (`textDark`) | **16,66:1** |
| `IconButton` « plus » | `rippleColor` | `BAR_RIPPLE_COLOR` (`textDark`) | affordance, pas lisibilité |
| `Menu` | `contentStyle` | `barStyles.menuContent` (`surfaceDark`) | surface forcée |
| `Menu.Item` partage / démarrer | `titleStyle` | `barStyles.menuTitle` (`textDark`) | **15,86:1** sur `#121212` |
| `Menu.Item` arrêter | `titleStyle` | `barStyles.menuTitleDanger` (`dangerDark`) | **8,62:1** |
| `Menu.Item` (tous) | `rippleColor` | `BAR_RIPPLE_COLOR` | affordance |

`tokens.color.muted` (`#6B7280`) donne **4,07:1** sur `backgroundDark` et **3,88:1** sur
`surfaceDark` : sous le seuil AA de 4,5:1 dans les deux cas. **Il ne s'utilise nulle part sur
cet écran**, même pour un libellé secondaire. Une hiérarchie se fait par la taille de texte,
jamais par un gris qui échoue au contraste.

Règle de composition, héritée du périmètre A : **on surcharge la surface et le texte, ou ni
l'un ni l'autre.** Un `Menu` laissé entièrement intact serait cohérent avec lui-même ; le
piège n'apparaît qu'en forçant l'un sans l'autre.

**Aucun test ne prouve la lisibilité perçue** : RNTL ne calcule aucun style et ne rend aucun
pixel, donc un contraste ne se mesure qu'en lisant le thème, le fond et le composant ensemble
— ou sur un appareil. **Mais une égalité stricte `toHaveStyle` prouve que la couleur explicite
n'a pas été retirée**, et cette garde-là vaut d'être écrite — voir « Le fond de la séance est
sombre dans les deux schémas. Paper ne le sait pas. » dans `AGENTS.md`.

### Aucun bouton `disabled`, nulle part sur cet écran

`node_modules/react-native-paper/src/components/IconButton/utils.ts:88-93` teste `disabled`
**avant** `customIconColor` et rend `theme.colors.onSurfaceDisabled` — un quasi-noir dans le
thème MD3 **clair**. `getMenuItemColor` fait de même pour le titre d'un `Menu.Item`. Aucune
couleur explicite ne le rattrape.

Donc : **ce qui n'est pas actionnable n'est pas rendu.** On masque une commande indisponible,
on ne la grise pas. Cela vaut pour l'absence de droit (`canStart` faux) comme pour l'appel en
vol (`busy` vrai) — voir E3.

### `ApiResult` : un échec ordinaire est une VALEUR, jamais un rejet

`ApiResult<T>` est `{ ok: true; value } | { ok: false; error }` (`src/api/types.ts:18`). Un
403, un 404, un 409, un 502 arrivent **résolus**, pas rejetés. Le périmètre B a livré deux
bogues sur ce point exact, dont un `.catch()` qui n'attrapait jamais rien ; le commentaire de
`call.tsx:472-479` en garde la trace.

**Toute lecture d'un résultat d'API de ce périmètre passe par `result.ok`**, avec un `.catch()`
**séparé** pour l'exception inattendue. Les deux gestionnaires de la tâche 9 sont écrits en
toutes lettres ; il n'y en a pas d'autres.

### La place dans la barre est un invariant, pas une préférence

`src/screens/room/call.tsx` rend **sept** cibles tactiles dans `styles.controls` : `mic-toggle`,
`camera-toggle`, `camera-menu-btn`, `audio-output-btn`, `share-btn`, `participants-toggle`,
`leave-btn`. Le calcul de `controlBar.ts` (`7 × 44 + 1 + 5 × 8 + 2 × 4 = 357`) est à 3 dp de
la largeur d'un écran de 360. **Aucune tâche de ce plan n'ajoute une huitième cible à cette
rangée** : la tâche 7 en remplace une (voir E2). Si une tâche future doit ajouter une commande,
elle passe par le menu de dépassement.

### Toute spec qui ouvre un `Menu` de Paper — la recette, une seule fois

`Menu.tsx:645` monte son contenu dans un `<Portal>`, qui jette sans `Provider` ancêtre. Et
avec un `PaperProvider` nu, l'ouverture est **instable** sous Jest (mesuré par le périmètre A :
39 ouvertures sur 40). La recette, à recopier telle quelle dans chaque spec qui ouvre un menu —
elle est déjà en tête de `call.spec.tsx`, `cameraMenu.spec.tsx` et `audioOutputControl.spec.tsx` :

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
// JavaScript. À appeler avant chaque appui qui **ouvre** un menu — après le
// rendu comme après une fermeture, qui arme exactement le même rappel.
async function settleMenus(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}
```

et, après l'appui qui ouvre, **toujours** un `waitFor` : le contenu du `Portal` n'est jamais
présent au retour synchrone de `fireEvent.press`. Stabilité mesurée sur ce plan : **12 séries
de 9 ouvertures, 12 vertes**.

### Le mock de traduction

Aucune clé de ce périmètre n'interpole de variable : le mock habituel du dépôt
(`t: (key: string) => key`) suffit, et **chaque test qui affiche un libellé asserte son
contenu** (`toHaveTextContent('recording.saving')`), jamais la seule présence de son `testID`.
Si une tâche future ajoute une clé interpolée, elle doit reprendre le mock de
`waitingBanner.spec.tsx`, qui rend `` `${key}:${options.name}` `` — sans quoi un mauvais champ
interpolé est invisible.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/call/recording.ts` | **pur** : phases, libellés, porte de permission, traduction des échecs. Ni réseau, ni SDK, ni React |
| `src/call/recording.spec.ts` | la machine à états ligne à ligne, éprouvée par mutation |
| `src/call/recordingStore.ts` | branché : lit `Room.metadata` / `Room.isRecording`, s'abonne à trois événements |
| `src/call/recordingStore.spec.ts` | contrat `useSyncExternalStore`, contre un faux `Room` |
| `src/api/recording.ts` | les deux endpoints, `ApiResult`, aucune retraduction d'erreur |
| `src/api/recording.spec.ts` | URL, méthode, corps strict, échecs rendus sans lever |
| `src/screens/room/recordingIndicator.tsx` | coquille : ce que **tout le monde** voit |
| `src/screens/room/recordingIndicator.spec.tsx` | un libellé par phase, asserté par son contenu |
| `src/screens/room/recordingControl.tsx` | coquille : le `Menu.Item` dont l'identité suit la phase |
| `src/screens/room/recordingControl.spec.tsx` | câblage : quel rappel part sur quel appui |
| `src/screens/room/moreMenu.tsx` | la surface qui manquait : bouton « plus », partage, commande |
| `src/screens/room/moreMenu.spec.tsx` | composition et fermeture du menu |
| `src/screens/room/controlBar.ts` (modifié) | gagne `barStyles.menuTitleDanger` |
| `src/screens/room/call.tsx` (modifié) | magasin, indicateur, garde, deux gestionnaires, menu |
| `src/screens/room/call.spec.tsx` (modifié) | le faux `Room` gagne `metadata` / `isRecording` |
| les sept `src/i18n/locales/*.json` (modifiés) | 14 clés, réellement traduites |

---

### Task 1 : les quatre phases, lues dans les métadonnées

**Files:**
- Create: `src/call/recording.ts`
- Test: `src/call/recording.spec.ts`

**Interfaces:**
- Consumes: rien (aucun import de valeur — ni `livekit-client`, ni `react`, ni réseau)
- Produces :
  - `type RecordingMode = 'screen_recording' | 'transcript'`
  - `type RecordingState = { readonly phase: 'idle'; readonly mode: null } | { readonly phase: 'starting' | 'recording' | 'saving' | 'aborted'; readonly mode: RecordingMode | null }`
  - `type RoomRecordingSignal = { readonly metadata: string | undefined; readonly isRecording: boolean }`
  - `deriveRecordingState(signal: RoomRecordingSignal): RecordingState`
  - `type RecordingLabelKey = 'recording.starting' | 'recording.active' | 'recording.transcriptActive' | 'recording.saving' | 'recording.aborted'`
  - `recordingLabelKey(state: RecordingState): RecordingLabelKey | null`

L'état d'un enregistrement **ne se lit dans aucun champ REST** (§2.3) : il vit dans les
métadonnées de salon LiveKit, sous deux clés que le backend fusionne (`recording_mode`,
`recording_status`) et que le webhook `egress_ended` **supprime** en fin de course. Le
vocabulaire est `starting` / `started` / `saving` / `aborted` — jamais celui, interne, du
modèle `Recording`.

Quatre phases, jamais un booléen (§3.7) : `starting` dure plusieurs secondes, et un booléen y
afficherait « pas d'enregistrement », ce qui pousse à appuyer une seconde fois et à récolter un
409 qui se lit comme une application cassée.

`Room.isRecording` n'entre dans la dérivation **que** pour départager `starting` de
`recording` sur le statut `started` — c'est la règle exacte du bundle web déployé, et la
respecter garantit que deux participants d'une même réunion, l'un sur mobile l'autre sur web,
ne voient jamais deux indicateurs contradictoires.

Sur-signaler, jamais sous-signaler : un statut **inconnu** rend `recording` (le web, lui,
l'exclurait). Annoncer un enregistrement qui n'a pas lieu est embarrassant ; taire un
enregistrement qui a lieu est une trahison.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/call/recording.spec.ts` — la partie de ce fichier que cette tâche livre :

```ts
import {
  deriveRecordingState,
  recordingLabelKey,
  type RecordingState,
} from 'src/call/recording';

function meta(fields: Record<string, string>): string {
  return JSON.stringify(fields);
}

describe('deriveRecordingState', () => {
  it('rend idle quand la Room ne porte aucune métadonnée', () => {
    expect(deriveRecordingState({ metadata: undefined, isRecording: false })).toEqual({
      phase: 'idle',
      mode: null,
    });
  });

  it('rend idle sur une métadonnée vide', () => {
    expect(deriveRecordingState({ metadata: '', isRecording: false })).toEqual({
      phase: 'idle',
      mode: null,
    });
  });

  it('rend idle sur une métadonnée qui n’est pas du JSON', () => {
    expect(deriveRecordingState({ metadata: 'pas du json', isRecording: false })).toEqual({
      phase: 'idle',
      mode: null,
    });
  });

  it('rend idle sur un JSON scalaire', () => {
    expect(deriveRecordingState({ metadata: '42', isRecording: false })).toEqual({
      phase: 'idle',
      mode: null,
    });
  });

  it('rend idle sur un JSON tableau', () => {
    expect(deriveRecordingState({ metadata: '[1,2]', isRecording: false })).toEqual({
      phase: 'idle',
      mode: null,
    });
  });

  it('rend idle quand le champ partagé porte autre chose que nos deux clés', () => {
    // `metadata` est une chaîne libre partagée avec d'autres fonctionnalités :
    // le parse est défensif, comme celui du web.
    expect(
      deriveRecordingState({ metadata: meta({ autre_fonctionnalite: 'vrai' }), isRecording: true }),
    ).toEqual({ phase: 'idle', mode: null });
  });

  it('rend starting sur le statut starting', () => {
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'screen_recording', recording_status: 'starting' }),
        isRecording: false,
      }),
    ).toEqual({ phase: 'starting', mode: 'screen_recording' });
  });

  it('rend recording quand started et isRecording concordent', () => {
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'screen_recording', recording_status: 'started' }),
        isRecording: true,
      }),
    ).toEqual({ phase: 'recording', mode: 'screen_recording' });
  });

  it('reste starting quand started arrive avant isRecording', () => {
    // L'egress est accepté mais LiveKit ne l'a pas encore signalé. C'est la
    // règle exacte du bundle déployé : `isRecording` départage le libellé, il
    // ne décide jamais qu'il se passe quelque chose.
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'screen_recording', recording_status: 'started' }),
        isRecording: false,
      }),
    ).toEqual({ phase: 'starting', mode: 'screen_recording' });
  });

  it('rend saving', () => {
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'transcript', recording_status: 'saving' }),
        isRecording: true,
      }),
    ).toEqual({ phase: 'saving', mode: 'transcript' });
  });

  it('rend aborted', () => {
    // L'egress est mort ; le taire rendrait un échec indiscernable d'un
    // non-démarrage.
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'transcript', recording_status: 'aborted' }),
        isRecording: false,
      }),
    ).toEqual({ phase: 'aborted', mode: 'transcript' });
  });

  it('sur-signale un statut inconnu', () => {
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'screen_recording', recording_status: 'quelque_chose' }),
        isRecording: false,
      }),
    ).toEqual({ phase: 'recording', mode: 'screen_recording' });
  });

  it('sur-signale un mode sans statut', () => {
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'transcript' }),
        isRecording: false,
      }),
    ).toEqual({ phase: 'recording', mode: 'transcript' });
  });

  it('signale l’activité sans mentir sur un mode inconnu', () => {
    expect(
      deriveRecordingState({
        metadata: meta({ recording_mode: 'holographie', recording_status: 'starting' }),
        isRecording: false,
      }),
    ).toEqual({ phase: 'starting', mode: null });
  });

  it('rend idle sur un statut sans mode', () => {
    // `egress_ended` supprime les deux clés : l'absence de mode est l'état de
    // repos, quel que soit ce qui reste à côté.
    expect(
      deriveRecordingState({
        metadata: meta({ recording_status: 'started' }),
        isRecording: true,
      }),
    ).toEqual({ phase: 'idle', mode: null });
  });
});

describe('recordingLabelKey', () => {
  const state = (phase: RecordingState['phase'], mode: RecordingState['mode']): RecordingState =>
    ({ phase, mode }) as RecordingState;

  it('ne dit rien au repos', () => {
    expect(recordingLabelKey(state('idle', null))).toBe(null);
  });

  it('annonce le démarrage', () => {
    expect(recordingLabelKey(state('starting', 'screen_recording'))).toBe('recording.starting');
  });

  it('annonce un enregistrement d’écran', () => {
    expect(recordingLabelKey(state('recording', 'screen_recording'))).toBe('recording.active');
  });

  it('annonce une transcription sous son propre nom', () => {
    expect(recordingLabelKey(state('recording', 'transcript'))).toBe('recording.transcriptActive');
  });

  it('annonce la sauvegarde', () => {
    expect(recordingLabelKey(state('saving', 'screen_recording'))).toBe('recording.saving');
  });

  it('annonce l’interruption', () => {
    expect(recordingLabelKey(state('aborted', 'screen_recording'))).toBe('recording.aborted');
  });
});
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/call/recording`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : implémenter**

`src/call/recording.ts` :

```ts
export type RecordingMode = 'screen_recording' | 'transcript';

// Le vocabulaire des métadonnées LiveKit, pas celui du modèle `Recording` du
// backend — lequel n'est jamais exposé au client en séance. `mode` vaut `null`
// quand un enregistrement tourne sous un nom que ce code ne connaît pas : on
// signale l'activité sans mentir sur sa nature.
export type RecordingState =
  | { readonly phase: 'idle'; readonly mode: null }
  | { readonly phase: 'starting'; readonly mode: RecordingMode | null }
  | { readonly phase: 'recording'; readonly mode: RecordingMode | null }
  | { readonly phase: 'saving'; readonly mode: RecordingMode | null }
  | { readonly phase: 'aborted'; readonly mode: RecordingMode | null };

// Les deux seules choses que la Room apporte. Les prendre en paramètres plutôt
// que de lire la Room garde ce module hors du SDK.
export type RoomRecordingSignal = {
  readonly metadata: string | undefined;
  readonly isRecording: boolean;
};

const IDLE: RecordingState = { phase: 'idle', mode: null };

// `metadata` est une chaîne libre, partagée avec d'autres fonctionnalités et
// écrite par un serveur que nous ne contrôlons pas : tout ce qui n'est pas un
// objet JSON est traité comme une absence, jamais comme une erreur.
function readMetadata(metadata: string | undefined): Record<string, unknown> | null {
  if (metadata === undefined || metadata.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function readMode(raw: unknown): RecordingMode | null {
  return raw === 'screen_recording' || raw === 'transcript' ? raw : null;
}

// `isRecording` ne sert qu'à départager `starting` de `recording` sur le statut
// `started` — jamais à décider qu'il se passe quelque chose. C'est la règle
// vérifiée du bundle web déployé : la respecter garantit qu'un participant
// mobile et un participant web ne voient jamais deux indicateurs
// contradictoires, ce qui, sur un signal de consentement, est une valeur en soi.
export function deriveRecordingState(signal: RoomRecordingSignal): RecordingState {
  const metadata = readMetadata(signal.metadata);
  if (metadata === null) return IDLE;

  // `egress_ended` supprime les deux clés : l'absence de mode est l'état de
  // repos.
  const rawMode = metadata['recording_mode'];
  if (typeof rawMode !== 'string') return IDLE;
  const mode = readMode(rawMode);

  const status = metadata['recording_status'];
  if (status === 'starting') return { phase: 'starting', mode };
  if (status === 'saving') return { phase: 'saving', mode };
  if (status === 'aborted') return { phase: 'aborted', mode };
  if (status === 'started') return { phase: signal.isRecording ? 'recording' : 'starting', mode };

  // Sur-signaler, jamais sous-signaler. Le web ferme sa liste de statuts et
  // exclurait un statut inconnu ; nous faisons l'inverse. Annoncer un
  // enregistrement qui n'a pas lieu est embarrassant, taire un enregistrement
  // qui a lieu est une trahison.
  return { phase: 'recording', mode };
}

export type RecordingLabelKey =
  | 'recording.starting'
  | 'recording.active'
  | 'recording.transcriptActive'
  | 'recording.saving'
  | 'recording.aborted';

// La table libellé/phase vit ici, pas dans la coquille : c'est la seule façon
// de l'éprouver ligne à ligne. `null` signifie « rien à afficher », le seul cas
// où l'indicateur ne rend rien.
export function recordingLabelKey(state: RecordingState): RecordingLabelKey | null {
  switch (state.phase) {
    case 'idle':
      return null;
    case 'starting':
      return 'recording.starting';
    case 'recording':
      return state.mode === 'transcript' ? 'recording.transcriptActive' : 'recording.active';
    case 'saving':
      return 'recording.saving';
    case 'aborted':
      return 'recording.aborted';
  }
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx jest src/call/recording`
Attendu : PASSE — 21 tests.

- [ ] **Step 5 : éprouver par mutation**

Remplacer la ligne du statut `started` par `return { phase: 'recording', mode };`. Le test
« reste starting quand started arrive avant isRecording » doit rougir. Restaurer.
Remplacer le sur-signalement final par `return IDLE;`. Les deux tests de sur-signalement
doivent rougir. Restaurer.

- [ ] **Step 6 : commit**

```bash
npx prettier --write src/call/recording.ts src/call/recording.spec.ts
git add src/call/recording.ts src/call/recording.spec.ts
git commit -m "feat(call): Derive the four recording phases from room metadata"
```

---

### Task 2 : la porte de permission, et la traduction d'un échec

**Files:**
- Modify: `src/call/recording.ts`
- Test: `src/call/recording.spec.ts`

**Interfaces:**
- Consumes: `ApiError` de `src/api/types`, `RoomAccess` de `src/call/types`,
  `InstanceFeatures` de `src/instance/types` — **des types seulement**, aucun import de valeur
- Produces :
  - `canStartRecording(features: InstanceFeatures, access: RoomAccess): boolean`
  - `type RecordingAction = 'start' | 'stop'`
  - `type RecordingMessageKey = 'recording.errorBusy' | 'recording.errorNotActive' | 'recording.errorUnavailable' | 'recording.errorForbidden' | 'recording.errorStartFailed' | 'recording.errorStopFailed' | 'error.network' | 'error.unauthorized'`
  - `recordingErrorMessage(action: RecordingAction, error: ApiError): RecordingMessageKey`

`canStartRecording` est **la frontière de divergence `main` / déployé, et la seule** (§3.1).
`meet.linagora.com` fait tourner une PR non fusionnée (#794) dont la permission est
`HasRecordingPermission` — niveau par mode, `"authenticated"` sur cette instance aujourd'hui,
donc **strictement plus large** que `main`. Le garde-fou retenu, `isAdministrable`, vaut
exactement `is_administrator_or_owner`, ce qu'exige `main` et un sous-ensemble de ce
qu'autorise le déployé : **c'est le seul choix valide contre les deux versions du serveur en
même temps**.

> **Arbitrage renversable, et il appartient au partenaire** (§3.2). L'ouvrir consiste à lire
> `recording_permissions` dans la réponse salon — le champ existe déjà sur le déployé,
> `src/api/rooms.ts` l'ignore — et à brancher `canStartRecording()` dessus. Un fichier.

`recordingErrorMessage` est pur, et **n'a rien à faire dans le module d'API** : celui-ci ne
retraduit aucune erreur (§4.2). Le `404` ne dit pas la même chose selon l'action, et `ApiError`
ne sait pas d'où il vient : c'est le paramètre `action` qui tranche. Sur `start`, il est
ambigu — fonctionnalité coupée **ou** salon inconnu — et le message reste au niveau de cette
ambiguïté, sans jamais annoncer « salon introuvable », ce qui serait faux une fois sur deux.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter en tête de `src/call/recording.spec.ts` :

```ts
import type { ApiError } from 'src/api/types';
import type { RoomAccess } from 'src/call/types';
import type { InstanceFeatures } from 'src/instance/types';
```

et élargir l'import du module à `canStartRecording` et `recordingErrorMessage`. Puis ajouter à
la fin du fichier :

```ts
const FEATURES = (recording: boolean): InstanceFeatures => ({
  recording,
  subtitle: true,
  telephony: false,
});

const ACCESS = (isAdministrable: boolean): RoomAccess => ({
  room: { id: 'r-1', slug: 'reunion', name: 'R', accessLevel: 'trusted' },
  livekitUrl: 'wss://lk',
  token: 'lk',
  isAdministrable,
});

describe('canStartRecording', () => {
  it('ouvre la commande à un administrateur sur une instance qui enregistre', () => {
    expect(canStartRecording(FEATURES(true), ACCESS(true))).toBe(true);
  });

  it('la ferme sans droit d’administration', () => {
    expect(canStartRecording(FEATURES(true), ACCESS(false))).toBe(false);
  });

  it('la ferme quand l’instance n’enregistre pas', () => {
    // Sans `recording.is_enabled`, l'instance répond 404 : le bouton serait un
    // geste voué à échouer.
    expect(canStartRecording(FEATURES(false), ACCESS(true))).toBe(false);
  });

  it('la ferme quand ni l’un ni l’autre', () => {
    expect(canStartRecording(FEATURES(false), ACCESS(false))).toBe(false);
  });
});

describe('recordingErrorMessage', () => {
  const server = (status: number): ApiError => ({ kind: 'server', status });

  it('traduit le 409 du démarrage en « déjà en cours »', () => {
    // `mapStatus` ne traite spécialement que 403 et 404 : le 409 arrive en
    // `{ kind: 'server', status: 409 }`, donc lisible.
    expect(recordingErrorMessage('start', server(409))).toBe('recording.errorBusy');
  });

  it('ne traduit pas le 409 de l’arrêt de la même façon', () => {
    expect(recordingErrorMessage('stop', server(409))).toBe('recording.errorStopFailed');
  });

  it('distingue le 404 du démarrage de celui de l’arrêt', () => {
    // Sur `start` il est ambigu (fonctionnalité coupée ou salon inconnu) ; sur
    // `stop` il veut dire « aucun enregistrement au statut actif ».
    expect(recordingErrorMessage('start', { kind: 'not-found' })).toBe(
      'recording.errorUnavailable',
    );
    expect(recordingErrorMessage('stop', { kind: 'not-found' })).toBe('recording.errorNotActive');
  });

  it('dit le refus de permission dans les deux sens', () => {
    expect(recordingErrorMessage('start', { kind: 'forbidden' })).toBe('recording.errorForbidden');
    expect(recordingErrorMessage('stop', { kind: 'forbidden' })).toBe('recording.errorForbidden');
  });

  it('garde les deux messages généraux du socle', () => {
    expect(recordingErrorMessage('start', { kind: 'network' })).toBe('error.network');
    expect(recordingErrorMessage('stop', { kind: 'unauthorized' })).toBe('error.unauthorized');
  });

  it('retombe sur l’échec de l’action pour les autres statuts serveur', () => {
    expect(recordingErrorMessage('start', server(502))).toBe('recording.errorStartFailed');
    expect(recordingErrorMessage('stop', server(500))).toBe('recording.errorStopFailed');
    expect(recordingErrorMessage('start', server(400))).toBe('recording.errorStartFailed');
  });

  it('traite validation et lobby comme un échec d’action', () => {
    // `lobby` n'est jamais produit par `authedFetch` — seul `fetchRoomAccess`
    // le fabrique. Il est traité parce que l'union doit l'être exhaustivement.
    expect(
      recordingErrorMessage('start', { kind: 'validation', fields: { mode: ['invalide'] } }),
    ).toBe('recording.errorStartFailed');
    expect(recordingErrorMessage('stop', { kind: 'lobby', participantId: 'p-1' })).toBe(
      'recording.errorStopFailed',
    );
  });
});
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/call/recording`
Attendu : ÉCHEC — `canStartRecording` et `recordingErrorMessage` n'existent pas.

- [ ] **Step 3 : implémenter**

Ajouter les trois imports de type en tête de `src/call/recording.ts` :

```ts
import type { ApiError } from 'src/api/types';
import type { RoomAccess } from 'src/call/types';
import type { InstanceFeatures } from 'src/instance/types';
```

puis, à la fin du fichier :

```ts
// FRONTIÈRE DE DIVERGENCE `main` / déployé — tout ce qui suit vit ici et nulle
// part ailleurs.
//
//   `main`   : HasPrivilegesOnRoom  → is_administrator_or_owner exigé.
//   déployé  : HasRecordingPermission → niveau par mode, "authenticated" sur
//              meet.linagora.com aujourd'hui, donc strictement plus large.
//
// `isAdministrable` vaut exactement `is_administrator_or_owner`
// (src/call/types.ts:14-19). C'est l'intersection des deux contrats : tout
// appel que cette porte laisse passer est accepté par les deux serveurs.
//
// Pour élargir (arbitrage qui appartient au partenaire) : lire
// `recording_permissions` dans la réponse salon — le champ y est déjà sur le
// déployé, `src/api/rooms.ts` l'ignore — et le brancher ici. Rien d'autre à
// toucher.
//
// `features.recording` en fait partie : sans lui, l'instance répond 404, et la
// commande serait un geste voué à échouer.
export function canStartRecording(features: InstanceFeatures, access: RoomAccess): boolean {
  return features.recording && access.isAdministrable;
}

export type RecordingAction = 'start' | 'stop';

export type RecordingMessageKey =
  | 'recording.errorBusy'
  | 'recording.errorNotActive'
  | 'recording.errorUnavailable'
  | 'recording.errorForbidden'
  | 'recording.errorStartFailed'
  | 'recording.errorStopFailed'
  | 'error.network'
  | 'error.unauthorized';

function failed(action: RecordingAction): RecordingMessageKey {
  return action === 'start' ? 'recording.errorStartFailed' : 'recording.errorStopFailed';
}

// Le module d'API ne retraduit rien : c'est ici, et ici seulement, qu'un
// `ApiError` devient une phrase. Le `switch` est exhaustif sans `default` :
// un membre ajouté à `ApiError` casse la compilation plutôt que de tomber
// silencieusement dans un message générique.
//
// Le 400 de ces endpoints n'est pas une `validation` : son corps est
// `{"detail": "Invalid request."}`, une chaîne et non une liste, ce que
// `readValidation` exige. Il arrive donc en `{ kind: 'server', status: 400 }`,
// et signale de toute façon un bogue de l'application, pas une situation
// d'utilisateur.
export function recordingErrorMessage(
  action: RecordingAction,
  error: ApiError,
): RecordingMessageKey {
  switch (error.kind) {
    case 'network':
      return 'error.network';
    case 'unauthorized':
      return 'error.unauthorized';
    case 'forbidden':
      return 'recording.errorForbidden';
    // Sur `start`, le 404 est ambigu : une instance dont l'enregistrement est
    // coupé répond 404, pas 403. Le message reste au niveau de cette
    // ambiguïté — jamais « salon introuvable », qui serait faux une fois sur
    // deux. Sur `stop`, il veut dire « aucun enregistrement au statut actif ».
    case 'not-found':
      return action === 'start' ? 'recording.errorUnavailable' : 'recording.errorNotActive';
    case 'server':
      return action === 'start' && error.status === 409 ? 'recording.errorBusy' : failed(action);
    case 'validation':
      return failed(action);
    case 'lobby':
      return failed(action);
  }
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx jest src/call/recording`
Attendu : PASSE — 32 tests.

- [ ] **Step 5 : éprouver par mutation**

Remplacer le corps de `canStartRecording` par `return features.recording;`. Le test « la ferme
sans droit d'administration » doit rougir. Restaurer.
Remplacer `action === 'start' && error.status === 409` par `error.status === 409`. Le test
« ne traduit pas le 409 de l'arrêt de la même façon » doit rougir. Restaurer.

- [ ] **Step 6 : commit**

```bash
npx prettier --write src/call/recording.ts src/call/recording.spec.ts
git add src/call/recording.ts src/call/recording.spec.ts
git commit -m "feat(call): Gate recording on administrable rooms, and name each failure"
```

---

### Task 3 : les deux endpoints

**Files:**
- Create: `src/api/recording.ts`
- Test: `src/api/recording.spec.ts`

**Interfaces:**
- Consumes: `authedFetch` de `src/api/client`, `ApiResult` de `src/api/types`, `Account` de
  `src/auth/accounts`
- Produces :
  - `startRecording(account: Account, roomId: string): Promise<ApiResult<void>>`
  - `stopRecording(account: Account, roomId: string): Promise<ApiResult<void>>`

Même forme que `src/api/participants.ts` : fonctions nommées, `ApiResult<T>`, **aucune
retraduction d'erreur**. Le module rend ce que `authedFetch` lui donne.

Trois décisions à ne pas défaire :

1. **Le mode est une constante du module, pas un paramètre.** Un seul mode est démarrable
   (§3.4) ; le jour où `transcript` sera livré, le paramètre s'ajoutera là.
2. **Aucune clé `options`** (§3.8). `RecordingOptions` est un modèle pydantic portant
   `extra: "forbid"` : **toute clé inconnue fait échouer la validation**. Le corps le plus
   petit est le plus sûr, et son test asserte l'**absence** de toute autre clé.
3. **`stopRecording` n'envoie ni corps ni `content-type`.** Précaution motivée et non
   contractuelle (§2.4.8) : un `content-type: application/json` sur un corps vide fait échouer
   le parseur JSON de DRF, et le 400 qui en sortirait serait indiscernable d'une requête mal
   formée.

`roomId` est l'UUID du salon, celui que `call.tsx` tient déjà (`access?.room.id`). Le slug
conviendrait aussi — `RoomViewSet.get_object` tente `uuid.UUID(pk)` puis retombe sur
`slug=slugify(pk)` — mais on garde l'UUID par cohérence avec les trois actions de modération.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/api/recording.spec.ts` :

```ts
import * as client from 'src/api/client';
import { startRecording, stopRecording } from 'src/api/recording';
import type { Account } from 'src/auth/accounts';

const ACCOUNT = {
  id: 'https://sso.linagora.com|u-1',
  instance: {
    serverUrl: 'https://meet.linagora.com',
    issuer: 'https://sso.linagora.com',
    clientId: 'twake-visio',
    livekitUrl: 'https://livekit.linagora.com',
    features: { recording: true, subtitle: true, telephony: false },
  },
  email: 'ada@linagora.com',
  displayName: 'Ada',
} as Account;

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('startRecording', () => {
  it('poste sur la route du salon visé', async () => {
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    await startRecording(ACCOUNT, 'r-2');

    expect(spy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/r-2/start-recording/');
    expect((spy.mock.calls[0]?.[2] as RequestInit).method).toBe('POST');
  });

  it('n’envoie que le mode, et rien d’autre', async () => {
    // `RecordingOptions` porte `extra: "forbid"` : une clé de trop fait échouer
    // la validation côté serveur. `toEqual` sur l'objet entier est donc
    // l'assertion qui compte, pas une lecture de `body.mode`.
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    await startRecording(ACCOUNT, 'r-1');

    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ mode: 'screen_recording' });
  });

  it('rend un échec de permission comme une valeur, sans lever', async () => {
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    const result = await startRecording(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
  });

  it('rend un 409 comme une valeur, avec son statut intact', async () => {
    // C'est ce statut, et lui seul, que `recordingErrorMessage` distingue :
    // l'écraser en `server` sans statut rendrait « déjà en cours »
    // inatteignable.
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: false, error: { kind: 'server', status: 409 } });

    const result = await startRecording(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: false, error: { kind: 'server', status: 409 } });
  });

  it('rend un 502 comme une valeur, distinct du 409', async () => {
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: false, error: { kind: 'server', status: 502 } });

    const result = await startRecording(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: false, error: { kind: 'server', status: 502 } });
  });
});

describe('stopRecording', () => {
  it('poste sur la route du salon visé', async () => {
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    await stopRecording(ACCOUNT, 'r-3');

    expect(spy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/r-3/stop-recording/');
    expect((spy.mock.calls[0]?.[2] as RequestInit).method).toBe('POST');
  });

  it('n’envoie ni corps ni content-type', async () => {
    // Un `content-type: application/json` sur un corps vide fait échouer le
    // parseur JSON de DRF, et le 400 qui en sortirait serait indiscernable
    // d'une requête mal formée.
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    await stopRecording(ACCOUNT, 'r-1');

    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(init.body).toBeUndefined();
    expect(init.headers).toBeUndefined();
  });

  it('rend le 404 comme une valeur', async () => {
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: false, error: { kind: 'not-found' } });

    const result = await stopRecording(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: false, error: { kind: 'not-found' } });
  });

  it('rend un succès sans valeur', async () => {
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: true, value: { message: 'Recording stopped' } });

    const result = await stopRecording(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: true, value: undefined });
  });
});
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/api/recording`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : implémenter**

`src/api/recording.ts` :

```ts
import { authedFetch } from 'src/api/client';
import type { ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';

// Une constante du module, pas un paramètre : un seul mode est démarrable
// depuis le mobile. Le jour où `transcript` sera livré, le paramètre s'ajoutera
// ici — et pas avant.
const SCREEN_RECORDING = 'screen_recording';

function toVoid(result: ApiResult<unknown>): ApiResult<void> {
  if (!result.ok) return result;
  return { ok: true, value: undefined };
}

// Aucune clé `options` : `RecordingOptions` porte `extra: "forbid"` côté
// serveur, et le corps le plus petit est le plus sûr. `language` ne servirait
// qu'à la transcription, que ce périmètre ne démarre pas.
export async function startRecording(account: Account, roomId: string): Promise<ApiResult<void>> {
  return toVoid(
    await authedFetch<unknown>(
      account,
      `/api/v1.0/rooms/${encodeURIComponent(roomId)}/start-recording/`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: SCREEN_RECORDING }),
      },
    ),
  );
}

// Ni corps ni `content-type` : l'endpoint n'attend rien, et un
// `content-type: application/json` sur un corps vide fait échouer le parseur
// JSON de DRF — le 400 qui en sortirait serait indiscernable d'une requête mal
// formée. Il n'est pas exigé d'être celui qui a démarré l'enregistrement pour
// l'arrêter : le serveur retrouve le mode via l'enregistrement actif du salon.
export async function stopRecording(account: Account, roomId: string): Promise<ApiResult<void>> {
  return toVoid(
    await authedFetch<unknown>(
      account,
      `/api/v1.0/rooms/${encodeURIComponent(roomId)}/stop-recording/`,
      { method: 'POST' },
    ),
  );
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx jest src/api/recording`
Attendu : PASSE — 9 tests.

- [ ] **Step 5 : éprouver par mutation**

Ajouter `options: { transcribe: false }` au corps de `startRecording`. Le test « n'envoie que
le mode » doit rougir. Restaurer.
Ajouter `headers: { 'content-type': 'application/json' }` à `stopRecording`. Le test « n'envoie
ni corps ni content-type » doit rougir. Restaurer.

- [ ] **Step 6 : commit**

```bash
npx prettier --write src/api/recording.ts src/api/recording.spec.ts
git add src/api/recording.ts src/api/recording.spec.ts
git commit -m "feat(api): Add the start and stop recording endpoints"
```

---

### Task 4 : le magasin, qui **lit** au lieu d'attendre

**Files:**
- Create: `src/call/recordingStore.ts`
- Test: `src/call/recordingStore.spec.ts`

**Interfaces:**
- Consumes: `deriveRecordingState`, `RecordingState` de `src/call/recording` (Task 1) ;
  `RoomEvent` et le type `Room` de `livekit-client`
- Produces :
  - `RECORDING_EVENTS: readonly [RoomEvent.RoomMetadataChanged, RoomEvent.RecordingStatusChanged, RoomEvent.Reconnected]`
  - `type RecordingStore = { subscribe: (onChange: () => void) => () => void; getSnapshot: () => RecordingState }`
  - `createRecordingStore(room: Room): RecordingStore`

**Le fait qui commande ce module** (§2.3, vérifié dans
`node_modules/livekit-client/dist/livekit-client.esm.mjs:26235-26243`) : à la jonction,
`handleRoomUpdate(joinResponse.room)` est appelé alors que `this.roomInfo` est encore
indéfini. `oldRoom` est donc faux et **`RoomMetadataChanged` n'est pas émis**. Mais
`this.roomInfo = room` s'exécute en premier : **`room.metadata` est juste immédiatement**.

Conséquence : un indicateur bâti sur l'abonnement resterait **éteint toute la séance** pour
qui rejoint une réunion déjà enregistrée. `getSnapshot()` lit donc la Room directement.
Noter l'asymétrie : `RecordingStatusChanged`, lui, **se déclenche** à la jonction, parce que
`oldRoom?.activeRecording` vaut `undefined` et diffère de `false`.

Même forme que `createRoomViewStore` (`src/call/participants.ts:78-120`), y compris son
contrat `useSyncExternalStore` : `getSnapshot()` doit rendre **la même valeur** tant que rien
n'a bougé, sinon le rendu boucle.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/call/recordingStore.spec.ts` :

```ts
import { RoomEvent } from 'livekit-client';
import type { Room } from 'livekit-client';

import { createRecordingStore, RECORDING_EVENTS } from 'src/call/recordingStore';

// Un double de `Room` qui enregistre réellement ses gestionnaires par nom
// d'événement, et dont les deux lectures sont des accesseurs : c'est la seule
// façon de vérifier que le magasin relit après un événement au lieu de rendre
// une valeur figée. Même convention que le `RoomProbe` de `participants.spec.ts`.
type RoomProbe = {
  readonly room: Room;
  readonly setMetadata: (metadata: string | undefined) => void;
  readonly setRecording: (isRecording: boolean) => void;
  readonly subscribedEvents: () => string[];
  readonly handlerCount: (event: string) => number;
  readonly emit: (event: string) => void;
};

function fakeRoom(metadata: string | undefined, isRecording = false): RoomProbe {
  const handlers = new Map<string, (() => void)[]>();
  let currentMetadata = metadata;
  let currentRecording = isRecording;

  const room = {
    get metadata(): string | undefined {
      return currentMetadata;
    },
    get isRecording(): boolean {
      return currentRecording;
    },
    on(event: string, handler: () => void): unknown {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return room;
    },
    off(event: string, handler: () => void): unknown {
      const attached = handlers.get(event) ?? [];
      const index = attached.indexOf(handler);
      if (index !== -1) attached.splice(index, 1);
      if (attached.length === 0) handlers.delete(event);
      return room;
    },
  };

  return {
    room: room as unknown as Room,
    setMetadata: (next: string | undefined) => {
      currentMetadata = next;
    },
    setRecording: (next: boolean) => {
      currentRecording = next;
    },
    subscribedEvents: () => Array.from(handlers.keys()).sort(),
    handlerCount: (event: string) => (handlers.get(event) ?? []).length,
    emit: (event: string) => {
      for (const handler of Array.from(handlers.get(event) ?? [])) handler();
    },
  };
}

const STARTED = JSON.stringify({
  recording_mode: 'screen_recording',
  recording_status: 'started',
});
const SAVING = JSON.stringify({ recording_mode: 'screen_recording', recording_status: 'saving' });

describe('RECORDING_EVENTS', () => {
  it('porte exactement les trois événements attendus, nom par nom', () => {
    // Un événement oublié ne casse rien en développement : il fige simplement
    // l'indicateur sur l'appareil de quelqu'un d'autre.
    expect([...RECORDING_EVENTS]).toEqual([
      RoomEvent.RoomMetadataChanged,
      RoomEvent.RecordingStatusChanged,
      RoomEvent.Reconnected,
    ]);
  });
});

describe('createRecordingStore', () => {
  it('lit la Room avant tout événement', () => {
    // Le cas « rejoindre une réunion déjà enregistrée » : le SDK n'émet PAS
    // `RoomMetadataChanged` à la jonction. Un magasin qui attendrait
    // l'événement resterait à `idle` toute la séance.
    const probe = fakeRoom(STARTED, true);

    const store = createRecordingStore(probe.room);

    expect(store.getSnapshot()).toEqual({ phase: 'recording', mode: 'screen_recording' });
  });

  it('rend la même valeur tant que rien ne bouge', () => {
    // Le contrat de `useSyncExternalStore` : une valeur neuve à chaque appel
    // fait boucler le rendu.
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);

    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('relit après un changement de métadonnées', () => {
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);
    store.subscribe(() => undefined);
    expect(store.getSnapshot()).toEqual({ phase: 'recording', mode: 'screen_recording' });

    probe.setMetadata(SAVING);
    probe.emit(RoomEvent.RoomMetadataChanged);

    expect(store.getSnapshot()).toEqual({ phase: 'saving', mode: 'screen_recording' });
  });

  it('relit sur la bascule de RecordingStatusChanged', () => {
    // La seconde moitié de la règle `started && isRecording` : sans cet
    // événement, la phase resterait « démarrage » alors que l'egress a démarré.
    const probe = fakeRoom(STARTED, false);
    const store = createRecordingStore(probe.room);
    store.subscribe(() => undefined);
    expect(store.getSnapshot()).toEqual({ phase: 'starting', mode: 'screen_recording' });

    probe.setRecording(true);
    probe.emit(RoomEvent.RecordingStatusChanged);

    expect(store.getSnapshot()).toEqual({ phase: 'recording', mode: 'screen_recording' });
  });

  it('relit après une reconnexion', () => {
    // `emitWhenConnected` met les événements en tampon pendant une reconnexion
    // et ne les rejoue qu'après avoir émis `Reconnected` — et en jette hors de
    // ces deux fenêtres.
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);
    store.subscribe(() => undefined);
    store.getSnapshot();

    probe.setMetadata(undefined);
    probe.emit(RoomEvent.Reconnected);

    expect(store.getSnapshot()).toEqual({ phase: 'idle', mode: null });
  });

  it('avertit ses abonnés', () => {
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);
    const onChange = jest.fn();
    store.subscribe(onChange);

    probe.emit(RoomEvent.RoomMetadataChanged);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('s’abonne aux trois événements et détache tout au désabonnement', () => {
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);

    const unsubscribe = store.subscribe(() => undefined);

    expect(probe.subscribedEvents()).toEqual([...RECORDING_EVENTS].sort());
    unsubscribe();
    expect(probe.subscribedEvents()).toEqual([]);
  });

  it('n’attache qu’un gestionnaire par événement pour deux abonnés', () => {
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);

    const first = store.subscribe(() => undefined);
    const second = store.subscribe(() => undefined);

    expect(probe.handlerCount(RoomEvent.RoomMetadataChanged)).toBe(1);
    first();
    expect(probe.handlerCount(RoomEvent.RoomMetadataChanged)).toBe(1);
    second();
    expect(probe.handlerCount(RoomEvent.RoomMetadataChanged)).toBe(0);
  });

  it('périme la valeur au moment de l’abonnement', () => {
    // Entre la lecture faite pendant le rendu et l'abonnement, une métadonnée a
    // pu arriver sans personne pour l'écouter.
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);
    const before = store.getSnapshot();

    probe.setMetadata(SAVING);
    store.subscribe(() => undefined);

    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot()).toEqual({ phase: 'saving', mode: 'screen_recording' });
  });
});
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/call/recordingStore`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : implémenter**

`src/call/recordingStore.ts` :

```ts
import { RoomEvent } from 'livekit-client';
import type { Room } from 'livekit-client';

import { deriveRecordingState, type RecordingState } from 'src/call/recording';

// Trois événements, trois motifs distincts. La liste est exportée et vérifiée
// nom par nom par son test, comme `ROOM_VIEW_EVENTS` : un événement oublié ne
// casse rien en développement, il fige simplement l'indicateur sur l'appareil
// de quelqu'un d'autre.
//
//   RoomMetadataChanged     — la source de vérité change.
//   RecordingStatusChanged  — `activeRecording` bascule ; c'est la seconde
//                             moitié de la règle `started && isRecording`.
//   Reconnected             — `emitWhenConnected` met les événements en tampon
//                             pendant une reconnexion et ne les rejoue qu'après
//                             avoir émis `Reconnected` ; hors de ces deux
//                             fenêtres, il les jette (`return false`). Une
//                             ligne de coût, une fenêtre de perte fermée.
export const RECORDING_EVENTS = [
  RoomEvent.RoomMetadataChanged,
  RoomEvent.RecordingStatusChanged,
  RoomEvent.Reconnected,
] as const;

// Le contrat de `useSyncExternalStore` : `getSnapshot()` doit rendre la *même*
// valeur tant que rien n'a bougé, sans quoi le rendu boucle.
export type RecordingStore = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => RecordingState;
};

export function createRecordingStore(room: Room): RecordingStore {
  const listeners = new Set<() => void>();
  let state: RecordingState | null = null;

  // Périmer plutôt que relire : la lecture n'a lieu qu'au prochain
  // `getSnapshot()`, donc une rafale d'événements ne parse pas les métadonnées
  // autant de fois qu'elle compte d'événements.
  function invalidate(): void {
    state = null;
    // Copie de la liste : un abonné qui se désabonne en recevant l'avis ne doit
    // pas changer qui reçoit *cet* avis-là.
    for (const listener of Array.from(listeners)) listener();
  }

  return {
    subscribe(onChange: () => void): () => void {
      if (listeners.size === 0) {
        for (const event of RECORDING_EVENTS) room.on(event, invalidate);
      }
      listeners.add(onChange);

      // Entre la lecture faite pendant le rendu et cette ligne, une métadonnée
      // a pu arriver sans que personne n'écoutât.
      state = null;

      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) {
          for (const event of RECORDING_EVENTS) room.off(event, invalidate);
        }
      };
    },

    // **Lit la Room directement.** N'attend aucun événement pour le premier
    // état : le SDK n'émet pas `RoomMetadataChanged` à la jonction (au premier
    // `handleRoomUpdate`, `oldRoom` est indéfini), alors que `room.metadata`
    // est juste dès cet instant. C'est ce qui fait que quelqu'un rejoignant une
    // réunion déjà enregistrée voit l'indicateur.
    getSnapshot(): RecordingState {
      if (state === null) {
        state = deriveRecordingState({
          metadata: room.metadata,
          isRecording: room.isRecording,
        });
      }
      return state;
    },
  };
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx jest src/call/recordingStore`
Attendu : PASSE — 10 tests.

- [ ] **Step 5 : éprouver par mutation**

Retirer le `state = null;` de `subscribe`. Le test « périme la valeur au moment de
l'abonnement » doit rougir. Restaurer.
Retirer `RoomEvent.RecordingStatusChanged` de `RECORDING_EVENTS`. Le test de la liste **et**
celui de la bascule doivent rougir. Restaurer.

- [ ] **Step 6 : commit**

```bash
npx prettier --write src/call/recordingStore.ts src/call/recordingStore.spec.ts
git add src/call/recordingStore.ts src/call/recordingStore.spec.ts
git commit -m "feat(call): Read the recording state instead of waiting for an event"
```

---

### Task 5 : l'indicateur, et les quatorze clés

**Files:**
- Create: `src/screens/room/recordingIndicator.tsx`
- Test: `src/screens/room/recordingIndicator.spec.tsx`
- Modify: les sept fichiers de `src/i18n/locales/`

**Interfaces:**
- Consumes: `recordingLabelKey`, `RecordingState` de `src/call/recording` (Task 1)
- Produces :
  - `type RecordingIndicatorProps = { readonly state: RecordingState }`
  - `RecordingIndicator(props: RecordingIndicatorProps): React.ReactElement | null`
  - les 14 clés de traduction que les tâches 6, 7 et 9 consomment

C'est **la partie critique du périmètre** — celle du consentement — et la seule qui ne dépende
d'aucune surface : elle est vue par des gens qui n'ont aucun bouton (§3.5), et elle se pose
au-dessus de la scène, hors de la barre.

Rend `null` quand `phase === 'idle'` — donc **toujours montée, jamais enveloppée d'une
condition**, comme `WaitingBanner`.

Les 14 clés sont toutes ajoutées ici, en une fois, même celles que les tâches suivantes
consomment : `src/i18n/index.spec.ts` compare des jeux de clés complets, et les répartir sur
quatre commits ferait passer trois fois par un état où une locale en sait moins qu'une autre.

- [ ] **Step 1 : ajouter les clés dans les sept locales**

Dans chaque `src/i18n/locales/<locale>.json`, insérer la ligne `call.more` **juste après**
`"call.share"`, et le bloc `recording.*` **juste avant** `"error.network"`.

`en.json` :

```json
  "call.more": "More",
```

```json
  "recording.start": "Record the meeting",
  "recording.stop": "Stop the recording",
  "recording.starting": "Starting the recording…",
  "recording.active": "Recording in progress",
  "recording.transcriptActive": "Transcription in progress",
  "recording.saving": "Saving the recording",
  "recording.aborted": "The recording was interrupted",
  "recording.errorBusy": "A recording is already in progress",
  "recording.errorNotActive": "The recording has not started yet",
  "recording.errorUnavailable": "Recording is not available on this server",
  "recording.errorForbidden": "You are not allowed to record this meeting",
  "recording.errorStartFailed": "The recording could not be started",
  "recording.errorStopFailed": "The recording could not be stopped",
```

`fr.json` :

```json
  "call.more": "Plus",
```

```json
  "recording.start": "Enregistrer la réunion",
  "recording.stop": "Arrêter l'enregistrement",
  "recording.starting": "Démarrage de l'enregistrement…",
  "recording.active": "Enregistrement en cours",
  "recording.transcriptActive": "Transcription en cours",
  "recording.saving": "Sauvegarde de l'enregistrement",
  "recording.aborted": "L'enregistrement a été interrompu",
  "recording.errorBusy": "Un enregistrement est déjà en cours",
  "recording.errorNotActive": "L'enregistrement n'a pas encore démarré",
  "recording.errorUnavailable": "L'enregistrement n'est pas disponible sur ce serveur",
  "recording.errorForbidden": "Vous n'avez pas le droit d'enregistrer cette réunion",
  "recording.errorStartFailed": "L'enregistrement n'a pas pu démarrer",
  "recording.errorStopFailed": "L'enregistrement n'a pas pu être arrêté",
```

`es.json` :

```json
  "call.more": "Más",
```

```json
  "recording.start": "Grabar la reunión",
  "recording.stop": "Detener la grabación",
  "recording.starting": "Iniciando la grabación…",
  "recording.active": "Grabación en curso",
  "recording.transcriptActive": "Transcripción en curso",
  "recording.saving": "Guardando la grabación",
  "recording.aborted": "La grabación se interrumpió",
  "recording.errorBusy": "Ya hay una grabación en curso",
  "recording.errorNotActive": "La grabación aún no ha comenzado",
  "recording.errorUnavailable": "La grabación no está disponible en este servidor",
  "recording.errorForbidden": "No tiene permiso para grabar esta reunión",
  "recording.errorStartFailed": "No se pudo iniciar la grabación",
  "recording.errorStopFailed": "No se pudo detener la grabación",
```

`it.json` :

```json
  "call.more": "Altro",
```

```json
  "recording.start": "Registra la riunione",
  "recording.stop": "Interrompi la registrazione",
  "recording.starting": "Avvio della registrazione…",
  "recording.active": "Registrazione in corso",
  "recording.transcriptActive": "Trascrizione in corso",
  "recording.saving": "Salvataggio della registrazione",
  "recording.aborted": "La registrazione è stata interrotta",
  "recording.errorBusy": "Una registrazione è già in corso",
  "recording.errorNotActive": "La registrazione non è ancora iniziata",
  "recording.errorUnavailable": "La registrazione non è disponibile su questo server",
  "recording.errorForbidden": "Non hai il permesso di registrare questa riunione",
  "recording.errorStartFailed": "Non è stato possibile avviare la registrazione",
  "recording.errorStopFailed": "Non è stato possibile interrompere la registrazione",
```

`de.json` :

```json
  "call.more": "Mehr",
```

```json
  "recording.start": "Besprechung aufzeichnen",
  "recording.stop": "Aufzeichnung beenden",
  "recording.starting": "Aufzeichnung wird gestartet…",
  "recording.active": "Aufzeichnung läuft",
  "recording.transcriptActive": "Transkription läuft",
  "recording.saving": "Aufzeichnung wird gespeichert",
  "recording.aborted": "Die Aufzeichnung wurde unterbrochen",
  "recording.errorBusy": "Es läuft bereits eine Aufzeichnung",
  "recording.errorNotActive": "Die Aufzeichnung hat noch nicht begonnen",
  "recording.errorUnavailable": "Aufzeichnung ist auf diesem Server nicht verfügbar",
  "recording.errorForbidden": "Sie dürfen diese Besprechung nicht aufzeichnen",
  "recording.errorStartFailed": "Die Aufzeichnung konnte nicht gestartet werden",
  "recording.errorStopFailed": "Die Aufzeichnung konnte nicht beendet werden",
```

`vi.json` :

```json
  "call.more": "Thêm",
```

```json
  "recording.start": "Ghi lại cuộc họp",
  "recording.stop": "Dừng ghi",
  "recording.starting": "Đang bắt đầu ghi…",
  "recording.active": "Đang ghi",
  "recording.transcriptActive": "Đang ghi lời thoại",
  "recording.saving": "Đang lưu bản ghi",
  "recording.aborted": "Bản ghi đã bị gián đoạn",
  "recording.errorBusy": "Đã có một bản ghi đang chạy",
  "recording.errorNotActive": "Bản ghi chưa bắt đầu",
  "recording.errorUnavailable": "Máy chủ này không hỗ trợ ghi",
  "recording.errorForbidden": "Bạn không có quyền ghi cuộc họp này",
  "recording.errorStartFailed": "Không thể bắt đầu ghi",
  "recording.errorStopFailed": "Không thể dừng ghi",
```

`ru.json` :

```json
  "call.more": "Ещё",
```

```json
  "recording.start": "Записать встречу",
  "recording.stop": "Остановить запись",
  "recording.starting": "Запись запускается…",
  "recording.active": "Идёт запись",
  "recording.transcriptActive": "Идёт расшифровка",
  "recording.saving": "Сохранение записи",
  "recording.aborted": "Запись была прервана",
  "recording.errorBusy": "Запись уже идёт",
  "recording.errorNotActive": "Запись ещё не началась",
  "recording.errorUnavailable": "Запись недоступна на этом сервере",
  "recording.errorForbidden": "У вас нет прав на запись этой встречи",
  "recording.errorStartFailed": "Не удалось начать запись",
  "recording.errorStopFailed": "Не удалось остановить запись",
```

Vérification : `npx jest src/i18n` doit passer, et chaque locale doit compter **74 clés**
(60 avant, 14 ajoutées).

- [ ] **Step 2 : écrire les tests qui échouent**

`src/screens/room/recordingIndicator.spec.tsx` :

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { RecordingState } from 'src/call/recording';
import { RecordingIndicator } from './recordingIndicator';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('RecordingIndicator', () => {
  it('ne rend rien au repos', async () => {
    await render(<RecordingIndicator state={{ phase: 'idle', mode: null }} />);

    expect(screen.queryByTestId('recording-indicator')).toBe(null);
  });

  it('annonce le démarrage', async () => {
    const state: RecordingState = { phase: 'starting', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.starting');
  });

  it('annonce un enregistrement en cours', async () => {
    const state: RecordingState = { phase: 'recording', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.active');
  });

  it('nomme une transcription pour ce qu’elle est', async () => {
    // Un participant web peut démarrer une transcription : répondre
    // « enregistrement » serait un mensonge sur un sujet de consentement.
    const state: RecordingState = { phase: 'recording', mode: 'transcript' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent(
      'recording.transcriptActive',
    );
  });

  it('reste visible pendant la sauvegarde', async () => {
    const state: RecordingState = { phase: 'saving', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.saving');
  });

  it('dit l’interruption plutôt que de retomber au silence', async () => {
    // Sans ce libellé, un enregistrement mort serait indiscernable d'un
    // enregistrement jamais démarré.
    const state: RecordingState = { phase: 'aborted', mode: 'screen_recording' };

    await render(<RecordingIndicator state={state} />);

    expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.aborted');
  });
});
```

- [ ] **Step 3 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/recordingIndicator`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 4 : implémenter**

`src/screens/room/recordingIndicator.tsx` :

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { recordingLabelKey, type RecordingState } from 'src/call/recording';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  // La même bande que le message de reconnexion (`call.tsx`, `styles.banner`) :
  // au-dessus de la scène, hors de la barre.
  root: { alignItems: 'center', paddingVertical: tokens.spacing.sm },
  // `call.tsx` force un fond sombre dans les deux schémas alors que le thème
  // Paper suit le schéma système : sans cette couleur explicite, le libellé
  // retombe sur `theme.colors.onSurface` — 1,08:1, invisible. 16,66:1 avec.
  text: { color: tokens.color.textDark },
});

export type RecordingIndicatorProps = {
  readonly state: RecordingState;
};

// Vu de **tout le monde**, y compris de qui n'a pas le droit d'enregistrer : ce
// qu'on peut faire et ce qu'on doit savoir sont deux questions différentes.
// Rend `null` au repos, donc toujours monté, jamais enveloppé d'une condition.
export function RecordingIndicator({ state }: RecordingIndicatorProps): React.ReactElement | null {
  const { t } = useTranslation();
  const key = recordingLabelKey(state);
  if (key === null) return null;

  return (
    <View style={styles.root}>
      <Text testID="recording-indicator" style={styles.text}>
        {t(key)}
      </Text>
    </View>
  );
}
```

- [ ] **Step 5 : lancer les tests**

Run : `npm test`
Attendu : tout vert — la spec i18n comprise.

- [ ] **Step 6 : éprouver par mutation**

Remplacer `{t(key)}` par `{t('recording.active')}`. Quatre tests doivent rougir. Restaurer.

- [ ] **Step 7 : commit**

```bash
npx prettier --write src/screens/room/recordingIndicator.tsx src/screens/room/recordingIndicator.spec.tsx
git add src/screens/room/recordingIndicator.tsx src/screens/room/recordingIndicator.spec.tsx src/i18n/locales
git commit -m "feat(call): Show everyone that the meeting is being recorded"
```

---

### Task 6 : la commande, dont l'identité suit la phase

**Files:**
- Create: `src/screens/room/recordingControl.tsx`
- Test: `src/screens/room/recordingControl.spec.tsx`
- Modify: `src/screens/room/controlBar.ts`

**Interfaces:**
- Consumes: `RecordingState` de `src/call/recording` (Task 1) ; `BAR_RIPPLE_COLOR`,
  `barStyles` de `src/screens/room/controlBar`
- Produces :
  - `type RecordingControlProps = { readonly state: RecordingState; readonly canStart: boolean; readonly busy: boolean; readonly onStart: () => void; readonly onStop: () => void }`
  - `RecordingControl(props: RecordingControlProps): React.ReactElement | null`
  - `barStyles.menuTitleDanger`

**Un seul bouton, dont l'identité suit la phase.** C'est ce qui rend l'exclusivité des deux
modes **structurelle** (§3.4) : on ne peut pas démarrer pendant qu'une chose tourne, puisque
la commande est alors une commande d'arrêt. Aucun état supplémentaire, aucun
`isAnotherModeStarted` à la manière du web.

**L'arrêt n'est pas désactivé pendant `starting`** (§5.3). `stop-recording` ne cible que le
statut `active` et rend 404 pendant `initiated` — mais rien ne permet de distinguer « deux
secondes se sont écoulées » de « l'egress ne démarrera jamais », et ces deux situations ont la
même phase. Griser serait juste dans le premier cas et **terminal dans le second**. La commande
reste donc active, et le 404 a **sa propre clé de message** (Task 2).

Le composant est un `Menu.Item` : c'est la tâche 7 qui pose la surface qui le contient. Il se
rend et se teste seul, sans `PaperProvider` ni `Portal`.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/screens/room/recordingControl.spec.tsx` :

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { RecordingState } from 'src/call/recording';
import { RecordingControl } from './recordingControl';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const IDLE: RecordingState = { phase: 'idle', mode: null };
const STARTING: RecordingState = { phase: 'starting', mode: 'screen_recording' };
const RECORDING: RecordingState = { phase: 'recording', mode: 'transcript' };
const SAVING: RecordingState = { phase: 'saving', mode: 'screen_recording' };
const ABORTED: RecordingState = { phase: 'aborted', mode: 'screen_recording' };

describe('RecordingControl', () => {
  it('ne rend rien sans le droit d’enregistrer', async () => {
    // Le serveur refuserait : proposer un geste voué à échouer se lit comme une
    // panne de l'application. On masque, on ne grise pas.
    await render(
      <RecordingControl
        state={IDLE}
        canStart={false}
        busy={false}
        onStart={jest.fn()}
        onStop={jest.fn()}
      />,
    );

    expect(screen.queryByTestId('recording-toggle')).toBe(null);
  });

  it('disparaît pendant un appel en vol plutôt que de se griser', async () => {
    // Paper teste `disabled` avant la couleur passée par l'appelant et rend un
    // quasi-noir qu'aucune couleur explicite ne rattrape.
    await render(
      <RecordingControl state={IDLE} canStart busy onStart={jest.fn()} onStop={jest.fn()} />,
    );

    expect(screen.queryByTestId('recording-toggle')).toBe(null);
  });

  it('démarre au repos', async () => {
    const onStart = jest.fn();
    const onStop = jest.fn();
    await render(
      <RecordingControl state={IDLE} canStart busy={false} onStart={onStart} onStop={onStop} />,
    );

    expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.start');
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();
  });

  it('arrête dès la phase de démarrage', async () => {
    // C'est la phase que §5.3 refuse de griser : rien ne distingue « deux
    // secondes se sont écoulées » de « l'egress ne démarrera jamais ».
    const onStart = jest.fn();
    const onStop = jest.fn();
    await render(
      <RecordingControl state={STARTING} canStart busy={false} onStart={onStart} onStop={onStop} />,
    );

    expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.stop');
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it('arrête aussi pendant un enregistrement, une sauvegarde ou après une interruption', async () => {
    for (const state of [RECORDING, SAVING, ABORTED]) {
      const onStop = jest.fn();
      const view = await render(
        <RecordingControl
          state={state}
          canStart
          busy={false}
          onStart={jest.fn()}
          onStop={onStop}
        />,
      );

      expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.stop');
      await fireEvent.press(screen.getByTestId('recording-toggle'));
      expect(onStop).toHaveBeenCalledTimes(1);

      await view.unmount();
    }
  });
});
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/recordingControl`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : ajouter la couleur d'alerte au foyer unique de la barre**

Dans `src/screens/room/controlBar.ts`, **juste après** `menuTitle` :

```ts
  // 8,62:1 sur `surfaceDark`. La seule couleur d'alerte de cette barre qui ne
  // soit pas celle de « quitter » : elle vit dans un menu, à deux appuis, donc
  // jamais adjacente au combiné raccroché.
  menuTitleDanger: { color: tokens.color.dangerDark },
```

- [ ] **Step 4 : implémenter**

`src/screens/room/recordingControl.tsx` :

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Menu } from 'react-native-paper';

import type { RecordingState } from 'src/call/recording';
import { BAR_RIPPLE_COLOR, barStyles } from 'src/screens/room/controlBar';

export type RecordingControlProps = {
  readonly state: RecordingState;
  readonly canStart: boolean;
  readonly busy: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
};

// Un seul contrôle, dont l'identité suit la phase : l'exclusivité des deux
// modes n'a besoin d'aucun état supplémentaire — on ne peut pas démarrer
// pendant qu'une chose tourne, puisque la commande est alors un arrêt.
//
// Deux absences plutôt que deux grisages : sans droit, le serveur refuserait ;
// pendant un appel en vol, `disabled` rendrait un quasi-noir illisible que
// Paper calcule avant toute couleur explicite. On masque, on ne grise pas.
//
// Pas de `leadingIcon` : `MenuItem` colore l'icône depuis le thème, donc en
// quasi-noir sur cette surface sombre — c'est pour cette raison que le glyphe
// de coche a dû être extrait dans `menuCheck.tsx`. L'identité passe par le
// libellé et sa couleur.
export function RecordingControl({
  state,
  canStart,
  busy,
  onStart,
  onStop,
}: RecordingControlProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (!canStart) return null;
  if (busy) return null;

  const stopping = state.phase !== 'idle';
  const label = stopping ? 'recording.stop' : 'recording.start';

  return (
    <Menu.Item
      testID="recording-toggle"
      title={t(label)}
      titleStyle={stopping ? barStyles.menuTitleDanger : barStyles.menuTitle}
      rippleColor={BAR_RIPPLE_COLOR}
      accessibilityLabel={t(label)}
      onPress={stopping ? onStop : onStart}
    />
  );
}
```

- [ ] **Step 5 : lancer les tests**

Run : `npx jest src/screens/room/recordingControl`
Attendu : PASSE — 5 tests.

- [ ] **Step 6 : éprouver par mutation**

Remplacer `onPress={stopping ? onStop : onStart}` par `onPress={onStart}`. Les deux tests
d'arrêt doivent rougir. Restaurer.
Remplacer `if (busy) return null;` par rien. Le test de l'appel en vol doit rougir. Restaurer.

- [ ] **Step 7 : commit**

```bash
npx prettier --write src/screens/room/recordingControl.tsx src/screens/room/recordingControl.spec.tsx src/screens/room/controlBar.ts
git add src/screens/room/recordingControl.tsx src/screens/room/recordingControl.spec.tsx src/screens/room/controlBar.ts
git commit -m "feat(call): Add the recording command that follows the phase"
```

---

### Task 7 : la surface qui manque — le bouton « plus »

**Files:**
- Create: `src/screens/room/moreMenu.tsx`
- Test: `src/screens/room/moreMenu.spec.tsx`

**Interfaces:**
- Consumes: `RecordingState` de `src/call/recording` (Task 1) ; `RecordingControl` de
  `src/screens/room/recordingControl` (Task 6) ; `BAR_HIT_SLOP`, `BAR_ICON_COLOR`,
  `BAR_RIPPLE_COLOR`, `barStyles` de `src/screens/room/controlBar`
- Produces :
  - `type MoreMenuProps = { readonly recording: RecordingState; readonly canRecord: boolean; readonly recordingBusy: boolean; readonly onShare: () => void; readonly onStartRecording: () => void; readonly onStopRecording: () => void }`
  - `MoreMenu(props: MoreMenuProps): React.ReactElement`

Voir **E2** pour le pourquoi : la barre est pleine à 357 dp sur 360, une huitième cible en
demanderait 409, et la commande d'enregistrement doit donc vivre ailleurs. Ce menu **remplace**
le bouton de partage dans la rangée (câblage en tâche 9) : sept cibles avant, sept après.

Le menu **possède sa visibilité** et referme lui-même avant d'appeler le rappel du parent :
`RecordingControl` garde ainsi exactement la forme de props que §4.4 lui donne, sans rien
savoir du menu qui le contient.

Cette tâche ne touche pas `call.tsx` : à sa fin, le composant existe, est testé, et n'est
monté nulle part. `share-btn` vit encore dans la barre.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/screens/room/moreMenu.spec.tsx` :

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import type { RecordingState } from 'src/call/recording';
import { MoreMenu } from './moreMenu';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// `Menu` monte son contenu dans un `Portal`, qui jette sans `Provider` ancêtre.
// `animation.scale` à zéro ramène à zéro la durée de l'animation de fermeture
// que `Menu` lance au montage.
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

// Même à durée nulle, ce rappel part sur un `requestAnimationFrame` : un appui
// qui arrive avant lui voit son ouverture annulée, définitivement.
async function settleMenus(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 32));
  });
}

const IDLE: RecordingState = { phase: 'idle', mode: null };
const RECORDING: RecordingState = { phase: 'recording', mode: 'screen_recording' };
const STARTING: RecordingState = { phase: 'starting', mode: 'screen_recording' };

type Overrides = {
  recording?: RecordingState;
  canRecord?: boolean;
  recordingBusy?: boolean;
  onShare?: () => void;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
};

function menu(overrides: Overrides = {}): React.ReactElement {
  return withPaper(
    <MoreMenu
      recording={overrides.recording ?? IDLE}
      canRecord={overrides.canRecord ?? true}
      recordingBusy={overrides.recordingBusy ?? false}
      onShare={overrides.onShare ?? jest.fn()}
      onStartRecording={overrides.onStartRecording ?? jest.fn()}
      onStopRecording={overrides.onStopRecording ?? jest.fn()}
    />,
  );
}

async function open(): Promise<void> {
  await settleMenus();
  await fireEvent.press(screen.getByTestId('more-btn'));
}

describe('MoreMenu', () => {
  it('ne montre rien avant l’ouverture', async () => {
    await render(menu());

    expect(screen.queryByTestId('recording-toggle')).toBe(null);
    expect(screen.queryByTestId('share-btn')).toBe(null);
  });

  it('offre le partage et le démarrage au repos', async () => {
    await render(menu());

    await open();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.start');
  });

  it('démarre l’enregistrement', async () => {
    const onStartRecording = jest.fn();
    const onStopRecording = jest.fn();
    await render(menu({ onStartRecording, onStopRecording }));

    await open();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    expect(onStartRecording).toHaveBeenCalledTimes(1);
    expect(onStopRecording).not.toHaveBeenCalled();
  });

  it('devient un arrêt dès le démarrage en cours', async () => {
    const onStartRecording = jest.fn();
    const onStopRecording = jest.fn();
    await render(menu({ recording: STARTING, onStartRecording, onStopRecording }));

    await open();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.stop');
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    expect(onStopRecording).toHaveBeenCalledTimes(1);
    expect(onStartRecording).not.toHaveBeenCalled();
  });

  it('arrête un enregistrement en cours', async () => {
    const onStopRecording = jest.fn();
    await render(menu({ recording: RECORDING, onStopRecording }));

    await open();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    expect(onStopRecording).toHaveBeenCalledTimes(1);
  });

  it('partage sans toucher à l’enregistrement', async () => {
    // Les deux entrées du menu partent vers deux rappels distincts : les
    // intervertir enverrait un appui sur « partager » démarrer un
    // enregistrement.
    const onShare = jest.fn();
    const onStartRecording = jest.fn();
    await render(menu({ onShare, onStartRecording }));

    await open();
    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('share-btn'));

    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onStartRecording).not.toHaveBeenCalled();
  });

  it('ne propose aucune commande d’enregistrement sans le droit, mais garde le partage', async () => {
    await render(menu({ canRecord: false }));

    await open();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.queryByTestId('recording-toggle')).toBe(null);
  });

  it('retire la commande pendant un appel en vol plutôt que de la griser', async () => {
    await render(menu({ recordingBusy: true }));

    await open();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.queryByTestId('recording-toggle')).toBe(null);
  });

  it('referme le menu après un appui', async () => {
    // Un menu qui reste ouvert masque la scène et invite au second appui, donc
    // au 409.
    await render(menu());

    await open();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    await waitFor(() => expect(screen.queryByTestId('recording-toggle')).toBe(null));
  });
});
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/moreMenu`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : implémenter**

`src/screens/room/moreMenu.tsx` :

```tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, Menu } from 'react-native-paper';

import type { RecordingState } from 'src/call/recording';
import {
  BAR_HIT_SLOP,
  BAR_ICON_COLOR,
  BAR_RIPPLE_COLOR,
  barStyles,
} from 'src/screens/room/controlBar';
import { RecordingControl } from 'src/screens/room/recordingControl';

export type MoreMenuProps = {
  readonly recording: RecordingState;
  readonly canRecord: boolean;
  readonly recordingBusy: boolean;
  readonly onShare: () => void;
  readonly onStartRecording: () => void;
  readonly onStopRecording: () => void;
};

// La rangée de commandes est pleine : sept cibles de 44 dp tiennent sur 357 dp,
// une huitième en demanderait 409 sur un écran qui en fait 360. Ce menu prend
// donc la place du bouton de partage et porte les deux commandes rares — celle
// qu'on n'utilise qu'au début d'une réunion, et celle que ce périmètre ajoute.
//
// Effet de bord voulu : la commande d'enregistrement n'est plus dans la barre,
// donc jamais adjacente au combiné raccroché. Deux rouges voisins pendant un
// enregistrement ne peuvent plus se produire.
//
// Le menu possède sa visibilité et se referme lui-même avant d'appeler le
// rappel du parent : `RecordingControl` n'a rien à savoir du menu qui le
// contient.
export function MoreMenu({
  recording,
  canRecord,
  recordingBusy,
  onShare,
  onStartRecording,
  onStopRecording,
}: MoreMenuProps): React.ReactElement {
  const { t } = useTranslation();
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
          testID="more-btn"
          icon="dots-vertical"
          iconColor={BAR_ICON_COLOR}
          rippleColor={BAR_RIPPLE_COLOR}
          style={barStyles.button}
          hitSlop={BAR_HIT_SLOP}
          onPress={() => setVisible(true)}
          accessibilityLabel={t('call.more')}
        />
      }
    >
      <Menu.Item
        testID="share-btn"
        title={t('call.share')}
        titleStyle={barStyles.menuTitle}
        rippleColor={BAR_RIPPLE_COLOR}
        accessibilityLabel={t('call.share')}
        onPress={() => {
          setVisible(false);
          onShare();
        }}
      />
      <RecordingControl
        state={recording}
        canStart={canRecord}
        busy={recordingBusy}
        onStart={() => {
          setVisible(false);
          onStartRecording();
        }}
        onStop={() => {
          setVisible(false);
          onStopRecording();
        }}
      />
    </Menu>
  );
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx jest src/screens/room/moreMenu`
Attendu : PASSE — 9 tests. Relancer trois fois : les ouvertures de menu doivent être stables
(mesuré : 12 séries sur 12).

- [ ] **Step 5 : éprouver par mutation**

Remplacer les deux rappels de `RecordingControl` par `onStart={onStartRecording}` et
`onStop={onStopRecording}` (sans le `setVisible(false)`). Le test « referme le menu après un
appui » doit rougir. Restaurer.
Intervertir `onShare()` et `onStartRecording()`. Le test « partage sans toucher à
l'enregistrement » doit rougir. Restaurer.

- [ ] **Step 6 : commit**

```bash
npx prettier --write src/screens/room/moreMenu.tsx src/screens/room/moreMenu.spec.tsx
git add src/screens/room/moreMenu.tsx src/screens/room/moreMenu.spec.tsx
git commit -m "feat(call): Open a more menu behind a single button"
```

---

### Task 8 : l'indicateur dans la séance

**Files:**
- Modify: `src/screens/room/call.tsx`
- Test: `src/screens/room/call.spec.tsx`

**Interfaces:**
- Consumes: `createRecordingStore` de `src/call/recordingStore` (Task 4) ;
  `RecordingIndicator` de `src/screens/room/recordingIndicator` (Task 5)
- Produces: rien que d'autres tâches consomment

C'est **la partie du périmètre qui ne dépend d'aucune surface** (§9) : l'indicateur n'est pas
une commande, il est vu par des gens qui n'ont aucun bouton. Elle est livrée séparément pour
cette raison : à la fin de cette tâche, tout participant mobile voit qu'il est enregistré,
qu'il en ait le droit ou non, et **même s'il rejoint une réunion déjà en cours
d'enregistrement**.

Les deux appels de Hook sont déclarés **avant les sorties anticipées**, avec les autres, comme
`roomViewStore` : il n'y a pas de rendu où l'écran aurait le droit de ne pas les appeler.

- [ ] **Step 1 : donner au faux `Room` les deux membres que le magasin lit**

Dans `src/screens/room/call.spec.tsx`, au-dessus de la déclaration de `mockRoom` :

```ts
let mockRoomMetadata: string | undefined;
let mockRoomIsRecording = false;
```

élargir le type de `mockRoom` :

```ts
const mockRoom: {
  localParticipant: unknown;
  remoteParticipants: Map<string, unknown>;
  readonly metadata: string | undefined;
  readonly isRecording: boolean;
  on: () => unknown;
  off: () => unknown;
} = {
```

ajouter les deux accesseurs juste après `remoteParticipants: new Map<string, unknown>(),` :

```ts
  get metadata(): string | undefined {
    return mockRoomMetadata;
  },
  get isRecording(): boolean {
    return mockRoomIsRecording;
  },
```

et les remettre à zéro dans le `beforeEach`, juste après
`mockRoom.remoteParticipants.clear();` :

```ts
  mockRoomMetadata = undefined;
  mockRoomIsRecording = false;
```

- [ ] **Step 2 : écrire les tests qui échouent**

À la fin de `src/screens/room/call.spec.tsx` :

```tsx
const STARTED_METADATA = JSON.stringify({
  recording_mode: 'screen_recording',
  recording_status: 'started',
});

describe('CallScreen, indicateur d’enregistrement', () => {
  it('montre l’indicateur à qui rejoint une réunion déjà enregistrée', async () => {
    // Le SDK n'émet PAS `RoomMetadataChanged` à la jonction : un indicateur
    // bâti sur l'abonnement seul resterait éteint toute la séance.
    mockRoomMetadata = STARTED_METADATA;
    mockRoomIsRecording = true;

    await render(withPaper(<CallScreen />));

    await waitFor(() =>
      expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.active'),
    );
  });

  it('n’affiche rien quand aucun enregistrement ne tourne', async () => {
    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    expect(screen.queryByTestId('recording-indicator')).toBe(null);
  });

  it('montre l’indicateur à qui n’a pas le droit d’enregistrer', async () => {
    // Ce qu'on peut faire et ce qu'on doit savoir sont deux questions
    // différentes. Une seconde phase et un second mode, pour qu'un libellé en
    // dur ne passe pas.
    mockRoomMetadata = JSON.stringify({
      recording_mode: 'transcript',
      recording_status: 'saving',
    });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', false));

    await render(withPaper(<CallScreen />));

    await waitFor(() =>
      expect(screen.getByTestId('recording-indicator')).toHaveTextContent('recording.saving'),
    );
  });
});
```

- [ ] **Step 3 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/call`
Attendu : ÉCHEC — `recording-indicator` introuvable.

- [ ] **Step 4 : implémenter**

Dans `src/screens/room/call.tsx`, ajouter deux imports, chacun à sa place alphabétique :

```tsx
import { createRecordingStore } from 'src/call/recordingStore';
```

(juste après `import { ensureMediaPermissions } from 'src/call/permissions';`)

```tsx
import { RecordingIndicator } from 'src/screens/room/recordingIndicator';
```

(juste après `import { ParticipantsPanel } from 'src/screens/room/participantsPanel';`)

Puis, immédiatement après le `useMemo` de `participants` :

```tsx
  // Une troisième lecture de la Room, indépendante des deux autres :
  // `getSnapshot()` lit `room.metadata` directement, sans attendre aucun
  // événement — le SDK n'émet pas `RoomMetadataChanged` à la jonction, et un
  // indicateur qui l'attendrait resterait éteint toute la séance pour qui
  // rejoint une réunion déjà enregistrée. Déclaré ici, avec les autres Hooks,
  // avant les sorties anticipées.
  const recordingStore = useMemo(() => createRecordingStore(session.getRoom()), [session]);
  const recordingState = useSyncExternalStore(recordingStore.subscribe, recordingStore.getSnapshot);
```

et, dans le rendu, juste après `<WaitingBanner … />` :

```tsx
      {/* Vu de tout le monde, y compris de qui n'a aucun bouton : ne rend rien
          au repos, donc toujours monté, jamais enveloppé d'une condition. */}
      <RecordingIndicator state={recordingState} />
```

- [ ] **Step 5 : lancer les tests**

Run : `npm test && npm run typecheck`
Attendu : tout vert.

- [ ] **Step 6 : éprouver par mutation**

Remplacer `state={recordingState}` par `state={{ phase: 'idle', mode: null }}`. Les deux tests
d'indicateur doivent rougir. Restaurer.

- [ ] **Step 7 : commit**

```bash
npx prettier --write src/screens/room/call.tsx src/screens/room/call.spec.tsx
git add src/screens/room/call.tsx src/screens/room/call.spec.tsx
git commit -m "feat(call): Mount the recording indicator in the meeting"
```

---

### Task 9 : la commande dans la séance

**Files:**
- Modify: `src/screens/room/call.tsx`
- Test: `src/screens/room/call.spec.tsx`

**Interfaces:**
- Consumes: `startRecording`, `stopRecording` de `src/api/recording` (Task 3) ;
  `canStartRecording`, `recordingErrorMessage`, `RecordingMessageKey` de `src/call/recording`
  (Tasks 1-2) ; `MoreMenu` de `src/screens/room/moreMenu` (Task 7)
- Produces: rien

Six modifications, toutes locales. La septième de §4.6 — le renommage de `moderationError` —
est **sans objet** : voir E1.

1. `MessageKey` s'élargit de `RecordingMessageKey`, une ligne.
2. `const [recordingBusy, setRecordingBusy] = useState(false)`.
3. `canRecord`, de la même forme que `canModerate`, `roomId !== null` inclus **pour la même
   raison exactement** : sans lui on fabriquait `/api/v1.0/rooms//mute-participant/`.
4. Deux gestionnaires qui **lisent `result.ok`**, avec un `.catch()` séparé.
5. `<MoreMenu>` remplace l'`IconButton` de partage dans la rangée. Sept cibles avant, sept
   après.
6. Deux assertions existantes de `call.spec.tsx` ouvrent désormais le menu avant d'appuyer sur
   `share-btn`, dont le `testID` ne change pas.

**Rien n'est écrit pour la reconnexion** (§5.5), et c'est délibéré. `call.tsx` rend déjà la
barre pour `connected` **et** `reconnecting` : les deux commandes restent pressables, et elles
partent en HTTP, indépendamment du transport LiveKit. Ce qui a changé pendant la coupure
revient par le tampon d'`emitWhenConnected`, rejoué après `Reconnected`, auquel le magasin est
abonné (tâche 4). Si un enregistrement a démarré pendant la coupure et qu'un appui sur
« démarrer » le suit de trop près, le 409 le dit. **Aucun cas particulier n'est à ajouter ;
aucune ligne de ce plan n'en écrit un.**

**Aucun état optimiste** (§5.1). Les métadonnées sont la source unique ; poser un « en cours »
local créerait une seconde source qui peut contredire la première. Il reste une fenêtre courte
où le 201 est reçu et la métadonnée pas encore : la commande y redevient « démarrer », et un
second appui y récolte un **409**, traduit en « un enregistrement est déjà en cours » — un
message juste, pas un mensonge. C'est la dégradation choisie : **pas de minuterie, pas d'état
inventé, une phrase exacte.**

- [ ] **Step 1 : faire passer les deux tests de partage par le menu**

Dans `src/screens/room/call.spec.tsx`, dans les deux tests du `describe('CallScreen, partage
du lien')`, insérer trois lignes avant le `waitFor` de `share-btn` :

```tsx
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
```

- [ ] **Step 2 : écrire les tests qui échouent**

À la fin de `src/screens/room/call.spec.tsx` :

```tsx
describe('CallScreen, commande d’enregistrement', () => {
  async function openMore(): Promise<void> {
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
  }

  it('n’offre pas la commande sans droit d’administration', async () => {
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', false));

    await render(withPaper(<CallScreen />));
    await openMore();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.queryByTestId('recording-toggle')).toBe(null);
  });

  it('n’offre pas la commande quand l’instance n’enregistre pas', async () => {
    // `recording.is_enabled` à faux : le serveur répondrait 404, et le geste
    // serait voué à échouer.
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue({
      ...ACCOUNT,
      instance: {
        ...ACCOUNT.instance,
        features: { recording: false, subtitle: true, telephony: false },
      },
    } as never);
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(withPaper(<CallScreen />));
    await openMore();

    await waitFor(() => expect(screen.getByTestId('share-btn')).toBeTruthy());
    expect(screen.queryByTestId('recording-toggle')).toBe(null);
  });

  it('démarre l’enregistrement du salon dont le serveur a rendu l’accès', async () => {
    // `r-9`, pas `r-1` : un identifiant en dur passerait le test avec le salon
    // par défaut.
    const start = jest
      .spyOn(recordingApi, 'startRecording')
      .mockResolvedValue({ ok: true, value: undefined });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
      ok: true,
      value: {
        room: { id: 'r-9', slug: 'reunion', name: 'r', accessLevel: 'trusted' },
        livekitUrl: 'wss://lk',
        token: 'lk',
        isAdministrable: true,
      },
    });

    await render(withPaper(<CallScreen />));
    await openMore();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    await waitFor(() => expect(start).toHaveBeenCalledWith(ACCOUNT, 'r-9'));
  });

  it('porte l’échec du démarrage jusqu’à la barre, sans le confondre avec un autre', async () => {
    // L'échec ordinaire de ces fonctions est une VALEUR, pas un rejet : un
    // `.catch()` seul ne le verrait jamais passer. C'est exactement le test qui
    // aurait attrapé les deux bogues du périmètre B. Le 409 distingue en outre
    // l'action : traduit avec `'stop'`, il donnerait « n'a pas pu être arrêté ».
    jest
      .spyOn(recordingApi, 'startRecording')
      .mockResolvedValue({ ok: false, error: { kind: 'server', status: 409 } });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(withPaper(<CallScreen />));
    await openMore();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('recording.errorBusy'),
    );
  });

  it('arrête l’enregistrement en cours et dit son échec propre', async () => {
    // Le 404 de l'arrêt veut dire « pas encore démarré », jamais « salon
    // introuvable ».
    mockRoomMetadata = STARTED_METADATA;
    mockRoomIsRecording = true;
    const stop = jest
      .spyOn(recordingApi, 'stopRecording')
      .mockResolvedValue({ ok: false, error: { kind: 'not-found' } });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(withPaper(<CallScreen />));
    await openMore();
    await waitFor(() =>
      expect(screen.getByTestId('recording-toggle')).toHaveTextContent('recording.stop'),
    );
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    await waitFor(() => expect(stop).toHaveBeenCalledWith(ACCOUNT, 'r-1'));
    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('recording.errorNotActive'),
    );
  });

  it('efface le message quand un essai suivant réussit', async () => {
    const start = jest
      .spyOn(recordingApi, 'startRecording')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(grantedAccess('trusted', true));

    await render(withPaper(<CallScreen />));
    await openMore();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));
    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('recording.errorForbidden'),
    );

    start.mockResolvedValue({ ok: true, value: undefined });
    await openMore();
    await waitFor(() => expect(screen.getByTestId('recording-toggle')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('recording-toggle'));

    await waitFor(() => expect(screen.queryByTestId('call-notice')).toBeNull());
  });
});
```

et ajouter l'import du module d'API en tête du fichier, juste après celui de `participants` :

```ts
import * as recordingApi from 'src/api/recording';
```

- [ ] **Step 3 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/call`
Attendu : ÉCHEC — `more-btn` introuvable (les deux tests de partage et les six nouveaux).

- [ ] **Step 4 : implémenter**

Dans `src/screens/room/call.tsx`, trois imports, chacun à sa place alphabétique :

```tsx
import { startRecording, stopRecording } from 'src/api/recording';
```

(juste avant `import { fetchRoomAccess } from 'src/api/rooms';`)

```tsx
import {
  canStartRecording,
  recordingErrorMessage,
  type RecordingMessageKey,
} from 'src/call/recording';
```

(juste après `import { ensureMediaPermissions } from 'src/call/permissions';`, avant l'import
de `src/call/recordingStore` posé en tâche 8)

```tsx
import { MoreMenu } from 'src/screens/room/moreMenu';
```

(juste après le bloc d'import de `src/screens/room/controlBar`)

Élargir `MessageKey` :

```tsx
type MessageKey =
  | 'error.network'
  | 'error.unauthorized'
  | 'call.ended'
  | 'call.permissionsDenied'
  | 'call.deviceSwitchFailed'
  | RecordingMessageKey;
```

Ajouter l'état, juste après `const [participantsOpen, setParticipantsOpen] = useState(false);` :

```tsx
  const [recordingBusy, setRecordingBusy] = useState(false);
```

Ajouter la garde, juste après `const hasLobby = …;` :

```tsx
  // Même forme que `canModerate`, `roomId !== null` inclus pour la même raison
  // exactement : sans lui, un salon dont `room.id` vaut `null` fabriquerait
  // `/api/v1.0/rooms//start-recording/`. `canStartRecording` est la frontière
  // de divergence entre `main` et le déployé — tout ce qu'elle laisse passer
  // est accepté par les deux serveurs.
  const canRecord =
    account !== null &&
    roomId !== null &&
    access !== null &&
    canStartRecording(account.instance.features, access);
```

Ajouter les deux gestionnaires, juste avant `const message: MessageKey | null =` :

```tsx
  // `result.ok` d'abord, un `.catch()` séparé pour l'exception inattendue :
  // l'échec ordinaire de ces deux fonctions est une *valeur* résolue, jamais un
  // rejet — un `.catch()` seul ne le verrait pas passer, et le périmètre B a
  // livré ce bogue deux fois. Aucun état optimiste : les métadonnées sont la
  // source unique, et un « en cours » local créerait une seconde source qui
  // peut contredire la première. Un succès efface l'erreur d'un essai
  // précédent, comme les trois actions de modération.
  const handleStartRecording = (): void => {
    if (account === null || roomId === null) return;
    setRecordingBusy(true);
    startRecording(account, roomId)
      .then((result) => {
        setRecordingBusy(false);
        setNotice(result.ok ? null : recordingErrorMessage('start', result.error));
      })
      .catch(() => {
        setRecordingBusy(false);
        setNotice('error.network');
      });
  };

  // Le serveur n'exige pas d'être celui qui a démarré l'enregistrement pour
  // l'arrêter : la commande est offerte à tout administrateur du salon.
  const handleStopRecording = (): void => {
    if (account === null || roomId === null) return;
    setRecordingBusy(true);
    stopRecording(account, roomId)
      .then((result) => {
        setRecordingBusy(false);
        setNotice(result.ok ? null : recordingErrorMessage('stop', result.error));
      })
      .catch(() => {
        setRecordingBusy(false);
        setNotice('error.network');
      });
  };
```

Enfin, **remplacer** l'`IconButton` de partage dans la rangée :

```tsx
        <IconButton
          testID="share-btn"
          icon="share-variant"
          iconColor={BAR_ICON_COLOR}
          rippleColor={BAR_RIPPLE_COLOR}
          style={barStyles.button}
          hitSlop={BAR_HIT_SLOP}
          onPress={handleShare}
          accessibilityLabel={t('call.share')}
        />
```

par :

```tsx
        {/* La rangée est pleine à 357 dp sur 360 : une huitième cible en
            demanderait 409. Le partage, seule commande de la barre qu'on
            n'utilise qu'une fois par réunion, passe donc derrière ce menu, qui
            porte aussi l'enregistrement. Sept cibles avant, sept après — et la
            commande d'enregistrement n'est jamais adjacente au bouton
            quitter. */}
        <MoreMenu
          recording={recordingState}
          canRecord={canRecord}
          recordingBusy={recordingBusy}
          onShare={handleShare}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
        />
```

- [ ] **Step 5 : lancer les tests**

Run : `npx jest src/screens/room/call`
Attendu : PASSE — 65 tests, dont les deux de partage et les six nouveaux.

- [ ] **Step 6 : éprouver par mutation**

Remplacer `recordingErrorMessage('start', result.error)` par
`recordingErrorMessage('stop', result.error)`. Le test du 409 doit rougir. Restaurer.
Remplacer `canRecord` par `true` dans les props de `MoreMenu`. Les deux tests d'absence de
commande doivent rougir. Restaurer.

- [ ] **Step 7 : vérifier la barre complète**

```bash
npx prettier --write src/screens/room/call.tsx src/screens/room/call.spec.tsx
npm test && npm run typecheck && npm run lint && npm run format:check
```

Attendu : **537 tests verts**, `tsc` propre, un seul avertissement de lint (celui,
pré-existant, de `src/i18n/index.ts:32`), format vert.

- [ ] **Step 8 : commit**

```bash
git add src/screens/room/call.tsx src/screens/room/call.spec.tsx
git commit -m "feat(call): Start and stop the recording from the meeting"
```

---

## Ce que ce plan ne fait pas

Écrit, donc opposable. Une limite tue n'est pas un livrable.

- **Pas de sous-titres** : ni bouton, ni fonction d'API, ni affichage (§3.3). Trois faits se
  cumulent : `start-subtitle` est **irréversible** (aucun `stop-subtitle` n'existe,
  `SubtitleService.stop_subtitle` lève `NotImplementedError`, l'agent tourne jusqu'à la fin de
  la séance) ; le rendu mobile des transcriptions LiveKit **n'a pas été étudié**, donc le
  bouton déclencherait un effet serveur définitif dont l'application ne peut rien montrer à
  celui qui appuie ; et le transport de son jeton sur le déployé est **inféré, pas vérifié** —
  c'est le seul endpoint du périmètre dont le contrat ne soit pas établi. Le jour où
  l'application saura afficher les transcriptions **et** qu'un appel réel confirmera le
  transport, le bouton deviendra honnête sous une seule forme : une confirmation explicite
  disant que l'action ne s'annule pas, puis un état verrouillé pour le reste de la séance —
  jamais un masquage local à la manière du web, qui laisse l'agent transcrire à l'insu de
  l'utilisateur.
- **Pas de mode `transcript` démarrable.** Il est lu et nommé — un participant web peut le
  démarrer, et l'indicateur le dit sous son propre nom — jamais déclenché (§3.4).
- **Pas de `options.language`, ni de sélecteur** (§3.8). Le corps émis est
  `{"mode":"screen_recording"}` et rien d'autre.
- **Pas d'accès aux enregistrements terminés** : ni liste, ni téléchargement, ni suppression
  (§3.6). L'artefact se récupère depuis le client web.
- **Un enregistrement démarré depuis le mobile n'est visible que de celui qui l'a démarré.**
  `perform_create` ne crée un `RecordingAccess(role=OWNER)` que pour l'appelant ; les autres
  organisateurs ne le retrouveront pas dans `/recordings/`. Aucun accès n'est ajouté, faute
  d'une route établie (§2.4.4).
- **Pas de compte à rebours sur `max_duration`**, ni d'avertissement d'expiration. Les deux
  valeurs sont déclaratives ; la coupure réelle vient de l'egress LiveKit et l'expiration du
  cycle de vie du bucket.
- **Pas de traitement des messages de données `screenRecordingLimitReached` /
  `transcriptionLimitReached`.** Notifications ponctuelles, que quiconque arrive après rate ;
  l'état durable est déjà couvert par les métadonnées.
- **Pas de consentement demandé aux participants.** Le backend n'expose rien de tel ;
  l'indicateur informe, il ne négocie pas.
- **Pas de sortie de l'angle mort du backend.** Un enregistrement resté `initiated` bloque le
  salon en 409 et **aucun appel client ne peut le débloquer** : `stop-recording` ne cible que
  le statut `active`. L'application affiche des messages exacts ; elle ne répare pas. Le
  correctif est en amont.
- **La phase `aborted` peut rester affichée** si `egress_ended` n'arrive jamais. Rien d'autre
  ne l'efface. Accepté : la nettoyer nous-mêmes demanderait une minuterie et un état local,
  c'est-à-dire une seconde source de vérité.
- **Pas de notification hors application.** Même raison qu'au périmètre B : il faudrait des
  notifications push et un backend meet qui sache les émettre.

## Ce qu'aucun test de ce plan ne prouve

1. **Que le serveur de production accepte notre corps.** Rien dans ce dépôt n'appelle
   `meet.linagora.com`. Le contrat est lu dans la source de `main`, et la PR #794 ne le
   touche pas — mais aucun test n'attraperait un changement de forme du corps. Seul un appel
   réel le prouve.
2. **Que `isAdministrable` signifie toujours `is_administrator_or_owner` sur le build
   déployé.** Toute la politique de permission repose là-dessus.
3. **La durée réelle de la phase `starting`.** Un faux `Room` prouve la machine à états, jamais
   une durée. Or la décision de ne pas griser l'arrêt s'appuie sur le fait que cette phase est
   courte — mesurable seulement sur appareil contre une instance réelle.
4. **Que `egress_ended` efface bien les clés**, donc que `saving` et `aborted` soient
   transitoires. Lu dans la source du backend, jamais observé.
5. **Que LiveKit pousse effectivement `RoomMetadataChanged` à un participant absent au moment
   du changement.** Ce plan ne s'y fie pas — il lit — et l'abonnement à `Reconnected` est une
   assurance, pas une preuve.
6. **Le contraste perçu.** Jest ne rend aucun pixel : le bogue à 1,08:1 du périmètre B passait
   tous les tests, celui à 1,13:1 du périmètre A aussi, et les ratios des contraintes globales
   restent calculés, pas mesurés sur un rendu. Mais depuis la tâche 5, une égalité stricte
   `toHaveStyle` protège contre leur cause la plus commune — un retrait silencieux de la
   couleur explicite — voir « Le fond de la séance est sombre dans les deux schémas. Paper ne
   le sait pas. » dans `AGENTS.md`. Cette garde-là ne remplace pas la règle : elle protège
   qu'elle reste posée.
7. **La lisibilité réelle du menu de dépassement sur appareil.** L'ancre, l'ombre portée et la
   position du `Menu` au-dessus de la barre n'ont été vues par aucun œil : RNTL ne place rien.
