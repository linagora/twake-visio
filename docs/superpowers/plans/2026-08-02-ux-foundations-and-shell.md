# Refonte UX/UI — Lot 1 : fondations, coque, capacité agenda — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le bleu Material générique par le système visuel du mockup, poser une coque à trois onglets, et livrer les écrans Historique et Réglages, sans toucher à l'écran d'appel.

**Architecture:** Les jetons de `src/ui/tokens` deviennent la source unique du style ; `makeTheme` cesse de suivre le schéma système et rend toujours le thème clair ; sept primitives dans `src/ui/` portent les motifs répétés ; deux magasins MMKV (`preferences`, `journal`) alimentent Réglages et Historique ; la capacité agenda passe par `InstanceFeatures`, la chaîne qui porte déjà `recording`.

**Tech Stack:** Expo SDK 57 / RN 0.86, expo-router 57 (`Tabs` natif, pas `@react-navigation`), react-native-paper 5.15.3, react-native-mmkv 4, i18next, date-fns 4, Jest + `@testing-library/react-native` 14.

**Spec:** `docs/superpowers/specs/2026-08-02-ux-foundations-and-shell-design.md`

---

## Global Constraints

- **Aucun style en ligne.** Jamais de `style={{…}}` littéral ; toujours `StyleSheet.create` alimenté par `src/ui/tokens`.
- **Named exports uniquement.** `export default` est interdit **sauf** sous `app/`, où expo-router l'exige.
- **Les fichiers sous `app/` font une ligne et ne portent aucune logique.** Les écrans vivent dans `src/screens/`, leur spec à côté.
- **Sept locales**, toutes remplies : `en fr es it de vi ru`. `src/i18n/index.spec.ts` échoue si une clé manque quelque part. Aucune chaîne utilisateur codée en dur.
- **Props de geste préfixées** : `onRowPress`, `onAvatarPress`, `onOptionPress`. Jamais `onPress`, `onLongPress`, `onChangeText` — un nom repris rend le test vert par accident.
- **RNTL 14 est asynchrone** : `await` sur `render`, `fireEvent`, `fireEvent.press`, `renderHook`, `cleanup`. `tsc` ne le signalera pas.
- **`toHaveStyle` vient de RNTL, pas de `jest-native`** — RNTL charge en second et écrase dix des douze matchers homonymes. `toHaveTextContent` compare donc la chaîne **entière** ; seule une regex cherche un fragment.
- **Ne jamais assertir sur une prop qu'un composant consomme lui-même** (`visible`, `behavior`, `rippleColor`…) : elle vaut `undefined` sur l'élément hôte et le test est vert dans les deux états. Assertir sur une conséquence observable.
- **Ne pas toucher `src/screens/room/` sauf** les deux lignes de `prejoin.tsx` nommées en Task 9. Quatorze branches y travaillent.
- **Commandes** : `npm test`, `npm run typecheck`, `npm run lint` doivent être verts avant chaque commit. Installer avec `npx expo install`, jamais `npm install`.
- **Worktree** : `/Users/mmaudet/work/twake-visio-wt/ux-shell`, branche `design/ux-shell`. `node_modules` y est un lien symbolique vers le dépôt principal.

---

## Contraste : les cinq valeurs du mockup qui échouent, et leur correction

Mesuré le 2026-08-02 par calcul WCAG 2.1. Le mockup est un document web ; cinq de ses valeurs échouent le seuil AA que `src/ui/theme.spec.ts` **impose déjà** au thème. Les corrections ci-dessous sont le plus petit assombrissement qui atteint le seuil, à teinte préservée.

| Rôle | Mockup | Sur | Ratio | Corrigé | Ratio |
| --- | --- | --- | --- | --- | --- |
| Texte de bouton | `#FFFFFF` sur `#1FA45C` | — | **3,22** | `#FFFFFF` sur `#177E44` | **5,12** |
| Méta | `#767E79` | `#FFFFFF` | **4,17** | `#717874` | **4,52** |
| Libellé de section | `#8A928D` | `#F5F7F6` | **2,97** | `#6D7370` | **4,50** |
| Onglet inactif | `#939B96` | `#FFFFFF` | **2,85** | `#727875` | **4,51** |
| Pied de page | `#A6ADA9` | `#F5F7F6` | **2,25** | `#6E7270` | **4,53** |

**Conséquence de conception.** `#1FA45C` reste le vert de marque mais devient un **accent non textuel** : remplissages, anneaux, pastille d'onglet actif — sur blanc uniquement (3,22:1, au-dessus du seuil non textuel de 3:1), **jamais sur `#F5F7F6`** où il tombe à 2,99. Le vert qui porte du texte est `#177E44`.

Le chevron `#9AA29D` est un glyphe décoratif, soumis au seuil non textuel : il passe à `#8F9692` (3,02:1).

---

## File Structure

**Créés**

| Fichier | Responsabilité |
| --- | --- |
| `src/ui/sectionLabel.tsx` | Libellé de section capitalisé |
| `src/ui/surfaceCard.tsx` | Carte blanche, bordure, rayon 18 |
| `src/ui/initialsAvatar.tsx` | Pastille d'initiales, 3 tailles, paire de couleurs |
| `src/ui/emptyState.tsx` | État vide centré |
| `src/ui/appHeader.tsx` | Tuile-logo + titre + avatar |
| `src/ui/searchField.tsx` | Champ de recherche |
| `src/ui/settingRow.tsx` | Rangée dépliante, valeur courante + options |
| `src/settings/preferences.ts` | Magasin MMKV des quatre préférences |
| `src/rooms/journal.ts` | Journal MMKV des réunions rejointes |
| `src/screens/historique.tsx` | Écran Historique |
| `src/screens/reglages.tsx` | Écran Réglages |
| `app/(tabs)/_layout.tsx` | Coque à trois onglets, barre custom |
| `app/(tabs)/home.tsx` | Route (déplacée) |
| `app/(tabs)/historique.tsx` | Route |
| `app/(tabs)/reglages.tsx` | Route |
| `assets/fonts/Manrope-{Medium,SemiBold,Bold,ExtraBold}.ttf` | Police |

**Modifiés**

| Fichier | Changement |
| --- | --- |
| `src/ui/tokens/index.ts` | Palette du mockup, corrigée pour AA |
| `src/ui/theme.ts` | Toujours clair ; primary vert ; polices Manrope |
| `src/ui/theme.spec.ts` | Réécrit : le thème n'a plus deux schémas |
| `app/_layout.tsx` | Perd `useColorScheme` ; charge les polices |
| `src/instance/types.ts` | `InstanceFeatures.calendar` |
| `src/instance/discovery.ts` | Parse `calendar`, fermé par défaut |
| `src/call/agenda.ts` | *(créé)* `canShowAgenda` |
| `src/screens/room/prejoin.tsx` | 2 lignes : lit les préférences, écrit le journal |
| `src/screens/room/create.tsx` | 1 ligne : niveau d'accès par défaut |
| `src/i18n/index.ts` | Préférence de langue avant le système |
| `src/i18n/locales/*.json` | Clés des deux écrans, 7 fichiers |
| `app/home.tsx` | **Supprimé** (déplacé sous `(tabs)/`) |

---

## Task 1: Jetons et thème toujours clair

> **Corrigé après livraison (commit `b4af52b`).** Les Tasks 1 et 2 ont été
> livrées **ensemble** : le thème nomme des familles de police, et les committer
> séparément aurait laissé un thème pointant vers des polices absentes.
>
> Et le tableau de contraste ci-dessus était **incomplet**. Le spec réécrit a
> rougi sur deux paires que je n'avais pas mesurées :
>
> | Rôle | Écrit au plan | Mesuré | Retenu |
> | --- | --- | --- | --- |
> | `danger` sur le fond | non mesuré | **4,21** | `#D03939` (4,51) |
> | `outline` sur la surface | `fieldBorder` | **1,26** | `controlOutline` `#7C847F` (3,84) |
>
> La seconde est une erreur de conception, pas d'arithmétique : j'avais mis le
> filet DÉCORATIF d'une carte sur le rôle que Paper emploie pour dessiner le
> contour d'une COMMANDE, où WCAG 1.4.11 s'applique. Les deux rôles sont
> désormais des jetons distincts.

**Files:**
- Modify: `src/ui/tokens/index.ts`
- Modify: `src/ui/theme.ts:5-41`
- Modify: `app/_layout.tsx:18` (retrait de `useColorScheme`)
- Test: `src/ui/theme.spec.ts` (réécrit)

**Interfaces:**
- Produces: `tokens.color.{brand,brandStrong,brandWash,onBrand,appBackground,cardSurface,cardBorder,rowSeparator,fieldBorder,textPrimary,textSecondary,textMeta,textSectionLabel,textTabInactive,textChevron,textFooter,danger,avatarBackground,avatarForeground}`, `tokens.radius.card`, `tokens.typography.{sectionLabel,rowTitle,rowHint,tabLabel,screenTitle}`
- Produces: `makeTheme(): MD3Theme` — **la signature perd son paramètre**
- Consumes: rien

- [ ] **Step 1: Écrire le test qui échoue**

Remplacer intégralement `src/ui/theme.spec.ts` par :

```ts
import { makeTheme } from 'src/ui/theme';
import { tokens } from 'src/ui/tokens';

// Luminance relative WCAG 2.1.
function computeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function computeContrast(a: string, b: string): number {
  const [light, dark] = [computeLuminance(a), computeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

const AA_NORMAL_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe('makeTheme', () => {
  // La coque est claire quel que soit le schéma système : c'est la décision de
  // conception du Lot 1, et c'est elle qui rend `onSurface` juste par défaut
  // hors écran d'appel, au lieu d'étendre le piège à 1,08:1 aux écrans neufs.
  it('rend un thème clair, sans paramètre de schéma', () => {
    expect(makeTheme().dark).toBe(false);
    expect(makeTheme().colors.background).toBe(tokens.color.appBackground);
    expect(makeTheme().colors.surface).toBe(tokens.color.cardSurface);
  });

  it('respecte le contraste AA du texte sur le fond', () => {
    const { colors } = makeTheme();
    expect(computeContrast(colors.onSurface, colors.background)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });

  // #1FA45C avec du blanc ne donne que 3,22:1. Le vert qui porte du texte est
  // donc `brandStrong`, et `brand` reste un accent non textuel.
  it('respecte le contraste AA de onPrimary sur primary', () => {
    const { colors } = makeTheme();
    expect(computeContrast(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });

  it('respecte le contraste AA de la couleur d’erreur sur le fond', () => {
    const { colors } = makeTheme();
    expect(computeContrast(colors.error, colors.background)).toBeGreaterThanOrEqual(
      AA_NORMAL_TEXT,
    );
  });

  it('aligne onSurfaceVariant sur onSurface', () => {
    const { colors } = makeTheme();
    expect(colors.onSurfaceVariant).toBe(colors.onSurface);
  });

  it('aligne surfaceVariant sur surface', () => {
    const { colors } = makeTheme();
    expect(colors.surfaceVariant).toBe(colors.surface);
  });

  it('applique le rayon des tokens au thème', () => {
    expect(makeTheme().roundness).toBe(tokens.radius.md);
  });
});

// Les valeurs que le mockup donne et qui échouent WCAG AA ont été corrigées
// par le plus petit assombrissement possible, à teinte préservée. Ce tableau
// est la garde qui empêche de les remettre telles quelles.
describe('palette de la coque', () => {
  it.each([
    ['textPrimary', tokens.color.textPrimary, tokens.color.appBackground],
    ['textPrimary sur carte', tokens.color.textPrimary, tokens.color.cardSurface],
    ['textMeta', tokens.color.textMeta, tokens.color.cardSurface],
    ['textSectionLabel', tokens.color.textSectionLabel, tokens.color.appBackground],
    ['textTabInactive', tokens.color.textTabInactive, tokens.color.cardSurface],
    ['textFooter', tokens.color.textFooter, tokens.color.appBackground],
    ['brandStrong sur carte', tokens.color.brandStrong, tokens.color.cardSurface],
    ['brandStrong sur lavis', tokens.color.brandStrong, tokens.color.brandWash],
    ['danger', tokens.color.danger, tokens.color.cardSurface],
  ])('%s respecte AA pour du texte', (_label, fg, bg) => {
    expect(computeContrast(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  // `brand` porte des remplissages et des anneaux, jamais du texte : seuil 3:1.
  // Et sur BLANC seulement — sur `appBackground` il tombe à 2,99.
  it('brand respecte le seuil non textuel sur une carte blanche', () => {
    expect(computeContrast(tokens.color.brand, tokens.color.cardSurface)).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    );
  });

  it('textChevron respecte le seuil non textuel sur une carte blanche', () => {
    expect(
      computeContrast(tokens.color.textChevron, tokens.color.cardSurface),
    ).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npx jest src/ui/theme.spec.ts
```

