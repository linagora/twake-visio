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
