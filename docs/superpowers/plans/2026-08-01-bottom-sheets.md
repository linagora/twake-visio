# Panneaux inférieurs — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Remplacer les trois menus déroulants de la barre de séance par des panneaux qui montent du bas, et fermer par là un débordement mesuré sur appareil.

**Architecture :** Deux composants nouveaux — `bottomSheet.tsx` (un `Modal` de Paper collé en bas par une seule propriété de style) et `sheetRow.tsx` (une ligne pressable qui restitue les deux `testID` que `Menu.Item` donnait gratuitement). `controlBar.ts` gagne `sheetStyles` **par ajout**, sans rien retirer, jusqu'à la dernière tâche. Aucune dépendance nouvelle.

**Tech Stack :** Expo SDK 57 / RN 0.86, `react-native-paper` 5.15.3, Jest + `@testing-library/react-native` 14.

**Conception :** `docs/superpowers/specs/2026-08-01-bottom-sheets-design.md`

## Global Constraints

- Aucune chaîne visible en dur : sept locales (`en fr es it de vi ru`), toutes remplies avant fusion. `src/i18n/index.spec.ts` échoue si une clé manque **quelque part** — mais **pas** si elle manque **partout** (il compare chaque locale à `en`). Voir la correction C2 ci-dessous.
- Aucun style en ligne : jamais de `style={{…}}`, toujours `StyleSheet.create` alimenté par `src/ui/tokens`.
- Jamais `export default` hors de `app/`. Jamais `x as unknown as T` hors des fichiers `*.spec.*`.
- `@testing-library/react-native` 14 est **asynchrone** : `render`, `fireEvent` et ses raccourcis, `renderHook` et `cleanup` rendent des promesses. Chaque appel prend `await`. `tsc` ne le signale pas.
- **Cet écran est sombre dans les deux schémas, et Paper l'ignore.** Tout texte, toute surface posée là porte une couleur explicite issue de `src/ui/tokens`. Jamais de bouton `disabled` : on masque ce qui n'est pas actionnable.
- Barre de qualité par tâche : `npm test`, `npm run typecheck`, `npm run lint` (0 erreur ; l'unique avertissement de `src/i18n/index.ts:32` est toléré), `npx prettier --check .`.
- **Committer d'abord, muter ensuite.** Une mutation appliquée sur du code non committé se perd au `git checkout --`.
- Aucune installation : `npx expo install` n'est appelé nulle part dans ce plan.

---

## Le recensement des conditionnelles

**C'est la pièce maîtresse de ce plan, et elle est nouvelle.** Le lot précédent a produit
huit trous de couverture, tous de la même forme : *un test qui asserte un résultat sans
jamais faire varier la valeur sur laquelle le code branche*. `AGENTS.md` en tire la règle ;
voici son application, faite **avant** d'écrire les tâches.

Chaque conditionnelle que ce plan prescrit, avec le test qui la garde **des deux côtés** —
et l'état réel de cette garde aujourd'hui, vérifié fichier par fichier.

| # | Conditionnelle | Tâche | Gardée aujourd'hui ? |
| --- | --- | --- | --- |
| K1 | `visible` du `BottomSheet` — `Modal.tsx:182` ne monte rien à faux | 1 | **à écrire** (composant neuf) |
| K2 | `titleStyle?` de `SheetRow` — fourni / absent | 2 | **à écrire** (composant neuf) |
| K3 | `leading?` de `SheetRow` — fourni / absent | 2 | **à écrire** (composant neuf) |
| K4 | `accessibilityLabel?` de `SheetRow` — fourni / absent | 2 | **à écrire** (composant neuf) |
| K5 | `camera.deviceId === activeDeviceId` — coche / pas de coche | 3 | oui, `cameraMenu.spec.tsx` |
| K6 | `camera.ordinal === null` — nom nu / nom numéroté | 3 | oui, `cameraMenu.spec.tsx` |
| K7 | `mode === 'system'` — bouton seul / feuille | 4 | oui, `audioOutputControl.spec.tsx` |
| K8 | `chosen === null` — `outputFollowsDevice` / `outputManualUntilEnd` | 4 | oui, `audioOutputControl.spec.tsx` |
| K9 | `kind === chosen` — coche / pas de coche | 4 | oui, `audioOutputControl.spec.tsx` |
| K10 | `!canStart` — rendu / rien | 5 | oui, `moreMenu.spec.tsx` (`canRecord`) |
| K11 | `busy` de `RecordingControl` — rendu / rien | 5 | oui, `moreMenu.spec.tsx` (`recordingBusy`) |
| K12 | `stopping` — **trois** conséquences : libellé, `titleStyle`, `onPress` | 5 | **oui, et exemplairement** — voir C1 |
| K13 | `busy` de `HandControl` — rendu / rien | 5 | oui, `moreMenu.spec.tsx` (`handBusy`) |
| K14 | `raised` — `lowerHand` / `raiseHand` | 5 | oui, `handControl.spec.tsx` |
| K15 | `hands.length === 0` — file / rien | 5 | oui, `handControl.spec.tsx` |
| K16 | `hand.name.trim().length > 0` — nom / `unnamedParticipant` | 5 | oui, `handControl.spec.tsx` |

**Lecture de ce tableau : douze des seize conditionnelles sont déjà gardées des deux côtés,
et ces tests survivent à la conversion sans une ligne de changement**, parce que les `testID`
de ligne ne bougent pas (§4.2 de la conception). Les quatre à écrire sont celles des deux
composants neufs. **Une tâche qui prétendrait devoir réécrire un test de la colonne « oui »
se trompe de périmètre** — sauf si le `testID` interrogé change, ce qui n'arrive qu'une fois
(C3).

**Et la règle de mutation qui va avec :** on mute **la branche**, jamais le prédicat qui
l'alimente. Figer `visible`, `stopping` ou `mode` rougirait dès qu'une seule conséquence est
observée, et laisserait les autres sans garde. La mutation qui prouve est celle qui remplace
**une** des deux valeurs sélectionnées par l'autre.

---

## Corrections apportées à la conception

Quatre écarts relevés en relisant le document contre le code. Ils sont repris **à l'endroit
où ils mordent**, dans les tâches concernées : un errata placé ici seul n'atteindrait
personne, `scripts/task-brief` n'extrayant que le texte d'une tâche.

### C1 — §6.3 se trompe : la variante d'alerte EST déjà gardée, et bien

La conception écrit que `recording-toggle-title` en `dangerDark` n'a « jamais été gardée
jusqu'ici ». **C'est faux.** Vérifié :

- `recordingControl.spec.tsx:60-61` garde le côté clair (`textDark`, phase `idle`) ;
- `:84-86` garde le côté alerte (`dangerDark`, phase `recording`) ;
- `:106-108` **boucle sur les trois autres phases**, avec ce commentaire : « sans cette
  boucle sur les trois autres phases, un `titleStyle` codé en dur sur
  `state.phase === 'starting' ? danger : menuTitle` afficherait la bonne couleur au test
  précédent tout en repassant en clair ici ».

C'est exactement la discipline que ce plan formalise, écrite avant elle. **Ne pas réécrire
ces tests.** Ils changent d'un mot au plus (le nom du style, §D5), jamais d'assertion.

### C2 — la clé i18n part avec la tâche 1, pas en dernier

§8 place `call.closeSheet` en sixième et dernière étape, alors que `bottomSheet.tsx`
(étape 1) la consomme. Et le filet ne rattraperait pas l'oubli : `src/i18n/index.spec.ts`
compare l'ensemble des clés de chaque locale à celui de `en` — une clé absente des **sept**
laisse les sept ensembles égaux, donc la suite verte, et `t('call.closeSheet')` rendrait la
clé brute à l'écran. La clé est donc livrée **par la tâche qui l'utilise**.

### C3 — `moreMenu.spec.tsx:105` est la seule assertion existante à changer

`getByTestId('menu-surface')` → `getByTestId('more-sheet-surface')`. Même assertion, même
token, même raison. C'est la **seule** ligne d'assertion existante que ce plan touche.

### C4 — le renommage de D5 se fait par AJOUT, et le ménage vient en dernier

§8 renomme `controlBar.ts` en deuxième étape. Renommer `barStyles.menuContent` en
`sheetStyles.surface` casserait le typecheck chez cinq consommateurs qui n'ont pas encore
migré — exactement le défaut structurel hérité du périmètre C1, où deux tâches sur huit
n'ont pas pu tenir leur frontière de fichiers.

Ce plan ajoute donc `sheetStyles` **à côté** de `barStyles` (tâche 1), fait migrer les
consommateurs un par un (tâches 3 à 5), et **supprime les clés mortes en dernier**
(tâche 6), où `tsc` prouve que plus personne ne les lit. Chaque tâche est committable seule,
sans stand-in inerte.

---

## Structure des fichiers

| Fichier | Rôle | Tâche |
| --- | --- | --- |
| `src/screens/room/controlBar.ts` | gagne `sheetStyles` (ajout), perd `barStyles.menu*` (fin) | 1, 6 |
| `src/screens/room/bottomSheet.tsx` | **nouveau** — la coquille : `Portal` → `Modal` collé en bas | 1 |
| `src/screens/room/sheetRow.tsx` | **nouveau** — la ligne pressable, et ses deux `testID` | 2 |
| `src/screens/room/cameraMenu.tsx` | `Menu` → `BottomSheet` | 3 |
| `src/screens/room/audioOutputControl.tsx` | `Menu` → `BottomSheet` — **le fichier du bug** | 4 |
| `src/screens/room/recordingControl.tsx` | `Menu.Item` → `SheetRow` | 5 |
| `src/screens/room/handControl.tsx` | `Menu.Item` → `SheetRow` | 5 |
| `src/screens/room/moreMenu.tsx` | `Menu` → `BottomSheet` | 5 |
| `src/screens/room/menuCheck.tsx` | → `sheetCheck.tsx` | 6 |
| `src/i18n/locales/*.json` | `call.closeSheet` × 7 | 1 |

Chaque fichier de source garde sa spécification à côté de lui.

---

### Task 1 : la coquille, ses styles et sa clé

**Files:**
- Modify: `src/screens/room/controlBar.ts` (ajout de `sheetStyles`, **rien de retiré**)
- Create: `src/screens/room/bottomSheet.tsx`
- Test: `src/screens/room/bottomSheet.spec.tsx`
- Modify: `src/i18n/locales/{en,fr,es,it,de,vi,ru}.json`

**Interfaces:**
- Consomme : `tokens` (`src/ui/tokens`), rien d'autre.
- Produit : `sheetStyles` (clés `wrapper`, `surface`, `title`, `row`, `rowTitle`, `rowTitleDanger`, `note`, `check`) et `BottomSheet` avec la signature ci-dessous. Les tâches 2 à 5 en dépendent mot pour mot.

```ts
export type BottomSheetProps = {
  readonly testID: string;
  readonly visible: boolean;
  // Déjà traduit : il varie d'un appelant à l'autre, et chaque appelant a son `t`.
  readonly title: string;
  readonly onDismiss: () => void;
  readonly children: React.ReactNode;
};
```

**Ce que ce lot ne fait pas :** il ne touche **aucun** appelant. `cameraMenu.tsx`,
`audioOutputControl.tsx` et `moreMenu.tsx` continuent d'utiliser `Menu` et
`barStyles.menu*`, qui restent en place. Le compte de tests ne peut donc que monter.

- [ ] **Step 1 : la clé, dans les sept locales**

`call.closeSheet` — l'étiquette d'accessibilité du fond, qui remplace le `'Close modal'`
anglais en dur de `Modal.tsx:107`. Les fichiers sont **plats, à clés pointées** ; placer la
clé près des autres `call.*`.

| Fichier | Valeur |
| --- | --- |
| `en.json` | `"call.closeSheet": "Close"` |
| `fr.json` | `"call.closeSheet": "Fermer"` |
| `es.json` | `"call.closeSheet": "Cerrar"` |
| `it.json` | `"call.closeSheet": "Chiudi"` |
| `de.json` | `"call.closeSheet": "Schließen"` |
| `vi.json` | `"call.closeSheet": "Đóng"` |
| `ru.json` | `"call.closeSheet": "Закрыть"` |

- [ ] **Step 2 : `sheetStyles`, ajouté à `controlBar.ts`**

**Ne rien retirer.** `barStyles` et ses clés `menu*` restent intactes jusqu'à la tâche 6 :
cinq fichiers les lisent encore. `BAR_ICON_COLOR`, `BAR_RIPPLE_COLOR` et `BAR_HIT_SLOP` ne
bougent pas non plus — ils décrivent la barre, qui reste.

```ts
// Les feuilles inférieures qui remplacent les trois menus de la barre. Un
// `Modal` de Paper devient une feuille par UNE propriété de style, et rien
// d'autre : voir `wrapper`.
export const sheetStyles = StyleSheet.create({
  // La seule ligne qui fait la feuille. `Modal` pose son enveloppe en
  // `absoluteFill` avec `justifyContent: 'center'` (`Modal.tsx:238-241`) et
  // applique la prop `style` APRÈS elle (`Modal.tsx:210-215`) : `flex-end`
  // gagne donc, et colle la surface au bas de l'écran.
  wrapper: { justifyContent: 'flex-end' },
  // `Modal` pose `backgroundColor: 'transparent'` sur sa `Surface`
  // (`Modal.tsx:243-246`). Ce fond n'est donc pas une précaution de contraste,
  // c'est une obligation : sans lui la feuille n'a aucun fond. 15,86:1 avec
  // `textDark`, la même paire que les menus qu'elle remplace.
  surface: {
    backgroundColor: tokens.color.surfaceDark,
    borderTopLeftRadius: tokens.radius.lg,
    borderTopRightRadius: tokens.radius.lg,
    paddingVertical: tokens.spacing.sm,
  },
  // Le titre de la feuille. Il porte son propre espacement plutôt que celui
  // d'une ligne : une ligne est pressable et veut une cible haute, un titre ne
  // l'est pas.
  title: {
    color: tokens.color.textDark,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  // La ligne. 16 dp de padding vertical de part et d'autre d'un texte de
  // ~20 dp donnent ~52 dp de cible — au-dessus des 44 dp que la barre s'impose,
  // parce qu'ici la place ne manque pas.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
  },
  rowTitle: { color: tokens.color.textDark },
  // 8,21:1 sur `surfaceDark`. La seule couleur d'alerte de cette barre qui ne
  // soit pas celle de « quitter » : elle vit dans une feuille, à deux appuis,
  // donc jamais adjacente au combiné raccroché.
  rowTitleDanger: { color: tokens.color.dangerDark },
  // Secondaire par la taille (`variant="labelSmall"`), jamais par un gris :
  // `tokens.color.muted` donne 3,88:1 sur cette surface, sous le seuil AA.
  note: {
    color: tokens.color.textDark,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  check: { color: tokens.color.textDark },
});
```

- [ ] **Step 3 : `bottomSheet.tsx`**

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Portal, Text } from 'react-native-paper';

