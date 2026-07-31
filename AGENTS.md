# Agent rules — twake-visio

Instructions for any AI coding agent working in this repository. Read this before
writing code.

This file is the **single source of truth**. `CLAUDE.md` only points back here.

## Two levels of rules

1. **Generic Twake / Cozy conventions** live in
   [linagora/twake-guidelines](https://github.com/linagora/twake-guidelines).
   Claude Code: `/plugin install twake-guidelines@twake-guidelines`.
2. **This repo's own decisions** are below. On conflict, **this file wins here**.

## This app is an OIDC app, not a Cozy Stack app

`meet` authenticates through `lasuite.oidc_login`. There is no Cozy Stack behind it,
so **do not add `cozy-client`, `cozy-pouch-link` or any `cozy-*` dependency**. The
cozy-client query rules in twake-guidelines do not apply here.

## Never a WebView for credentials

Sign-in goes through `expo-web-browser`'s `openAuthSessionAsync`. The app is a public
OIDC client: PKCE only, **never a client_secret**. Redirect scheme is `twakevisio://`,
never `cozy://`.

## Design system: home-grown RN components on transcribed tokens

`twake-mui` and `cozy-ui` are **web (MUI) libraries — do not import them in React
Native**. Use them as a **token reference only**. `src/ui/tokens` is the single source
of style; `react-native-paper` covers standard chrome and is themed from those same
tokens.

No inline styles: never a `style={{…}}` literal, always `StyleSheet.create` fed by the
tokens.

### Le fond de la séance est sombre dans les deux schémas. Paper ne le sait pas.

`call.tsx` force `backgroundDark` quel que soit le schéma système — c'est la convention de
toute la visioconférence, et c'est délibéré. Mais `react-native-paper` fait retomber la
couleur de son texte sur `theme.colors.onSurface`, que `src/ui/theme.ts` fixe à
`textLight` (`#1A1A1A`) en schéma **clair**, lequel est le défaut de la plupart des
appareils.

**Tout composant posé sur cet écran doit donc poser une couleur explicite issue de
`src/ui/tokens`.** Le périmètre B a livré deux composants sans le faire : **1,08:1** de
contraste, du noir sur du noir, un bandeau d'admission dont on ne pouvait pas lire le nom
de la personne qui frappait. Le précédent correct est `stage.tsx:45`.

Cela vaut pour `Text`, pour le `titleStyle` d'un `List.Item` — sa prop `style` ne colore
pas le titre —, pour le `textColor` d'un `Button` en mode `text` ou `outlined`, pour
l'`iconColor` d'un `IconButton`, pour le `contentStyle` d'un `Menu` — qui porte le fond de
la feuille, sinon calculé depuis l'élévation du thème — et pour le `titleStyle` d'un
`Menu.Item`, sa prop `style` ne colorant pas plus le titre que celle d'un `List.Item`.

**Et pour le `rippleColor` de tout `IconButton` ou `Menu.Item`.** Sans lui, Paper calcule
l'ondulation depuis `theme.colors.onSurface` — le même quasi-noir en schéma clair, sur le
même fond forcé sombre. Le périmètre A a livré ce défaut avec tous ses tests au vert :
**1,13:1**, invisible. Ce n'est pas de l'illisibilité, c'est une affordance perdue — aucun
retour visuel à l'appui. Voir `controlBar.ts` → `BAR_RIPPLE_COLOR`, et son commentaire pour
le détail : une couleur fournie ici est utilisée telle quelle par Paper (`IconButton/utils.ts`,
`Menu/utils.ts`), sans l'alpha qu'il applique à sa valeur par défaut.

**Et jamais de bouton `disabled` sur cet écran.** `IconButton/utils.ts:88-93` teste
`disabled` **avant** `customIconColor` et rend `theme.colors.onSurfaceDisabled`, un
quasi-noir en thème clair : aucune couleur explicite ne peut le rattraper. Masquer une
commande indisponible, ne pas la griser — le précédent est `participantsPanel.tsx`, qui ne
rend pas les actions de modération plutôt que de les désactiver.

**Aucun test ne peut prouver qu'un texte est lisible** : RNTL ne rastérise rien, donc un
contraste perçu ne se mesure qu'en lisant le thème, le fond et le composant ensemble — ou
sur un appareil.

**Mais un test peut prouver que la couleur explicite n'a pas été retirée**, et celui-là
vaut d'être écrit : `expect(screen.getByTestId(…)).toHaveStyle({ color: tokens.color.textDark })`.
Sans `PaperProvider` ancêtre, un `Text` dépouillé de son style retombe sur
`rgba(28, 27, 31, 1)` — le `neutral10` du thème clair par défaut de Paper. Ce n'est pas la
valeur qu'afficherait l'application réelle, qui retomberait sur son propre `onSurface` ;
mais l'assertion étant une égalité stricte, **n'importe quel repli la fait échouer**. C'est
la cause qu'on garde, pas le symptôme. Précédents : `participantsPanel.spec.tsx` (cinq, le
plus du dépôt), `waitingBanner.spec.tsx`, `cameraMenu.spec.tsx`,
`recordingIndicator.spec.tsx`, `recordingControl.spec.tsx`.

