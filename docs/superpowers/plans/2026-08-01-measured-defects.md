# Deux défauts mesurés sur appareil, indépendants : Bluetooth et palette Material

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:executing-plans` ou
> `superpowers:subagent-driven-development` pour dérouler ce plan tâche par tâche. Les étapes
> utilisent des cases à cocher (`- [ ]`). Les quatre tâches se répartissent sur deux défauts qui ne
> partagent aucun fichier : rien n'oblige à les traiter dans le même ordre, ni dans la même séance.

**Goal :** corriger deux défauts constatés sur un Pixel 10 Pro Fold (Android 16, API 36) et
remontés indépendamment l'un de l'autre — une route audio Bluetooth qui ne peut pas s'activer, et
la palette violette de référence Material qui perce sur les écrans hors séance. Chaque défaut a été
reproduit dans ce dépôt, sur cette branche, avant l'écriture de ce plan ; les deux sections
ci-dessous rapportent exactement ce qui a été rejoué et ce qui ne l'a pas été.

**Architecture :** aucun nouveau module. Le défaut 1 étend un seam déjà établi
(`src/call/permissions.ts`, qui gère déjà la demande d'exécution caméra/micro) d'une fonction sœur,
plus un point de câblage dans `src/screens/room/call.tsx`. Le défaut 2 étend la fabrique de thème
déjà centralisée (`src/ui/theme.ts`) de trois rôles de couleur supplémentaires. Aucun composant
d'écran n'est modifié pour le défaut 2 : le thème traverse le contexte de `PaperProvider`, tout
consommateur du rôle en profite sans plomberie par fichier. Les deux défauts ne se croisent sur
aucun fichier :

| | Fichiers touchés |
| --- | --- |
| Défaut 1 | `app.json`, `src/call/permissions.ts` (+ spec), `src/screens/room/call.tsx` |
| Défaut 2 | `src/ui/theme.ts`, `src/ui/theme.spec.ts` |

**Tech Stack :** TypeScript strict, React Native 0.86, Expo SDK 57, react-native-paper 5.15.3
(Material Design 3 exclusivement — `isV3: true` partout), `@livekit/react-native` 2.12.0,
`@livekit/react-native-webrtc` 144.1.2, `livekit-client` 2.18.0, Jest 29 + `jest-expo` +
`@testing-library/react-native` 14 (non sollicité par ce plan — voir plus bas). Sous Android,
`@livekit/react-native` déclare — `android/build.gradle:130` —
`api 'com.github.davidliu:audioswitch:89582c47c9a04c62f90aa5e57251af4800a62c9a'` : coordonnée
JitPack (compte GitHub `davidliu`, version = un commit épinglé), mais le paquet Java à l'intérieur
reste `com.twilio.audioswitch` (confirmé dans son propre manifeste), signe d'un fork non renommé de
la bibliothèque d'origine de Twilio. C'est elle qui énumère et commute les périphériques audio.

Aucune des deux tâches à code n'ouvre de composant Paper ni n'appelle `render`/`fireEvent` : les
quatre tâches ci-dessous testent des fonctions pures ou quasi pures (`ensureBluetoothPermission`,
`makeTheme`). La doctrine RNTL 14 asynchrone, la recette d'ouverture de `Menu`, et tout le
mécanisme `PaperProvider` documentés dans `AGENTS.md` ne s'appliquent donc à aucune tâche de ce
plan — ce n'est pas un oubli, c'est vérifié : aucun import de `@testing-library/react-native` n'est
nécessaire dans les specs modifiées ou créées ici.

Aucune des deux ne montre de chaîne nouvelle : le défaut 1 ne change qu'un menu déjà filtré sur ce
qu'il reçoit (détail en Défaut 1) et le défaut 2 ne fait que changer des valeurs de couleur déjà
consommées, sans texte propre. Les sept locales ne sont donc concernées par aucune tâche.

---

## Global Constraints

- **`node_modules` est un lien symbolique.** Ne jamais lancer `npm install`, `npm ci`, `npm add` ni
  `npx expo install`. Ce plan n'ajoute aucune dépendance.
- **`android/` est gitignoré**, produit par `expo prebuild`. Aucune tâche ne le commite ; la Tâche 1
  passe par `app.json`, seul point d'entrée pour une permission Android déclarative. Toute
  reproduction locale de la Tâche 1 doit supprimer `android/` une fois la vérification faite.
- **Barre de qualité**, chaque tâche : `npm test`, `npm run typecheck`, `npm run lint`,
  `npm run format:check` verts. Le lint conserve un avertissement préexistant sur
  `src/i18n/index.ts:32`, sans rapport avec ce plan : le laisser.
- Commits atomiques, Conventional Commits, sujet en imperative mood. `commitlint.config.js`
  reconfigure `subject-case` pour n'interdire que `start-case`/`pascal-case`/`upper-case` — la
  sentence-case du dépôt (première lettre en majuscule) n'y est pas listée, donc autorisée, à
  l'inverse du défaut de `@commitlint/config-conventional`. Jamais `--no-verify`.
- **Discipline de mutation** : chaque test ajouté est éprouvé en cassant le code qu'il garde,
  constatant le rouge, puis en restaurant — jamais un mutant commité. Les mutations proposées dans
  chaque tâche ont été rejouées avant l'écriture de ce plan (voir chaque section) ; le rouge exact
  qu'elles produisent y est cité, pas supposé.
- **Aucune tâche n'élargit un type.** La Tâche 2 ajoute une fonction sans toucher à `Permission` ni
  `PermissionStatus` (construits par `react-native`, consommés ici tels quels). La Tâche 4 ne fait
  que fournir des valeurs pour des clés que `MD3Theme['colors']` — construit par
  `react-native-paper`, jamais par ce dépôt — exige déjà : `surfaceVariant`, `onSurfaceVariant` et
  `outline` existaient dans le type avant ce plan, seule leur valeur change. Aucune signature
  exportée n'est modifiée nulle part.

### Ce qu'un test ne peut jamais prouver ici — défaut 1

La permission ne se vérifie pas en test unitaire, et ce plan ne prétend pas le contraire. Jest ne
sait dire ni si le système affiche la boîte de dialogue « Appareils à proximité », ni si un vrai
casque Bluetooth appairé se présente ensuite à AudioSwitch. `ensureBluetoothPermission()` est
testable comme pure logique de branchement (quelle plateforme, quelle API, quel appel, quel
résultat) ; ce que cette logique **produit sur un téléphone réel** ne l'est pas. La section Défaut 1
liste précisément ce qui reste à constater sur appareil.

### Ce qu'un test peut prouver ici, et jusqu'où — défaut 2

`AGENTS.md` est catégorique : aucun test ne prouve qu'un texte est lisible, RNTL ne rastérise rien.
Mais il montre aussi ce qu'un test **peut** prouver — qu'une valeur explicite n'a pas été retirée.
La Tâche 4 est entièrement de cette nature, et c'est en réalité **plus simple** ici que pour le
motif `toHaveStyle` de `AGENTS.md` : `makeTheme()` est une fonction pure, sans rendu, sans
`PaperProvider`, sans `testID`. Un test peut donc prouver, avec une égalité stricte, exactement
deux choses :

1. **Que la valeur choisie n'a pas dérivé** vers la référence Material — `expect(colors.outline).toBe(tokens.color.muted)`, `expect(colors.onSurfaceVariant).toBe(colors.onSurface)`. C'est la même nature de garde que `toHaveStyle` dans `AGENTS.md`, appliquée un niveau plus bas.
2. **Que le contraste calculé de la paire choisie franchit le seuil AA** — la même fonction `computeContrast` que les quatre tests déjà présents dans ce fichier, appliquée aux deux nouvelles paires texte-sur-fond. C'est un calcul, pas un rendu : aucune limite de RNTL ne s'y applique, et le fichier le fait déjà pour `onSurface`/`background`, `error`/`background`, `onPrimary`/`primary`.

Ce qu'un test **ne peut toujours pas** prouver : que le rendu réel — polices, épaisseur de trait,
état du dispositif d'affichage — rend cette paire perceptible. C'est une limite de lecture du thème,
pas de plateforme de test différente de celle qu'`AGENTS.md` documente déjà pour les composants.
Pour `outline`, rôle non textuel (bordure de champ), le seuil pertinent n'est pas le 4,5:1 du texte
mais le 3:1 du contraste non textuel (WCAG 1.4.11) — un fait de conception cité en commentaire dans
la Tâche 4, comme `controlBar.ts` le fait déjà pour ses propres choix, sans test dédié : il n'existe
dans ce dépôt aucun helper pour un seuil non textuel, et il n'y en a pas besoin pour une seule
paire dont le calcul est montré en clair.

---

## Défaut 1 — la route audio Bluetooth ne peut pas fonctionner

### Ce qui a été reproduit

Le manifeste source de l'application (`app.json` → `expo.android.permissions`) ne porte que
`["CAMERA", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS"]`. Pour vérifier le manifeste **fusionné**, ce
plan a exécuté, dans ce worktree :

```bash
npx expo prebuild --platform android --no-install
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
cd android && ./gradlew :app:processDebugManifest --offline
```

Build réussi (`BUILD SUCCESSFUL in 12s`, SDK et caches Gradle déjà présents sur la machine). Le
chemin exact diffère légèrement de celui pressenti : il existe **deux** manifestes fusionnés, pas
un seul, et le second existe précisément à cause d'un conflit que ce build a révélé.

`android/app/build/intermediates/merged_manifest/debug/processDebugMainManifest/AndroidManifest.xml`
— fusion intermédiaire, avant la résolution de conflit Expo :

```xml
<uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36" />
...
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
```

Le journal de build montre pourquoi cette permission porte `maxSdkVersion="30"` ici : le plugin de
prébuild Expo (« Expo Max Sdk Override Plugin ») a détecté un conflit et l'a résolu en supprimant
cette borne :

```
>>> WARNING: Found 1 permission(s) with conflicting 'android:maxSdkVersion' declarations.
    - android.permission.BLUETOOTH
      > Defined WITH `android:maxSdkVersion` in: .../transforms/.../audioswitch-.../AndroidManifest.xml
      > Defined WITHOUT `android:maxSdkVersion` in: node_modules/@livekit/react-native/android/build/intermediates/merged_manifest/debug/processDebugManifest/AndroidManifest.xml
>>> Removed 'android:maxSdkVersion' from 1 instance(s) in the final manifest.
```

Le manifeste **réellement empaqueté** —
`android/app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml`
— porte donc, après résolution :

```xml
<uses-permission android:name="android.permission.BLUETOOTH"/>
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN"/>
```

`grep -rn "BLUETOOTH_CONNECT" android/` sur l'arbre entier généré : **zéro occurrence.**
`targetSdkVersion="36"` confirmé dans le manifeste — au-dessus du seuil API 31 où
`BLUETOOTH_CONNECT` devient nécessaire.

**Provenance de `BLUETOOTH`/`BLUETOOTH_ADMIN`** : `node_modules/@livekit/react-native/android/src/main/AndroidManifest.xml`
les déclare, et son code Java (`android/src/main/java/com/livekit/reactnative/audio/AudioDeviceKind.java:8`,
`BLUETOOTH("bluetooth", AudioDevice.BluetoothHeadset.class)`) montre qu'ils viennent de AudioSwitch,
dont le manifeste propre (extrait de
`~/.gradle/caches/9.3.1/transforms/.../audioswitch-.../AndroidManifest.xml`) déclare :

```xml
<uses-sdk android:minSdkVersion="16" android:targetSdkVersion="31" />
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

AudioSwitch borne lui-même `BLUETOOTH` à l'API 30 : ses propres auteurs savent que cette permission
ne sert plus rien au-delà. Ni `@livekit/react-native`, ni `@livekit/react-native-webrtc`
(`android/src/main/AndroidManifest.xml` : un seul `<service>`, aucune permission), ni AudioSwitch,
ni `app.json` ne déclarent `BLUETOOTH_CONNECT` — confirmé par grep dans chacun des trois premiers et
par lecture du quatrième.

**Comportement à l'exécution sans la permission** : `PermissionsCheckStrategy`, une classe réelle du
jar décompilé d'AudioSwitch (`hasPermissions`, constante `PERMISSION_ERROR_MESSAGE`), porte la
chaîne littérale `"Bluetooth unsupported, permissions not granted"`. AudioSwitch **dégrade
silencieusement** : sans la permission, il retire `bluetooth` de son énumération plutôt que de
planter. Ce fait ferme la boucle jusqu'à l'écran : `src/screens/room/audioOutputControl.tsx:86`
n'affiche que `outputs.map((kind) => …)` — un `Menu.Item` par catégorie **présente**, aucune ligne
grisée pour une catégorie absente. Une permission refusée ne casse donc rien et n'affiche aucune
ligne morte : elle retire silencieusement une option d'un menu, exactement le symptôme du rapport.
Aucune nouvelle chaîne utilisateur n'est donc nécessaire pour ce défaut.

### Structure des fichiers

| Fichier | Rôle |
| --- | --- |
| `app.json` (modifié) | déclare `BLUETOOTH_CONNECT` — seul point d'entrée pour une permission Android statique |
| `src/call/permissions.ts` (modifié) | gagne `ensureBluetoothPermission()`, sœur de `ensureMediaPermissions()` |
| `src/call/permissions.spec.ts` (modifié) | quatre cas nouveaux, éprouvés par mutation |
| `src/screens/room/call.tsx` (modifié) | câble l'appel avant `session.connect()`, résultat ignoré à dessein |

---

### Tâche 1 : déclarer `BLUETOOTH_CONNECT`

**Files :**
- Modify : `app.json`

**Interfaces :** aucune — configuration déclarative. `expo prebuild` la traduit en
`<uses-permission>` via `@expo/config-plugins/build/android/Permissions.js`, dont
`prefixAndroidPermissionsIfNecessary` préfixe génériquement tout nom sans point par
`android.permission.` (lu dans le source, aucune liste blanche : le mécanisme qui a déjà inséré
`CAMERA`/`RECORD_AUDIO`/`MODIFY_AUDIO_SETTINGS` insère `BLUETOOTH_CONNECT` de la même façon).

- [ ] **Step 1 : modifier `app.json`**

```diff
     "android": {
       "package": "com.linagora.twakevisio",
-      "permissions": ["CAMERA", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS"],
+      "permissions": ["CAMERA", "RECORD_AUDIO", "MODIFY_AUDIO_SETTINGS", "BLUETOOTH_CONNECT"],
```

- [ ] **Step 2 : reproduire la fusion et vérifier la permission, puis nettoyer**

Aucun test Jest ne couvre `app.json` (vérifié : `grep -rln "app.json\|BLUETOOTH" --include="*.spec.ts*"`
ne renvoie rien dans ce dépôt). La vérification est la reproduction elle-même :

```bash
npx expo prebuild --platform android --no-install
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
cd android && ./gradlew :app:processDebugManifest --offline
grep BLUETOOTH_CONNECT app/build/intermediates/merged_manifests/debug/processDebugManifest/AndroidManifest.xml
```

Attendu : une ligne `<uses-permission android:name="android.permission.BLUETOOTH_CONNECT"/>`.

- [ ] **Step 3 : supprimer `android/`**

Depuis la racine du dépôt — ne pas supposer que le répertoire courant du Step 2 a persisté : un
agent qui exécute ce plan réinitialise son répertoire de travail entre deux appels de commande.

```bash
rm -rf android
```

Jamais commité (`AGENTS.md` : native généré, gitignoré). Quiconque a déjà un `android/` local doit
relancer `expo prebuild` pour que ce changement s'y reflète.

- [ ] **Step 4 : commit**

```bash
git add app.json
git commit -m "fix(call): Declare BLUETOOTH_CONNECT for the Android 12 permission model"
```

---

### Tâche 2 : `ensureBluetoothPermission` — demander, jamais bloquer

**Files :**
- Modify : `src/call/permissions.ts`
- Modify : `src/call/permissions.spec.ts`

**Interfaces :**
- Consumes : `PermissionsAndroid`, `Platform` de `react-native` (déjà importés dans ce fichier)
- Produces : `ensureBluetoothPermission(): Promise<boolean>`

Trois faits commandent cette tâche, tous vérifiés au-dessus ou empiriquement ci-dessous.

`BLUETOOTH_CONNECT` n'existe comme permission **d'exécution** qu'à partir de l'API 31 : en dessous,
`BLUETOOTH`/`BLUETOOTH_ADMIN` — d'avant Android 12, déjà déclarées, jamais à demander — suffisent.
La fonction distingue donc trois branches : hors Android, Android < 31, Android ≥ 31.

Cette permission ne doit **jamais** bloquer l'entrée en séance : contrairement à la caméra et au
micro (`ensureMediaPermissions`, dont le refus arrête `call.tsx` sur `call.permissionsDenied`), un
refus de Bluetooth laisse simplement `bluetooth` absent de la liste que rend `listAudioOutputs()` —
la séance fonctionne, au haut-parleur ou à l'écouteur. C'est pourquoi cette fonction est **séparée**
de `ensureMediaPermissions()`, jamais fusionnée avec elle : un `requestMultiple` combiné ferait
échouer l'entrée en séance sur un refus Bluetooth, une régression que ce plan ne produit pas.

**Vérification empirique du test le plus délicat de cette tâche** — mocker `Platform.Version`.
`Platform.OS` se mocke par `jest.replaceProperty(Platform, 'OS', 'android')` dans tout ce dépôt
(`audioRoute.spec.ts`, `permissions.spec.ts`). `Platform.Version` est différent : c'est un
**accesseur** (`get Version()`, `Platform.ios.js:19` — le fichier que Jest charge par défaut, `OS`
y vaut `'ios'`, exactement ce qu'`AGENTS.md` affirme et que ce plan a revérifié). Essayer le même
idiome jette :

```
Cannot replace the `Version` property because it has a getter.
Use `jest.spyOn(object, 'Version', 'get').mockReturnValue(value)` instead.
```

— message obtenu en exécutant réellement ce mock dans ce dépôt, pas supposé. L'idiome correct, lui
aussi exécuté avec succès avant d'écrire cette tâche :

```ts
jest.replaceProperty(Platform, 'OS', 'android');
jest.spyOn(Platform, 'Version', 'get').mockReturnValue(31);
```

`PermissionsAndroid.request` (singulier, une seule permission — à ne pas confondre avec
`requestMultiple`, utilisé par `ensureMediaPermissions`) existe bien et se mocke par `jest.spyOn` de
la même façon ; vérifié.

- [ ] **Step 1 : écrire les tests qui échouent**

Dans `src/call/permissions.spec.ts`, étendre l'import et ajouter un second `describe` :

```ts
import { ensureBluetoothPermission, ensureMediaPermissions } from 'src/call/permissions';
```

```ts
describe('ensureBluetoothPermission', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("ne demande rien hors d'Android, où ce module de permission n'existe pas", async () => {
    const request = jest.spyOn(PermissionsAndroid, 'request');
    jest.replaceProperty(Platform, 'OS', 'ios');

    await expect(ensureBluetoothPermission()).resolves.toBe(true);

    expect(request).not.toHaveBeenCalled();
  });

  it("ne demande rien sous l'API 31, où BLUETOOTH_CONNECT n'est pas une permission d'exécution", async () => {
    const request = jest.spyOn(PermissionsAndroid, 'request');
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(30);

    await expect(ensureBluetoothPermission()).resolves.toBe(true);

    expect(request).not.toHaveBeenCalled();
  });

  it("demande BLUETOOTH_CONNECT à partir de l'API 31, jamais une autre permission", async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(31);
    const request = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue('granted' as never);

    await expect(ensureBluetoothPermission()).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
  });

  it('rend false sur un refus, y compris définitif', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(31);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue('never_ask_again' as never);

    await expect(ensureBluetoothPermission()).resolves.toBe(false);
  });
});
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/call/permissions`
Attendu : ÉCHEC — `ensureBluetoothPermission` n'est pas exporté.

- [ ] **Step 3 : implémenter**

Dans `src/call/permissions.ts`, à la suite de `ensureMediaPermissions` :

```ts
// Le manifeste ne déclare BLUETOOTH et BLUETOOTH_ADMIN — permissions d'avant
// Android 12 — ni BLUETOOTH_CONNECT, ajoutée par app.json (Tâche 1). Sur l'API 31
// et au-delà, BLUETOOTH_CONNECT est elle aussi une permission d'exécution : sans
// cette demande, AudioSwitch (`PermissionsCheckStrategy`, mesuré dans le jar
// décompilé : « Bluetooth unsupported, permissions not granted ») retire
// silencieusement 'bluetooth' de son énumération. Aucun crash, aucun message —
// la route manque, sans se signaler.
//
// Résultat volontairement facultatif pour l'appelant : contrairement à la
// caméra et au micro, l'absence de cette permission ne doit jamais bloquer
// l'entrée en séance, seulement priver le menu de sortie audio d'une entrée.
export async function ensureBluetoothPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  // BLUETOOTH_CONNECT n'existe comme permission d'exécution qu'à partir de
  // l'API 31 : en dessous, BLUETOOTH/BLUETOOTH_ADMIN — d'avant Android 12,
  // déjà déclarées, jamais à demander — suffisent.
  if (Platform.Version < 31) return true;

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx jest src/call/permissions`
Attendu : PASSE (8 cas : 4 existants + 4 nouveaux). Rejoué avant d'écrire cette tâche : 8/8 verts,
`npm test` complet à 629/629, `tsc --noEmit` et `eslint` propres.

- [ ] **Step 5 : éprouver par mutation**

Trois mutations, rejouées avant d'écrire cette tâche — le rouge exact obtenu est cité, pas supposé :

1. Remplacer `PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT` par
   `PermissionsAndroid.PERMISSIONS.RECORD_AUDIO` — fait rougir « demande BLUETOOTH_CONNECT à partir
   de l'API 31 » sur `Expected: "android.permission.BLUETOOTH_CONNECT", Received:
   "android.permission.RECORD_AUDIO"`.
2. Remplacer `if (Platform.Version < 31) return true;` par `if (false) return true;` — fait rougir
   « ne demande rien sous l'API 31 » : la fonction appelle alors `PermissionsAndroid.request` sans
   mock configuré pour ce cas, ne résout plus à `true`.
3. Remplacer `result === PermissionsAndroid.RESULTS.GRANTED` par `true` — fait rougir « rend false
   sur un refus, y compris définitif ».

Restaurer après chaque.

- [ ] **Step 6 : commit**

```bash
git add src/call/permissions.ts src/call/permissions.spec.ts
git commit -m "feat(call): Request BLUETOOTH_CONNECT on API 31 and above, without gating entry"
```

---

### Tâche 3 : câbler la demande avant l'ouverture du transport

**Files :**
- Modify : `src/screens/room/call.tsx`

**Interfaces :**
- Consumes : `ensureBluetoothPermission` de `src/call/permissions` (Tâche 2)
- Produces : rien de nouveau — aucun export ajouté, un seul appel inséré dans un effet existant

`src/call/connection.ts:186` montre que `AudioSession.startAudioSession()` — ce qui déclenche
l'énumération AudioSwitch — s'exécute à l'intérieur de `session.connect()`. La permission doit donc
être demandée **avant** cet appel, au même endroit que `ensureMediaPermissions()`
(`call.tsx:345`, juste avant `session.connect()` en `call.tsx:355`), pour qu'AudioSwitch la voie
déjà tranchée à son activation plutôt qu'à une énumération ultérieure.

- [ ] **Step 1 : étendre l'import**

```diff
-import { ensureMediaPermissions } from 'src/call/permissions';
+import { ensureBluetoothPermission, ensureMediaPermissions } from 'src/call/permissions';
```

- [ ] **Step 2 : insérer l'appel, résultat ignoré à dessein**

```diff
         if (!(await ensureMediaPermissions())) {
           if (!cancelled) setFailure('call.permissionsDenied');
           return;
         }
         if (cancelled) return;
 
