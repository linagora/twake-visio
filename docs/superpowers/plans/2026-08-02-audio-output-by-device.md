# Sorties audio par appareil : reprendre le volant à AudioSwitch

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser
> `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour
> dérouler ce plan tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`).
> Les dix tâches sont **strictement ordonnées**, à une exception près, nommée en Tâche 1.

**Goal :** livrer le **périmètre complet** décidé le 2026-08-02 par le propriétaire dans
`docs/superpowers/specs/2026-08-02-audio-output-by-device-design.md` — lister les sorties audio
**par appareil nommé** et permettre d'en **choisir un**, y compris entre deux Bluetooth. Cela veut
dire reprendre la route à AudioSwitch, pas la lire à côté de lui.

**Ce plan applique la décision, il ne la rediscute pas.** La spécification recommandait la lecture
seule ; la recommandation a été écartée en connaissance de cause, et le bloc de décision énumère ce
que cela engage. Ce plan porte donc ce que ce bloc annonce : le **focus audio**, le **mode audio**
et le **cycle de la route** passent chez nous, derrière un plancher **API 31**, pendant que
`minSdkVersion` reste à **24**.

**Architecture :** un **module Expo local**, `modules/twake-audio-devices/`, **Android seulement**,
autolié sans toucher `android/` — qui reste généré et gitignoré. Il expose
`AudioManager.getAvailableCommunicationDevices()` / `setCommunicationDevice()` /
`clearCommunicationDevice()` / `getCommunicationDevice()` (API 31+, non dépréciées), là où
AudioSwitch emploie `startBluetoothSco()` et `setSpeakerphoneOn()` (dépréciées à l'API 34, pour un
manifeste qui vise 36).

**Un seul arbitre par séance.** Quand notre module tient la route, `AudioSwitchManager` n'est
**jamais démarré** : `AudioSession.startAudioSession()` n'est pas appelé du tout. C'est le point
dur du lot, et il tient en une fonction :

```
src/call/connection.ts                    src/call/audioRoute.ts
────────────────────────────────────      ──────────────────────────────────────────────
await startAudioRoute()  ───────────────▶ module natif présent ET isSupported() ?
                                            oui → native.acquire()          [Android ≥ 31]
                                            non → AudioSession.startAudioSession()
await stopAudioRoute()   ───────────────▶ symétrique : release() / stopAudioSession()
```

Sous le plancher, et sur iOS, **rien ne change** : la feuille retombe exactement sur ce qu'elle
affichait avant ce lot, et iOS reste sur `audioRouteControl() === 'system'`, le sélecteur de la
plateforme. `AudioRouteControl` passe de deux à **trois** valeurs — `'devices' | 'menu' | 'system'`.

Le chemin de la donnée :

```
TwakeAudioDevicesModule.kt                src/call/audioDevices.ts        src/screens/room/
──────────────────────────────────        ────────────────────────        ─────────────────────
availableCommunicationDevices             readAudioDevices(unknown)       audioOutputControl.tsx
  → [{ id, type, name }]           ─────▶   → AudioDeviceChoice[]   ────▶   une ligne par appareil
                                            catégorie, nom, ordinal        coche = état CONSTATÉ
communicationDevice?.id            ─────▶ readCurrentAudioDeviceId()
```

| | Fichiers touchés |
| --- | --- |
| Tâche 1 | `docs/superpowers/specs/2026-08-02-audio-output-by-device-design.md` |
| Tâche 2 | `src/call/audioDevices.ts` (créé), `src/call/audioDevices.spec.ts` (créé) |
| Tâche 3 | `modules/twake-audio-devices/` (créé : `expo-module.config.json`, `android/build.gradle`, `…/TwakeAudioDevicesModule.kt`) |
| Tâche 4 | `…/TwakeAudioDevicesModule.kt` |
| Tâche 5 | `src/call/nativeAudioDevices.ts` (créé), `src/call/audioRoute.ts`, `src/call/audioRoute.spec.ts` |
| Tâche 6 | `src/call/connection.ts`, `src/call/connection.spec.ts` |
| Tâche 7 | `src/screens/room/audioOutputControl.tsx`, `…spec.tsx`, les **sept** locales |
| Tâche 8 | `src/screens/room/callControlBar.tsx`, `src/screens/room/call.spec.tsx` |
| Tâche 9 | `docs/superpowers/specs/2026-08-02-audio-output-by-device-design.md` (relevé), corrections éventuelles |
| Tâche 10 | **hors dépôt** : PR sur `livekit/client-sdk-react-native` |

**Tech Stack :** TypeScript strict, React Native 0.86, Expo SDK 57 (`expo-modules-core` 57.0.7),
Kotlin / Expo Modules API, react-native-paper 5.15.3, `@livekit/react-native` 2.12.0, Jest 29 +
`jest-expo` + `@testing-library/react-native` 14. **Aucune dépendance ajoutée.**

---

## Global Constraints

- **`node_modules` est un lien symbolique.** Ne jamais lancer `npm install`, `npm ci`, `npm add`
  ni `npx expo install`. Ce plan n'ajoute aucune dépendance.
- **Barre de qualité, à la fin de CHAQUE tâche** : `npm test`, `npm run typecheck`,
  `npm run lint`, `npx prettier --check .` verts. Le lint conserve **exactement trois
  avertissements préexistants** — `src/auth/oidc.ts:10`, `src/auth/oidc.ts:11`
  (`import/first`), `src/i18n/index.ts:32` (`import/no-named-as-default-member`) —, sans rapport
  avec ce plan : les laisser. Jamais `--no-verify`.
- **Référence de départ** : `3861227`, **936 tests / 62 suites**, `tsc` sans erreur, 3
  avertissements de lint, `prettier --check .` propre. Mesuré le 2026-08-02 dans
  `/Users/mmaudet/work/twake-visio-wt/plan-audio`.
- **Compte attendu à la fin de chaque tâche**, mesuré en exécutant réellement chaque lot :

  | Tâche | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
  |---|---|---|---|---|---|---|---|---|---|---|
  | suites | 62 | **63** | 63 | 63 | 63 | 63 | 63 | 63 | 63 | 63 |
  | tests | 936 | **949** | 949 | 949 | **964** | 964 | **972** | **978** | 978 | 978 |

- **Plancher API 31, plafond `minSdkVersion` 24.** `getAvailableCommunicationDevices()`,
  `setCommunicationDevice()`, `clearCommunicationDevice()`, `getCommunicationDevice()`,
  `addOnCommunicationDeviceChangedListener()` et `removeOnCommunicationDeviceChangedListener()`
  sont toutes **`since=31`** — relevé par lecture de
  `~/Library/Android/sdk/platforms/android-36/data/api-versions.xml`. `Context.getMainExecutor()`
  est **`since=28`**. `app.json` fixe `minSdkVersion: 24`. **Chaque appel doit donc être gardé**,
  et un `if (Build.VERSION.SDK_INT …)` chez l'appelant ne suffit pas au lint Android : les
  fonctions privées portent `@RequiresApi(Build.VERSION_CODES.S)`.
- **Sous le plancher, le comportement d'aujourd'hui, à l'identique.** Pas de branche
  d'interface supplémentaire, pas de message, pas de ligne grisée. `audioRouteControl()` rend
  `'menu'` et tout le chemin AudioSwitch reprend, inchangé.
- **iOS ne bouge pas.** `audioRouteControl()` continue de rendre `'system'`, le sélecteur de la
  plateforme reste la seule surface, et le module natif est **Android seulement**
  (`"platforms": ["android"]`). Aucune tâche de ce plan ne touche `ios/` ni un fichier Swift.
- **`android/` et `ios/` restent gitignorés et générés par `expo prebuild`.** Tout passe par
  `modules/` (autolinking) ou par un plugin de configuration. **Vérifié** : `.gitignore` porte
  `/android`, **ancré**, donc `modules/twake-audio-devices/android/**` est bien suivi
  (`git check-ignore` → non ignoré, exécuté).
- **Ni fork d'AudioSwitch, ni `patch-package`, ni `postinstall`, ni `overrides`/`resolutions`.**
  Interdits par `twake-package-manager-audit` et par la Q3 de la spécification.
- **Aucune chaîne visible en dur.** Sept locales (`en fr es it de vi ru`), toutes remplies avant
  fusion ; `src/i18n/index.spec.ts` échoue si une clé manque quelque part.
- **Pas de style en ligne**, jamais de `style={{…}}` littéral, toujours `StyleSheet.create`
  alimenté par `src/ui/tokens`.
- **Couleur explicite sur tout ce qui est posé sur l'écran de séance**, et **jamais de `disabled`**
  sur cet écran — masquer une commande indisponible plutôt que la griser.
- **Commits** : Conventional Commits, sujet à l'impératif, majuscule initiale autorisée
  (`subject-case` surchargé dans ce dépôt). Un sujet par commit.

---

## Le recensement des conditionnelles, fait AVANT d'écrire les tâches

`AGENTS.md` demande **un test par conditionnelle, dont la fixture rend la condition vraie ET
fausse**, et **de muter la branche, jamais le prédicat qui l'alimente**. Voici le compte, par
motif, avec le nombre de tests que chaque tâche doit livrer.