**Deux paquets déclarent ces matchers sous les mêmes noms, et ce n'est pas celui qu'on
croit qui reste en place.** `jest.setup.ts` importe `@testing-library/jest-native/extend-expect`,
chargé par `setupFilesAfterEnv` — donc avant le module de test. Chaque spec importe ensuite
`@testing-library/react-native`, dont `dist/index.js:6` fait lui-même
`require('./matchers/extend-expect')` : un second `expect.extend`, plus tardif, qui
remplace le premier pour tout nom commun. Sur les douze matchers de `jest-native`
(`extend-expect.js`), dix sont ainsi repris par RNTL 14 — `toHaveStyle`,
`toHaveTextContent`, `toBeVisible`, `toBeDisabled`, `toBeEnabled`, `toHaveProp`,
`toContainElement`, `toBeOnTheScreen`, `toBeEmptyElement`, `toHaveAccessibilityValue` — ;
seuls `toHaveAccessibilityState` et `toBeEmpty` restent ceux de `jest-native`, absents du
paquet qui charge en second. Ce n'est pas cosmétique : toute la doctrine ci-dessus tient
sur `toHaveStyle`, et `toHaveTextContent` en hérite la même rigueur dès qu'on lui passe une
chaîne — RNTL compare la chaîne **entière** (`matches()`, `dist/matches.js:8-19`,
`exact = true` par défaut → `normalizedText === normalizedMatcher`), quand `jest-native`
(`dist/utils.js:114-119`) aurait cherché une sous-chaîne par `includes()`. Seule une
**regex** cherche un fragment sous RNTL 14.

**Elle vaut aussi pour la surface**, pas seulement pour le texte posé dessus : un `Menu`
expose son `Surface` sous le `testID` `` `${testID}-surface` `` (`Menu.tsx:680`), donc
`toHaveStyle({ backgroundColor: tokens.color.surfaceDark })` s'y applique. Précédent :
`moreMenu.spec.tsx`. On force la surface **et** le texte, ou ni l'un ni l'autre — une
surface forcée sous un texte laissé au thème est le pire des trois cas.

**Cette garde vaut pour le texte. Pour une icône, elle dépend de la façon dont l'icône
atteint l'écran, pas de sa nature.** Un glyphe rendu directement avec son propre `testID`
— le précédent est la coche de `menuCheck.tsx`, gardée par `cameraMenu.spec.tsx` et
`audioOutputControl.spec.tsx` — est un `Text` comme un autre, donc joignable. L'`iconColor`
d'un `IconButton` à icône-chaîne (`icon="dots-vertical"`, le cas par défaut) ne l'est
**jamais** : `IconButton.tsx:211` rend `<IconComponent color={iconColor} source={icon} />`
**sans lui transmettre de `testID`**, et le chemin par défaut pose en plus
`accessibilityElementsHidden`. Aucun des sept `IconButton` de la barre ne garde son
`iconColor`, `leave-btn` compris ; n'en fabrique pas un. Passer `icon` en fonction rendrait
la garde possible, mais c'est un changement d'architecture, pas une correction de test.

