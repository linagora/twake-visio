# Refonte UX/UI — Lot 2 : surfaces d'entrée — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre les trois surfaces par lesquelles on entre dans l'application — connexion, accueil, rejoindre — avec le système visuel livré au Lot 1.

**Architecture:** Deux primitives neuves dans `src/ui` (`BrandTile` pour le dégradé, `FormSheet` pour une feuille claire qui accepte une saisie), puis les trois écrans recomposés depuis les primitives du Lot 1. Aucune infrastructure existante n'est modifiée.

**Tech Stack:** Expo SDK 57 / RN 0.86, expo-router 57, react-native-paper 5.15.3, `expo-linear-gradient` et `expo-clipboard` (installés), Jest + RNTL 14.

**Spec:** `docs/superpowers/specs/2026-08-02-ux-entry-surfaces-design.md`

---

## Global Constraints

Celles du Lot 1 s'appliquent **toutes** et ne sont pas redites ici — voir
`docs/superpowers/plans/2026-08-02-ux-foundations-and-shell.md`. Les rappels qui
comptent pour ce lot :

- **Aucun style en ligne** ; `StyleSheet.create` alimenté par `src/ui/tokens`.
- **Props de geste préfixées** : `onCardPress`, `onCodeChange`, `onSheetDismiss`. Jamais `onPress` ni `onChangeText`.
- **RNTL 14 est asynchrone** : `await` sur `render`, `fireEvent`, `fireEvent.press`, `fireEvent.changeText`.
- **Sept locales**, toutes remplies. `src/i18n/index.spec.ts` échoue sinon. **Les clés sont plates** — `"welcome.tagline"`, pas un objet imbriqué.
- **Un spec d'écran doit mocker `expo-router`** : l'importer pour de vrai tire `standard-navigation`, de l'ESM que `transformIgnorePatterns` ne couvre pas. Neuf specs le font déjà — en ouvrir un.
- **Ne toucher à rien dans `src/screens/room/` sauf `create.tsx`.**
- **Ne pas toucher `bottomSheet.tsx` ni `keyboard.ts`** — 5 et 9 branches en vol.
- **Worktree** : `/Users/mmaudet/work/twake-visio-wt/ux-home`, branche `design/ux-home`, arbre `node_modules` propre (non partagé).

---

## File Structure

**Créés**

| Fichier | Responsabilité |
| --- | --- |
| `src/ui/brandTile.tsx` | Tuile carrée à dégradé de marque, avec son glyphe |
| `src/ui/actionCard.tsx` | Carte d'action de l'accueil, pleine ou à filet |
| `src/ui/formSheet.tsx` | Feuille claire acceptant une saisie (évitement de clavier) |
| `src/screens/joinSheet.tsx` | Contenu de la feuille Rejoindre : code 3-4-3, coller, valider |
| `src/rooms/roomCodeEntry.ts` | Normalisation et découpe `3-4-3` du code saisi |

**Modifiés**

| Fichier | Changement |
| --- | --- |
| `src/screens/welcome.tsx` | Recomposé : tuile, titre bicolore, baseline, 3 actions |
| `src/screens/home.tsx` | `AppHeader`, deux cartes, « Mes réunions » en `SurfaceCard` ; perd « Se déconnecter » |
| `src/screens/room/create.tsx` | Restyé aux jetons ; reste un écran, garde ses co-organisateurs |
| `src/i18n/locales/*.json` | Clés `welcome.*`, `home.*`, `join.*` — 7 fichiers |

---

## Task 1: `BrandTile` et `ActionCard`

**Files:**
- Create: `src/ui/brandTile.tsx` + `src/ui/brandTile.spec.tsx`
- Create: `src/ui/actionCard.tsx` + `src/ui/actionCard.spec.tsx`

**Interfaces:**
- Consumes: `tokens` (Lot 1)
- Produces:
  - `BrandTile({ size, testID })` — `size` est `'sm' | 'lg'` (32 / 92 px)
  - `ActionCard({ title, subtitle, glyph, filled, onCardPress, testID })` — `filled` choisit le dégradé plein ou la carte blanche à filet