import { sheetStyles } from 'src/screens/room/controlBar';

export type BottomSheetProps = {
  readonly testID: string;
  readonly visible: boolean;
  // Déjà traduit : il varie d'un appelant à l'autre, et chaque appelant a son `t`.
  readonly title: string;
  readonly onDismiss: () => void;
  readonly children: React.ReactNode;
};

// La coquille, et rien de plus : une `Surface` sombre posée en bas de l'écran.
//
// Ce que `Modal` apporte sans qu'on écrive une ligne : l'appui sur le fond
// referme (`dismissable`, `Modal.tsx:104`), le bouton retour d'Android referme
// aussi (`Modal.tsx:159-178`) — ce que `Menu` ne faisait PAS —, les encarts de
// zone sûre sont reportés en marges (`Modal.tsx:118, 213`), et rien n'est monté
// à l'état fermé (`Modal.tsx:182`).
//
// Ce qu'il n'apporte pas, et qu'il faut savoir avant d'y poser quoi que ce soit :
// AUCUN évitement de clavier (`grep -i keyboard Modal.tsx` ne rend rien, là où
// `Menu` en gérait un). PRÉCONDITION : ne jamais placer un `TextInput` dans une
// feuille avant qu'un évitement de clavier y soit ajouté. Le chat n'en a pas
// besoin — son panneau remplace la scène, décision du périmètre C.
export function BottomSheet({
  testID,
  visible,
  title,
  onDismiss,
  children,
}: BottomSheetProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <Portal>
      <Modal
        testID={testID}
        visible={visible}
        onDismiss={onDismiss}
        style={sheetStyles.wrapper}
        contentContainerStyle={sheetStyles.surface}
        // Le défaut de Paper est la chaîne anglaise en dur `'Close modal'`
        // (`Modal.tsx:107`), ce qu'interdit la règle « aucune chaîne en dur ».
        overlayAccessibilityLabel={t('call.closeSheet')}
      >
        <Text testID={`${testID}-title`} variant="titleSmall" style={sheetStyles.title}>
          {title}
        </Text>
        {children}
      </Modal>
    </Portal>
  );
}
```

- [ ] **Step 4 : `bottomSheet.spec.tsx`**

Deux bouchons sont **obligatoires** et pour deux raisons différentes : `Modal` appelle
`useSafeAreaInsets()` (`Modal.tsx:118`), là où `Menu` s'en passait ; et `Portal` jette sans
`Provider` ancêtre. `animation.scale` à zéro reste utile — `Modal.tsx:125` lance un
`Animated.timing` dont la fin seule bascule `visibleInternal`.

**En revanche, pas de `settleMenus()`.** Les 32 ms de vidage des trois spécifications
existantes n'ont de raison d'être que parce que `Menu.show()` **se rappelle lui-même par
`requestAnimationFrame` tant qu'une mesure est nulle** (`Menu.tsx:318-328`). `Modal` ne
mesure rien : ni `measureInWindow`, ni `Dimensions`, ni `rAF`. La boucle n'existe pas, donc
l'instabilité qu'elle causait non plus.

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider, Text } from 'react-native-paper';

import { tokens } from 'src/ui/tokens';
import { BottomSheet } from './bottomSheet';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

function sheet(visible: boolean, onDismiss: () => void = jest.fn()): React.ReactElement {
  return withPaper(
    <BottomSheet testID="test-sheet" visible={visible} title="Le titre" onDismiss={onDismiss}>
      <Text testID="child">un enfant</Text>
    </BottomSheet>,
  );
}

describe('BottomSheet', () => {
  // K1, côté fermé. C'est ce qui garantit que les assertions
  // `queryByTestId(…) → null` des trois spécifications existantes restent vraies
  // après la conversion.
  it('ne monte rien tant qu’elle est fermée', async () => {
    await render(sheet(false));

    expect(screen.queryByTestId('test-sheet-surface')).toBe(null);
    expect(screen.queryByTestId('test-sheet-title')).toBe(null);
    expect(screen.queryByTestId('child')).toBe(null);
  });

  // K1, côté ouvert. La MÊME prop, l'autre valeur : c'est la paire qui prouve,
  // pas l'un des deux.
  it('monte la surface, le titre et les enfants une fois ouverte', async () => {
    await render(sheet(true));

    expect(screen.getByTestId('test-sheet-surface')).toBeTruthy();
    expect(screen.getByTestId('test-sheet-title')).toHaveTextContent('Le titre');
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  // Ce qu'aucun test ne prouvera : qu'elle est VISUELLEMENT en bas — Jest ne
  // dispose pas les vues. Ce test prouve seulement que la propriété qui la met
  // en bas n'a pas été retirée, ce qui est la seule chose gardable.
  it('pose la propriété qui colle la feuille en bas', async () => {
    await render(sheet(true));

    expect(screen.getByTestId('test-sheet-wrapper')).toHaveStyle({
      justifyContent: 'flex-end',
    });
  });

  it('force la surface et le titre, que le thème clair de Paper trahirait', async () => {
    await render(sheet(true));

    expect(screen.getByTestId('test-sheet-surface')).toHaveStyle({
      backgroundColor: tokens.color.surfaceDark,
    });
    expect(screen.getByTestId('test-sheet-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('referme sur un appui hors de la feuille', async () => {
    const onDismiss = jest.fn();
    await render(sheet(true, onDismiss));

    await fireEvent.press(screen.getByTestId('test-sheet-backdrop'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  // Le défaut de Paper est la chaîne anglaise en dur `'Close modal'`
  // (`Modal.tsx:107`). Elle atteindrait donc l'écran d'un lecteur d'écran
  // francophone, en anglais, sans qu'aucune règle de chaînes en dur ne la voie
  // passer — elle ne vit pas dans nos fichiers.
  it('annonce le fond dans la langue de l’application', async () => {
    await render(sheet(true));

    expect(screen.getByLabelText('call.closeSheet')).toBeTruthy();
  });
});
```

