# Twake Visio

Client mobile de visioconférence pour les instances
[`suitenumerique/meet`](https://github.com/suitenumerique/meet) — Android et iOS,
en React Native, adossé au SDK officiel [LiveKit](https://livekit.io).

[![ci](https://github.com/linagora/twake-visio/actions/workflows/ci.yml/badge.svg)](https://github.com/linagora/twake-visio/actions/workflows/ci.yml)
[![version](https://img.shields.io/github/v/release/linagora/twake-visio?include_prereleases&sort=semver)](https://github.com/linagora/twake-visio/releases)
[![licence AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-blue)](LICENSE)

L'application se connecte à une instance meet par OpenID Connect, rejoint ses
salons et y publie audio et vidéo. Elle ne contient aucune logique de serveur :
meet gère les salons et les droits, LiveKit transporte les flux.

## Ce que l'application fait

**Avant d'entrer** — un écran de pré-accueil où l'on choisit sa caméra, son
micro, sa **sortie audio** (écouteur, haut-parleur, casque Bluetooth) et son
**arrière-plan** avant que quiconque ne vous voie. Un salon fermé place dans une
salle d'attente jusqu'à ce qu'un organisateur admette.

**Pendant la réunion** — grille de participants, épinglage, affichage du
**partage d'écran** d'un autre participant, **chat**, **réactions**, **main
levée**, et un bandeau qui signale un enregistrement en cours. La barre de
commandes tient micro, caméra, réactions, main et le reste sur une seule ligne.

**Effets d'arrière-plan** — flou ou image, calculés **sur l'appareil** : MLKit
Selfie Segmentation sur Android, Vision (`VNGeneratePersonSegmentationRequest`)
sur iOS. Aucune image ne quitte le téléphone pour être segmentée.

**Modération** — admettre ou refuser à l'entrée, couper le micro d'un
participant, l'exclure, le passer administrateur.

**Autour** — création de salon avec le niveau d'accès expliqué en clair,
historique, prochaines réunions tirées de l'agenda, réglages (langue, caméra et
micro par défaut), session qui survit à la fermeture de l'application.

L'interface existe en **sept langues** : allemand, anglais, espagnol, français,
italien, russe, vietnamien.

## État

`v0.8.0` est la première version destinée aux magasins. Elle est distribuée en
test — TestFlight côté Apple, Firebase App Distribution côté Android — et n'est
**pas encore publiée** sur l'App Store ni sur Google Play.

## Démarrer

**Prérequis** — Node 20, et une **compilation de développement** : Expo Go ne
fonctionne pas, LiveKit exige du code natif. Pour Android, un **JDK 21** ; le 24
casse la configuration CMake d'AGP et le 17 ne couvre pas Expo 57. Pour iOS,
**Xcode 26.4 minimum** ; sous 26.3 une source d'Expo SDK 57 ne compile pas.

```bash
npm ci
npm run android      # ou npm run ios
```

Installez toujours avec `npx expo install`, jamais `npm install` : la version
doit correspondre au SDK Expo plutôt qu'être la dernière publiée.

Sur un téléphone qui n'est pas sur le même réseau que la machine de
développement, le client de développement ne joint pas Metro :

```bash
adb reverse tcp:8081 tcp:8081
npx expo start --localhost
```

`expo run:android` lance toujours l'application sur l'adresse IP du réseau
local ; sur un téléphone en 4G ou 5G il faut donc relancer avec `--localhost`,
sans quoi le client de développement affiche « There was a problem loading the
project ». La recompilation native n'est nécessaire qu'après un changement de
code natif ou de dépendance.

Le simulateur iOS ne peut publier ni caméra ni micro : tester iOS demande un
appareil.

## Vérifications

```bash
npm test        # 99 fichiers de spec, ~1500 tests
npm run typecheck
npm run lint
```

Les trois doivent être verts. `lefthook` les enchaîne avant chaque commit, et
`commitlint` vérifie le sujet.

## Architecture

| dossier    | rôle                                                                                    |
| ---------- | --------------------------------------------------------------------------------------- |
| `app/`     | routes expo-router, **une ligne chacune** — elles réexportent un écran de `src/screens` |
| `src/`     | tout le code : `api`, `auth`, `call`, `calendar`, `rooms`, `screens`, `ui`, `i18n`      |
| `modules/` | modules natifs Expo maison — segmentation, périphériques audio, service de premier plan |
| `plugins/` | plugins de configuration Expo, seule façon de modifier le natif ici                     |
| `docs/`    | spécifications, plans d'implémentation, runbooks                                        |

Deux choses expliquent l'essentiel de la structure :

**`android/` et `ios/` ne sont pas versionnés.** Ils sont régénérés par
`expo prebuild`, donc toute configuration native passe par un plugin — sans
quoi elle disparaît à la prochaine régénération.

**Les écrans vivent dans `src/screens`, pas dans `app/`.** expo-router tire
_tout_ `.tsx` sous `app/` dans le bundle ; un fichier de test qui y serait
colocalisé deviendrait une route et ferait échouer la compilation. Un fichier de
`app/` contient donc une ligne et aucune logique.

Le design system est **local** : `src/ui/tokens` est la source unique de style,
`react-native-paper` est thémé depuis ces mêmes valeurs. `twake-mui` et
`cozy-ui` sont des bibliothèques web et ne s'importent pas ici.

## Configuration hors dépôt

L'application est un **client OIDC public** — PKCE, jamais de `client_secret`,
redirection `twakevisio://callback`. Le client et sa redirection doivent être
déclarés côté SSO, et `lasuite.oidc_resource_server` activé côté meet : sans
cela la connexion échoue **après** l'authentification.

Le détail, avec les erreurs mesurées qui permettent de distinguer les deux
déclarations manquantes : [`docs/oidc-registration.md`](docs/oidc-registration.md).

## Publier

Poser un tag `vX.Y.Z` déclenche les deux chaînes signées :

```bash
scripts/release.sh 0.8.1
```

iOS part vers TestFlight, Android vers Firebase App Distribution, et l'APK comme
l'IPA sont attachés à la Release GitHub. Le runbook complet — secrets, keystore,
`match`, pièges relevés — est dans
[`docs/ci-cd-signed-release.md`](docs/ci-cd-signed-release.md).

## Contribuer

Les contributions sont bienvenues. Avant d'ouvrir une pull request :

1. Lisez [`AGENTS.md`](AGENTS.md). Ce fichier est la **source de vérité** des
   conventions de ce dépôt, et il consigne les erreurs déjà payées — plusieurs
   sont invisibles à la relecture et ne se voient qu'à l'exécution.
2. Gardez `npm test`, `npm run typecheck` et `npm run lint` verts.
3. Aucune chaîne visible par une personne utilisatrice en dur : les **sept**
   locales sont remplies avant la fusion, et `src/i18n/index.spec.ts` échoue si
   une clé manque quelque part.
4. Sujets de commit en
   [Conventional Commits](https://www.conventionalcommits.org), à l'impératif.
   `commitlint` les vérifie.

Les tests sont colocalisés en `*.spec.ts(x)`, sans instantanés.

## Licence

[GNU Affero General Public License v3.0](LICENSE) — AGPL-3.0-only.

L'amont, [`suitenumerique/meet`](https://github.com/suitenumerique/meet), est
sous licence MIT ; ce client mobile est un travail distinct, sous AGPL.

## Liens

- [`suitenumerique/meet`](https://github.com/suitenumerique/meet) — le serveur
- [LiveKit](https://livekit.io) — le transport temps réel
- [Expo](https://expo.dev) — SDK 57, React Native 0.86