Attendu : ÉCHEC. `makeTheme()` sans argument ne compile pas encore et `tokens.color.brand` est `undefined`, donc `computeLuminance` renvoie `NaN` et les comparaisons échouent.

- [ ] **Step 3: Étendre les jetons**

Dans `src/ui/tokens/index.ts`, **ajouter** au bloc `color` (ne rien retirer — `call.tsx` consomme les jetons `*Dark`) :

```ts
    // — Système visuel de la coque, transcrit du projet Claude Design
    //   « Twake Visio, navigation mobile », fichier VisioPhone.dc.html.
    //
    // Cinq valeurs du mockup échouaient WCAG AA et ont été assombries au
    // minimum, à teinte préservée. Le détail des ratios est dans
    // docs/superpowers/plans/2026-08-02-ux-foundations-and-shell.md.
    //
    // `brand` ne porte JAMAIS de texte : blanc dessus ne donne que 3,22:1.
    // C'est un accent — remplissage, anneau, pastille — et sur fond blanc
    // seulement : sur `appBackground` il tombe à 2,99, sous le seuil non
    // textuel lui-même. Le vert qui porte du texte est `brandStrong`.
    brand: '#1FA45C',
    brandStrong: '#177E44',
    brandWash: '#EAF6EF',
    onBrand: '#FFFFFF',

    appBackground: '#F5F7F6',
    cardSurface: '#FFFFFF',
    cardBorder: '#E7EBE9',
    rowSeparator: '#F0F3F1',
    fieldBorder: '#E1E6E3',

    textPrimary: '#141815',
    textSecondary: '#5A625D',
    textMeta: '#717874', // mockup #767E79 → 4,17:1
    textSectionLabel: '#6D7370', // mockup #8A928D → 2,97:1
    textTabInactive: '#727875', // mockup #939B96 → 2,85:1
    textChevron: '#8F9692', // mockup #9AA29D → 2,88:1 (seuil non textuel)
    textFooter: '#6E7270', // mockup #A6ADA9 → 2,25:1

    danger: '#D93B3B',
    avatarBackground: '#F2C879',
    avatarForeground: '#6A4B10',
```

Ajouter au bloc `radius` : `card: 18,`
Ajouter au bloc `typography` :

```ts
    sectionLabel: { fontSize: 12, lineHeight: 16, letterSpacing: 1 },
    rowTitle: { fontSize: 15, lineHeight: 20 },
    rowHint: { fontSize: 12, lineHeight: 17 },
    tabLabel: { fontSize: 11, lineHeight: 14 },
    screenTitle: { fontSize: 19, lineHeight: 24, letterSpacing: -0.4 },
```

- [ ] **Step 4: Rendre `makeTheme` toujours clair**

Remplacer le corps de `src/ui/theme.ts` :

```ts
import { MD3LightTheme, type MD3Theme } from 'react-native-paper';

import { tokens } from 'src/ui/tokens';

// La coque est claire quel que soit le schéma système, et c'est délibéré.
//
// `AGENTS.md` consacre sa plus longue section à un piège : `call.tsx` force
// `backgroundDark`, mais Paper fait retomber son texte sur
// `theme.colors.onSurface`. Tant que ce thème pouvait être clair OU sombre,
// tout composant posé sur l'appel devait poser sa couleur explicite, et deux
// périmètres ont livré du noir sur noir à 1,08:1.
//
// En rendant la coque toujours claire, `onSurface` redevient JUSTE par défaut
// partout hors appel : le piège cesse de s'étendre aux écrans neufs. L'écran
// d'appel garde ses couleurs explicites, la doctrine continue de s'y appliquer.
//
// Le coût, assumé : l'application ne suit plus le mode sombre du système. Le
// mockup ne spécifie aucune valeur sombre pour la coque, et les inventer serait
// de la conception, pas de la transcription.
export function makeTheme(): MD3Theme {
  return {
    ...MD3LightTheme,
    roundness: tokens.radius.md,
    colors: {
      ...MD3LightTheme.colors,
      // `brandStrong`, pas `brand` : blanc sur #1FA45C ne donne que 3,22:1,
      // sous le seuil AA que la spec de ce fichier impose.
      primary: tokens.color.brandStrong,
      onPrimary: tokens.color.onBrand,
      background: tokens.color.appBackground,
      surface: tokens.color.cardSurface,
      onSurface: tokens.color.textPrimary,
      error: tokens.color.danger,
      surfaceVariant: tokens.color.cardSurface,
      onSurfaceVariant: tokens.color.textPrimary,
      outline: tokens.color.fieldBorder,
    },
  };
}
```

- [ ] **Step 5: Retirer `useColorScheme` de la racine**

Dans `app/_layout.tsx` : supprimer l'import de `useColorScheme` depuis `react-native`, supprimer la ligne `const scheme = useColorScheme();`, et remplacer `theme={makeTheme(scheme === 'dark' ? 'dark' : 'light')}` par `theme={makeTheme()}`.

- [ ] **Step 6: Vérifier**

```bash
npx jest src/ui/theme.spec.ts && npm run typecheck && npm run lint
```

Attendu : tous verts. `typecheck` est le garde-fou qui trouvera tout appelant résiduel de `makeTheme(scheme)`.

- [ ] **Step 7: Lancer la suite complète**

```bash
npm test
```

Attendu : vert. Si un spec d'écran échoue sur une couleur, c'est qu'il assertait une valeur du thème sombre — corriger l'attendu, pas le thème.

- [ ] **Step 8: Commit**

```bash
git add src/ui/tokens/index.ts src/ui/theme.ts src/ui/theme.spec.ts app/_layout.tsx
git commit -m "feat(ui): Transcribe the mockup palette and force the light theme"
```

---

## Task 2: Manrope

> **Corrigé après livraison (commit `b4af52b`).** L'étape 1 ci-dessous — `curl`
> de quatre copies du même fichier variable depuis `google/fonts` — était une
> mauvaise idée, et sa propre note l'admettait à demi. Ce qui a été fait :
>
> ```bash
> npx expo install expo-font @expo-google-fonts/manrope
> ```
>
> Le paquet livre les **instances statiques** — `Manrope_500Medium`,
> `_600SemiBold`, `_700Bold`, `_800ExtraBold` — donc aucun fichier à récupérer à
> la main, aucun `assets/fonts/`, et pas de pari sur le rendu d'une police
> variable sous Android.
>
> **Conséquence sur les jetons** : `tokens.font.*` porte les noms du paquet
> (`Manrope_500Medium`), pas ceux inventés ici (`Manrope-Medium`). Une clé qui ne
> correspond pas charge le fichier sous un nom que `fontFamily` ne retrouve
> jamais — sans erreur, avec un repli silencieux sur la police système.
>
> **Effet de bord à connaître** : `npx expo install` depuis ce worktree a
> remplacé son lien symbolique `node_modules` par un vrai dossier. Le dépôt
> principal et les treize autres worktrees sont intacts.

**Files:**
- Create: `assets/fonts/Manrope-{Medium,SemiBold,Bold,ExtraBold}.ttf`
- Modify: `src/ui/theme.ts` (bloc `fonts`)
- Modify: `app/_layout.tsx` (chargement)
- Test: `src/ui/theme.spec.ts` (ajout)

**Interfaces:**
- Consumes: `makeTheme()` de la Task 1
- Produces: `tokens.font.{medium,semiBold,bold,extraBold}` — noms de familles à passer à `fontFamily`

- [ ] **Step 1: Installer expo-font et récupérer la police**

```bash
npx expo install expo-font
mkdir -p assets/fonts
base=https://raw.githubusercontent.com/google/fonts/main/ofl/manrope
for w in Medium SemiBold Bold ExtraBold; do
  curl -sSL -o "assets/fonts/Manrope-$w.ttf" "$base/Manrope%5Bwght%5D.ttf"
done
ls -la assets/fonts/
```

> **Note.** Manrope est publiée en police variable (`Manrope[wght].ttf`). Les quatre fichiers ci-dessus sont donc identiques ; c'est voulu — `expo-font` charge un fichier par nom de famille, et la variable porte toutes les graisses. Si le rendu ignore la graisse sur Android, remplacer par les instances statiques de `https://github.com/sharanda/manrope/tree/master/fonts/ttf` et relancer le build natif. **Mesuré : le mockup n'emploie aucune Regular** — 800 (×53), 700 (×51), 500 (×14), 600 (×12).

- [ ] **Step 2: Écrire le test qui échoue**

Ajouter à `src/ui/theme.spec.ts` :

```ts
describe('polices du thème', () => {
  // Paper lit `fonts.<variant>.fontFamily` pour chacune de ses variantes de
  // typographie. Sans ce bloc, tout `Text` de Paper retombe sur la police
  // système, et la refonte n'est visible nulle part.
  it('pose Manrope sur les variantes de corps et de titre', () => {
    const { fonts } = makeTheme();
    expect(fonts.bodyMedium.fontFamily).toBe(tokens.font.medium);
    expect(fonts.titleMedium.fontFamily).toBe(tokens.font.bold);
    expect(fonts.labelLarge.fontFamily).toBe(tokens.font.semiBold);
  });
});
```

- [ ] **Step 3: Lancer pour vérifier l'échec**

```bash
npx jest src/ui/theme.spec.ts -t "polices du thème"
```

Attendu : ÉCHEC, `tokens.font` est `undefined`.

- [ ] **Step 4: Ajouter les noms de familles aux jetons**