> **Ce dernier test existe parce qu'une sonde l'a exigé, contre ce que ce plan disait
> d'abord.** La première rédaction affirmait que l'étiquette du fond « n'est gardée par
> rien » et prescrivait de ne pas écrire ce test — le raisonnement étant que `Modal.tsx:196`
> pose l'`accessibilityLabel` sur un `TouchableWithoutFeedback` sans `testID` propre. **Le
> raisonnement était juste et la conclusion fausse** : `getByLabelText` ne passe pas par les
> `testID`. Exécuté contre HEAD avant d'être écrit ici : le test passe, et retirer
> `overlayAccessibilityLabel` donne **1 rouge, celui-là seul**. C'est la première
> application de la règle « le code de test qu'un plan prescrit doit avoir été exécuté »,
> et elle s'est payée du premier coup.

- [ ] **Step 5 : barre complète**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`

- [ ] **Step 6 : prouver que chaque garde mord**

Committer d'abord. Puis, une mutation à la fois, `git checkout --` entre chaque :

| Mutation | Rouge attendu |
| --- | --- |
| `wrapper: { justifyContent: 'center' }` | le test « colle la feuille en bas », seul |
| `surface:` sans `backgroundColor` | le test de contraste, seul |
| `title:` sans `color` | le test de contraste, seul |
| `<Text testID={testID}>` (suffixe `-title` retiré) | les tests qui interrogent `-title` |
| `overlayAccessibilityLabel` retiré | le test de l'étiquette du fond, seul — **mesuré : 1 rouge** |

- [ ] **Step 7 : ce que ce lot ne garde pas, et pourquoi**

À écrire dans le rapport, pas à contourner :

- **Que le bouton retour d'Android referme la feuille** (`Modal.tsx:159-178`) : aucun test
  de composant ne déclenche un `BackHandler`.
- **Que le fond assombrit la scène** : `theme.colors.backdrop` vient de Paper, depuis une
  valeur qu'aucun de nos fichiers ne porte. L'asserter mesurerait la version installée.

- [ ] **Step 8 : commit**

```bash
git add src/screens/room/controlBar.ts src/screens/room/bottomSheet.tsx \
        src/screens/room/bottomSheet.spec.tsx src/i18n/locales
