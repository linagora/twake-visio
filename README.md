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

- Règles pour les agents et écarts assumés : `AGENTS.md`

La spécification et le plan d'implémentation vivent sous `docs/superpowers/`, qui n'est
pas versionné.