+        // Résultat ignoré à dessein : contrairement à la caméra et au micro, un
+        // refus Bluetooth ne doit jamais bloquer l'entrée en séance — il prive
+        // seulement le menu de sortie audio d'une entrée (`listAudioOutputs`).
+        // Demandée ici, avant `connect()`, pour qu'`AudioSession.startAudioSession()`
+        // (`src/call/connection.ts:186`) la voie déjà tranchée à son activation.
+        await ensureBluetoothPermission();
+
         // `connect()` ne rejette jamais : l'issue est publiée sur l'abonnement
         // ci-dessus, elle n'est pas portée par la promesse. Il n'y a donc pas
         // de jet à rattraper ici, seulement un état à lire — pour ne pas
         // allumer les périphériques d'une séance qui ne s'est pas ouverte.
         await session.connect(result.value);
```

- [ ] **Step 3 : pas de nouveau test — précédent vérifié, pas supposé**

`grep -n "ensureMediaPermissions\|jest.mock('src/call/permissions'" src/screens/room/call.spec.tsx`
ne renvoie **aucune** ligne : le seam existant n'est testé nulle part dans ce fichier. La raison
tient en une ligne : le préréglage Jest fixe `Platform.OS` à `'ios'`, donc
`if (Platform.OS !== 'android') return true;` fait déjà de `ensureMediaPermissions()` un
court-circuit muet sous chaque test existant, sans qu'aucun n'ait besoin de le mocker.
`ensureBluetoothPermission()` a la même première ligne : elle sera tout aussi muette sous la même
suite, pour la même raison. Fabriquer un test qui isolerait ce seul appel introduirait un mécanisme
absent du fichier (le premier du genre), pour un chemin d'exécution — la branche Android — que la
suite ne couvre déjà nulle part ailleurs à cet endroit. Ce plan suit la limite déjà acceptée plutôt
que d'en inventer une nouvelle : la garantie que ce câblage tient est `npm test` au vert (aucune
suite existante cassée) et la vérification sur appareil listée plus bas.

- [ ] **Step 4 : lancer la suite complète**

Run : `npm test`
Attendu : 629/629, inchangé depuis la fin de la Tâche 2 — cette tâche n'ajoute aucun test, et
`call.spec.tsx` ne mocke ni n'appelle jamais cette branche (Step 3 ci-dessus).

- [ ] **Step 5 : commit**

```bash
git add src/screens/room/call.tsx
git commit -m "feat(call): Ask for the Bluetooth route permission before opening the transport"
```

### Ce qui reste à constater sur appareil, avec un vrai casque Bluetooth

Aucun des points suivants n'est vérifiable par Jest ; tous exigent un Pixel 10 Pro Fold (ou tout
appareil Android 12+) avec un casque ou une enceinte Bluetooth réellement appairés :

1. **La boîte de dialogue système** — « Autoriser Twake Visio à trouver, associer et connecter des
   appareils à proximité ? » — apparaît-elle à l'entrée en séance, avant l'écran d'appel ?
2. **Une fois accordée**, `bluetooth` apparaît-il dans le menu de sortie audio
   (`audioOutputControl.tsx`), avec le casque réellement appairé actif ?
3. **Un refus** laisse-t-il la séance fonctionner normalement (haut-parleur/écouteur), sans écran
   d'erreur ni menu cassé ?
4. **Un octroi tardif** — permission accordée depuis les réglages système **pendant** une séance déjà
   ouverte — fait-il apparaître `bluetooth` à la prochaine ouverture du menu, ou seulement à la
   séance suivante ? `PermissionsCheckStrategy` d'AudioSwitch a été localisée dans le bytecode
   décompilé mais son moment d'appel exact (`start()`/activation, ou chaque énumération) n'a pas été
   tracé plus loin : ce point 4 est une hypothèse à trancher sur appareil, pas un fait mesuré.

---

## Défaut 2 — la palette de Material fuit dans l'écran

### Ce qui a été reproduit

`src/ui/theme.ts` compose `makeTheme()` en surchargeant six clés de `base.colors`
(`MD3LightTheme`/`MD3DarkTheme` de react-native-paper) : `primary`, `onPrimary`, `background`,
`surface`, `onSurface`, `error`. Compte des rôles rejoué mécaniquement (script Node chargeant
`LightTheme.js`/`DarkTheme.js` directement, un mock minimal remplaçant `react-native` pour éviter la
syntaxe Flow que Node ne parse pas) :

```
Light role count: 33
Dark role count: 33
Identical key sets: true
Overridden by makeTheme(): 6
Remaining un-overridden count: 27
```

Exactement la liste et le compte annoncés. Les 27 :

```
primaryContainer, secondary, secondaryContainer, tertiary, tertiaryContainer, surfaceVariant,
surfaceDisabled, errorContainer, onPrimaryContainer, onSecondary, onSecondaryContainer,
onTertiary, onTertiaryContainer, onSurfaceVariant, onSurfaceDisabled, onError, onErrorContainer,
onBackground, outline, outlineVariant, inverseSurface, inverseOnSurface, inversePrimary, shadow,
scrim, backdrop, elevation
```

Pour chacun, ce plan a tracé — dans le source de react-native-paper, pas par supposition — quel
composant réellement rendu par cette application (inventaire exhaustif de
`grep -rn "from 'react-native-paper'" src/`) le consomme, et si `src/ui/tokens` porte un équivalent.

| Rôle | Consommé aujourd'hui par | Jeton disponible | Décision |
| --- | --- | --- | --- |
| `surfaceVariant` | `TextInput` (mode `flat`, le défaut — `helpers.tsx:412`) : `server.tsx`, `home.tsx` (×2), `create.tsx` (×2) | aucun jeton « variant » dédié | **Corrigé** — repli sur `surface` (même valeur que le rôle déjà surchargé) |
| `onSurfaceVariant` | label/placeholder de `TextInput` (`helpers.tsx:379/439`, `Adornment/utils.ts:15/47`) ; `description` de `List.Item` (`home.tsx:179`, `ListItem.tsx:234`) ; `HelperText type="info"` (`create.tsx:155`, `HelperText/utils.ts:24`) ; anneau non coché de `RadioButton` (`create.tsx`, `Checkbox/utils.ts:35`, partagé par `RadioButtonAndroid`) | `tokens.color.muted` échoue en sombre (voir ratios plus bas) | **Corrigé** — repli sur `onSurface` |
| `outline` | trait de repos de `TextInput` (`helpers.tsx:468`) | `tokens.color.muted`, jamais utilisé ailleurs qu'en commentaire | **Corrigé** — première utilisation réelle de `muted`, sous le seuil non textuel (3:1), pas le seuil texte |
| `surfaceDisabled` | fond d'un `Button mode="contained" disabled` (`server.tsx:132`, `create.tsx:197`, tant que `busy`) | aucun — pas de convention d'opacité dans `tokens` | **Laissé** — teinte neutre, pas violette ; état transitoire ; fabriquer un jeton d'opacité dépasserait ce qui est mesuré |
| `onSurfaceDisabled` | texte du même bouton désactivé | idem | **Laissé**, même motif |
| `primaryContainer`, `secondaryContainer`, `tertiaryContainer`, `errorContainer` | aucun — ni `Chip`, ni `FAB`, ni `Card`, ni bouton segmenté n'apparaît dans `src/` | aucun concept « container » dans `tokens` | Laissé — rien ne le consomme |
| `secondary`, `onSecondary`, `onSecondaryContainer` | aucun — `Switch` lit `colors.primary` en v3 (`Switch/utils.ts:33`, vérifié), jamais `accent`/`secondary` | aucun concept « secondary » dans `tokens` | Laissé — vérifié inerte, pas supposé |
| `tertiary`, `onTertiary`, `onTertiaryContainer` | aucun | aucun | Laissé |
| `onPrimaryContainer` | aucun (dépend de `primaryContainer`, lui-même inerte) | — | Laissé |
| `onError`, `onErrorContainer` | aucun — `HelperText`/`Button` lisent `colors.error`, jamais `onError` | — | Laissé |
| `onBackground` | aucun composant de cette liste ne le lit | — | Laissé |
| `outlineVariant` | aucun — `Divider` n'est importé nulle part dans `src/` | — | Laissé |
| `inverseSurface`, `inverseOnSurface`, `inversePrimary` | `Snackbar` (`call.tsx:777`), seul import de ce composant dans `src/` | aucun concept « inverse » dans `tokens` | **Hors périmètre**, voir encadré ci-dessous |
| `shadow`, `scrim`, `backdrop` | ombres/rétroéclairages internes à Paper | quasi noir dans MD3 des deux côtés, pas de teinte violette perceptible | Laissé — sans effet visible |
| `elevation` | `Menu` (`Menu.tsx:678`) | — | Laissé — déjà neutralisé aujourd'hui par `contentStyle={barStyles.menuContent}` sur les trois `Menu` de la barre d'appel (vérifié : `cameraMenu.tsx`, `audioOutputControl.tsx`, `moreMenu.tsx` le posent tous ; `recordingControl.tsx`/`handControl.tsx` ne rendent que des `Menu.Item`, hérités du `Menu` de `moreMenu.tsx`) |

**Contrastes calculés** (même fonction que `theme.spec.ts`, exécutée pour ce plan, pas estimée à la
main) :

| Paire | Ratio | AA texte (4,5:1) |
| --- | --- | --- |
| `muted` sur `surfaceLight` (`#FFFFFF`) | 4,834 | passe |
| `muted` sur `backgroundLight` (`#F5F7FA`) | 4,505 | passe, à la marge la plus fine possible |
| `muted` sur `surfaceDark` (`#121212`) | 3,875 | échoue (recoupe le 3,88 déjà cité dans `controlBar.ts`) |
| `muted` sur `backgroundDark` (`#0B0B0C`) | 4,069 | échoue |