**`Button` fait un autre choix que `IconButton` pour son propre contenu — un composant
différent, pas une exception à la borne qui précède.** `Button.tsx:405` (react-native-paper
5.15.3) pose ``testID={`${testID}-text`}`` sur son `Text` interne, donc
`toHaveStyle({ color: … })` s'y applique bien — `textColor` compris, pour ses variantes
`text` et `outlined`. Précédents : `participantsPanel.spec.tsx:230-249` (les trois boutons
de modération) et `handBanner.spec.tsx:72`. L'absence de ce fait a produit une affirmation
fausse dans un plan d'implémentation, rattrapée seulement parce qu'un implémenteur a refusé
de la croire et l'a vérifiée à la source. `` `${testID}-text` `` reste une convention
**interne** à Paper, pas un contrat d'API : une montée de version peut la renommer sans
préavis, et le rouge de la suite serait alors le seul signal.

**Et jamais pour `rippleColor`** — ne la cherche pas là non plus, elle est hors de portée
pour une autre raison. Le préréglage Jest fixe `Platform.OS` à `'ios'`,
donc `TouchableRipple.supported` (`TouchableRipple.native.tsx:130`) est faux et la branche
empruntée n'expose la couleur que dans une vue d'ondulation **transitoire**, conditionnée
par `pressed`. `jest.replaceProperty(Platform, 'OS', 'android')` — l'idiome pourtant en
usage dans `audioRoute.spec.ts` — **ne suffit pas** : cette constante est calculée une fois
au chargement du module, avant qu'aucun corps de test ne s'exécute. Il faudrait
`jest.resetModules()` et un ré-import isolé. Aucun des composants de la barre n'a un tel
test ; n'en fabrique pas un.

## Instance discovery has a deliberate fallback

`/api/v1.0/config/` is the contract. `resolveOidcFromRedirect()` is a non-contractual
fallback reading the `Location` header of `/api/v1.0/authenticate/`. Delete it once
every target instance exposes `config.oidc`. WebFinger is **not** served by meet
instances, so the twake-mobile-login discovery path does not apply.

## Room access level is a product requirement, not a detail

A room creator must not need to be present for the meeting to start. `restricted`
breaks this outright and `trusted` breaks it for external guests. The creation screen
always states the consequence in plain language, never just the raw level name.
`perform_create` grants `owner` to the creator alone, so co-organizers must be added
via `POST /resource-accesses/`.

## Expo SDK: this app runs ahead of twake-drive-mobile, deliberately

This app is on **Expo SDK 57 / RN 0.86**, `twake-drive-mobile` is on SDK 54 / RN 0.81.
That is a chosen divergence, not drift: a greenfield app starting three majors behind
would begin its life already needing an upgrade. Do not "align" the two by downgrading
this repo.

## `.npmrc` carries `legacy-peer-deps=true` for one bounded reason

`@livekit/components-react` pulls `react-dom` — a **web** package never executed in a
native build — whose peer wants a newer React patch than Expo pins. The alternative,
`overrides` / `resolutions`, is explicitly forbidden by `twake-package-manager-audit`.
**Do not widen this setting to paper over any other conflict**, and revisit it whenever
LiveKit or Expo bumps React.

### The reason is bounded. The effect is not.

`legacy-peer-deps=true` makes npm behave like npm v6: it installs **no peer dependency
at all, ever**. Not just `react-dom` — every peer of every package. A missing peer stays
invisible until something reaches for it, so it surfaces as an unrelated failure, far
from its cause. It has bitten three times:

| Missing peer                                              | Wanted by                                           | How it surfaced                                 |
| --------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| `test-renderer`                                           | `@testing-library/react-native` 14                  | the first screen spec could not load the module |
| `react-native-nitro-modules`                              | `react-native-mmkv` 4                               | the first native build failed in Gradle         |
| `react-native-gesture-handler`, `react-native-reanimated` | `react-native-drawer-layout`, pulled by expo-router | found by sweeping, before they could bite       |

Adding the last two pulled in `react-native-worklets`, and that one pulled in
`@react-native/metro-config` — each absent for the same reason, each revealed only by
installing the one before it.

**So when something fails in a way that makes no sense — a module that cannot be found,
a Gradle project that does not exist, a native crash on a screen that used to work —
suspect a missing peer before suspecting your own code.** Sweep the tree rather than
guessing: walk `node_modules/*/package.json`, collect every non-optional
`peerDependencies` key, and report the ones with no directory of their own. Ignore the
web-only hits (`react-dom`, `@testing-library/dom`, `@types/dom-mediacapture-record`) —
those are the bounded reason above, and they are never executed in a native build.

Install with `npx expo install`, never `npm install`, so the version matches the Expo
SDK instead of being whatever was published last.

## Commit subject case

`@commitlint/config-conventional` forbids sentence-case subjects by default, which
contradicts `twake-git-conventions` ("imperative mood with sentence-case"). The repo
overrides `subject-case` to permit it. The guideline wins; the default is wrong for us.

## Native build

Continuous native generation: `android/` and `ios/` are gitignored and produced by
`expo prebuild`. All native config goes through config plugins. **Do not commit the
native directories.** Note this diverges from `twake-drive-mobile`, which maintains
them by hand.

The iOS Simulator cannot publish camera or microphone — iOS testing needs a device.

## Internationalisation

Seven locales (`en fr es it de vi ru`), all filled before merge. No hardcoded
user-facing string. `src/i18n/index.spec.ts` fails if a key is missing anywhere.

## Ce qui est versionné, et ce qui ne l'est pas

`docs/superpowers/` **est versionné** : les spécifications et les plans d'implémentation
sont des documents de conception, au même titre que ce fichier. Ils portent des faits
mesurés — motifs d'URL relevés dans un bundle, versions de serveur lues dans une réponse,
limites de débit lues dans une configuration — que rien d'autre ne consigne, et un
implémenteur travaille depuis eux.

`.superpowers/` **est ignoré** : ledgers, briefs, rapports et paquets de revue d'une
exécution. Éphémère par nature, régénérable, sans valeur une fois la branche fusionnée.

La distinction a été payée. Sortir `docs/superpowers/` du suivi a coûté, en une journée :
les prérequis d'enregistrement OIDC disparus du dépôt et rapatriés dans le `README` en
catastrophe, une spécification qu'un relecteur ne pouvait pas ouvrir depuis GitHub, un plan
à recopier à la main dans chaque worktree — et la **perte effective** du plan du socle et
de son document de conception, 5363 lignes effacées du disque par une fusion, récupérées
depuis l'historique.

Un document qu'aucune branche ne porte ne suit pas les worktrees, ne survit pas à un clone,
et disparaît sans bruit à la première fusion qui le supprime.

## Tests

`*.spec.ts` / `*.spec.tsx`, colocated. No snapshots. Bar: `npm test`,
`npm run typecheck`, `npm run lint` green.

### Espionner un export de module : `import * as X` ne suffit pas, et c'est indétectable

`jest.spyOn(RN, 'useWindowDimensions')` posé sur `import * as RN from 'react-native'`
**n'atteint pas le composant**. Le `_interopRequireWildcard` de Babel copie les
**descripteurs d'accesseur** du module dans un objet de namespace distinct : avant tout
espion, les deux objets exposent donc la même fonction — `raw.fn === ns.fn` rend `true`,
et rien n'a l'air anormal. La divergence naît **au moment du `spyOn`** : la propriété étant
`configurable`, jest la redéfinit **sur la copie seule**, et l'objet brut que lit l'import
nommé du composant garde son getter d'origine. L'espion est réel, il fonctionne, et il est
posé sur un objet que le composant ne touche jamais.

