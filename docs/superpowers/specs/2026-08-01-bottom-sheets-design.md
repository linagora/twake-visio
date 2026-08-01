# Panneaux inférieurs — remplacer les trois menus de la barre de séance

Conception arrêtée le 2026-08-01, sur la branche `design/sheets`. Elle porte sur les trois
seules surfaces déroulantes de l'écran de séance : `audioOutputControl.tsx`, `cameraMenu.tsx`,
`moreMenu.tsx`. Elle ne touche ni le périmètre B (`participantsPanel.tsx`), ni les bandeaux.

Convention de lecture reprise des périmètres A à D : **[V]** vérifié en lisant du code ou en
exécutant une commande, **[S]** supposé, non mesuré. Une décision qui repose sur un **[S]** le
dit. Base de départ : `npx jest` → **51 suites, 625 tests, tous verts** (mesuré le 2026-08-01
dans ce worktree). **[V]**

---

## 1. Le problème

### 1.1 Le menu de sortie audio sort de l'écran par la gauche

Constaté sur appareil : Pixel 10 Pro Fold, Android 16, écran de couverture 1080 × 2364 à
densité 390, soit **443 dp** de large (`1080 × 160 / 390 = 443,08`). « Haut-parleur » et
« Écouteur » sont tronqués à gauche, la note « Le son suit l'appareil que vous branchez »
aussi. Capture à l'appui.

`barStyles.menuContent` (`src/screens/room/controlBar.ts:22`) ne pose qu'un `backgroundColor` :
**aucune contrainte de largeur.** C'est vrai, et ce n'est pas la cause entière — §2.3.

### 1.2 Le partenaire demande des panneaux par le bas

Motif : une ergonomie identique sur les deux plateformes. Ce document dit en §3.6 où cette
promesse **n'est pas tenue**, et pourquoi.

### 1.3 Cela converge avec un besoin déjà consigné

`docs/superpowers/specs/2026-07-30-scope-C-interaction-design.md:410-436` (§4.3) a déjà tranché
que le panneau du périmètre C **remplace la scène**, comme `ParticipantsPanel`, plutôt que de
se poser par-dessus — et §4.2 (lignes 403-408) a **refusé** une bibliothèque de feuille
inférieure, au motif que le panneau de B marche sans elle et que `legacy-peer-deps=true` rend
tout ajout coûteux.

**Ce document ne contredit pas ce refus, il le confirme** : la conversion retenue ici
n'installe rien (§3.1). Ce qu'elle change, c'est la brique des *menus* — trois surfaces que C
n'a jamais examinées, et dont l'une est cassée sur appareil.

---

## 2. Ce que le code dit aujourd'hui

### 2.1 Les trois surfaces, et ce qu'elles partagent

| Fichier | Ancre | Contenu | Enfants non-`Menu.Item` |
| --- | --- | --- | --- |
| `audioOutputControl.tsx:62-107` | `audio-output-btn` (44 dp) | note + N sorties | **oui** : `Text` `audio-output-note` (`:82`) |
| `cameraMenu.tsx:36-87` | `camera-menu-btn` (44 dp) | N caméras | non |
| `moreMenu.tsx:57-111` | `more-btn` (44 dp) | partage + `RecordingControl` + `HandControl` | **oui** : la file de `handControl.tsx:50-72` |

Toutes trois : `anchorPosition="top"`, `contentStyle={barStyles.menuContent}`, `Menu.Item` avec
`titleStyle={barStyles.menuTitle}` et `rippleColor={BAR_RIPPLE_COLOR}`.
`react-native-paper` installé : **5.15.3** **[V]**.

### 2.2 La géométrie de la barre, au dp près

`styles.controls` (`call.tsx:126-134`) : `flexDirection: row`, `justifyContent: center`,
`gap: 8`, `padding: 4`. `barStyles.button` (`controlBar.ts:17`) : `44 × 44`, `margin: 0`.
Six enfants de flux (`call.tsx:694-770`), dont la paire caméra qui en vaut deux plus 1 dp :

```
44 + (44 + 1 + 44) + 44 + 44 + 44 + 44 = 309    cinq écarts de 8 = 40    marges 2 × 4 = 8
                                              total = 357 dp
```

Identique au commentaire de `controlBar.ts:12`. **[V]**

Sur une fenêtre de largeur `W`, la rangée est centrée : le bord gauche du premier enfant est à
`4 + (W - 8 - 349) / 2`. Pour `W = 443` :

| Ancre | `x` | bord droit `x + 44` |
| --- | --- | --- |
| `mic-toggle` | 47 | 91 |
| `camera-menu-btn` (chevron) | 144 | 188 |
| `audio-output-btn` | 196 | **240** |
| `more-btn` | 248 | 292 |

Calculé depuis les styles, non mesuré sur appareil. **[S]** — mais §2.3 n'en dépend pas.

### 2.3 La cause du débordement, établie

Cinq faits, tous lus dans `node_modules/react-native-paper/src/components/Menu/`.

**F1 — La fenêtre de référence est `window`, jamais `screen`. [V]**
`Menu.tsx:105` (`const WINDOW_LAYOUT = Dimensions.get('window')`) et `Menu.tsx:306`
(relu à chaque ouverture). `grep -n "'screen'" Menu.tsx` ne rend **aucune ligne**.

**F2 — La mesure du menu précède l'application de sa position. [V]**
`show()` (`Menu.tsx:304-343`) appelle `measureMenuLayout()` (`:279-286`) **avant**
`setLeft(anchorLayoutResult.x)` (`:330`). À cet instant `left` vaut encore son état initial,
`0` (`Menu.tsx:201`), et le conteneur est `position: absolute` sans largeur
(`styles.wrapper`, `Menu.tsx:706-708`). **La largeur mesurée est donc la largeur libre du
contenu sur toute la fenêtre**, pas celle qu'il aura une fois posé.

