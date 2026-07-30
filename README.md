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

Gradle veut un JDK 21 ; un JDK 24 échoue. Sur un téléphone qui n'est pas sur le même
réseau que la machine de développement, le client de développement ne joint pas Metro :

    adb reverse tcp:8081 tcp:8081

Ensuite `npm start` suffit, la recompilation native n'est nécessaire qu'après un
changement de code natif ou de dépendance.

## Vérifications

    npm test
    npm run typecheck
    npm run lint

## Conception

- Règles pour les agents et écarts assumés : `AGENTS.md`

La spécification et le plan d'implémentation vivent sous `docs/superpowers/`, qui n'est
pas versionné.