git commit -m "feat(call): Add the bottom sheet shell the three menus will move into"
```

---

### Task 2 : la ligne, et les deux `testID` qu'elle restitue

**Files:**
- Create: `src/screens/room/sheetRow.tsx`
- Test: `src/screens/room/sheetRow.spec.tsx`

**Interfaces:**
- Consomme : `sheetStyles` et `BAR_RIPPLE_COLOR` (tâche 1).
- Produit : `SheetRow`. **Les tâches 3 à 5 en dépendent entièrement**, et surtout de sa
  promesse de `testID` : `` `${testID}` `` sur l'élément pressable et
  `` `${testID}-title` `` sur son texte — exactement ce que `Menu.Item` posait
  (`MenuItem.tsx:191` et `:225`).

**Pourquoi ce composant existe.** `Menu.Item` ne peut pas être réutilisé hors d'un `Menu` :
il s'impose `minWidth: 112` / `maxWidth: 280` (`MenuItem.tsx:249-250`), ce qui brocherait une
ligne au milieu d'une feuille pleine largeur. `List.Item` conviendrait à la mise en page —
c'est le précédent de `participantsPanel.tsx:45-48` — mais **il n'expose aucun `testID` sur
son titre** (`ListItem.tsx:244` et `:259` seulement, jamais un `-title`).

Sans `SheetRow`, la conversion coûterait la réécriture de toutes les gardes de couleur de
titre du dépôt. Avec lui, elle en coûte **zéro** : `share-btn` et `share-btn-title` gardent
leur nom, et `moreMenu.spec.tsx:108` n'a pas une ligne à changer.

Et l'on y gagne : la largeur de la ligne devient la nôtre, ce qui ferme définitivement la
cause du débordement — une feuille est large comme l'écran, plus rien ne dépend d'une mesure
de texte faite avant que le conteneur ait sa position.

- [ ] **Step 1 : le composant**

```tsx
import React from 'react';
import { View, type StyleProp, type TextStyle } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';

import { BAR_RIPPLE_COLOR, sheetStyles } from 'src/screens/room/controlBar';

export type SheetRowProps = {
  readonly testID: string;
  readonly title: string;
  // Un SURCLASSEMENT, jamais la couleur de base : `sheetStyles.rowTitle` est
  // toujours appliqué en dessous. Un appelant qui oublie cette prop obtient
  // donc `textDark`, pas le quasi-noir que Paper calculerait depuis un thème
  // clair sur un écran que `call.tsx` force sombre. La seule valeur attendue
  // ici est `sheetStyles.rowTitleDanger`.
  readonly titleStyle?: StyleProp<TextStyle>;
  readonly leading?: React.ReactNode;
  readonly accessibilityLabel?: string;
  readonly onPress: () => void;
};

