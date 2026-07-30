# Twake Visio — Plan d'implémentation du socle

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer une application React Native permettant de s'authentifier sur une instance `suitenumerique/meet` et de rejoindre une visioconférence, Android d'abord.

**Architecture:** Quatre couches en dépendance stricte descendante — `instance/` (découverte, ne dépend de rien), `auth/` (OIDC PKCE, dépend de `instance/`), `api/` (REST meet, dépend de `auth/`), `call/` (LiveKit, ne dépend que du couple URL + jeton que lui passe `api/`). Cette dernière frontière permet de tester la séance sans SSO ni backend.

**Tech Stack:** Expo SDK 54, expo-router, React Native 0.81.5, TypeScript strict, `@livekit/react-native`, jest + `@testing-library/react-native`.

**Spec :** `docs/superpowers/specs/2026-07-29-twake-visio-socle-design.md`

## Global Constraints

Ces règles s'appliquent à **toutes** les tâches. Elles ne sont pas répétées ensuite.

**Versions exactes** (constatées après la Task 1 — le plan visait initialement le SDK 54
pour s'aligner sur `twake-drive-mobile` ; le SDK courant a été retenu, projet neuf) :
- `expo` ~57.0.8, `expo-dev-client`, `expo-router` ~57.0.8, `react-native` 0.86.0, `react` 19.2.3
- `@livekit/react-native` 2.12.0, `@livekit/react-native-webrtc` 144.1.2, `livekit-client` 2.21.0, `@livekit/react-native-expo-plugin` 1.0.2

**Aucun module natif Node importé dans `src/` ni `app/`.** Le test des mocks tire
`node:crypto`, ce qui exige une référence aux types Node — et une référence de types
est **globale au programme**, pas locale au fichier, quoi qu'en suggère sa position.
Constaté : la seule présence de `__mocks__/expo-crypto.ts` fait typechecker
`import fs from 'fs'` dans `src/`. TypeScript ne peut donc pas garder cet invariant, et
c'est **eslint qui doit l'imposer** — `no-restricted-imports` bannissant les builtins
Node dans `src/` et `app/`. Sans ce garde-fou, un `import fs` compile puis plante sur
l'appareil.

**`.npmrc` porte `legacy-peer-deps=true`** — motif borné : `@livekit/components-react`
tire `react-dom`, paquet **web** jamais exécuté en natif, dont le pair réclame un patch
de React plus récent que celui qu'Expo épingle. `overrides` et `resolutions` restent
interdits par `twake-package-manager-audit`. Ne pas élargir ce réglage à autre chose.

**TypeScript :** `"strict": true`. Interdits : `any`, `enum` (utiliser des unions de chaînes), `@ts-ignore` (utiliser `@ts-expect-error` avec explication et ticket), `as unknown as T`, `"strict": false`. Type de retour explicite sur toute fonction non triviale. Tout symbole exporté est typé.

**Exports :** exports nommés uniquement, jamais `export default`. **Unique exception :** les fichiers de route sous `app/`, où `expo-router` impose `export default`. Cette exception ne s'étend à aucun fichier de `src/`.

**JavaScript :** `===` / `!==` uniquement. `async`/`await`, jamais de chaînes `.then()`. Aucun `console.log` dans le code commité. `Intl` ou `date-fns`, jamais `moment`. Membres privés avec `#`, jamais `_`. Toute opération faillible renvoie un résultat discriminé ; `throw` réservé aux invariants violés. `null` pour une absence intentionnelle, jamais `undefined` volontaire.

**React :** composants fonctionnels uniquement. Gestionnaires nommés (`handleX`) pour toute logique non triviale.

**Styles :** aucun littéral `style={{…}}`. Toujours `StyleSheet.create` alimenté par `src/ui/tokens`.

**Tests :** `jest` + `@testing-library/react-native`. Simuler `fetch` via
`globalThis.fetch`, jamais `global.fetch` : ce dernier exigerait `"node"` dans les
`types` du tsconfig, ce qui ferait passer `import fs from 'fs'` au typecheck dans une
application React Native où il plante à l'exécution. Fichiers `*.spec.ts` / `*.spec.tsx` **colocalisés** avec la source, jamais de dossier `__tests__`. Aucun snapshot (`toMatchSnapshot` interdit). `data-testid` en kebab-case. `queryByX` + `.toBe(null)` pour asserter une absence, jamais `getByX` + `.toBeDefined()`.

**Commits :** Conventional Commits. Sujet à l'impératif, première lettre majuscule, un seul sujet par commit. Types autorisés : `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.

**Constantes du projet :**
- Schéma de redirection : `twakevisio://` — jamais `cozy://`
- `client_id` par défaut : `twake-visio`
- Instance de référence : `https://meet.linagora.com`, SSO `https://sso.linagora.com`
- Locales : `en`, `fr`, `es`, `it`, `de`, `vi`, `ru` — les sept remplies avant toute fusion, aucune chaîne visible en dur
- `android/` et `ios/` sont gitignorés (génération native continue)
- Jetons dans `expo-secure-store` uniquement, jamais MMKV

**Barre de validation :** `npm test`, `npm run typecheck`, `npm run lint` au vert avant chaque commit.

---

## Structure des fichiers

```
app/                                   routes expo-router (export default toléré)
  _layout.tsx                          fournisseurs, thème, i18n
  index.tsx                            aiguillage selon session
  welcome.tsx                          trois entrées
  server.tsx                           saisie serveur d'organisation
  home.tsx                             mes réunions, rejoindre par code
  room/create.tsx                      création
  room/[slug]/prejoin.tsx              pré-jonction
  room/[slug]/lobby.tsx                salle d'attente
  room/[slug]/call.tsx                 séance

src/
  instance/
    types.ts                           InstanceConfig, InstanceResult
    knownInstances.ts                  table domaine → client_id
    discovery.ts                       fetchInstanceConfig, resolveOidcFromRedirect
    discovery.spec.ts
  auth/
    pkce.ts                            createPkcePair
    pkce.spec.ts
    oidc.ts                            buildAuthorizeUrl, exchangeCode, refreshTokens
    oidc.spec.ts
    storage.ts                         lecture/écriture secure store
    accounts.ts                        registre multi-comptes
    accounts.spec.ts
    session.ts                         session active, rafraîchissement en vol unique
    session.spec.ts
    login.ts                           orchestration navigateur + callback
  api/
    types.ts                           ApiResult, ApiError
    client.ts                          authedFetch
    client.spec.ts
    rooms.ts                           fetchRoomAccess, createRoom, fetchMyRooms, requestEntry
    rooms.spec.ts
    users.ts                           fetchMe
  call/
    types.ts                           RoomAccess, CallState
    connection.ts                      connect, disconnect, machine à états
    connection.spec.ts
    media.ts                           micro, caméra, sortie audio
  ui/
    tokens/index.ts                    palette, espacements, typographie
    theme.ts                           thème Paper dérivé des tokens
  i18n/
    index.ts                           initialisation i18next
    locales/{en,fr,es,it,de,vi,ru}.json
```

---

## Phase 0 — Fondations

### Task 1: Scaffold, outillage et intégration continue

**Files:**
- Create: `package.json`, `app.json`, `tsconfig.json`, `.gitignore`, `eslint.config.js`, `.prettierrc`, `jest.config.js`, `jest.setup.ts`, `lefthook.yml`, `commitlint.config.js`, `.github/workflows/ci.yml`, `app/_layout.tsx`, `app/index.tsx`
- Test: `src/smoke.spec.ts`

**Interfaces:**
- Consumes: rien
- Produces: scripts `npm test`, `npm run typecheck`, `npm run lint`, `npm start`

- [ ] **Step 1: Initialiser le projet Expo**

```bash
npx create-expo-app@latest . --template blank-typescript
npx expo install expo-router expo-dev-client expo-linking expo-constants \
  expo-secure-store expo-web-browser expo-crypto expo-localization \
  expo-build-properties \
  react-native-safe-area-context react-native-screens react-native-paper \
  react-native-mmkv i18next react-i18next intl-pluralrules date-fns
npm i -D @testing-library/react-native @testing-library/jest-native \
  jest-expo @types/jest eslint prettier typescript lefthook \
  @commitlint/cli @commitlint/config-conventional
npx expo install @livekit/react-native@2.12.0 \
  @livekit/react-native-webrtc@144.1.2 livekit-client@2.21.0
npm i -D @livekit/react-native-expo-plugin@1.0.2
```

- [ ] **Step 2: Configurer TypeScript en strict**

`tsconfig.json` :

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "paths": { "src/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 3: Configurer app.json avec le schéma et les plugins**

```json
{
  "expo": {
    "name": "Twake Visio",
    "slug": "twake-visio",
    "scheme": "twakevisio",
    "version": "0.1.0",
    "orientation": "default",
    "plugins": [
      "expo-router",
      "expo-secure-store",
      "@livekit/react-native-expo-plugin",
      ["expo-build-properties", { "android": { "minSdkVersion": 24 } }]
    ],
    "android": {
      "package": "com.linagora.twakevisio",
      "permissions": ["CAMERA", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS"]
    },
    "ios": {
      "bundleIdentifier": "com.linagora.twakevisio",
      "infoPlist": {
        "NSCameraUsageDescription": "Twake Visio utilise la caméra pour la visioconférence.",
        "NSMicrophoneUsageDescription": "Twake Visio utilise le micro pour la visioconférence."
      }
    }
  }
}
```

- [ ] **Step 4: Ignorer les répertoires natifs générés**

`.gitignore` — ajouter :

```
/android
/ios
.expo/
node_modules/
*.log
```

- [ ] **Step 5: Configurer jest**

`jest.config.js` :

```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['**/*.spec.ts', '**/*.spec.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@livekit/.*|react-native-.*))',
  ],
};
```

`jest.setup.ts` :

```ts
import '@testing-library/jest-native/extend-expect';
```

- [ ] **Step 6: Ajouter les scripts npm**

Dans `package.json` :

```json
{
  "scripts": {
    "start": "expo start --dev-client",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "test": "jest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx",
    "prepare": "lefthook install"
  }
}
```

- [ ] **Step 7: Écrire le test de fumée**

`src/smoke.spec.ts` :

```ts
import { APP_SCHEME } from 'src/constants';

describe('scaffold', () => {
  it('expose le schéma de redirection attendu', () => {
    expect(APP_SCHEME).toBe('twakevisio');
  });
});
```

- [ ] **Step 8: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- src/smoke.spec.ts`
Expected: FAIL — `Cannot find module 'src/constants'`

- [ ] **Step 9: Créer le module de constantes**

`src/constants.ts` :

```ts
export const APP_SCHEME = 'twakevisio';
export const OIDC_REDIRECT_URI = `${APP_SCHEME}://callback`;
export const DEFAULT_CLIENT_ID = 'twake-visio';
export const REQUEST_TIMEOUT_MS = 15_000;
```

- [ ] **Step 10: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS sur les trois

- [ ] **Step 11: Configurer commitlint et lefthook**

`commitlint.config.js` :

```js
module.exports = { extends: ['@commitlint/config-conventional'] };
```

`lefthook.yml` :

```yaml
pre-commit:
  commands:
    lint:
      run: npm run lint
    typecheck:
      run: npm run typecheck
commit-msg:
  commands:
    commitlint:
      run: npx commitlint --edit {1}
```

- [ ] **Step 12: Ajouter le workflow d'intégration continue**

`.github/workflows/ci.yml` :

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
```

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore: Scaffold the Expo application with tooling and CI"
```

---

### Task 2: Tokens de design et thème

**Files:**
- Create: `src/ui/tokens/index.ts`, `src/ui/theme.ts`
- Test: `src/ui/theme.spec.ts`

**Interfaces:**
- Consumes: rien
- Produces: `tokens` (objet figé), `makeTheme(scheme: ColorScheme): MD3Theme`, type `ColorScheme = 'light' | 'dark'`

- [ ] **Step 1: Écrire le test qui échoue**

`src/ui/theme.spec.ts` :

```ts
import { makeTheme } from 'src/ui/theme';

// Luminance relative WCAG 2.1. Un test d'inégalité entre clair et sombre
// passerait si l'on intervertissait les deux thèmes ; un test de contraste non.
function computeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function computeContrast(a: string, b: string): number {
  const [light, dark] = [computeLuminance(a), computeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

const AA_NORMAL_TEXT = 4.5;

describe('makeTheme', () => {
  it('donne au thème clair un fond plus lumineux qu\'au thème sombre', () => {
    expect(computeLuminance(makeTheme('light').colors.background)).toBeGreaterThan(
      computeLuminance(makeTheme('dark').colors.background),
    );
  });

  it.each(['light', 'dark'] as const)(
    'respecte le contraste AA du texte sur le fond en %s',
    (scheme) => {
      const { colors } = makeTheme(scheme);
      expect(computeContrast(colors.onSurface, colors.background)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    },
  );

  it.each(['light', 'dark'] as const)(
    'respecte le contraste AA de la couleur d\'erreur sur le fond en %s',
    (scheme) => {
      const { colors } = makeTheme(scheme);
      expect(computeContrast(colors.error, colors.background)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    },
  );

  it.each(['light', 'dark'] as const)(
    'respecte le contraste AA de onPrimary sur primary en %s',
    (scheme) => {
      const { colors } = makeTheme(scheme);
      expect(computeContrast(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    },
  );

  it('applique le rayon des tokens au thème', () => {
    expect(makeTheme('light').roundness).toBe(8);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- src/ui/theme.spec.ts`
Expected: FAIL — modules introuvables

- [ ] **Step 3: Écrire les tokens**

`src/ui/tokens/index.ts` — valeurs transcrites depuis `twake-mui`, source unique du style :

```ts
export type ColorScheme = 'light' | 'dark';

// Toute couleur d'avant-plan porte une variante par schéma. Une valeur unique
// partagée entre clair et sombre échoue au contraste sur l'un des deux fonds :
// #C62828 sur #0B0B0C donne 3,4:1, sous le seuil WCAG AA de 4,5:1.
export const tokens = {
  color: {
    primaryLight: '#0057B8',
    primaryDark: '#4D9AFF',
    onPrimaryLight: '#FFFFFF',
    onPrimaryDark: '#0B1B2B',
    surfaceLight: '#FFFFFF',
    surfaceDark: '#121212',
    backgroundLight: '#F5F7FA',
    backgroundDark: '#0B0B0C',
    textLight: '#1A1A1A',
    textDark: '#ECECEC',
    dangerLight: '#C62828',
    dangerDark: '#FF8A80',
    successLight: '#2E7D32',
    successDark: '#81C784',
    muted: '#6B7280',
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 4, md: 8, lg: 16, pill: 999 },
  typography: {
    body: { fontSize: 16, lineHeight: 24 },
    title: { fontSize: 22, lineHeight: 28 },
    caption: { fontSize: 13, lineHeight: 18 },
  },
} as const;
```

- [ ] **Step 4: Dériver le thème Paper**

`src/ui/theme.ts` :

```ts
import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

import { tokens, type ColorScheme } from 'src/ui/tokens';

export function makeTheme(scheme: ColorScheme): MD3Theme {
  const isDark = scheme === 'dark';
  const base = isDark ? MD3DarkTheme : MD3LightTheme;
  return {
    ...base,
    roundness: tokens.radius.md,
    colors: {
      ...base.colors,
      primary: isDark ? tokens.color.primaryDark : tokens.color.primaryLight,
      onPrimary: isDark ? tokens.color.onPrimaryDark : tokens.color.onPrimaryLight,
      background: isDark ? tokens.color.backgroundDark : tokens.color.backgroundLight,
      surface: isDark ? tokens.color.surfaceDark : tokens.color.surfaceLight,
      onSurface: isDark ? tokens.color.textDark : tokens.color.textLight,
      error: isDark ? tokens.color.dangerDark : tokens.color.dangerLight,
    },
  };
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/ui/theme.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui
git commit -m "feat(ui): Add design tokens and derive the Paper theme"
```

---

### Task 3: Internationalisation

**Files:**
- Create: `src/i18n/index.ts`, `src/i18n/locales/{en,fr,es,it,de,vi,ru}.json`
- Test: `src/i18n/index.spec.ts`

**Interfaces:**
- Consumes: rien
- Produces: `initI18n(): Promise<void>`, `SUPPORTED_LOCALES: readonly string[]`

- [ ] **Step 1: Écrire le test qui échoue**

`src/i18n/index.spec.ts` :

```ts
import en from 'src/i18n/locales/en.json';
import de from 'src/i18n/locales/de.json';
import es from 'src/i18n/locales/es.json';
import fr from 'src/i18n/locales/fr.json';
// Ne pas nommer cet import `it` : il masquerait le `it()` global de jest et
// ferait planter la suite entiere avec « it is not a function ».
import itLocale from 'src/i18n/locales/it.json';
import ru from 'src/i18n/locales/ru.json';
import vi from 'src/i18n/locales/vi.json';
import { SUPPORTED_LOCALES } from 'src/i18n';

describe('locales', () => {
  it('couvre les sept langues exigées', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(
      ['de', 'en', 'es', 'fr', 'it', 'ru', 'vi'].sort(),
    );
  });

  it('ne laisse aucune clé manquante dans une locale', () => {
    const reference = Object.keys(en).sort();
    for (const [name, bundle] of Object.entries({ fr, es, it: itLocale, de, vi, ru })) {
      expect({ [name]: Object.keys(bundle).sort() }).toEqual({ [name]: reference });
    }
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- src/i18n`
Expected: FAIL — modules introuvables

- [ ] **Step 3: Créer les sept fichiers de locale**

`src/i18n/locales/fr.json` :

```json
{
  "welcome.signIn": "Se connecter",
  "welcome.signUp": "S'inscrire",
  "welcome.orgServer": "Se connecter avec le serveur de l'organisation",
  "server.prompt": "Adresse de votre serveur",
  "server.invalid": "Adresse de serveur invalide",
  "server.unreachable": "Serveur injoignable",
  "home.myRooms": "Mes réunions",
  "home.join": "Rejoindre",
  "home.create": "Nouvelle réunion",
  "room.name": "Nom de la réunion",
  "room.accessPublic": "Toute personne disposant du lien peut entrer sans validation",
  "room.accessTrusted": "Seules les personnes authentifiées entrent directement",
  "room.accessRestricted": "Seules les personnes explicitement invitées peuvent entrer",
  "room.coOwners": "Co-organisateurs",
  "prejoin.join": "Rejoindre",
  "prejoin.cameraOff": "Caméra désactivée",
  "lobby.waiting": "En attente de validation",
  "lobby.noModerator": "Aucun modérateur n'est actuellement présent",
  "call.leave": "Quitter",
  "call.muted": "Micro coupé",
  "error.network": "Connexion impossible",
  "error.unauthorized": "Session expirée, reconnectez-vous"
}
```

`src/i18n/locales/en.json` :

```json
{
  "welcome.signIn": "Sign in",
  "welcome.signUp": "Sign up",
  "welcome.orgServer": "Sign in with your organization server",
  "server.prompt": "Your server address",
  "server.invalid": "Invalid server address",
  "server.unreachable": "Server unreachable",
  "home.myRooms": "My meetings",
  "home.join": "Join",
  "home.create": "New meeting",
  "room.name": "Meeting name",
  "room.accessPublic": "Anyone with the link can enter without approval",
  "room.accessTrusted": "Only authenticated people enter directly",
  "room.accessRestricted": "Only explicitly invited people can enter",
  "room.coOwners": "Co-organizers",
  "prejoin.join": "Join",
  "prejoin.cameraOff": "Camera off",
  "lobby.waiting": "Waiting for approval",
  "lobby.noModerator": "No moderator is currently present",
  "call.leave": "Leave",
  "call.muted": "Muted",
  "error.network": "Cannot connect",
  "error.unauthorized": "Session expired, please sign in again"
}
```

Créer `es.json`, `it.json`, `de.json`, `vi.json`, `ru.json` avec **exactement les mêmes clés**. Une traduction automatique est acceptable comme point de départ, mais aucune clé ne doit manquer — c'est précisément ce que vérifie le test de l'étape 1.

- [ ] **Step 4: Initialiser i18next**

`src/i18n/index.ts` :

```ts
import { getLocales } from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import 'intl-pluralrules';

import de from 'src/i18n/locales/de.json';
import en from 'src/i18n/locales/en.json';
import es from 'src/i18n/locales/es.json';
import fr from 'src/i18n/locales/fr.json';
import itLocale from 'src/i18n/locales/it.json';
import ru from 'src/i18n/locales/ru.json';
import vi from 'src/i18n/locales/vi.json';

export const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'it', 'de', 'vi', 'ru'] as const;

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  it: { translation: itLocale },
  de: { translation: de },
  vi: { translation: vi },
  ru: { translation: ru },
};

function resolveLocale(): string {
  const preferred = getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED_LOCALES as readonly string[]).includes(preferred) ? preferred : 'en';
}

export async function initI18n(): Promise<void> {
  await i18next.use(initReactI18next).init({
    resources,
    lng: resolveLocale(),
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/i18n`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/i18n
git commit -m "feat(i18n): Add the seven supported locales and i18next setup"
```

---

## Phase 1 — Découverte et authentification

### Task 4: Types et table d'instances

**Files:**
- Create: `src/instance/types.ts`, `src/instance/knownInstances.ts`
- Test: `src/instance/knownInstances.spec.ts`

**Interfaces:**
- Consumes: `DEFAULT_CLIENT_ID` de `src/constants`
- Produces: types `InstanceConfig`, `InstanceFeatures`, `InstanceError`, `InstanceResult` ; `findKnownClientId(host: string): string | null`

- [ ] **Step 1: Écrire le test qui échoue**

`src/instance/knownInstances.spec.ts` :

```ts
import { findKnownClientId } from 'src/instance/knownInstances';

describe('findKnownClientId', () => {
  it('reconnaît une instance connue', () => {
    expect(findKnownClientId('meet.linagora.com')).toBe('twake-visio');
  });

  it('reconnaît la seconde instance de production', () => {
    expect(findKnownClientId('visio.twake.app')).toBe('twake-visio');
  });

  it('renvoie null pour un hôte inconnu', () => {
    expect(findKnownClientId('meet.example.org')).toBe(null);
  });

  it('ignore la casse de l\'hôte', () => {
    expect(findKnownClientId('MEET.Linagora.COM')).toBe('twake-visio');
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- src/instance/knownInstances.spec.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Écrire les types**

`src/instance/types.ts` :

```ts
export type InstanceFeatures = {
  readonly recording: boolean;
  readonly subtitle: boolean;
  readonly telephony: boolean;
};

export type InstanceConfig = {
  readonly serverUrl: string;
  readonly issuer: string;
  readonly clientId: string;
  readonly livekitUrl: string;
  readonly features: InstanceFeatures;
};

export type InstanceError = 'unreachable' | 'not-a-meet-instance' | 'oidc-undiscoverable';

export type InstanceResult =
  | { ok: true; value: InstanceConfig }
  | { ok: false; error: InstanceError };
```

- [ ] **Step 4: Écrire la table d'instances**

`src/instance/knownInstances.ts` :

```ts
import { DEFAULT_CLIENT_ID } from 'src/constants';

// Deux instances de production partagent le même SSO et le même LiveKit.
// Aucune des deux n'expose config.oidc à ce jour, d'où le repli de la Task 5.
const KNOWN_CLIENT_IDS: Readonly<Record<string, string>> = {
  'meet.linagora.com': DEFAULT_CLIENT_ID,
  'visio.twake.app': DEFAULT_CLIENT_ID,
};

export function findKnownClientId(host: string): string | null {
  return KNOWN_CLIENT_IDS[host.toLowerCase()] ?? null;
}

// Consommé par le filtre de liens profonds : un lien de réunion n'est accepté
// que s'il porte sur une instance connue.
export function listKnownHosts(): readonly string[] {
  return Object.keys(KNOWN_CLIENT_IDS);
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/instance/knownInstances.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/instance
git commit -m "feat(instance): Add instance types and the known-instance table"
```

---

### Task 5: Découverte d'instance

**Files:**
- Create: `src/instance/discovery.ts`
- Test: `src/instance/discovery.spec.ts`

**Interfaces:**
- Consumes: `InstanceResult`, `InstanceConfig` de `src/instance/types` ; `findKnownClientId` de `src/instance/knownInstances`
- Produces: `fetchInstanceConfig(serverUrl: string): Promise<InstanceResult>`

Le chemin A lit `oidc` dans `/api/v1.0/config/`. Le chemin B, quand ce bloc manque, appelle `/api/v1.0/authenticate/` **sans suivre la redirection** et extrait l'issuer du paramètre de l'en-tête `Location`.

- [ ] **Step 1: Écrire les tests qui échouent**

`src/instance/discovery.spec.ts` :

```ts
import { fetchInstanceConfig } from 'src/instance/discovery';

const CONFIG_WITH_OIDC = {
  livekit: { url: 'https://livekit.linagora.com' },
  recording: { is_enabled: true },
  subtitle: { enabled: true },
  telephony: { enabled: false },
  oidc: { issuer: 'https://sso.linagora.com', mobile_client_id: 'twake-visio' },
};

const CONFIG_WITHOUT_OIDC = { ...CONFIG_WITH_OIDC, oidc: undefined };

type FetchCall = { url: string; init: RequestInit | undefined };

let calls: FetchCall[] = [];

// Le second argument de fetch est capturé, sans quoi redirect et signal ne
// sont assertables par aucun test et peuvent disparaître du code sans qu'une
// suite au vert ne s'en aperçoive.
function mockFetch(handler: (url: string) => Response): void {
  calls = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return handler(String(input));
  }) as unknown as typeof fetch;
}

function findCall(fragment: string): FetchCall | undefined {
  return calls.find((call) => call.url.includes(fragment));
}

describe('fetchInstanceConfig', () => {
  it('chemin A — lit l\'issuer depuis /config/', async () => {
    mockFetch(() => new Response(JSON.stringify(CONFIG_WITH_OIDC), { status: 200 }));

    const result = await fetchInstanceConfig('https://meet.linagora.com');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.issuer).toBe('https://sso.linagora.com');
    expect(result.value.clientId).toBe('twake-visio');
    expect(result.value.livekitUrl).toBe('https://livekit.linagora.com');
  });

  it('chemin B — déduit l\'issuer de la redirection quand oidc manque', async () => {
    mockFetch((url) => {
      if (url.includes('/config/')) {
        return new Response(JSON.stringify(CONFIG_WITHOUT_OIDC), { status: 200 });
      }
      return new Response(null, {
        status: 302,
        headers: {
          location:
            'https://sso.linagora.com/oauth2/authorize?response_type=code&client_id=livekit-meet',
        },
      });
    });

    const result = await fetchInstanceConfig('https://meet.linagora.com');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.issuer).toBe('https://sso.linagora.com');
    expect(result.value.clientId).toBe('twake-visio');
  });

  it('échoue proprement sur un hôte inconnu sans bloc oidc', async () => {
    mockFetch((url) => {
      if (url.includes('/config/')) {
        return new Response(JSON.stringify(CONFIG_WITHOUT_OIDC), { status: 200 });
      }
      return new Response(null, {
        status: 302,
        headers: { location: 'https://sso.example.org/oauth2/authorize' },
      });
    });

    const result = await fetchInstanceConfig('https://meet.example.org');

    expect(result).toEqual({ ok: false, error: 'oidc-undiscoverable' });
  });

  it('signale une instance qui n\'est pas un serveur meet', async () => {
    mockFetch(() => new Response('<html></html>', { status: 200 }));

    const result = await fetchInstanceConfig('https://example.org');

    expect(result).toEqual({ ok: false, error: 'not-a-meet-instance' });
  });

  it('signale un serveur injoignable', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;

    const result = await fetchInstanceConfig('https://down.example.org');

    expect(result).toEqual({ ok: false, error: 'unreachable' });
  });

  it('signale unreachable quand c\'est le repli lui-même qui échoue', async () => {
    // Distinct du test précédent : /config/ répond, donc le chemin A aboutit
    // et c'est bien /authenticate/ qui jette. Sans ce cas, la panne du repli
    // pourrait être repliée sur oidc-undiscoverable sans qu'aucun test ne bronche.
    mockFetch((url) => {
      if (url.includes('/config/')) {
        return new Response(JSON.stringify(CONFIG_WITHOUT_OIDC), { status: 200 });
      }
      throw new TypeError('network');
    });

    const result = await fetchInstanceConfig('https://meet.linagora.com');

    expect(result).toEqual({ ok: false, error: 'unreachable' });
  });

  it('ne suit pas la redirection sur le chemin de repli', async () => {
    mockFetch((url) => {
      if (url.includes('/config/')) {
        return new Response(JSON.stringify(CONFIG_WITHOUT_OIDC), { status: 200 });
      }
      return new Response(null, {
        status: 302,
        headers: { location: 'https://sso.linagora.com/oauth2/authorize' },
      });
    });

    await fetchInstanceConfig('https://meet.linagora.com');

    expect(findCall('/authenticate/')?.init?.redirect).toBe('manual');
  });

  it('borne chaque appel réseau par un délai', async () => {
    mockFetch((url) => {
      if (url.includes('/config/')) {
        return new Response(JSON.stringify(CONFIG_WITHOUT_OIDC), { status: 200 });
      }
      return new Response(null, {
        status: 302,
        headers: { location: 'https://sso.linagora.com/oauth2/authorize' },
      });
    });

    await fetchInstanceConfig('https://meet.linagora.com');

    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.init?.signal !== undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/instance/discovery.spec.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter la découverte**

`src/instance/discovery.ts` :

```ts
import { REQUEST_TIMEOUT_MS } from 'src/constants';
import { findKnownClientId } from 'src/instance/knownInstances';
import type { InstanceConfig, InstanceResult } from 'src/instance/types';

type RawConfig = {
  livekit?: { url?: string };
  recording?: { is_enabled?: boolean };
  subtitle?: { enabled?: boolean };
  telephony?: { enabled?: boolean };
  oidc?: { issuer?: string; mobile_client_id?: string };
};

function isRawConfig(value: unknown): value is RawConfig {
  return typeof value === 'object' && value !== null && 'livekit' in value;
}

async function fetchJson(url: string): Promise<unknown | null> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

// La redirection de /authenticate/ porte l'issuer dans son URL d'autorisation.
// Repli non contractuel, à retirer quand toutes les instances exposent config.oidc.
async function resolveOidcFromRedirect(serverUrl: string): Promise<string | null> {
  const response = await fetch(`${serverUrl}/api/v1.0/authenticate/`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const location = response.headers.get('location');
  if (location === null) return null;
  try {
    const authorizeUrl = new URL(location);
    return authorizeUrl.origin;
  } catch {
    return null;
  }
}

export async function fetchInstanceConfig(serverUrl: string): Promise<InstanceResult> {
  const normalized = serverUrl.replace(/\/+$/, '');

  let raw: unknown | null;
  try {
    raw = await fetchJson(`${normalized}/api/v1.0/config/`);
  } catch {
    return { ok: false, error: 'unreachable' };
  }

  if (!isRawConfig(raw)) return { ok: false, error: 'not-a-meet-instance' };

  const livekitUrl = raw.livekit?.url;
  if (livekitUrl === undefined) return { ok: false, error: 'not-a-meet-instance' };

  let issuer = raw.oidc?.issuer ?? null;
  let clientId = raw.oidc?.mobile_client_id ?? null;

  if (issuer === null) {
    try {
      issuer = await resolveOidcFromRedirect(normalized);
    } catch {
      return { ok: false, error: 'unreachable' };
    }
  }

  if (clientId === null) {
    clientId = findKnownClientId(new URL(normalized).host);
  }

  if (issuer === null || clientId === null) {
    return { ok: false, error: 'oidc-undiscoverable' };
  }

  const config: InstanceConfig = {
    serverUrl: normalized,
    issuer,
    clientId,
    livekitUrl,
    features: {
      recording: raw.recording?.is_enabled === true,
      subtitle: raw.subtitle?.enabled === true,
      telephony: raw.telephony?.enabled === true,
    },
  };

  return { ok: true, value: config };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/instance/discovery.spec.ts`
Expected: PASS — cinq tests

- [ ] **Step 5: Commit**

```bash
git add src/instance
git commit -m "feat(instance): Discover instance config with a redirect fallback"
```

---

### Task 6: Génération PKCE

**Files:**
- Create: `src/auth/pkce.ts`
- Test: `src/auth/pkce.spec.ts`

**Interfaces:**
- Consumes: `expo-crypto`
- Produces: `createPkcePair(): Promise<PkcePair>` où `PkcePair = { verifier: string; challenge: string; method: 'S256' }`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/auth/pkce.spec.ts` :

```ts
import { computeChallenge, createPkcePair } from 'src/auth/pkce';

// RFC 7636 annexe B. Le seul moyen de prouver que le challenge est le digest
// du verifier, et non d'une constante ou d'une autre valeur.
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('computeChallenge', () => {
  it('reproduit le vecteur de test de la RFC 7636', async () => {
    expect(await computeChallenge(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
  });

  it('est déterministe pour un même verifier', async () => {
    const [first, second] = await Promise.all([
      computeChallenge(RFC_VERIFIER),
      computeChallenge(RFC_VERIFIER),
    ]);
    expect(first).toBe(second);
  });

  it('produit un digest SHA-256 encodé en base64url, soit 43 caractères', async () => {
    expect(await computeChallenge(RFC_VERIFIER)).toHaveLength(43);
  });
});

describe('createPkcePair', () => {
  it('produit un verifier de longueur conforme à la RFC 7636', async () => {
    const pair = await createPkcePair();
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43);
    expect(pair.verifier.length).toBeLessThanOrEqual(128);
  });

  it('n\'utilise que des caractères base64url non réservés', async () => {
    const pair = await createPkcePair();
    expect(pair.verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(pair.challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('annonce la méthode S256', async () => {
    const pair = await createPkcePair();
    expect(pair.method).toBe('S256');
  });

  it('calcule le challenge sur son propre verifier', async () => {
    const pair = await createPkcePair();
    expect(pair.challenge).toBe(await computeChallenge(pair.verifier));
  });

  it('produit un challenge de 43 caractères', async () => {
    const pair = await createPkcePair();
    expect(pair.challenge).toHaveLength(43);
  });

  it('produit un verifier différent à chaque appel', async () => {
    const [first, second] = await Promise.all([createPkcePair(), createPkcePair()]);
    expect(first.verifier).not.toBe(second.verifier);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/auth/pkce.spec.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter PKCE**

`src/auth/pkce.ts` :

```ts
import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from 'expo-crypto';

export type PkcePair = {
  readonly verifier: string;
  readonly challenge: string;
  readonly method: 'S256';
};

const VERIFIER_BYTES = 64;

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toUnreservedString(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let out = '';
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

// Exporté séparément pour être testable contre le vecteur officiel de la
// RFC 7636 annexe B. Sans un verifier imposé de l'extérieur, aucun test ne peut
// distinguer un digest correct d'un digest calculé sur la mauvaise entrée.
export async function computeChallenge(verifier: string): Promise<string> {
  const digest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: CryptoEncoding.BASE64,
  });
  return toBase64Url(digest);
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = toUnreservedString(getRandomBytes(VERIFIER_BYTES));
  return { verifier, challenge: await computeChallenge(verifier), method: 'S256' };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/auth/pkce.spec.ts`
Expected: PASS — quatre tests

- [ ] **Step 5: Commit**

```bash
git add src/auth/pkce.ts src/auth/pkce.spec.ts
git commit -m "feat(auth): Generate PKCE verifier and S256 challenge"
```

---

### Task 7: URL d'autorisation et échange de jetons

**Files:**
- Create: `src/auth/oidc.ts`
- Test: `src/auth/oidc.spec.ts`

**Interfaces:**
- Consumes: `InstanceConfig` de `src/instance/types` ; `PkcePair` de `src/auth/pkce` ; `OIDC_REDIRECT_URI` de `src/constants`
- Produces: `buildAuthorizeUrl(config, pkce, state): string` ; `exchangeCode(config, code, verifier): Promise<TokenResult>` ; `refreshTokens(config, refreshToken): Promise<TokenResult>` ; types `TokenSet`, `TokenResult`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/auth/oidc.spec.ts` :

```ts
import { buildAuthorizeUrl, exchangeCode, refreshTokens } from 'src/auth/oidc';
import type { InstanceConfig } from 'src/instance/types';

const CONFIG: InstanceConfig = {
  serverUrl: 'https://meet.linagora.com',
  issuer: 'https://sso.linagora.com',
  clientId: 'twake-visio',
  livekitUrl: 'https://livekit.linagora.com',
  features: { recording: true, subtitle: true, telephony: false },
};

const PKCE = { verifier: 'v'.repeat(64), challenge: 'chal', method: 'S256' } as const;

describe('buildAuthorizeUrl', () => {
  it('assemble les paramètres du flux Authorization Code + PKCE', () => {
    const url = new URL(buildAuthorizeUrl(CONFIG, PKCE, 'st4te'));

    expect(url.origin + url.pathname).toBe('https://sso.linagora.com/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('twake-visio');
    expect(url.searchParams.get('redirect_uri')).toBe('twakevisio://callback');
    expect(url.searchParams.get('code_challenge')).toBe('chal');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toBe('st4te');
  });

  it('transmet login_hint quand il est fourni', () => {
    const url = new URL(buildAuthorizeUrl(CONFIG, PKCE, 'st', 'ada@linagora.com'));
    expect(url.searchParams.get('login_hint')).toBe('ada@linagora.com');
  });
});

describe('exchangeCode', () => {
  it('n\'envoie aucun client_secret', async () => {
    // Génériques explicites : sans paramètres déclarés, noUncheckedIndexedAccess
    // rejette l'accès à calls[0][1] comme hors tuple.
    const spy = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          JSON.stringify({
            access_token: 'at',
            refresh_token: 'rt',
            expires_in: 3600,
            id_token: 'it',
          }),
          { status: 200 },
        ),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await exchangeCode(CONFIG, 'the-code', PKCE.verifier);

    expect(result.ok).toBe(true);
    const body = String((spy.mock.calls[0]?.[1] as RequestInit).body);
    expect(body).toContain('code_verifier=');
    expect(body).not.toContain('client_secret');
  });

  it('renvoie une erreur typée sur refus du serveur', async () => {
    globalThis.fetch = jest.fn(
      async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
    ) as unknown as typeof fetch;

    const result = await exchangeCode(CONFIG, 'bad', PKCE.verifier);

    expect(result).toEqual({ ok: false, error: 'invalid_grant' });
  });
});

describe('refreshTokens', () => {
  it('conserve l\'ancien refresh_token quand le serveur n\'en renvoie pas', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        new Response(JSON.stringify({ access_token: 'at2', expires_in: 3600 }), {
          status: 200,
        }),
    ) as unknown as typeof fetch;

    const result = await refreshTokens(CONFIG, 'old-rt');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.refreshToken).toBe('old-rt');
  });

  it('adopte le nouveau refresh_token en cas de rotation', async () => {
    globalThis.fetch = jest.fn(
      async () =>
        new Response(
          JSON.stringify({ access_token: 'at2', refresh_token: 'new-rt', expires_in: 3600 }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    const result = await refreshTokens(CONFIG, 'old-rt');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.refreshToken).toBe('new-rt');
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/auth/oidc.spec.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter le client OIDC**

`src/auth/oidc.ts` :

```ts
import { OIDC_REDIRECT_URI, REQUEST_TIMEOUT_MS } from 'src/constants';
import type { PkcePair } from 'src/auth/pkce';
import type { InstanceConfig } from 'src/instance/types';

export type TokenSet = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly idToken: string | null;
  readonly expiresAt: number;
};

export type TokenError = 'invalid_grant' | 'network' | 'malformed_response';

export type TokenResult =
  | { ok: true; value: TokenSet }
  | { ok: false; error: TokenError };

type RawTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
};

export function buildAuthorizeUrl(
  config: InstanceConfig,
  pkce: PkcePair,
  state: string,
  loginHint?: string,
): string {
  const url = new URL(`${config.issuer}/oauth2/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', OIDC_REDIRECT_URI);
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', pkce.method);
  url.searchParams.set('state', state);
  if (loginHint !== undefined) url.searchParams.set('login_hint', loginHint);
  return url.toString();
}

// Client public : aucun client_secret n'est transmis, l'authentification du
// client repose entièrement sur PKCE.
async function postToken(
  config: InstanceConfig,
  params: Record<string, string>,
  previousRefreshToken: string | null,
): Promise<TokenResult> {
  let response: Response;
  try {
    response = await fetch(`${config.issuer}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, ...params }).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: 'network' };
  }

  if (!response.ok) return { ok: false, error: 'invalid_grant' };

  let raw: RawTokenResponse;
  try {
    raw = (await response.json()) as RawTokenResponse;
  } catch {
    return { ok: false, error: 'malformed_response' };
  }

  if (raw.access_token === undefined || raw.expires_in === undefined) {
    return { ok: false, error: 'malformed_response' };
  }

  return {
    ok: true,
    value: {
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token ?? previousRefreshToken,
      idToken: raw.id_token ?? null,
      expiresAt: Date.now() + raw.expires_in * 1000,
    },
  };
}

export async function exchangeCode(
  config: InstanceConfig,
  code: string,
  verifier: string,
): Promise<TokenResult> {
  return postToken(
    config,
    {
      grant_type: 'authorization_code',
      code,
      redirect_uri: OIDC_REDIRECT_URI,
      code_verifier: verifier,
    },
    null,
  );
}

export async function refreshTokens(
  config: InstanceConfig,
  refreshToken: string,
): Promise<TokenResult> {
  return postToken(
    config,
    { grant_type: 'refresh_token', refresh_token: refreshToken },
    refreshToken,
  );
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/auth/oidc.spec.ts`
Expected: PASS — six tests

- [ ] **Step 5: Commit**

```bash
git add src/auth/oidc.ts src/auth/oidc.spec.ts
git commit -m "feat(auth): Build the authorize URL and exchange OIDC tokens"
```

---

### Task 8: Stockage sécurisé et registre de comptes

**Files:**
- Create: `src/auth/storage.ts`, `src/auth/accounts.ts`
- Test: `src/auth/accounts.spec.ts`

**Interfaces:**
- Consumes: `TokenSet` de `src/auth/oidc` ; `InstanceConfig` de `src/instance/types`
- Produces: `saveTokens(accountId, tokens)`, `loadTokens(accountId)`, `clearTokens(accountId)` ; `Account`, `addAccount`, `listAccounts`, `getActiveAccount`, `setActiveAccount`, `removeAccount`, `makeAccountId(issuer, sub)`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/auth/accounts.spec.ts` :

```ts
import {
  addAccount,
  getActiveAccount,
  listAccounts,
  makeAccountId,
  removeAccount,
  setActiveAccount,
  resetAccountsForTest,
} from 'src/auth/accounts';
import type { InstanceConfig } from 'src/instance/types';

const CONFIG: InstanceConfig = {
  serverUrl: 'https://meet.linagora.com',
  issuer: 'https://sso.linagora.com',
  clientId: 'twake-visio',
  livekitUrl: 'https://livekit.linagora.com',
  features: { recording: true, subtitle: true, telephony: false },
};

beforeEach(() => {
  resetAccountsForTest();
});

describe('makeAccountId', () => {
  it('compose l\'identité depuis l\'issuer et le sujet', () => {
    expect(makeAccountId('https://sso.linagora.com', 'u-1')).toBe(
      'https%3A%2F%2Fsso.linagora.com|u-1',
    );
  });

  it('ne confond pas deux comptes dont le découpage naïf serait ambigu', () => {
    // Un sub de la forme `google-oauth2|109` est réellement émis par certains
    // fournisseurs. Sans encodage, ces deux appels donnent la même chaîne.
    expect(makeAccountId('https://sso.linagora.com', 'google-oauth2|109')).not.toBe(
      makeAccountId('https://sso.linagora.com|google-oauth2', '109'),
    );
  });
});

describe('registre de comptes', () => {
  it('ajoute un compte et le rend actif', () => {
    const account = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-1'),
      instance: CONFIG,
      email: 'ada@linagora.com',
      displayName: 'Ada',
    });

    expect(getActiveAccount()?.id).toBe(account.id);
    expect(listAccounts()).toHaveLength(1);
  });

  it('accepte deux comptes sur la même instance', () => {
    addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-1'),
      instance: CONFIG,
      email: 'ada@linagora.com',
      displayName: 'Ada',
    });
    addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-2'),
      instance: CONFIG,
      email: 'bob@linagora.com',
      displayName: 'Bob',
    });

    expect(listAccounts()).toHaveLength(2);
  });

  it('ne vole pas le compte actif en ré-ajoutant un compte non actif', () => {
    const first = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-1'),
      instance: CONFIG,
      email: 'ada@linagora.com',
      displayName: 'Ada',
    });
    const second = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-2'),
      instance: CONFIG,
      email: 'bob@linagora.com',
      displayName: 'Bob',
    });
    setActiveAccount(second.id);

    // Un rafraîchissement de session en arrière-plan repasse par addAccount.
    addAccount({ ...first, displayName: 'Ada Lovelace' });

    expect(getActiveAccount()?.id).toBe(second.id);

    // La mise à jour se fait sur place : position conservée et enregistrement
    // remplacé. Un filter+append passerait les deux assertions précédentes.
    const listed = listAccounts();
    expect(listed).toHaveLength(2);
    expect(listed[0]?.id).toBe(first.id);
    expect(listed[0]?.displayName).toBe('Ada Lovelace');
    expect(listed[1]?.id).toBe(second.id);
  });

  it('bascule le compte actif', () => {
    const first = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-1'),
      instance: CONFIG,
      email: 'ada@linagora.com',
      displayName: 'Ada',
    });
    addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-2'),
      instance: CONFIG,
      email: 'bob@linagora.com',
      displayName: 'Bob',
    });

    setActiveAccount(first.id);

    expect(getActiveAccount()?.id).toBe(first.id);
  });

  it('promeut un autre compte quand l\'actif est retiré', () => {
    const first = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-1'),
      instance: CONFIG,
      email: 'ada@linagora.com',
      displayName: 'Ada',
    });
    const second = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-2'),
      instance: CONFIG,
      email: 'bob@linagora.com',
      displayName: 'Bob',
    });

    removeAccount(second.id);

    expect(getActiveAccount()?.id).toBe(first.id);
  });

  it('renvoie null quand il ne reste aucun compte', () => {
    const only = addAccount({
      id: makeAccountId(CONFIG.issuer, 'u-1'),
      instance: CONFIG,
      email: 'ada@linagora.com',
      displayName: 'Ada',
    });

    removeAccount(only.id);

    expect(getActiveAccount()).toBe(null);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/auth/accounts.spec.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter le stockage sécurisé**

`src/auth/storage.ts` :

```ts
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

import type { TokenSet } from 'src/auth/oidc';

// expo-secure-store adosse Keychain (iOS) et Keystore (Android). MMKV n'est
// pas chiffré par défaut et ne doit jamais porter de jeton.

const KEY_SAFE = /^[A-Za-z0-9.-]$/;

// Échappement injectif : chaque caractère hors alphabet devient `_XXXXXX` sur
// exactement six hexadécimaux, et `_` lui-même est échappé.
//
// Six, et non quatre : `padStart` impose un plancher, pas un plafond, donc un
// point de code hors du plan de base déborde. Avec quatre, `U+10000` donne
// `_10000` — indistinguable de `U+1000` suivi du chiffre `0`. Le plus grand
// point de code Unicode étant U+10FFFF, six chiffres suffisent toujours et la
// largeur est alors réellement fixe.
//
// Un remplacement uniforme par `_`, lui, n'est injectif pour rien : `host:8443`
// et `host/8443` produisent la même clé, et un compte lit les jetons de l'autre
// sans que rien ne le signale.
function encodeKey(value: string): string {
  let out = '';
  for (const char of value) {
    if (KEY_SAFE.test(char)) {
      out += char;
      continue;
    }
    const code = char.codePointAt(0) ?? 0;
    out += `_${code.toString(16).padStart(6, '0')}`;
  }
  return out;
}

function keyFor(accountId: string): string {
  return `tokens.${encodeKey(accountId)}`;
}

export async function saveTokens(accountId: string, tokens: TokenSet): Promise<void> {
  await setItemAsync(keyFor(accountId), JSON.stringify(tokens));
}

export async function loadTokens(accountId: string): Promise<TokenSet | null> {
  const raw = await getItemAsync(keyFor(accountId));
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    return null;
  }
}

export async function clearTokens(accountId: string): Promise<void> {
  await deleteItemAsync(keyFor(accountId));
}
```

- [ ] **Step 3b: Écrire les tests du stockage sécurisé**

`src/auth/storage.spec.ts` :

```ts
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';

import type { TokenSet } from 'src/auth/oidc';
import { clearTokens, loadTokens, saveTokens } from 'src/auth/storage';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => undefined),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const TOKENS: TokenSet = {
  accessToken: 'at',
  refreshToken: 'rt',
  idToken: 'it',
  expiresAt: 1_800_000_000_000,
};

const ACCOUNT = 'https%3A%2F%2Fsso.linagora.com|u-1';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('dérivation de clé', () => {
  it('ne fait pas collisionner deux comptes ne différant que par un caractère hors alphabet', async () => {
    await saveTokens('https%3A%2F%2Fhost%3A8443|u1', TOKENS);
    await saveTokens('https%3A%2F%2Fhost%2F8443|u1', TOKENS);

    const mock = jest.mocked(setItemAsync);
    expect(mock).toHaveBeenCalledTimes(2);
    const [firstKey] = mock.mock.calls[0] ?? [];
    const [secondKey] = mock.mock.calls[1] ?? [];
    expect(firstKey).not.toBe(secondKey);
  });

  it('reste injective sur un point de code hors du plan de base', async () => {
    // padStart impose un plancher : avec quatre chiffres, U+10000 et
    // U+1000 suivi de « 0 » produisaient la même clé.
    await saveTokens('a\u{10000}b', TOKENS);
    await saveTokens('a\u1000' + '0b', TOKENS);

    const mock = jest.mocked(setItemAsync);
    const [firstKey] = mock.mock.calls[0] ?? [];
    const [secondKey] = mock.mock.calls[1] ?? [];
    expect(firstKey).not.toBe(secondKey);
  });

  it('emploie une seule et même clé pour écrire, lire et purger', async () => {
    await saveTokens(ACCOUNT, TOKENS);
    await loadTokens(ACCOUNT);
    await clearTokens(ACCOUNT);

    const [written] = jest.mocked(setItemAsync).mock.calls[0] ?? [];
    const [read] = jest.mocked(getItemAsync).mock.calls[0] ?? [];
    const [deleted] = jest.mocked(deleteItemAsync).mock.calls[0] ?? [];
    expect(read).toBe(written);
    expect(deleted).toBe(written);
  });
});

describe('saveTokens', () => {
  it('écrit le TokenSet sérialisé dans le magasin chiffré', async () => {
    await saveTokens(ACCOUNT, TOKENS);
    expect(setItemAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^tokens\./),
      JSON.stringify(TOKENS),
    );
  });
});

describe('loadTokens', () => {
  it('restitue à l\'identique ce que saveTokens a écrit', async () => {
    jest.mocked(getItemAsync).mockResolvedValueOnce(JSON.stringify(TOKENS));
    expect(await loadTokens(ACCOUNT)).toEqual(TOKENS);
  });

  it('rend null quand rien n\'est stocké', async () => {
    jest.mocked(getItemAsync).mockResolvedValueOnce(null);
    expect(await loadTokens(ACCOUNT)).toBe(null);
  });

  it('rend null sur un contenu corrompu, sans lever', async () => {
    // Indistinguable d'une absence pour l'appelant, ce qui est voulu : dans les
    // deux cas il faut se reconnecter. Mais il ne faut surtout pas planter.
    jest.mocked(getItemAsync).mockResolvedValueOnce('{ pas du json');
    expect(await loadTokens(ACCOUNT)).toBe(null);
  });
});
```

- [ ] **Step 4: Implémenter le registre de comptes**

`src/auth/accounts.ts` :

```ts
import type { InstanceConfig } from 'src/instance/types';

export type Account = {
  readonly id: string;
  readonly instance: InstanceConfig;
  readonly email: string;
  readonly displayName: string;
};

let accounts: Account[] = [];
let activeId: string | null = null;

// Les deux parties sont encodées avant d'être jointes. Sans cela, un `sub` de la
// forme `google-oauth2|109` — que certains fournisseurs OIDC émettent réellement —
// rendrait deux comptes distincts strictement identiques : `iss|google-oauth2|109`
// se lit aussi bien comme (`iss`, `google-oauth2|109`) que comme
// (`iss|google-oauth2`, `109`). Ils se confondraient dans le registre.
export function makeAccountId(issuer: string, sub: string): string {
  return `${encodeURIComponent(issuer)}|${encodeURIComponent(sub)}`;
}

// N'active le compte que s'il n'y en a pas déjà un, ou s'il s'agit de lui-même.
// Un rafraîchissement de session en arrière-plan repasse par ici, et volerait
// sinon le compte actif à celui que l'utilisateur regarde.
export function addAccount(account: Account): Account {
  const known = accounts.some((a) => a.id === account.id);
  accounts = known
    ? accounts.map((a) => (a.id === account.id ? account : a))
    : [...accounts, account];
  if (activeId === null) activeId = account.id;
  return account;
}

export function listAccounts(): readonly Account[] {
  return accounts;
}

export function getActiveAccount(): Account | null {
  return accounts.find((a) => a.id === activeId) ?? null;
}

export function setActiveAccount(id: string): void {
  if (accounts.some((a) => a.id === id)) activeId = id;
}

export function removeAccount(id: string): void {
  accounts = accounts.filter((a) => a.id !== id);
  if (activeId === id) activeId = accounts[0]?.id ?? null;
}

export function resetAccountsForTest(): void {
  accounts = [];
  activeId = null;
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/auth/accounts.spec.ts`
Expected: PASS — six tests

- [ ] **Step 6: Commit**

```bash
git add src/auth/storage.ts src/auth/accounts.ts src/auth/accounts.spec.ts
git commit -m "feat(auth): Store tokens securely and track multiple accounts"
```

---

### Task 9: Session et rafraîchissement en vol unique

**Files:**
- Create: `src/auth/session.ts`
- Test: `src/auth/session.spec.ts`

**Interfaces:**
- Consumes: `refreshTokens`, `TokenSet` de `src/auth/oidc` ; `loadTokens`, `saveTokens` de `src/auth/storage` ; `InstanceConfig` de `src/instance/types`
- Produces: `getAccessToken(accountId, config): Promise<string | null>` ; `forceRefresh(accountId, config): Promise<string | null>` ; `resetSessionForTest()`

C'est la tâche la plus délicate du plan. Plusieurs 401 concurrents doivent produire **un seul** appel au `token_endpoint` — sinon LemonLDAP invalide les jetons en rotation et l'utilisateur subit des déconnexions inexplicables.

- [ ] **Step 1: Écrire les tests qui échouent**

`src/auth/session.spec.ts` :

```ts
import { forceRefresh, getAccessToken, resetSessionForTest } from 'src/auth/session';
import * as oidc from 'src/auth/oidc';
import * as storage from 'src/auth/storage';
import type { InstanceConfig } from 'src/instance/types';

const CONFIG: InstanceConfig = {
  serverUrl: 'https://meet.linagora.com',
  issuer: 'https://sso.linagora.com',
  clientId: 'twake-visio',
  livekitUrl: 'https://livekit.linagora.com',
  features: { recording: true, subtitle: true, telephony: false },
};

const ACCOUNT = 'https://sso.linagora.com|u-1';

beforeEach(() => {
  resetSessionForTest();
  jest.restoreAllMocks();
  jest.spyOn(storage, 'saveTokens').mockResolvedValue();
});

describe('getAccessToken', () => {
  it('renvoie le jeton stocké tant qu\'il n\'est pas expiré', async () => {
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'valid',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() + 600_000,
    });
    const refresh = jest.spyOn(oidc, 'refreshTokens');

    expect(await getAccessToken(ACCOUNT, CONFIG)).toBe('valid');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rafraîchit quand le jeton est dans la fenêtre de garde', async () => {
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'stale',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() + 5_000,
    });
    jest.spyOn(oidc, 'refreshTokens').mockResolvedValue({
      ok: true,
      value: {
        accessToken: 'fresh',
        refreshToken: 'rt2',
        idToken: null,
        expiresAt: Date.now() + 3_600_000,
      },
    });

    expect(await getAccessToken(ACCOUNT, CONFIG)).toBe('fresh');
  });

  it('renvoie null quand aucun jeton n\'est stocké', async () => {
    jest.spyOn(storage, 'loadTokens').mockResolvedValue(null);
    expect(await getAccessToken(ACCOUNT, CONFIG)).toBe(null);
  });
});

describe('forceRefresh — rafraîchissement en vol unique', () => {
  it('ne déclenche qu\'un seul appel réseau pour trois demandes concurrentes', async () => {
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'old',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() - 1_000,
    });
    const refresh = jest.spyOn(oidc, 'refreshTokens').mockImplementation(
      async () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                value: {
                  accessToken: 'fresh',
                  refreshToken: 'rt2',
                  idToken: null,
                  expiresAt: Date.now() + 3_600_000,
                },
              }),
            10,
          ),
        ),
    );

    const results = await Promise.all([
      forceRefresh(ACCOUNT, CONFIG),
      forceRefresh(ACCOUNT, CONFIG),
      forceRefresh(ACCOUNT, CONFIG),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(results).toEqual(['fresh', 'fresh', 'fresh']);
  });

  it('persiste le nouveau refresh_token en cas de rotation', async () => {
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'old',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() - 1_000,
    });
    jest.spyOn(oidc, 'refreshTokens').mockResolvedValue({
      ok: true,
      value: {
        accessToken: 'fresh',
        refreshToken: 'rotated',
        idToken: null,
        expiresAt: Date.now() + 3_600_000,
      },
    });
    const save = jest.spyOn(storage, 'saveTokens').mockResolvedValue();

    await forceRefresh(ACCOUNT, CONFIG);

    expect(save).toHaveBeenCalledWith(
      ACCOUNT,
      expect.objectContaining({ refreshToken: 'rotated' }),
    );
  });

  it('ne lance qu\'un rafraîchissement même si la lecture du stockage est lente', async () => {
    // Le test précédent ne suffit pas : avec un loadTokens résolu
    // immédiatement, les trois appelants sont traités en FIFO dans le même lot
    // de microtâches, et le premier a fini sa séquence synchrone avant que le
    // second ne reprenne. Le test passerait donc même si l'insertion dans la
    // carte avait lieu APRÈS un await. Un loadTokens lent supprime cette
    // chance de timing : si l'insertion n'est pas synchrone, les trois
    // franchissent la vérification pendant l'attente.
    jest.spyOn(storage, 'loadTokens').mockImplementation(
      async () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                accessToken: 'old',
                refreshToken: 'rt',
                idToken: null,
                expiresAt: Date.now() - 1_000,
              }),
            10,
          ),
        ),
    );
    const refresh = jest.spyOn(oidc, 'refreshTokens').mockResolvedValue({
      ok: true,
      value: {
        accessToken: 'fresh',
        refreshToken: 'rt2',
        idToken: null,
        expiresAt: Date.now() + 3_600_000,
      },
    });

    await Promise.all([
      forceRefresh(ACCOUNT, CONFIG),
      forceRefresh(ACCOUNT, CONFIG),
      forceRefresh(ACCOUNT, CONFIG),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('libère le verrou après un rejet, pour qu\'une reconnexion reste possible', async () => {
    // Le test suivant couvre un refus typé du SSO, qui est une résolution.
    // Celui-ci couvre un vrai rejet — saveTokens n'entoure pas setItemAsync
    // d'un try/catch, donc une écriture Keychain refusée en est un. Un nettoyage
    // placé sur le chemin de succès plutôt que dans un finally laisserait la
    // promesse rejetée dans la carte, et le compte ne pourrait plus jamais se
    // reconnecter sans redémarrer l'application.
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'old',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() - 1_000,
    });
    const refresh = jest
      .spyOn(oidc, 'refreshTokens')
      .mockRejectedValueOnce(new Error('SSO injoignable'))
      .mockResolvedValueOnce({
        ok: true,
        value: {
          accessToken: 'fresh',
          refreshToken: 'rt2',
          idToken: null,
          expiresAt: Date.now() + 3_600_000,
        },
      });

    expect(await forceRefresh(ACCOUNT, CONFIG)).toBe(null);
    expect(await forceRefresh(ACCOUNT, CONFIG)).toBe('fresh');

    // C'est cette assertion qui prouve la libération du verrou, et elle tient
    // que l'échec soit un rejet ou une résolution : si la carte n'était pas
    // vidée, le second appel recevrait la promesse déjà résolue du premier et
    // rendrait null sans rappeler le SSO.
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('conserve un jeton valide quand seule sa persistance échoue', async () => {
    // refreshTokens réussit, l'écriture Keychain est refusée. Écarter le jeton
    // ici renverrait l'utilisateur vers une reconnexion alors que sa session
    // vient d'être renouvelée avec succès.
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'old',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() - 1_000,
    });
    jest.spyOn(oidc, 'refreshTokens').mockResolvedValue({
      ok: true,
      value: {
        accessToken: 'fresh',
        refreshToken: 'rt2',
        idToken: null,
        expiresAt: Date.now() + 3_600_000,
      },
    });
    jest.spyOn(storage, 'saveTokens').mockRejectedValue(new Error('keychain refusé'));

    expect(await forceRefresh(ACCOUNT, CONFIG)).toBe('fresh');
  });

  it('renvoie null et libère le verrou quand le rafraîchissement échoue', async () => {
    jest.spyOn(storage, 'loadTokens').mockResolvedValue({
      accessToken: 'old',
      refreshToken: 'rt',
      idToken: null,
      expiresAt: Date.now() - 1_000,
    });
    jest
      .spyOn(oidc, 'refreshTokens')
      .mockResolvedValue({ ok: false, error: 'invalid_grant' });

    expect(await forceRefresh(ACCOUNT, CONFIG)).toBe(null);
    expect(await forceRefresh(ACCOUNT, CONFIG)).toBe(null);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/auth/session.spec.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter la session**

`src/auth/session.ts` :

```ts
import { refreshTokens } from 'src/auth/oidc';
import { loadTokens, saveTokens } from 'src/auth/storage';
import type { InstanceConfig } from 'src/instance/types';

// Marge avant expiration en deçà de laquelle on rafraîchit préventivement,
// pour qu'une requête ne parte pas avec un jeton qui expire en vol.
const REFRESH_GUARD_MS = 30_000;

const inFlight = new Map<string, Promise<string | null>>();

export async function getAccessToken(
  accountId: string,
  config: InstanceConfig,
): Promise<string | null> {
  const tokens = await loadTokens(accountId);
  if (tokens === null) return null;

  if (tokens.expiresAt - Date.now() > REFRESH_GUARD_MS) return tokens.accessToken;

  return forceRefresh(accountId, config);
}

export async function forceRefresh(
  accountId: string,
  config: InstanceConfig,
): Promise<string | null> {
  const pending = inFlight.get(accountId);
  if (pending !== undefined) return pending;

  const attempt = (async (): Promise<string | null> => {
    try {
      const tokens = await loadTokens(accountId);
      if (tokens === null || tokens.refreshToken === null) return null;

      const result = await refreshTokens(config, tokens.refreshToken);
      if (!result.ok) return null;

      // Une écriture refusée ne doit pas faire jeter un jeton déjà obtenu : la
      // session est valide, seule sa persistance a manqué. L'écarter renverrait
      // l'utilisateur vers une reconnexion dont il n'a aucun besoin.
      try {
        await saveTokens(accountId, result.value);
      } catch {
        // Jeton utilisable pour cette session, simplement non persisté.
      }

      return result.value.accessToken;
    } catch {
      // Tout autre rejet vaut « pas de jeton » pour l'appelant. Le laisser
      // remonter le ferait étiqueter « network » par le client API, et
      // l'utilisateur lirait « connexion impossible » au lieu de « session à
      // renouveler ». `attempt` ne rejette donc jamais, ce qui donne le même
      // contrat aux appelants concurrents qui attendent cette même promesse.
      return null;
    }
  })();

  inFlight.set(accountId, attempt);
  try {
    return await attempt;
  } finally {
    inFlight.delete(accountId);
  }
}

export function resetSessionForTest(): void {
  inFlight.clear();
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/auth/session.spec.ts`
Expected: PASS — six tests, dont le test de concurrence

- [ ] **Step 5: Commit**

```bash
git add src/auth/session.ts src/auth/session.spec.ts
git commit -m "feat(auth): Refresh access tokens with single-flight deduplication"
```

---

### Task 10: Client API porteur du Bearer

**Files:**
- Create: `src/api/types.ts`, `src/api/client.ts`
- Test: `src/api/client.spec.ts`

**Interfaces:**
- Consumes: `getAccessToken`, `forceRefresh` de `src/auth/session` ; `Account` de `src/auth/accounts`
- Produces: types `ApiResult<T>`, `ApiError` ; `authedFetch<T>(account, path, init?): Promise<ApiResult<T>>`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/api/client.spec.ts` :

```ts
import { authedFetch } from 'src/api/client';
import * as session from 'src/auth/session';
import type { Account } from 'src/auth/accounts';

const ACCOUNT: Account = {
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
};

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('authedFetch', () => {
  it('joint le jeton porteur à la requête', async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue('at');
    // Les génériques explicites sont nécessaires : sans paramètres déclarés,
    // noUncheckedIndexedAccess rejette l'accès à calls[0][1] comme hors tuple.
    const spy = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
      async () => new Response(JSON.stringify({ id: 1 }), { status: 200 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await authedFetch<{ id: number }>(ACCOUNT, '/api/v1.0/users/me/');

    expect(result).toEqual({ ok: true, value: { id: 1 } });
    const headers = (spy.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer at');
  });

  it('rafraîchit puis rejoue une seule fois sur 401', async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue('stale');
    const refresh = jest.spyOn(session, 'forceRefresh').mockResolvedValue('fresh');
    const spy = jest
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 2 }), { status: 200 }));
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await authedFetch<{ id: number }>(ACCOUNT, '/api/v1.0/users/me/');

    expect(result).toEqual({ ok: true, value: { id: 2 } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('ne rejoue qu\'une seule fois, même si le 401 persiste', async () => {
    // Sans borne, un 401 persistant accompagné d'un rafraîchissement qui
    // réussit boucle indéfiniment et martèle le SSO. Aucun autre test ne
    // distingue « rejoue une fois » de « rejoue sans fin » : chacun résout au
    // second appel ou échoue au rafraîchissement du premier. C'est
    // toHaveBeenCalledTimes(2) qui borne, et rien d'autre.
    jest.spyOn(session, 'getAccessToken').mockResolvedValue('stale');
    jest.spyOn(session, 'forceRefresh').mockResolvedValue('fresh');
    const spy = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
      async () => new Response(null, { status: 401 }),
    );
    globalThis.fetch = spy as unknown as typeof fetch;

    const result = await authedFetch(ACCOUNT, '/api/v1.0/users/me/');

    expect(result).toEqual({ ok: false, error: { kind: 'unauthorized' } });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('rend unauthorized quand le rafraîchissement échoue', async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue('stale');
    jest.spyOn(session, 'forceRefresh').mockResolvedValue(null);
    globalThis.fetch = jest.fn(
      async () => new Response(null, { status: 401 }),
    ) as unknown as typeof fetch;

    const result = await authedFetch(ACCOUNT, '/api/v1.0/users/me/');

    expect(result).toEqual({ ok: false, error: { kind: 'unauthorized' } });
  });

  it('mappe 403 sur forbidden', async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue('at');
    globalThis.fetch = jest.fn(
      async () => new Response(null, { status: 403 }),
    ) as unknown as typeof fetch;

    const result = await authedFetch(ACCOUNT, '/api/v1.0/rooms/x/');

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
  });

  it('mappe une panne réseau sur network', async () => {
    jest.spyOn(session, 'getAccessToken').mockResolvedValue('at');
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;

    const result = await authedFetch(ACCOUNT, '/api/v1.0/users/me/');

    expect(result).toEqual({ ok: false, error: { kind: 'network' } });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/api/client.spec.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Écrire les types d'erreur**

`src/api/types.ts` :

```ts
// `lobby` n'est produit par aucun code de statut : c'est fetchRoomAccess, en
// Task 11, qui le construit depuis l'absence du bloc livekit dans la réponse.
// Il vit ici parce que c'est l'union sur laquelle tous les écrans branchent.
export type ApiError =
  | { kind: 'network' }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'not-found' }
  | { kind: 'lobby'; participantId: string }
  | { kind: 'server'; status: number };

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };
```

- [ ] **Step 4: Implémenter le client**

`src/api/client.ts` :

```ts
import type { ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';
import { forceRefresh, getAccessToken } from 'src/auth/session';
import { REQUEST_TIMEOUT_MS } from 'src/constants';

function mapStatus(status: number): ApiResult<never> {
  if (status === 403) return { ok: false, error: { kind: 'forbidden' } };
  if (status === 404) return { ok: false, error: { kind: 'not-found' } };
  return { ok: false, error: { kind: 'server', status } };
}

export async function authedFetch<T>(
  account: Account,
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const url = `${account.instance.serverUrl}${path}`;

  const send = async (token: string): Promise<Response> =>
    fetch(url, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  let token = await getAccessToken(account.id, account.instance);
  if (token === null) return { ok: false, error: { kind: 'unauthorized' } };

  let response: Response;
  try {
    response = await send(token);

    // Un seul rejeu : au-delà, le refus est structurel et non transitoire.
    if (response.status === 401) {
      const refreshed = await forceRefresh(account.id, account.instance);
      if (refreshed === null) return { ok: false, error: { kind: 'unauthorized' } };
      token = refreshed;
      response = await send(token);
      if (response.status === 401) {
        return { ok: false, error: { kind: 'unauthorized' } };
      }
    }
  } catch {
    return { ok: false, error: { kind: 'network' } };
  }

  if (!response.ok) return mapStatus(response.status);

  try {
    return { ok: true, value: (await response.json()) as T };
  } catch {
    return { ok: false, error: { kind: 'server', status: response.status } };
  }
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/api/client.spec.ts`
Expected: PASS — cinq tests

- [ ] **Step 6: Commit**

```bash
git add src/api
git commit -m "feat(api): Add a bearer-authenticated client with 401 retry"
```

---

### Task 11: API salons et utilisateur

**Files:**
- Create: `src/api/rooms.ts`, `src/api/users.ts`, `src/call/types.ts`
- Test: `src/api/rooms.spec.ts`

**Interfaces:**
- Consumes: `authedFetch` de `src/api/client` ; `ApiResult` de `src/api/types`
- Produces: type `RoomAccess`, `AccessLevel`, `Room` ; `fetchRoomAccess`, `fetchMyRooms`, `createRoom`, `grantRoomAccess`, `requestEntry` ; type `Me`, `fetchMe`, `searchUsers`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/api/rooms.spec.ts` :

```ts
import { createRoom, fetchRoomAccess } from 'src/api/rooms';
import * as client from 'src/api/client';
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

describe('fetchRoomAccess', () => {
  it('extrait l\'URL et le jeton LiveKit', async () => {
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'r-1',
        slug: 'reunion',
        access_level: 'trusted',
        livekit: { url: 'https://livekit.linagora.com', room: 'r-1', token: 'lk-token' },
      },
    });

    const result = await fetchRoomAccess(ACCOUNT, 'reunion');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.livekitUrl).toBe('https://livekit.linagora.com');
    expect(result.value.token).toBe('lk-token');
    expect(result.value.room.slug).toBe('reunion');
  });

  it('signale la salle d\'attente quand le bloc livekit est absent', async () => {
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'r-1', slug: 'reunion', access_level: 'restricted' },
    });

    const result = await fetchRoomAccess(ACCOUNT, 'reunion');

    expect(result).toEqual({ ok: false, error: { kind: 'lobby', participantId: '' } });
  });
});

describe('createRoom', () => {
  it('transmet le nom et le niveau d\'accès choisis', async () => {
    // spyOn conserve la signature d'authedFetch, donc calls[0][2] est typé
    // sans générique supplémentaire, contrairement à un jest.fn() nu.
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'r-2', slug: 'point-hebdo', access_level: 'public' },
    });

    await createRoom(ACCOUNT, { name: 'Point hebdo', accessLevel: 'public' });

    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Point hebdo',
      access_level: 'public',
    });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/api/rooms.spec.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Écrire les types de séance**

`src/call/types.ts` :

```ts
export type AccessLevel = 'public' | 'trusted' | 'restricted';

export type Room = {
  readonly id: string | null;
  readonly slug: string;
  readonly name: string;
  readonly accessLevel: AccessLevel;
};

export type RoomAccess = {
  readonly room: Room;
  readonly livekitUrl: string;
  readonly token: string;
};

export type CallState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'connected' }
  | { status: 'reconnecting' }
  | { status: 'disconnected'; reason: string };
```

- [ ] **Step 4: Implémenter l'API salons**

`src/api/rooms.ts` :

```ts
import { authedFetch } from 'src/api/client';
import type { ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';
import type { AccessLevel, Room, RoomAccess } from 'src/call/types';

type RawRoom = {
  id: string | null;
  slug: string;
  name?: string;
  access_level: AccessLevel;
  livekit?: { url: string; room: string; token: string };
};

type RoomRole = 'owner' | 'administrator' | 'member';

function toRoom(raw: RawRoom): Room {
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name ?? raw.slug,
    accessLevel: raw.access_level,
  };
}

export async function fetchRoomAccess(
  account: Account,
  slug: string,
): Promise<ApiResult<RoomAccess>> {
  const result = await authedFetch<RawRoom>(
    account,
    `/api/v1.0/rooms/${encodeURIComponent(slug)}/`,
  );
  if (!result.ok) return result;

  // Le backend n'inclut le bloc livekit que si l'appelant a droit d'entrer.
  // Son absence signifie que le salon exige un passage par la salle d'attente.
  const livekit = result.value.livekit;
  if (livekit === undefined) {
    return { ok: false, error: { kind: 'lobby', participantId: '' } };
  }

  return {
    ok: true,
    value: { room: toRoom(result.value), livekitUrl: livekit.url, token: livekit.token },
  };
}

export async function fetchMyRooms(account: Account): Promise<ApiResult<readonly Room[]>> {
  const result = await authedFetch<{ results: RawRoom[] }>(account, '/api/v1.0/rooms/');
  if (!result.ok) return result;
  return { ok: true, value: result.value.results.map(toRoom) };
}

export async function createRoom(
  account: Account,
  input: { name: string; accessLevel: AccessLevel },
): Promise<ApiResult<Room>> {
  const result = await authedFetch<RawRoom>(account, '/api/v1.0/rooms/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: input.name, access_level: input.accessLevel }),
  });
  if (!result.ok) return result;
  return { ok: true, value: toRoom(result.value) };
}

// perform_create n'attribue le rôle owner qu'au créateur. Sans cet appel, la
// personne pour qui la réunion est organisée n'a aucun droit de modération.
export async function grantRoomAccess(
  account: Account,
  roomId: string,
  userId: string,
  role: RoomRole,
): Promise<ApiResult<void>> {
  const result = await authedFetch<unknown>(account, '/api/v1.0/resource-accesses/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resource: roomId, user: userId, role }),
  });
  if (!result.ok) return result;
  return { ok: true, value: undefined };
}

export async function requestEntry(
  account: Account,
  slug: string,
  username: string,
): Promise<ApiResult<{ participantId: string }>> {
  const result = await authedFetch<{ id: string }>(
    account,
    `/api/v1.0/rooms/${encodeURIComponent(slug)}/request-entry/`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username }),
    },
  );
  if (!result.ok) return result;
  return { ok: true, value: { participantId: result.value.id } };
}
```

- [ ] **Step 5: Implémenter l'API utilisateur**

`src/api/users.ts` :

```ts
import { authedFetch } from 'src/api/client';
import type { ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';

export type Me = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
};

type RawMe = { id: string; email: string; full_name?: string; short_name?: string };

export async function fetchMe(account: Account): Promise<ApiResult<Me>> {
  const result = await authedFetch<RawMe>(account, '/api/v1.0/users/me/');
  if (!result.ok) return result;
  const raw = result.value;
  return {
    ok: true,
    value: {
      id: raw.id,
      email: raw.email,
      displayName: raw.full_name ?? raw.short_name ?? raw.email,
    },
  };
}

// Recherche par similarité trigramme sur l'email. Le backend renvoie une liste
// vide quand ALLOW_UNSECURE_USER_LISTING est désactivé — indistinguable d'une
// absence de résultat côté client, d'où la formulation neutre de l'écran appelant.
export async function searchUsers(
  account: Account,
  query: string,
): Promise<ApiResult<readonly Me[]>> {
  const result = await authedFetch<{ results: RawMe[] }>(
    account,
    `/api/v1.0/users/?q=${encodeURIComponent(query)}`,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    value: result.value.results.map((raw) => ({
      id: raw.id,
      email: raw.email,
      displayName: raw.full_name ?? raw.short_name ?? raw.email,
    })),
  };
}
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/api/rooms.spec.ts`
Expected: PASS — trois tests

- [ ] **Step 7: Commit**

```bash
git add src/api src/call/types.ts
git commit -m "feat(api): Add room and user endpoints with LiveKit access extraction"
```

---

## Phase 2 — Écrans d'authentification

### Task 12: Orchestration de la connexion

**Files:**
- Create: `src/auth/login.ts`
- Test: `src/auth/login.spec.ts`

**Interfaces:**
- Consumes: `createPkcePair` ; `buildAuthorizeUrl`, `exchangeCode` ; `fetchInstanceConfig` ; `fetchMe` ; `addAccount`, `makeAccountId` ; `saveTokens`
- Produces: `signIn(serverUrl: string, loginHint?: string): Promise<LoginResult>` ; type `LoginResult`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/auth/login.spec.ts` :

```ts
import * as webBrowser from 'expo-web-browser';

import { signIn } from 'src/auth/login';
import * as oidc from 'src/auth/oidc';
import * as storage from 'src/auth/storage';
import * as users from 'src/api/users';
import * as discovery from 'src/instance/discovery';
import { resetAccountsForTest } from 'src/auth/accounts';

const CONFIG = {
  serverUrl: 'https://meet.linagora.com',
  issuer: 'https://sso.linagora.com',
  clientId: 'twake-visio',
  livekitUrl: 'https://livekit.linagora.com',
  features: { recording: true, subtitle: true, telephony: false },
};

beforeEach(() => {
  resetAccountsForTest();
  jest.restoreAllMocks();
  jest.spyOn(discovery, 'fetchInstanceConfig').mockResolvedValue({ ok: true, value: CONFIG });
  jest.spyOn(storage, 'saveTokens').mockResolvedValue();
});

describe('signIn', () => {
  it('utilise openAuthSessionAsync et non une WebView', async () => {
    const open = jest.spyOn(webBrowser, 'openAuthSessionAsync').mockResolvedValue({
      type: 'success',
      url: 'twakevisio://callback?code=abc&state=STATE',
    } as never);
    jest.spyOn(oidc, 'exchangeCode').mockResolvedValue({
      ok: true,
      value: { accessToken: 'at', refreshToken: 'rt', idToken: null, expiresAt: Date.now() + 1000 },
    });
    jest.spyOn(users, 'fetchMe').mockResolvedValue({
      ok: true,
      value: { id: 'u-1', email: 'ada@linagora.com', displayName: 'Ada' },
    });

    const result = await signIn('https://meet.linagora.com');

    expect(open).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('rejette une réponse dont le state ne correspond pas', async () => {
    jest.spyOn(webBrowser, 'openAuthSessionAsync').mockResolvedValue({
      type: 'success',
      url: 'twakevisio://callback?code=abc&state=FORGED',
    } as never);
    const exchange = jest.spyOn(oidc, 'exchangeCode');

    const result = await signIn('https://meet.linagora.com');

    expect(result).toEqual({ ok: false, error: 'state-mismatch' });
    expect(exchange).not.toHaveBeenCalled();
  });

  it('remonte l\'annulation utilisateur sans erreur bruyante', async () => {
    jest
      .spyOn(webBrowser, 'openAuthSessionAsync')
      .mockResolvedValue({ type: 'cancel' } as never);

    const result = await signIn('https://meet.linagora.com');

    expect(result).toEqual({ ok: false, error: 'cancelled' });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/auth/login.spec.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter l'orchestration**

`src/auth/login.ts` :

```ts
import { getRandomBytes } from 'expo-crypto';
import { openAuthSessionAsync } from 'expo-web-browser';

import { fetchMe } from 'src/api/users';
import {
  addAccount,
  makeAccountId,
  setActiveAccount,
  type Account,
} from 'src/auth/accounts';
import { buildAuthorizeUrl, exchangeCode } from 'src/auth/oidc';
import { createPkcePair } from 'src/auth/pkce';
import { saveTokens } from 'src/auth/storage';
import { OIDC_REDIRECT_URI } from 'src/constants';
import { fetchInstanceConfig } from 'src/instance/discovery';

export type LoginError =
  | 'unreachable'
  | 'not-a-meet-instance'
  | 'oidc-undiscoverable'
  | 'cancelled'
  | 'state-mismatch'
  | 'token-exchange-failed'
  | 'profile-unavailable';

export type LoginResult = { ok: true; value: Account } | { ok: false; error: LoginError };

function makeState(): string {
  return Array.from(getRandomBytes(16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function signIn(
  serverUrl: string,
  loginHint?: string,
): Promise<LoginResult> {
  const instance = await fetchInstanceConfig(serverUrl);
  if (!instance.ok) return { ok: false, error: instance.error };

  const pkce = await createPkcePair();
  const state = makeState();
  const authorizeUrl = buildAuthorizeUrl(instance.value, pkce, state, loginHint);

  // Navigateur système, jamais une WebView : RFC 8252.
  const session = await openAuthSessionAsync(authorizeUrl, OIDC_REDIRECT_URI);
  if (session.type !== 'success') return { ok: false, error: 'cancelled' };

  const returned = new URL(session.url);
  if (returned.searchParams.get('state') !== state) {
    return { ok: false, error: 'state-mismatch' };
  }

  const code = returned.searchParams.get('code');
  if (code === null) return { ok: false, error: 'token-exchange-failed' };

  const tokens = await exchangeCode(instance.value, code, pkce.verifier);
  if (!tokens.ok) return { ok: false, error: 'token-exchange-failed' };

  const provisional: Account = {
    id: makeAccountId(instance.value.issuer, 'pending'),
    instance: instance.value,
    email: '',
    displayName: '',
  };
  await saveTokens(provisional.id, tokens.value);

  const me = await fetchMe(provisional);
  if (!me.ok) return { ok: false, error: 'profile-unavailable' };

  const account: Account = {
    id: makeAccountId(instance.value.issuer, me.value.id),
    instance: instance.value,
    email: me.value.email,
    displayName: me.value.displayName,
  };
  await saveTokens(account.id, tokens.value);

  // addAccount enregistre sans activer, pour qu'un rafraîchissement en arrière-plan
  // ne vole pas le compte actif. Une connexion explicite, elle, doit bien basculer.
  const registered = addAccount(account);
  setActiveAccount(registered.id);

  return { ok: true, value: registered };
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/auth/login.spec.ts`
Expected: PASS — trois tests

- [ ] **Step 5: Commit**

```bash
git add src/auth/login.ts src/auth/login.spec.ts
git commit -m "feat(auth): Orchestrate sign-in through the system browser"
```

---

### Task 13: Écrans de bienvenue et de serveur

> **Attention à l'intégration.** La Task 20 a déjà ajouté un `useEffect` d'écoute
> des liens profonds dans `app/_layout.tsx`. Le `_layout.tsx` ci-dessous doit
> **fusionner** avec l'existant — conserver l'écoute des liens et y ajouter le
> thème et l'i18n — et non l'écraser.

**Files:**
- Create: `app/_layout.tsx`, `app/index.tsx`, `app/welcome.tsx`, `app/server.tsx`
- Test: `app/welcome.spec.tsx`

**Interfaces:**
- Consumes: `signIn` de `src/auth/login` ; `getActiveAccount` de `src/auth/accounts` ; `makeTheme` de `src/ui/theme` ; `initI18n` de `src/i18n`
- Produces: routes `/welcome`, `/server`

Les trois entrées exigées par `twake-mobile-login` : se connecter, s'inscrire, se connecter avec le serveur de l'organisation.

- [ ] **Step 1: Écrire le test qui échoue**

`app/welcome.spec.tsx` :

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import WelcomeScreen from './welcome';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('WelcomeScreen', () => {
  it('propose les trois entrées exigées', () => {
    render(<WelcomeScreen />);

    expect(screen.queryByTestId('sign-in-btn')).not.toBeNull();
    expect(screen.queryByTestId('sign-up-btn')).not.toBeNull();
    expect(screen.queryByTestId('org-server-btn')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- app/welcome.spec.tsx`
Expected: FAIL — module introuvable

- [ ] **Step 3: Écrire la mise en page racine**

`app/_layout.tsx` :

```tsx
import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { initI18n } from 'src/i18n';
import { makeTheme } from 'src/ui/theme';

export default function RootLayout(): React.ReactElement | null {
  const scheme = useColorScheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initI18n()
      .then(() => setReady(true))
      .catch(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <PaperProvider theme={makeTheme(scheme === 'dark' ? 'dark' : 'light')}>
      <Stack screenOptions={{ headerShown: false }} />
    </PaperProvider>
  );
}
```

- [ ] **Step 4: Écrire l'aiguillage**

`app/index.tsx` :

```tsx
import { Redirect } from 'expo-router';
import React from 'react';

import { getActiveAccount } from 'src/auth/accounts';

export default function Index(): React.ReactElement {
  return <Redirect href={getActiveAccount() === null ? '/welcome' : '/home'} />;
}
```

- [ ] **Step 5: Écrire l'écran de bienvenue**

`app/welcome.tsx` :

```tsx
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from 'react-native-paper';

import { DEFAULT_SERVER_URL } from 'src/constants';
import { signIn } from 'src/auth/login';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
});

export default function WelcomeScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();

  const handleSignIn = async (): Promise<void> => {
    const result = await signIn(DEFAULT_SERVER_URL);
    if (result.ok) router.replace('/home');
  };

  const handleSignUp = (): void => {
    router.push('/server?register=1');
  };

  const handleOrgServer = (): void => {
    router.push('/server');
  };

  return (
    <View style={styles.root}>
      <Button mode="contained" testID="sign-in-btn" onPress={handleSignIn}>
        {t('welcome.signIn')}
      </Button>
      <Button mode="outlined" testID="sign-up-btn" onPress={handleSignUp}>
        {t('welcome.signUp')}
      </Button>
      <Button mode="text" testID="org-server-btn" onPress={handleOrgServer}>
        {t('welcome.orgServer')}
      </Button>
    </View>
  );
}
```

Ajouter dans `src/constants.ts` :

```ts
export const DEFAULT_SERVER_URL = 'https://meet.linagora.com';
```

- [ ] **Step 6: Écrire l'écran de saisie serveur**

`app/server.tsx` :

```tsx
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, HelperText, TextInput } from 'react-native-paper';

import { signIn } from 'src/auth/login';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: tokens.spacing.lg },
});

function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const withScheme = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    return null;
  }
}

export default function ServerScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async (): Promise<void> => {
    const serverUrl = normalizeServerUrl(value);
    if (serverUrl === null) {
      setError(t('server.invalid'));
      return;
    }
    const hint = value.includes('@') ? value.trim() : undefined;
    const result = await signIn(serverUrl, hint);
    if (result.ok) {
      router.replace('/home');
      return;
    }
    setError(t(result.error === 'unreachable' ? 'server.unreachable' : 'server.invalid'));
  };

  return (
    <View style={styles.root}>
      <TextInput
        testID="server-input"
        label={t('server.prompt')}
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <HelperText type="error" visible={error !== null}>
        {error ?? ''}
      </HelperText>
      <Button mode="contained" testID="server-continue-btn" onPress={handleContinue}>
        {t('welcome.signIn')}
      </Button>
    </View>
  );
}
```

- [ ] **Step 7: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS sur les trois

- [ ] **Step 8: Commit**

```bash
git add app src/constants.ts
git commit -m "feat(auth): Add the welcome and organization server screens"
```

---

## Phase 3 — Salons

### Task 14: Écran d'accueil

**Files:**
- Create: `app/home.tsx`
- Test: `app/home.spec.tsx`

**Interfaces:**
- Consumes: `fetchMyRooms` de `src/api/rooms` ; `getActiveAccount` de `src/auth/accounts`
- Produces: route `/home`

- [ ] **Step 1: Écrire le test qui échoue**

`app/home.spec.tsx` :

```tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as rooms from 'src/api/rooms';
import * as accounts from 'src/auth/accounts';
import HomeScreen from './home';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
};

describe('HomeScreen', () => {
  it('affiche les réunions renvoyées par l\'API', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest.spyOn(rooms, 'fetchMyRooms').mockResolvedValue({
      ok: true,
      value: [{ id: 'r-1', slug: 'point-hebdo', name: 'Point hebdo', accessLevel: 'trusted' }],
    });

    render(<HomeScreen />);

    await waitFor(() => {
      expect(screen.getByText('Point hebdo')).toBeTruthy();
    });
  });

  it('n\'affiche aucune liste quand l\'API échoue', async () => {
    jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
    jest
      .spyOn(rooms, 'fetchMyRooms')
      .mockResolvedValue({ ok: false, error: { kind: 'network' } });

    render(<HomeScreen />);

    await waitFor(() => {
      expect(screen.queryByTestId('room-item')).toBe(null);
    });
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- app/home.spec.tsx`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter l'écran**

`app/home.tsx` :

```tsx
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, List, Text, TextInput } from 'react-native-paper';

import { fetchMyRooms } from 'src/api/rooms';
import { getActiveAccount } from 'src/auth/accounts';
import type { Room } from 'src/call/types';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, padding: tokens.spacing.md, gap: tokens.spacing.md },
  joinRow: { flexDirection: 'row', gap: tokens.spacing.sm, alignItems: 'center' },
  joinInput: { flex: 1 },
});

export default function HomeScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const [rooms, setRooms] = useState<readonly Room[]>([]);
  const [code, setCode] = useState('');

  useEffect(() => {
    const account = getActiveAccount();
    if (account === null) return;
    fetchMyRooms(account)
      .then((result) => {
        if (result.ok) setRooms(result.value);
      })
      .catch(() => setRooms([]));
  }, []);

  const handleJoin = (): void => {
    if (code.trim().length > 0) router.push(`/room/${code.trim()}/prejoin`);
  };

  const handleCreate = (): void => {
    router.push('/room/create');
  };

  return (
    <View style={styles.root}>
      <View style={styles.joinRow}>
        <TextInput
          testID="join-code-input"
          style={styles.joinInput}
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          placeholder={t('home.join')}
        />
        <Button mode="contained" testID="join-btn" onPress={handleJoin}>
          {t('home.join')}
        </Button>
      </View>

      <Button mode="outlined" testID="create-room-btn" onPress={handleCreate}>
        {t('home.create')}
      </Button>

      <Text variant="titleMedium">{t('home.myRooms')}</Text>
      <FlatList
        data={[...rooms]}
        keyExtractor={(room) => room.slug}
        renderItem={({ item }) => (
          <List.Item
            testID="room-item"
            title={item.name}
            onPress={() => router.push(`/room/${item.slug}/prejoin`)}
          />
        )}
      />
    </View>
  );
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- app/home.spec.tsx`
Expected: PASS — deux tests

- [ ] **Step 5: Commit**

```bash
git add app/home.tsx app/home.spec.tsx
git commit -m "feat(rooms): Add the home screen listing meetings and joining by code"
```

---

### Task 15: Création de salon avec niveau d'accès et co-organisateurs

**Files:**
- Create: `app/room/create.tsx`
- Test: `app/room/create.spec.tsx`

**Interfaces:**
- Consumes: `createRoom`, `grantRoomAccess` de `src/api/rooms` ; `AccessLevel` de `src/call/types`
- Produces: route `/room/create`

L'exigence produit centrale : le créateur d'un salon n'a pas à être présent pour que la réunion démarre. `restricted` casse cette propriété et `trusted` la casse pour les invités externes — d'où un choix explicite, formulé par sa conséquence.

- [ ] **Step 1: Écrire les tests qui échouent**

`app/room/create.spec.tsx` :

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as rooms from 'src/api/rooms';
import * as users from 'src/api/users';
import * as accounts from 'src/auth/accounts';
import CreateRoomScreen from './create';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
};

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
});

describe('CreateRoomScreen', () => {
  it('propose public par défaut, pour que la réunion démarre sans le créateur', () => {
    render(<CreateRoomScreen />);
    expect(screen.getByTestId('access-public')).toBeTruthy();
    expect(screen.getByText('room.accessPublic')).toBeTruthy();
  });

  it('avertit que restricted exige un modérateur présent', () => {
    render(<CreateRoomScreen />);
    fireEvent.press(screen.getByTestId('access-restricted'));
    expect(screen.getByTestId('moderator-warning')).toBeTruthy();
  });

  it('crée le salon avec le niveau d\'accès sélectionné', async () => {
    const create = jest.spyOn(rooms, 'createRoom').mockResolvedValue({
      ok: true,
      value: { id: 'r-9', slug: 'revue', name: 'Revue', accessLevel: 'public' },
    });

    render(<CreateRoomScreen />);
    fireEvent.changeText(screen.getByTestId('room-name-input'), 'Revue');
    fireEvent.press(screen.getByTestId('submit-btn'));

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      { name: 'Revue', accessLevel: 'public' },
    );
  });

  it('accorde le rôle owner aux co-organisateurs sélectionnés', async () => {
    jest.spyOn(users, 'searchUsers').mockResolvedValue({
      ok: true,
      value: [{ id: 'u-2', email: 'boss@linagora.com', displayName: 'Boss' }],
    });
    jest.spyOn(rooms, 'createRoom').mockResolvedValue({
      ok: true,
      value: { id: 'r-9', slug: 'revue', name: 'Revue', accessLevel: 'public' },
    });
    const grant = jest
      .spyOn(rooms, 'grantRoomAccess')
      .mockResolvedValue({ ok: true, value: undefined });

    render(<CreateRoomScreen />);
    fireEvent.changeText(screen.getByTestId('room-name-input'), 'Revue');
    fireEvent.changeText(screen.getByTestId('co-owner-input'), 'boss@linagora.com');
    fireEvent(screen.getByTestId('co-owner-input'), 'submitEditing');

    await waitFor(() => {
      expect(screen.getByTestId('co-owner-candidate')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('co-owner-candidate'));
    fireEvent.press(screen.getByTestId('submit-btn'));

    await waitFor(() => {
      expect(grant).toHaveBeenCalledWith(expect.anything(), 'r-9', 'u-2', 'owner');
    });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- app/room/create.spec.tsx`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter l'écran**

`app/room/create.tsx` :

```tsx
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, HelperText, RadioButton, Text, TextInput } from 'react-native-paper';

import { createRoom, grantRoomAccess } from 'src/api/rooms';
import { searchUsers, type Me } from 'src/api/users';
import { getActiveAccount } from 'src/auth/accounts';
import type { AccessLevel } from 'src/call/types';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { padding: tokens.spacing.md, gap: tokens.spacing.md },
  option: { gap: tokens.spacing.xs },
});

const ACCESS_COPY: Readonly<Record<AccessLevel, string>> = {
  public: 'room.accessPublic',
  trusted: 'room.accessTrusted',
  restricted: 'room.accessRestricted',
};

export default function CreateRoomScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const [name, setName] = useState('');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('public');
  const [coOwnerQuery, setCoOwnerQuery] = useState('');
  const [candidates, setCandidates] = useState<readonly Me[]>([]);
  const [coOwners, setCoOwners] = useState<readonly Me[]>([]);

  const handleSearch = async (): Promise<void> => {
    const account = getActiveAccount();
    if (account === null || coOwnerQuery.trim().length === 0) return;
    const result = await searchUsers(account, coOwnerQuery.trim());
    setCandidates(result.ok ? result.value : []);
  };

  const handleAddCoOwner = (user: Me): void => {
    setCoOwners((current) =>
      current.some((u) => u.id === user.id) ? current : [...current, user],
    );
    setCandidates([]);
    setCoOwnerQuery('');
  };

  const handleSubmit = async (): Promise<void> => {
    const account = getActiveAccount();
    if (account === null || name.trim().length === 0) return;

    const result = await createRoom(account, { name: name.trim(), accessLevel });
    if (!result.ok) return;

    // perform_create n'attribue owner qu'au créateur. Sans ces appels, la
    // personne pour qui la réunion est organisée n'a aucun droit de modération.
    const roomId = result.value.id;
    if (roomId !== null) {
      for (const owner of coOwners) {
        await grantRoomAccess(account, roomId, owner.id, 'owner');
      }
    }

    router.replace(`/room/${result.value.slug}/prejoin`);
  };

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <TextInput
        testID="room-name-input"
        label={t('room.name')}
        value={name}
        onChangeText={setName}
      />

      <RadioButton.Group
        value={accessLevel}
        onValueChange={(value) => setAccessLevel(value as AccessLevel)}
      >
        {(['public', 'trusted', 'restricted'] as const).map((level) => (
          <View key={level} style={styles.option}>
            <RadioButton.Item
              testID={`access-${level}`}
              label={t(ACCESS_COPY[level])}
              value={level}
            />
          </View>
        ))}
      </RadioButton.Group>

      {accessLevel !== 'public' ? (
        <HelperText type="info" testID="moderator-warning" visible>
          {t('lobby.noModerator')}
        </HelperText>
      ) : null}

      <Text variant="labelLarge">{t('room.coOwners')}</Text>
      <TextInput
        testID="co-owner-input"
        label={t('room.coOwnerSearch')}
        value={coOwnerQuery}
        onChangeText={setCoOwnerQuery}
        autoCapitalize="none"
        keyboardType="email-address"
        onSubmitEditing={handleSearch}
      />

      {candidates.map((user) => (
        <Button
          key={user.id}
          testID="co-owner-candidate"
          mode="text"
          onPress={() => handleAddCoOwner(user)}
        >
          {user.email}
        </Button>
      ))}

      {coOwners.map((user) => (
        <Text key={user.id} testID="co-owner-selected">
          {user.email}
        </Text>
      ))}

      <Button mode="contained" testID="submit-btn" onPress={handleSubmit}>
        {t('home.create')}
      </Button>
    </ScrollView>
  );
}
```

Ajouter la clé `room.coOwnerSearch` aux sept locales — `« Rechercher par email »` en
français, `"Search by email"` en anglais. Le test de la Task 3 échouera tant qu'une
locale manque à l'appel.

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- app/room/create.spec.tsx`
Expected: PASS — trois tests

- [ ] **Step 5: Commit**

```bash
git add app/room
git commit -m "feat(rooms): Create rooms with an explicit access level choice"
```

---

## Phase 4 — Séance

### Task 16: Connexion LiveKit

**Files:**
- Create: `src/call/connection.ts`, `src/call/media.ts`
- Test: `src/call/connection.spec.ts`

**Interfaces:**
- Consumes: `RoomAccess`, `CallState` de `src/call/types` ; `Room` de `livekit-client`
- Produces: `createCallSession(): CallSession` avec `connect(access)`, `disconnect()`, `subscribe(listener)`, `getState()`

Ce module ne connaît ni OIDC ni instance : il reçoit une URL et un jeton. Il se teste donc sans SSO ni backend meet.

- [ ] **Step 1: Écrire les tests qui échouent**

`src/call/connection.spec.ts` :

```ts
import { createCallSession } from 'src/call/connection';
import type { RoomAccess } from 'src/call/types';

const ACCESS: RoomAccess = {
  room: { id: 'r-1', slug: 'reunion', name: 'Réunion', accessLevel: 'public' },
  livekitUrl: 'wss://livekit.linagora.com',
  token: 'lk-token',
};

const connectMock = jest.fn();
const disconnectMock = jest.fn();

jest.mock('livekit-client', () => ({
  Room: class {
    connect = connectMock;
    disconnect = disconnectMock;
    on = jest.fn();
    off = jest.fn();
  },
  RoomEvent: { Disconnected: 'disconnected', Reconnecting: 'reconnecting' },
}));

beforeEach(() => {
  connectMock.mockReset().mockResolvedValue(undefined);
  disconnectMock.mockReset().mockResolvedValue(undefined);
});

describe('createCallSession', () => {
  it('démarre à l\'état idle', () => {
    expect(createCallSession().getState()).toEqual({ status: 'idle' });
  });

  it('passe par connecting puis connected', async () => {
    const session = createCallSession();
    const seen: string[] = [];
    session.subscribe((state) => seen.push(state.status));

    await session.connect(ACCESS);

    expect(seen).toEqual(['connecting', 'connected']);
    expect(connectMock).toHaveBeenCalledWith(ACCESS.livekitUrl, ACCESS.token);
  });

  it('retombe sur disconnected quand la connexion échoue', async () => {
    connectMock.mockRejectedValue(new Error('refused'));
    const session = createCallSession();

    await session.connect(ACCESS);

    expect(session.getState()).toEqual({ status: 'disconnected', reason: 'refused' });
  });

  it('ne relance pas une connexion déjà en cours', async () => {
    const session = createCallSession();

    await Promise.all([session.connect(ACCESS), session.connect(ACCESS)]);

    expect(connectMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/call/connection.spec.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter la session**

`src/call/connection.ts` :

```ts
import { Room, RoomEvent } from 'livekit-client';

import type { CallState, RoomAccess } from 'src/call/types';

export type CallListener = (state: CallState) => void;

export type CallSession = {
  connect: (access: RoomAccess) => Promise<void>;
  disconnect: () => Promise<void>;
  subscribe: (listener: CallListener) => () => void;
  getState: () => CallState;
  getRoom: () => Room;
};

export function createCallSession(): CallSession {
  const room = new Room();
  let state: CallState = { status: 'idle' };
  const listeners = new Set<CallListener>();

  function setState(next: CallState): void {
    state = next;
    for (const listener of listeners) listener(next);
  }

  room.on(RoomEvent.Reconnecting, () => setState({ status: 'reconnecting' }));
  room.on(RoomEvent.Disconnected, () =>
    setState({ status: 'disconnected', reason: 'closed' }),
  );

  return {
    async connect(access: RoomAccess): Promise<void> {
      // Une seconde demande pendant l'établissement doit être ignorée, sinon
      // LiveKit ouvre deux transports et le premier est abandonné en silence.
      if (state.status === 'connecting' || state.status === 'connected') return;

      setState({ status: 'connecting' });
      try {
        await room.connect(access.livekitUrl, access.token);
        setState({ status: 'connected' });
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        setState({ status: 'disconnected', reason });
      }
    },

    async disconnect(): Promise<void> {
      await room.disconnect();
      setState({ status: 'idle' });
    },

    subscribe(listener: CallListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getState(): CallState {
      return state;
    },

    getRoom(): Room {
      return room;
    },
  };
}
```

- [ ] **Step 4: Implémenter le contrôle média**

`src/call/media.ts` :

```ts
import type { Room } from 'livekit-client';

export type AudioOutput = 'earpiece' | 'speaker';

export async function setMicrophoneEnabled(room: Room, enabled: boolean): Promise<void> {
  await room.localParticipant.setMicrophoneEnabled(enabled);
}

export async function setCameraEnabled(room: Room, enabled: boolean): Promise<void> {
  await room.localParticipant.setCameraEnabled(enabled);
}

export type FacingMode = 'user' | 'environment';

// Bascule réellement d'une face à l'autre et renvoie la face obtenue. Le SDK
// n'expose pas la face courante, c'est donc à l'appelant de la conserver.
export async function switchCamera(
  room: Room,
  current: FacingMode,
): Promise<FacingMode> {
  const next: FacingMode = current === 'user' ? 'environment' : 'user';
  const publication = room.localParticipant
    .getTrackPublications()
    .find((p) => p.kind === 'video');
  const track = publication?.track;
  if (track === undefined || track === null) return current;
  await track.restartTrack({ facingMode: next });
  return next;
}
```

- [ ] **Step 5: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- src/call/connection.spec.ts`
Expected: PASS — quatre tests

- [ ] **Step 6: Commit**

```bash
git add src/call
git commit -m "feat(call): Manage the LiveKit session lifecycle and media controls"
```

---

### Task 17: Écran de pré-jonction

**Files:**
- Create: `app/room/[slug]/prejoin.tsx`
- Test: `app/room/[slug]/prejoin.spec.tsx`

**Interfaces:**
- Consumes: `fetchRoomAccess` de `src/api/rooms` ; `getActiveAccount`
- Produces: route `/room/[slug]/prejoin`

- [ ] **Step 1: Écrire les tests qui échouent**

`app/room/[slug]/prejoin.spec.tsx` :

```tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as rooms from 'src/api/rooms';
import * as accounts from 'src/auth/accounts';
import PrejoinScreen from './prejoin';

const replaceMock = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: replaceMock }),
  useLocalSearchParams: () => ({ slug: 'reunion' }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
};

beforeEach(() => {
  jest.restoreAllMocks();
  replaceMock.mockReset();
  jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
});

describe('PrejoinScreen', () => {
  it('affiche le bouton de jonction quand l\'accès est accordé', async () => {
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
      ok: true,
      value: {
        room: { id: 'r-1', slug: 'reunion', name: 'Réunion', accessLevel: 'public' },
        livekitUrl: 'wss://livekit.linagora.com',
        token: 'lk',
      },
    });

    render(<PrejoinScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('join-call-btn')).toBeTruthy();
    });
  });

  it('redirige vers la salle d\'attente quand l\'API répond lobby', async () => {
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
      ok: false,
      error: { kind: 'lobby', participantId: '' },
    });

    render(<PrejoinScreen />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/room/reunion/lobby');
    });
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- app/room`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter l'écran**

`app/room/[slug]/prejoin.tsx` :

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Button, Switch, Text } from 'react-native-paper';

import { fetchRoomAccess } from 'src/api/rooms';
import { getActiveAccount } from 'src/auth/accounts';
import type { RoomAccess } from 'src/call/types';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, padding: tokens.spacing.md, gap: tokens.spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
});

export default function PrejoinScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [access, setAccess] = useState<RoomAccess | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  useEffect(() => {
    const account = getActiveAccount();
    if (account === null || slug === undefined) return;

    fetchRoomAccess(account, slug)
      .then((result) => {
        if (result.ok) {
          setAccess(result.value);
          return;
        }
        if (result.error.kind === 'lobby') router.replace(`/room/${slug}/lobby`);
      })
      .catch(() => setAccess(null));
  }, [slug, router]);

  const handleJoin = (): void => {
    router.replace(`/room/${slug}/call?camera=${cameraOn ? 1 : 0}&mic=${micOn ? 1 : 0}`);
  };

  if (access === null) return <ActivityIndicator testID="prejoin-loading" />;

  return (
    <View style={styles.root}>
      <Text variant="titleLarge">{access.room.name}</Text>
      <View style={styles.row}>
        <Text>{t('prejoin.cameraOff')}</Text>
        <Switch testID="camera-switch" value={cameraOn} onValueChange={setCameraOn} />
      </View>
      <View style={styles.row}>
        <Text>{t('call.muted')}</Text>
        <Switch testID="mic-switch" value={micOn} onValueChange={setMicOn} />
      </View>
      <Button mode="contained" testID="join-call-btn" onPress={handleJoin}>
        {t('prejoin.join')}
      </Button>
    </View>
  );
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- app/room`
Expected: PASS — deux tests

- [ ] **Step 5: Commit**

```bash
git add app/room
git commit -m "feat(call): Add the pre-join screen with device toggles"
```

---

### Task 18: Salle d'attente

**Files:**
- Create: `app/room/[slug]/lobby.tsx`
- Test: `app/room/[slug]/lobby.spec.tsx`

**Interfaces:**
- Consumes: `requestEntry` de `src/api/rooms`
- Produces: route `/room/[slug]/lobby`

L'état « aucun modérateur présent » est un cas nominal, pas une erreur. C'est le symptôme direct de l'exigence produit : si personne n'a le pouvoir d'ouvrir, l'écran le dit.

- [ ] **Step 1: Écrire le test qui échoue**

`app/room/[slug]/lobby.spec.tsx` :

```tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as rooms from 'src/api/rooms';
import * as accounts from 'src/auth/accounts';
import LobbyScreen from './lobby';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useLocalSearchParams: () => ({ slug: 'reunion' }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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
};

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
});

describe('LobbyScreen', () => {
  it('annonce l\'attente après une demande acceptée par le serveur', async () => {
    jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValue({ ok: true, value: { participantId: 'p-1' } });

    render(<LobbyScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('lobby-waiting')).toBeTruthy();
    });
  });

  it('signale explicitement l\'absence de modérateur', async () => {
    jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    render(<LobbyScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('lobby-no-moderator')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- app/room/[slug]/lobby.spec.tsx`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter l'écran**

`app/room/[slug]/lobby.tsx` :

```tsx
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text } from 'react-native-paper';

import { requestEntry } from 'src/api/rooms';
import { getActiveAccount } from 'src/auth/accounts';
import { tokens } from 'src/ui/tokens';

type LobbyState = 'requesting' | 'waiting' | 'no-moderator';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
});

export default function LobbyScreen(): React.ReactElement {
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [state, setState] = useState<LobbyState>('requesting');

  useEffect(() => {
    const account = getActiveAccount();
    if (account === null || slug === undefined) return;

    requestEntry(account, slug, account.displayName)
      .then((result) => setState(result.ok ? 'waiting' : 'no-moderator'))
      .catch(() => setState('no-moderator'));
  }, [slug]);

  if (state === 'requesting') return <ActivityIndicator testID="lobby-loading" />;

  if (state === 'no-moderator') {
    return (
      <View style={styles.root}>
        <Text testID="lobby-no-moderator" variant="titleMedium">
          {t('lobby.noModerator')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ActivityIndicator />
      <Text testID="lobby-waiting" variant="titleMedium">
        {t('lobby.waiting')}
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- app/room/[slug]/lobby.spec.tsx`
Expected: PASS — deux tests

- [ ] **Step 5: Commit**

```bash
git add app/room
git commit -m "feat(call): Add the lobby screen with a no-moderator state"
```

---

### Task 19: Écran de séance

**Files:**
- Create: `app/room/[slug]/call.tsx`
- Test: `app/room/[slug]/call.spec.tsx`

**Interfaces:**
- Consumes: `createCallSession` de `src/call/connection` ; `setMicrophoneEnabled`, `setCameraEnabled`, `switchCamera` de `src/call/media` ; `fetchRoomAccess`
- Produces: route `/room/[slug]/call`

Parti pris mobile : vue locuteur actif avec bande de vignettes, plutôt que la grille du web.

- [ ] **Step 1: Écrire le test qui échoue**

`app/room/[slug]/call.spec.tsx` :

```tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as rooms from 'src/api/rooms';
import * as accounts from 'src/auth/accounts';
import CallScreen from './call';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useLocalSearchParams: () => ({ slug: 'reunion', camera: '1', mic: '1' }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@livekit/react-native', () => ({
  VideoTrack: () => null,
  registerGlobals: jest.fn(),
}));
jest.mock('src/call/connection', () => ({
  createCallSession: () => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    subscribe: (listener: (s: { status: string }) => void) => {
      listener({ status: 'connected' });
      return () => undefined;
    },
    getState: () => ({ status: 'connected' }),
    getRoom: () => ({ localParticipant: {} }),
  }),
}));

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
};

beforeEach(() => {
  jest.restoreAllMocks();
  jest.spyOn(accounts, 'getActiveAccount').mockReturnValue(ACCOUNT as never);
  jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
    ok: true,
    value: {
      room: { id: 'r-1', slug: 'reunion', name: 'Réunion', accessLevel: 'public' },
      livekitUrl: 'wss://livekit.linagora.com',
      token: 'lk',
    },
  });
});

describe('CallScreen', () => {
  it('expose la barre de contrôle une fois connecté', async () => {
    render(<CallScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('mic-toggle')).toBeTruthy();
      expect(screen.getByTestId('camera-toggle')).toBeTruthy();
      expect(screen.getByTestId('switch-camera')).toBeTruthy();
      expect(screen.getByTestId('leave-btn')).toBeTruthy();
    });
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test -- app/room/[slug]/call.spec.tsx`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter l'écran**

`app/room/[slug]/call.tsx` :

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, IconButton } from 'react-native-paper';

import { fetchRoomAccess } from 'src/api/rooms';
import { getActiveAccount } from 'src/auth/accounts';
import { createCallSession } from 'src/call/connection';
import {
  setCameraEnabled,
  setMicrophoneEnabled,
  switchCamera,
  type FacingMode,
} from 'src/call/media';
import type { CallState } from 'src/call/types';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surfaceDark },
  stage: { flex: 1 },
  filmstrip: { height: 96, flexDirection: 'row', gap: tokens.spacing.xs },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.md,
  },
});

export default function CallScreen(): React.ReactElement {
  const { t } = useTranslation();
  const router = useRouter();
  const { slug, camera, mic } = useLocalSearchParams<{
    slug: string;
    camera?: string;
    mic?: string;
  }>();

  const session = useMemo(() => createCallSession(), []);
  const [state, setState] = useState<CallState>({ status: 'idle' });
  const [micOn, setMicOn] = useState(mic !== '0');
  const [cameraOn, setCameraOn] = useState(camera !== '0');
  const [facing, setFacing] = useState<FacingMode>('user');
  const started = useRef(false);

  useEffect(() => session.subscribe(setState), [session]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const account = getActiveAccount();
    if (account === null || slug === undefined) return;

    fetchRoomAccess(account, slug)
      .then(async (result) => {
        if (!result.ok) return;
        await session.connect(result.value);
        await setMicrophoneEnabled(session.getRoom(), micOn);
        await setCameraEnabled(session.getRoom(), cameraOn);
      })
      .catch(() => undefined);

    return () => {
      session.disconnect().catch(() => undefined);
    };
  }, [session, slug, micOn, cameraOn]);

  const handleToggleMic = async (): Promise<void> => {
    const next = !micOn;
    setMicOn(next);
    await setMicrophoneEnabled(session.getRoom(), next);
  };

  const handleToggleCamera = async (): Promise<void> => {
    const next = !cameraOn;
    setCameraOn(next);
    await setCameraEnabled(session.getRoom(), next);
  };

  const handleSwitchCamera = async (): Promise<void> => {
    setFacing(await switchCamera(session.getRoom(), facing));
  };

  const handleLeave = async (): Promise<void> => {
    await session.disconnect();
    router.replace('/home');
  };

  if (state.status === 'connecting' || state.status === 'idle') {
    return <ActivityIndicator testID="call-connecting" />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.stage} testID="active-speaker" />
      <View style={styles.filmstrip} testID="filmstrip" />
      <View style={styles.controls}>
        <IconButton
          testID="mic-toggle"
          icon={micOn ? 'microphone' : 'microphone-off'}
          onPress={handleToggleMic}
          accessibilityLabel={t('call.muted')}
        />
        <IconButton
          testID="camera-toggle"
          icon={cameraOn ? 'video' : 'video-off'}
          onPress={handleToggleCamera}
          accessibilityLabel={t('prejoin.cameraOff')}
        />
        <IconButton
          testID="switch-camera"
          icon="camera-flip"
          onPress={handleSwitchCamera}
        />
        <IconButton
          testID="leave-btn"
          icon="phone-hangup"
          iconColor={tokens.color.danger}
          onPress={handleLeave}
          accessibilityLabel={t('call.leave')}
        />
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test -- app/room/[slug]/call.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/room
git commit -m "feat(call): Add the in-call screen with active speaker and controls"
```

---

### Task 20: Liens profonds

**Files:**
- Modify: `app/_layout.tsx`
- Create: `src/navigation/deepLinks.ts`
- Test: `src/navigation/deepLinks.spec.ts`

**Interfaces:**
- Consumes: rien
- Produces: `parseMeetingLink(url: string): string | null`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/navigation/deepLinks.spec.ts` :

```ts
import { parseMeetingLink } from 'src/navigation/deepLinks';

const HOSTS = ['meet.linagora.com', 'visio.twake.app'] as const;

describe('parseMeetingLink', () => {
  it('extrait le slug d\'une URL https de meet', () => {
    expect(parseMeetingLink('https://meet.linagora.com/point-hebdo', HOSTS)).toBe('point-hebdo');
  });

  it('extrait le slug du schéma applicatif', () => {
    expect(parseMeetingLink('twakevisio://room/point-hebdo', HOSTS)).toBe('point-hebdo');
  });

  it('ignore la racine du site', () => {
    expect(parseMeetingLink('https://meet.linagora.com/', HOSTS)).toBe(null);
  });

  it('ignore les chemins réservés de l\'application web', () => {
    expect(parseMeetingLink('https://meet.linagora.com/api/v1.0/config/', HOSTS)).toBe(null);
  });

  it.each([
    'feedback',
    'mentions-legales',
    'accessibilite',
    'conditions-utilisation',
  ])('ignore la page « %s » de l\'application web', (segment) => {
    expect(parseMeetingLink(`https://meet.linagora.com/${segment}`, HOSTS)).toBe(null);
  });

  it.each(['favicon.ico', 'site.webmanifest', 'apple-touch-icon.png'])(
    'ignore le fichier statique « %s » servi à la racine',
    (file) => {
      expect(parseMeetingLink(`https://meet.linagora.com/${file}`, HOSTS)).toBe(null);
    },
  );

  it('reconnaît un identifiant de salon généré par meet', () => {
    expect(parseMeetingLink('https://meet.linagora.com/abc-defg-hij', HOSTS)).toBe('abc-defg-hij');
  });

  it('reconnaît un identifiant généré sans tirets', () => {
    expect(parseMeetingLink('https://meet.linagora.com/abcdefghij', HOSTS)).toBe('abcdefghij');
  });

  it('refuse un hôte étranger', () => {
    expect(parseMeetingLink('https://evil.example/point-hebdo', HOSTS)).toBe(null);
  });

  it('accepte la seconde instance connue', () => {
    expect(parseMeetingLink('https://visio.twake.app/point-hebdo', HOSTS)).toBe(
      'point-hebdo',
    );
  });

  it('refuse http en clair sur un hôte pourtant connu', () => {
    expect(parseMeetingLink('http://meet.linagora.com/point-hebdo', HOSTS)).toBe(null);
  });

  it.each(['mailto:point-hebdo', 'javascript:point-hebdo', 'file:///point-hebdo'])(
    'refuse le schéma « %s »',
    (link) => {
      expect(parseMeetingLink(link, HOSTS)).toBe(null);
    },
  );

  it('refuse un point encodé en pourcentage', () => {
    expect(parseMeetingLink('https://meet.linagora.com/favicon%2eico', HOSTS)).toBe(null);
  });

  it('ignore une URL malformée', () => {
    expect(parseMeetingLink('pas une url', HOSTS)).toBe(null);
  });
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test -- src/navigation/deepLinks.spec.ts`
Expected: FAIL — module introuvable

- [ ] **Step 3: Implémenter l'analyse des liens**

`src/navigation/deepLinks.ts` :

```ts
import { APP_SCHEME } from 'src/constants';

// Chemins à segment unique servis par l'application web de meet, qui ne
// désignent jamais un salon. Relevés dans src/frontend/src/routes.ts en amont.
const RESERVED_SEGMENTS = new Set([
  'api',
  'admin',
  'static',
  'media',
  'callback',
  'sdk',
  'feedback',
  'mentions-legales',
  'accessibilite',
  'conditions-utilisation',
]);

// Identifiant de salon généré par meet : trois groupes alphanumériques 3-4-3,
// tirets optionnels. Reprend flexibleRoomIdPattern de l'amont.
const GENERATED_ROOM_ID = /^[a-zA-Z0-9]{3}-?[a-zA-Z0-9]{4}-?[a-zA-Z0-9]{3}$/;

// Un slug de salon vient de slugify() côté serveur, un identifiant généré du
// motif 3-4-3 : les deux tiennent dans cet alphabet. Le vérifier d'abord tue
// d'un coup les points (favicon.ico), le percent-encoding (favicon%2eico) et
// tout ce à quoi on n'a pas pensé — là où une liste de cas interdits laisse
// toujours passer celui qu'on n'a pas anticipé.
const SLUG_CHARSET = /^[a-zA-Z0-9-]+$/;

function isRoomSegment(segment: string): boolean {
  if (!SLUG_CHARSET.test(segment)) return false;
  if (GENERATED_ROOM_ID.test(segment)) return true;
  return !RESERVED_SEGMENTS.has(segment);
}

// allowedHosts est obligatoire et sans valeur par défaut : un lien de réunion
// n'a de sens que rapporté à une instance connue. Sans ce contrôle, n'importe
// quel site — ou un mailto: — fait ouvrir un salon dans l'application, et
// l'utilisateur ne peut rien y faire sans désinstaller.
export function parseMeetingLink(
  url: string,
  allowedHosts: readonly string[],
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol === `${APP_SCHEME}:`) {
    // twakevisio://room/<slug> — l'hôte porte « room ».
    if (parsed.host !== 'room') return null;
    const candidate = parsed.pathname.split('/').filter((s) => s.length > 0)[0];
    if (candidate === undefined) return null;
    return isRoomSegment(candidate) ? candidate : null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (!allowedHosts.includes(parsed.host.toLowerCase())) return null;

  const segments = parsed.pathname.split('/').filter((s) => s.length > 0);
  const first = segments[0];
  if (first === undefined || segments.length !== 1) return null;
  return isRoomSegment(first) ? first : null;
}
```

- [ ] **Step 4: Brancher l'écoute des liens dans la mise en page racine**

Modifier `app/_layout.tsx` — ajouter à l'intérieur de `RootLayout`, après le `useEffect` d'i18n :

```tsx
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';

import { listKnownHosts } from 'src/instance/knownInstances';
import { parseMeetingLink } from 'src/navigation/deepLinks';
```

```tsx
  const router = useRouter();

  useEffect(() => {
    // Les hôtes autorisés viennent de la table d'instances connues, augmentée
    // de l'instance du compte actif pour le cas on-prem.
    const allowedHosts = listKnownHosts();

    const openSlug = (url: string): void => {
      const slug = parseMeetingLink(url, allowedHosts);
      if (slug !== null) router.push(`/room/${slug}/prejoin`);
    };

    Linking.getInitialURL()
      .then((url) => {
        if (url !== null) openSlug(url);
      })
      .catch(() => undefined);

    const subscription = Linking.addEventListener('url', ({ url }) => openSlug(url));
    return () => subscription.remove();
  }, [router]);
```

- [ ] **Step 5: Déclarer les liens universels Android**

Dans `app.json`, sous `expo.android`, ajouter :

```json
"intentFilters": [
  {
    "action": "VIEW",
    "autoVerify": true,
    "data": [{ "scheme": "https", "host": "meet.linagora.com" }],
    "category": ["BROWSABLE", "DEFAULT"]
  }
]
```

- [ ] **Step 6: Lancer les tests pour vérifier qu'ils passent**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS sur les trois

- [ ] **Step 7: Commit**

```bash
git add src/navigation app/_layout.tsx app.json
git commit -m "feat(navigation): Open meeting links from the browser and app scheme"
```

---

### Task 21: Documenter les écarts dans AGENTS.md

**Files:**
- Create: `AGENTS.md`, `CLAUDE.md`, `README.md`

**Interfaces:**
- Consumes: rien
- Produces: la documentation qui fait autorité localement

Les trois écarts vis-à-vis des guidelines centrales doivent être écrits là où un agent les lira, faute de quoi ils seront « corrigés » par erreur au prochain passage.

- [ ] **Step 1: Écrire AGENTS.md**

```markdown
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

## Tests

`*.spec.ts` / `*.spec.tsx`, colocated. No snapshots. Bar: `npm test`,
`npm run typecheck`, `npm run lint` green.
```

- [ ] **Step 2: Écrire CLAUDE.md**

```markdown
@AGENTS.md

Also install the shared Twake guidelines plugin so the generic conventions
auto-trigger per context (do not paste the central rules by hand):

    /plugin install twake-guidelines@twake-guidelines
```

- [ ] **Step 3: Écrire README.md**

```markdown
# Twake Visio

Application mobile de visioconférence pour les instances
[`suitenumerique/meet`](https://github.com/suitenumerique/meet), adossée au SDK
officiel LiveKit.

## Prérequis

Node 20, et une compilation de développement — **Expo Go ne fonctionne pas**, LiveKit
exige du code natif.

## Démarrer

    npm ci
    npm run android      # ou npm run ios

## Vérifications

    npm test
    npm run typecheck
    npm run lint

## Conception

- Spécification : `docs/superpowers/specs/2026-07-29-twake-visio-socle-design.md`
- Plan : `docs/superpowers/plans/2026-07-29-twake-visio-socle.md`
- Règles pour les agents : `AGENTS.md`
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md CLAUDE.md README.md
git commit -m "docs: Document repo rules and deviations from the central guidelines"
```

---

## Prérequis hors dépôt

Ces deux actions bloquent la mise en service et ne relèvent d'aucune tâche ci-dessus.

**Enregistrer `twake-visio` en client public sur `sso.linagora.com`.** Le SSO est
LemonLDAP::NG, et le client web existant `livekit-meet` est un client **confidentiel**
(il porte un `ClientSecret`) dont les redirections sont toutes en `https://`. Le client
mobile est donc un enregistrement **nouveau et distinct**, jamais une extension de
l'existant : ajouter `twakevisio://callback` aux redirections de `livekit-meet`
transformerait un client confidentiel en cible de redirection locale, ce qui est
exactement le scénario d'interception que PKCE existe pour empêcher.

L'inquiétude sur `token_endpoint_auth_methods_supported`, qui n'annonce pas `none`, est
levée : LemonLDAP::NG sait déclarer un client public, sa métadonnée de découverte ne
l'annonce simplement pas. Réglages attendus sur le nouveau RP — **noms d'options à
confirmer contre votre version de LemonLDAP** :

| Réglage | Valeur |
|---|---|
| `oidcRPMetaDataOptionsClientID` | `twake-visio` |
| `oidcRPMetaDataOptionsClientSecret` | **vide** — un client public n'en porte pas |
| `oidcRPMetaDataOptionsPublic` | activé |
| `oidcRPMetaDataOptionsRequirePKCE` | activé |
| `oidcRPMetaDataOptionsRedirectUris` | `twakevisio://callback` |
| `oidcRPMetaDataOptionsAllowOffline` | activé — sans quoi aucun `refresh_token` n'est émis |

Sans `AllowOffline`, la Task 9 passe ses tests unitaires et l'application déconnecte
l'utilisateur à chaque expiration d'`access_token`.

**Activer `lasuite.oidc_resource_server` sur `meet.linagora.com`** — ajouter
`ResourceServerAuthentication` aux `DEFAULT_AUTHENTICATION_CLASSES` et configurer
l'introspection contre `https://sso.linagora.com/oauth2/introspect`. Sans ça, toutes les
tâches à partir de la Task 10 passent leurs tests unitaires mais échouent contre
l'instance réelle. Vecteur recommandé : contribution en amont chez `suitenumerique/meet`.

**Contribution `config.oidc`** (souhaitable, non bloquante) — ajouter
`oidc: { issuer, mobile_client_id }` à `/api/v1.0/config/`. Le repli de la Task 5 couvre
l'intervalle.

**Vérifier `ALLOW_UNSECURE_USER_LISTING` sur `meet.linagora.com`** — la recherche de
co-organisateurs de la Task 15 s'appuie sur `GET /api/v1.0/users/?q=`, dont le backend
renvoie `User.objects.none()` quand ce réglage est désactivé. Le client reçoit alors une
liste vide, **indistinguable d'une absence de résultat**. Si le réglage est désactivé,
la désignation de co-organisateurs à la création devra passer par une saisie d'email
résolue côté serveur, ce qui suppose une évolution de l'API amont. À trancher avant
d'attaquer la Task 15.