**Valeurs mesurées sur le mockup [M]** : tuile `lg` 92 px rayon 26, dégradé
`#2FBE6C → #159049` ; tuile `sm` 32 px rayon 10. Carte pleine : dégradé
`#26B166 → #158B48`, rayon 18, pastille interne 46 px rayon 14 sur
`rgba(255,255,255,.18)`. Carte à filet : fond `cardSurface`, filet `cardBorder`,
pastille `brandWash`.

- [ ] **Step 1: Écrire le test qui échoue**

`src/ui/actionCard.spec.tsx` :

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ActionCard } from 'src/ui/actionCard';
import { tokens } from 'src/ui/tokens';

function renderCard(
  overrides: Partial<React.ComponentProps<typeof ActionCard>> = {},
): Promise<unknown> {
  return render(
    <ActionCard
      filled
      glyph="video-outline"
      onCardPress={jest.fn()}
      subtitle="Démarrer maintenant et partager le lien"
      testID="card"
      title="Nouvelle réunion"
      {...overrides}
    />,
  );
}

describe('ActionCard', () => {
  // Les deux variantes, chacune avec sa fixture : sans la seconde, une carte
  // toujours pleine passerait.
  it('écrit en blanc sur la carte pleine', async () => {
    await renderCard({ filled: true });
    expect(screen.getByTestId('card-title')).toHaveStyle({ color: tokens.color.onBrand });
  });

  it('écrit en texte principal sur la carte à filet', async () => {
    await renderCard({ filled: false });
    expect(screen.getByTestId('card-title')).toHaveStyle({ color: tokens.color.textPrimary });
  });

  it('affiche son titre et son sous-titre', async () => {
    await renderCard();
    expect(screen.getByTestId('card-title')).toHaveTextContent('Nouvelle réunion');
    expect(screen.getByTestId('card-subtitle')).toBeTruthy();
  });

  it('appelle onCardPress', async () => {
    const onCardPress = jest.fn();
    await renderCard({ onCardPress });
    await fireEvent.press(screen.getByTestId('card'));
    expect(onCardPress).toHaveBeenCalledTimes(1);
  });
});
```

`src/ui/brandTile.spec.tsx` :

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { BrandTile } from 'src/ui/brandTile';

describe('BrandTile', () => {
  // Deux tailles, deux fixtures.
  it.each([
    ['sm', 32],
    ['lg', 92],
  ] as const)('rend la taille %s à %i px', async (size, side) => {
    await render(<BrandTile size={size} testID="tile" />);
    expect(screen.getByTestId('tile')).toHaveStyle({ width: side, height: side });
  });

  it('rend son glyphe', async () => {
    await render(<BrandTile size="lg" testID="tile" />);
    expect(screen.getByTestId('tile-glyph')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Vérifier l'échec**

```bash
npx jest src/ui/actionCard src/ui/brandTile
```

Attendu : `Cannot find module`.

- [ ] **Step 3: Implémenter**

> **Le dégradé se rend avec `LinearGradient` d'`expo-linear-gradient`**, dont les
> props `colors`, `start` et `end` sont CONSOMMÉES par le composant : ne rien
> assertir dessus, la borne d'`AGENTS.md` s'applique. Assertir sur le texte posé
> par-dessus, qui est joignable.

`BrandTile` rend un `LinearGradient` carré avec `MaterialCommunityIcons`
`video-outline` blanc, `testID` sur le conteneur et `` `${testID}-glyph` `` sur
le glyphe. `ActionCard` rend un `Pressable` contenant soit un `LinearGradient`
(si `filled`), soit une `View` à filet, avec la pastille, le titre
(`` `${testID}-title` ``) et le sous-titre (`` `${testID}-subtitle` ``), chacun
portant sa couleur explicite selon `filled`.

- [ ] **Step 4: Vérifier et muter**

```bash
npx jest src/ui/ && npm run typecheck && npm run lint
```

Mutations à passer au rouge : figer `filled` à `true`, retirer la couleur
explicite du titre, ne pas câbler `onCardPress`, figer la taille de la tuile.

- [ ] **Step 5: Commit**

```bash
git add src/ui/brandTile.* src/ui/actionCard.*
git commit -m "feat(ui): Add the brand tile and the home action cards"
```

---

## Task 2: `FormSheet`

**Files:**
- Create: `src/ui/formSheet.tsx` + `src/ui/formSheet.spec.tsx`

**Interfaces:**
- Produces: `FormSheet({ visible, title, onSheetDismiss, children, testID })`

**Pourquoi une feuille de plus.** `src/screens/room/bottomSheet.tsx` interdit
explicitement d'y poser un `TextInput` faute d'évitement de clavier, et il est
modifié par cinq branches en vol. Celle-ci est **claire** (l'autre est sombre,
pour l'écran d'appel), elle vit dans `src/ui/` où rien ne la dispute, et elle
porte l'évitement que l'autre n'a pas.

- [ ] **Step 1: Écrire le test qui échoue**

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import { FormSheet } from 'src/ui/formSheet';
import { tokens } from 'src/ui/tokens';

jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// `animation.scale` à zéro annule les deux animations d'opacité de `Modal`,
// qui prendraient sinon 220 ms chacune. Même préambule que `bottomSheet.spec`.
function withPaper(node: React.ReactElement): React.ReactElement {
  return <PaperProvider theme={{ animation: { scale: 0 } }}>{node}</PaperProvider>;
}

function sheet(overrides: Partial<React.ComponentProps<typeof FormSheet>> = {}) {
  return withPaper(
    <FormSheet
      onSheetDismiss={jest.fn()}
      testID="sheet"
      title="Rejoindre une réunion"
      visible
      {...overrides}
    >
      <Text testID="child">contenu</Text>
    </FormSheet>,
  );
}

describe('FormSheet', () => {
  // `visible` est CONSOMMÉE par `Modal` : ne jamais l'assertir. On observe le
  // rendu, qui est la conséquence.
  it('ne monte rien tant qu’elle est fermée', async () => {
    await render(sheet({ visible: false }));
    expect(screen.queryByTestId('child')).toBe(null);
  });

  it('monte son contenu quand elle est ouverte', async () => {
    await render(sheet({ visible: true }));
    expect(screen.getByTestId('child')).toBeTruthy();
  });

  // La surface CLAIRE est la raison d'être de ce composant : sans couleur
  // explicite, `Modal` rend un fond transparent (`Modal.tsx:243-246`).
  it('pose la surface claire explicite', async () => {
    await render(sheet());
    expect(screen.getByTestId('sheet-surface')).toHaveStyle({
      backgroundColor: tokens.color.cardSurface,
    });
  });

  it('pose la couleur explicite du titre', async () => {
    await render(sheet());
    expect(screen.getByTestId('sheet-title')).toHaveStyle({ color: tokens.color.textPrimary });
  });
});
```

