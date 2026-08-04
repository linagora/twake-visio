fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## Android

### android distribute

```sh
[bundle exec] fastlane android distribute
```

APK signé, distribué par Firebase App Distribution

### android release

```sh
[bundle exec] fastlane android release
```

AAB signé, envoyé sur la piste interne de Google Play

---

## iOS

### ios provision

```sh
[bundle exec] fastlane ios provision
```

Crée les profils match manquants (mode écriture)

### ios distribute

```sh
[bundle exec] fastlane ios distribute
```

IPA signé, envoyé sur TestFlight

---

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
