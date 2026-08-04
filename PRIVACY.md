# Règles de confidentialité de Twake Visio

**Dernière mise à jour : 4 août 2026.** Version de l'application concernée :
0.8.0 et suivantes.

Twake Visio est une application de visioconférence éditée par **LinAgora**. Elle
est **cliente** : elle ne possède aucun serveur propre. Vous la connectez à une
instance de votre choix, et c'est cette instance qui héberge vos salons, vos
comptes et vos réunions.

Ce document dit ce que l'application fait de vos données. Il est vérifiable :
[le code est public](https://github.com/linagora/twake-visio), sous licence
AGPL-3.0.

## En une phrase

**L'application ne collecte rien pour son éditeur.** Elle ne contient aucun
mouchard, aucun outil de mesure d'audience, aucun rapport de plantage, aucune
publicité. Ce qu'elle transmet va uniquement au serveur auquel vous vous
connectez.

## Ce qui reste sur votre appareil

Ces informations ne quittent jamais le téléphone. Elles disparaissent quand vous
désinstallez l'application.

| donnée                                                                                       | où                                                            |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| jetons de connexion                                                                          | trousseau du système : Keychain sur iOS, Keystore sur Android |
| votre adresse e-mail, votre nom affiché et l'adresse de votre instance                       | stockage privé de l'application                               |
| historique de vos réunions : identifiant du salon, titre, heure d'arrivée et de fin, 200 max | stockage privé de l'application                               |
| préférences : langue, micro et caméra coupés à l'entrée, niveau d'accès par défaut           | stockage privé de l'application                               |
| l'image d'arrière-plan que vous choisissez                                                   | fournie avec l'application, jamais téléversée                 |

**Le calcul de l'arrière-plan flouté est entièrement local.** La segmentation
utilise MLKit sur Android et le cadre Vision d'Apple sur iOS. **Aucune image de
votre caméra n'est envoyée à qui que ce soit pour être analysée**, ni à
LinAgora, ni à Google, ni à Apple.

Se déconnecter efface les jetons et le compte. L'historique et les préférences
s'effacent en désinstallant l'application, ou depuis les réglages du système.

## Ce qui part sur le réseau, et vers qui

L'application ne parle qu'à trois interlocuteurs, **tous déterminés par
l'instance que vous choisissez**.

**Votre fournisseur d'identité**, pour vous connecter. L'application utilise
OpenID Connect avec PKCE. Elle n'affiche jamais de formulaire de mot de passe :
c'est le navigateur du système qui ouvre la page de votre organisation, et
l'application ne voit jamais votre mot de passe.

**Le serveur meet de votre instance**, pour créer et rejoindre des salons, lire
la liste des participants, modérer, et récupérer vos prochaines réunions si
votre organisation a relié un agenda.

**Le serveur temps réel LiveKit de votre instance**, pour le son, l'image, le
partage d'écran, le clavardage, les réactions et la main levée pendant une
réunion. Ces flux sont chiffrés en transit par DTLS-SRTP.

Le contenu de vos réunions est donc traité par **l'organisation qui exploite
l'instance**, selon ses propres règles. Si vous utilisez `meet.linagora.com`,
c'est LinAgora ; si votre employeur héberge la sienne, c'est lui. En cas de
doute, demandez à votre administrateur quelle instance vous utilisez.

## Autorisations demandées, et pourquoi

| autorisation                            | usage                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| Caméra                                  | publier votre vidéo, et calculer l'arrière-plan sur l'appareil                              |
| Micro                                   | publier votre voix                                                                          |
| Bluetooth                               | détecter un casque et y router le son                                                       |
| Réglages audio                          | basculer entre écouteur, haut-parleur et casque                                             |
| Service de premier plan (caméra, micro) | garder la capture vivante quand vous quittez l'application pendant une réunion, sur Android |
| Notifications                           | vous signaler une réunion en cours                                                          |

Aucune de ces autorisations ne sert à autre chose. L'application n'accède ni à
vos contacts, ni à vos photos, ni à votre position.

## Enfants

L'application n'est pas destinée aux enfants de moins de 13 ans et ne leur est
pas adressée. Elle ne collecte sciemment aucune donnée les concernant.

## Vos droits

Les données de vos réunions étant détenues par l'exploitant de votre instance,
c'est à lui que s'adressent les demandes d'accès, de rectification, d'effacement
et de portabilité. Pour une instance exploitée par LinAgora, écrivez à
**info@linagora.com**.

Les données locales décrites plus haut vous appartiennent et sont sous votre
seul contrôle : désinstaller l'application les supprime.

## Modifications

Toute modification de ce document est publiée dans ce dépôt et visible dans son
historique git, avec sa date et sa raison. Un changement substantiel sera
signalé dans les notes de version.

## Contact

**info@linagora.com**. LinAgora, 100 Terrasse Boieldieu, 92800 Puteaux, France.

Pour signaler une faille de sécurité, suivez plutôt
[SECURITY.md](SECURITY.md).

---

# Twake Visio Privacy Policy

**Last updated: 4 August 2026.** Applies to version 0.8.0 and later.

Twake Visio is a video conferencing app published by **LinAgora**. It is a
**client**: it runs no server of its own. You connect it to an instance of your
choosing, and that instance hosts your rooms, accounts and meetings.

This document states what the app does with your data. It is verifiable: the
[source code is public](https://github.com/linagora/twake-visio) under AGPL-3.0.

## In one sentence

**The app collects nothing for its publisher.** It contains no tracker, no
analytics, no crash reporting, no advertising. What it transmits goes only to
the server you connect to.

## What stays on your device

This never leaves the phone, and is removed when you uninstall the app.

| data                                                                      | where                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------- |
| sign-in tokens                                                            | system keystore: Keychain on iOS, Keystore on Android |
| your e-mail address, display name and instance address                    | app-private storage                                   |
| meeting history: room identifier, title, join and end time, capped at 200 | app-private storage                                   |
| preferences: language, mic and camera off on join, default access level   | app-private storage                                   |
| the background image you pick                                             | shipped with the app, never uploaded                  |

**Background blur is computed entirely on the device**, with MLKit on Android
and Apple's Vision framework on iOS. **No camera frame is sent anywhere to be
analysed**, not to LinAgora, not to Google, not to Apple.

Signing out erases the tokens and the account. History and preferences are
removed by uninstalling the app or clearing its data in system settings.

## What goes over the network, and to whom

The app talks to three parties only, **all determined by the instance you
choose**.

**Your identity provider**, to sign you in, using OpenID Connect with PKCE. The
app never shows a password form: the system browser opens your organisation's
page, and the app never sees your password.

**Your instance's meet server**, to create and join rooms, list participants,
moderate, and fetch your upcoming meetings if your organisation has connected a
calendar.

**Your instance's LiveKit real-time server**, for audio, video, screen sharing,
chat, reactions and raised hands during a meeting. These streams are encrypted
in transit with DTLS-SRTP.

Your meeting content is therefore processed by **the organisation running the
instance**, under its own policy. On `meet.linagora.com` that is LinAgora; on a
self-hosted instance it is whoever runs it. If unsure, ask your administrator
which instance you use.

## Permissions, and why

| permission                              | purpose                                                                |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Camera                                  | publish your video, and compute the background on the device           |
| Microphone                              | publish your voice                                                     |
| Bluetooth                               | detect a headset and route audio to it                                 |
| Audio settings                          | switch between earpiece, speaker and headset                           |
| Foreground service (camera, microphone) | keep capture alive when you leave the app during a meeting, on Android |
| Notifications                           | tell you a meeting is in progress                                      |

None of these serve any other purpose. The app does not access your contacts,
your photos or your location.

## Children

The app is not directed to children under 13 and knowingly collects no data
about them.

## Your rights

Because your meeting data is held by whoever runs your instance, requests for
access, correction, erasure and portability go to them. For an instance run by
LinAgora, write to **info@linagora.com**.

The local data described above is yours alone: uninstalling the app deletes it.

## Changes

Any change to this document is published in this repository and visible in its
git history, with its date and reason. A substantial change will be called out
in the release notes.

## Contact

**info@linagora.com**. LinAgora, 100 Terrasse Boieldieu, 92800 Puteaux, France.

To report a security vulnerability, follow [SECURITY.md](SECURITY.md) instead.