| Emplacement | Conditionnelle | Tâche | Tests |
|---|---|---|---|
| `readAudioDevices` | `Array.isArray(raw)` | 2 | 2 (non-tableau / tableau) |
| `readAudioDevices` | entrée objet non nulle | 2 | 1 (mélange gardé/jeté) |
| `readAudioDevices` | `id` numérique | 2 | 1 (trois entrées, une seule gardée) |
| `readAudioDevices` | `type` numérique | 2 | 1 (idem) |
| `readAudioDevices` | type connu / inconnu | 2 | 2 (HDMI jeté + les 5 catégories rangées) |
| `readAudioDevices` | `kind === 'bluetooth'` pour garder le nom | 2 | 2 (nom gardé / nom jeté, nom vide) |
| `readAudioDevices` | `totals > 1` pour l'ordinal | 2 | 3 (numéroté / non numéroté / sans nom) |
| `ownsRoute()` | module `!== null` | 5 | 2 (absent → `'menu'`, présent → `'devices'`) |
| `ownsRoute()` | `isSupported()` | 5 | 1 (présent mais faux → `'menu'`) |
| `audioRouteControl` | `Platform.OS === 'ios'` | 5 | 1 (module présent **et** iOS → `'system'`) |
| `startAudioRoute` | branche « nous conduisons » | 5 | 3 |
| `stopAudioRoute` | branche « nous conduisons » | 5 | 2 |
| `listAudioDevices` / `selectAudioDevice` / `clearAudioDevice` / `readCurrentAudioDeviceId` | module `null` | 5 | 4 + 4 |
| `AudioOutputControl` | `mode === 'system'` | 7 | 2 (déjà présent + borne inverse) |
| `AudioOutputControl` | `mode === 'devices'` pour la liste | 7 | 2 |
| `AudioOutputControl` | `device.id === currentDeviceId` | 7 | 1 (deux polarités par `rerender`) |
| `AudioOutputControl` | `device.name ?? nameKey` | 7 | 1 (deux appareils, un de chaque) |
| `AudioOutputControl` | `device.ordinal === null` | 7 | 1 (deux appareils, un de chaque) |
| `AudioOutputControl` | `manual` pour la note | 7 | 1 (`rerender`) |
| `AudioOutputControl` | `mode === 'devices' && manual` | 7 | **3** — une par conjoint : `devices`+`manual` montre, `devices` seul cache, `menu`+`manual` cache |
| `handleOpenAudioOutput` | `routeControl === 'devices'` | 8 | 2 (chemin appareils + l'autre non emprunté) |
| `handleSelectAudioDevice` | le booléen de `setCommunicationDevice` | 8 | 2 (accepté / refusé) |

**Les EFFETS, en plus des décisions.** Chaque `onPress` de ce lot contient **deux** instructions :

| Gestionnaire | Instructions | Assertions dues |
|---|---|---|
| ligne d'appareil | `setVisible(false)` ; `onSelectDevice(device)` | 2 tests distincts (Tâche 7) |
| ligne « automatique » | `setVisible(false)` ; `onAutomatic()` | 2 assertions dans un test (Tâche 7) |
| `handleAutomaticAudioOutput` | `clearAudioDevice()` ; relecture ; `setManualOutput(false)` | 3 assertions (Tâche 8) |

**Mutations exécutées pour valider ces tests** — toutes ont produit **exactement le nombre de rouges
annoncé**, sur une copie jetable, avant d'écrire ce plan :

| Mutation | Rouges | Test qui localise |
|---|---|---|
| `startAudioRoute` : retirer le `return` après `acquire()` | 1 | « prend le volant, et NE démarre PAS AudioSwitch » |
| `ownsRoute()` : retirer `&& native.isSupported()` | 1 | « rend `'menu'` sous le plancher API 31 » |
| `readAudioDevices` : garder le nom pour toutes les catégories | 1 | « garde le nom d'un Bluetooth, et jette celui d'une sortie intégrée » |
| `readAudioDevices` : `ordinal: rank` toujours | 1 | « ne numérote pas quand les libellés diffèrent » |
| `connection.ts` : rappeler `AudioSession` directement | 3 | les trois tests de « session audio » |
| ligne d'appareil : retirer `setVisible(false)` | 1 | « referme la feuille après un choix » |
| ligne « automatique » : retirer `setVisible(false)` | 1 | « rend la route au système, et referme » |
| `mode === 'devices' && manual` → `mode === 'devices'` | 1 | « n'offre le retour à l'automatique qu'une fois un choix manuel fait » |
| `mode === 'devices' && manual` → `manual` | 1 | « n'offre PAS le retour à l'automatique, même après un choix manuel » |
| titre : toujours `t(nameKey)` | 2 | « affiche le nom lu » + « numérote » |
| titre : ignorer l'ordinal | 1 | « numérote quand l'appareil porte un ordinal » |
| coche : `device.kind === chosen` au lieu de `device.id === currentDeviceId` | 2 | « coche l'appareil CONSTATÉ » + « dessine un vrai glyphe » |

---

## Ce que Jest ne peut PAS tester ici, et qui doit l'être sur appareil

C'est le premier code natif de ce dépôt. **Nommer la frontière est une obligation du plan, pas une
précaution.**

**Jest ne voit rien du natif.** Mesuré : sous `jest-expo`,
`requireOptionalNativeModule('TwakeAudioDevices')` rend **`null`**, sans lever et sans avertir
(`globalThis.expo` existe, `globalThis.expo.modules.TwakeAudioDevices` non). Tout ce que Jest peut
prouver de ce lot est donc :

- le **parsing** de ce que le natif rend (Tâche 2) ;
- l'**aiguillage** entre les deux propriétaires de route (Tâche 5) ;
- le **câblage** de l'écran sur des doubles (Tâches 7 et 8).

**Ce qu'aucun test de ce dépôt ne peut prouver, et qui doit être constaté sur un appareil Android
12 ou plus :**

| Ce qui n'est pas testable | Pourquoi | Où c'est vérifié |
|---|---|---|
| que le Kotlin **compile** | aucune tâche Gradle ne tourne dans la barre | Tâche 3, étape 1 |
| que l'autolinking **lie** le module dans le binaire | `expo prebuild` + Gradle | Tâche 3, étape 6 |
| que `setCommunicationDevice()` **route** réellement le son | RNTL ne rastérise ni ne route rien | Tâches 4 et 9 |
| que le **focus audio** est bien pris et rendu | idem | Tâches 4 et 9 |
| que le **mode `MODE_IN_COMMUNICATION`** laisse le micro Bluetooth fonctionner | idem | Tâche 9 |
| que `getProductName()` rend un vrai nom **après un refus de `BLUETOOTH_CONNECT`** | permission d'exécution | Tâche 9 |
| que rien ne **rebascule tout seul** en cours de séance | c'est précisément le risque des deux arbitres | Tâche 9 |
| le comportement à **deux Bluetooth simultanés** | jamais mesuré, cas du propriétaire | **Tâche 1** |

> **Aucun test ne peut prouver qu'un texte est lisible** : RNTL ne rastérise rien. Les assertions de
> couleur de ce plan gardent une seule chose — que la **couleur explicite n'a pas été retirée**. La
> lisibilité, elle, se constate sur l'appareil (Tâche 9).

---

## Tâche 1 : Mesurer les deux Bluetooth, et écrire le relevé dans la spécification

**Cette tâche ne touche aucun code.** Elle produit une **mesure**, et cette mesure est un
garde-fou : elle dira si la route que nous reprenons se comporte **mieux ou moins bien** que celle
que nous remplaçons. Sans elle, personne ne pourra le savoir après coup.

La spécification la nomme comme « la mesure manquante la plus importante du document », et le bloc
de décision précise qu'elle n'est **plus un préalable** : le périmètre complet est décidé quoi
qu'elle dise. **Elle reste due**, et c'est pourquoi elle est la première tâche : le relevé doit
exister **avant** que le comportement de référence ne soit remplacé, sinon il n'est plus
reproductible.

**Files:**

- Modify: `docs/superpowers/specs/2026-08-02-audio-output-by-device-design.md`

**Interfaces:**

- Consomme : rien.
- Produit : une section « Relevé du 2026-08-XX » dans la spécification, avec un tableau de
  résultats. **La seule tâche qu'elle peut invalider est la Tâche 9**, dont la grille de
  comparaison « avant / après » s'appuie sur ces valeurs. Elle ne bloque aucune tâche de code.

**Ce que la mesure peut changer, et qui décide.** Si Android choisit déjà correctement à deux
appareils — la voiture quand on démarre, le casque sinon —, alors la moitié « choisir » du besoin
perd son argument, et **seul le propriétaire peut décider d'y renoncer**. Un implémenteur qui
lirait ce résultat **ne doit pas** réduire le périmètre de sa propre initiative : il **le
signale**, et il continue. Le relevé est une donnée, pas une autorisation.

- [ ] **Étape 1 : Construire une version de référence, avant tout code de ce plan**

Sur `3861227`, sans aucune tâche appliquée :

```bash
cd /Users/mmaudet/work/twake-visio-wt/plan-audio
npx expo prebuild --platform android --clean
npx expo run:android --device
```

Le simulateur ne convient pas : **l'iOS Simulator ne publie ni caméra ni micro**, et l'émulateur
Android n'a pas de pile Bluetooth utile. Il faut un téléphone.

- [ ] **Étape 2 : Dérouler le protocole, dans cet ordre exact**

Deux appareils Bluetooth, appairés tous les deux au téléphone. Le cas du propriétaire : un casque
(Jabra) et une Tesla. N'importe quel autre kit mains-libres HFP vaut la Tesla — **il n'y a aucun
code spécifique à un modèle, et il ne faut surtout pas en écrire**.

1. **Casque d'abord.** Casque allumé et connecté ; entrer en séance ; noter où sort le son.
   Démarrer la voiture (ou allumer le second appareil) **pendant** la séance ; noter si le son
   suit, et vers lequel.
2. **Voiture d'abord.** Quitter, couper les deux. Voiture connectée ; entrer en séance ; noter.
   Allumer le casque **pendant** la séance ; noter.
3. **Extinction en séance.** Les deux connectés, en séance : éteindre celui qui reçoit le son ;
   noter vers quoi le son retombe. Puis rallumer ; noter.
4. **Ce que la feuille affiche**, à chacun de ces six instants : combien de lignes, laquelle est
   cochée, quel libellé.

- [ ] **Étape 3 : Écrire le relevé dans la spécification**

Ajouter, **juste avant** la section `## Ce que je n'ai pas pu établir`, une section de cette
forme — et **retirer de cette dernière la première puce**, celle qui déclare le cas non mesuré,
puisqu'elle ne l'est alors plus :

```markdown
## Relevé du 2026-08-XX : deux appareils Bluetooth simultanés **[V, sur appareil]**

Appareil : <modèle>, Android <version> (API <n>). Appareils Bluetooth : <A>, <B>.
Version de l'application : `3861227`, avant toute tâche de
`docs/superpowers/plans/2026-08-02-audio-output-by-device.md`.

| Scénario | Son sortant | Lignes dans la feuille | Ligne cochée |
|---|---|---|---|
| A connecté, entrée en séance | | | |
| puis B connecté en séance | | | |
| B connecté, entrée en séance | | | |
| puis A connecté en séance | | | |
| les deux, extinction de celui qui reçoit | | | |
| puis rallumage | | | |

**Ce que ça dit** : <une phrase — Android choisit-il correctement, et selon quelle règle
apparente ?>

**Ce que ça ne dit pas** : la règle exacte reste celle du système ; `startBluetoothSco()` ne prend
aucun argument, et aucune couche au-dessus ne désigne l'appareil. Ce relevé décrit un
comportement observé sur un appareil, pas un contrat.
```

- [ ] **Étape 4 : Vérifier la barre**

`docs/superpowers` est dans `.prettierignore` : le document n'est pas reformaté, et la barre est
inchangée.

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
```

Attendu : **62 suites / 936 tests**, `tsc` muet, **3 avertissements** de lint, prettier propre.

- [ ] **Étape 5 : Committer**

```bash
git add docs/superpowers/specs/2026-08-02-audio-output-by-device-design.md
git commit -m "docs(spec): Record the two-Bluetooth measurement taken on device"
```

---

## Tâche 2 : Le domaine pur — `readAudioDevices`

Le seul endroit de ce lot qui soit **entièrement** testable, et donc celui qui porte la logique.
Le module natif ne fait que transporter : c'est ici qu'on décide de la catégorie, du libellé, de
l'ordre et de la numérotation.

**Files:**

- Create: `src/call/audioDevices.ts`
- Create: `src/call/audioDevices.spec.ts`

**Interfaces:**

- Consomme : `AUDIO_OUTPUT_ORDER`, `audioOutputNameKey`, `AudioOutputKind`, `AudioOutputNameKey`
  de `src/call/devices.ts` — inchangés.
- Produit :
  ```ts
  export type AudioDeviceChoice = {
    readonly id: number;
    readonly kind: AudioOutputKind;
    readonly name: string | null;
    readonly nameKey: AudioOutputNameKey;
    readonly ordinal: number | null;
  };
  export function readAudioDevices(raw: unknown): readonly AudioDeviceChoice[];
  ```
  Les Tâches 5, 7 et 8 en dépendent.

**Les constantes ne sont pas recopiées de mémoire.** Les valeurs de `AudioDeviceInfo.TYPE_*` ont été
relevées par `javap -p -constants` sur `android-36/android.jar` :

```
TYPE_BUILTIN_EARPIECE = 1     TYPE_WIRED_HEADSET   = 3     TYPE_BLUETOOTH_SCO  = 7
TYPE_BUILTIN_SPEAKER  = 2     TYPE_WIRED_HEADPHONES= 4     TYPE_BLUETOOTH_A2DP = 8
TYPE_USB_DEVICE       = 11    TYPE_USB_HEADSET     = 22    TYPE_HEARING_AID    = 23
TYPE_BUILTIN_SPEAKER_SAFE = 24   TYPE_BLE_HEADSET  = 26    TYPE_BLE_SPEAKER    = 27
TYPE_HDMI             = 9     (jeté)
```

**Pourquoi le nom n'est gardé QUE pour le Bluetooth.** `AudioDeviceInfo.getProductName()` rend, pour
une sortie intégrée, le nom du **produit**, c'est-à-dire le modèle du téléphone. Une ligne
« Pixel 8 » à la place de « Haut-parleur » serait pire que la catégorie. C'est exactement la
recommandation Q2 de la spécification, et c'est une **conditionnelle**, donc elle a son test dans
les deux polarités. **[S]** — la lecture de la documentation Android ; à confirmer en Tâche 9.

- [ ] **Étape 1 : Écrire la spec qui échoue**

Créer `src/call/audioDevices.spec.ts` :

```ts
import { readAudioDevices } from 'src/call/audioDevices';

// Les constantes `AudioDeviceInfo.TYPE_*`, relevées par `javap -constants` sur
// `android-36/android.jar` — jamais recopiées de mémoire.
const TYPE_BUILTIN_EARPIECE = 1;
const TYPE_BUILTIN_SPEAKER = 2;
const TYPE_WIRED_HEADSET = 3;
const TYPE_BLUETOOTH_SCO = 7;
const TYPE_HDMI = 9;
const TYPE_BLE_HEADSET = 26;

describe('readAudioDevices', () => {
  it("rend une liste vide quand ce n'est pas un tableau", () => {
    expect(readAudioDevices(null)).toEqual([]);
    expect(readAudioDevices(undefined)).toEqual([]);
    expect(readAudioDevices({ id: 1, type: TYPE_BLUETOOTH_SCO })).toEqual([]);
  });

  it('lit un tableau vide sans broncher', () => {
    expect(readAudioDevices([])).toEqual([]);
  });

  it('jette les entrées qui ne sont pas des objets, et garde les autres', () => {
    const list = readAudioDevices([
      'bluetooth',
      null,
      { id: 7, type: TYPE_BLUETOOTH_SCO, name: 'Tesla Model 3' },
    ]);

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(7);
  });

  it('jette une entrée sans `id` numérique, et garde celle qui en a un', () => {
    const list = readAudioDevices([
      { type: TYPE_BLUETOOTH_SCO, name: 'Sans id' },
      { id: '9', type: TYPE_BLUETOOTH_SCO, name: 'Id texte' },
      { id: 9, type: TYPE_BLUETOOTH_SCO, name: 'Jabra Evolve2' },
    ]);

    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Jabra Evolve2');
  });

  it('jette une entrée sans `type` numérique, et garde celle qui en a un', () => {
    const list = readAudioDevices([
      { id: 1, name: 'Sans type' },
      { id: 2, type: 'bluetooth', name: 'Type texte' },
      { id: 3, type: TYPE_BLUETOOTH_SCO, name: 'Jabra Evolve2' },
    ]);

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(3);
  });

  it('jette un type que la feuille ne sait pas présenter, et garde ceux qu’elle sait', () => {
    // HDMI est bien une sortie, ce n'est pas une sortie de séance. La borne
    // dans les deux sens : sans l'entrée gardée, une implémentation qui rendrait
    // toujours `[]` passerait.
    const list = readAudioDevices([
      { id: 1, type: TYPE_HDMI, name: 'Téléviseur' },
      { id: 2, type: TYPE_BUILTIN_SPEAKER, name: 'Pixel 8' },
    ]);

    expect(list).toHaveLength(1);
    expect(list[0]?.kind).toBe('speaker');
  });

  it('range chaque type sous sa catégorie', () => {
    const list = readAudioDevices([
      { id: 1, type: TYPE_BUILTIN_EARPIECE, name: 'Pixel 8' },
      { id: 2, type: TYPE_BUILTIN_SPEAKER, name: 'Pixel 8' },
      { id: 3, type: TYPE_WIRED_HEADSET, name: 'Pixel 8' },
      { id: 4, type: TYPE_BLUETOOTH_SCO, name: 'Tesla Model 3' },
      { id: 5, type: TYPE_BLE_HEADSET, name: 'Jabra Evolve2' },
    ]);

    expect(list.map((d) => [d.id, d.kind])).toEqual([
      [4, 'bluetooth'],
      [5, 'bluetooth'],
      [3, 'headset'],
      [2, 'speaker'],
      [1, 'earpiece'],
    ]);
  });

  it("garde le nom d'un Bluetooth, et jette celui d'une sortie intégrée", () => {
    // `getProductName()` rend le modèle du téléphone pour les sorties
    // intégrées : « Pixel 8 » à la place de « Haut-parleur » serait pire que
    // la catégorie. Les deux polarités, sinon un `name` toujours nul passerait.
    const list = readAudioDevices([
      { id: 1, type: TYPE_BLUETOOTH_SCO, name: 'Tesla Model 3' },
      { id: 2, type: TYPE_BUILTIN_SPEAKER, name: 'Pixel 8' },
    ]);

    expect(list[0]?.name).toBe('Tesla Model 3');
    expect(list[1]?.name).toBeNull();
  });

  it('retombe sur la catégorie quand le nom Bluetooth est vide ou absent', () => {
    const list = readAudioDevices([
      { id: 1, type: TYPE_BLUETOOTH_SCO, name: '   ' },
      { id: 2, type: TYPE_BLE_HEADSET },
    ]);

    expect(list[0]?.name).toBeNull();
    expect(list[1]?.name).toBeNull();
  });

  it('porte toujours la clé de repli de sa catégorie', () => {
    const list = readAudioDevices([
      { id: 1, type: TYPE_BLUETOOTH_SCO, name: 'Tesla Model 3' },
      { id: 2, type: TYPE_BUILTIN_EARPIECE, name: 'Pixel 8' },
    ]);

    expect(list[0]?.nameKey).toBe('call.output.bluetooth');
    expect(list[1]?.nameKey).toBe('call.output.earpiece');
  });

  it('numérote deux appareils qui afficheraient le même libellé', () => {
    const list = readAudioDevices([
      { id: 1, type: TYPE_BLUETOOTH_SCO, name: 'Jabra Evolve2' },
      { id: 2, type: TYPE_BLE_HEADSET, name: 'Jabra Evolve2' },
    ]);

    expect(list.map((d) => d.ordinal)).toEqual([1, 2]);
  });

  it('ne numérote pas quand les libellés diffèrent', () => {
    // L'autre polarité de la même conditionnelle : sans elle, une
    // numérotation systématique donnerait « Tesla Model 3 1 ».
    const list = readAudioDevices([
      { id: 1, type: TYPE_BLUETOOTH_SCO, name: 'Tesla Model 3' },
      { id: 2, type: TYPE_BLE_HEADSET, name: 'Jabra Evolve2' },
    ]);

    expect(list.map((d) => d.ordinal)).toEqual([null, null]);
  });

  it('numérote deux sorties sans nom de la même catégorie', () => {
    // Deux Bluetooth dont aucun n'a de nom lisible : le repli est identique,
    // donc les deux lignes seraient indiscernables sans ordinal.
    const list = readAudioDevices([
      { id: 1, type: TYPE_BLUETOOTH_SCO },
      { id: 2, type: TYPE_BLE_HEADSET },
    ]);

    expect(list.map((d) => d.ordinal)).toEqual([1, 2]);
  });
});
```

- [ ] **Étape 2 : Exécuter, et vérifier que ça échoue POUR LA BONNE RAISON**

```bash
npx jest src/call/audioDevices.spec.ts
```

**Exécuté contre `3861227`** avant d'écrire ce plan. Attendu, mot pour mot :

```
● Test suite failed to run
  Configuration error:
  Could not locate module src/call/audioDevices mapped as:
  <rootDir>/src/$1.
```

Si le message est différent — un `TypeError`, une assertion qui échoue —, **arrêter** : la spec est
fautive, pas absente.

- [ ] **Étape 3 : Écrire l'implémentation minimale**

Créer `src/call/audioDevices.ts` :

```ts
import {
  AUDIO_OUTPUT_ORDER,
  audioOutputNameKey,
  type AudioOutputKind,
  type AudioOutputNameKey,
} from 'src/call/devices';

const KIND_BY_TYPE: Readonly<Record<number, AudioOutputKind>> = {
  1: 'earpiece',
  2: 'speaker',
  24: 'speaker',
  3: 'headset',
  4: 'headset',
  11: 'headset',
  22: 'headset',
  7: 'bluetooth',
  8: 'bluetooth',
  23: 'bluetooth',
  26: 'bluetooth',
  27: 'bluetooth',
};

export type AudioDeviceChoice = {
  readonly id: number;
  readonly kind: AudioOutputKind;
  readonly name: string | null;
  readonly nameKey: AudioOutputNameKey;
  readonly ordinal: number | null;
};

type Parsed = { readonly id: number; readonly kind: AudioOutputKind; readonly name: string | null };

function labelOf(device: Parsed): string {
  return device.name ?? device.kind;
}

export function readAudioDevices(raw: unknown): readonly AudioDeviceChoice[] {
  if (!Array.isArray(raw)) return [];
  const entries: readonly unknown[] = raw;

  const parsed: Parsed[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    if (!('id' in entry) || typeof entry.id !== 'number') continue;
    if (!('type' in entry) || typeof entry.type !== 'number') continue;
    const kind = KIND_BY_TYPE[entry.type];
    if (kind === undefined) continue;
    const given = 'name' in entry && typeof entry.name === 'string' ? entry.name.trim() : '';
    parsed.push({
      id: entry.id,
      kind,
      name: kind === 'bluetooth' && given.length > 0 ? given : null,
    });
  }

  const ordered = AUDIO_OUTPUT_ORDER.flatMap((kind) =>
    parsed.filter((device) => device.kind === kind),
  );

  const totals = new Map<string, number>();
  for (const device of ordered) {
    totals.set(labelOf(device), (totals.get(labelOf(device)) ?? 0) + 1);
  }

  const running = new Map<string, number>();
  return ordered.map((device) => {
    const label = labelOf(device);
    const rank = (running.get(label) ?? 0) + 1;
    running.set(label, rank);
    return {
      id: device.id,
      kind: device.kind,
      name: device.name,
      nameKey: audioOutputNameKey(device.kind),
      ordinal: (totals.get(label) ?? 0) > 1 ? rank : null,
    };
  });
}
```

Trois notes, chacune vérifiée en exécutant :

1. `noUncheckedIndexedAccess: true` est actif : `KIND_BY_TYPE[entry.type]` est
   `AudioOutputKind | undefined`, et le `if (kind === undefined)` n'est pas décoratif.
2. Le narrowing se fait **sans assertion de type**, par `typeof` et par l'opérateur `in` — même
   discipline que `readCameras` juste en dessous dans `src/call/devices.ts`. Le dépôt interdit
   `x as unknown as T` hors des specs.
3. La numérotation regroupe par **libellé affiché**, pas par catégorie : deux Bluetooth de noms
   différents ne sont pas numérotés, deux Bluetooth sans nom le sont. C'est le cas que le test
   « numérote deux sorties sans nom » couvre, et il n'est pas hypothétique — c'est ce que donne un
   refus de `BLUETOOTH_CONNECT`.

- [ ] **Étape 4 : Exécuter et vérifier que ça passe**

```bash
npx jest src/call/audioDevices.spec.ts
```

**Exécuté** : `13 passed, 13 total`.

- [ ] **Étape 5 : Muter, pour vérifier que les tests localisent**

Deux mutations, **exécutées** sur une copie jetable :

| Mutation | Rouges obtenus |
|---|---|
| `name: given.length > 0 ? given : null` (retirer `kind === 'bluetooth' &&`) | **1** — « garde le nom d'un Bluetooth » |
| `ordinal: rank` (retirer le ternaire) | **1** — « ne numérote pas quand les libellés diffèrent » |

Remettre le code en état après chaque mutation.

- [ ] **Étape 6 : Vérifier la barre**

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
```

Attendu : **63 suites / 949 tests**, `tsc` muet, **3 avertissements**, prettier propre.

- [ ] **Étape 7 : Committer**

```bash
git add src/call/audioDevices.ts src/call/audioDevices.spec.ts
git commit -m "feat(call): Read audio outputs as named devices rather than categories"
```

---

## Tâche 3 : Le module Expo local, en lecture seule

**Aucun test Jest ne peut valider cette tâche.** Elle est reviewable — le Kotlin se lit —, et elle
est vérifiable **par une compilation** et **par une exécution sur appareil**. Les deux sont des
étapes de cette tâche, et elles ne sont pas facultatives.

Elle est séparée de la Tâche 4 pour une raison précise : **un relecteur peut approuver la lecture et
refuser l'écriture.** C'est très exactement la ligne de faille que la Q1 de la spécification décrit,
et c'est aussi la recommandation qu'elle faisait. La Tâche 3 est le périmètre recommandé ; la
Tâche 4 est le périmètre décidé.

**Files:**

- Create: `modules/twake-audio-devices/expo-module.config.json`
- Create: `modules/twake-audio-devices/android/build.gradle`
- Create: `modules/twake-audio-devices/android/src/main/java/com/linagora/twakevisio/audiodevices/TwakeAudioDevicesModule.kt`

**Interfaces:**

- Consomme : `expo.modules.kotlin.modules.Module` (`expo-modules-core` 57.0.7).
- Produit : un module natif **nommé `TwakeAudioDevices`** exposant `isSupported(): Boolean`,
  `listDevices(): List<Map<String, Any>>` (clés `id: Int`, `type: Int`, `name: String`),
  `getCurrentDeviceId(): Int?`. La Tâche 5 s'y lie ; la Tâche 4 l'étend.

**Le mécanisme de liaison, vérifié en l'exécutant.** `expo-modules-autolinking` cherche les modules
locaux dans `./modules` par défaut (`build/commands/autolinkingOptions.js:170-172`). Un dossier y
est reconnu comme module Expo dès qu'il porte un `expo-module.config.json`
(`EXPO_MODULE_CONFIG_FILENAMES`, `ExpoModuleConfig.js:176`) déclarant la plateforme ; le projet
Android est trouvé par la présence d'un `android/build.gradle` (`platforms/android/android.js:23-25`).
**Ni `package.json` ni point d'entrée JavaScript ne sont requis** : le nom du projet retombe alors
sur le nom du dossier. **Exécuté** :

```bash
npx expo-modules-autolinking resolve -p android --json
```

→ le module apparaît, avec `"name": "twake-audio-devices"`, `"sourceDir": ".../modules/twake-audio-devices/android"`,
`"classifier": "com.linagora.twakevisio.audiodevices.TwakeAudioDevicesModule"`.

**Le JavaScript ne vit PAS dans `modules/`**, et c'est délibéré : la liaison typée est un fichier
de `src/` (Tâche 5), lintée, typée et testée comme le reste. `modules/` ne contient que du natif.
Conséquence vérifiée : `prettier --file-info` rend `"ignored": true` pour `.kt` et `.gradle`
(aucun analyseur), et `"inferredParser": "json"` pour `expo-module.config.json` — **ce dernier doit
donc être au format Prettier**.

- [ ] **Étape 1 : Créer la configuration du module**

`modules/twake-audio-devices/expo-module.config.json` :

```json
{
  "platforms": ["android"],
  "android": {
    "modules": ["com.linagora.twakevisio.audiodevices.TwakeAudioDevicesModule"]
  }
}
```

`modules/twake-audio-devices/android/build.gradle` :

```gradle
apply plugin: 'com.android.library'
apply plugin: 'expo-module-gradle-plugin'

group = 'com.linagora.twakevisio.audiodevices'
version = '0.1.0'

android {
  namespace 'com.linagora.twakevisio.audiodevices'
  defaultConfig {
    versionCode 1
    versionName '0.1.0'
  }
  lint {
    abortOnError true
  }
}
```

`expo-module-gradle-plugin` est le plugin qu'emploient les modules Expo publiés (voir
`node_modules/expo-crypto/android/build.gradle`) ; il est présent dans l'installation
(`node_modules/expo-modules-core/expo-module-gradle-plugin/`). `abortOnError true` est **voulu** :
c'est le lint `NewApi` qui attrapera un appel d'API 31 laissé sans garde, et un lint qui n'échoue
pas ne sert à rien ici.