`muted` échoue donc, dans au moins un schéma, tout rôle qui porte du **texte**
(`onSurfaceVariant`) : la Tâche 4 ne l'y utilise pas, et aligne ce rôle sur `onSurface` à la place —
même principe que `controlBar.ts` a déjà posé pour un dilemme identique (« hiérarchie par la taille,
jamais par un gris qui échoue »). Mais les quatre ratios franchissent le seuil non textuel de 3:1,
pertinent pour `outline` (une bordure, pas du texte) : c'est la seule utilisation retenue de
`muted` dans cette tâche, et sa toute première dans le code de l'application — jusqu'ici cette
constante n'apparaît que dans des commentaires (`grep -rn "tokens.color.muted" src/` : cinq
occurrences, toutes en commentaire, aucune en valeur).

**Constat annexe, explicitement hors périmètre.** `Snackbar` (`call.tsx:777`, sur l'écran d'appel
forcé sombre) lit `inverseSurface`/`inverseOnSurface`/`inversePrimary`. Calculé : le texte de la
bulle sur son propre fond est excellent (`inverseOnSurface` sur `inverseSurface`, thème clair =
11,554:1 — cohérent par construction, Material inverse les deux ensemble). Mais la bulle elle-même
sur `backgroundDark`, le fond que `call.tsx` force — `inverseSurface` (thème clair) contre
`backgroundDark` — ne vaut que **1,500:1**, sous le seuil non textuel de 3:1 : la bulle se
distingue à peine du fond derrière elle en schéma système clair. C'est un vrai défaut de la même
famille (« composant sur cet écran sans couleur explicite », `AGENTS.md`), mais **pas celui mesuré
dans ce rapport**, et sa correction n'est pas celle de ce plan : `inverseSurface` n'a **aucun autre
consommateur** dans l'application, donc le surcharger dans `theme.ts` — un changement global —
pour un seul site d'usage sur un seul écran est exactement le risque que « Toute tâche qui élargit
un type consommé hors de son propre périmètre est suspecte par construction » signale. La correction
correcte, si elle est un jour engagée, est locale à `call.tsx` (un style explicite posé sur ce
`Snackbar`, comme le reste de la barre d'appel), pas une nouvelle clé dans `theme.ts`. Ce plan ne
l'engage pas.

### Structure des fichiers

| Fichier | Rôle |
| --- | --- |
| `src/ui/theme.ts` (modifié) | `makeTheme()` gagne trois clés : `surfaceVariant`, `onSurfaceVariant`, `outline` |
| `src/ui/theme.spec.ts` (modifié) | sept cas nouveaux, dans le même style que les quatre déjà présents |

---

### Tâche 4 : couvrir `surfaceVariant`, `onSurfaceVariant`, `outline`

**Files :**
- Modify : `src/ui/theme.ts`
- Modify : `src/ui/theme.spec.ts`

**Interfaces :**
- Consumes : `tokens` de `src/ui/tokens` (déjà importé dans `theme.ts`)
- Produces : rien de nouveau — `makeTheme(scheme: ColorScheme): MD3Theme` garde sa signature ;
  seules des valeurs supplémentaires sont fournies pour des clés que `MD3Theme['colors']` porte déjà

- [ ] **Step 1 : écrire les tests qui échouent**

Dans `src/ui/theme.spec.ts`, à la fin du `describe('makeTheme', …)` existant :

```ts
  it.each(['light', 'dark'] as const)(
    "aligne onSurfaceVariant sur onSurface en %s, plutôt que le gris violet MD3 qui échoue en sombre",
    (scheme) => {
      const { colors } = makeTheme(scheme);
      expect(colors.onSurfaceVariant).toBe(colors.onSurface);
    },
  );

  it.each(['light', 'dark'] as const)(
    'respecte le contraste AA de onSurfaceVariant sur surfaceVariant en %s',
    (scheme) => {
      const { colors } = makeTheme(scheme);
      expect(computeContrast(colors.onSurfaceVariant, colors.surfaceVariant)).toBeGreaterThanOrEqual(
        AA_NORMAL_TEXT,
      );
    },
  );

  it.each(['light', 'dark'] as const)('aligne surfaceVariant sur surface en %s', (scheme) => {
    const { colors } = makeTheme(scheme);
    expect(colors.surfaceVariant).toBe(colors.surface);
  });

  it('fixe outline sur tokens.color.muted, dans les deux schémas', () => {
    expect(makeTheme('light').colors.outline).toBe(tokens.color.muted);
    expect(makeTheme('dark').colors.outline).toBe(tokens.color.muted);
  });
```

et ajouter l'import du jeton en tête de fichier :

```diff
 import { makeTheme } from 'src/ui/theme';
+import { tokens } from 'src/ui/tokens';
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/ui/theme`
Attendu : ÉCHEC — `onSurfaceVariant`/`outline` valent encore la référence MD3, pas les jetons.

- [ ] **Step 3 : implémenter**

Dans `src/ui/theme.ts` :

```diff
       onSurface: isDark ? tokens.color.textDark : tokens.color.textLight,
       error: isDark ? tokens.color.dangerDark : tokens.color.dangerLight,
+      surfaceVariant: isDark ? tokens.color.surfaceDark : tokens.color.surfaceLight,
+      onSurfaceVariant: isDark ? tokens.color.textDark : tokens.color.textLight,
+      outline: tokens.color.muted,
     },
```

- [ ] **Step 4 : lancer les tests**

Run : `npx jest src/ui/theme`
Attendu : PASSE (15 cas : 8 existants + 7 nouveaux). Rejoué avant d'écrire cette tâche : 15/15
verts. Le compte `npm test` complet dépend de ce qui est déjà sur la branche : vérifié à 632/632
en partant de la seule branche `main` (625 + ces 7) ; si les tâches du Défaut 1 sont déjà commitées
sur la même branche, attendre 636/636 (629 + ces 7) — la Tâche 4 ne touche aucun fichier du Défaut 1
et n'en change donc pas le compte, quel que soit l'ordre. `tsc --noEmit` et `eslint` propres dans
les deux cas.

- [ ] **Step 5 : éprouver par mutation**

Trois mutations, rejouées avant d'écrire cette tâche :

1. Retirer la ligne `onSurfaceVariant: isDark ? tokens.color.textDark : tokens.color.textLight,` —
   fait rougir les deux tests d'alignement `onSurfaceVariant`/`onSurface` (la clé retombe sur
   `neutralVariant30`/`80` de MD3, différente de `onSurface`).
