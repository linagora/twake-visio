# Publication signée — TestFlight (iOS) et Firebase/Play (Android)

Reprise de la chaîne de `twake-drive-mobile`, adaptée à ce dépôt. Deux
différences structurelles, et il faut les avoir en tête avant de lire le reste :

|                      | twake-drive-mobile                     | ici                                               |
| -------------------- | -------------------------------------- | ------------------------------------------------- |
| `android/` et `ios/` | **versionnés**                         | **ignorés**, régénérés par `expo prebuild`        |
| signature Android    | écrite dans `android/app/build.gradle` | **plugin** `plugins/withAndroidReleaseSigning.js` |
| `Fastfile`           | deux, dans `ios/` et `android/`        | **un seul**, à la racine                          |

La raison est la même pour les trois lignes : ce que `prebuild` régénère ne peut
rien garder. Un `Fastfile` posé dans `ios/` disparaît à la première
régénération, et la CI échoue alors sur un fichier manquant que personne n'a
supprimé.

> **Ce document est versionné, et c'est délibéré.** Chez Drive, l'équivalent a
> été désuivi par deux commits successifs alors que cinq fichiers le citent : il
> a fallu le ressortir de l'historique git pour écrire celui-ci. Un document
> qu'aucune branche ne porte ne suit pas les worktrees, ne survit pas à un clone,
> et disparaît sans bruit à la première fusion qui le supprime.

---

## Les deux workflows

| workflow                                | déclencheur                | ce qu'il fait                                                                                                                                           |
| --------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/release-ios.yml`     | tag `vX.Y.Z`, ou à la main | `prebuild` → `pod install` → `fastlane ios distribute` : `match` → `gym` → `pilot` (TestFlight)                                                         |
| `.github/workflows/release-android.yml` | tag `vX.Y.Z`, ou à la main | `prebuild` → décodage du keystore → `fastlane android distribute` : APK signé → Firebase. AAB → Play interne en option. APK attaché à la Release GitHub |

Un troisième, `provision-ios.yml`, ne se lance **qu'à la main** : il crée les
profils `match` manquants, en écriture. Les lanes de publication, elles, sont en
`readonly` — la CI ne fabrique jamais de certificat.

**Numérotation** : version marketing = le tag (`v0.8.0` → `0.8.0`), numéro de
build = le `run_number` de la CI, qui est monotone. Un `versionCode` figé serait
refusé par Play au deuxième envoi.

---

## Mise en place, une fois

### 1. Portail Apple (équipe `KUT463DS29`)

1. **App ID** `com.linagora.twakevisio`, explicite.
2. **App Store Connect** : créer la fiche pour ce même identifiant.
3. Un groupe TestFlight n'est **pas** nécessaire pour commencer : la lane envoie
   en interne, ce qui est immédiat et ne demande aucune revue Beta.

> L'ancien dépôt `visio-mobile` publiait `io.visio.mobile`. Ce n'est **pas** la
> même application : les fiches, les profils et les clés sont à créer.

### 2. Semer `match`

Depuis une machine ayant accès au dépôt `match`, ou par le workflow
`provision-ios.yml` une fois les secrets posés :

```bash
MATCH_PASSWORD=… bundle exec fastlane ios provision
```

Seuls les profils manquants sont créés ; le certificat de distribution de
l'équipe est réutilisé — c'est le même que Drive.

### 3. Générer le keystore Android

**Un keystore par application. Ne réutilisez ni celui de Drive ni celui de
l'ancien visio-mobile.**

```bash
keytool -genkeypair -v -keystore twake-visio-release.keystore \
  -alias twakevisio -keyalg RSA -keysize 2048 -validity 10000