- [ ] **Étape 2 : Vérifier que l'autolinking voit le module**

```bash
npx expo-modules-autolinking resolve -p android --json | python3 -c "
import sys,json; d=json.load(sys.stdin)
print([m['packageName'] for m in d['modules'] if 'twake' in m['packageName']])"
```

Attendu : `['twake-audio-devices']`. Si la liste est vide, rien de ce qui suit ne servira.

- [ ] **Étape 3 : Vérifier que git suivra bien le dossier `android/` du module**

```bash
git check-ignore -v modules/twake-audio-devices/android/build.gradle; echo "exit=$?"
```

Attendu : **aucune sortie**, `exit=1` — c'est-à-dire **non ignoré**. `.gitignore` porte `/android`,
**ancré à la racine**, donc `modules/*/android` est suivi. **Vérifié en l'exécutant.** Si un jour
cette ligne perdait son `/`, tout ce lot disparaîtrait du dépôt sans bruit.

- [ ] **Étape 4 : Écrire le module Kotlin, en lecture seule**

`modules/twake-audio-devices/android/src/main/java/com/linagora/twakevisio/audiodevices/TwakeAudioDevicesModule.kt` :

```kotlin
package com.linagora.twakevisio.audiodevices

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Les quatre catégories que la feuille sait présenter, et rien d'autre. HDMI,
// TÉLÉPHONIE, REMOTE_SUBMIX… sont bien des sorties, ce ne sont pas des sorties
// de séance. Le tri final est fait côté JavaScript (`src/call/audioDevices.ts`),
// qui est le seul endroit testable : ce module ne fait que transporter.
private val SUPPORTED_TYPES = intArrayOf(
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
    AudioDeviceInfo.TYPE_WIRED_HEADSET,
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
    AudioDeviceInfo.TYPE_USB_DEVICE,
    AudioDeviceInfo.TYPE_USB_HEADSET,
    AudioDeviceInfo.TYPE_HEARING_AID,
    AudioDeviceInfo.TYPE_BLE_HEADSET,
    AudioDeviceInfo.TYPE_BLE_SPEAKER,
)

/**
 * Lecture des sorties audio de la séance, par APPAREIL, sur Android 12 (API 31)
 * et au-delà.
 *
 * Ce que ce module rend et qu'aucune API n'offrait au périmètre A : le NOM réel
 * de chaque appareil, un par appareil et non un par catégorie, et l'état
 * CONSTATÉ de la route. `AudioSwitch` réduit chaque appareil à sa classe
 * (`AudioDeviceKind.fromAudioDevice`), et son ensemble trié absorbe le second
 * Bluetooth — vérifié dans le bytecode : `AudioDevicePriorityComparator.compare`
 * rend `0` dès que les deux classes sont égales, et `availableUniqueAudioDevices`
 * est un `SortedSet`.
 *
 * La TÂCHE 4 y ajoute l'écriture. Tant qu'elle n'est pas là, ce module ne change
 * aucune route : il lit.
 */
class TwakeAudioDevicesModule : Module() {
    private val audioManager: AudioManager
        get() {
            val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
            return context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        }

    override fun definition() = ModuleDefinition {
        Name("TwakeAudioDevices")

        // Le seul point de vérité du plancher. Le JavaScript ne teste jamais
        // `Platform.Version` lui-même : une seule source, côté natif.
        Function("isSupported") {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        }

        AsyncFunction("listDevices") {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                return@AsyncFunction emptyList<Map<String, Any>>()
            }
            audioManager.availableCommunicationDevices
                .filter { SUPPORTED_TYPES.contains(it.type) }
                .map { info ->
                    mapOf(
                        "id" to info.id,
                        "type" to info.type,
                        // `getProductName()` rend le modèle du TÉLÉPHONE pour
                        // les sorties intégrées : c'est `audioDevices.ts` qui
                        // décide de ne le garder que pour le Bluetooth.
                        "name" to info.productName.toString(),
                    )
                }
        }

        AsyncFunction("getCurrentDeviceId") {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction null
            audioManager.communicationDevice?.id
        }
    }
}
```

Signatures vérifiées dans `android-36/api-versions.xml`, pas de mémoire :
`getAvailableCommunicationDevices()` → `List<AudioDeviceInfo>`, `since=31` ;
`getCommunicationDevice()` → `AudioDeviceInfo`, `since=31` ; `AudioDeviceInfo.getProductName()` →
`CharSequence`, disponible depuis la classe (API 23) ; `Exceptions.ReactContextLost` existe bien
(`expo-modules-core/android/…/exception/CommonExceptions.kt:26`).