> **À l'implémenteur** : `bottomSheet.spec.tsx` est le voisin le plus proche.
> **L'ouvrir et reprendre son préambule exact** plutôt que de le recopier
> d'ici — le `testID` de la surface (`` `${testID}-surface` ``) et le mock de
> `safe-area-context` viennent de là.

- [ ] **Step 2 à 5** : vérifier l'échec, implémenter avec `Modal` de Paper +
  `KeyboardAvoidingView`, vérifier, muter (fermée/ouverte, surface, titre), commit.

> `KeyboardAvoidingView` **déstructure `behavior`** : aucune assertion dessus,
> elle serait verte dans les deux états. C'est l'une des trois instances
> mesurées de cette borne dans `AGENTS.md`.

---

## Task 3: La saisie du code — `roomCodeEntry.ts`

**Files:**
- Create: `src/rooms/roomCodeEntry.ts` + `src/rooms/roomCodeEntry.spec.ts`

**Interfaces:**
- Produces:
  - `normalizeCodeInput(raw: string): string` — minuscules, lettres seules, 10 au plus
  - `splitCodeGroups(code: string): readonly [string, string, string]` — 3-4-3
  - `isCompleteCode(code: string): boolean`

Logique pure, testée sans rendu — c'est ce qui rend la feuille testable sans
piloter dix cases.

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { isCompleteCode, normalizeCodeInput, splitCodeGroups } from 'src/rooms/roomCodeEntry';

