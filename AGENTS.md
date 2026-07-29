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