- [ ] **Étape 5 : Vérifier la barre — le natif ne doit RIEN casser**

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
```

Attendu : **63 suites / 949 tests** (inchangé depuis la Tâche 2), `tsc` muet, **3 avertissements**,
prettier propre. **Exécuté** : avec `modules/` en place, le compte est bien inchangé — `tsc`
n'inclut que `**/*.ts(x)` et il n'y en a aucun sous `modules/`, eslint non plus, et prettier ne
connaît ni `.kt` ni `.gradle`.

- [ ] **Étape 6 : Compiler, et vérifier la liaison sur appareil**

**Ce que Jest ne peut pas faire.**

```bash
npx expo prebuild --platform android --clean
npx expo run:android --device
```

Attendu : la compilation Kotlin **passe**, le lint Android ne signale **aucun `NewApi`**, et le
module est lié. À vérifier depuis l'application, en séance :

- [ ] La compilation aboutit sans erreur Kotlin ni `NewApi`.
- [ ] Sur un appareil Android ≥ 12, `requireOptionalNativeModule('TwakeAudioDevices')` ne rend
      **pas** `null` — le plus simple est de le constater en Tâche 5, quand la liaison existe ; si
      cette tâche est revue seule, un `console.warn` temporaire suffit, **retiré avant le commit**
      (`no-console` autorise `warn`, mais un `warn` de sonde n'a rien à faire dans un commit).
- [ ] `android/` n'est **pas** apparu dans `git status` (il est gitignoré, et il doit le rester).

- [ ] **Étape 7 : Committer**

```bash
git add modules/
git commit -m "feat(audio): Add a local Expo module that reads audio outputs by device"
```

---

## Tâche 4 : Le module prend le volant — focus, mode, route, retour à l'automatique

C'est **la** tâche que la spécification recommandait de ne pas faire, et que le propriétaire a
décidé de faire. Elle est isolée pour cette raison : elle est refusable seule.

**Ce qu'elle engage, mot pour mot depuis le bloc de décision** : porter le **focus audio**, le
**mode audio** et le **cycle de la route** d'une application de visioconférence en production.
Deux composants qui arbitrent le même canal restent la cause classique du « le son rebascule tout
seul » — et **c'est invisible en test**.

**Files:**

- Modify: `modules/twake-audio-devices/android/src/main/java/com/linagora/twakevisio/audiodevices/TwakeAudioDevicesModule.kt`

**Interfaces:**

- Consomme : la coquille de la Tâche 3.
- Produit : `acquire()`, `release()`, `selectDevice(id: Int): Boolean`, `clearDevice()`, et
  l'événement `onDevicesChanged`. La Tâche 5 s'y lie.

**Pourquoi remplacer et non cohabiter.** `AbstractAudioSwitch.shouldHandleAudioRouting()` rend
`forceHandleAudioRouting || audioMode == MODE_IN_COMMUNICATION || audioMode == MODE_IN_CALL`. Le
seul levier exposé par le pont est `configureAudio({android:{audioTypeOptions:{audioMode:'normal'}}})`,
qui couperait le routage d'AudioSwitch **et** sortirait la séance du mode communication — celui-là
même que la documentation de LiveKit désigne comme la condition pour que les micros Bluetooth
fonctionnent (`AudioSession.ts:127-136`). Échange perdant. Donc : **AudioSwitch n'est pas démarré**,
et c'est la Tâche 6 qui le garantit, en JavaScript, à l'unique endroit qui l'appelait.

**Ce qu'AudioSwitch faisait et que ce module doit refaire** — relevé dans
`AudioSwitchManager.java:127-148` et dans le bytecode d'`AbstractAudioSwitch` :

| Ce qu'AudioSwitch posait | Où c'est repris ici |
|---|---|
| `manageAudioFocus` → `requestAudioFocus` / `abandonAudioFocusRequest` | `acquireRoute()` / `releaseRoute()` |
| `audioMode = MODE_IN_COMMUNICATION` | `acquireRoute()`, restauré par `releaseRoute()` |
| `USAGE_VOICE_COMMUNICATION` + `CONTENT_TYPE_SPEECH` | `AudioAttributes` de la demande de focus |
| le cycle SCO (`startBluetoothSco` / `stopBluetoothSco`) | **remplacé** par `setCommunicationDevice` / `clearCommunicationDevice` |
| la préférence automatique | **rendue au système** : `clearCommunicationDevice()` |

**Un vrai gain, à noter parce qu'il justifie une partie du prix.** `setUserSelectedAudioDevice` est
`protected` dans `AbstractAudioSwitch` (`javap`) : **aucun appelant extérieur ne peut remettre le
champ à `null`**, donc il n'existe, ni en JavaScript ni en Java, aucune valeur qui signifie
« reviens en automatique ». `clearCommunicationDevice()`, elle, le fait. C'est la commande que la
Tâche 7 rendra visible.

- [ ] **Étape 1 : Ajouter les imports et l'état de la route**

Dans le même fichier, en tête :

```kotlin
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import androidx.annotation.RequiresApi
```

et, en tête de classe :

```kotlin
private const val DEVICES_CHANGED = "onDevicesChanged"
```

(au niveau du fichier, à côté de `SUPPORTED_TYPES`), puis, dans la classe :

```kotlin
    private var focusRequest: AudioFocusRequest? = null
    private var previousMode: Int = AudioManager.MODE_NORMAL
    private var deviceListener: AudioManager.OnCommunicationDeviceChangedListener? = null

    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
```

- [ ] **Étape 2 : Déclarer l'événement et les quatre fonctions, dans `definition()`**

Sous `Name("TwakeAudioDevices")`, ajouter `Events(DEVICES_CHANGED)`, puis, à la suite des deux
fonctions de lecture :

```kotlin
        AsyncFunction("acquire") {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction
            acquireRoute()
        }

        AsyncFunction("release") {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction
            releaseRoute()
        }

        AsyncFunction("selectDevice") { id: Int ->
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction false
            val target = audioManager.availableCommunicationDevices.firstOrNull { it.id == id }
                ?: return@AsyncFunction false
            // Le booléen est RENDU tel quel : un refus du système doit remonter
            // jusqu'à l'écran, qui laisse alors la coche où elle était plutôt
            // que d'annoncer une route qui n'a pas pris.
            audioManager.setCommunicationDevice(target)
        }

        AsyncFunction("clearDevice") {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction
            audioManager.clearCommunicationDevice()
        }

        // Un démontage de l'application ne doit pas laisser le mode de
        // communication et le focus posés : le haut-parleur resterait détourné
        // pour tout le système.
        OnDestroy {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) releaseRoute()
        }
```

- [ ] **Étape 3 : Écrire les deux fonctions privées**

Après `definition()` :

```kotlin
    // `@RequiresApi` plutôt qu'un simple `if` : le lint Android `NewApi` ne suit
    // pas la garde `SDK_INT` d'un appelant à travers un appel de méthode, et
    // `minSdkVersion` reste à 24. Sans cette annotation, `getMainExecutor()`
    // (API 28) et les quatre méthodes de route (API 31) font échouer le lint.
    @RequiresApi(Build.VERSION_CODES.S)
    private fun acquireRoute() {
        val manager = audioManager
        previousMode = manager.mode
        manager.mode = AudioManager.MODE_IN_COMMUNICATION

        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(attributes)
            .setOnAudioFocusChangeListener { }
            .build()
        focusRequest = request
        manager.requestAudioFocus(request)

        val listener = AudioManager.OnCommunicationDeviceChangedListener {
            sendEvent(DEVICES_CHANGED)
        }
        deviceListener = listener
        // `addOnCommunicationDeviceChangedListener` notifie AUSSI les
        // changements qu'un autre composant provoque — un casque qu'on allume,
        // la voiture qui se connecte. C'est le second angle mort du périmètre A
        // qui se lève ici.
        manager.addOnCommunicationDeviceChangedListener(
            context.mainExecutor,
            listener,
        )
    }

    @RequiresApi(Build.VERSION_CODES.S)
    private fun releaseRoute() {
        val manager = audioManager
        deviceListener?.let { manager.removeOnCommunicationDeviceChangedListener(it) }
        deviceListener = null
        manager.clearCommunicationDevice()
        focusRequest?.let { manager.abandonAudioFocusRequest(it) }
        focusRequest = null
        manager.mode = previousMode
    }
```

Signatures vérifiées dans `android-36/api-versions.xml` : `requestAudioFocus(AudioFocusRequest)` et
`abandonAudioFocusRequest(AudioFocusRequest)` `since=26` ; `Context.getMainExecutor()` `since=28` ;
`addOnCommunicationDeviceChangedListener(Executor, listener)` et
`removeOnCommunicationDeviceChangedListener(listener)` `since=31` ;
`AudioManager$OnCommunicationDeviceChangedListener` est une interface de méthode unique
(`onCommunicationDeviceChanged(AudioDeviceInfo)`), d'où la conversion SAM.

**L'ordre de `releaseRoute()` n'est pas arbitraire** : retirer l'écouteur **avant** de vider la
route, sinon le `clearCommunicationDevice()` déclenche un dernier `sendEvent` vers un runtime qui
peut déjà être en train de partir. Puis rendre le focus, puis restaurer le mode — dans l'ordre
inverse de la prise.

- [ ] **Étape 4 : Vérifier la barre**

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
```

Attendu : **63 suites / 949 tests**, `tsc` muet, **3 avertissements**, prettier propre. Rien ne
bouge : cette tâche est entièrement en Kotlin.

- [ ] **Étape 5 : Compiler, et le dire**

```bash
npx expo prebuild --platform android --clean && npx expo run:android --device
```

- [ ] La compilation Kotlin passe.
- [ ] Le lint Android ne signale **aucun `NewApi`**. S'il en signale un, c'est qu'un appel d'API 31
      est sorti d'une fonction annotée : le corriger, ne **jamais** baisser `abortOnError`.

**Ce qui ne peut pas être vérifié ici**, et qui est reporté en Tâche 9 parce qu'il demande que le
JavaScript appelle réellement `acquire()` : le routage, le focus, le mode, et l'absence de
rebascule. Cette tâche livre du code natif **compilé et lié, jamais exercé**. C'est dit sans détour.

- [ ] **Étape 6 : Committer**

```bash
git add modules/
git commit -m "feat(audio): Take over audio focus, mode and route from AudioSwitch"
```

---

## Tâche 5 : La liaison typée et le troisième mode de `audioRoute`

**Files:**

- Create: `src/call/nativeAudioDevices.ts`
- Modify: `src/call/audioRoute.ts`
- Modify: `src/call/audioRoute.spec.ts`

**Interfaces:**

- Consomme : `AudioDeviceChoice` et `readAudioDevices` (Tâche 2) ; le module natif
  `TwakeAudioDevices` (Tâches 3 et 4).
- Produit :
  ```ts
  export type AudioRouteControl = 'devices' | 'menu' | 'system';
  export function audioRouteControl(): AudioRouteControl;
  export async function startAudioRoute(): Promise<void>;
  export async function stopAudioRoute(): Promise<void>;
  export async function listAudioDevices(): Promise<readonly AudioDeviceChoice[]>;
  export async function selectAudioDevice(id: number): Promise<boolean>;
  export async function clearAudioDevice(): Promise<void>;
  export async function readCurrentAudioDeviceId(): Promise<number | null>;
  ```
  `listAudioOutputs`, `selectAudioOutput` et `openSystemRoutePicker` restent **inchangés**. Les
  Tâches 6, 7 et 8 en dépendent.

**Le fait qui décide de la forme des tests, et il a été MESURÉ.** Sous `jest-expo`,
`requireOptionalNativeModule('TwakeAudioDevices')` rend **`null`** — sans lever, sans avertir.
`nativeAudioDevices` est donc une **constante nulle** dans toute spec, et rien ne peut la
réaffecter. Le double est posé par un **accesseur dans la fabrique de `jest.mock`**, relu à chaque
appel :

```ts
const mockNativeHolder: { current: NativeAudioDevicesModule | null } = { current: null };

jest.mock('src/call/nativeAudioDevices', () => ({
  get nativeAudioDevices(): NativeAudioDevicesModule | null {
    return mockNativeHolder.current;
  },
}));
```

Cela ne marche **que** parce que `audioRoute.ts` lit la liaison **dans** ses fonctions
(`const native = nativeAudioDevices;`) et non au chargement du module : Babel compile chaque lecture
en `_nativeAudioDevices.nativeAudioDevices`, donc en un accès de propriété. **Exécuté et vert.**
Le préfixe `mock` de la variable est ce qui autorise la fabrique hoistée à fermer dessus.

- [ ] **Étape 1 : Créer la liaison typée**

`src/call/nativeAudioDevices.ts` :

```ts
import { requireOptionalNativeModule } from 'expo-modules-core';

export type NativeAudioDevicesModule = {
  isSupported(): boolean;
  listDevices(): Promise<unknown>;
  getCurrentDeviceId(): Promise<number | null>;
  acquire(): Promise<void>;
  release(): Promise<void>;
  selectDevice(id: number): Promise<boolean>;
  clearDevice(): Promise<void>;
};

export const nativeAudioDevices =
  requireOptionalNativeModule<NativeAudioDevicesModule>('TwakeAudioDevices');
```

`requireOptionalNativeModule` et non `requireNativeModule` : le second **lève** quand le module
n'est pas lié, et il n'est pas lié sous Jest, ni sur iOS, ni dans un binaire construit sans lui.
`listDevices()` est typé `Promise<unknown>` et non `Promise<NativeAudioDevice[]>`, exactement pour
la raison qui justifie `src/call/devices.ts` : **le pont natif ne porte aucun contrat**, et c'est
`readAudioDevices` qui le regarde, sans assertion de type.

- [ ] **Étape 2 : Écrire les tests qui échouent**

Remplacer entièrement `src/call/audioRoute.spec.ts` par le fichier ci-dessous. Il **reprend les
sept tests existants sans les affaiblir** — `listAudioOutputs`, `selectAudioOutput`,
`openSystemRoutePicker` gardent les leurs mot pour mot — et en ajoute quinze.

```ts
import { AudioSession } from '@livekit/react-native';
import { Platform } from 'react-native';

import {
  audioRouteControl,
  clearAudioDevice,
  listAudioDevices,
  listAudioOutputs,
  openSystemRoutePicker,
  readCurrentAudioDeviceId,
  selectAudioDevice,
  selectAudioOutput,
  startAudioRoute,
  stopAudioRoute,
} from 'src/call/audioRoute';
import type { NativeAudioDevicesModule } from 'src/call/nativeAudioDevices';

// Le module natif est une CONSTANTE exportée : `requireOptionalNativeModule`
// rend `null` sous Jest, mesuré, et rien ne peut le réaffecter depuis un test.
// Le double est donc posé derrière un accesseur, relu à chaque appel — ce que
// `audioRoute.ts` fait bien, puisqu'il lit la liaison DANS ses fonctions et non
// au chargement du module.
//
// Le préfixe `mock` est ce qui autorise la fabrique hoistée de `jest.mock` à
// fermer sur cette variable.
const mockNativeHolder: { current: NativeAudioDevicesModule | null } = { current: null };

jest.mock('src/call/nativeAudioDevices', () => ({
  get nativeAudioDevices(): NativeAudioDevicesModule | null {
    return mockNativeHolder.current;
  },
}));

function fakeNative(overrides: Partial<NativeAudioDevicesModule> = {}): NativeAudioDevicesModule {
  return {
    isSupported: jest.fn(() => true),
    listDevices: jest.fn(async () => []),
    getCurrentDeviceId: jest.fn(async () => null),
    acquire: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
    selectDevice: jest.fn(async () => true),
    clearDevice: jest.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockNativeHolder.current = null;
  jest.mocked(AudioSession.getAudioOutputs).mockReset().mockResolvedValue([]);
  jest.mocked(AudioSession.selectAudioOutput).mockReset().mockResolvedValue(undefined);
  jest.mocked(AudioSession.showAudioRoutePicker).mockReset().mockResolvedValue(undefined);
  jest.mocked(AudioSession.startAudioSession).mockReset().mockResolvedValue(undefined);
  jest.mocked(AudioSession.stopAudioSession).mockReset().mockResolvedValue(undefined);
});

describe('audioRouteControl', () => {
  it("rend 'system' sur iOS, où la seule surface est le sélecteur de la plateforme", () => {
    // `getAudioOutputs()` y est une constante à deux entrées qui ne sont pas
    // des catégories : il n'y a pas de menu à peupler. Et le module natif est
    // Android seulement — même présent, iOS reste 'system'.
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockNativeHolder.current = fakeNative();

    expect(audioRouteControl()).toBe('system');
  });

  it("rend 'menu' quand le module natif n'est pas lié", () => {
    jest.replaceProperty(Platform, 'OS', 'android');

    expect(audioRouteControl()).toBe('menu');
  });

  it("rend 'menu' sous le plancher API 31, module lié compris", () => {
    // L'autre polarité de `isSupported()` : sans elle, un `ownsRoute()` qui ne
    // testerait que la présence du module passerait.
    jest.replaceProperty(Platform, 'OS', 'android');
    mockNativeHolder.current = fakeNative({ isSupported: jest.fn(() => false) });

    expect(audioRouteControl()).toBe('menu');
  });

  it("rend 'devices' quand le module natif est lié et l'API suffisante", () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockNativeHolder.current = fakeNative();

    expect(audioRouteControl()).toBe('devices');
  });
});

describe('startAudioRoute', () => {
  it('démarre AudioSwitch quand nous ne tenons pas le volant', async () => {
    await startAudioRoute();

    expect(AudioSession.startAudioSession).toHaveBeenCalledTimes(1);
  });

  it('prend le volant, et NE démarre PAS AudioSwitch, quand le module est là', async () => {
    // Les deux assertions, jamais la première seule : deux arbitres sur le même
    // canal sont la cause classique du « le son est reparti tout seul », et
    // c'est invisible en test — RNTL ne route rien.
    const native = fakeNative();
    mockNativeHolder.current = native;

    await startAudioRoute();

    expect(native.acquire).toHaveBeenCalledTimes(1);
    expect(AudioSession.startAudioSession).not.toHaveBeenCalled();
  });

  it('laisse AudioSwitch conduire sous le plancher API 31', async () => {
    const native = fakeNative({ isSupported: jest.fn(() => false) });
    mockNativeHolder.current = native;

    await startAudioRoute();

    expect(native.acquire).not.toHaveBeenCalled();
    expect(AudioSession.startAudioSession).toHaveBeenCalledTimes(1);
  });
});

describe('stopAudioRoute', () => {
  it('arrête AudioSwitch quand nous ne tenons pas le volant', async () => {
    await stopAudioRoute();

    expect(AudioSession.stopAudioSession).toHaveBeenCalledTimes(1);
  });

  it('rend la route au système quand nous la tenions', async () => {
    const native = fakeNative();
    mockNativeHolder.current = native;

    await stopAudioRoute();

    expect(native.release).toHaveBeenCalledTimes(1);
    expect(AudioSession.stopAudioSession).not.toHaveBeenCalled();
  });
});

describe('listAudioOutputs', () => {
  it('normalise et ordonne ce que rend le module natif', async () => {
    jest.mocked(AudioSession.getAudioOutputs).mockResolvedValue(['speaker', 'bluetooth', 'hdmi']);

    await expect(listAudioOutputs()).resolves.toEqual(['bluetooth', 'speaker']);
  });

  it("rend une liste vide quand la session audio n'est pas ouverte", async () => {
    jest.mocked(AudioSession.getAudioOutputs).mockResolvedValue([]);

    await expect(listAudioOutputs()).resolves.toEqual([]);
  });

  it('jette les constantes iOS, qui ne sont pas des catégories', async () => {
    jest.mocked(AudioSession.getAudioOutputs).mockResolvedValue(['default', 'force_speaker']);

    await expect(listAudioOutputs()).resolves.toEqual([]);
  });
});

describe('selectAudioOutput', () => {
  it('transmet la catégorie choisie, jamais une autre', async () => {
    // Deux appels distincts, et la seconde catégorie vérifiée : un appel qui
    // enverrait toujours 'speaker' passerait un test à une seule valeur.
    await selectAudioOutput('bluetooth');
    await selectAudioOutput('earpiece');

    expect(AudioSession.selectAudioOutput).toHaveBeenNthCalledWith(1, 'bluetooth');
    expect(AudioSession.selectAudioOutput).toHaveBeenNthCalledWith(2, 'earpiece');
  });
});

describe('listAudioDevices', () => {
  it("rend une liste vide quand le module natif n'est pas lié", async () => {
    await expect(listAudioDevices()).resolves.toEqual([]);
  });

  it('normalise ce que rend le module natif', async () => {
    mockNativeHolder.current = fakeNative({
      listDevices: jest.fn(async () => [
        { id: 2, type: 2, name: 'Pixel 8' },
        { id: 7, type: 7, name: 'Tesla Model 3' },
      ]),
    });

    await expect(listAudioDevices()).resolves.toEqual([
      {
        id: 7,
        kind: 'bluetooth',
        name: 'Tesla Model 3',
        nameKey: 'call.output.bluetooth',
        ordinal: null,
      },
      { id: 2, kind: 'speaker', name: null, nameKey: 'call.output.speaker', ordinal: null },
    ]);
  });
});

describe('selectAudioDevice', () => {
  it("rend `false` quand le module natif n'est pas lié", async () => {
    await expect(selectAudioDevice(7)).resolves.toBe(false);
  });

  it("transmet l'identifiant visé, et rend le verdict du système", async () => {
    // Deux identifiants distincts : un appel qui enverrait toujours le premier
    // passerait un test à une seule valeur.
    const native = fakeNative({ selectDevice: jest.fn(async (id: number) => id === 7) });
    mockNativeHolder.current = native;

    await expect(selectAudioDevice(7)).resolves.toBe(true);
    await expect(selectAudioDevice(2)).resolves.toBe(false);
    expect(native.selectDevice).toHaveBeenNthCalledWith(1, 7);
    expect(native.selectDevice).toHaveBeenNthCalledWith(2, 2);
  });
});

describe('clearAudioDevice', () => {
  it("ne jette pas quand le module natif n'est pas lié", async () => {
    await expect(clearAudioDevice()).resolves.toBeUndefined();
  });

  it('rend la route au système', async () => {
    const native = fakeNative();
    mockNativeHolder.current = native;

    await clearAudioDevice();

    expect(native.clearDevice).toHaveBeenCalledTimes(1);
  });
});

describe('readCurrentAudioDeviceId', () => {
  it("rend `null` quand le module natif n'est pas lié", async () => {
    await expect(readCurrentAudioDeviceId()).resolves.toBeNull();
  });

  it("rend l'identifiant constaté par le système", async () => {
    mockNativeHolder.current = fakeNative({ getCurrentDeviceId: jest.fn(async () => 7) });

    await expect(readCurrentAudioDeviceId()).resolves.toBe(7);
  });
});

describe('openSystemRoutePicker', () => {
  it('appelle le sélecteur système', async () => {
    // Un test ne peut vérifier que l'appel : la méthode native simule un clic
    // sur une vue jamais insérée dans la hiérarchie, et n'a pas de resolver.
    await openSystemRoutePicker();

    expect(AudioSession.showAudioRoutePicker).toHaveBeenCalled();
  });
});
```

- [ ] **Étape 3 : Exécuter, et vérifier l'échec**

```bash
npx jest src/call/audioRoute.spec.ts
```

Attendu contre le `audioRoute.ts` de `3861227` : la suite **ne charge pas**, sur
`Could not locate module src/call/nativeAudioDevices` si l'étape 1 n'a pas été faite ; sinon, les
imports absents (`startAudioRoute`, `stopAudioRoute`, `listAudioDevices`, `selectAudioDevice`,
`clearAudioDevice`, `readCurrentAudioDeviceId`) font échouer `tsc` et les tests correspondants
lèvent `TypeError: ... is not a function`. **Les sept tests d'origine, eux, doivent rester verts.**

- [ ] **Étape 4 : Écrire l'implémentation**

Remplacer `src/call/audioRoute.ts` par :

```ts
import { AudioSession } from '@livekit/react-native';
import { Platform } from 'react-native';

import { readAudioDevices, type AudioDeviceChoice } from 'src/call/audioDevices';
import { readAudioOutputs, type AudioOutputKind } from 'src/call/devices';
import { nativeAudioDevices } from 'src/call/nativeAudioDevices';

// 'system' : le sélecteur est celui d'iOS, on ne contrôle ni son apparence ni
// ses libellés. 'menu' : le nôtre, alimenté par `getAudioOutputs()`, par
// CATÉGORIE. 'devices' : le nôtre, alimenté par notre module natif, par
// APPAREIL NOMMÉ.
//
// Rendu comme une valeur plutôt que lu depuis `Platform` par le composant :
// c'est ce qui permet à une spec de rendre les trois branches sans bouchonner
// `Platform`.
export type AudioRouteControl = 'devices' | 'menu' | 'system';

// Le module natif rend `null` partout où il n'est pas lié — sous Jest, sur iOS,
// et dans un binaire construit sans lui. `isSupported()` ajoute le plancher
// API 31 : `getAvailableCommunicationDevices()` n'existe pas en dessous.
function ownsRoute(): boolean {
  const native = nativeAudioDevices;
  return native !== null && native.isSupported();
}

export function audioRouteControl(): AudioRouteControl {
  if (Platform.OS === 'ios') return 'system';
  return ownsRoute() ? 'devices' : 'menu';
}

// Un seul arbitre par séance. Sur le chemin 'devices' notre module prend le
// focus audio, le mode et la route ; AudioSwitch n'est JAMAIS démarré, sans
// quoi son prochain `onDeviceConnected` rappellerait `startBluetoothSco()` et
// écraserait notre `setCommunicationDevice()`.
export async function startAudioRoute(): Promise<void> {
  const native = nativeAudioDevices;
  if (native !== null && native.isSupported()) {
    await native.acquire();
    return;
  }
  await AudioSession.startAudioSession();
}

export async function stopAudioRoute(): Promise<void> {
  const native = nativeAudioDevices;
  if (native !== null && native.isSupported()) {
    await native.release();
    return;
  }
  await AudioSession.stopAudioSession();
}
```

puis **conserver, inchangés**, `listAudioOutputs`, `selectAudioOutput` et `openSystemRoutePicker`
tels qu'ils sont dans `3861227` (commentaires compris), et ajouter à la suite :

```ts
// Le chemin 'devices'. `[]` quand le module n'est pas là : l'écran retombe
// alors sur le mode 'menu', qui ne lit pas cette liste.
export async function listAudioDevices(): Promise<readonly AudioDeviceChoice[]> {
  const native = nativeAudioDevices;
  if (native === null) return [];
  return readAudioDevices(await native.listDevices());
}

// Rend ce que `setCommunicationDevice()` a rendu : `false` dit que le système a
// refusé la route, et l'écran doit alors laisser la coche où elle était.
export async function selectAudioDevice(id: number): Promise<boolean> {
  const native = nativeAudioDevices;
  if (native === null) return false;
  return native.selectDevice(id);
}

// `clearCommunicationDevice()` — le retour à l'automatique qu'AudioSwitch ne
// sait pas faire : `setUserSelectedAudioDevice` y est `protected`, donc aucun
// appelant extérieur ne peut remettre le champ à `null`.
export async function clearAudioDevice(): Promise<void> {
  const native = nativeAudioDevices;
  if (native === null) return;
  await native.clearDevice();
}

// L'état CONSTATÉ, pas celui qu'on a demandé : `getCommunicationDevice()` dit
// où le son part vraiment. C'est ce qu'aucune API n'offrait au périmètre A.
export async function readCurrentAudioDeviceId(): Promise<number | null> {
  const native = nativeAudioDevices;
  if (native === null) return null;
  return native.getCurrentDeviceId();
}
```

`startAudioRoute` et `stopAudioRoute` répètent le prédicat au lieu d'appeler `ownsRoute()`. C'est
délibéré et c'est la doctrine du dépôt : **muter la branche, jamais le prédicat qui l'alimente**.
Un `ownsRoute()` partagé ferait qu'une seule mutation en amont rougirait cinq tests à la fois, ce
qui rassure sans localiser.

- [ ] **Étape 5 : Exécuter, et vérifier que ça passe**

```bash
npx jest src/call/audioRoute.spec.ts
```

**Exécuté** : `22 passed, 22 total`.

- [ ] **Étape 6 : Muter, pour vérifier que les tests localisent**

Deux mutations, **exécutées** :

| Mutation | Rouges obtenus |
|---|---|
| retirer le `return` après `await native.acquire()` | **1** — « prend le volant, et NE démarre PAS AudioSwitch » |
| `ownsRoute()` → `return native !== null;` | **1** — « rend `'menu'` sous le plancher API 31 » |

- [ ] **Étape 7 : Vérifier la barre**

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
```

Attendu : **63 suites / 964 tests**, `tsc` muet, **3 avertissements**, prettier propre.

- [ ] **Étape 8 : Committer**

```bash
git add src/call/nativeAudioDevices.ts src/call/audioRoute.ts src/call/audioRoute.spec.ts
git commit -m "feat(call): Route audio by device when the native module owns the route"
```

---

## Tâche 6 : Un seul propriétaire par séance

Trois lignes de `connection.ts`. C'est la tâche la plus courte du plan et la plus dangereuse : si
elle est faite à moitié, **les deux arbitres tiennent le canal en même temps** et le défaut est
invisible partout sauf sur un appareil.

**Files:**

- Modify: `src/call/connection.ts`
- Modify: `src/call/connection.spec.ts`

**Interfaces:**

- Consomme : `startAudioRoute`, `stopAudioRoute` (Tâche 5).
- Produit : rien de nouveau. `createCallSession` garde sa signature.

**Le piège qu'il faut nommer.** Sous Jest, le module natif est `null`, donc `startAudioRoute()`
appelle `AudioSession.startAudioSession()` — **exactement ce que faisait le code d'avant**. Les
quatre tests existants resteraient donc verts même si `connection.ts` n'était pas touché. C'est
pourquoi la spec **double `src/call/audioRoute`** : sans ce double, la mutation « rappeler
`AudioSession` directement » ne rougit rien.

**Mesuré** : avec le double, cette mutation donne **3 rouges** ; sans lui, **0**.

- [ ] **Étape 1 : Modifier les tests, et vérifier qu'ils échouent**

Dans `src/call/connection.spec.ts` :

1. Ligne 1, retirer `AudioSession` de l'import :
   ```ts
   import { registerGlobals } from '@livekit/react-native';
   ```
2. Juste avant l'import de `createCallSession`, ajouter :
   ```ts
   import { startAudioRoute, stopAudioRoute } from 'src/call/audioRoute';
   ```
3. Juste avant `jest.mock('livekit-client', …)`, ajouter :
   ```ts
   // La possession de la route est une décision d'un SEUL module
   // (`src/call/audioRoute.ts`), et `audioRoute.spec.ts` prouve ce que fait chacune
   // de ses deux branches. Ce fichier n'a qu'une chose à prouver : que la
   // connexion passe bien par lui. Sans ce double, un appel direct à
   // `AudioSession.startAudioSession()` — le code d'avant — resterait vert, parce
   // que sous Jest le module natif est absent et que les deux chemins retombent
   // alors sur le même appel.
   jest.mock('src/call/audioRoute', () => ({
     startAudioRoute: jest.fn(async (): Promise<void> => undefined),
     stopAudioRoute: jest.fn(async (): Promise<void> => undefined),
   }));
   ```
4. Dans le `beforeEach` existant, après `mockOff.mockReset();`, ajouter :
   ```ts
   // Le double de `audioRoute` est un objet de module PARTAGÉ : sans cette
   // remise à zéro, l'implémentation posée par le premier test de la section
   // « session audio » fuirait vers les suivants.
   jest.mocked(startAudioRoute).mockReset().mockResolvedValue(undefined);
   jest.mocked(stopAudioRoute).mockReset().mockResolvedValue(undefined);
   ```
5. Remplacer les quatre tests de `describe('createCallSession — session audio', …)` :

```ts
describe('createCallSession — session audio', () => {
  it('ouvre la route audio avant le transport, pas après', async () => {
    // L'ordre est tout : le propriétaire de la route configure le moteur audio
    // de la plateforme. Ouvrir le transport d'abord laisse la publication sans
    // moteur, et la négociation expire sur un « negotiation timed out » qui ne
    // nomme pas sa cause. Constaté sur appareil avant que ce module ne
    // l'appelle.
    const order: string[] = [];
    jest.mocked(startAudioRoute).mockImplementation(async () => {
      order.push('audio');
    });
    mockConnect.mockImplementation(async () => {
      order.push('transport');
    });

    const session = createCallSession();
    await session.connect(ACCESS);

    expect(order).toEqual(['audio', 'transport']);
  });

  it('referme la route audio au raccrochage', async () => {
    const session = createCallSession();
    await session.connect(ACCESS);
    jest.mocked(stopAudioRoute).mockClear();

    await session.disconnect();

    // Laissée ouverte, elle garde le routage audio de la plateforme et le
    // haut-parleur reste détourné pour le reste de l'application.
    expect(jest.mocked(stopAudioRoute)).toHaveBeenCalled();
  });

  it('referme la route audio au démontage', async () => {
    const session = createCallSession();
    await session.connect(ACCESS);
    jest.mocked(stopAudioRoute).mockClear();

    session.dispose();

    expect(jest.mocked(stopAudioRoute)).toHaveBeenCalled();
  });

  it("n'empêche pas la séance quand la route audio échoue à se rendre", async () => {
    const session = createCallSession();
    await session.connect(ACCESS);
    jest.mocked(stopAudioRoute).mockRejectedValueOnce(new Error('route occupée'));

    // Un échec de fermeture ne doit pas faire rejeter `disconnect()` : l'écran
    // resterait bloqué sur une séance que l'utilisateur vient de quitter.
    await expect(session.disconnect()).resolves.toBeUndefined();
    expect(session.getState()).toEqual({ status: 'idle' });
  });
});
```

```bash
npx jest src/call/connection.spec.ts
```

Attendu : **3 échecs** — les trois premiers tests ci-dessus —, parce que `connection.ts` appelle
encore `AudioSession`. Le quatrième passe déjà : son `mockRejectedValueOnce` porte sur un double qui
n'est pas appelé, et `disconnect()` résout de toute façon.

- [ ] **Étape 2 : Modifier `connection.ts`**

Trois substitutions, plus l'import :

```diff
-import { AudioSession, registerGlobals } from '@livekit/react-native';
+import { registerGlobals } from '@livekit/react-native';
 import { Room, RoomEvent } from 'livekit-client';

+import { startAudioRoute, stopAudioRoute } from 'src/call/audioRoute';
 import type { CallState, RoomAccess } from 'src/call/types';
```

```diff
-      await AudioSession.startAudioSession();
+      await startAudioRoute();
       await room.connect(access.livekitUrl, access.token);
```

```diff
-    void AudioSession.stopAudioSession().catch(() => undefined);
+    void stopAudioRoute().catch(() => undefined);
```

```diff
-    await AudioSession.stopAudioSession().catch(() => undefined);
+    await stopAudioRoute().catch(() => undefined);
```

Les trois commentaires qui entourent ces lignes restent : ils décrivent toujours ce qui se passe.
Seul le premier gagne une précision, « le propriétaire de la route » au lieu de
« `@livekit/react-native` », puisque ce n'est plus toujours lui.

- [ ] **Étape 3 : Exécuter et vérifier que ça passe**

```bash
npx jest src/call/connection.spec.ts
```

**Exécuté** : `42 passed, 42 total` — le compte est **inchangé**, quatre tests ont été réécrits,
aucun ajouté.

- [ ] **Étape 4 : Muter**

**Exécutée** : remettre les trois appels à `AudioSession` (et son import) → **3 rouges**, les trois
premiers tests de la section. Remettre le code en état.

- [ ] **Étape 5 : Vérifier la barre**

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
```

Attendu : **63 suites / 964 tests**, `tsc` muet, **3 avertissements**, prettier propre.

- [ ] **Étape 6 : Committer**

```bash
git add src/call/connection.ts src/call/connection.spec.ts
git commit -m "refactor(call): Give the session one audio route owner, never two"
```

---

## Tâche 7 : La feuille liste des appareils nommés

**Files:**

- Modify: `src/screens/room/audioOutputControl.tsx`
- Modify: `src/screens/room/audioOutputControl.spec.tsx`
- Modify: `src/i18n/locales/{en,fr,es,it,de,vi,ru}.json`
- Modify: `src/screens/room/callControlBar.tsx` — **cinq props neutres seulement**, pour que
  `tsc` reste vert ; la Tâche 8 les remplace. Voir l'étape 6.

**Interfaces:**

- Consomme : `AudioDeviceChoice` (Tâche 2), `AudioRouteControl` (Tâche 5), `SheetRow`,
  `SheetCheck`, `BottomSheet`, `audioOutputNameKey`.
- Produit :
  ```ts
  export type AudioOutputControlProps = {
    readonly mode: AudioRouteControl;
    readonly outputs: readonly AudioOutputKind[];
    readonly chosen: AudioOutputKind | null;
    readonly devices: readonly AudioDeviceChoice[];
    readonly currentDeviceId: number | null;
    readonly manual: boolean;
    readonly onOpen: () => void;
    readonly onSelect: (kind: AudioOutputKind) => void;
    readonly onSelectDevice: (device: AudioDeviceChoice) => void;
    readonly onAutomatic: () => void;
    readonly onSystemPicker: () => void;
  };
  ```
  La Tâche 8 câble ces onze props.

**Deux clés nouvelles, et deux seulement.** La spécification recommandait **aucune** clé nouvelle,
au motif que le nom se substitue au libellé dans la même ligne. Cela reste vrai — `call.output.*`
sont conservées telles quelles. Les deux clés ajoutées portent des choses que la recommandation
lecture seule n'avait pas :

| Clé | Pourquoi elle n'existait pas |
|---|---|
| `call.outputNumbered` | Deux Bluetooth ne pouvaient pas coexister sous AudioSwitch ; ils le peuvent ici, et deux lignes identiques seraient indiscernables. Décalque exact de `call.cameraNumbered`. |
| `call.outputAutomatic` | Le retour à l'automatique n'existait pas : `setUserSelectedAudioDevice` est `protected`. `clearCommunicationDevice()` le rend possible. |

**Les noms des props de geste sont préfixés** (`onSelectDevice`, `onAutomatic`) et non `onPress` :
`fireEvent.press` de RNTL 14 remonte l'arbre de fibres jusqu'au premier ancêtre **hôte**, donc une
prop nommée comme l'événement d'un composant hôte rend le test **vert par accident**. Ce dépôt l'a
mesuré.

- [ ] **Étape 1 : Ajouter les deux clés dans les sept locales**

Dans chaque `src/i18n/locales/*.json`, **immédiatement après** `"call.outputManualUntilEnd"` :

| locale | `call.outputAutomatic` | `call.outputNumbered` |
|---|---|---|
| en | `Automatic` | `{{name}} {{index}}` |
| fr | `Automatique` | `{{name}} {{index}}` |
| es | `Automático` | `{{name}} {{index}}` |
| it | `Automatico` | `{{name}} {{index}}` |
| de | `Automatisch` | `{{name}} {{index}}` |
| vi | `Tự động` | `{{name}} {{index}}` |
| ru | `Автоматически` | `{{name}} {{index}}` |

Les fichiers sont des tables **plates** à clés pointées, indentées de deux espaces, terminées par
une ligne vide. `npx prettier --check src/i18n/locales/*.json` doit rester propre.

```bash
npx jest src/i18n/index.spec.ts
```

**Exécuté** : `2 passed`. Cette suite échoue si une clé manque dans une seule locale.

- [ ] **Étape 2 : Écrire les tests qui échouent**

Remplacer `src/screens/room/audioOutputControl.spec.tsx`. Les dix tests d'origine sont **conservés
dans leur intention** — le mode système, l'ouverture qui relit, la borne du sélecteur, l'envoi de la
catégorie pressée, la fermeture, la coche, la note, la feuille vide, la couleur, le glyphe — et
transposés sur une fabrique de props, plus huit tests nouveaux. Le fichier complet :

```tsx
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import type { AudioDeviceChoice } from 'src/call/audioDevices';
import { tokens } from 'src/ui/tokens';
import { AudioOutputControl, type AudioOutputControlProps } from './audioOutputControl';

// `t: (key) => key` ignore son second argument : il ne peut donc pas distinguer
// `t('call.outputNumbered', { name, index })` de la même clé appelée avec
// n'importe quoi d'autre. `mockT` interpole réellement, comme
// `cameraMenu.spec.tsx` et `waitingBanner.spec.tsx` pour la même raison.
const mockT = jest.fn((key: string, options?: { name?: string; index?: number }) =>
  options !== undefined ? `${key}:${options.name}:${options.index}` : key,
);

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockT }),
}));

// `BottomSheet` monte sa feuille dans un `Portal`, et `Modal` (react-native-paper)
// lit `useSafeAreaInsets()` (`Modal.tsx:118`). Pas strictement requis ici —
// `SafeAreaProviderCompat`, que `PaperProvider` pose toujours, retombe déjà sur
// des insets à zéro quand aucun fournisseur natif n'a répondu, ce qui couvre les
// environnements de test. Gardé pour documenter l'intention plutôt que de
// compter sur ce repli interne d'une bibliothèque tierce.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// `animation.scale` à zéro ramène à zéro la durée des deux animations
// d'opacité que `Modal` lance avec `Animated.timing` — à l'ouverture et à la
// fermeture (`Modal.tsx:117-144`, `duration: scale * DEFAULT_DURATION`, sans
// quoi chacune prendrait 220 ms).
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

// Le caractère que `MaterialCommunityIcons` dessine réellement pour "check",
// lu depuis la même table que le composant plutôt que recopié à la main —
// même précaution que `cameraMenu.spec.tsx`, pour la même raison.
function codepointFor(glyph: number | string): string {
  return typeof glyph === 'number' ? String.fromCodePoint(glyph) : glyph;
}
const CHECK_GLYPH = codepointFor(MaterialCommunityIcons.glyphMap.check);

const TESLA: AudioDeviceChoice = {
  id: 7,
  kind: 'bluetooth',
  name: 'Tesla Model 3',
  nameKey: 'call.output.bluetooth',
  ordinal: null,
};

const SPEAKER: AudioDeviceChoice = {
  id: 2,
  kind: 'speaker',
  name: null,
  nameKey: 'call.output.speaker',
  ordinal: null,
};

function props(overrides: Partial<AudioOutputControlProps> = {}): AudioOutputControlProps {
  return {
    mode: 'devices',
    outputs: [],
    chosen: null,
    devices: [TESLA, SPEAKER],
    currentDeviceId: null,
    manual: false,
    onOpen: jest.fn(),
    onSelect: jest.fn(),
    onSelectDevice: jest.fn(),
    onAutomatic: jest.fn(),
    onSystemPicker: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockT.mockClear();
});

describe('AudioOutputControl, mode système', () => {
  it('ouvre le sélecteur de la plateforme sans monter de feuille', async () => {
    // Sur iOS, `getAudioOutputs()` est une constante à deux entrées qui ne sont
    // pas des catégories : il n'y a rien à lire et rien à peupler. Le module
    // natif de ce lot est Android seulement, et rien ici ne le change.
    const onSystemPicker = jest.fn();
    const onOpen = jest.fn();

    await render(
      withPaper(<AudioOutputControl {...props({ mode: 'system', onSystemPicker, onOpen })} />),
    );

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    expect(onSystemPicker).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.queryByTestId('audio-output-device-7')).toBeNull();
    expect(screen.queryByTestId('audio-output-note')).toBeNull();
  });
});

describe('AudioOutputControl, mode catégories', () => {
  it('rend une ligne par catégorie, jamais une ligne par appareil', async () => {
    // L'autre polarité du choix de liste : sous le plancher API 31 le module
    // natif est absent et la feuille retombe EXACTEMENT sur ce qu'elle
    // affichait avant ce lot.
    await render(
      withPaper(
        <AudioOutputControl
          {...props({ mode: 'menu', outputs: ['bluetooth', 'speaker'], devices: [TESLA, SPEAKER] })}
        />,
      ),
    );

    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());

    expect(screen.getByTestId('audio-output-option-bluetooth')).toBeTruthy();
    expect(screen.queryByTestId('audio-output-device-7')).toBeNull();
  });

  it('envoie la catégorie pressée, pas la première de la liste, et referme', async () => {
    const onSelect = jest.fn();

    await render(
      withPaper(
        <AudioOutputControl
          {...props({ mode: 'menu', outputs: ['bluetooth', 'speaker'], onSelect })}
        />,
      ),
    );
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-option-speaker'));

    expect(onSelect).toHaveBeenCalledWith('speaker');
    expect(onSelect).not.toHaveBeenCalledWith('bluetooth');
    await waitFor(() => expect(screen.queryByTestId('audio-output-option-speaker')).toBeNull());
  });

  it("coche la catégorie demandée, faute d'état constaté sur ce chemin", async () => {
    await render(
      withPaper(
        <AudioOutputControl
          {...props({ mode: 'menu', outputs: ['bluetooth', 'speaker'], chosen: 'speaker' })}
        />,
      ),
    );

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-check-speaker')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-bluetooth')).toBeNull();
  });

  it("n'offre PAS le retour à l'automatique, même après un choix manuel", async () => {
    // La seconde polarité de `mode === 'devices' && manual` : AudioSwitch ne
    // sait pas revenir en automatique — `setUserSelectedAudioDevice` y est
    // `protected` —, donc offrir la commande sur ce chemin serait un bouton
    // qui ne fait rien.
    await render(
      withPaper(
        <AudioOutputControl
          {...props({ mode: 'menu', outputs: ['speaker'], chosen: 'speaker', manual: true })}
        />,
      ),
    );

    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-option-speaker')).toBeTruthy());

    expect(screen.queryByTestId('audio-output-automatic')).toBeNull();
  });
});

describe('AudioOutputControl, mode appareils', () => {
  it("demande une relecture à l'ouverture, jamais au montage", async () => {
    const onOpen = jest.fn();

    await render(withPaper(<AudioOutputControl {...props({ onOpen })} />));
    expect(onOpen).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("n'ouvre pas le sélecteur système", async () => {
    // L'autre borne du mode : sans elle, un composant qui appellerait les deux
    // rappels passerait le test du mode système.
    const onSystemPicker = jest.fn();

    await render(withPaper(<AudioOutputControl {...props({ onSystemPicker })} />));

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    expect(onSystemPicker).not.toHaveBeenCalled();
  });

  it("affiche le nom lu de l'appareil, et la catégorie quand il n'y en a pas", async () => {
    // Les deux polarités de `device.name ?? t(nameKey)`. Sans la seconde, un
    // composant qui afficherait toujours `name` rendrait une ligne vide pour
    // le haut-parleur intégré.
    await render(withPaper(<AudioOutputControl {...props()} />));

    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());

    expect(screen.getByTestId('audio-output-device-7-title')).toHaveTextContent('Tesla Model 3');
    expect(screen.getByTestId('audio-output-device-2-title')).toHaveTextContent(
      'call.output.speaker',
    );
  });

  it("numérote quand l'appareil porte un ordinal, jamais sinon", async () => {
    // Les deux polarités de `device.ordinal === null`, et `mockT` interpole
    // réellement : un composant qui passerait l'identifiant à la place du nom
    // rendrait « call.outputNumbered:7:1 » et ce test rougirait.
    await render(
      withPaper(
        <AudioOutputControl
          {...props({
            devices: [{ ...TESLA, name: 'Jabra Evolve2', ordinal: 2 }, SPEAKER],
          })}
        />,
      ),
    );

    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());

    expect(screen.getByTestId('audio-output-device-7-title')).toHaveTextContent(
      'call.outputNumbered:Jabra Evolve2:2',
    );
    expect(screen.getByTestId('audio-output-device-2-title')).toHaveTextContent(
      'call.output.speaker',
    );
  });

  it("coche l'appareil CONSTATÉ, pas celui qu'on a demandé", async () => {
    // C'est le gain que le module natif apporte et que le périmètre A ne
    // pouvait pas avoir : `getCommunicationDevice()` dit où le son part
    // vraiment. Les deux polarités, sur deux appareils distincts.
    const view = await render(withPaper(<AudioOutputControl {...props()} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-7')).toBeNull();
    expect(screen.queryByTestId('audio-output-check-2')).toBeNull();

    await view.rerender(withPaper(<AudioOutputControl {...props({ currentDeviceId: 7 })} />));

    await waitFor(() => expect(screen.getByTestId('audio-output-check-7')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-2')).toBeNull();
  });

  it("envoie l'appareil pressé, pas le premier de la liste", async () => {
    // Deux appareils, jamais un seul, et le second visé.
    const onSelectDevice = jest.fn();

    await render(withPaper(<AudioOutputControl {...props({ onSelectDevice })} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-device-2'));

    expect(onSelectDevice).toHaveBeenCalledWith(SPEAKER);
    expect(onSelectDevice).not.toHaveBeenCalledWith(TESLA);
  });

  it('referme la feuille après un choix', async () => {
    // La SECONDE instruction du même gestionnaire. `Modal` ne démonte qu'après
    // sa propre animation de fermeture asynchrone (`hideModalAnimation`,
    // `Modal.tsx:131-144`), d'où le `waitFor`.
    await render(withPaper(<AudioOutputControl {...props()} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-device-2'));

    await waitFor(() => expect(screen.queryByTestId('audio-output-device-2')).toBeNull());
  });

  it("change la ligne d'explication après un choix manuel", async () => {
    // C'est la seule occasion qu'a l'utilisateur d'apprendre qu'il vient de
    // désarmer la bascule automatique.
    const view = await render(withPaper(<AudioOutputControl {...props()} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('audio-output-note')).toHaveTextContent('call.outputFollowsDevice'),
    );

    await view.rerender(withPaper(<AudioOutputControl {...props({ manual: true })} />));

    await waitFor(() =>
      expect(screen.getByTestId('audio-output-note')).toHaveTextContent(
        'call.outputManualUntilEnd',
      ),
    );
  });

  it("n'offre le retour à l'automatique qu'une fois un choix manuel fait", async () => {
    // Masquer une commande indisponible, jamais la griser : `disabled` ferait
    // revenir le quasi-noir sur fond sombre que `IconButton/utils.ts:88-93`
    // impose avant toute couleur explicite.
    const view = await render(withPaper(<AudioOutputControl {...props()} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-automatic')).toBeNull();

    await view.rerender(withPaper(<AudioOutputControl {...props({ manual: true })} />));

    await waitFor(() => expect(screen.getByTestId('audio-output-automatic')).toBeTruthy());
  });

  it("rend la route au système, et referme, quand on revient à l'automatique", async () => {
    // Les DEUX instructions du gestionnaire, une assertion chacune.
    const onAutomatic = jest.fn();

    await render(withPaper(<AudioOutputControl {...props({ manual: true, onAutomatic })} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-automatic')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-automatic'));

    expect(onAutomatic).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('audio-output-automatic')).toBeNull());
  });

  it("s'ouvre sur sa seule explication quand la liste est vide", async () => {
    // Rien n'a échoué : la liste est vide tant que la route n'est pas prise.
    await render(withPaper(<AudioOutputControl {...props({ devices: [] })} />));

    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-note')).toBeTruthy());
    // La couleur est explicite depuis `controlBar.ts`, d'autant plus utile que
    // la surface d'un `Modal` est transparente par défaut (`Modal.tsx`,
    // `styles.content`).
    expect(screen.getByTestId('audio-output-note')).toHaveStyle({
      color: tokens.color.textDark,
    });
    // La feuille elle-même : `Modal` expose sa `Surface` sous
    // `` `${testID}-surface` `` (`Modal.tsx:219-220`).
    expect(screen.getByTestId('audio-output-sheet-surface')).toHaveStyle({
      backgroundColor: tokens.color.surfaceDark,
    });
  });

  it('force une couleur explicite sur le titre de chaque ligne', async () => {
    // Sans elle, Paper retombe sur `theme.colors.onSurface` — `textLight`
    // (#1A1A1A) en schéma clair, le défaut de la plupart des appareils — sur un
    // fond que `call.tsx` force sombre.
    await render(withPaper(<AudioOutputControl {...props({ manual: true })} />));

    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());

    expect(screen.getByTestId('audio-output-device-7-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
    expect(screen.getByTestId('audio-output-automatic-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('dessine un vrai glyphe pour la coche, jamais une boîte vide', async () => {
    // RNTL ne rend pas les couleurs : ce test ne peut garder qu'un vrai glyphe
    // est dessiné et qu'il porte une couleur explicite — jamais qu'il est
    // lisible.
    await render(withPaper(<AudioOutputControl {...props({ currentDeviceId: 7 })} />));
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    const check = await waitFor(() => screen.getByTestId('audio-output-check-7'));

    expect(check.props.children[0]).toBe(CHECK_GLYPH);
    expect(check).toHaveStyle({ color: tokens.color.textDark });
  });
});
```

```bash
npx jest src/screens/room/audioOutputControl.spec.tsx
```

Attendu : la suite ne compile pas (`AudioOutputControlProps` n'a pas encore `devices`,
`currentDeviceId`, `manual`, `onSelectDevice`, `onAutomatic`) et, une fois les props ajoutées mais
le rendu inchangé, **les tests du mode appareils échouent** — treize en tout dans ce bloc.

**Deux points de mécanique, mesurés, à ne pas contourner :**

1. `toHaveStyle` et `toHaveTextContent` viennent de **RNTL 14**, pas de `jest-native` : chaque spec
   importe `@testing-library/react-native`, dont `dist/index.js:6` fait un second `expect.extend`
   qui **remplace** celui de `jest.setup.ts`. Conséquence directe ici :
   `toHaveTextContent('call.output.speaker')` compare la chaîne **entière**
   (`exact = true`). Un titre composé ne passerait pas — d'où `mockT` qui rend une chaîne
   déterministe et complète.
2. `SheetRow` expose son `Text` interne sous `` `${testID}-title` `` : c'est ce qui rend la garde de
   couleur possible. L'`iconColor` d'un `IconButton` à icône-chaîne, lui, n'est **jamais**
   joignable — `IconButton.tsx:211` ne transmet pas de `testID` —, et aucun test de ce plan n'essaie.

- [ ] **Étape 3 : Écrire le composant**

Remplacer `src/screens/room/audioOutputControl.tsx`. Les imports gagnent
`import type { AudioDeviceChoice } from 'src/call/audioDevices';` ; le type de props est celui du
bloc **Interfaces** ci-dessus ; le corps :

```tsx
export function AudioOutputControl({
  mode,
  outputs,
  chosen,
  devices,
  currentDeviceId,
  manual,
  onOpen,
  onSelect,
  onSelectDevice,
  onAutomatic,
  onSystemPicker,
}: AudioOutputControlProps): React.ReactElement {
  const { t } = useTranslation();
  // État d'affichage local, jamais métier : le parent n'a rien à en savoir.
  const [visible, setVisible] = useState(false);

  // Même icône, même place, même libellé d'accessibilité dans les trois modes :
  // cohérent en surface, honnête en profondeur. L'icône est fixe — une icône de
  // casque affichée pendant que le son sort du haut-parleur serait un mensonge
  // d'interface, et la catégorie constatée ne suffit pas à la choisir.
  const button = (onPress: () => void): React.ReactElement => (
    <IconButton
      testID="audio-output-btn"
      icon="volume-high"
      iconColor={BAR_ICON_COLOR}
      rippleColor={BAR_RIPPLE_COLOR}
      style={barStyles.button}
      hitSlop={BAR_HIT_SLOP}
      onPress={onPress}
      accessibilityLabel={t('call.audioOutput')}
    />
  );

  // Sur iOS il n'y a rien à peupler : `getAudioOutputs()` y est une constante à
  // deux entrées qui ne sont pas des catégories. Le seul recours est le
  // sélecteur de la plateforme, dont on ne contrôle ni l'apparence ni les
  // libellés — et dont rien ne dit s'il est apparu.
  if (mode === 'system') return button(onSystemPicker);

  // Composé par i18next, jamais en JavaScript : une chaîne assemblée ici ne
  // serait pas traduisible. Même motif que `cameraMenu.tsx`.
  const deviceTitle = (device: AudioDeviceChoice): string => {
    const label = device.name ?? t(audioOutputNameKey(device.kind));
    return device.ordinal === null
      ? label
      : t('call.outputNumbered', { name: label, index: device.ordinal });
  };

  return (
    <>
      {button(() => {
        setVisible(true);
        // La liste est relue à l'ouverture, et à ce moment seulement.
        onOpen();
      })}
      <BottomSheet
        testID="audio-output-sheet"
        visible={visible}
        title={t('call.audioOutput')}
        onDismiss={() => setVisible(false)}
      >
        {/* Secondaire par la taille (`labelSmall`), jamais par un gris :
            `tokens.color.muted` donne 3,88:1 sur `surfaceDark`, sous le seuil
            AA. C'est la seule occasion qu'a l'utilisateur d'apprendre qu'un
            choix manuel désarme la bascule automatique pour le reste de la
            séance. */}
        <Text testID="audio-output-note" variant="labelSmall" style={sheetStyles.note}>
          {manual ? t('call.outputManualUntilEnd') : t('call.outputFollowsDevice')}
        </Text>
        {mode === 'devices'
          ? devices.map((device) => (
              <SheetRow
                key={device.id}
                testID={`audio-output-device-${device.id}`}
                leading={
                  device.id === currentDeviceId ? (
                    <SheetCheck testID={`audio-output-check-${device.id}`} />
                  ) : undefined
                }
                title={deviceTitle(device)}
                onPress={() => {
                  setVisible(false);
                  onSelectDevice(device);
                }}
              />
            ))
          : outputs.map((kind) => (
              <SheetRow
                key={kind}
                testID={`audio-output-option-${kind}`}
                leading={
                  kind === chosen ? <SheetCheck testID={`audio-output-check-${kind}`} /> : undefined
                }
                title={t(audioOutputNameKey(kind))}
                onPress={() => {
                  setVisible(false);
                  onSelect(kind);
                }}
              />
            ))}
        {/* Le retour à l'automatique n'existe QUE sur le chemin 'devices' :
            `clearCommunicationDevice()` le donne, alors qu'AudioSwitch ne le
            donne pas — `setUserSelectedAudioDevice` y est `protected`, donc
            aucun appelant extérieur ne peut remettre le champ à `null`. Rendu
            seulement quand il y a quelque chose à défaire : masquer une
            commande indisponible, jamais la griser. */}
        {mode === 'devices' && manual ? (
          <SheetRow
            testID="audio-output-automatic"
            title={t('call.outputAutomatic')}
            onPress={() => {
              setVisible(false);
              onAutomatic();
            }}
          />
        ) : null}
      </BottomSheet>
    </>
  );
}
```

Le `testID` d'une ligne d'appareil est `audio-output-device-${id}` et **non**
`audio-output-option-${kind}` : les deux listes ne se confondent jamais, et c'est ce qui permet aux
tests du mode catégories d'affirmer qu'aucune ligne d'appareil n'est rendue, et réciproquement.

- [ ] **Étape 4 : Exécuter et vérifier que ça passe**

```bash
npx jest src/screens/room/audioOutputControl.spec.tsx
```

**Exécuté** : `18 passed, 18 total`.

- [ ] **Étape 5 : Muter — sept mutations, sept résultats attendus**

Toutes **exécutées** sur une copie jetable :

| Mutation | Rouges |
|---|---|
| retirer `setVisible(false)` de la ligne d'appareil | 1 — « referme la feuille après un choix » |
| retirer `setVisible(false)` de la ligne « automatique » | 1 — « rend la route au système, et referme » |
| `mode === 'devices' && manual` → `mode === 'devices'` | 1 — « n'offre le retour … qu'une fois un choix manuel fait » |
| `mode === 'devices' && manual` → `manual` | 1 — « n'offre PAS le retour …, même après un choix manuel » |
| `const label = t(audioOutputNameKey(device.kind));` | 2 — « affiche le nom lu » + « numérote » |
| `return label;` (ignorer l'ordinal) | 1 — « numérote quand l'appareil porte un ordinal » |
| coche sur `device.kind === chosen` | 2 — « coche l'appareil CONSTATÉ » + « dessine un vrai glyphe » |

Remettre le code en état après chacune.

- [ ] **Étape 6 : Vérifier la barre**

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
```