// Ce que `Menu.Item` donnait gratuitement et qu'il faut rendre : `testID` sur
// l'élément pressable (`MenuItem.tsx:191`) et `` `${testID}-title` `` sur son
// `Text` interne (`MenuItem.tsx:225`). Toute la doctrine de contraste du dépôt
// tient sur le second.
//
// `TouchableRipple` étale `{...rest}` sur son `Pressable`
// (`TouchableRipple.native.tsx:94`), donc le `testID` arrive bien sur l'élément
// que `fireEvent.press` atteint.
export function SheetRow({
  testID,
  title,
  titleStyle,
  leading,
  accessibilityLabel,
  onPress,
}: SheetRowProps): React.ReactElement {
  return (
    <TouchableRipple
      testID={testID}
      // Sans lui, Paper calcule l'ondulation depuis `theme.colors.onSurface` :
      // 1,13:1 sur cette surface, une affordance perdue. Voir `controlBar.ts`.
      rippleColor={BAR_RIPPLE_COLOR}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
    >
      <View style={sheetStyles.row}>
        {leading}
        <Text testID={`${testID}-title`} style={[sheetStyles.rowTitle, titleStyle]}>
          {title}
        </Text>
      </View>
    </TouchableRipple>
  );
}
```

- [ ] **Step 2 : la spécification — trois paires, une par prop optionnelle**

K2, K3, K4 du recensement. **Chacune veut ses deux côtés** : c'est la seule façon de
distinguer « la prop est câblée » de « la valeur est constante ».

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider, Text } from 'react-native-paper';

import { sheetStyles } from 'src/screens/room/controlBar';
import { tokens } from 'src/ui/tokens';
import { SheetRow } from './sheetRow';

function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

describe('SheetRow', () => {
  it('rend le titre sous le suffixe que Menu.Item posait', async () => {
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={jest.fn()} />));

    expect(screen.getByTestId('row-title')).toHaveTextContent('Un titre');
  });

  it('appelle onPress sur l’élément pressable', async () => {
    const onPress = jest.fn();
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={onPress} />));

    await fireEvent.press(screen.getByTestId('row'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // K2, côté absent : la couleur de base s'applique quand même. C'est la
  // propriété qui protège tout appelant distrait.
  it('colore le titre même sans titleStyle', async () => {
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={jest.fn()} />));

    expect(screen.getByTestId('row-title')).toHaveStyle({ color: tokens.color.textDark });
  });

  // K2, côté fourni : et le surclassement gagne. Sans CE test, une
  // implémentation qui ignorerait `titleStyle` passerait le précédent.
  it('laisse titleStyle surclasser la couleur de base', async () => {
    await render(
      withPaper(
        <SheetRow
          testID="row"
          title="Un titre"
          titleStyle={sheetStyles.rowTitleDanger}
          onPress={jest.fn()}
        />,
      ),
    );

    expect(screen.getByTestId('row-title')).toHaveStyle({ color: tokens.color.dangerDark });
  });

  // K3, les deux côtés.
  it('ne rend rien devant le titre sans leading', async () => {
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={jest.fn()} />));

    expect(screen.queryByTestId('leading')).toBe(null);
  });

  it('rend le leading fourni', async () => {
    await render(
      withPaper(
        <SheetRow
          testID="row"
          title="Un titre"
          leading={<Text testID="leading">✓</Text>}
          onPress={jest.fn()}
        />,
      ),
    );

    expect(screen.getByTestId('leading')).toBeTruthy();
  });

  // K4, les deux côtés.
  it('n’annonce aucune étiquette sans accessibilityLabel', async () => {
    await render(withPaper(<SheetRow testID="row" title="Un titre" onPress={jest.fn()} />));

    expect(screen.queryByLabelText('Une étiquette')).toBe(null);
  });

  it('annonce l’étiquette fournie', async () => {
    await render(
      withPaper(
        <SheetRow
          testID="row"
          title="Un titre"
          accessibilityLabel="Une étiquette"
          onPress={jest.fn()}
        />,
      ),
    );

    expect(screen.getByLabelText('Une étiquette')).toBeTruthy();
  });
});
```

- [ ] **Step 3 : barre complète**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`

- [ ] **Step 4 : prouver que chaque garde mord**

Committer d'abord.

| Mutation | Rouge attendu |
| --- | --- |
| `<Text testID={testID}>` (suffixe `-title` retiré) | tous les tests qui interrogent `row-title` |
| `style={sheetStyles.rowTitle}` (`titleStyle` ignoré) | « laisse titleStyle surclasser », seul |
| `style={titleStyle}` (base retirée) | « colore le titre même sans titleStyle », seul |
| `{leading}` retiré du rendu | « rend le leading fourni », seul |
| `accessibilityLabel` non transmis | « annonce l'étiquette fournie », seul |
| `rippleColor` retiré | **aucun**, et c'est attendu — voir ci-dessous |

**`rippleColor` reste hors de portée**, pour la raison déjà écrite dans `AGENTS.md` : le
préréglage Jest fixe `Platform.OS` à `'ios'`, donc `TouchableRipple.supported`
(`TouchableRipple.native.tsx:130`) est faux et la branche empruntée n'expose la couleur que
dans une vue d'ondulation transitoire. `jest.replaceProperty` arrive trop tard — la constante
est calculée au chargement du module. **Ne pas fabriquer ce test.**

- [ ] **Step 5 : commit**

```bash
git add src/screens/room/sheetRow.tsx src/screens/room/sheetRow.spec.tsx
git commit -m "feat(call): Add the sheet row that gives back Menu.Item's two testIDs"
```

---

### Task 3 : la caméra — le cas le plus simple

**Files:**
- Modify: `src/screens/room/cameraMenu.tsx`
- Test: `src/screens/room/cameraMenu.spec.tsx` (retrait de `settleMenus`, rien d'autre)

**Interfaces:** consomme `BottomSheet` (tâche 1) et `SheetRow` (tâche 2). Ne produit rien
de nouveau : `CameraMenuProps` ne change pas d'un caractère.

**Pourquoi celui-ci d'abord :** c'est la seule des trois surfaces sans enfant non borné, donc
sans risque de mise en page, et son test couvre déjà ses deux conditionnelles (K5, K6).

- [ ] **Step 1 : la forme cible**

Le composant ne rend plus un `Menu` qui contient son ancre, mais **une ancre et une feuille
côte à côte** dans un fragment. La feuille part dans un `Portal` : elle ne contribue rien à
la rangée de la barre, qui garde ses 357 dp au dp près.

```tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from 'react-native-paper';

import type { CameraChoice } from 'src/call/devices';
import { BottomSheet } from 'src/screens/room/bottomSheet';
import {
  BAR_HIT_SLOP,
  BAR_ICON_COLOR,
  BAR_RIPPLE_COLOR,
  barStyles,
} from 'src/screens/room/controlBar';
import { MenuCheck } from 'src/screens/room/menuCheck';
import { SheetRow } from 'src/screens/room/sheetRow';