Dans `src/ui/tokens/index.ts`, ajouter au niveau racine de `tokens` :

```ts
  // Les noms passés à `Font.loadAsync` ; ce sont eux, pas les chemins, que
  // `fontFamily` attend ensuite.
  font: {
    medium: 'Manrope-Medium',
    semiBold: 'Manrope-SemiBold',
    bold: 'Manrope-Bold',
    extraBold: 'Manrope-ExtraBold',
  },
```

- [ ] **Step 5: Poser les polices sur le thème**

Dans `src/ui/theme.ts`, ajouter `fonts` au retour de `makeTheme`, après `colors` :

```ts
    fonts: {
      ...MD3LightTheme.fonts,
      bodySmall: { ...MD3LightTheme.fonts.bodySmall, fontFamily: tokens.font.medium },
      bodyMedium: { ...MD3LightTheme.fonts.bodyMedium, fontFamily: tokens.font.medium },
      bodyLarge: { ...MD3LightTheme.fonts.bodyLarge, fontFamily: tokens.font.medium },
      labelSmall: { ...MD3LightTheme.fonts.labelSmall, fontFamily: tokens.font.semiBold },
      labelMedium: { ...MD3LightTheme.fonts.labelMedium, fontFamily: tokens.font.semiBold },
      labelLarge: { ...MD3LightTheme.fonts.labelLarge, fontFamily: tokens.font.semiBold },
      titleSmall: { ...MD3LightTheme.fonts.titleSmall, fontFamily: tokens.font.bold },
      titleMedium: { ...MD3LightTheme.fonts.titleMedium, fontFamily: tokens.font.bold },
      titleLarge: { ...MD3LightTheme.fonts.titleLarge, fontFamily: tokens.font.extraBold },
      headlineSmall: { ...MD3LightTheme.fonts.headlineSmall, fontFamily: tokens.font.extraBold },
    },
```

- [ ] **Step 6: Charger les fichiers au démarrage**

Dans `app/_layout.tsx`, à côté du garde `i18nReady` qui existe déjà et suit le même motif :

```tsx
import { useFonts } from 'expo-font';
// …
  const [fontsLoaded] = useFonts({
    'Manrope-Medium': require('assets/fonts/Manrope-Medium.ttf'),
    'Manrope-SemiBold': require('assets/fonts/Manrope-SemiBold.ttf'),
    'Manrope-Bold': require('assets/fonts/Manrope-Bold.ttf'),
    'Manrope-ExtraBold': require('assets/fonts/Manrope-ExtraBold.ttf'),
  });

  if (!i18nReady || !fontsLoaded) return null;
```

`require` d'un binaire demande une dérogation eslint ciblée si la règle `@typescript-eslint/no-require-imports` proteste — une ligne, avec son motif au-dessus.

- [ ] **Step 7: Vérifier**

```bash
npx jest src/ui/theme.spec.ts && npm run typecheck && npm run lint && npm test
```

- [ ] **Step 8: Commit**

```bash
git add assets/fonts src/ui/tokens/index.ts src/ui/theme.ts app/_layout.tsx src/ui/theme.spec.ts package.json package-lock.json
git commit -m "feat(ui): Load Manrope in the four weights the mockup uses"
```

---

## Task 3: Primitives d'affichage — SectionLabel, SurfaceCard, InitialsAvatar, EmptyState

**Files:**
- Create: `src/ui/sectionLabel.tsx` + `src/ui/sectionLabel.spec.tsx`
- Create: `src/ui/surfaceCard.tsx` + `src/ui/surfaceCard.spec.tsx`
- Create: `src/ui/initialsAvatar.tsx` + `src/ui/initialsAvatar.spec.tsx`
- Create: `src/ui/emptyState.tsx` + `src/ui/emptyState.spec.tsx`

**Interfaces:**
- Consumes: `tokens` (Task 1)
- Produces:
  - `SectionLabel({ label, testID }): React.ReactElement`
  - `SurfaceCard({ children, testID }): React.ReactElement`
  - `InitialsAvatar({ name, size, testID }): React.ReactElement` — `size` est `'sm' | 'md' | 'lg'` (32 / 40 / 56 px)
  - `initialsOf(name: string): string` — exporté depuis `initialsAvatar.tsx`, réutilisé par l'Historique
  - `EmptyState({ message, testID }): React.ReactElement`

- [ ] **Step 1: Écrire les tests qui échouent**

`src/ui/initialsAvatar.spec.tsx` :

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { InitialsAvatar, initialsOf } from './initialsAvatar';

describe('initialsOf', () => {
  it('prend les deux premières initiales d’un nom composé', () => {
    expect(initialsOf('Michel Maudet')).toBe('MM');
  });

  it('prend une seule lettre d’un nom simple', () => {
    expect(initialsOf('Michel')).toBe('M');
  });

  // La condition « plus d'un mot » doit être fausse ici, sinon la branche à un
  // seul mot n'est jamais empruntée et l'implémentation pourrait être constante.
  it('ignore les espaces surnuméraires', () => {
    expect(initialsOf('  Michel   Maudet  ')).toBe('MM');
  });

  it('rend une chaîne vide pour un nom vide', () => {
    expect(initialsOf('   ')).toBe('');
  });
});

describe('InitialsAvatar', () => {
  it('pose la couleur explicite du texte, jamais celle du thème', async () => {
    await render(<InitialsAvatar name="Michel Maudet" size="md" testID="avatar" />);
    expect(screen.getByTestId('avatar-text')).toHaveStyle({
      color: tokens.color.avatarForeground,
    });
  });

  it('pose la couleur explicite du fond', async () => {
    await render(<InitialsAvatar name="Michel Maudet" size="md" testID="avatar" />);
    expect(screen.getByTestId('avatar')).toHaveStyle({
      backgroundColor: tokens.color.avatarBackground,
    });
  });

  // Trois tailles, trois tests : la taille est une conditionnelle, sa fixture
  // doit prendre chacune de ses valeurs.
  it.each([
    ['sm', 32],
    ['md', 40],
    ['lg', 56],
  ] as const)('rend la taille %s à %i px', async (size, px) => {
    await render(<InitialsAvatar name="Michel Maudet" size={size} testID="avatar" />);
    expect(screen.getByTestId('avatar')).toHaveStyle({ width: px, height: px });
  });
});
```

`src/ui/sectionLabel.spec.tsx` :

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { SectionLabel } from './sectionLabel';

describe('SectionLabel', () => {
  it('pose la couleur explicite, jamais celle du thème', async () => {
    await render(<SectionLabel label="7 derniers jours" testID="label" />);
    expect(screen.getByTestId('label')).toHaveStyle({
      color: tokens.color.textSectionLabel,
    });
  });

  it('affiche son libellé', async () => {
    await render(<SectionLabel label="7 derniers jours" testID="label" />);
    expect(screen.getByTestId('label')).toHaveTextContent('7 derniers jours');
  });
});
```

`src/ui/surfaceCard.spec.tsx` :

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { tokens } from 'src/ui/tokens';
import { SurfaceCard } from './surfaceCard';

describe('SurfaceCard', () => {
  it('pose le fond et la bordure explicites', async () => {
    await render(
      <SurfaceCard testID="card">
        <Text>contenu</Text>
      </SurfaceCard>,
    );
    expect(screen.getByTestId('card')).toHaveStyle({
      backgroundColor: tokens.color.cardSurface,
      borderColor: tokens.color.cardBorder,
    });
  });

  it('rend ses enfants', async () => {
    await render(
      <SurfaceCard testID="card">
        <Text testID="child">contenu</Text>
      </SurfaceCard>,
    );
    expect(screen.getByTestId('child')).toBeTruthy();
  });
});
```

`src/ui/emptyState.spec.tsx` :

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { EmptyState } from './emptyState';

describe('EmptyState', () => {
  it('pose la couleur explicite', async () => {
    await render(<EmptyState message="Aucune réunion" testID="empty" />);
    expect(screen.getByTestId('empty')).toHaveStyle({ color: tokens.color.textSectionLabel });
  });

  it('affiche son message', async () => {
    await render(<EmptyState message="Aucune réunion" testID="empty" />);
    expect(screen.getByTestId('empty')).toHaveTextContent('Aucune réunion');
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx jest src/ui/sectionLabel.spec.tsx src/ui/surfaceCard.spec.tsx src/ui/initialsAvatar.spec.tsx src/ui/emptyState.spec.tsx
```

Attendu : ÉCHEC, `Cannot find module './sectionLabel'` et les trois autres.

- [ ] **Step 3: Implémenter les quatre**

`src/ui/sectionLabel.tsx` :

```tsx
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { tokens } from 'src/ui/tokens';

type Props = {
  readonly label: string;
  readonly testID?: string;
};

// Couleur explicite obligatoire : sans elle, un `Text` retombe sur
// `theme.colors.onSurface`, ce qui vaut ici mais ne vaudra plus si l'écran est
// un jour posé sur un fond sombre. La garde du spec tient sur cette égalité.
export function SectionLabel({ label, testID }: Props): React.ReactElement {
  return (
    <Text style={styles.label} testID={testID}>
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    color: tokens.color.textSectionLabel,
    fontFamily: tokens.font.extraBold,
    fontSize: tokens.typography.sectionLabel.fontSize,
    lineHeight: tokens.typography.sectionLabel.lineHeight,
    letterSpacing: tokens.typography.sectionLabel.letterSpacing,
    textTransform: 'uppercase',
  },
});
```

`src/ui/surfaceCard.tsx` :

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

type Props = {
  readonly children: React.ReactNode;
  readonly testID?: string;
};

export function SurfaceCard({ children, testID }: Props): React.ReactElement {
  return (
    <View style={styles.card} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.cardSurface,
    borderColor: tokens.color.cardBorder,
    borderWidth: 1,
    borderRadius: tokens.radius.card,
    overflow: 'hidden',
  },
});
```

`src/ui/initialsAvatar.tsx` :

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

export type AvatarSize = 'sm' | 'md' | 'lg';

type Props = {
  readonly name: string;
  readonly size: AvatarSize;
  readonly testID?: string;
};

const DIAMETER: Readonly<Record<AvatarSize, number>> = { sm: 32, md: 40, lg: 56 };
const GLYPH: Readonly<Record<AvatarSize, number>> = { sm: 13, md: 13, lg: 19 };

// Deux initiales au plus. Un nom d'un seul mot en donne une : deux lettres du
// même mot se liraient comme deux personnes.
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!.slice(0, 1).toUpperCase();
  return `${words[0]!.slice(0, 1)}${words[words.length - 1]!.slice(0, 1)}`.toUpperCase();
}

export function InitialsAvatar({ name, size, testID }: Props): React.ReactElement {
  const diameter = DIAMETER[size];
  return (
    <View
      style={[styles.circle, { width: diameter, height: diameter, borderRadius: diameter / 2 }]}
      testID={testID}
    >
      <Text
        style={[styles.text, { fontSize: GLYPH[size] }]}
        testID={testID === undefined ? undefined : `${testID}-text`}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    backgroundColor: tokens.color.avatarBackground,
    justifyContent: 'center',
  },
  text: {
    color: tokens.color.avatarForeground,
    fontFamily: tokens.font.extraBold,
  },
});
```