```

Rangez-le, avec ses mots de passe, dans un gestionnaire de secrets. **Le perdre
interdit définitivement toute mise à jour sur Google Play** — aucun recours,
aucune procédure de récupération.

### 4. Firebase et Google Play

- Enregistrer l'application Android `com.linagora.twakevisio` dans Firebase, et
  relever son **App ID** (`FIREBASE_APP_ID`).
- Le compte de service GCP doit avoir _Firebase App Distribution Admin_, et
  l'accès Play Console pour les envois AAB. Le même que Drive si le projet est
  partagé.
- Play seulement : créer la fiche, et **déposer le premier AAB à la main**. Play
  l'exige ; `supply` prend la suite ensuite.

---

## Poser les secrets

Les secrets GitHub sont en écriture seule : on les pose depuis sa machine.

```bash
cp .release-secrets.env.example .release-secrets.env   # ignoré par git
$EDITOR .release-secrets.env
scripts/setup-release-secrets.sh
gh secret list --repo linagora/twake-visio
```

| secret                                                                   | portée             | source                                         |
| ------------------------------------------------------------------------ | ------------------ | ---------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`                                                | **propre à Visio** | le keystore de l'étape 3, encodé par le script |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | **propre**         | étape 3                                        |
| `FIREBASE_APP_ID`                                                        | **propre**         | console Firebase, étape 4                      |
| `FIREBASE_SERVICE_ACCOUNT_BASE64`                                        | partagé avec Drive | le JSON du compte de service                   |
| `APPLE_TEAM_ID`                                                          | partagé            | `KUT463DS29`                                   |
| `APP_STORE_CONNECT_API_KEY_ID`, `_ISSUER_ID`, `_API_KEY_CONTENT`         | partagé            | clé API App Store Connect                      |
| `MATCH_GIT_URL`, `MATCH_PASSWORD`, `MATCH_DEPLOY_KEY`                    | partagé            | le dépôt `match`                               |

---

## Publier

```bash
git checkout main && git pull
scripts/release.sh 0.8.1
```

Le script monte la version dans `package.json` **et** `app.json`, commite, pose
le tag et propose de pousser. Pousser le tag déclenche les deux workflows.

Le bump d'`app.json` n'est pas cosmétique : l'écran Réglages lit sa version par
`expo-constants`, donc un tag posé sans lui afficherait l'ancien numéro dans une
application par ailleurs à jour.

```bash
gh run list --repo linagora/twake-visio
```

Pour un build hors tag, utilisez « Run workflow » sur `release-ios.yml` ou
`release-android.yml`, avec les notes et les bascules d'envoi.

---

## Pièges relevés, et ce qu'ils coûtent

- **JDK 21, ni 17 ni 24.** Le 24 casse la configuration CMake d'AGP sur ce
  projet — mesuré le 2026-08-03, `configureCMakeDebug` échoue sur « a restricted
  method in java.lang.System has been called ». Le 17 ne couvre pas Expo 57.
- **Le keystore est passé en chemin ABSOLU.** Les lanes utilisent
  `project_dir: "android"`, donc Gradle tourne dans ce sous-dossier : un chemin
  relatif s'y résoudrait deux fois.
- **`legacy-peer-deps=true`** est dans `.npmrc` pour une raison bornée, et son
  effet ne l'est pas : npm n'installe **aucune** dépendance de pair. Quand la CI
  échoue sur un module « introuvable » sans rapport avec le changement, c'est la
  première piste — la procédure de balayage est dans `AGENTS.md`.
- **Versionnement iOS.** `agvtool` exige le projet en « Apple Generic », qui est
  le défaut d'Expo. Si un build répond « No values were found for versioning »,
  c'est ce réglage qu'il faut vérifier.
- **TestFlight externe** demande que le premier build passe la revue Beta.
  D'où l'envoi interne par défaut ; `distribute_external` se rajoute après.
- **`ruby/setup-ruby@v1` n'est pas épinglé**, comme chez Drive. Si le scan de
  configuration le signale, épinglez-le sur un SHA.

---

## Ce qui n'est pas fait

- Aucune de ces chaînes n'a **jamais tourné** sur ce dépôt. Elles sont
  transposées d'un dépôt où elles fonctionnent, et adaptées à une arborescence
  native régénérée — c'est précisément la partie qui n'a pas d'équivalent chez
  Drive, donc celle qui demandera une première exécution attentive.
- Les métadonnées App Store et Play (descriptions, captures) ne sont pas
  reprises : elles décrivent Drive. La lane `deliver` n'est donc pas câblée ici.