Attendu : **63 suites / 972 tests**, `tsc` muet, **3 avertissements**, prettier propre.

`npm run typecheck` échouera tant que la Tâche 8 n'a pas câblé les nouvelles props dans
`callControlBar.tsx`. **Les deux tâches ne peuvent donc pas être commitées séparément si l'on veut
une barre verte à chaque commit** : ajouter dès cette étape, dans `callControlBar.tsx`, les cinq
props avec des valeurs neutres —

```tsx
        devices={[]}
        currentDeviceId={null}
        manual={chosenOutput !== null}
        onSelectDevice={() => undefined}
        onAutomatic={() => undefined}
```

— que la Tâche 8 remplacera. C'est le seul endroit de ce plan où une tâche laisse un fil pendant ;
il est court, il est nommé, et il est repris à l'étape suivante.

- [ ] **Étape 7 : Committer**

```bash
git add src/screens/room/audioOutputControl.tsx src/screens/room/audioOutputControl.spec.tsx \
        src/screens/room/callControlBar.tsx src/i18n/locales
git commit -m "feat(call): List audio outputs by named device in the output sheet"
```

---

## Tâche 8 : Le câblage, et le retour à l'automatique

**Files:**

- Modify: `src/screens/room/callControlBar.tsx`
- Modify: `src/screens/room/call.spec.tsx`