**Le piège ne rend pas la suite verte. Il rend définitivement vertes les assertions qui
tombent sur la valeur par défaut.** Mesuré : sur six tests d'orientation écrits ainsi, les
trois qui attendaient le paysage échouaient bruyamment, et les trois qui attendaient le
portrait passaient **à vide** — ils auraient passé contre une implémentation nulle, la prop
valant déjà `true`. Un copier-coller se fait donc attraper, mais par le mauvais test, et la
moitié de la suite reste du poids mort à jamais.

La forme qui marche est `const RN: typeof import('react-native') = require('react-native');`
— précédents : `src/auth/accounts.spec.ts:162-165` et `src/screens/room/stage.spec.tsx`. Elle
demande un `eslint-disable-next-line @typescript-eslint/no-require-imports`, ciblé sur la
seule ligne, avec son motif écrit au-dessus.

**Et un fichier qui espionne un objet de module partagé doit appeler `jest.restoreAllMocks()`
dans son `beforeEach`.** Dix-huit fichiers de spec le font déjà ; celui qui l'oublie laisse
son dernier bouchon fuir vers les tests suivants, qui lisent alors une dimension qu'ils n'ont
pas posée. Inoffensif tant que personne n'ajoute un test de disposition à la suite — et
invisible le jour où quelqu'un le fait.

**`@testing-library/react-native` 14 is asynchronous.** `render`, `fireEvent` and its
`.press` / `.changeText` shorthands, `renderHook` and `cleanup` all return promises
since RNTL moved onto the `test-renderer` package. Every call needs `await`. Forget it
and `render` never binds `screen`, so the next query throws ``render` function has not
been called` — and `tsc` will not warn you, because an unawaited promise is a valid
expression statement. RNTL 14 also needs `test-renderer` as an explicit devDependency:
`legacy-peer-deps=true` means npm never installs a peer on its own.

## The `unknown` double-assertion ban has one exception: spec files

The project bans `x as unknown as T`, and `eslint.config.js` enforces that ban — but
**`*.spec.ts` / `*.spec.tsx` files are exempt**. The reason: mocking `global.fetch` in
tests requires `as unknown as typeof fetch`, and the project's own test suite uses that
pattern throughout. The exemption is scoped to test files only and has been verified
not to leak into application code; the `enum` and `export default` bans still apply
inside test files. Anyone tempted to widen the exemption beyond spec files should
instead type the mock properly.

## The `export default` ban has one exception: route files under `app/`

The project rule is named exports only, never `export default` — and
`eslint.config.js` enforces it. The one exception is files under `app/`, where
**expo-router requires a default export** to discover a route. The exception is
enforced by a scoped eslint block matching `app/**/*.ts(x)` and extends to nothing in
`src/`. A file that moves out of `app/` must lose its default export on the way.

## Screens live in `src/screens`; `app/` holds thin routes only

expo-router's `require.context` pulls **every** `.tsx` under `app/` into the bundle and
excludes only `+api`, `+html` and `+middleware` — there is no test-file convention it
honours. A spec colocated under `app/` therefore becomes a route _and_ drags
`@testing-library/react-native` into the production graph, where Metro dies on its
`require("console")`. This is a build failure, not a warning.

So an `app/` route file contains one line and no logic:

```tsx
export { WelcomeScreen as default } from 'src/screens/welcome';
```

The screen itself is a named export in `src/screens/`, mirroring the route path
(`app/room/create.tsx` → `src/screens/room/create.tsx`), with its spec beside it.
Colocation is preserved; the sweep never sees it. `_layout.tsx` and pure redirects like
`index.tsx` are genuine routing and stay in `app/`.