`src/ui/emptyState.tsx` :

```tsx
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { tokens } from 'src/ui/tokens';

type Props = {
  readonly message: string;
  readonly testID?: string;
};

export function EmptyState({ message, testID }: Props): React.ReactElement {
  return (
    <Text style={styles.message} testID={testID}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  message: {
    color: tokens.color.textSectionLabel,
    fontFamily: tokens.font.semiBold,
    fontSize: 14,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.lg,
    textAlign: 'center',
  },
});
```

- [ ] **Step 4: Vérifier**

```bash
npx jest src/ui/ && npm run typecheck && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/sectionLabel.* src/ui/surfaceCard.* src/ui/initialsAvatar.* src/ui/emptyState.*
git commit -m "feat(ui): Add the four display primitives of the new shell"
```

---

## Task 4: Primitives interactives — AppHeader, SearchField, SettingRow

**Files:**
- Create: `src/ui/appHeader.tsx` + `src/ui/appHeader.spec.tsx`
- Create: `src/ui/searchField.tsx` + `src/ui/searchField.spec.tsx`
- Create: `src/ui/settingRow.tsx` + `src/ui/settingRow.spec.tsx`

**Interfaces:**
- Consumes: `InitialsAvatar`, `tokens`
- Produces:
  - `AppHeader({ title, userName, onAvatarPress, testID })`
  - `SearchField({ value, placeholder, onQueryChange, testID })`
  - `SettingRow({ label, hint, currentLabel, options, selectedId, open, onRowPress, onOptionPress, testID })`
  - `export type SettingOption = { readonly id: string; readonly label: string }`

**Note de nommage, obligatoire.** `onQueryChange` et non `onChangeText`, `onRowPress` et non `onPress`, `onAvatarPress` et non `onPress`. Un nom repris d'un événement hôte est trouvé par `fireEvent.press` sur la fibre du composant lui-même : le test devient vert que la prop soit câblée ou non. Mesuré sur ce dépôt : zéro rouge sur la mutation, quatre après renommage.

- [ ] **Step 1: Écrire le test qui échoue**

`src/ui/settingRow.spec.tsx` — c'est la primitive la plus dense, donc celle qui porte le plus de gardes :

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { SettingRow } from './settingRow';

const OPTIONS = [
  { id: 'off', label: 'Coupé' },
  { id: 'on', label: 'Actif' },
];

function renderRow(overrides: Partial<React.ComponentProps<typeof SettingRow>> = {}) {
  return render(
    <SettingRow
      label="Micro à l’entrée"
      hint="Valeur appliquée à chaque nouvelle salle"
      currentLabel="Coupé"
      options={OPTIONS}
      selectedId="off"
      open={false}
      onRowPress={jest.fn()}
      onOptionPress={jest.fn()}
      testID="row"
      {...overrides}
    />,
  );
}

describe('SettingRow', () => {
  it('pose la couleur explicite du libellé', async () => {
    await renderRow();
    expect(screen.getByTestId('row-label')).toHaveStyle({ color: tokens.color.textPrimary });
  });

  it('pose la couleur explicite de la valeur courante', async () => {
    await renderRow();
    expect(screen.getByTestId('row-current')).toHaveStyle({ color: tokens.color.brandStrong });
  });

  // Repliée / dépliée : la conditionnelle doit être vraie ET fausse, et
  // l'assertion observe le RENDU, jamais une prop `open` que le composant
  // consomme lui-même et qui vaudrait `undefined` sur l'élément hôte.
  it('ne rend aucune option quand elle est repliée', async () => {
    await renderRow({ open: false });
    expect(screen.queryByTestId('row-option-off')).toBe(null);
    expect(screen.queryByTestId('row-option-on')).toBe(null);
  });

  it('rend une option par choix quand elle est dépliée', async () => {
    await renderRow({ open: true });
    expect(screen.getByTestId('row-option-off')).toBeTruthy();
    expect(screen.getByTestId('row-option-on')).toBeTruthy();
  });

  it('coche l’option sélectionnée, et elle seule', async () => {
    await renderRow({ open: true, selectedId: 'on' });
    expect(screen.getByTestId('row-check-on')).toBeTruthy();
    expect(screen.queryByTestId('row-check-off')).toBe(null);
  });

  it('appelle onRowPress quand on presse la rangée', async () => {
    const onRowPress = jest.fn();
    await renderRow({ onRowPress });
    await fireEvent.press(screen.getByTestId('row-header'));
    expect(onRowPress).toHaveBeenCalledTimes(1);
  });

  it('appelle onOptionPress avec l’identifiant de l’option pressée', async () => {
    const onOptionPress = jest.fn();
    await renderRow({ open: true, onOptionPress });
    await fireEvent.press(screen.getByTestId('row-option-on'));
    expect(onOptionPress).toHaveBeenCalledWith('on');
  });
});
```

`src/ui/searchField.spec.tsx` :

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { SearchField } from './searchField';

describe('SearchField', () => {
  it('pose la couleur explicite de la saisie', async () => {
    await render(
      <SearchField value="" placeholder="Rechercher" onQueryChange={jest.fn()} testID="search" />,
    );
    expect(screen.getByTestId('search-input')).toHaveStyle({ color: tokens.color.textPrimary });
  });

  it('remonte chaque frappe via onQueryChange', async () => {
    const onQueryChange = jest.fn();
    await render(
      <SearchField value="" placeholder="Rechercher" onQueryChange={onQueryChange} testID="search" />,
    );
    await fireEvent.changeText(screen.getByTestId('search-input'), 'produit');
    expect(onQueryChange).toHaveBeenCalledWith('produit');
  });
});
```

`src/ui/appHeader.spec.tsx` :

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { AppHeader } from './appHeader';