describe('normalizeCodeInput', () => {
  it('met en minuscules', () => {
    expect(normalizeCodeInput('OGO')).toBe('ogo');
  });

  it('jette tout ce qui n’est pas une lettre', () => {
    expect(normalizeCodeInput('ogo-kmyy-qrl')).toBe('ogokmyyqrl');
  });

  it('jette les chiffres', () => {
    expect(normalizeCodeInput('og0k1')).toBe('ogk');
  });

  // La borne doit être empruntée dans les deux sens.
  it('tronque au-delà de dix lettres', () => {
    expect(normalizeCodeInput('abcdefghijklmno')).toBe('abcdefghij');
  });

  it('ne tronque pas en deçà de dix', () => {
    expect(normalizeCodeInput('abc')).toBe('abc');
  });
});

describe('splitCodeGroups', () => {
  it('découpe un code complet en 3-4-3', () => {
    expect(splitCodeGroups('ogokmyyqrl')).toEqual(['ogo', 'kmyy', 'qrl']);
  });

  it('découpe un code partiel sans inventer de lettres', () => {
    expect(splitCodeGroups('ogok')).toEqual(['ogo', 'k', '']);
  });

  it('découpe un code vide', () => {
    expect(splitCodeGroups('')).toEqual(['', '', '']);
  });
});