**Interfaces:**

- Consomme : tout ce que les Tâches 5 et 7 produisent.
- Produit : rien de nouveau vers l'extérieur. `CallControlBarProps` est inchangée.

**Le fait que le câblage doit respecter, et il a été découvert en exécutant.** À chaque ouverture de
la feuille, `readCurrentAudioDeviceId()` **écrase** ce que la sélection avait posé. C'est
**voulu** — la coche montre l'état constaté, jamais la demande — et cela a une conséquence de test :
une fixture qui laisserait `readCurrentAudioDeviceId` rendre `null` après une sélection réussie
ferait échouer le test de la coche. Ce n'est pas un défaut du code, c'est le code qui fait ce qu'il
annonce. Le test le dit explicitement.

- [ ] **Étape 1 : Écrire les tests qui échouent**

Insérer dans `src/screens/room/call.spec.tsx`, **immédiatement avant**
`describe('CallScreen, indicateur d’enregistrement', …)` :

```tsx
describe('CallScreen, sortie audio par appareil', () => {
  const TESLA = {
    id: 7,
    kind: 'bluetooth' as const,
    name: 'Tesla Model 3',
    nameKey: 'call.output.bluetooth' as const,
    ordinal: null,
  };
  const SPEAKER = {
    id: 2,
    kind: 'speaker' as const,
    name: null,
    nameKey: 'call.output.speaker' as const,
    ordinal: null,
  };

  beforeEach(() => {
    jest.spyOn(audioRoute, 'audioRouteControl').mockReturnValue('devices');
    jest.spyOn(audioRoute, 'listAudioDevices').mockResolvedValue([TESLA, SPEAKER]);
    jest.spyOn(audioRoute, 'readCurrentAudioDeviceId').mockResolvedValue(null);
    jest.spyOn(audioRoute, 'selectAudioDevice').mockResolvedValue(true);
    jest.spyOn(audioRoute, 'clearAudioDevice').mockResolvedValue();
  });

  it("lit la liste ET l'état constaté à l'ouverture, jamais avant", async () => {
    // Deux lectures, un seul instant — même discipline que le menu caméra. La
    // seconde est ce que le périmètre A ne pouvait pas avoir.
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    expect(audioRoute.listAudioDevices).not.toHaveBeenCalled();
    expect(audioRoute.readCurrentAudioDeviceId).not.toHaveBeenCalled();

    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(audioRoute.listAudioDevices).toHaveBeenCalledTimes(1));
    expect(audioRoute.readCurrentAudioDeviceId).toHaveBeenCalledTimes(1);
    // L'autre chemin n'est PAS emprunté : sans cette borne, un écran qui
    // appellerait les deux passerait aussi le test du mode catégories.
    expect(audioRoute.listAudioOutputs).not.toHaveBeenCalled();
  });

  it("demande l'appareil pressé, jamais le premier de la liste", async () => {
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-2')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-device-2'));

    await waitFor(() => expect(audioRoute.selectAudioDevice).toHaveBeenCalledWith(2));
    expect(audioRoute.selectAudioDevice).not.toHaveBeenCalledWith(7);
  });

  it('coche ce que le système a réellement pris, et prévient du désarmement', async () => {
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() =>
      expect(screen.getByTestId('audio-output-note')).toHaveTextContent('call.outputFollowsDevice'),
    );
    await fireEvent.press(screen.getByTestId('audio-output-device-7'));

    // Le système confirme la route à la réouverture. La coche affichée est
    // TOUJOURS celle de la relecture, jamais celle de notre demande : c'est ce
    // qui distingue ce chemin du mode catégories, et c'est pour cela que la
    // fixture doit bouger ici. Mesuré : sans ce `mockResolvedValue(7)`, le test
    // échoue — parce que le code fait bien ce qu'il annonce.
    jest.spyOn(audioRoute, 'readCurrentAudioDeviceId').mockResolvedValue(7);
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-check-7')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-2')).toBeNull();
    expect(screen.getByTestId('audio-output-note')).toHaveTextContent('call.outputManualUntilEnd');
  });

  it('signale un refus du système, et ne coche rien', async () => {
    // `setCommunicationDevice()` rend `false` quand la route n'a pas pris.
    // L'autre polarité du même booléen : sans elle, un écran qui cocherait
    // toujours passerait le test précédent.
    jest.spyOn(audioRoute, 'selectAudioDevice').mockResolvedValue(false);

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-7')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-device-7'));

    await waitFor(() =>
      expect(screen.getByTestId('call-notice')).toHaveTextContent('call.deviceSwitchFailed'),
    );
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-7')).toBeTruthy());
    expect(screen.queryByTestId('audio-output-check-7')).toBeNull();
  });

  it("rend la route au système, et relit l'état constaté APRÈS", async () => {
    // Les trois instructions du gestionnaire : `clearCommunicationDevice()`,
    // la relecture, et la note qui redevient « suit l'appareil ». Le système
    // rebascule sur SON choix, et c'est celui-là que l'écran doit montrer.
    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-device-7')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('audio-output-device-7'));

    jest.spyOn(audioRoute, 'readCurrentAudioDeviceId').mockResolvedValue(2);
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-automatic')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('audio-output-automatic'));

    await waitFor(() => expect(audioRoute.clearAudioDevice).toHaveBeenCalledTimes(1));
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));
    await waitFor(() => expect(screen.getByTestId('audio-output-check-2')).toBeTruthy());
    expect(screen.getByTestId('audio-output-note')).toHaveTextContent('call.outputFollowsDevice');
    expect(screen.queryByTestId('audio-output-automatic')).toBeNull();
  });

  it("n'affiche rien quand l'énumération échoue, et ouvre une feuille vide", async () => {
    jest.spyOn(audioRoute, 'listAudioDevices').mockRejectedValue(new Error('énumération refusée'));

    await renderCall();
    await waitFor(() => expect(screen.getByTestId('audio-output-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('audio-output-btn'));

    await waitFor(() => expect(screen.getByTestId('audio-output-note')).toBeTruthy());
    expect(screen.queryByTestId('call-notice')).toBeNull();
    expect(screen.queryByTestId('audio-output-device-7')).toBeNull();
  });
});
```