**F3 — `Menu` n'impose aucune largeur. `Menu.Item` si, et lui seul. [V]**
`Menu.tsx:705-722` : ni `width`, ni `minWidth`, ni `maxWidth`. Les constantes
`MIN_WIDTH = 112` / `MAX_WIDTH = 280` vivent dans `Menu/utils.ts:9-10` et ne sont consommées
que par `MenuItem.tsx:212` et `MenuItem.tsx:249-250`. **Un enfant qui n'est pas un `Menu.Item`
n'est borné par rien** — c'est le cas du `Text` de note (`audioOutputControl.tsx:82`) et des
lignes de file (`handControl.tsx:55-70`).

**F4 — La branche de repli aligne à droite et ne borne jamais la gauche. [V]**
`Menu.tsx:459` : `let leftTransformation = left;`. Puis `Menu.tsx:466-494` :

```ts
466  if (left <= windowLayout.width - menuLayout.width - SCREEN_INDENT) {
475      if (leftTransformation < SCREEN_INDENT) leftTransformation = SCREEN_INDENT;   // borne gauche
478  } else {
486      leftTransformation += anchorLayout.width - menuLayout.width;
488      const right = leftTransformation + menuLayout.width;
490      if (right > windowLayout.width - SCREEN_INDENT)                                // borne DROITE
491          leftTransformation = windowLayout.width - SCREEN_INDENT - menuLayout.width;
494  }
```

`SCREEN_INDENT = 8` (`Menu.tsx:99`). **La borne gauche n'existe que dans la branche « ça
tient ».**

**F5 — Et dans la branche de repli, l'unique borne est structurellement morte. [V]**
C'est de l'algèbre, elle ne demande aucune mesure. En ligne `488` :

```
right = leftTransformation + menuLayout.width
      = (left + anchorLayout.width - menuLayout.width) + menuLayout.width
      = left + anchorLayout.width
```

`right` est donc **exactement le bord droit de l'ancre**, quelle que soit la largeur du menu.
Le test de la ligne `490` ne peut être vrai que si l'ancre elle-même déborde de la fenêtre par
la droite à moins de 8 dp près. **Pour toute ancre qui n'est pas collée au bord droit de
l'écran, ce `if` ne s'exécute jamais**, et `leftTransformation` reste à
`left + anchorLayout.width - menuLayout.width`, négatif dès que le menu est plus large que le
bord droit de son ancre.

**Le débordement à gauche se produit donc exactement quand :**

```
menuLayout.width > windowLayout.width - 8 - left     (la branche de repli est prise)
et  menuLayout.width > left + anchorLayout.width     (le résultat est négatif)
```

Appliqué aux trois ancres sur `W = 443` (§2.2), avec `anchorLayout.width = 44` :

| Surface | repli pris si largeur > | débordement si largeur > | borne réelle du contenu |
| --- | --- | --- | --- |
| caméra | 291 | 188 | ≤ 280 (`MenuItem.tsx:250`) → **sûr** |
| **sortie audio** | 239 | **240** | **non bornée** (F3) → **casse** |
| plus | 187 | 292 | ≈ 280 → marginal (`248 + 44 − 280 = +12`) |

La seule surface non bornée est celle qui casse. Cela n'est pas une coïncidence : c'est F3.

> **Le même calcul sur un téléphone de 360 dp** place `more-btn` à `x ≈ 206,5`, donc
> `206,5 + 44 − 280 = −29,5`. **Le menu « plus » déborde déjà de 30 dp sur un téléphone
> ordinaire**, avec une file de mains levées vide. Personne ne l'a signalé — un `Menu.Item`
> commence par une marge intérieure, donc les 30 premiers dp coupés ne mangent pas encore de
> lettres. Ce n'est pas un bug de pliable. **[S]** sur la valeur de `x`, **[V]** sur
> l'arithmétique.

### 2.4 Ce qui n'est **pas** établi

**L'hypothèse « Paper mesure mal l'ancre sur un pliable » n'est pas confirmée, et le code
la rend peu probable.** `measureInWindow` (`Menu.tsx:297`) et `Dimensions.get('window')`
(`Menu.tsx:105, 306`) portent tous deux sur la **fenêtre de l'application**, pas sur l'écran
physique : un écran de couverture et un écran intérieur qui diffèrent ne créent aucune
incohérence entre ces deux mesures tant qu'elles sont lues au même instant. Le mécanisme de
§2.3 se reproduirait à l'identique sur n'importe quelle fenêtre de 443 dp, pliable ou non.

**Ce qui reste ouvert** : `windowLayout` n'est relu qu'à l'ouverture (`Menu.tsx:306`), et rien
ne réagit à un pliage survenu **pendant** qu'un menu est ouvert. Non mesuré, et hors du cas
signalé (le menu était fermé au moment du pliage). **Non établi.**

**La largeur réelle de `menuLayout.width` sur appareil n'a pas été mesurée.** Les seuils du
tableau ci-dessus sont **[V]** ; les largeurs comparées à ces seuils sont **[S]**. La note
française fait 40 caractères au repos (`fr.json` → `call.outputFollowsDevice`) et **68** après
un choix (`call.outputManualUntilEnd`), en `labelSmall`, avec `paddingHorizontal: 16`
(`controlBar.ts:33`) et **sans `numberOfLines`**.

