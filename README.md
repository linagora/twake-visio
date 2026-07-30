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
    npx expo start --localhost

`expo run:android` lance toujours l'application sur l'adresse IP du réseau local, donc
sur un téléphone en 4G ou 5G il faut relancer ensuite avec `--localhost` ; sans quoi le
client de développement affiche « There was a problem loading the project ».

La recompilation native n'est nécessaire qu'après un changement de code natif ou de
dépendance.

## Vérifications

    npm test
    npm run typecheck
    npm run lint

## Prérequis hors dépôt, bloquants pour la mise en service

**Enregistrer `twake-visio` comme client public sur `sso.linagora.com`**, avec PKCE et la
redirection `twakevisio://callback`. Sans cela la connexion échoue **après**
l'authentification, sur « Cette application n'est pas reconnue » : LemonLDAP ne valide le
client qu'à ce moment-là.

Point de vigilance mesuré le 2026-07-30 sur
`https://sso.linagora.com/.well-known/openid-configuration` :

    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"]
    code_challenge_methods_supported:      ["plain", "S256"]

PKCE est supporté et **`none` est absent** de la liste — or c'est ainsi qu'un client
public s'authentifie. Ce sont bien les **métadonnées qui sont périmées**, pas la
capacité : un échange de jeton en client public, avec PKCE et sans `client_secret`,
aboutit sur ce SSO. Vérifié le 2026-07-30 avec l'outil de LemonLDAP lui-même :

    llng --choice 1_LDAP --llng-server sso.linagora.com --pkce \
         --client-id livekit-meet --redirect-uri "https://meet.linagora.com" oidc_tokens

rend `access_token`, `id_token` et `refresh_token`. Ne pas conclure de l'absence de
`none` que l'enregistrement d'un client public est impossible.

Le client de l'application web de l'instance est `livekit-meet`, lisible dans la
redirection de `/api/v1.0/authenticate/`. Reste à établir si une redirection en schéma
natif y est acceptée : la même commande avec `--redirect-uri "twakevisio://callback"`
répond à la question.

**Activer `lasuite.oidc_resource_server` sur le déploiement `meet.linagora.com`**, en
ajoutant `ResourceServerAuthentication` aux classes d'authentification et en configurant
l'introspection contre `https://sso.linagora.com/oauth2/introspect`.

## Conception

- Règles pour les agents et écarts assumés : `AGENTS.md`

La spécification et le plan d'implémentation vivent sous `docs/superpowers/`, qui n'est
pas versionné.