// … CameraMenuProps inchangé, commentaires d'en-tête conservés …

export function CameraMenu({
  cameras,
  activeDeviceId,
  onOpen,
  onSelect,
}: CameraMenuProps): React.ReactElement {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <IconButton
        testID="camera-menu-btn"
        icon="chevron-up"
        iconColor={BAR_ICON_COLOR}
        rippleColor={BAR_RIPPLE_COLOR}
        style={barStyles.button}
        hitSlop={BAR_HIT_SLOP}
        onPress={() => {
          setVisible(true);
          // La liste est relue à l'ouverture, et à ce moment seulement : aucun
          // événement de changement de périphérique n'existe sur mobile, et
          // c'est le seul instant où quelqu'un regarde.
          onOpen();
        }}
        accessibilityLabel={t('call.selectCamera')}
      />
      <BottomSheet
        testID="camera-sheet"
        visible={visible}
        title={t('call.selectCamera')}
        onDismiss={() => setVisible(false)}
      >
        {cameras.map((camera) => (
          <SheetRow
            key={camera.deviceId}
            testID={`camera-option-${camera.deviceId}`}
            // `SheetRow` applique `rowTitle` en dessous : plus de `titleStyle`
            // à passer pour la couleur ordinaire.
            leading={
              camera.deviceId === activeDeviceId ? (
                <MenuCheck testID={`camera-check-${camera.deviceId}`} />
              ) : undefined
            }
            // Composé par i18next, jamais en JavaScript : une chaîne assemblée
            // ici ne serait pas traduisible.
            title={
              camera.ordinal === null
                ? t(camera.nameKey)
                : t('call.cameraNumbered', { name: t(camera.nameKey), index: camera.ordinal })
            }
            onPress={() => {
              setVisible(false);
              onSelect(camera);
            }}
          />
        ))}
      </BottomSheet>
    </>
  );
}
```

**`anchorPosition="top"` et `contentStyle` disparaissent** : ils n'existent que pour `Menu`,
et une feuille est en bas par construction.

- [ ] **Step 2 : la spécification — ce qui change, et ce qui ne change PAS**

**Ne change pas :** aucune assertion. K5 et K6 sont déjà gardées des deux côtés, les
`testID` de ligne ne bougent pas, et `camera-check-*` reste un `Text` joignable.

**Change :** deux bouchons à ajouter en tête de fichier, parce que `Modal` appelle
`useSafeAreaInsets()` là où `Menu` s'en passait :

```tsx
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
```

**Et `settleMenus()` disparaît, mais seulement après preuve.** Le contournement existe parce
que `Menu.show()` se rappelle par `requestAnimationFrame` tant qu'une mesure est nulle
(`Menu.tsx:318-328`) ; `Modal` ne mesure rien. Le commentaire du fichier chiffre le prix de
l'instabilité d'origine : **« 39 ouvertures sur 40 sans ce vidage, 300 sur 300 avec »**. Le
retirer demande donc la même mesure, pas une lecture :

```bash
for i in $(seq 1 40); do npx jest cameraMenu --silent >/dev/null 2>&1 || echo "ÉCHEC au tour $i"; done
```

**40 tours verts → retirer `settleMenus` et son commentaire. Un seul échec → le garder, et
écrire dans le rapport ce qui a échoué.** Ne pas trancher par lecture.

- [ ] **Step 3 : barre complète**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`

- [ ] **Step 4 : prouver que les gardes mordent encore**

Ces gardes existaient avant ce lot ; ce qu'il faut prouver, c'est que **la conversion ne les
a pas décrochées** — un test qui interroge un `testID` disparu échoue bruyamment, mais un
test qui interroge un `testID` toujours présent sur un composant devenu inerte, non.

| Mutation | Rouge attendu |
| --- | --- |
| `leading={<MenuCheck …/>}` inconditionnel | le test qui vérifie l'absence de coche sur la caméra inactive |
| `leading` jamais fourni | le test qui vérifie la présence de la coche sur l'active |
| `title={t(camera.nameKey)}` (branche `ordinal` supprimée) | le test des noms numérotés |
| `onPress` sans `setVisible(false)` | le test de fermeture après choix, s'il existe — sinon **le dire** |

- [ ] **Step 5 : commit**

```bash
git add src/screens/room/cameraMenu.tsx src/screens/room/cameraMenu.spec.tsx
git commit -m "feat(call): Move the camera picker into a bottom sheet"
```

---

### Task 4 : la sortie audio — le fichier du bug

**Files:**
- Modify: `src/screens/room/audioOutputControl.tsx`
- Test: `src/screens/room/audioOutputControl.spec.tsx`

**Interfaces:** consomme `BottomSheet` et `SheetRow`. `AudioOutputControlProps` ne change pas.

**C'est cette surface qui débordait**, et la cause est établie par algèbre, pas par mesure :
`Menu` mesure son contenu **avant** de lui appliquer sa position (`Menu.tsx:279-286` avant
`:330`), donc sur toute la largeur libre ; puis sa branche de repli (`:478-494`) aligne le
menu sur le **bord droit de l'ancre** et sa seule borne est structurellement morte —
`right` y vaut exactement `left + anchorLayout.width`, quelle que soit la largeur du menu.
Rien ne borne la gauche. Et `Menu` n'impose aucune largeur : `MIN_WIDTH`/`MAX_WIDTH` sont
consommés par `MenuItem`, **jamais** par un enfant qui n'en est pas un — ici le `Text` de
note. C'est la seule des trois surfaces à porter un tel enfant, et la seule qui casse.

Une feuille est large comme l'écran. **Aucune mesure, donc aucun débordement possible.**

- [ ] **Step 1 : la forme cible**

L'aiguillage `mode === 'system'` reste **intact** : sur iOS il n'y a rien à lister, et le
seul recours est le sélecteur de la plateforme. La promesse d'ergonomie identique n'est donc
pas tenue pour cette commande, et c'est une propriété de la plateforme, pas de la brique
choisie.

```tsx
  // … `button` inchangé, avec ses commentaires …

  if (mode === 'system') return button(onSystemPicker);

  return (
    <>
      {button(() => {
        setVisible(true);
        // La liste est relue à l'ouverture, et à ce moment seulement : Android
        // n'émet aucun événement de changement de périphérique.
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
            séance. Le `View` qui l'enveloppait n'a plus lieu d'être : il
            n'existait que pour qu'un `Menu` ne prenne pas ce `Text` pour un
            `Menu.Item`. */}
        <Text testID="audio-output-note" variant="labelSmall" style={sheetStyles.note}>
          {chosen === null ? t('call.outputFollowsDevice') : t('call.outputManualUntilEnd')}
        </Text>
        {outputs.map((kind) => (
          <SheetRow
            key={kind}
            testID={`audio-output-option-${kind}`}
            leading={
              kind === chosen ? <MenuCheck testID={`audio-output-check-${kind}`} /> : undefined
            }
            title={t(audioOutputNameKey(kind))}
            onPress={() => {
              setVisible(false);
              onSelect(kind);
            }}
          />
        ))}
      </BottomSheet>
    </>
  );
```