2. Retirer la ligne `outline: tokens.color.muted,` — fait rougir le test dédié à `outline` (la clé
   retombe sur `neutralVariant50`/`60`).
3. Échanger les deux branches de `surfaceVariant`
   (`isDark ? tokens.color.surfaceLight : tokens.color.surfaceDark`) — fait rougir les deux tests
   d'alignement `surfaceVariant`/`surface` dans les deux schémas à la fois : chacun pointe alors vers
   la valeur du **mauvais** schéma.

Restaurer après chaque.

- [ ] **Step 6 : commit**

```bash
git add src/ui/theme.ts src/ui/theme.spec.ts
git commit -m "fix(ui): Stop three more Material roles from leaking the reference palette"
```

---

## Auto-relecture

- Les deux tables de fichiers touchés (préambule et par défaut) sont cohérentes entre elles et avec
  les tâches : aucun chevauchement.
- Le chemin de manifeste cité au départ par le rapport (`android/app/build/intermediates/merged_manifest/`)
  existe réellement, mais **au singulier** et pour une fusion **intermédiaire** — le manifeste
  réellement empaqueté vit sous `merged_manifests/` (pluriel) après une étape de résolution de
  conflit propre à Expo, non anticipée dans le rapport initial. Les deux chemins sont cités
  explicitement plutôt que de n'en garder qu'un.
