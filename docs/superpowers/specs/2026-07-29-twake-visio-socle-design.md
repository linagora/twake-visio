# Twake Visio — Conception du socle

**Date :** 2026-07-29
**Statut :** validé
**Périmètre :** sous-projet 1 sur 5 — socle, authentification, rejoindre un appel

## 1. Objectif

Twake Visio est une application mobile React Native, Android d'abord puis iOS, qui
permet de participer aux visioconférences hébergées sur une instance de
[`suitenumerique/meet`](https://github.com/suitenumerique/meet) — en premier lieu
`meet.linagora.com`, adossée à l'infrastructure Twake de Linagora. Elle s'appuie sur
le SDK officiel [`@livekit/react-native`](https://github.com/livekit/client-sdk-react-native).

L'ambition à terme est la parité fonctionnelle avec le client web de `meet`, en tirant
parti de ce que la plateforme mobile apporte en propre : intégration à la couche
téléphonie du système, audio en arrière-plan, incrustation vidéo, notifications.

## 2. Découpage

La parité complète représente dix-neuf domaines fonctionnels côté web, auxquels
s'ajoutent les sujets purement mobiles. C'est trop pour une seule spécification. Le
travail est découpé en cinq sous-projets, chacun avec son cycle spec → plan →
implémentation.

| # | Sous-projet | Contenu |
|---|---|---|
| 1 | **Socle** | scaffold, authentification, découverte d'instance, rejoindre et créer un salon, séance de base |
| 2 | Collaboration | chat, liste des participants, main levée, réactions, rôles, modération |
| 3 | Intégration native | CallKit / ConnectionService, audio en arrière-plan, incrustation, notifications push |
| 4 | Avancé | partage d'écran, enregistrement, sous-titres, fichiers |
| 5 | Durcissement | chiffrement de bout en bout, télémétrie, accessibilité |

Ce document ne couvre que le sous-projet 1.

### Dans le périmètre

Écran de bienvenue à trois entrées · authentification OIDC multi-comptes ·
découverte d'instance · accueil listant mes réunions · création de salon avec niveau
d'accès et co-propriétaires · rejoindre par lien ou par code · écran de pré-jonction
avec aperçu caméra · salle d'attente · en séance : vue locuteur actif, micro, caméra,
bascule avant/arrière, sortie audio, quitter · liens profonds · internationalisation ·
intégration continue.

### Hors périmètre

Tout ce qui relève des sous-projets 2 à 5.

## 3. Architecture

```
instance/   découverte et configuration d'instance   → ne dépend de rien
  discovery.ts       fetchInstanceConfig(serverUrl): Promise<InstanceResult>
  knownInstances.ts  table embarquée servant le repli du chemin B

auth/       OIDC PKCE, jetons, multi-comptes         → dépend de instance/
  oidc.ts        autorisation via navigateur système, échange du code
  session.ts     stockage, rafraîchissement, révocation
  accounts.ts    plusieurs comptes, un par instance

api/        client REST meet                         → dépend de auth/ + instance/
  client.ts      injection du Bearer, rafraîchissement en vol unique
  rooms.ts       fetchRoom, createRoom, fetchMyRooms, requestEntry
  users.ts       fetchMe

call/       session LiveKit                          → dépend de api/ uniquement
  connection.ts  connect, reconnexion, cycle de vie
  media.ts       micro, caméra, sortie audio

ui/         composants React Native maison           → tokens partagés
i18n/       locales
app/        routes expo-router
```

La frontière déterminante : **`call/` ignore tout d'OIDC et des instances**. Il reçoit
une URL et un jeton LiveKit et pilote la session. Il se teste donc contre un serveur
LiveKit de développement avec un jeton fabriqué, sans SSO ni backend meet. Cette
séparation permet de mener en parallèle le chantier authentification et le chantier
séance.

Symétriquement, `instance/` ne connaît pas l'authentification, ce qui rend la
découverte testable contre des fixtures.

## 4. Chaîne d'authentification

```
app (client public, PKCE S256)
  → navigateur système → sso.linagora.com/oauth2/authorize?client_id=twake-visio…
  → lien profond twakevisio://callback?code=…
  → POST /oauth2/token  (code_verifier, sans secret)
  → access_token → Bearer → API meet (ResourceServerAuthentication → /oauth2/introspect)
  → GET /api/v1.0/rooms/{slug} → { livekit: { url, token } }
  → SDK LiveKit → livekit.linagora.com
```

### Pourquoi le bearer plutôt que le cookie

L'API de `meet` déclare `DEFAULT_AUTHENTICATION_CLASSES = ("core.authentication.backends.SessionAuthenticationWith401",)`
— uniquement la session Django. Le client web obtient ce cookie par un Authorization
Code exécuté côté serveur. Une application native n'a pas accès à ce cookie, et le
récupérer supposerait une WebView, que `twake-mobile-login` interdit au nom de la
RFC 8252.

`django-lasuite` fournit déjà `lasuite.oidc_resource_server`, dont la classe DRF
`ResourceServerAuthentication` valide un jeton porteur par introspection. C'est le
chemin retenu.

### Surface du navigateur

`openAuthSessionAsync` (ASWebAuthenticationSession), et non `openBrowserAsync`.
Les guidelines imposent SFSafariViewController lorsque l'application ouvre plus tard
des pages web authentifiées, afin que le cookie SSO atterrisse dans un conteneur
partagé. Twake Visio n'en a pas besoin : disposant d'un jeton porteur, elle récupère
les ressources authentifiées — enregistrements du sous-projet 4 compris — directement
par l'API. Le choix du bearer rend la question du conteneur de cookies sans objet.

### Schéma de redirection

`twakevisio://`, enregistré nativement. Jamais `cozy://`, qui est également revendiqué
par l'application phare Cozy : sur un appareil portant les deux, le lien profond
ouvrirait la mauvaise application.

### Stockage

`refresh_token` dans `expo-secure-store` — Keychain sur iOS, Keystore sur Android.
Jamais dans MMKV, qui n'est pas chiffré par défaut. L'`access_token` réside en mémoire,
avec copie en stockage sécurisé pour survivre à un démarrage à froid. MMKV ne porte que
le pointeur du compte actif et les préférences non sensibles.

Multi-comptes : identité `` `${issuer}|${sub}` ``, un jeu de jetons par compte, un seul
actif à la fois.

## 5. Découverte d'instance

`/api/v1.0/config/` est public, non authentifié, et expose **déjà** `livekit.url`. Il
lui manque seulement le bloc OIDC.

```ts
export type InstanceConfig = {
  readonly serverUrl: string    // https://meet.linagora.com
  readonly issuer: string       // https://sso.linagora.com
  readonly clientId: string     // twake-visio
  readonly livekitUrl: string   // https://livekit.linagora.com
  readonly features: InstanceFeatures
}

export type InstanceResult =
  | { ok: true; value: InstanceConfig }
  | { ok: false; error: 'unreachable' | 'not-a-meet-instance' | 'oidc-undiscoverable' }
```

**Chemin A** — lecture de `config.oidc`. Suppose une contribution en amont chez
`suitenumerique/meet` ajoutant `oidc: { issuer, mobile_client_id }` à l'endpoint. Elle
bénéficie à toutes les instances, `visio.numerique.gouv.fr` comprise.

**Chemin B, repli** — quand ce bloc est absent : appel de `/api/v1.0/authenticate/`
sans suivre la redirection, puis extraction de l'issuer depuis l'en-tête `Location`.
Le `clientId` provient alors de `instance/knownInstances.ts`, table embarquée
associant un domaine à son identifiant de client mobile. Ce repli est confiné à une
seule fonction, `resolveOidcFromRedirect()`, supprimable d'un bloc quand toutes les
instances cibles auront la contribution amont.

WebFinger, que `twake-mobile-login` prescrit pour les applications OIDC, **n'est pas
servi par meet** : `/.well-known/webfinger` renvoie le HTML de la application web à
page unique. Ce chemin est donc écarté.

## 6. Couche réseau

Enveloppe de `fetch` injectant le Bearer, avec **rafraîchissement en vol unique** :
plusieurs 401 concurrents ne déclenchent qu'un seul appel au `token_endpoint`, les
autres attendent son résultat. Un échec de rafraîchissement marque le compte comme à
reconnecter sans purger les autres comptes.

Conformément à `twake-javascript-conventions`, toute opération faillible renvoie un
résultat discriminé plutôt que de lever. `throw` reste réservé aux invariants violés.

```ts
export type ApiResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError }

export type ApiError =
  | { kind: 'network' }
  | { kind: 'unauthorized' }                    // rafraîchissement échoué
  | { kind: 'forbidden' }                       // restricted sans accès
  | { kind: 'not-found' }
  | { kind: 'lobby'; participantId: string }    // salle d'attente
  | { kind: 'server'; status: number }
```

`lobby` est un membre de première classe de ce type, pas une erreur : c'est ce qui
permet à l'écran d'attente d'exister proprement.

## 7. Modèle d'accès aux salons

**Exigence produit :** une personne qui crée un salon ne doit pas avoir à être présente
pour que la visioconférence démarre. Cas d'usage de référence : un assistant crée les
rendez-vous et leurs liens de visioconférence sans devoir se connecter le jour venu.

Le backend délivre un jeton LiveKit selon la règle suivante, sans aucune condition de
présence d'un hôte :

```python
should_access_room = (
    (access_level == TRUSTED and user.is_authenticated)
    or role is not None          # accès explicite sur le salon
    or is_public
)
```

Le salon est un objet persistant : il existe indépendamment de toute connexion. La
salle d'attente n'existe que pour les salons non publics — `allow_participant_to_enter`
renvoie `404 "Room has no lobby system"` sur un salon public.

| `access_level` | Jeton direct pour | Salle d'attente | Exigence satisfaite |
|---|---|---|---|
| `public` | tout le monde, même non authentifié | aucune | oui |
| `trusted` | tout utilisateur authentifié | non-authentifiés seulement | oui pour les collègues, non pour un invité externe |
| `restricted` | seulement les accès explicites | tous les autres | non |

`restricted` est donc incompatible avec l'exigence, et `trusted` ne la satisfait que
partiellement. Trois conséquences sur la conception.

**Le niveau d'accès est un choix explicite à la création**, jamais un défaut caché.
L'écran l'expose avec sa conséquence formulée en clair — « les personnes extérieures
pourront entrer sans validation » plutôt que le seul mot `public`.

**Désignation de co-propriétaires à la création.** `perform_create` attribue
automatiquement le rôle `OWNER` au créateur, et à lui seul. Sans action complémentaire,
la personne pour qui la réunion est organisée n'a aucun droit de modération sur sa
propre réunion. L'application permet donc d'ajouter propriétaires et administrateurs
via `POST /resource-accesses/` au moment de la création, ce qui donne accès à
l'enregistrement, à la coupure de micro et à l'expulsion sans dépendre du créateur.

**L'attente sans modérateur est un cas nominal.** Si quelqu'un demande l'entrée d'un
salon `trusted` ou `restricted` et que personne n'a le pouvoir d'ouvrir, l'écran le dit
explicitement plutôt que de faire tourner un indicateur de chargement indéfiniment.

## 8. Interface

### Design system

`twake-react-conventions` impose `twake-mui` puis `cozy-ui` en repli et interdit les
styles inline. Les deux sont des bibliothèques web bâties sur MUI, inutilisables en
React Native. `twake-drive-mobile` a tranché la même question dans son `AGENTS.md`, qui
fait autorité localement ; Twake Visio reprend cette position et la documente au même
endroit.

```
src/ui/tokens/       palette, espacements, rayons, typographie
                     transcrits depuis twake-mui — source unique
src/ui/              composants React Native maison bâtis sur ces tokens
react-native-paper   chrome standard, thémé depuis les mêmes tokens
```

La règle « pas de styles inline » se traduit en React Native par : jamais de littéral
`style={{…}}`, toujours `StyleSheet.create` alimenté par les tokens.

Une interface de visioconférence étant presque intégralement sur mesure — tuiles vidéo,
grille, barre de contrôle — c'est `src/ui/` qui portera l'essentiel du travail, ce qui
alimente le paquet React Native maison que Drive appelle de ses vœux.

### Écrans

Bienvenue à trois entrées · saisie du serveur d'organisation · accueil · création ·
pré-jonction · salle d'attente · séance.

En séance, le parti pris mobile est la **vue locuteur actif** avec bande de vignettes,
plutôt que la grille du web : un écran de téléphone ne rend pas neuf visages lisibles.
Toucher une vignette l'épingle. La grille reste pertinente en tablette et en paysage —
même composant, deux dispositions.

## 9. Tests

`jest` et `@testing-library/react-native`, fichiers `*.spec.tsx` colocalisés, aucun
snapshot, `data-testid` en kebab-case, `queryBy` pour asserter une absence, conformément
à `twake-frontend-testing`.

Couverture unitaire visée : les deux chemins de découverte contre des fixtures, la
génération PKCE, l'échange et le rafraîchissement de jetons, et le rafraîchissement en
vol unique — trois 401 concurrents doivent produire un seul appel au `token_endpoint`.

`call/` enveloppe du WebRTC natif et n'est pas testable en jest. L'enveloppe reste mince
et l'on teste la logique alentour : machine à états de connexion, reconnexion, cycle de
vie. La validation réelle passe par Maestro, que les agents ne lancent pas — appareil et
session authentifiée requis, même règle que Drive.

Barre exigée avant toute demande de fusion : `npm test`, `npm run typecheck`,
`npm run lint` au vert.

## 10. Build et intégration continue

Expo SDK 54 avec `expo-dev-client` et `expo-router`, React Native 0.81.5 — la pile de
`twake-drive-mobile`, sans les dépendances `cozy-*` qui sont spécifiques à Drive. Expo
Go n'est pas utilisable : LiveKit exige une compilation de développement.

Génération native continue : `android/` et `ios/` sont gitignorés et produits par
`expo prebuild` en intégration continue. Toute configuration native passe par des
plugins, dont `@livekit/react-native-expo-plugin`.

| Paquet | Version |
|---|---|
| `@livekit/react-native` | 2.12.0 |
| `@livekit/react-native-webrtc` | 144.1.2 |
| `livekit-client` | 2.21.0 |
| `@livekit/react-native-expo-plugin` | 1.0.2 |

GitHub Actions sur demande de fusion : lint → typecheck → test. `lefthook` et
`commitlint` repris de Drive, ce dernier appliquant les Conventional Commits qu'exige
`twake-git-conventions`.

Android d'abord, via EAS Build : compilation de développement puis piste interne. iOS
ensuite, avec une contrainte de planification à connaître dès maintenant — **le
simulateur iOS ne peut publier ni caméra ni micro**, donc tout test iOS sérieux demande
un appareil physique et un compte de développeur.

## 11. Prérequis hors dépôt

Ces deux actions ne relèvent pas du dépôt mobile et conditionnent la mise en service.

**Enregistrer `twake-visio` comme client public sur `sso.linagora.com`**, avec PKCE et
la redirection `twakevisio://callback`. Point de vigilance : le document de découverte
de l'instance annonce
`token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic']`
— **`none` est absent**. Or un client public s'authentifie précisément par `none`. Soit
les métadonnées LemonLDAP ne sont pas à jour et l'enregistrement passera, soit le SSO ne
sait pas encore gérer de client public, auquel cas c'est bloquant. À vérifier au moment
de l'enregistrement.

**Activer `lasuite.oidc_resource_server` sur le déploiement `meet.linagora.com`**, en
ajoutant `ResourceServerAuthentication` aux classes d'authentification et en configurant
l'introspection contre `https://sso.linagora.com/oauth2/introspect`. Une contribution en
amont chez `suitenumerique/meet` est probablement le bon véhicule.

## 12. Écarts documentés vis-à-vis des guidelines

| Guideline | Écart | Raison |
|---|---|---|
| `twake-react-conventions` — twake-mui puis cozy-ui | composants React Native maison sur tokens transcrits | les deux bibliothèques sont web (MUI), inutilisables en RN ; précédent posé par `twake-drive-mobile` |
| `twake-react-conventions` — pas de styles inline | `StyleSheet.create` alimenté par les tokens | équivalent React Native de la même intention |
| `twake-mobile-login` — découverte par WebFinger | lecture de `/api/v1.0/config/`, repli par redirection | WebFinger n'est pas servi par les instances meet |

Ces écarts sont à reporter dans l'`AGENTS.md` du dépôt, qui fait autorité localement.

## 13. Points ouverts

**Rotation des `refresh_token` côté LemonLDAP.** Si elle est active, le nouveau jeton
doit être persisté à chaque échange, sous peine de déconnexions aléatoires après
quelques heures. Comportement à constater à la première intégration.

**Expiration au retour de veille.** Le jeton peut expirer pendant que la connexion
LiveKit tient encore. La machine à états de `call/` doit gérer ce désalignement.

**Entrée « S'inscrire ».** Les guidelines la définissent comme une inscription Twake
Workplace via `sign-up.twake.app`. `meet.linagora.com` s'authentifiant contre
`sso.linagora.com`, l'identité de ces deux référentiels reste à confirmer.

**Rejoindre en invité.** Le design prévoit qu'un salon public existant soit rejoignable
sans compte, mais cela n'a pas été vérifié sur `meet.linagora.com` — la vérification
demande un salon de test.

**Défaut `RESOURCE_DEFAULT_ACCESS_LEVEL`.** Vaut `public` dans le code amont, mais
l'instance surcharge visiblement ses variables d'environnement puisque
`ALLOW_UNREGISTERED_ROOMS` y est désactivé alors qu'il vaut `true` par défaut. Le défaut
réel est invisible depuis l'extérieur.

**Couverture linguistique.** Drive impose sept locales remplies avant fusion
(`en fr es it de vi ru`). `meet` gère les siennes par Crowdin, avec une couverture
probablement différente. Sept par cohérence mobile, sauf décision contraire.