- [ ] **Step 2 : la spécification**

Mêmes deux bouchons qu'à la tâche 3, même protocole de 40 tours pour `settleMenus`.

**Une assertion à AJOUTER**, et elle manquait déjà avant ce lot : la couleur de la note.
`audio-output-note` n'est gardé que par son texte, alors que sa couleur est explicite depuis
`controlBar.ts`. Elle devient d'autant plus utile que la surface d'un `Modal` est
transparente par défaut.

```tsx
expect(screen.getByTestId('audio-output-note')).toHaveStyle({ color: tokens.color.textDark });
```

**Et la garde de surface**, que ce fichier n'avait pas :

```tsx
expect(screen.getByTestId('audio-output-sheet-surface')).toHaveStyle({
  backgroundColor: tokens.color.surfaceDark,
});
```

- [ ] **Step 3 : barre complète**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`

- [ ] **Step 4 : prouver que les gardes mordent**

| Mutation | Rouge attendu |
| --- | --- |
| `if (mode === 'system')` retiré | le test du mode système, seul |
| note figée sur `t('call.outputFollowsDevice')` | le test du choix manuel, seul |
| `leading` inconditionnel | le test d'absence de coche, seul |
| `style={sheetStyles.note}` retiré | la nouvelle assertion de couleur, seule |
| `contentContainerStyle` retiré de `bottomSheet.tsx` | la nouvelle garde de surface |

- [ ] **Step 5 : commit**

```bash
git add src/screens/room/audioOutputControl.tsx src/screens/room/audioOutputControl.spec.tsx
git commit -m "feat(call): Move the audio output picker into a bottom sheet"
```

- [ ] **Step 6 : M1 — la mesure sur appareil, qui seule ferme le bug**

**Aucun test ne peut prouver que le débordement a disparu** : le calcul de
`Menu.tsx:466-494` n'a plus lieu puisque `Menu` n'est plus monté. C'est une **absence de
code**, pas un comportement observable.

À constater sur le Pixel 10 Pro Fold, écran de couverture, 443 dp : reprendre la capture
d'origine et vérifier que « Haut-parleur », « Écouteur » et la note sont **entièrement
visibles**. Le noter dans le rapport comme une mesure faite ou à faire, jamais comme
acquise.

---

### Task 5 : « plus », et ses deux lignes composées

**Files:**
- Modify: `src/screens/room/recordingControl.tsx`
- Modify: `src/screens/room/handControl.tsx`
- Modify: `src/screens/room/moreMenu.tsx`
- Test: `src/screens/room/{recordingControl,handControl,moreMenu}.spec.tsx`

**Interfaces:** consomme `BottomSheet` et `SheetRow`. Aucune des trois signatures de props
ne change.

**Pourquoi les trois ensemble :** `moreMenu.tsx` rend les deux autres. Les convertir
séparément laisserait un état intermédiaire où un `SheetRow` vit à l'intérieur d'un `Menu` —
qui fonctionnerait, mais qu'aucune tâche ne livre volontairement et qu'un relecteur devrait
juger. Une seule tâche, un seul état cohérent.

- [ ] **Step 1 : `recordingControl.tsx` — `Menu.Item` → `SheetRow`**

Les deux absences (`!canStart`, `busy`) et toute la logique de `stopping` restent
**identiques**. Seule la brique change.

```tsx
import { SheetRow } from 'src/screens/room/sheetRow';
import { sheetStyles } from 'src/screens/room/controlBar';

  // … en-tête et les deux `return null` inchangés …

  return (
    <SheetRow
      testID="recording-toggle"
      title={t(label)}
      // `SheetRow` applique `rowTitle` en dessous : seul le SURCLASSEMENT
      // d'alerte se passe ici, ce qui dit mieux ce qui est l'exception.
      titleStyle={stopping ? sheetStyles.rowTitleDanger : undefined}
      accessibilityLabel={t(label)}
      onPress={stopping ? onStop : onStart}
    />
  );
```

> **La conception se trompe sur ce point, et il ne faut pas la suivre.** §6.3 affirme que
> la variante d'alerte de `recording-toggle-title` n'a « jamais été gardée jusqu'ici ».
> **C'est faux** : `recordingControl.spec.tsx:60-61` garde le côté clair,
> `:84-86` le côté alerte, et `:106-108` **boucle sur les trois autres phases** pour
> défaire un `titleStyle` codé en dur sur `phase === 'starting'`. K12 est déjà gardée mieux
> que ce plan ne saurait le demander. **Ne réécrire aucun de ces trois tests.**

- [ ] **Step 2 : `handControl.tsx` — un `Menu.Item`, et des `Text` qui ne bougent pas**

```tsx
      {busy ? null : (
        <SheetRow
          testID="hand-toggle"
          title={t(label)}
          accessibilityLabel={t(label)}
          onPress={onToggle}
        />
      )}
```

Les lignes de file (`:58-70`) restent des `Text` **non pressables**, pour la raison déjà
écrite `:26-28` : on ne peut pas baisser la main de quelqu'un d'autre, et un élément
pressable promettrait une action qui n'existe pas. Leur `style` passe de
`barStyles.menuNote` à `sheetStyles.note` — même couleur, même espacement.

- [ ] **Step 3 : `moreMenu.tsx` — `Menu` → `BottomSheet`**

Même forme qu'aux tâches 3 et 4 : l'ancre et la feuille côte à côte dans un fragment,
`testID="more-sheet"`, `title={t('call.more')}`. Les trois entrées et leur ordre ne changent
pas. Le partage devient un `SheetRow` de `testID` `share-btn` — **le même qu'aujourd'hui**.

- [ ] **Step 4 : la spécification — une seule assertion change dans tout le dépôt**

`moreMenu.spec.tsx:105` : `getByTestId('menu-surface')` → `getByTestId('more-sheet-surface')`.
Même assertion, même token, même raison. Le commentaire au-dessus (`:96-104`) doit suivre :
il explique que `Menu` sans `testID` propre prend celui de la bibliothèque, ce qui cesse
d'être vrai — désormais la feuille porte le nôtre.

Tout le reste est **conservé** : les absences plutôt que les grisages
(`:165-181`, `:236-244`), la fermeture après appui (`:183-208`), `share-btn-title`
(`:108`), et « ne montre rien avant l'ouverture » (`:81-87`), qui reste vrai parce que
`Modal.tsx:182` ne monte rien à l'état fermé.

Mêmes bouchons, même protocole de 40 tours pour `settleMenus` dans les trois fichiers.

- [ ] **Step 5 : barre complète**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`