### 2.5 Pourquoi une largeur maximale ne suffit pas

`contentStyle` est fusionné **par clé**, en dernière position du tableau de styles de la
`Surface` (`Menu.tsx:673-681`) : un `maxWidth` posé là serait bien appliqué, et bornerait la
mesure de F2. Le correctif d'une ligne existe donc.

**Il ne suffit pas.** Une largeur `M` est sûre pour une ancre à `left` si et seulement si
`M ≤ max(W - 8 - left, left + 44)`. Pour `audio-output-btn` : `W = 443` → `M ≤ 240` ;
`W = 360` → `M ≤ 198,5`. **La borne sûre dépend de la largeur de la fenêtre et de la position
de l'ancre dans la rangée** — donc du nombre de commandes de la barre, que le périmètre C se
réserve de changer. Une constante de 198 dp ferait tenir « Le son ne suivra plus l'appareil
branché pour le reste de la réunion » en quatre lignes, et redeviendrait fausse au premier
bouton déplacé.

**Conclusion : le placement horizontal de `Menu` n'est pas paramétrable en sûreté depuis
l'extérieur.** C'est l'argument technique qui tranche §3.1, avant tout argument d'ergonomie.

### 2.6 L'inventaire des dépendances, vérifié

| Fait | Établi par |
| --- | --- |
| `react-native-paper` **n'a aucun composant de feuille** | `find node_modules/react-native-paper/src/components -iname "*sheet*"` → vide ; `grep -rli "bottomsheet\|bottom-sheet"` → vide. `BottomNavigation` est une barre d'onglets ; `Drawer` n'exporte que `Item`/`CollapsedItem`/`Section` **[V]** |
| `@gorhom/bottom-sheet` **absent** | `ls node_modules/@gorhom` → inexistant ; `grep gorhom package-lock.json` → 0 sur 16 891 lignes **[V]** |
| ses pairs **seraient satisfaits** | `npm view @gorhom/bottom-sheet peerDependencies` → gesture-handler `>=2.16.1`, reanimated `>=3.16.0 \|\| >=4.0.0-`. Installés : **2.32.0** et **4.5.1**, tous deux dépendances directes (`package.json:40,44`) **[V]** |
| il ajouterait **un** paquet sur le disque | `npm view … dependencies` → `@gorhom/portal@1.0.14` (absent) et `invariant@^2.2.4` (déjà présent en 2.2.4) **[V]** |
| gesture-handler et reanimated sont **inutilisés** par l'application | `grep -rn` sur `src/` et `app/` pour `react-native-gesture-handler`, `react-native-reanimated`, `GestureHandlerRootView`, `useSharedValue`, `withTiming` → **zéro occurrence** **[V]** |
| il n'y a **pas** de `GestureHandlerRootView` à la racine | `app/_layout.tsx:47-63` **[V]** |
| Jest ne transformerait pas `@gorhom` | `jest.config.js:5-7`, dont l'alternance ne contient pas `@gorhom` ; cette clé **remplace** celle du préréglage `jest-expo` **[V]** — son `main` pointe sur du CommonJS pré-compilé, donc cela *pourrait* passer : **non établi** |
| `react-native-screens` **4.26.2** sait faire une feuille **native** | `lib/typescript/types.d.ts:470` : `formSheet` → `UIModalPresentationFormSheet` sur iOS, `Material BottomSheetBehaviour` sur Android. Détentes : `:334, :344, :363, :371, :411` **[V]** |
| `Portal` est déjà monté à la racine | `PaperProvider.tsx:111-118` enveloppe `children` d'un `PortalHost` **[V]** |

**Corollaire sur `legacy-peer-deps`** : le réflexe « un pair manquera » ne se vérifie **pas**
ici. Les deux pairs de `@gorhom/bottom-sheet` sont déjà des dépendances directes de premier
niveau, donc npm ne les résout jamais comme pairs. L'argument contre reste — §3.1 — mais ce
n'est pas celui-là, et le dire autrement serait faux.

---

## 3. Décisions

### D1 — La brique est le `Modal` de `react-native-paper`. Aucune dépendance nouvelle.

Un `Modal` (`react-native-paper/src/components/Modal.tsx`) devient une feuille inférieure par
**une seule propriété** : son enveloppe est `{...StyleSheet.absoluteFill, justifyContent:
'center'}` (`Modal.tsx:238-241`) et la prop `style` est appliquée **après**
(`Modal.tsx:210-215`) ; `justifyContent: 'flex-end'` colle donc la `Surface` en bas.

Ce qu'il apporte déjà, sans rien écrire :

- `dismissable = true` (`Modal.tsx:104`) → l'appui sur le fond referme ;
- `dismissableBackButton` (`:105`) + un `BackHandler` (`:159-178`) → **le bouton retour Android
  referme**, ce que `Menu` ne fait pas ;
- `useSafeAreaInsets()` (`:118`) reporté en `marginTop` / `marginBottom` (`:213`) ;
- `if (!visibleInternal) return null` (`:181-183`) → **rien n'est monté à l'état fermé**, donc
  les assertions `queryByTestId(…) → null` existantes restent vraies ;
- quatre `testID` : `modal`, `modal-backdrop`, `modal-wrapper`, `modal-surface`
  (`:193, :208, :217, :220`) ;
- `contentContainerStyle` posé en dernier sur la `Surface` (`:219-224`).

**Ce qu'il n'apporte pas, nommé** : ni glissement pour refermer, ni points d'accroche
(détentes), ni évitement du clavier — `grep -n -i keyboard Modal.tsx` ne rend **aucune ligne**,
alors que `Menu.tsx:8, 221-228, 411-418, 343` en gère un. Voir D3.