`audioRoute` est déjà importé en tête du fichier (`import * as audioRoute from 'src/call/audioRoute';`,
ligne 14) et le `beforeEach` global (lignes 475-478) espionne déjà `audioRouteControl`,
`listAudioOutputs`, `selectAudioOutput` et `openSystemRoutePicker` : le `beforeEach` local ci-dessus
les **surcharge** pour ce bloc, il ne les remplace pas.

> **Pourquoi `jest.spyOn` sur un namespace fonctionne ICI**, alors qu'`AGENTS.md` le proscrit :
> l'interdiction porte sur `react-native`, dont `_interopRequireWildcard` copie des **descripteurs
> d'accesseur** dans un objet distinct. `src/call/audioRoute` est un module local compilé par
> Babel : son objet `exports` porte des propriétés ordinaires, et `import * as` en donne la
> **même** référence. C'est le motif déjà en place dans ce fichier, et les mutations de l'étape 4
> le confirment.

```bash
npx jest src/screens/room/call.spec.tsx
```

Attendu : les six tests nouveaux échouent — la feuille rend `devices={[]}` depuis la Tâche 7.

- [ ] **Étape 2 : Câbler le contrôle**

Dans `src/screens/room/callControlBar.tsx` :

1. Imports :
   ```diff
   +import type { AudioDeviceChoice } from 'src/call/audioDevices';
    import {
      audioRouteControl,
   +  clearAudioDevice,
   +  listAudioDevices,
      listAudioOutputs,
      openSystemRoutePicker,
   +  readCurrentAudioDeviceId,
   +  selectAudioDevice,
      selectAudioOutput,
    } from 'src/call/audioRoute';
   ```
2. Après `const [chosenOutput, setChosenOutput] = useState<AudioOutputKind | null>(null);` :
   ```tsx
   // Chemin 'devices' (Android >= 31). `currentDeviceId` est l'état CONSTATÉ, lu
   // par `getCommunicationDevice()` : la première fois de ce dépôt qu'un écran
   // peut montrer où le son part vraiment plutôt que ce qu'on a demandé.
   // `manualOutput` est distinct, parce qu'un identifiant courant est renseigné
   // même quand personne n'a rien choisi.
   const [devices, setDevices] = useState<readonly AudioDeviceChoice[]>([]);
   const [currentDeviceId, setCurrentDeviceId] = useState<number | null>(null);
   const [manualOutput, setManualOutput] = useState(false);
   ```
3. En tête de `handleOpenAudioOutput`, avant l'appel à `listAudioOutputs()` :
   ```tsx
   if (routeControl === 'devices') {
     Promise.all([listAudioDevices(), readCurrentAudioDeviceId()])
       .then(([list, current]) => {
         setDevices(list);
         setCurrentDeviceId(current);
       })
       .catch(() => {
         setDevices([]);
         setCurrentDeviceId(null);
       });
     return;
   }
   ```
4. Juste après `handleOpenAudioOutput`, deux gestionnaires :
   ```tsx
   // `setCommunicationDevice()` rend un booléen, et un `false` est un vrai
   // refus du système : la coche reste alors où elle était plutôt que d'annoncer
   // une route qui n'a pas pris. Même discipline que `handleSelectCamera`.
   const handleSelectAudioDevice = (device: AudioDeviceChoice): void => {
     selectAudioDevice(device.id)
       .then((routed) => {
         if (!routed) {
           onNotice('call.deviceSwitchFailed');
           return;
         }
         setCurrentDeviceId(device.id);
         setManualOutput(true);
         onNotice(null);
       })
       .catch(() => onNotice('call.deviceSwitchFailed'));
   };

   // `clearCommunicationDevice()` rend la main au système, ce qu'AudioSwitch ne
   // sait pas faire. L'identifiant courant est relu APRÈS : le système
   // rebasculera sur son propre choix, et l'écran doit montrer celui-là, pas le
   // nôtre effacé.
   const handleAutomaticAudioOutput = (): void => {
     clearAudioDevice()
       .then(() => readCurrentAudioDeviceId())
       .then((current) => {
         setManualOutput(false);
         setCurrentDeviceId(current);
       })
       .catch(() => onNotice('call.deviceSwitchFailed'));
   };
   ```