- [ ] **Step 6 : prouver que les gardes mordent**

| Mutation | Rouge attendu |
| --- | --- |
| `titleStyle` figé à `undefined` dans `recordingControl` | `:84-86` **et** `:106-108` |
| `titleStyle` figé à `rowTitleDanger` | `:60-61`, seul |
| `busy ? null :` retiré de `handControl` | le test `handBusy` |
| `!canStart` retiré | le test `canRecord: false` |
| `hands.length === 0 ? null :` retiré | le test de file vide |
| `onPress` de `share-btn` sans `setVisible(false)` | le test de fermeture après appui |

- [ ] **Step 7 : commit**

Trois commits, un par fichier converti, dans l'ordre des steps — `moreMenu` en dernier,
puisqu'il consomme les deux autres.

- [ ] **Step 8 : M2 — la seconde mesure sur appareil**

La feuille « plus » avec **trois mains levées et un nom long**, sur un téléphone de 360 dp.
C'est la configuration où l'arithmétique de la conception prédit **−29,5 dp** aujourd'hui :
le menu « plus » déborde **déjà** sur un téléphone ordinaire, avec une file vide, et
personne ne l'a signalé parce qu'un `Menu.Item` commence par une marge intérieure — les
trente premiers dp coupés ne mangent pas encore de lettres. Vérifier que la file ne pousse
plus rien hors champ.

---

### Task 6 : le ménage, que le typecheck rend sûr

**Files:**
- Modify: `src/screens/room/controlBar.ts` (suppression des clés mortes)
- Rename: `src/screens/room/menuCheck.tsx` → `sheetCheck.tsx`, `MenuCheck` → `SheetCheck`
- Modify: `src/screens/room/{cameraMenu,audioOutputControl}.tsx` (les deux importateurs)
- Test: `src/screens/room/menuCheck.spec.tsx` → `sheetCheck.spec.tsx`

**Pourquoi en dernier :** c'est maintenant, et seulement maintenant, que `tsc` peut prouver
que plus personne ne lit `barStyles.menu*`. Fait plus tôt, ce renommage aurait cassé le
typecheck chez cinq consommateurs non encore migrés — le défaut structurel hérité du
périmètre C1, où deux tâches sur huit n'ont pas pu tenir leur frontière de fichiers et ont
dû livrer un stand-in inerte.

- [ ] **Step 1 : constater que les clés sont mortes AVANT de les retirer**

```bash
grep -rn "barStyles.menu" src/ app/
```

Attendu : **aucune ligne**. Si une ligne sort, une tâche précédente est incomplète — le dire
et s'arrêter, ne pas la corriger ici.

- [ ] **Step 2 : retirer `menuContent`, `menuTitle`, `menuTitleDanger`, `menuNote`, `check` de `barStyles`**

`barStyles.button` reste, ainsi que `BAR_ICON_COLOR`, `BAR_RIPPLE_COLOR` et `BAR_HIT_SLOP` :
ils décrivent la barre, qui n'a pas bougé d'un dp.

Les commentaires de contraste attachés aux clés retirées **ne se suppriment pas** : ils
portent des ratios mesurés (15,86:1, 8,21:1, 3,88:1) et des raisons qui n'ont pas changé de
validité. Ils suivent leur clé vers `sheetStyles`, où la tâche 1 les a déjà posés — vérifier
qu'aucun n'a été perdu en route, et le dire.

- [ ] **Step 3 : `menuCheck.tsx` → `sheetCheck.tsx`**

`git mv`, puis `MenuCheck` → `SheetCheck`, puis `barStyles.check` → `sheetStyles.check`, puis
les deux sites d'import (`cameraMenu.tsx`, `audioOutputControl.tsx`) et la spécification.
Une feuille dont le glyphe s'appelle « menu » ment sur ce qu'elle est.

- [ ] **Step 4 : vérifier qu'aucun `Menu` ne subsiste dans les surfaces converties**

```bash
grep -rn "from 'react-native-paper'" src/screens/room/{cameraMenu,audioOutputControl,moreMenu,recordingControl,handControl}.tsx
```

Attendu : plus aucune importation de `Menu`. `IconButton` et `Text` restent.

- [ ] **Step 5 : barre complète, et le compte final**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`

**Le compte attendu est un plancher, pas une prédiction.** Le lot précédent a livré 650 là
où le plan en annonçait 643, parce que les implémenteurs ont trouvé par mutation des trous
que le plan n'avait pas prescrits. Un compte supérieur n'est pas une dérive : c'est le signe
que ce plan sous-prescrivait, et cela vaut d'être écrit dans le rapport.

- [ ] **Step 6 : commit**

```bash
git add -u src/screens/room src/i18n
git commit -m "refactor(call): Retire the menu styles the sheets replaced"
```

---

## Ce qu'aucun test ne prouvera, et qui doit être constaté

Repris de la conception §7, parce qu'un plan qui n'en parle pas laisse croire que la barre
verte suffit.

| # | Mesure | Où | Après quelle tâche |
| --- | --- | --- | --- |
| M1 | Les quatre lignes du panneau de sortie audio entièrement visibles | Pixel 10 Pro Fold, couverture, 443 dp | 4 |
| M2 | La feuille « plus » avec trois mains levées et un nom long | téléphone 360 dp | 5 |
| M3 | La bande de fond sous la feuille due au `marginBottom` de zone sûre | iPhone à barre d'accueil | 6 |

**M3 peut invalider la forme retenue, jamais son fond.** `Modal.tsx:213` reporte l'encart bas
en `marginBottom` : sur un iPhone à barre d'accueil, une bande de 34 pt reste visible **sous**
la feuille, qui ne se colle donc pas au bord physique. C'est le même traitement que
`app/_layout.tsx:60` applique déjà partout. Si la bande est jugée fautive, la corriger
demanderait un `paddingBottom` dynamique, donc un `style={{…}}` littéral — **à arbitrer, pas
à contourner.**

Et six choses resteront hors de portée quoi qu'il arrive : que la feuille est visuellement en
bas, que le débordement a disparu (c'est une absence de code), que le fond assombrit la scène,
le `rippleColor` de `SheetRow`, l'`iconColor` des trois ancres, et que le bouton retour
d'Android referme la feuille.