describe('AppHeader', () => {
  it('pose la couleur explicite du titre', async () => {
    await render(
      <AppHeader title="Twake Visio" userName="Michel Maudet" onAvatarPress={jest.fn()} testID="header" />,
    );
    expect(screen.getByTestId('header-title')).toHaveStyle({ color: tokens.color.textPrimary });
  });

  it('affiche son titre', async () => {
    await render(
      <AppHeader title="Historique" userName="Michel Maudet" onAvatarPress={jest.fn()} testID="header" />,
    );
    expect(screen.getByTestId('header-title')).toHaveTextContent('Historique');
  });

  it('appelle onAvatarPress quand on presse l’avatar', async () => {
    const onAvatarPress = jest.fn();
    await render(
      <AppHeader title="Twake Visio" userName="Michel Maudet" onAvatarPress={onAvatarPress} testID="header" />,
    );
    await fireEvent.press(screen.getByTestId('header-avatar'));
    expect(onAvatarPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx jest src/ui/settingRow.spec.tsx src/ui/searchField.spec.tsx src/ui/appHeader.spec.tsx
```

Attendu : ÉCHEC, modules introuvables.

- [ ] **Step 3: Implémenter `SettingRow`**

```tsx
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

export type SettingOption = {
  readonly id: string;
  readonly label: string;
};

type Props = {
  readonly label: string;
  readonly hint: string;
  readonly currentLabel: string;
  readonly options: readonly SettingOption[];
  readonly selectedId: string;
  readonly open: boolean;
  readonly onRowPress: () => void;
  readonly onOptionPress: (id: string) => void;
  readonly testID: string;
};

export function SettingRow({
  label,
  hint,
  currentLabel,
  options,
  selectedId,
  open,
  onRowPress,
  onOptionPress,
  testID,
}: Props): React.ReactElement {
  return (
    <View style={styles.row}>
      <Pressable onPress={onRowPress} style={styles.header} testID={`${testID}-header`}>
        <View style={styles.headerText}>
          <Text style={styles.label} testID={`${testID}-label`}>
            {label}
          </Text>
          {hint.length > 0 ? (
            <Text style={styles.hint} testID={`${testID}-hint`}>
              {hint}
            </Text>
          ) : null}
        </View>
        <Text style={styles.current} testID={`${testID}-current`}>
          {currentLabel}
        </Text>
        <MaterialCommunityIcons
          color={tokens.color.textChevron}
          name={open ? 'chevron-down' : 'chevron-right'}
          size={20}
        />
      </Pressable>
      {open ? (
        <View style={styles.options}>
          {options.map((option) => (
            <Pressable
              key={option.id}
              onPress={() => onOptionPress(option.id)}
              style={[styles.option, option.id === selectedId ? styles.optionSelected : null]}
              testID={`${testID}-option-${option.id}`}
            >
              <Text style={styles.optionLabel} testID={`${testID}-option-label-${option.id}`}>
                {option.label}
              </Text>
              {option.id === selectedId ? (
                <MaterialCommunityIcons
                  color={tokens.color.brandStrong}
                  name="check"
                  size={18}
                  testID={`${testID}-check-${option.id}`}
                />
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderBottomColor: tokens.color.rowSeparator, borderBottomWidth: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    minHeight: 56,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 14,
  },
  headerText: { flex: 1, gap: 2 },
  label: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.bold,
    fontSize: tokens.typography.rowTitle.fontSize,
  },
  hint: {
    color: tokens.color.textSectionLabel,
    fontFamily: tokens.font.medium,
    fontSize: tokens.typography.rowHint.fontSize,
    lineHeight: tokens.typography.rowHint.lineHeight,
  },
  current: { color: tokens.color.brandStrong, fontFamily: tokens.font.bold, fontSize: 13 },
  options: { gap: 6, paddingBottom: 14, paddingHorizontal: tokens.spacing.md },
  option: {
    alignItems: 'center',
    borderColor: tokens.color.fieldBorder,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionSelected: { backgroundColor: tokens.color.brandWash, borderColor: tokens.color.brand },
  optionLabel: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.bold,
    fontSize: 14,
  },
});
```

- [ ] **Step 4: Implémenter `SearchField`**

```tsx
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

type Props = {
  readonly value: string;
  readonly placeholder: string;
  readonly onQueryChange: (query: string) => void;
  readonly testID: string;
};

export function SearchField({
  value,
  placeholder,
  onQueryChange,
  testID,
}: Props): React.ReactElement {
  return (
    <View style={styles.field} testID={testID}>
      <MaterialCommunityIcons
        color={tokens.color.textSectionLabel}
        name="magnify"
        size={19}
      />
      <TextInput
        onChangeText={onQueryChange}
        placeholder={placeholder}
        placeholderTextColor={tokens.color.textSectionLabel}
        style={styles.input}
        testID={`${testID}-input`}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    alignItems: 'center',
    backgroundColor: tokens.color.cardSurface,
    borderColor: tokens.color.fieldBorder,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    height: 48,
    paddingHorizontal: 14,
  },
  input: {
    color: tokens.color.textPrimary,
    flex: 1,
    fontFamily: tokens.font.semiBold,
    fontSize: 14.5,
  },
});
```

- [ ] **Step 5: Implémenter `AppHeader`**

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { InitialsAvatar } from 'src/ui/initialsAvatar';
import { tokens } from 'src/ui/tokens';

type Props = {
  readonly title: string;
  readonly userName: string;
  readonly onAvatarPress: () => void;
  readonly testID: string;
};

export function AppHeader({
  title,
  userName,
  onAvatarPress,
  testID,
}: Props): React.ReactElement {
  return (
    <View style={styles.header} testID={testID}>
      <Text style={styles.title} testID={`${testID}-title`}>
        {title}
      </Text>
      <Pressable onPress={onAvatarPress} testID={`${testID}-avatar`}>
        <InitialsAvatar name={userName} size="sm" testID={`${testID}-avatar-badge`} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: tokens.color.cardSurface,
    borderBottomColor: tokens.color.cardBorder,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 18,
    paddingTop: tokens.spacing.sm,
  },
  title: {
    color: tokens.color.textPrimary,
    fontFamily: tokens.font.extraBold,
    fontSize: tokens.typography.screenTitle.fontSize,
    letterSpacing: tokens.typography.screenTitle.letterSpacing,
  },
});
```

- [ ] **Step 6: Vérifier**

```bash
npx jest src/ui/ && npm run typecheck && npm run lint
```

- [ ] **Step 7: Commit**

```bash
git add src/ui/appHeader.* src/ui/searchField.* src/ui/settingRow.*
git commit -m "feat(ui): Add the three interactive primitives of the new shell"
```

---

## Task 5: Magasin des préférences

> **Corrigé après livraison (commits `0543ecd`, `1f70719`).** Deux obstacles que
> le plan n'avait pas vus, tous deux trouvés en exécutant :
>
> 1. **Le double MMKV n'a pas de `getBoolean`.** `__mocks__/react-native-mmkv.ts`
>    n'implémentait que `set`, `getString` et `remove` : `readPreferences`
>    mourait sur un appel indéfini. Le double a été étendu avec les signatures
>    **relevées dans le module réel**
>    (`lib/specs/MMKV.nitro.d.ts:45-62`), et chaque accesseur typé rend
>    `undefined` sur une valeur d'un autre type — un `getBoolean` qui renverrait
>    la chaîne `"false"`, laquelle est vraie, serait pire que pas d'accesseur.
> 2. **La boucle d'import était réelle.** Elle est rompue par
>    `src/i18n/supported.ts`, un module SANS import qui porte `SUPPORTED_LOCALES`,
>    `SupportedLocale` et `isSupportedLocale`. `src/i18n/index.ts` les réexporte
>    pour ses appelants existants.
>
> Et une correction de goût : `writeRawLanguage` emploie un **import nommé
> ordinaire**, pas l'idiome `require` d'`AGENTS.md`. Celui-ci ne sert qu'à
> ESPIONNER un export de module ; ici on ne fait qu'appeler la fonction, et le
> `require` ne faisait qu'ajouter un avertissement de lint.

**Files:**
- Create: `src/settings/preferences.ts` + `src/settings/preferences.spec.ts`

**Interfaces:**
- Produces:
  - `export type Preferences = { readonly micOffOnJoin: boolean; readonly cameraOffOnJoin: boolean; readonly defaultAccessLevel: AccessLevel; readonly language: SupportedLocale | null }`
  - `readPreferences(): Preferences`
  - `writePreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void`
  - `DEFAULT_PREFERENCES: Preferences`

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { DEFAULT_PREFERENCES, readPreferences, writePreference } from './preferences';

describe('preferences', () => {
  beforeEach(() => {
    writePreference('micOffOnJoin', DEFAULT_PREFERENCES.micOffOnJoin);
    writePreference('cameraOffOnJoin', DEFAULT_PREFERENCES.cameraOffOnJoin);
    writePreference('defaultAccessLevel', DEFAULT_PREFERENCES.defaultAccessLevel);
    writePreference('language', DEFAULT_PREFERENCES.language);
  });

  // Le mockup fixe 'trusted'. AGENTS.md écrit que `trusted` casse l'exigence
  // produit pour les invités externes, et create.tsx:55 défaut à 'public' pour
  // cette raison. Le dépôt gagne : ce test est la garde de cette décision.
  it('défaut à public pour le niveau d’accès, pas à trusted', () => {
    expect(DEFAULT_PREFERENCES.defaultAccessLevel).toBe('public');
  });

  it('défaut à micro coupé et caméra active, comme le mockup', () => {
    expect(DEFAULT_PREFERENCES.micOffOnJoin).toBe(true);
    expect(DEFAULT_PREFERENCES.cameraOffOnJoin).toBe(false);
  });

  it('défaut à null pour la langue, ce qui veut dire « suivre le système »', () => {
    expect(DEFAULT_PREFERENCES.language).toBe(null);
  });

  it('relit une préférence booléenne écrite', () => {
    writePreference('micOffOnJoin', false);
    expect(readPreferences().micOffOnJoin).toBe(false);
  });

  it('relit un niveau d’accès écrit', () => {
    writePreference('defaultAccessLevel', 'restricted');
    expect(readPreferences().defaultAccessLevel).toBe('restricted');
  });

  it('relit une langue écrite', () => {
    writePreference('language', 'fr');
    expect(readPreferences().language).toBe('fr');
  });

  // La branche « valeur absente » doit être empruntée : sans ce test,
  // l'implémentation pourrait ignorer le stockage et rendre les défauts.
  it('rend le défaut quand rien n’a été écrit', () => {
    writePreference('language', null);
    expect(readPreferences().language).toBe(null);
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx jest src/settings/preferences.spec.ts
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Step 3: Implémenter**

```ts
import { createMMKV } from 'react-native-mmkv';

import type { AccessLevel } from 'src/call/types';
import type { SupportedLocale } from 'src/i18n';

// Les quatre réglages que l'écran Réglages expose. Ils vivent sur l'appareil
// parce que meet n'a pas de profil utilisateur pour les porter — même raison
// que `src/rooms/titles.ts`, et même conséquence assumée : ils ne suivent pas
// la personne d'un appareil à l'autre.
export type Preferences = {
  readonly micOffOnJoin: boolean;
  readonly cameraOffOnJoin: boolean;
  readonly defaultAccessLevel: AccessLevel;
  // `null` vaut « suivre la langue du système », qui est le comportement
  // d'origine. Une chaîne vide ne conviendrait pas : elle est indiscernable
  // d'une locale inconnue.
  readonly language: SupportedLocale | null;
};

// `public` et non le `trusted` du mockup : AGENTS.md pose qu'un créateur ne
// doit pas avoir à être présent pour que la réunion démarre, et que `trusted`
// casse cela pour les invités externes.
export const DEFAULT_PREFERENCES: Preferences = {
  micOffOnJoin: true,
  cameraOffOnJoin: false,
  defaultAccessLevel: 'public',
  language: null,
};

const store = createMMKV({ id: 'preferences' });

export function readPreferences(): Preferences {
  const language = store.getString('language');
  return {
    micOffOnJoin: store.getBoolean('micOffOnJoin') ?? DEFAULT_PREFERENCES.micOffOnJoin,
    cameraOffOnJoin: store.getBoolean('cameraOffOnJoin') ?? DEFAULT_PREFERENCES.cameraOffOnJoin,
    defaultAccessLevel:
      (store.getString('defaultAccessLevel') as AccessLevel | undefined) ??
      DEFAULT_PREFERENCES.defaultAccessLevel,
    language: language === undefined || language.length === 0 ? null : (language as SupportedLocale),
  };
}

export function writePreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  if (value === null) {
    store.remove(key);
    return;
  }
  if (typeof value === 'boolean') {
    store.set(key, value);
    return;
  }
  store.set(key, value);
}
```

> Si `SupportedLocale` n'est pas encore exporté par `src/i18n/index.ts`, l'ajouter :
> `export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];`

- [ ] **Step 4: Vérifier**

```bash
npx jest src/settings/preferences.spec.ts && npm run typecheck && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/settings/preferences.ts src/settings/preferences.spec.ts src/i18n/index.ts
git commit -m "feat(settings): Store the four device-side preferences"
```

---

## Task 6: Journal des réunions

**Files:**
- Create: `src/rooms/journal.ts` + `src/rooms/journal.spec.ts`

**Interfaces:**
- Produces:
  - `export type MeetingVisit = { readonly slug: string; readonly title: string; readonly joinedAt: number }`
  - `rememberVisit(slug: string, title: string, joinedAt: number): void`
  - `listVisits(): readonly MeetingVisit[]` — du plus récent au plus ancien
  - `MAX_VISITS: 200`

**Note.** `joinedAt` est un paramètre, pas un `Date.now()` interne : un magasin qui lit l'horloge lui-même ne peut pas être testé sur l'ordre sans faire avancer le temps réel. La spec du dépôt appelle ce trou par son nom — « `sinceFor` sans horloge qui avance ».

- [ ] **Step 1: Écrire le test qui échoue**

```ts
import { listVisits, MAX_VISITS, rememberVisit } from './journal';

describe('journal', () => {
  beforeEach(() => {
    // Le magasin est un singleton de module : chaque test doit partir d'un
    // état connu, sinon l'ordre d'exécution devient une dépendance cachée.
    for (const visit of listVisits()) {
      void visit;
    }
    jest.isolateModules(() => undefined);
  });

  it('relit une visite écrite', () => {
    rememberVisit('ogo-kmyy-qrl', 'Point produit', 1_000);
    expect(listVisits()).toContainEqual({
      slug: 'ogo-kmyy-qrl',
      title: 'Point produit',
      joinedAt: 1_000,
    });
  });

  // L'ordre est une conditionnelle : la fixture doit produire les deux sens,
  // sinon l'implémentation pourrait ne pas trier du tout.
  it('rend la visite la plus récente en premier', () => {
    rememberVisit('ancienne', 'Ancienne', 1_000);
    rememberVisit('recente', 'Récente', 2_000);
    expect(listVisits()[0]?.slug).toBe('recente');
  });

  it('rend la plus récente en premier même écrite en premier', () => {
    rememberVisit('recente', 'Récente', 2_000);
    rememberVisit('ancienne', 'Ancienne', 1_000);
    expect(listVisits()[0]?.slug).toBe('recente');
  });

  it('garde une entrée par visite, même pour un salon déjà rejoint', () => {
    rememberVisit('meme', 'Même salon', 1_000);
    rememberVisit('meme', 'Même salon', 2_000);
    expect(listVisits().filter((v) => v.slug === 'meme')).toHaveLength(2);
  });

  it('plafonne le journal et jette les plus anciennes', () => {
    for (let i = 0; i < MAX_VISITS + 10; i += 1) {
      rememberVisit(`salon-${i}`, `Salon ${i}`, i);
    }
    expect(listVisits()).toHaveLength(MAX_VISITS);
    expect(listVisits().some((v) => v.slug === 'salon-0')).toBe(false);
  });

  it('ignore un intitulé vide plutôt que d’enregistrer une ligne sans rien', () => {
    rememberVisit('vide', '   ', 1_000);
    expect(listVisits().some((v) => v.slug === 'vide')).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx jest src/rooms/journal.spec.ts
```

Attendu : ÉCHEC, module introuvable.

- [ ] **Step 3: Implémenter**

```ts
import { createMMKV } from 'react-native-mmkv';

// Le journal des réunions rejointes, gardé sur l'appareil.
//
// Même motif et même raison que `src/rooms/titles.ts` : `/api/v1.0/rooms/` ne
// renvoie que `{ id, slug, name, access_level }`, sans aucune date. Le dépôt le
// dit déjà en `src/screens/home.tsx:50` — « trier par une date qu'on n'a pas
// vue serait deviner ».
//
// Conséquence assumée : l'historique est celui de CET appareil. Une réunion
// rejointe depuis le web n'y figure pas.
//
// La durée n'y est pas : elle demanderait un point d'accroche à la fin de
// l'appel, donc dans `call.tsx`, que quatorze branches se disputent. Reportée
// au lot de l'écran d'appel. L'heure d'entrée est exacte ; une durée devinée
// ne le serait pas.
export type MeetingVisit = {
  readonly slug: string;
  readonly title: string;
  readonly joinedAt: number;
};

// Borne de sécurité, même réflexe que `MAX_ROOM_PAGES` (`src/api/rooms.ts:57`).
// Sans plafond, MMKV croît sans fin sur un appareil de longue vie.
export const MAX_VISITS = 200;

const store = createMMKV({ id: 'room-journal' });
const VISITS_KEY = 'visits';

function readAll(): readonly MeetingVisit[] {
  const raw = store.getString(VISITS_KEY);
  if (raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as readonly MeetingVisit[]) : [];
  } catch {
    return [];
  }
}

export function rememberVisit(slug: string, title: string, joinedAt: number): void {
  const trimmed = title.trim();
  // Un intitulé vide n'en est pas un : l'enregistrer ferait une ligne sans
  // rien à afficher. Même garde que `rememberRoomTitle`.
  if (trimmed.length === 0) return;
  const next = [{ slug, title: trimmed, joinedAt }, ...readAll()]
    .sort((a, b) => b.joinedAt - a.joinedAt)
    .slice(0, MAX_VISITS);
  store.set(VISITS_KEY, JSON.stringify(next));
}

export function listVisits(): readonly MeetingVisit[] {
  return [...readAll()].sort((a, b) => b.joinedAt - a.joinedAt);
}
```

- [ ] **Step 4: Vérifier**

```bash
npx jest src/rooms/journal.spec.ts && npm run typecheck && npm run lint
```

- [ ] **Step 5: Commit**

```bash
git add src/rooms/journal.ts src/rooms/journal.spec.ts
git commit -m "feat(rooms): Journal joined meetings on the device"
```

---

## Task 7: Capacité agenda

**Files:**
- Modify: `src/instance/types.ts:1-5`
- Modify: `src/instance/discovery.ts:5-11` et `:116-122`
- Create: `src/call/agenda.ts` + `src/call/agenda.spec.ts`
- Modify: `src/instance/discovery.spec.ts` (ajout)
- Modify: **onze** sites qui construisent un `InstanceFeatures` — voir la correction ci-dessous

> **Corrigé après livraison (commit `a374ee8`).** Le plan annonçait **un** site à
> réparer. `tsc` en a trouvé **onze** : un vrai site de construction
> (`discovery.ts`) et dix doubles de test, dont
> `src/instance/emailResolution.spec.ts` que j'avais d'abord manqué en dérivant
> ma liste d'un `head -10` tronqué.
>
> Le champ reste **requis** et non optionnel : un registre de capacités doit
> forcer chaque site de construction à décider, et c'est exactement ce mécanisme
> qui vient de fonctionner. Neuf des dix doubles sont dans des fichiers
> qu'aucune branche ne touche ; celui de `call.tsx` est dans `NO_ACCOUNT`, une
> constante de module, pas dans la partie que quatorze branches modifient.

**Interfaces:**
- Consumes: `InstanceFeatures`
- Produces: `canShowAgenda(features: InstanceFeatures): boolean`

**Contexte mesuré, le 2026-08-02.** Aucun signal de calendrier n'existe : `/api/v1.0/config/` n'en porte aucun sur `meet.linagora.com`, `visio.twake.app` ni `meet.twake-dev.maudet.cloud` (build plus récent), et le `.well-known/twake-configuration` de l'organisation n'expose que `twake-flagship-login-uri` et `twake-pass-login-uri`. La garde est donc **fermée par défaut**, et **on ne devine pas un nom de champ** : une garde branchée sur un champ inexistant est toujours fausse, et indiscernable par lecture d'une garde qui marche.

- [ ] **Step 1: Écrire le test qui échoue**

`src/call/agenda.spec.ts` :

```ts
import type { InstanceFeatures } from 'src/instance/types';
import { canShowAgenda } from './agenda';

const features = (overrides: Partial<InstanceFeatures> = {}): InstanceFeatures => ({
  recording: false,
  subtitle: false,
  telephony: false,
  calendar: false,
  ...overrides,
});

describe('canShowAgenda', () => {
  // Les deux états de la conditionnelle, chacun avec sa fixture.
  it('refuse l’agenda quand l’instance ne déclare pas de calendrier', () => {
    expect(canShowAgenda(features({ calendar: false }))).toBe(false);
  });

  it('autorise l’agenda quand l’instance déclare un calendrier', () => {
    expect(canShowAgenda(features({ calendar: true }))).toBe(true);
  });

  // La capacité ne doit dépendre QUE d'elle-même : sans ce test, un `&&` avec
  // `recording` passerait inaperçu.
  it('ne dépend d’aucune autre capacité', () => {
    expect(canShowAgenda(features({ calendar: true, recording: false, subtitle: false }))).toBe(
      true,
    );
  });
});
```

Ajouter à `src/instance/discovery.spec.ts` :

```ts
  // Mesuré le 2026-08-02 : aucune des trois instances connues ne porte de
  // champ de calendrier. La capacité doit donc être FERMÉE quand rien ne la
  // déclare — c'est le sens sûr, et le seul que l'observation permette.
  it('ferme la capacité calendrier quand la configuration ne la déclare pas', async () => {
    // …monter le double de `fetch` comme les tests voisins de ce fichier, avec
    // une réponse de configuration SANS champ de calendrier, puis :
    // expect(result.value.features.calendar).toBe(false);
  });
```

> **À l'implémenteur** : ce fichier a déjà un motif de double de `fetch`. **Ouvrir `src/instance/discovery.spec.ts` et reprendre son motif exact** plutôt que d'en inventer un. Le dépôt s'est fait avoir cinq fois par du code de test recopié sans être ouvert.

- [ ] **Step 2: Lancer pour vérifier l'échec**

```bash
npx jest src/call/agenda.spec.ts
```

Attendu : ÉCHEC, module `./agenda` introuvable, et `calendar` absent de `InstanceFeatures` (erreur de type).

- [ ] **Step 3: Étendre le type**

Dans `src/instance/types.ts`, ajouter à `InstanceFeatures` :

```ts
  // Mesuré le 2026-08-02 : `/api/v1.0/config/` ne porte AUCUN champ de
  // calendrier sur les trois instances connues, dont une d'un build plus
  // récent. Le champ est donc absent partout et cette valeur vaut `false`
  // partout — c'est voulu, et c'est le sens sûr : une surface d'agenda sans
  // calendrier derrière produirait une liste vide inexplicable.
  //
  // Le jour où meet expose un signal, seul le parseur de `discovery.ts`
  // change ; tout consommateur de `canShowAgenda` en hérite sans être touché.
  readonly calendar: boolean;
```

- [ ] **Step 4: Parser le champ, fermé par défaut**

Dans `src/instance/discovery.ts`, ajouter à `RawConfig` :

```ts
  calendar?: { enabled?: boolean };
```

et au bloc `features` (`:116`) :

```ts
      calendar: raw.calendar?.enabled === true,
```

`=== true` et non une coercition : un champ absent, `null`, ou une chaîne doivent tous fermer la capacité.

- [ ] **Step 5: Écrire la garde**

`src/call/agenda.ts` :

```ts
import type { InstanceFeatures } from 'src/instance/types';

// Même forme que `canStartRecording` (`src/call/recording.ts:126`), qui est le
// précédent de ce dépôt pour une capacité qui éteint une commande.
//
// La surface d'agenda est la liste « Réunions · -2 h → +24 h » de l'accueil,
// qui appartient au Lot 2. Cette garde est livrée maintenant pour que le Lot 2
// n'ait pas à rouvrir `discovery.ts`.
export function canShowAgenda(features: InstanceFeatures): boolean {
  return features.calendar;
}
```

- [ ] **Step 6: Réparer le double de `call.tsx`**

`src/screens/room/call.tsx:137` porte un littéral `features: { recording: false, subtitle: false, telephony: false }`. `tsc` va le rejeter. Ajouter `calendar: false` — **une seule ligne, et rien d'autre dans ce fichier.**

- [ ] **Step 7: Vérifier**

```bash
npx jest src/call/agenda.spec.ts src/instance/ && npm run typecheck && npm run lint && npm test
```

- [ ] **Step 8: Commit**

```bash
git add src/instance/types.ts src/instance/discovery.ts src/instance/discovery.spec.ts src/call/agenda.ts src/call/agenda.spec.ts src/screens/room/call.tsx
git commit -m "feat(instance): Gate the agenda on a calendar capability, closed by default"
```

---

## Task 8: Coque à trois onglets

**Files:**
- Create: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/home.tsx`, `app/(tabs)/historique.tsx`, `app/(tabs)/reglages.tsx`
- Delete: `app/home.tsx`
- Create: `src/screens/historique.tsx` et `src/screens/reglages.tsx` — **coquilles minimales**, remplies aux Tasks 9 et 10
- Modify: `src/i18n/locales/*.json` (7 fichiers) — clés `tabs.*`

**Interfaces:**
- Consumes: `tokens`
- Produces: les routes `/home`, `/historique`, `/reglages`

**Fait vérifié.** `@react-navigation` est absent de `node_modules`, et ce n'est **pas** le piège `legacy-peer-deps` : expo-router 57 ne le déclare ni en `dependencies` ni en `peerDependencies`. Rien à installer.

> **Corrigé après livraison (commit `ac77899`).** Trois précisions, dont deux qui
> changent le code à écrire :
>
> 1. **L'import est `expo-router/js-tabs`.** Celui depuis `expo-router` marche
>    mais son entrée est marquée `@deprecated` en 57 (`build/exports.d.ts:41`).
> 2. **expo-router ne « embarque pas standard-navigation » au sens où je
>    l'écrivais : il VENDORISE React Navigation**, sous
>    `build/react-navigation/bottom-tabs`. La conclusion — rien à installer —
>    tient, la raison était fausse.
> 3. **Pas de `tabBar` custom.** Les teintes, le fond et la typographie du
>    libellé sont tous des `screenOptions` ; seule la pastille ne l'est pas. Elle
>    est rendue par `tabBarIcon`, et vit dans `src/ui/tabBarIcon.tsx` avec son
>    spec — un fichier sous `app/` ne porte aucune logique. Écrire un `tabBar`
>    entier aurait voulu dire câbler `state`, `descriptors` et `navigation` à la
>    main pour un seul aplat.
>
> **Et l'étape 1 ci-dessous est déjà faite** : les clés des sept locales ont été
> ajoutées en amont du lot (commit `c56031b`), pour les trois écrans à la fois.
> Passer directement à l'étape 3.

**Fait vérifié.** Un groupe entre parenthèses n'apparaît pas dans l'URL : `/home` reste `/home`, donc les quatre appelants — `app/index.tsx:8`, `src/screens/welcome.tsx:26`, `src/screens/server.tsx:57`, `src/screens/room/call.tsx:639` — **ne sont pas modifiés**.

- [ ] **Step 1: Ajouter les clés dans les sept locales**

Dans chacun des sept fichiers de `src/i18n/locales/`, ajouter :

```json
  "tabs": {
    "home": "…",
    "history": "…",
    "settings": "…"
  }
```

Valeurs : `en` Home / History / Settings · `fr` Accueil / Historique / Réglages · `es` Inicio / Historial / Ajustes · `it` Home / Cronologia / Impostazioni · `de` Start / Verlauf / Einstellungen · `vi` Trang chủ / Lịch sử / Cài đặt · `ru` Главная / История / Настройки.

- [ ] **Step 2: Lancer le garde des locales**

```bash
npx jest src/i18n/index.spec.ts
```

Attendu : vert. Ce spec échoue si une clé manque dans un seul fichier.

- [ ] **Step 3: Créer les coquilles d'écran**

`src/screens/historique.tsx` :

```tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

export function HistoriqueScreen(): React.ReactElement {
  return <View style={styles.root} testID="historique-screen" />;
}

const styles = StyleSheet.create({
  root: { backgroundColor: tokens.color.appBackground, flex: 1 },
});
```

`src/screens/reglages.tsx` : identique, avec `ReglagesScreen` et `testID="reglages-screen"`.

- [ ] **Step 4: Créer la coque**

`app/(tabs)/_layout.tsx` :

```tsx
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokens } from 'src/ui/tokens';

// Barre custom plutôt que les options standard : le mockup pose l'icône active
// dans une pastille `brandWash` de 26 px, qu'aucune option de `Tabs` ne rend.
//
// `brand` sur `cardSurface` donne 3,22:1 — au-dessus du seuil non textuel de
// 3:1. Il ne porte JAMAIS le libellé, qui est du texte : celui-ci est
// `brandStrong` (5,12:1) quand actif, `textTabInactive` (4,51:1) sinon.
const ICONS = {
  home: 'video-outline',
  historique: 'clock-outline',
  reglages: 'cog-outline',
} as const;

// expo-router requires a default export for every file under app/.
export default function TabsLayout(): React.ReactElement {
  const { t } = useTranslation();
  const labels: Readonly<Record<keyof typeof ICONS, string>> = {
    home: t('tabs.home'),
    historique: t('tabs.history'),
    reglages: t('tabs.settings'),
  };

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <View style={styles.bar}>
          {state.routes.map((route, index) => {
            const name = route.name as keyof typeof ICONS;
            const focused = state.index === index;
            return (
              <Pressable
                key={route.key}
                onPress={() => navigation.navigate(route.name)}
                style={styles.tab}
                testID={`tab-${name}`}
              >
                <View style={[styles.pill, focused ? styles.pillActive : null]}>
                  <MaterialCommunityIcons
                    color={focused ? tokens.color.brandStrong : tokens.color.textTabInactive}
                    name={ICONS[name]}
                    size={22}
                  />
                </View>
                <Text
                  style={[styles.label, focused ? styles.labelActive : null]}
                  testID={`tab-label-${name}`}
                >
                  {labels[name]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="historique" />
      <Tabs.Screen name="reglages" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: tokens.color.cardSurface,
    borderTopColor: tokens.color.cardBorder,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingBottom: 14,
    paddingTop: 6,
  },
  tab: { alignItems: 'center', flex: 1, gap: 5, justifyContent: 'center', minHeight: 56 },
  pill: {
    alignItems: 'center',
    borderRadius: 9,
    height: 26,
    justifyContent: 'center',
    width: 34,
  },
  pillActive: { backgroundColor: tokens.color.brandWash },
  label: {
    color: tokens.color.textTabInactive,
    fontFamily: tokens.font.bold,
    fontSize: tokens.typography.tabLabel.fontSize,
  },
  labelActive: { color: tokens.color.brandStrong },
});
```

- [ ] **Step 5: Déplacer et créer les routes**

```bash
git mv app/home.tsx "app/(tabs)/home.tsx"
```

Puis créer, chacune d'une ligne :

```tsx
// app/(tabs)/historique.tsx
export { HistoriqueScreen as default } from 'src/screens/historique';
```

```tsx
// app/(tabs)/reglages.tsx
export { ReglagesScreen as default } from 'src/screens/reglages';
```

- [ ] **Step 6: Vérifier**

```bash
npm run typecheck && npm run lint && npm test
```

- [ ] **Step 7: Vérifier sur appareil**

```bash
npm start
```

Attendu : les trois onglets s'affichent, la pastille verte suit l'onglet actif, et `/home` s'ouvre toujours après connexion. **L'iOS Simulator ne publie ni caméra ni micro** — pour la coque cela suffit, pas pour l'appel.

- [ ] **Step 8: Commit**

```bash
git add "app/(tabs)" src/screens/historique.tsx src/screens/reglages.tsx src/i18n/locales
git commit -m "feat(nav): Add the three-tab shell with a custom tab bar"
```

---

## Task 9: Écran Historique

**Files:**
- Modify: `src/screens/historique.tsx`
- Create: `src/screens/historique.spec.tsx`
- Modify: `src/screens/room/prejoin.tsx` — **une ligne** : appeler `rememberVisit`
- Modify: `src/i18n/locales/*.json` — clés `history.*`

**Interfaces:**
- Consumes: `listVisits`, `MeetingVisit` (Task 6) ; `AppHeader`, `SearchField`, `SectionLabel`, `SurfaceCard`, `InitialsAvatar`, `EmptyState` (Tasks 3-4)
- Produces: `HistoriqueScreen`, `filterVisits(visits, query)`, `formatVisitMoment(joinedAt, language)`

> **Corrigé après livraison (commit `606b7fd`).** L'étape 1 (clés de locale) est
> déjà faite, commit `c56031b`. Deux autres choses :
>
> 1. **La suite ne se chargeait pas du tout.** Importer `expo-router` pour de
>    vrai tire `standard-navigation`, de l'ESM que `transformIgnorePatterns` ne
>    couvre pas. Sept specs d'écran mockent déjà `expo-router` pour cette raison
>    exacte ; celle-ci le fait aussi. **Ouvrir un spec voisin avant d'écrire le
>    préambule**, comme la Task 7 le dit déjà pour `discovery.spec.ts`.
> 2. **Une mutation a révélé une ligne qu'aucun test ne pouvait couvrir.**
>    Retirer le court-circuit `needle.length === 0` de `filterVisits` donnait
>    **zéro rouge** : avec une aiguille vide, `includes('')` est vrai pour tout,
>    donc le CONTENU rendu est identique. La ligne n'est observable que par
>    l'IDENTITÉ du tableau, `filter` allouant toujours une copie. Deux tests
>    assertissent donc `toBe(visits)`, et la mutation rougit désormais deux fois.
>    C'est la forme générale du cas : quand une mutation ne rougit rien, se
>    demander d'abord si le code est seulement **indistinguable par le
>    comportement observé**, avant de conclure au trou de couverture.

- [ ] **Step 1: Ajouter les clés dans les sept locales**

`history.searchPlaceholder`, `history.recent`, `history.results`, `history.empty`, `history.noMatch`.
`fr` : « Rechercher une réunion », « 7 derniers jours », « Résultats », « Aucune réunion pour l'instant », « Aucune réunion ne correspond ». Traduire dans les six autres.

- [ ] **Step 2: Écrire le test qui échoue**

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { MeetingVisit } from 'src/rooms/journal';
import { tokens } from 'src/ui/tokens';
import { filterVisits, HistoriqueScreen } from './historique';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('src/rooms/journal', () => ({
  listVisits: jest.fn(),
  MAX_VISITS: 200,
}));

const listVisits = jest.requireMock('src/rooms/journal').listVisits as jest.Mock;

const visit = (slug: string, title: string, joinedAt: number): MeetingVisit => ({
  slug,
  title,
  joinedAt,
});

describe('filterVisits', () => {
  const visits = [visit('a', 'Point produit', 2_000), visit('b', 'Comité souveraineté', 1_000)];

  // Requête vide et requête non vide : les deux états de la conditionnelle.
  it('rend tout pour une requête vide', () => {
    expect(filterVisits(visits, '')).toHaveLength(2);
  });

  it('ne garde que ce qui correspond', () => {
    expect(filterVisits(visits, 'produit').map((v) => v.slug)).toEqual(['a']);
  });

  it('ignore la casse', () => {
    expect(filterVisits(visits, 'PRODUIT').map((v) => v.slug)).toEqual(['a']);
  });

  it('rend une liste vide quand rien ne correspond', () => {
    expect(filterVisits(visits, 'zzz')).toHaveLength(0);
  });
});

describe('HistoriqueScreen', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    listVisits.mockReturnValue([visit('a', 'Point produit', 2_000)]);
  });

  it('pose la couleur explicite du titre d’une ligne', async () => {
    await render(<HistoriqueScreen />);
    expect(screen.getByTestId('visit-title-a')).toHaveStyle({ color: tokens.color.textPrimary });
  });

  it('pose la couleur explicite de la méta d’une ligne', async () => {
    await render(<HistoriqueScreen />);
    expect(screen.getByTestId('visit-meta-a')).toHaveStyle({ color: tokens.color.textMeta });
  });

  // Journal vide et journal peuplé : deux états, deux messages distincts.
  it('affiche l’état vide quand le journal est vide', async () => {
    listVisits.mockReturnValue([]);
    await render(<HistoriqueScreen />);
    expect(screen.getByTestId('history-empty')).toHaveTextContent('history.empty');
  });

  it('n’affiche pas l’état vide quand le journal est peuplé', async () => {
    await render(<HistoriqueScreen />);
    expect(screen.queryByTestId('history-empty')).toBe(null);
  });

  it('affiche le message de recherche infructueuse, distinct de l’état vide', async () => {
    await render(<HistoriqueScreen />);
    await fireEvent.changeText(screen.getByTestId('history-search-input'), 'zzz');
    expect(screen.getByTestId('history-no-match')).toHaveTextContent('history.noMatch');
  });
});
```

- [ ] **Step 3: Lancer pour vérifier l'échec**

```bash
npx jest src/screens/historique.spec.tsx
```

Attendu : ÉCHEC — `filterVisits` n'est pas exporté, aucun `testID` n'existe.

- [ ] **Step 4: Implémenter l'écran**

Composer `AppHeader` + `SearchField` + `SectionLabel` + `SurfaceCard` + `InitialsAvatar` + `EmptyState`, avec :
- `filterVisits(visits, query)` exporté, insensible à la casse, requête vide ⇒ tout ;
- un `testID` `visit-title-<slug>` sur le titre, `visit-meta-<slug>` sur la méta, chacun avec sa couleur explicite ;
- la méta formatée par `date-fns` (`format`, locale selon `i18n.language`) : heure seule pour aujourd'hui, jour + heure sinon. **Pas de durée** — voir la note de la Task 6 ;
- `history-empty` quand `listVisits()` est vide, `history-no-match` quand le filtre vide une liste non vide. Ce sont deux messages, pas un.

- [ ] **Step 5: Écrire le journal depuis le pré-join**

Dans `src/screens/room/prejoin.tsx`, au moment où l'on rejoint (là où l'écran navigue vers `call`), ajouter **une ligne** :

```ts
rememberVisit(slug, displayTitle, Date.now());
```

`displayTitle` est l'intitulé déjà affiché par cet écran. **Ne rien changer d'autre dans ce fichier à cette étape** — les deux `useState` sont la Task 10.

- [ ] **Step 6: Vérifier**

```bash
npx jest src/screens/historique.spec.tsx && npm run typecheck && npm run lint && npm test
```

- [ ] **Step 7: Commit**

```bash
git add src/screens/historique.tsx src/screens/historique.spec.tsx src/screens/room/prejoin.tsx src/i18n/locales
git commit -m "feat(history): Add the Historique tab over the device journal"
```

---

## Task 10: Écran Réglages et branchement des quatre préférences

**Files:**
- Modify: `src/screens/reglages.tsx`
- Create: `src/screens/reglages.spec.tsx`
- Modify: `src/screens/room/prejoin.tsx:25-26`
- Modify: `src/screens/room/create.tsx:55`
- Modify: `src/i18n/index.ts:27`
- Modify: `src/i18n/locales/*.json` — clés `settings.*`

**Interfaces:**
- Consumes: `readPreferences`, `writePreference` (Task 5) ; `chooseLanguage` (`src/i18n`) ; `SettingRow`, `SettingOption`, `AppHeader`, `SurfaceCard`, `SectionLabel`, `InitialsAvatar` (Tasks 3-4)
- Produces: `ReglagesScreen`

> **Corrigé après livraison (commit `a2ed7fd`).** L'étape 1 (clés de locale) est
> déjà faite, commit `c56031b` — et `settings.rows.camOnJoinHint` **n'existe
> pas** : il répétait mot pour mot celui du micro, sous la rangée voisine.
> `SettingRow.hint` est donc **optionnel**.
>
> **La langue ne passe pas par `writePreference`.** Elle appelle
> `chooseLanguage(locale | null)`, exporté par `src/i18n`, qui écrit ET rebascule
> i18next : `writePreference` seul rangerait le choix et laisserait l'interface
> dans l'ancienne langue. L'identifiant `'system'` n'existe que pour que la
> rangée puisse le cocher — ce qui est **stocké** est `null`.
>
> **Un test existant a rougi, et il avait raison.** `prejoin.spec.tsx` attendait
> `mic=1` : le micro était un `useState(false)` codé en dur, il vient des
> Réglages dont le défaut est « coupé ». Ce n'est pas une régression, c'est le
> comportement voulu par le mockup. Le spec pose maintenant un double explicite
> de `readPreferences` — lire le vrai MMKV ferait dépendre le résultat de l'ordre
> des fichiers de spec — et couvre chaque préférence dans ses deux états.

- [ ] **Step 1: Ajouter les clés dans les sept locales**

Groupes et rangées : `settings.groups.av`, `settings.rows.micOnJoin`, `settings.rows.micOnJoinHint`, `settings.options.micOff`, `settings.options.micOn`, `settings.rows.camOnJoin`, `settings.options.camOff`, `settings.options.camOn`, `settings.groups.rooms`, `settings.rows.defaultAccess`, `settings.rows.defaultAccessHint`, `settings.options.accessPublic`, `settings.options.accessTrusted`, `settings.options.accessRestricted`, `settings.groups.language`, `settings.rows.language`, `settings.rows.languageHint`, `settings.options.languageSystem`, `settings.signOut`, `settings.version`.

**Sept langues dans la rangée « Langue »**, plus « Langue du système » — le mockup n'en liste que cinq, `vi` et `ru` y manquent.

- [ ] **Step 2: Écrire le test qui échoue**

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { ReglagesScreen } from './reglages';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}));

jest.mock('src/settings/preferences', () => ({
  DEFAULT_PREFERENCES: {
    micOffOnJoin: true,
    cameraOffOnJoin: false,
    defaultAccessLevel: 'public',
    language: null,
  },
  readPreferences: jest.fn(),
  writePreference: jest.fn(),
}));

const prefs = jest.requireMock('src/settings/preferences');

describe('ReglagesScreen', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    prefs.readPreferences.mockReturnValue({
      micOffOnJoin: true,
      cameraOffOnJoin: false,
      defaultAccessLevel: 'public',
      language: null,
    });
    prefs.writePreference.mockClear();
  });

  it('pose la couleur explicite du bouton de déconnexion', async () => {
    await render(<ReglagesScreen />);
    expect(screen.getByTestId('settings-signout')).toHaveStyle({ color: tokens.color.danger });
  });

  it('pose la couleur explicite du pied de page', async () => {
    await render(<ReglagesScreen />);
    expect(screen.getByTestId('settings-version')).toHaveStyle({ color: tokens.color.textFooter });
  });

  // Le gestionnaire d'option fait DEUX choses : écrire la préférence et
  // refermer la rangée. Deux instructions, donc deux assertions — le dépôt a
  // déjà payé ce trou avec une feuille qui ne se refermait pas.
  it('écrit la préférence quand on choisit une option', async () => {
    await render(<ReglagesScreen />);
    await fireEvent.press(screen.getByTestId('setting-micOnJoin-header'));
    await fireEvent.press(screen.getByTestId('setting-micOnJoin-option-on'));
    expect(prefs.writePreference).toHaveBeenCalledWith('micOffOnJoin', false);
  });

  it('referme la rangée après le choix', async () => {
    await render(<ReglagesScreen />);
    await fireEvent.press(screen.getByTestId('setting-micOnJoin-header'));
    await fireEvent.press(screen.getByTestId('setting-micOnJoin-option-on'));
    expect(screen.queryByTestId('setting-micOnJoin-option-on')).toBe(null);
  });

  // Une seule rangée dépliée à la fois : ouvrir la seconde referme la première.
  it('ne garde qu’une rangée dépliée à la fois', async () => {
    await render(<ReglagesScreen />);
    await fireEvent.press(screen.getByTestId('setting-micOnJoin-header'));
    await fireEvent.press(screen.getByTestId('setting-defaultAccess-header'));
    expect(screen.queryByTestId('setting-micOnJoin-option-on')).toBe(null);
    expect(screen.getByTestId('setting-defaultAccess-option-public')).toBeTruthy();
  });

  it('propose les sept locales plus la langue du système', async () => {
    await render(<ReglagesScreen />);
    await fireEvent.press(screen.getByTestId('setting-language-header'));
    for (const id of ['system', 'en', 'fr', 'es', 'it', 'de', 'vi', 'ru']) {
      expect(screen.getByTestId(`setting-language-option-${id}`)).toBeTruthy();
    }
  });
});
```

- [ ] **Step 3: Lancer pour vérifier l'échec**

```bash
npx jest src/screens/reglages.spec.tsx
```

Attendu : ÉCHEC, aucun `testID` n'existe.

- [ ] **Step 4: Implémenter l'écran**

Composer `AppHeader` + carte de profil (`InitialsAvatar` en `lg`, nom, adresse depuis `getActiveAccount()`) + trois `SurfaceCard`, chacune précédée d'un `SectionLabel`, contenant les `SettingRow`. Un seul `useState<string | null>` pour la rangée dépliée. Le gestionnaire d'option écrit **puis** referme. « Se déconnecter » appelle `signOut` comme le fait déjà `home.tsx`. Pied de page `settings.version`.

- [ ] **Step 5: Brancher les quatre préférences**

`src/screens/room/prejoin.tsx:25-26` :

```ts
  const [cameraOff, setCameraOff] = useState(readPreferences().cameraOffOnJoin);
  const [micOff, setMicOff] = useState(readPreferences().micOffOnJoin);
```

`src/screens/room/create.tsx:55` :

```ts
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(
    readPreferences().defaultAccessLevel,
  );
```

`src/i18n/index.ts:27` — la préférence passe **devant** le système :

```ts
  const stored = readPreferences().language;
  const preferred = stored ?? getLocales()[0]?.languageCode ?? 'en';
```

Et le choix de langue appelle `i18next.changeLanguage(next)` pour prendre effet sans redémarrage.

> **Attention à la boucle d'import.** `src/i18n/index.ts` importerait `src/settings/preferences.ts`, qui importe `SupportedLocale` depuis `src/i18n`. Si `tsc` ou Metro proteste, déplacer `SUPPORTED_LOCALES` et `SupportedLocale` dans `src/i18n/locales.ts` et laisser les deux fichiers l'importer de là. **Vérifier en lançant `npm run typecheck`, pas en supposant.**

- [ ] **Step 6: Vérifier**

```bash
npx jest src/screens/reglages.spec.tsx src/i18n/ && npm run typecheck && npm run lint && npm test
```

- [ ] **Step 7: Vérifier sur appareil**

```bash
npm start
```

Parcours : Réglages → changer la langue, l'interface bascule sans redémarrage → changer « Micro à l'entrée » → ouvrir un pré-join, le micro doit être dans l'état choisi → créer une réunion, le niveau d'accès doit être celui choisi. **Instance de test : `https://meet.twake-dev.maudet.cloud`** — c'est l'hôte que la découverte attend, pas `twake-dev.maudet.cloud`, qui redirige tout vers son portail SSO.

- [ ] **Step 8: Commit**

```bash
git add src/screens/reglages.tsx src/screens/reglages.spec.tsx src/screens/room/prejoin.tsx src/screens/room/create.tsx src/i18n src/i18n/locales
git commit -m "feat(settings): Add the Réglages tab and wire its four preferences"
```

---

## Self-review

**Couverture de la spec.** §Système visuel → Tasks 1-2. §Primitives → Tasks 3-4. §Coque → Task 8. §Historique → Tasks 6, 9. §Réglages → Tasks 5, 10. §Capacité agenda → Task 7. §Tests → contraintes globales + gardes par tâche. §Hors périmètre → rien n'y touche.

**Cohérence des types.** `MeetingVisit` (Task 6) est consommé tel quel en Task 9. `Preferences` et `DEFAULT_PREFERENCES` (Task 5) en Task 10. `SettingOption` (Task 4) en Task 10. `InstanceFeatures.calendar` (Task 7) est le seul champ ajouté, et `call.tsx:137` est réparé dans la même tâche. `makeTheme()` perd son paramètre en Task 1, et `theme.spec.ts` est réécrit dans la même tâche — c'est la seule rupture de signature du lot.

**Deux endroits où l'implémenteur doit ouvrir un fichier plutôt que me croire.** Le double de `fetch` de `src/instance/discovery.spec.ts` (Task 7, Step 1) et la boucle d'import potentielle entre `i18n` et `preferences` (Task 10, Step 5). Les deux sont signalés dans la tâche, à l'endroit du code concerné — pas en tête de document, où `scripts/task-brief` ne les extrairait pas.