describe('isCompleteCode', () => {
  // Les deux états, chacun avec sa fixture.
  it('reconnaît un code de dix lettres', () => {
    expect(isCompleteCode('ogokmyyqrl')).toBe(true);
  });

  it('refuse un code plus court', () => {
    expect(isCompleteCode('ogokmyyqr')).toBe(false);
  });
});
```

- [ ] **Step 2 à 5** : vérifier l'échec, implémenter, muter (retirer la troncature,
  figer les bornes de découpe, inverser le seuil de complétude), commit.

---

## Task 4: La feuille « Rejoindre »

**Files:**
- Create: `src/screens/joinSheet.tsx` + `src/screens/joinSheet.spec.tsx`
- Modify: `src/i18n/locales/*.json` — clés `join.*`, 7 fichiers

**Interfaces:**
- Consumes: `FormSheet` (Task 2), `roomCodeEntry` (Task 3), `parseMeetingLink` (`deepLinks.ts:39`), `listKnownHosts`
- Produces: `JoinSheet({ visible, onSheetDismiss, onJoinRoom, testID })` — `onJoinRoom(slug)` remonte le slug, la navigation reste à l'appelant

**Clés** : `join.title`, `join.instructions`, `join.hint`, `join.paste`,
`join.pasteFailed`, `join.submit`. Sept fichiers.

- [ ] **Step 1: Écrire le test qui échoue**

```tsx
// Préambule : mocker `expo-router`, `react-i18next`, `expo-clipboard`, et
// `src/instance/knownInstances`. Ouvrir un spec d'écran voisin pour la forme
// exacte — neuf le font déjà.

describe('JoinSheet', () => {
  it('affiche dix cases', async () => { /* getAllByTestId(/^join-cell-/) longueur 10 */ });

  it('remplit les cases au fil de la frappe', async () => {
    // changeText sur `join-input` avec 'ogo', puis les cases 0..2 portent o,g,o
    // et la case 3 est vide.
  });

  // Les deux états du bouton, chacun avec sa fixture.
  it('ne rend pas l’action tant que le code est incomplet', async () => {
    // queryByTestId('join-submit') vaut null pour 'ogo'
  });

  it('rend l’action quand les dix lettres sont saisies', async () => {
    // getByTestId('join-submit') existe pour 'ogokmyyqrl'
  });

  it('remonte le slug à la validation', async () => {
    // onJoinRoom appelé avec 'ogo-kmyy-qrl'
  });

  describe('coller un lien', () => {
    it('accepte un lien d’un hôte connu', async () => {
      // presse-papiers = https://meet.linagora.com/ogo-kmyy-qrl
      // -> les cases se remplissent
    });

    // La branche de REFUS doit être empruntée : c'est la garde qui empêche de
    // suivre un lien vers une instance étrangère, la même allowlist que les
    // liens profonds.
    it('refuse un lien d’un hôte inconnu', async () => {
      // presse-papiers = https://evil.example/ogo-kmyy-qrl
      // -> les cases restent vides, `join-paste-error` est rendu
    });
  });
});
```

> **Écrire ces tests en entier avant d'implémenter**, et les exécuter contre
> HEAD pour vérifier qu'ils échouent de la bonne façon. Le dépôt s'est fait
> avoir cinq fois par du code de test cité sans avoir été lancé.

- [ ] **Step 2 à 6** : vérifier l'échec, implémenter, ajouter les sept locales,
  vérifier `npx jest src/i18n/`, muter, commit.

---

## Task 5: L'accueil

**Files:**
- Modify: `src/screens/home.tsx` + `src/screens/home.spec.tsx`
- Modify: `src/i18n/locales/*.json` — clés `home.*`

- [ ] **Step 1: Composer**

`AppHeader` (titre `t('home.title')`, avatar → `/reglages`), puis deux
`ActionCard`, puis `SectionLabel` « Mes réunions » et la liste existante dans un
`SurfaceCard` avec `InitialsAvatar`. La carte « Rejoindre » ouvre la
`JoinSheet` ; la carte « Nouvelle réunion » pousse `/room/create`.

**« Se déconnecter » est RETIRÉ** : Réglages le porte depuis le Lot 1.

**`home.spec.tsx:188` va rougir, et c'est attendu** — vérifié : ce fichier porte
un test « déconnecte et ramène à l'accueil sans laisser l'écran dans la pile »
qui espionne `signOut` (`:191`). Le **retirer**, pas le contourner : le
comportement n'existe plus ici. `reglages.spec.tsx` du Lot 1 le couvre déjà.

- [ ] **Step 2 à 5** : le spec existant doit rester vert pour tout le reste
  (filtre, tri, `displayName`), vérifier, muter, commit.

---

## Task 6: La connexion

**Files:**
- Modify: `src/screens/welcome.tsx` + `src/screens/welcome.spec.tsx`
- Modify: `src/i18n/locales/*.json` — clés `welcome.tagline`, `welcome.title`

- [ ] **Step 1: Composer**

`BrandTile` `lg`, titre « Twake » + « Visio » en deux `Text` (le second en
`brand`), baseline en `textSecondary`, puis les trois actions.

**Hiérarchie inversée, délibérément** : « S'inscrire » devient le bouton plein et
« Se connecter » le contour, comme au mockup. `welcome.tsx:39-45` fait
aujourd'hui l'inverse (`contained` sur `sign-in-btn`).

**Vérifié : `welcome.spec.tsx` ne rougira PAS.** Il n'assertit que la présence
des boutons par leur `testID` (`:15-16`), jamais leur `mode`. Ne pas chercher un
test cassé qui n'existe pas — mais en **ajouter** un sur la hiérarchie, sinon
rien ne garde la décision et un retour en arrière passerait au vert.

- [ ] **Step 2 à 5** : vérifier, muter, commit.

---

## Task 7: `create.tsx` restyé

**Files:**
- Modify: `src/screens/room/create.tsx` + son spec

Reste un **écran**, garde ses quatre champs dont les co-organisateurs. Seuls les
jetons et les primitives changent : `SurfaceCard` autour des groupes,
`SectionLabel` pour les intitulés, boutons aux couleurs du Lot 1.

**Ne rien retirer.** Le mockup n'a pas prévu les co-organisateurs ; ce n'est pas
une décision de les supprimer.

- [ ] **Step 1 à 5** : composer, vérifier que le spec existant reste vert, muter, commit.

---

## Self-review

**Couverture de la spec.** §1 liste abandonnée → aucune tâche, c'est voulu.
§2 feuille neuve → Task 2. §3 create reste un écran → Task 7. Connexion →
Task 6. Accueil → Task 5. Rejoindre → Tasks 3, 4. Dépendances → déjà installées.

**Cohérence des types.** `ActionCard` et `BrandTile` (Task 1) sont consommés par
les Tasks 5 et 6. `FormSheet` (Task 2) par la Task 4. `roomCodeEntry` (Task 3)
par la Task 4. Aucune tâche ne consomme une interface définie après elle.

**Trois endroits où l'implémenteur doit OUVRIR un fichier plutôt que me croire** :
le préambule de `bottomSheet.spec.tsx` (Task 2), le spec d'écran voisin pour le
mock d'`expo-router` (Task 4), et les specs existants de `home` et `welcome`
(Tasks 5 et 6), dont des assertions vont devenir fausses par décision.