5. Dans `handleSelectAudioOutput`, après `setChosenOutput(kind);`, ajouter
   `setManualOutput(true);` — c'est ce qui fait que la note du mode catégories continue de basculer.
6. Remplacer les cinq props neutres posées en Tâche 7 :
   ```diff
   -        devices={[]}
   -        currentDeviceId={null}
   -        manual={chosenOutput !== null}
   -        onSelectDevice={() => undefined}
   -        onAutomatic={() => undefined}
   +        devices={devices}
   +        currentDeviceId={currentDeviceId}
   +        manual={manualOutput}
   +        onSelectDevice={handleSelectAudioDevice}
   +        onAutomatic={handleAutomaticAudioOutput}
   ```

- [ ] **Étape 3 : Exécuter et vérifier que ça passe**

```bash
npx jest src/screens/room/call.spec.tsx
```

**Exécuté** : `128 passed, 128 total`.

- [ ] **Étape 4 : Muter**

| Mutation | Rouges attendus |
|---|---|
| retirer la garde `if (routeControl === 'devices')` de `handleOpenAudioOutput` | ≥ 1 — « lit la liste ET l'état constaté » |
| `if (!routed)` → `if (false)` | 1 — « signale un refus du système » |
| retirer `setManualOutput(true)` de `handleSelectAudioDevice` | ≥ 1 — « coche ce que le système a réellement pris » |
| dans `handleAutomaticAudioOutput`, ne pas relire `readCurrentAudioDeviceId()` | 1 — « rend la route au système, et relit l'état constaté APRÈS » |

Les exécuter, une par une, et remettre le code en état après chacune. **Si l'une ne rougit rien,
c'est un trou de couverture, pas une bonne nouvelle** : ajouter le test manquant avant de continuer.

- [ ] **Étape 5 : Vérifier la barre**

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
```

Attendu : **63 suites / 978 tests**, `tsc` muet, **3 avertissements**, prettier propre.

- [ ] **Étape 6 : Committer**

```bash
git add src/screens/room/callControlBar.tsx src/screens/room/call.spec.tsx
git commit -m "feat(call): Wire the by-device output sheet to the native route owner"
```

---

## Tâche 9 : La passe de vérification sur appareil

**Ce que ce lot ne peut prouver autrement.** Il faut un téléphone Android 12 ou plus, un casque
Bluetooth, et un second appareil Bluetooth — la voiture, ou n'importe quel kit mains-libres HFP.
L'iOS Simulator ne publie ni caméra ni micro ; l'émulateur Android n'a pas de pile Bluetooth utile.

**Files:**

- Modify: `docs/superpowers/specs/2026-08-02-audio-output-by-device-design.md` (le relevé d'après)
- Modify: les fichiers que les constats obligeraient à corriger

**Interfaces:**

- Consomme : le relevé « avant » de la Tâche 1.
- Produit : un relevé « après », dans la même forme, et la réponse à la seule question qui compte —
  **la route que nous avons reprise se comporte-t-elle mieux que celle que nous avons remplacée ?**

- [ ] **Étape 1 : Construire, et vérifier la liaison**

```bash
npx expo prebuild --platform android --clean
npx expo run:android --device
```

- [ ] `git status` ne montre **pas** `android/`.

- [ ] **Étape 2 : La liste et les noms**

- [ ] Un seul Bluetooth allumé : la feuille montre **une ligne portant son nom réel**, pas
      « Bluetooth ». C'est la moitié du besoin qui n'existait pas.
- [ ] Les lignes intégrées portent bien `Haut-parleur` / `Écouteur` / `Casque filaire`, **jamais le
      modèle du téléphone**. Si le modèle apparaît, la conditionnelle
      `kind === 'bluetooth'` de la Tâche 2 n'a pas pris — c'est un bug de câblage, pas de nommage.
- [ ] **Deux Bluetooth allumés : DEUX lignes**, chacune nommée. C'est la chose qu'AudioSwitch ne
      pouvait pas faire, et c'est l'unique raison d'être de tout ce lot.
- [ ] Deux appareils de même nom : la seconde ligne porte un **ordinal**.

- [ ] **Étape 3 : La route**

- [ ] Appuyer sur une ligne : **le son y va**. Le vérifier à l'oreille, en séance, avec du son
      distant.
- [ ] Appuyer sur la **seconde** ligne Bluetooth : le son passe sur **l'autre** appareil. C'est le
      test qui distingue une reprise réussie d'une interface qui ment.
- [ ] La coche suit **ce qui a été pris**, pas ce qui a été demandé. Refermer et rouvrir la feuille
      pour le voir.
- [ ] Le **micro Bluetooth** fonctionne : se faire entendre du correspondant distant, casque sur les
      oreilles. C'est ce que `MODE_IN_COMMUNICATION` conditionne, et c'est ce qu'on a repris à
      AudioSwitch.

- [ ] **Étape 4 : Le retour à l'automatique, et l'absence de rebascule**

- [ ] Après un choix manuel, la ligne **Automatique** apparaît ; avant, elle est **absente**.
- [ ] L'appuyer : le son revient au choix du système, et la note redevient « le son suit l'appareil
      que vous branchez ».
- [ ] **Rester en séance deux minutes sans rien toucher** après un choix manuel, en allumant et en
      éteignant l'autre appareil. **Le son ne doit jamais repartir tout seul.** C'est le risque
      nommé par la Q1 de la spécification, et c'est le seul moment où il est observable.
- [ ] Raccrocher : le mode audio et le focus sont rendus. Le vérifier en lançant de la musique
      juste après — elle doit sortir normalement, sans être détournée vers l'écouteur.

- [ ] **Étape 5 : Les refus, et le plancher**

- [ ] Refuser `BLUETOOTH_CONNECT` à l'invite, puis entrer en séance : la ligne Bluetooth doit
      apparaître **avec le repli `call.output.bluetooth`** et non avec un nom vide ou un
      identifiant. C'est la vérification que la spécification demandait explicitement
      (« ce qui reste à vérifier est ce qui s'affiche **après un refus** »).
- [ ] Si un appareil Android 11 ou moins est disponible : la feuille montre **exactement** ce
      qu'elle montrait avant ce lot — quatre catégories au plus, pas de ligne « Automatique », pas
      de message. Si aucun appareil ancien n'est disponible, **le dire** plutôt que de le supposer.

- [ ] **Étape 6 : La lisibilité, qu'aucun test ne prouve**

- [ ] Téléphone en **thème clair** (le défaut de la plupart des appareils) : chaque ligne de la
      feuille est **lisible**, la note aussi, la coche aussi. C'est le seul endroit où le
      1,08:1 noir-sur-noir se voit.
- [ ] L'appui sur une ligne produit une **ondulation visible**. Sans `rippleColor`, elle est
      invisible sur `surfaceDark` — `SheetRow` en pose une, c'est ici qu'on le constate.

- [ ] **Étape 7 : Écrire le relevé d'après, et comparer**

Ajouter à la spécification, sous la section de la Tâche 1 :

```markdown
### Relevé d'après, 2026-08-XX : la route reprise **[V, sur appareil]**

Même appareil, mêmes deux appareils Bluetooth, application construite sur <sha>.

| Scénario | Avant (AudioSwitch) | Après (module local) |
|---|---|---|
| A connecté, entrée en séance | | |
| puis B connecté en séance | | |
| B connecté, entrée en séance | | |
| puis A connecté en séance | | |
| choix explicite de A alors que B est connecté | **impossible** | |
| retour à l'automatique | **impossible** | |
| les deux, extinction de celui qui reçoit | | |

**Verdict** : <la reprise fait-elle mieux, pareil, ou moins bien ? Et sur quel scénario ?>
```

**Si le verdict est « moins bien » sur un scénario, ne pas le taire et ne pas le corriger en
douce** : le consigner, et le porter au propriétaire. C'est la fonction même de ce garde-fou.

- [ ] **Étape 8 : Vérifier la barre et committer**

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
```

Attendu : **63 suites / 978 tests**. Si une correction de code s'est révélée nécessaire, elle porte
son propre test et le compte monte — le dire dans le message de commit.

```bash
git add docs/superpowers/specs/2026-08-02-audio-output-by-device-design.md
git commit -m "docs(spec): Record what the reclaimed audio route does on device"
```

---

## Tâche 10 : La contribution amont

**Hors de ce dépôt.** Elle ne bloque rien et rien ne la bloque : si elle aboutit, notre module
devient partiellement redondant et se réduit d'autant, ce qui est l'issue souhaitable.

**Ce qu'il faut proposer, et ce qu'il ne faut PAS proposer.** La reprise complète de la route n'a
rien à faire en amont : c'est un choix de produit, pas un défaut. Le **défaut**, lui, est réel,
petit, et manifestement juste — `getName()` existe sur chaque variante d'`AudioDevice` et il est
jeté à une ligne précise du pont :

```kotlin
// LivekitReactNativeModule.kt:130-134 — le nom meurt ici
val deviceIds = audioManager.availableAudioDevices()
    .mapNotNull { device -> AudioDeviceKind.fromAudioDevice(device)?.typeName }
```

- [ ] **Étape 1 : Vérifier que l'épingle n'a pas bougé depuis la rédaction**

```bash
grep -n audioswitch node_modules/@livekit/react-native/android/build.gradle
npm view @livekit/react-native time --json | tail -20
```

Attendu à la rédaction : `com.github.davidliu:audioswitch:89582c47c9a04c62f90aa5e57251af4800a62c9a`,
commit du **2023-10-16**, alors que la branche par défaut du fork porte
`CommunicationDeviceScanner` et `CommDeviceAudioSwitch` depuis le **2026-04-20**, et que deux
versions mineures ont été publiées entre-temps sans que l'épingle bouge. **Si elle a bougé, relire
la Q3 de la spécification avant d'ouvrir quoi que ce soit** : une partie de notre module pourrait
être devenue inutile.

- [ ] **Étape 2 : Ouvrir une issue, puis une PR, sur `livekit/client-sdk-react-native`**

Contenu de la PR, et rien de plus :

1. transporter le nom à travers le pont — un objet par appareil au lieu d'une chaîne, ou une méthode
   nouvelle à côté de `getAudioOutputs()` pour ne pas casser le contrat public ;
2. bumper l'épingle AudioSwitch vers un commit postérieur au 2026-04-20.

**Nommer, dans la description, la limite qui subsiste** : `AudioDevicePriorityComparator.compare`
rend `0` pour deux appareils de même classe et `availableUniqueAudioDevices` est un `SortedSet`, donc
**même à la tête du fork, deux casques Bluetooth restent une seule entrée**. Le correctif utile
touche trois dépôts. C'est une information, pas une demande.

- [ ] **Étape 3 : Consigner le lien**

Ajouter l'URL de la PR à la spécification, sous la Q3, avec sa date. Committer :

```bash
git commit -m "docs(spec): Link the upstream PR that carries the device name across the bridge"
```

---

## Auto-relecture

**1. Couverture de la spécification.**

| Élément de la spécification | Tâche |
|---|---|
| « lister par appareil, nommé » | 2, 3, 7 |
| « bascule automatique par défaut » — déjà livrée, ne pas la contredire à l'écran | 7 (`call.outputFollowsDevice` conservée), 8 (`manual`) |
| Décision : périmètre complet, choix par appareil | 4, 5, 7, 8 |
| Décision : focus, mode, cycle de route à notre charge | 4 |
| Décision : plancher API 31 avec `minSdkVersion` 24 | Contraintes globales, 3, 4, 5 |
| Décision : module Expo local d'abord, PR amont ensuite | 3, 4, 10 |
| Décision : ni fork, ni `patch-package` | Contraintes globales |
| Décision : la mesure deux-Bluetooth devient un garde-fou | **1** et **9** |
| Q2 : nom pour le Bluetooth, catégories localisées pour le reste | 2 (la conditionnelle), 7 |
| Q2 : repli sur `call.output.bluetooth`, jamais une chaîne anglaise en dur ni une ligne vide | 2, 7 |
| Q2 : « deux appareils connectés → une seule ligne » | **révisé, et c'est assumé** — voir ci-dessous |
| Fait 12 : `BLUETOOTH_CONNECT` déjà en place, rien de nouveau à demander | aucune tâche ; vérifié en 9 (§ refus) |
| Inconnue : `getProductName()` après un refus de permission | 9, étape 5 |
| Inconnue : cohérence de la lecture pendant qu'AudioSwitch manipule SCO | **dissoute** : AudioSwitch ne tourne plus sur ce chemin |
| iOS : rien n'est ajouté, `audioRouteControl()` rend `'system'` | Contraintes globales ; testé en 5 et 7 |
| Hors périmètre : code spécifique à un modèle | aucune tâche n'en écrit ; dit en 1 |
| Hors périmètre : persistance d'un choix entre séances | aucune tâche ; `manualOutput` est de l'état local |
| Hors périmètre : sélecteur de micro | aucune tâche |

**Le seul endroit où ce plan s'écarte de la spécification, et pourquoi.** La recommandation Q2 dit
« deux appareils connectés : **une seule ligne**, portant le nom de celui qui reçoit effectivement le
son », au motif qu'« afficher deux lignes dont une seule est honorable serait pire que la situation
actuelle ». **Ce motif était vrai sous AudioSwitch et ne l'est plus** : il reposait sur le fait 4 —
`getHeadset(name)` renvoie l'appareil qu'on lui décrit sans vérifier qu'il soit connecté. Avec
`setCommunicationDevice(info)`, chaque ligne est **honorable** : elle désigne un `AudioDeviceInfo`
que le système vient d'énumérer, et l'appel rend un booléen qui dit s'il a pris. La contrainte
tombait avec l'architecture qui la produisait, et c'est très exactement ce que la décision du
propriétaire a acheté.

**2. Recherche de trous.** Aucun « TBD », aucun « à compléter », aucun « comme la tâche N ». Chaque
extrait de test est donné en entier. Les seuls emplacements laissés à remplir sont les **cellules
des tableaux de relevés** des Tâches 1 et 9 : ce sont des mesures, elles ne peuvent pas être écrites
d'avance, et écrire une valeur plausible serait pire que la laisser vide.

**3. Cohérence des types.** `AudioDeviceChoice` porte les mêmes cinq champs en Tâches 2, 5, 7 et 8.
`AudioRouteControl` vaut `'devices' | 'menu' | 'system'` partout. `selectDevice` / `selectAudioDevice`
rendent un `boolean` en Kotlin, en TypeScript et dans les tests. `getCurrentDeviceId` /
`readCurrentAudioDeviceId` rendent `number | null` des trois côtés. Le `testID` d'une ligne
d'appareil est `audio-output-device-${id}` en Tâches 7 et 8, celui de la coche
`audio-output-check-${id}`, celui du retour `audio-output-automatic` — et jamais l'inverse.

**4. Ce qui a été prouvé en l'exécutant, et ce qui ne l'a pas été.**

| Prouvé **en exécutant** | Établi **en lisant** |
|---|---|
| chaque extrait de test : rouge d'abord, vert ensuite | le comparateur d'AudioSwitch (bytecode `javap`) |
| les 12 mutations du tableau ci-dessus, chacune avec son nombre de rouges | `getHeadset(name)` recopie son argument (bytecode) |
| l'accesseur dans la fabrique `jest.mock` atteint bien le module | les niveaux d'API (`api-versions.xml`) |
| `requireOptionalNativeModule` rend `null` sous Jest | les constantes `TYPE_*` (`javap -constants`) |
| l'autolinking découvre `modules/twake-audio-devices` | `Exceptions.ReactContextLost` existe |
| `git check-ignore` : `modules/*/android` est suivi | `startAudioSession()` n'appelle que `audioManager.start()` |
| prettier ignore `.kt`/`.gradle`, pas le `.json` | `getProductName()` rend le modèle du téléphone pour les sorties intégrées **[S]** |
| la barre complète reste verte à chaque étape | |

**Ce qui n'a été ni exécuté ni compilé : le Kotlin.** Aucune tâche Gradle n'a tourné pendant la
rédaction de ce plan. Le module a été écrit contre les signatures relevées dans `android.jar` et
contre le DSL d'`expo-modules-core` 57.0.7 lu à la source, et l'autolinking a bien été exercé — mais
**personne n'a encore vu ce fichier compiler**. C'est l'étape 6 de la Tâche 3 et l'étape 5 de la
Tâche 4, et elles ne sont pas des formalités.