**Refusé : `@gorhom/bottom-sheet`.** Non pour ses pairs (§2.6 montre qu'ils sont satisfaits),
mais pour trois coûts réels : il exige un `GestureHandlerRootView` à la racine
(`app/_layout.tsx` n'en a pas), il met en service sur l'écran WebRTC un moteur de worklets
(gesture-handler + reanimated) que **zéro ligne** de `src/` n'utilise aujourd'hui, et il oblige
à élargir `jest.config.js:5-7` sans qu'on sache si le paquet passe (§2.6). Le bénéfice —
glissement, détentes — n'est demandé par aucune des trois surfaces : ce sont des listes de
deux à quatre lignes.

**Refusé : `formSheet` de `react-native-screens`.** Natif, déjà installé, séduisant. Mais c'est
une présentation de **route** : chaque feuille deviendrait un fichier sous `app/`, l'état de
`call.tsx` devrait survivre à une navigation, et sur Android « nested stack rendering is not
yet supported » (`types.d.ts:470`). On échangerait un bug de placement contre un problème de
cycle de vie sur l'écran qui tient la session LiveKit. À reconsidérer si une feuille doit un
jour héberger un clavier (D3).

### D2 — La doctrine de contraste survit, à condition de réécrire deux `testID` que `Menu.Item` donnait gratuitement

C'est le vrai coût du changement. Détail complet en §4.2 et §6.

| Garde d'`AGENTS.md` | Après conversion |
| --- | --- |
| surface via `` `${testID}-surface` `` (`Menu.tsx:683`) | **conservée à l'identique** — `Modal.tsx:220` expose le même suffixe. `menu-surface` devient `audio-output-sheet-surface`, etc. |
| `titleStyle` d'un `Menu.Item`, gardé via `` `${testID}-title` `` (`MenuItem.tsx:225`) | **perdue si l'on passe à `List.Item`** : `ListItem.tsx` n'expose que `testID` (`:244`) et `` `${testID}-content` `` (`:259`), **jamais un `-title`**. D'où le composant `SheetRow` de §4.2, qui rend le `Text` lui-même et **restitue le suffixe `-title`** |
| `rippleColor` | **toujours hors de portée**, et pour la raison déjà écrite dans `AGENTS.md` : `Platform.OS` vaut `'ios'` sous Jest (`@react-native/jest-preset/jest-preset.js:16-19`, via `jest-expo/jest-preset.js:9` **[V]**), donc `TouchableRipple.supported` est faux |
| `iconColor` d'un `IconButton` à icône-chaîne | **inchangée, toujours ingardable** — les trois ancres restent des `IconButton` |
| glyphe de coche (`menuCheck.tsx`) | **conservée** : c'est un `Text` avec son propre `testID`, indifférent au conteneur |
| jamais de `disabled` | **inchangée** |

**Deux surfaces nouvelles à couvrir, et une bonne nouvelle.** Le fond du `Modal` provient de
`theme.colors.backdrop`, que `src/ui/theme.ts:11-19` **ne redéfinit pas**. Il vaut
`rgba(50, 47, 55, 0.4)` — et **identiquement dans les deux thèmes** (`v3/LightTheme.tsx:52` et
`v3/DarkTheme.tsx:53` posent la même expression ; `v3/tokens.tsx:69` pour `neutralVariant20`).
**[V]** C'est la seule couleur de Paper sur cet écran qui ne suive pas le schéma système :
elle assombrit la scène sans jamais l'éclaircir. Rien à forcer.

En revanche `styles.content` du `Modal` pose `backgroundColor: 'transparent'`
(`Modal.tsx:243-246`) : **la `Surface` d'un `Modal` n'a aucun fond par défaut.** Le
`contentContainerStyle` porteur de `surfaceDark` n'est donc pas une précaution, c'est une
obligation — et la garde `-surface` de `moreMenu.spec.tsx:105-107` prend d'autant plus de sens.

**Les ratios ne changent pas**, parce que la couleur de surface ne change pas : `textDark` sur
`surfaceDark` reste à 15,86:1 (`controlBar.ts:21`), `dangerDark` sur `surfaceDark` à 8,21:1
(`controlBar.ts:24`), `textDark` sur `backgroundDark` à 16,65:1 (`controlBar.ts:48`). Aucune
mesure de contraste n'est à refaire.

### D3 — Le clavier : pas maintenant, et le chat n'a pas à devenir une feuille

`Modal` n'a **aucun** évitement de clavier (§3, D1). Y poser un `TextInput` produirait un champ
sous le clavier.

Mais rien ne l'exige. Le périmètre C a déjà arrêté que son panneau **remplace la scène**
(`2026-07-30-scope-C-interaction-design.md:410-419`), avec un motif qui vaut toujours : « avec
le clavier ouvert, un panneau *superposé* laisserait de toute façon une bande de vidéo
inexploitable » (`:450`). **Le chat n'est pas une feuille inférieure et n'a pas à le devenir.**
Ce document convertit trois *menus* — des listes de deux à quatre lignes, sans champ de saisie
ni aujourd'hui ni dans le plan de C.

**Décision : la feuille ne gère pas le clavier, et c'est écrit dans son en-tête de fichier.**
Précondition nommée : **aucun `TextInput` ne doit être placé dans un `BottomSheet` avant qu'un
évitement de clavier y soit ajouté.** Le jour où il le faudrait, deux voies existent et sont
déjà instruites : un `KeyboardAvoidingView` dans la feuille, ou `formSheet` (D1), dont
`types.d.ts:393` dit que l'implémentation native redimensionne d'elle-même à l'apparition du
clavier. Aucune des deux n'est ouverte ici.

### D4 — La barre ne bouge pas d'un dp

Trois `IconButton` d'ancre, trois `IconButton` après. `357 dp` avant, `357 dp` après. Aucune
huitième cible, donc jamais 409 (`controlBar.ts:12`, `scope-C:421-428`). La prop
`anchorPosition="top"` disparaît des trois fichiers : elle n'existe que pour `Menu`, et une
feuille est en bas par construction.

### D5 — Ce qui s'appellerait « menu » est renommé

Une feuille dont les styles s'appellent `menuContent` ment. Renommages, tous internes :

| Avant | Après |
| --- | --- |
| `barStyles.menuContent` (`controlBar.ts:22`) | `sheetStyles.surface` |
| `barStyles.menuTitle` (`:23`) | `sheetStyles.rowTitle` |
| `barStyles.menuTitleDanger` (`:28`) | `sheetStyles.rowTitleDanger` |
| `barStyles.menuNote` (`:31`) | `sheetStyles.note` |
| `barStyles.check` (`:45`) | `sheetStyles.check` |
| `src/screens/room/menuCheck.tsx`, `MenuCheck` | `sheetCheck.tsx`, `SheetCheck` |

Coût mesuré : deux fichiers importateurs (`cameraMenu.tsx:12`, `audioOutputControl.tsx:14`) et
deux spécifications qui ne citent le nom que dans des commentaires. `BAR_ICON_COLOR`,
`BAR_RIPPLE_COLOR` et `BAR_HIT_SLOP` **ne bougent pas** : ils décrivent la barre, qui reste.

### D6 — La promesse d'ergonomie identique n'est pas tenue pour la sortie audio, et il faut le dire

`audioOutputControl.tsx:60` : `if (mode === 'system') return button(onSystemPicker)`. Sur iOS,
il n'y a **rien à lister** — `getAudioOutputs()` y est une constante à deux entrées qui ne sont
pas des catégories (`2026-07-30-scope-A-devices-design.md`, §2.1) — et le seul recours est le
sélecteur de la plateforme, dont l'apparence ne nous appartient pas.

**Sur iOS, la sortie audio ne montrera donc jamais de feuille.** Caméra et « plus » deviennent
identiques sur les deux plateformes ; la sortie audio reste divergente, et pour une raison qui
n'a rien à voir avec la brique choisie.

---

## 4. Architecture

### 4.1 `src/screens/room/bottomSheet.tsx` — la coquille, nouvelle

Un composant, une responsabilité : poser une `Surface` sombre en bas de l'écran.

```ts
export type BottomSheetProps = {
  readonly testID: string;
  readonly visible: boolean;
  readonly title: string;          // déjà traduit par l'appelant
  readonly onDismiss: () => void;
  readonly children: React.ReactNode;
};
```

Rend `<Portal>` → `<Modal>`, avec :

- `testID={testID}` → la `Surface` porte `` `${testID}-surface` `` (`Modal.tsx:220`) ;
- `style={sheetStyles.wrapper}` où `wrapper = { justifyContent: 'flex-end' }` — la seule ligne
  qui fait la feuille (D1) ;
- `contentContainerStyle={sheetStyles.surface}` portant `backgroundColor:
  tokens.color.surfaceDark`, `borderTopLeftRadius` / `borderTopRightRadius:
  tokens.radius.lg`, `paddingVertical: tokens.spacing.sm` ;
- `overlayAccessibilityLabel={…}` — **obligatoire** : le défaut est la chaîne anglaise en dur
  `'Close modal'` (`Modal.tsx:107`), ce qu'interdit la règle « aucune chaîne en dur »
  d'`AGENTS.md`. Nouvelle clé i18n, §4.6 ;
- un `Text testID={`${testID}-title`}` portant `title` avec `sheetStyles.rowTitle`.

`Portal` est nécessaire : `Modal.tsx` n'en contient aucun (sa documentation, `:71` et `:88-92`,
demande à l'appelant de l'envelopper). L'hôte existe déjà (`PaperProvider.tsx:113`).

**La marge basse est celle de Paper, pas la nôtre.** `Modal.tsx:213` pose `marginBottom` égal à
l'encart bas du `SafeAreaProvider`. Conséquence assumée : sur un iPhone à barre d'accueil, une
bande de 34 pt de fond reste visible **sous** la feuille — elle ne se colle pas au bord
physique. C'est le même traitement que `app/_layout.tsx:60` applique déjà à tous les écrans, et
le lire autrement demanderait un `paddingBottom` dynamique, donc un `style={{…}}` littéral, que
`AGENTS.md` interdit. Sur Android à navigation gestuelle l'encart est nul et la feuille est
bord à bord.

### 4.2 `src/screens/room/sheetRow.tsx` — la ligne, nouvelle, et c'est elle qui sauve la doctrine

`Menu.Item` ne peut pas être réutilisé hors d'un `Menu` : il s'impose
`minWidth: 112` / `maxWidth: 280` (`MenuItem.tsx:249-250`), ce qui brocherait une ligne au
milieu d'une feuille pleine largeur. `List.Item` conviendrait à la mise en page — c'est le
précédent de `participantsPanel.tsx:45-48` — mais **il n'expose aucun `testID` sur son
titre** (`ListItem.tsx:244, :259` seulement).

`SheetRow` reproduit donc exactement les deux `testID` de `Menu.Item` :

```ts
export type SheetRowProps = {
  readonly testID: string;
  readonly title: string;
  readonly titleStyle?: StyleProp<TextStyle>;   // rowTitle ou rowTitleDanger
  readonly leading?: React.ReactNode;           // SheetCheck, ou rien
  readonly accessibilityLabel?: string;
  readonly onPress: () => void;
};
```

`TouchableRipple` (`testID={testID}`, `rippleColor={BAR_RIPPLE_COLOR}`) → `View` de rangée →
`leading` → `Text testID={`${testID}-title`}`. `TouchableRipple` étale `{...rest}` sur son
`Pressable` (`TouchableRipple.native.tsx:94, 107`), donc le `testID` arrive bien sur l'élément
pressable, comme `MenuItem.tsx:191`.

**Conséquence : `share-btn` et `share-btn-title` gardent leur nom, et
`moreMenu.spec.tsx:108` n'a pas une ligne à changer.** Ce que `Menu.Item` donnait, on le rend.
Et l'on y gagne : `numberOfLines` et la largeur de la ligne deviennent les nôtres, ce qui ferme
F3 (§2.3) définitivement — une feuille est large comme l'écran, plus rien ne dépend d'une
mesure de texte.

### 4.3 `src/screens/room/controlBar.ts` — renommé, une entrée ajoutée

Les cinq renommages de D5, plus `sheetStyles.wrapper = { justifyContent: 'flex-end' }` et
`sheetStyles.row`. Les commentaires de contraste existants (`:20-21`, `:24-27`, `:29-30`,
`:36-45`, `:48-51`, `:54-67`) sont **conservés mot pour mot** : ils portent des ratios mesurés
et des raisons qui n'ont pas changé. Ceux qui disent « menu » disent désormais « feuille ».

### 4.4 Les trois surfaces

Aucune ne change de forme : `useState(false)`, l'`IconButton` d'ancre rendu **hors** de la
feuille, la feuille rendue à côté.

```tsx
// cameraMenu.tsx, forme cible
return (
  <>
    <IconButton testID="camera-menu-btn" … onPress={() => { setVisible(true); onOpen(); }} />
    <BottomSheet
      testID="camera-sheet"
      visible={visible}
      title={t('call.selectCamera')}
      onDismiss={() => setVisible(false)}
    >
      {cameras.map((camera) => (
        <SheetRow key={camera.deviceId} testID={`camera-option-${camera.deviceId}`} … />
      ))}
    </BottomSheet>
  </>
);
```

`audioOutputControl.tsx` garde son aiguillage `mode === 'system'` intact (D6) et sa note passe
d'un `Text` nu à un `Text` dans la feuille, avec le même `testID` `audio-output-note` et le
même style. `moreMenu.tsx` garde ses trois entrées et l'ordre actuel.

### 4.5 `handControl.tsx` et `recordingControl.tsx` — deux `Menu.Item` à convertir

`recordingControl.tsx:43-51` et `handControl.tsx:41-48` rendent chacun un `Menu.Item`
directement : ils deviennent des `SheetRow`. Leurs `testID` (`recording-toggle`, `hand-toggle`)
et toute leur logique d'absence — `if (!canStart) return null` (`recordingControl.tsx:36-37`),
`busy ? null : …` (`handControl.tsx:40`) — sont **inchangés**. La règle « on masque, on ne
grise pas » n'est pas touchée.

Les lignes de file (`handControl.tsx:58-70`) restent des `Text` non pressables, pour la raison
déjà écrite `:26-28` : on ne baisse pas la main d'autrui.

### 4.6 i18n — une clé nouvelle, et une seule

`call.closeSheet` (« Fermer », étiquette d'accessibilité du fond), pour remplacer le
`'Close modal'` en dur de `Modal.tsx:107`. Les trois titres réutilisent des clés existantes :
`call.audioOutput`, `call.selectCamera`, `call.more`.

Les fichiers de locale sont **plats, à clés pointées** (vérifié : `Object.keys(en)` rend 83
clés dont `'call.output.speaker'`), et `src/i18n/index.spec.ts:17-22` compare l'ensemble
complet des clés de chaque locale à celui de `en`. **Une clé absente d'une des sept fait
rougir la suite** — la garde est réelle, pas nominale. **[V]**

---

## 5. Ce qui est hors périmètre, explicitement

1. **Le chat, les réactions, le badge de non-lus** — périmètre C, et son panneau remplace la
   scène (D3). Ce document ne l'anticipe pas.
2. **`ParticipantsPanel`** — il marche, il remplace la scène, il n'a jamais débordé.
3. **Le glissement pour refermer et les détentes** — `Modal` ne les a pas (D1) ; aucune des
   trois listes n'en a besoin.
4. **L'évitement du clavier** — D3, avec sa précondition nommée.
5. **La barre elle-même** : géométrie, `BAR_HIT_SLOP`, `iconColor`, ordre des boutons. D4.
6. **Le sélecteur de route iOS** — D6.
7. **Corriger `react-native-paper` en amont.** Le défaut de `Menu.tsx:478-494` est réel et
   mérite un rapport en amont, mais l'attendre laisserait le bug en production.
8. **Un `maxWidth` de secours sur `barStyles.menuContent`.** Une ligne, un effet réel mais
   partiel (§2.5). À poser **uniquement** si cette conversion est repoussée — auquel cas la
   valeur sûre est `198 dp`, pas `280`.
9. **Les autres écrans** : `lobby`, `prejoin`, `create`, `home`, `server` n'ont pas de menu.

---

## 6. Les tests, et ce qu'ils garderont

### 6.1 Ce qui est conservé sans modification

Toute la logique de comportement des trois spécifications : relecture à l'ouverture
(`cameraMenu.spec.tsx:95-112`, `audioOutputControl.spec.tsx:69-90`), ligne pressée ≠ première
de la liste (`cameraMenu.spec.tsx:114-140`, `audioOutputControl.spec.tsx:116-140`), coche du
seul élément actif, listes vides, fermeture après appui (`moreMenu.spec.tsx:183-208`), absences
plutôt que grisages (`moreMenu.spec.tsx:165-181, 236-244`), noms interpolés
(`cameraMenu.spec.tsx:223-270`). Les `testID` de ligne ne changent pas, donc ces tests non plus.

`moreMenu.spec.tsx:81-87` (« ne montre rien avant l'ouverture ») reste vrai : `Modal.tsx:182-184`
ne monte rien tant que `visibleInternal` est faux. **[V]**

### 6.2 Ce qui change d'une chaîne

`moreMenu.spec.tsx:105-107` : `getByTestId('menu-surface')` → `getByTestId('more-sheet-surface')`.
Même assertion, même token, même raison. C'est **la seule** modification d'assertion existante.

### 6.3 Ce qui devient écrivable, et qui ne l'était pas

- **La garde de surface sur les trois feuilles.** Aujourd'hui seul `moreMenu.spec.tsx:105-107`
  la porte ; `cameraMenu.spec.tsx` et `audioOutputControl.spec.tsx` ne gardent **pas**
  `menu-surface`. Trois assertions
  `toHaveStyle({ backgroundColor: tokens.color.surfaceDark })`, et elles comptent d'autant plus
  que la `Surface` d'un `Modal` est transparente par défaut (`Modal.tsx:243-246`, D2).
- **La garde de titre sur chaque ligne.** `SheetRow` rend le suffixe `-title` pour **toutes**
  les lignes : `camera-option-*-title`, `audio-output-option-*-title`, `hand-toggle-title`,
  là où seul `share-btn-title` était gardé jusqu'ici (`moreMenu.spec.tsx:108`).

  > **Corrigé avant implémentation : `recording-toggle-title` fait exception, et cette
  > rédaction se trompait à son sujet.** Elle affirmait que la variante d'alerte n'avait
  > « jamais été gardée jusqu'ici ». C'est faux, et vérifié :
  > `recordingControl.spec.tsx:60-61` garde le côté clair (`textDark`, phase `idle`),
  > `:84-86` le côté alerte (`dangerDark`, phase `recording`), et `:106-108` **boucle sur
  > les trois autres phases** avec ce motif écrit : « sans cette boucle, un `titleStyle`
  > codé en dur sur `state.phase === 'starting'` afficherait la bonne couleur au test
  > précédent tout en repassant en clair ici ». C'est-à-dire exactement la discipline —
  > faire varier la valeur sur laquelle le code branche — que le lot précédent a dû
  > apprendre à ses dépens, appliquée ici avant qu'elle soit écrite nulle part. **Ne pas
  > réécrire ces trois tests.**
- **La couleur de la note.** `audio-output-note` n'est gardé que par son texte
  (`audioOutputControl.spec.tsx:198, 215-218`) ; sa couleur ne l'est pas, alors qu'elle l'est
  déjà (`controlBar.ts:31-35`). Une assertion à ajouter, indépendamment de cette conversion.
- **Le titre de la feuille**, `` `${testID}-title` ``, texte et couleur.

### 6.4 Ce qui disparaît, et pourquoi

`settleMenus()` — les 32 ms de vidage de `cameraMenu.spec.tsx:42-46`,
`audioOutputControl.spec.tsx:24-28` et `moreMenu.spec.tsx:28-32`, dont un commentaire mesure le
prix : « 39 ouvertures sur 40 sans ce vidage, 300 sur 300 avec »
(`cameraMenu.spec.tsx:41`).

Ce contournement existe parce que `Menu.show()` **se rappelle lui-même par
`requestAnimationFrame` tant qu'une des mesures est nulle** (`Menu.tsx:318-328`). `Modal` ne
mesure rien : ni `measureInWindow`, ni `Dimensions`, ni `rAF`. **La boucle de reprise n'existe
pas, donc l'instabilité qu'elle causait non plus.** **[V]** sur l'absence dans `Modal.tsx` ;
**[S]** sur le fait que les trois suites redeviennent stables sans `settleMenus` — à confirmer
par exécution, pas par lecture.

`PaperProvider theme={{ animation: { scale: 0 } }}` **reste utile** : `Modal.tsx:125` lance
un `Animated.timing` de durée `scale * DEFAULT_DURATION`, et `hideModalAnimation` ne remet
`visibleInternal` à faux qu'à sa fin. Ne pas le retirer.

`jest.mock('react-native-safe-area-context', …)` **reste obligatoire** : `Modal.tsx:118` appelle
`useSafeAreaInsets()`, là où `Menu` s'en passait.

---

## 6bis. Ce que la conversion a PERDU, et qu'il a fallu rendre

Relevé en revue de branche, après implémentation. `Menu` faisait trois choses que `Modal` ne
fait pas, et deux n'avaient été vues par personne avant la revue.

**Un rôle d'accessibilité sur chaque ligne.** `MenuItem.tsx:194` posait
`accessibilityRole="menuitem"` ; `TouchableRipple` n'en pose aucun. Toutes les lignes
converties — partage, enregistrement, main levée, chaque caméra, chaque sortie audio —
étaient donc annoncées comme du texte quelconque, sans rien qui dise qu'on peut appuyer.
Rendu par `SheetRow` (`accessibilityRole="button"`), gardé, et la mutation mesurée à 1 rouge.
**Aucun test préexistant n'aurait pu le signaler, et rien ne se voit à l'œil** : c'est une
régression qui ne coûte qu'aux gens qui n'ont pas le choix de la contourner.

**Une borne de hauteur, et un défilement au-delà.** `Menu.tsx:496-539` bornait ; `:687-693`
enveloppait d'un `ScrollView` au-delà d'un seuil. `Modal` ne fait ni l'un ni l'autre.
Calculé depuis les métriques MD3 de Paper (~240 dp fixes, ~32 dp par ligne), la feuille
sortait de l'écran à environ **onze mains levées en portrait et trois en paysage** — en
emportant son propre titre, sans moyen de le ramener. `handControl.tsx` mappe la file sans
borne et rien n'en pose une en amont. Réglé dans la coquille (`maxHeight: '80%'` + un
`ScrollView` qui laisse le titre dehors), pas chez les appelants.

**Une fermeture au changement de dimensions.** `Menu.tsx:271-275` refermait la surface quand
`Dimensions` changeait : plier l'appareil fermait donc le menu ouvert. `Modal` ne le fait
pas, et §3 de ce document affirmait l'inverse. **Non traité** : le comportement souhaitable
n'est pas évident — refermer une feuille au pliage peut aussi bien être une perte. À
arbitrer, d'autant que le pliable est l'appareil sur lequel le bug d'origine a été signalé.

## 7. Ce qu'aucun test ne prouvera

**RNTL ne rastérise rien.** Aucune des assertions de §6 ne prouve qu'un texte est lisible : un
contraste perçu ne se mesure qu'en lisant ensemble le thème, le fond et le composant — ou sur
un appareil. Elles prouvent une seule chose, et elle vaut d'être écrite : **la couleur
explicite n'a pas été retirée**, parce que l'assertion est une égalité stricte et que n'importe
quel repli la fait échouer.

**Et six choses précises, propres à cette conversion, resteront hors de portée :**

1. **Que la feuille est en bas de l'écran.** `justifyContent: 'flex-end'` sur l'enveloppe est
   assertable ; qu'il produise une feuille inférieure plutôt qu'une boîte centrée ne l'est pas
   — Jest ne dispose pas les vues.
2. **Que le débordement de §2.3 a disparu.** Le calcul de `Menu.tsx:466-494` n'a plus lieu
   puisque `Menu` n'est plus monté ; c'est une absence de code, pas un comportement. **Seule
   une reprise sur le Pixel 10 Pro Fold, avec la même capture, le montrera.**
3. **Que le fond assombrit la scène.** `theme.colors.backdrop` est appliqué par Paper
   (`Modal.tsx:204`), depuis une valeur qu'aucun de nos fichiers ne porte : l'assertion
   recopierait la constante de la bibliothèque et se contenterait de mesurer qu'elle n'a pas
   changé de version.
4. **Le `rippleColor` de `SheetRow`.** Pour la raison déjà écrite dans `AGENTS.md` :
   `Platform.OS` vaut `'ios'` au chargement du module sous ce préréglage, et
   `jest.replaceProperty` arrive trop tard. Inchangé, et non aggravé.
5. **L'`iconColor` des trois `IconButton` d'ancre.** `IconButton.tsx:211` ne transmet aucun
   `testID` à l'icône-chaîne. Inchangé.
6. **Que le bouton retour d'Android referme la feuille.** `Modal.tsx:160-180` pose un
   `BackHandler`, qu'aucun test de composant ne déclenche.

**Trois mesures à faire sur appareil, nommées — et AUCUNE des trois n'a été prise à la
fusion du lot.** C'est écrit ici parce que c'est le seul endroit versionné qui puisse le
porter : les journaux d'exécution sont ignorés par git et disparaissent avec la branche. Une
fonction dont la barre est verte et dont la mesure n'a jamais été faite se lit comme close ;
elle ne l'est pas.

**Trois mesures à faire sur appareil, nommées :**

| # | Mesure | Où |
| --- | --- | --- |
| M1 | Reprise de la capture d'origine : les quatre lignes du panneau de sortie audio entièrement visibles | Pixel 10 Pro Fold, écran de couverture, 443 dp |
| M2 | La feuille « plus » avec trois mains levées et un nom long — la file ne pousse plus rien hors champ | téléphone 360 dp, celui où §2.3 prédit −29,5 dp aujourd'hui |
| M3 | La bande de fond sous la feuille à cause de `marginBottom` (§4.1) — acceptable ou non | iPhone à barre d'accueil |

M1 et M2 ferment le bug. **M3 peut invalider D1 sur la forme, jamais sur le fond** : si la
bande est jugée fautive, il faudra un `paddingBottom` dynamique, donc un aménagement de la
règle « aucun style en ligne », qui devra être arbitré et non contourné.

---

## 8. Ordre de mise en œuvre

1. `bottomSheet.tsx` + `sheetRow.tsx` + leurs spécifications, sans toucher aux appelants.
2. `controlBar.ts` renommé (D5), `menuCheck.tsx` → `sheetCheck.tsx`.
3. `cameraMenu.tsx` — le cas le plus simple, aucun enfant non borné.
4. `audioOutputControl.tsx` — celui du bug ; M1 juste après.
5. `recordingControl.tsx` et `handControl.tsx`, puis `moreMenu.tsx` ; M2 juste après.
6. La clé `call.closeSheet` dans les sept locales.

Chaque étape laisse `npm test`, `npm run typecheck` et `npm run lint` verts. Aucune n'installe
quoi que ce soit : **`node_modules` est un lien symbolique dans ce worktree, et rien de ce
document n'exige `npx expo install`.**