- Chaque idiome de test cité (`jest.replaceProperty` sur `OS`, `jest.spyOn(..., 'get')` sur
  `Version`, `PermissionsAndroid.request`) a été exécuté dans ce worktree avant d'être écrit ici ;
  l'échec de `jest.replaceProperty` sur `Version` a été obtenu et son message d'erreur cité
  verbatim, pas résumé.
- Le code des Tâches 2 et 4, et les quatre + sept tests qui l'accompagnent, ont été effectivement
  implémentés, exécutés (629/629 puis 632/632, chacun vérifié seul contre la branche `main`,
  `tsc`/`eslint` propres) et **restaurés** avant l'écriture de ce document — `git status` est revenu
  propre entre chaque vérification et avant ce commit.
- Aucune tâche n'ajoute de chaîne visible : vérifié explicitement pour le défaut 1
  (`audioOutputControl.tsx` ne rend que les catégories présentes) et de nature pour le défaut 2
  (changement de valeurs de couleur, aucun texte nouveau). Les sept locales ne sont donc concernées
  par aucune tâche — écart assumé par rapport au réflexe par défaut « toute tâche touche l'i18n »,
  justifié dans chaque section plutôt qu'omis.
- `android/` généré pour la reproduction du défaut 1 a été supprimé après vérification ; le
  worktree ne porte aucune trace de l'investigation au moment de ce commit.
