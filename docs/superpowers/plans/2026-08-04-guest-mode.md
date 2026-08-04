# Mode invité — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à quelqu'un sans compte de rejoindre une réunion depuis le
mobile, en saisissant un code ou en collant l'URL qu'on lui a transmise.

**Architecture:** Un type `Visitor` — compte ou invité — porte l'identité, et le
branchement se fait **une seule fois**, dans `src/api/rooms.ts`. Les écrans
appellent `getVisitor()` là où ils appelaient `getActiveAccount()`. Aucun
changement serveur : meet rend déjà un jeton LiveKit complet à une requête
anonyme sur un salon public.

**Tech Stack:** Expo SDK 57 / RN 0.86, expo-router, react-native-paper,
react-native-mmkv, LiveKit, i18next, Jest + @testing-library/react-native 14.

**Spec :** `docs/superpowers/specs/2026-08-04-guest-mode-design.md`

## Global Constraints

- **Barre de sortie** : `npm test`, `npm run typecheck`, `npm run lint` au vert.
  Référence au départ de ce lot : **1418 tests, 92 suites**, 0 erreur de lint
  (6 avertissements préexistants dans `oidc.ts`, `callService.ts`, `i18n/index.ts`
  — ne pas les corriger ici).
- **Prettier** : le hook `pre-commit` REFUSE un fichier non formaté. Lancer
  `npx prettier --write <fichiers>` avant chaque `git commit`.
- **Sept locales** (`en fr es it de vi ru`), toutes remplies avant fusion —
  `src/i18n/index.spec.ts` échoue si une clé manque quelque part. Écrire `en` et
  `fr` à la main, puis propager avec la skill `twake-guidelines:locales`.
- **Aucune chaîne en dur** visible par l'utilisateur.
- **Aucun style en ligne** : `StyleSheet.create` alimenté par `src/ui/tokens`.
  Seule exception admise dans ce dépôt : les encoches, connues à l'exécution.
- **Jamais de `disabled`** sur un écran sombre (`prejoin`, `call`) —
  `IconButton/utils.ts:88-93` teste `disabled` avant `customIconColor`. Masquer,
  jamais griser.
- **RNTL 14 est asynchrone** : `render`, `fireEvent`, `.press`, `.changeText`
  veulent tous un `await`. `tsc` ne préviendra pas.
- **Ne jamais assertir sur une prop qu'un composant consomme** — elle vaut
  `undefined` sur l'élément hôte, et l'assertion est verte dans les deux états.
  Assertir une conséquence observable : rendu / non rendu, style composé, texte.
- **Commits** : Conventional Commits, sujet à l'impératif, un sujet par commit.

---

## Structure des fichiers

| fichier | responsabilité |
| --- | --- |
| `src/auth/guest.ts` | ✅ la session invité — serveur (éphémère) et nom (mémorisé) |
| `src/auth/visitor.ts` | ✅ l'union `Visitor` et ses accesseurs |
| `src/api/anon.ts` | ✅ une requête sans identité |
| `src/navigation/deepLinks.ts` | ✅ `parsePastedMeeting` à côté de `parseMeetingLink`, intacte |
| `src/api/rooms.ts` | ⬜ branche `account` / `guest`, une seule fois |
| `src/screens/joinSheet.tsx` | ⬜ rangée de serveur, collage réécrit |
| `src/screens/welcome.tsx` | ⬜ l'entrée invité |
| `src/screens/room/prejoin.tsx` | ⬜ le nom éditable |
| `src/screens/room/lobby.tsx`, `call.tsx` | ⬜ `getVisitor()`, sortie, partage |
| `app/_layout.tsx` | ⬜ lien profond sans compte |

---

## Tasks 1 à 3 — DÉJÀ LIVRÉES

Écrites, exécutées et commitées le 2026-08-04 sur `design/guest-mode`. Leurs
extraits de test ont tous tourné ; ne pas les réécrire.

| commit | contenu | tests |
| --- | --- | --- |
| `d872a61` | `parsePastedMeeting` + `src/navigation/pasted.spec.ts` | 20 |
| `f718680` | `src/auth/guest.ts`, `src/auth/visitor.ts` + spec | 8 |
| `493b54b` | `src/api/anon.ts`, `readResponse` exportée + spec | 6 |

**Interfaces produites, dont les tâches suivantes dépendent :**

```ts
// src/navigation/deepLinks.ts
export type PastedTarget = { readonly slug: string; readonly host: string | null };
export function parsePastedMeeting(text: string): PastedTarget | null;

// src/auth/guest.ts
export type GuestSession = { readonly serverUrl: string; readonly displayName: string };
export function startGuestSession(serverUrl: string): void;
export function getGuestSession(): GuestSession | null;
export function readRememberedGuestName(): string;
export function rememberGuestName(displayName: string): void;
export function endGuestSession(): void;
export function resetGuestForTest(): void;

// src/auth/visitor.ts
export type Visitor =
  | { readonly kind: 'account'; readonly account: Account }
  | { readonly kind: 'guest'; readonly serverUrl: string; readonly displayName: string };
export function getVisitor(): Visitor | null;
export function visitorServerUrl(visitor: Visitor): string;
export function visitorName(visitor: Visitor): string;

// src/api/anon.ts
export function anonFetch<T>(serverUrl: string, path: string, init?: RequestInit): Promise<ApiResult<T>>;

// src/api/client.ts — désormais exportée
export function readResponse<T>(response: Response): Promise<ApiResult<T>>;
```

**Deux mesures faites pendant ces tâches, qui valent pour la suite :**

1. La mutation « code nu passé par `normalizeCodeInput` » fait rougir **9 tests**.
   La garde est réelle. Mais une première mutation, qui gardait la regex ancrée,
   survivait : **muter comme un implémenteur écrirait vraiment**, pas avec une
   variante qui préserve la garde.
2. Un test sur la casse de l'hôte est **vacuous** — `new URL()` normalise déjà.
   Il a été retiré. Ne pas le réintroduire.

---

## Task 4 : `rooms.ts` accepte un visiteur

**Files:**
- Modify: `src/api/rooms.ts:26-52` (`fetchRoomAccess`), `:177-202` (`requestEntry`)
- Modify: `src/api/rooms.spec.ts` (les appels existants passent un `Account` nu)
- Modify appelants : `src/screens/room/prejoin.tsx:144`, `lobby.tsx:71,90`,
  `call.tsx:638`

**Interfaces:**
- Consumes: `Visitor`, `visitorName`, `visitorServerUrl`, `anonFetch`, `authedFetch`
- Produces:
  ```ts
  export function fetchRoomAccess(visitor: Visitor, slug: string): Promise<ApiResult<RoomAccess>>;
  export function requestEntry(visitor: Visitor, slug: string, username: string): Promise<ApiResult<EntryOutcome>>;
  ```

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à `src/api/rooms.spec.ts`. Les fixtures existantes passent `ACCOUNT` nu :
les envelopper en `{ kind: 'account', account: ACCOUNT }` dans tout le fichier.

```ts
import * as anon from 'src/api/anon';
import type { Visitor } from 'src/auth/visitor';

const AS_ACCOUNT: Visitor = { kind: 'account', account: ACCOUNT };
const AS_GUEST: Visitor = {
  kind: 'guest',
  serverUrl: 'https://meet.acme.com',
  displayName: 'Camille Dupont',
};

describe('fetchRoomAccess, en invité', () => {
  it('passe par anonFetch, jamais par le chemin authentifié', async () => {
    const anonSpy = jest.spyOn(anon, 'anonFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'r-1',
        slug: 'abc-defg-hij',
        access_level: 'public',
        livekit: { url: 'https://lk', room: 'r-1', token: 'tok' },
      },
    });
    const authedSpy = jest.spyOn(client, 'authedFetch');

    await fetchRoomAccess(AS_GUEST, 'abc-defg-hij');

    expect(authedSpy).not.toHaveBeenCalled();
    expect(anonSpy.mock.calls[0]?.[0]).toBe('https://meet.acme.com');
  });

  // Mesuré le 2026-08-04 : sans ce paramètre le jeton porte "Anonymous".
  it('porte le nom en paramètre de requête, encodé', async () => {
    const anonSpy = jest.spyOn(anon, 'anonFetch').mockResolvedValue({
      ok: true,
      value: { id: 'r-1', slug: 'abc', access_level: 'public',
               livekit: { url: 'https://lk', room: 'r-1', token: 'tok' } },
    });

    await fetchRoomAccess(AS_GUEST, 'abc');

    expect(anonSpy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/abc/?username=Camille%20Dupont');
  });

  it("n'ajoute AUCUN paramètre quand le nom est vide", async () => {
    const anonSpy = jest.spyOn(anon, 'anonFetch').mockResolvedValue({
      ok: true,
      value: { id: 'r-1', slug: 'abc', access_level: 'public',
               livekit: { url: 'https://lk', room: 'r-1', token: 'tok' } },
    });

    await fetchRoomAccess({ ...AS_GUEST, displayName: '' }, 'abc');

    expect(anonSpy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/abc/');
  });
});

describe('fetchRoomAccess, avec un compte', () => {
  it('passe par authedFetch, jamais par le chemin anonyme', async () => {
    const anonSpy = jest.spyOn(anon, 'anonFetch');
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'r-1', slug: 'abc', access_level: 'public',
               livekit: { url: 'https://lk', room: 'r-1', token: 'tok' } },
    });

    await fetchRoomAccess(AS_ACCOUNT, 'abc');

    expect(anonSpy).not.toHaveBeenCalled();
  });
});

describe('requestEntry, en invité', () => {
  it('poste le nom par anonFetch', async () => {
    const anonSpy = jest.spyOn(anon, 'anonFetch').mockResolvedValue({
      ok: true,
      value: { id: 'p-1', status: 'accepted' },
    });

    await requestEntry(AS_GUEST, 'abc', 'Camille Dupont');

    const init = anonSpy.mock.calls[0]?.[2] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ username: 'Camille Dupont' });
  });
});
```

- [ ] **Step 2 : lancer, vérifier l'échec**

Run: `npx jest src/api/rooms.spec.ts`
Expected: FAIL — `fetchRoomAccess` reçoit un objet là où il attend un `Account`,
donc `authedFetch` est appelé avec un visiteur et `anonSpy` n'est jamais touché.

- [ ] **Step 3 : implémenter**

```ts
import { anonFetch } from 'src/api/anon';
import { visitorName, visitorServerUrl, type Visitor } from 'src/auth/visitor';

// Le branchement compte / invité, en UN seul endroit du dépôt.
//
// `username` ne part QUE pour un invité : sur le chemin authentifié, meet tire
// le nom du jeton porteur, et lui en passer un autre le laisserait choisir
// lequel croire.
async function visitorFetch<T>(
  visitor: Visitor,
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  if (visitor.kind === 'account') return await authedFetch<T>(visitor.account, path, init);
  return await anonFetch<T>(visitorServerUrl(visitor), path, init);
}

export async function fetchRoomAccess(
  visitor: Visitor,
  slug: string,
): Promise<ApiResult<RoomAccess>> {
  // Le nom vide n'ajoute AUCUN paramètre plutôt qu'un paramètre vide : meet
  // retomberait alors sur « Anonymous », ce qu'il fait déjà sans le paramètre,
  // mais une chaîne vide dans l'URL se lirait comme un nom choisi.
  const name = visitor.kind === 'guest' ? visitorName(visitor) : '';
  const query = name.length > 0 ? `?username=${encodeURIComponent(name)}` : '';
  const result = await visitorFetch<RawRoom>(
    visitor,
    `/api/v1.0/rooms/${encodeURIComponent(slug)}/${query}`,
  );
  if (!result.ok) return result;

  const livekit = result.value.livekit;
  if (livekit === undefined) return { ok: false, error: { kind: 'lobby', participantId: '' } };

  return {
    ok: true,
    value: {
      room: toRoom(result.value),
      livekitUrl: livekit.url,
      token: livekit.token,
      isAdministrable: result.value.is_administrable === true,
    },
  };
}

export async function requestEntry(
  visitor: Visitor,
  slug: string,
  username: string,
): Promise<ApiResult<EntryOutcome>> {
  const result = await visitorFetch<RawEntry>(
    visitor,
    `/api/v1.0/rooms/${encodeURIComponent(slug)}/request-entry/`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username }),
    },
  );
  if (!result.ok) return result;
  return {
    ok: true,
    value: {
      participantId: result.value.id,
      status: toEntryStatus(result.value.status),
      livekitUrl: result.value.livekit?.url ?? null,
      token: result.value.livekit?.token ?? null,
    },
  };
}
```

- [ ] **Step 4 : mettre les trois appelants au type**

Provisoire, pour garder la suite verte — les tâches 7 et 8 les reprennent
vraiment. Dans `prejoin.tsx`, `lobby.tsx`, `call.tsx`, remplacer
`fetchRoomAccess(account, …)` par `fetchRoomAccess({ kind: 'account', account }, …)`
et de même pour `requestEntry`.

- [ ] **Step 5 : lancer la barre**

Run: `npx jest src/api && npm run typecheck`
Expected: PASS, et `npm test` toujours à 92 suites.

- [ ] **Step 6 : muter, pour prouver les gardes**

Inverser la condition de `visitorFetch` (`visitor.kind === 'guest'` → `authedFetch`).
Expected: les tests « passe par anonFetch » et « passe par authedFetch » rougissent
tous les deux. S'ils ne rougissent pas, la garde n'existe pas.

- [ ] **Step 7 : commit**

```bash
npx prettier --write src/api/rooms.ts src/api/rooms.spec.ts
git add src/api/rooms.ts src/api/rooms.spec.ts src/screens/room/
git commit -m "feat(api): Router la demande de salon selon qui la fait"
```

---

## Task 5 : la feuille porte un serveur, et le collage accepte davantage

**Files:**
- Modify: `src/screens/joinSheet.tsx` (props, `handlePaste`, `handleSubmit`, rangée)
- Modify: `src/screens/joinSheet.spec.tsx`
- Modify: `src/screens/home.tsx:138-145`
- Modify: `src/i18n/locales/en.json`, `fr.json` puis les 5 autres

**Interfaces:**
- Consumes: `parsePastedMeeting`, `listKnownHosts`, `normalizeCodeInput`, `formatCodeSlug`
- Produces:
  ```ts
  type JoinTarget = { readonly slug: string; readonly host: string };
  // onJoinRoom remonte désormais un couple ; onHostChange ABSENT = pas de rangée
  ```

- [ ] **Step 1 : les clés i18n d'abord**

`src/i18n/locales/en.json` :
```json
"join.server": "Server",
"join.serverChange": "Change",
"join.serverUnknown": "Not a known Twake Visio server",
"join.serverPrompt": "Server address",
"join.serverInvalid": "Enter a valid server address",
```
`fr.json` :
```json
"join.server": "Serveur",
"join.serverChange": "Changer",
"join.serverUnknown": "Serveur Twake Visio non reconnu",
"join.serverPrompt": "Adresse du serveur",
"join.serverInvalid": "Saisissez une adresse de serveur valide",
```

**Et RÉÉCRIRE `join.pasteFailed` dans les sept fichiers.** Il dit aujourd'hui
« Ce lien ne pointe pas vers un serveur de réunion connu. » — **la règle que ce
lot abroge**. Nouveau texte :
- `en` : `"Your clipboard holds no meeting link or code."`
- `fr` : `"Votre presse-papiers ne contient ni lien ni code de réunion."`

Puis `grep -rn "serveur de réunion connu" src/` doit ne plus rien rendre, et
propager les cinq autres langues avec la skill `twake-guidelines:locales`.

- [ ] **Step 2 : écrire les tests qui échouent**

```ts
// La feuille prend maintenant un hôte ; le helper `sheet()` existant doit le
// fournir, sinon TOUS les tests du fichier cassent sur un type manquant.
function sheet(
  overrides: Partial<React.ComponentProps<typeof JoinSheet>> = {},
): React.ReactElement {
  return withPaper(
    <JoinSheet
      host="meet.linagora.com"
      onJoinRoom={jest.fn()}
      onSheetDismiss={jest.fn()}
      testID="join"
      visible
      {...overrides}
    />,
  );
}

describe('la rangée de serveur', () => {
  // La conséquence OBSERVABLE, jamais `props.onHostChange` : une prop consommée
  // vaut `undefined` sur l'élément hôte et l'assertion serait verte partout.
  it("n'est PAS rendue sans onHostChange — le cas de home.tsx", async () => {
    await render(sheet());

    expect(screen.queryByTestId('join-host')).toBe(null);
  });

  it('est rendue avec onHostChange — le cas invité', async () => {
    await render(sheet({ onHostChange: jest.fn() }));

    expect(screen.getByTestId('join-host')).toHaveTextContent('meet.linagora.com');
  });

  it("ne marque PAS un hôte connu", async () => {
    await render(sheet({ host: 'meet.linagora.com', onHostChange: jest.fn() }));

    expect(screen.queryByTestId('join-host-unknown')).toBe(null);
  });

  it('marque un hôte hors allowlist', async () => {
    await render(sheet({ host: 'meet.acme.com', onHostChange: jest.fn() }));

    expect(screen.getByTestId('join-host-unknown')).toBeOnTheScreen();
  });
});

describe('coller, désormais', () => {
  it('accepte un code nu', async () => {
    clipboard.getStringAsync.mockResolvedValue('abc-defg-hij');
    await render(sheet());

    await fireEvent.press(screen.getByTestId('join-paste'));

    await waitFor(() => expect(screen.getByTestId('join-cell-0')).toHaveTextContent('a'));
    expect(screen.queryByTestId('join-paste-error')).toBe(null);
  });

  it("adopte l'hôte d'un lien collé, même inconnu", async () => {
    const onHostChange = jest.fn();
    clipboard.getStringAsync.mockResolvedValue('https://meet.acme.com/abc-defg-hij');
    await render(sheet({ onHostChange }));

    await fireEvent.press(screen.getByTestId('join-paste'));

    await waitFor(() => expect(onHostChange).toHaveBeenCalledWith('meet.acme.com'));
  });

  it("GARDE l'hôte courant quand le collage n'en porte aucun", async () => {
    const onHostChange = jest.fn();
    clipboard.getStringAsync.mockResolvedValue('abc-defg-hij');
    await render(sheet({ onHostChange }));

    await fireEvent.press(screen.getByTestId('join-paste'));

    await waitFor(() => expect(screen.getByTestId('join-cell-0')).toHaveTextContent('a'));
    expect(onHostChange).not.toHaveBeenCalled();
  });

  it('signale un presse-papiers qui ne porte ni lien ni code', async () => {
    clipboard.getStringAsync.mockResolvedValue('bonjour');
    await render(sheet());

    await fireEvent.press(screen.getByTestId('join-paste'));

    await waitFor(() => expect(screen.getByTestId('join-paste-error')).toBeOnTheScreen());
  });
});

describe("l'action de validation", () => {
  it("remonte le slug ET l'hôte courant", async () => {
    const onJoinRoom = jest.fn();
    await render(sheet({ host: 'meet.acme.com', onJoinRoom, onHostChange: jest.fn() }));

    await type('abcdefghij');
    await fireEvent.press(screen.getByTestId('join-submit'));

    expect(onJoinRoom).toHaveBeenCalledWith({ slug: 'abc-defg-hij', host: 'meet.acme.com' });
  });
});
```

Les tests existants qui asseraient `onJoinRoom` avec une chaîne
(`joinSheet.spec.tsx:109`) doivent passer à l'objet.

- [ ] **Step 3 : lancer, vérifier l'échec**

Run: `npx jest src/screens/joinSheet.spec.tsx`
Expected: FAIL — `join-host` introuvable, et `onJoinRoom` reçoit une chaîne.

- [ ] **Step 4 : implémenter la feuille**

```tsx
type JoinTarget = { readonly slug: string; readonly host: string };

type Props = {
  readonly visible: boolean;
  readonly onSheetDismiss: () => void;
  readonly onJoinRoom: (target: JoinTarget) => void;
  readonly host: string;
  // ABSENT = la rangée n'est pas rendue. UNE prop porte la capacité ET le
  // rappel : deux props à tenir d'accord seraient une de trop, et `home.tsx`
  // n'a aucun serveur à choisir.
  readonly onHostChange?: (host: string) => void;
  readonly testID: string;
};
```

`handlePaste` :
```tsx
async function handlePaste(): Promise<void> {
  const clip = await Clipboard.getStringAsync();
  // `parsePastedMeeting`, PAS `parseMeetingLink` : coller est un geste
  // délibéré dont l'hôte sera montré, un lien profond ne l'est pas. Les deux
  // fonctions existent pour cette raison ; ne pas les confondre.
  const target = parsePastedMeeting(clip);
  if (target === null) {
    setPasteFailed(true);
    return;
  }
  setCode(normalizeCodeInput(target.slug));
  setPasteFailed(false);
  // `host: null` veut dire « le collage ne portait aucun hôte » — un code nu,
  // ou le schéma applicatif. On garde alors le courant.
  if (target.host !== null) onHostChange?.(target.host);
}
```

`handleSubmit` :
```tsx
function handleSubmit(): void {
  const slug = formatCodeSlug(code);
  if (slug !== null) onJoinRoom({ slug, host });
}
```

La rangée, rendue seulement si `onHostChange !== undefined`, avec un
`TextInput` en remplacement quand on appuie sur « Changer ». Le marqueur
d'hôte inconnu porte `tokens.color.textMeta` — une couleur d'**information**,
pas `danger` : ce n'est pas une erreur.

- [ ] **Step 5 : mettre `home.tsx` au type**

```tsx
<JoinSheet
  host={new URL(account?.instance.serverUrl ?? DEFAULT_SERVER_URL).hostname}
  onJoinRoom={({ slug }) => {
    setJoinOpen(false);
    router.push(`/room/${slug}/prejoin`);
  }}
  …
/>
```
**Sans `onHostChange`** : une personne connectée n'a pas de serveur à choisir.

- [ ] **Step 6 : lancer et muter**

Run: `npx jest src/screens/joinSheet.spec.tsx src/screens/home.spec.tsx`
Puis muter : retirer l'appel `onHostChange?.(target.host)`.
Expected: « adopte l'hôte d'un lien collé » rougit, et lui seul.

- [ ] **Step 7 : commit**

```bash
npx prettier --write src/screens/joinSheet.tsx src/screens/joinSheet.spec.tsx src/screens/home.tsx src/i18n/locales/
git add -A && git commit -m "feat(join): Montrer le serveur, et accepter un code nu au collage"
```

---

## Task 6 : l'entrée invité sur l'accueil

**Files:**
- Modify: `src/screens/welcome.tsx:60-88`, `src/screens/welcome.spec.tsx`
- Modify: `src/i18n/locales/*.json`

- [ ] **Step 1 : clés i18n**

`en` : `"welcome.joinAsGuest": "Join without an account"`
`fr` : `"welcome.joinAsGuest": "Rejoindre sans compte"`
Puis propager avec `twake-guidelines:locales`.

- [ ] **Step 2 : écrire les tests qui échouent**

```ts
import * as guest from 'src/auth/guest';

describe("l'entrée invité", () => {
  it('ouvre la feuille de saisie', async () => {
    await render(<WelcomeScreen />);
    expect(screen.queryByTestId('welcome-join-sheet')).toBe(null);

    await fireEvent.press(screen.getByTestId('join-as-guest-btn'));

    expect(screen.getByTestId('welcome-join-sheet')).toBeOnTheScreen();
  });

  // DEUX instructions dans ce gestionnaire, donc deux assertions : ouvrir la
  // session, et naviguer. Le compte d'instructions est le compte d'assertions.
  it('ouvre une session invité sur le serveur choisi', async () => {
    const start = jest.spyOn(guest, 'startGuestSession');
    await render(<WelcomeScreen />);
    await fireEvent.press(screen.getByTestId('join-as-guest-btn'));

    await fireEvent.changeText(screen.getByTestId('welcome-join-sheet-input'), 'abcdefghij');
    await fireEvent.press(screen.getByTestId('welcome-join-sheet-submit'));

    expect(start).toHaveBeenCalledWith('https://meet.linagora.com');
  });

  it('pousse le pré-join du salon saisi', async () => {
    await render(<WelcomeScreen />);
    await fireEvent.press(screen.getByTestId('join-as-guest-btn'));
    await fireEvent.changeText(screen.getByTestId('welcome-join-sheet-input'), 'abcdefghij');
    await fireEvent.press(screen.getByTestId('welcome-join-sheet-submit'));

    expect(mockPush).toHaveBeenCalledWith('/room/abc-defg-hij/prejoin');
  });
});
```

- [ ] **Step 3 : lancer, vérifier l'échec**

Run: `npx jest src/screens/welcome.spec.tsx`
Expected: FAIL — `join-as-guest-btn` introuvable.

- [ ] **Step 4 : implémenter**

Un `<View style={styles.divider} />` puis le bouton, sous les trois actions de
compte. État `host` local, initialisé à `new URL(DEFAULT_SERVER_URL).hostname`.

```tsx
const [joinOpen, setJoinOpen] = useState(false);
const [host, setHost] = useState(() => new URL(DEFAULT_SERVER_URL).hostname);

// …
<JoinSheet
  host={host}
  onHostChange={setHost}
  onJoinRoom={({ slug, host: chosen }) => {
    setJoinOpen(false);
    startGuestSession(`https://${chosen}`);
    router.push(`/room/${slug}/prejoin`);
  }}
  onSheetDismiss={() => setJoinOpen(false)}
  testID="welcome-join-sheet"
  visible={joinOpen}
/>
```

- [ ] **Step 5 : lancer, puis commit**

```bash
npx jest src/screens/welcome.spec.tsx
npx prettier --write src/screens/welcome.tsx src/screens/welcome.spec.tsx src/i18n/locales/
git add -A && git commit -m "feat(welcome): Offrir de rejoindre une réunion sans compte"
```

---

## Task 7 : le pré-join nomme l'invité

**Files:**
- Modify: `src/screens/room/prejoin.tsx` — `getActiveAccount()` en **deux** endroits
  (`:134` au montage, `:184` dans l'effet), l'encart « VOTRE NOM » (`:387-390`),
  et `rememberVisit` (`:220`)
- Modify: `src/screens/room/prejoin.spec.tsx`
- Modify: `src/i18n/locales/*.json`

> **Numéros de ligne revérifiés le 2026-08-04 APRÈS la fusion d'`origin/main`**,
> qui a réécrit ce fichier de 159 lignes. Ceux du plan d'origine (`:115-180`,
> `:286-305`) étaient périmés. Vérifie quand même par `grep` avant d'éditer :
> une autre fusion peut être passée depuis.

- [ ] **Step 1 : clés i18n — UNE seule**

`en` : `"prejoin.yourNamePrompt": "Enter your name"`
`fr` : `"prejoin.yourNamePrompt": "Saisissez votre nom"`

> **CORRECTION du 2026-08-04, postérieure à la rédaction du plan.** Ce Step
> demandait aussi `guest.signInRequired` et `guest.signIn`, pour un cas 401/403
> sur un salon `trusted`. La lecture du code amont de meet montre que **ce cas
> n'existe pas** : `RoomPermissions.has_permission` rend `True` pour toute
> méthode sûre, et `RoomSerializer.to_representation` se contente d'omettre le
> bloc `livekit`. Un anonyme reçoit donc **200 sans jeton**, ce que
> `fetchRoomAccess` traduit déjà en salle d'attente.
>
> **Ne pas ajouter ces deux clés, et ne câbler aucune branche « il faut un
> compte ».** Une branche qu'aucune réponse n'atteint est du code mort
> qu'aucun test ne peut distinguer d'une branche vivante. Détail et citations
> dans la spec, section « Le cas non public ».

- [ ] **Step 2 : écrire les tests qui échouent**

```ts
import * as visitor from 'src/auth/visitor';
import * as guest from 'src/auth/guest';

const GUEST: visitor.Visitor = {
  kind: 'guest',
  serverUrl: 'https://meet.acme.com',
  displayName: '',
};

describe('le pré-join en invité', () => {
  it('rend un champ de nom à la place du texte figé', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(ACCESS_OK);
    await render(<PrejoinScreen />);

    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());
  });

  // Masquer, jamais griser : AGENTS.md interdit `disabled` sur un écran sombre.
  it("ne rend PAS « Rejoindre » tant que le nom est vide", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(ACCESS_OK);
    await render(<PrejoinScreen />);
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());

    expect(screen.queryByTestId('join-call-btn')).toBe(null);
  });

  it('rend « Rejoindre » dès que le nom est saisi', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(ACCESS_OK);
    await render(<PrejoinScreen />);
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());

    await fireEvent.changeText(screen.getByTestId('prejoin-name-input'), 'Camille');

    expect(screen.getByTestId('join-call-btn')).toBeOnTheScreen();
  });

  it('mémorise le nom au moment de rejoindre', async () => {
    const remember = jest.spyOn(guest, 'rememberGuestName');
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(ACCESS_OK);
    await render(<PrejoinScreen />);
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());

    await fireEvent.changeText(screen.getByTestId('prejoin-name-input'), 'Camille');
    await fireEvent.press(screen.getByTestId('join-call-btn'));

    expect(remember).toHaveBeenCalledWith('Camille');
  });

  it("n'écrit RIEN dans l'historique pour un invité", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(ACCESS_OK);
    await render(<PrejoinScreen />);
    await waitFor(() => expect(screen.getByTestId('prejoin-name-input')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('prejoin-name-input'), 'Camille');
    await fireEvent.press(screen.getByTestId('join-call-btn'));

    expect(journal.rememberVisit).not.toHaveBeenCalled();
  });

  it('pré-remplit le champ du nom mémorisé', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({ ...GUEST, displayName: 'Camille' });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(ACCESS_OK);
    await render(<PrejoinScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('prejoin-name-input')).toHaveProp('value', 'Camille'),
    );
  });
});

describe('le pré-join avec un compte', () => {
  it('garde le nom en texte figé, sans champ', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({ kind: 'account', account: ACCOUNT });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(ACCESS_OK);
    await render(<PrejoinScreen />);

    await waitFor(() => expect(screen.getByTestId('prejoin-name')).toBeOnTheScreen());
    expect(screen.queryByTestId('prejoin-name-input')).toBe(null);
  });

  it("écrit BIEN dans l'historique pour un compte", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({ kind: 'account', account: ACCOUNT });
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue(ACCESS_OK);
    await render(<PrejoinScreen />);
    await waitFor(() => expect(screen.getByTestId('join-call-btn')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('join-call-btn'));

    expect(journal.rememberVisit).toHaveBeenCalled();
  });
});
```

> **`toHaveProp('value', …)` sur un `TextInput` est légitime** : `value` est une
> prop que l'élément hôte porte réellement, à la différence de `visible` sur un
> `Badge`. À VÉRIFIER PAR MUTATION avant de s'y fier — si retirer le
> pré-remplissage ne fait pas rougir, remplacer par une assertion sur le rendu
> du bouton « Rejoindre », qui dépend du nom.

- [ ] **Step 3 : lancer, vérifier l'échec**

Run: `npx jest src/screens/room/prejoin.spec.tsx`
Expected: FAIL — `prejoin-name-input` introuvable.

- [ ] **Step 4 : implémenter**

- `const [visitor] = useState(() => getVisitor())`
- `const [name, setName] = useState(() => visitorName(visitor ?? …))`
- l'encart rend un `TextInput` si `visitor?.kind === 'guest'`, le `Text` sinon
- le bouton n'est rendu que si `name.trim().length > 0`
- `handleJoin` : `rememberGuestName(name)` pour un invité, `rememberVisit(…)`
  **seulement** pour un compte
- couleurs explicites obligatoires : `color: tokens.color.textDark` sur le champ,
  et `placeholderTextColor={tokens.color.muted}`

- [ ] **Step 5 : muter, puis commit**

Muter : rendre le bouton inconditionnellement.
Expected: « ne rend PAS Rejoindre tant que le nom est vide » rougit.

```bash
npx prettier --write src/screens/room/prejoin.tsx src/screens/room/prejoin.spec.tsx src/i18n/locales/
git add -A && git commit -m "feat(prejoin): Laisser un invité se nommer avant d'entrer"
```

---

## Task 8 : salle d'attente, séance, sortie

**Files:**
- Modify: `src/screens/room/lobby.tsx` — `getActiveAccount()` en **trois** endroits
  (`:62` état de départ, `:68` première demande, `:85` scrutation) et la sortie
  `:182`. `requestEntry` y est déjà enveloppé en `{ kind: 'account', account }`
  par la Task 4 : remplacer cette enveloppe par le vrai visiteur.
- Modify: `src/screens/room/lobby.spec.tsx`
- Modify: `src/screens/room/call.tsx` — **SIX** sites, pas quatre :
  `:245` (état de départ), `:446` (lecture par rendu), `:576` (`account ?? NO_ACCOUNT`),
  `:652` (effet de connexion), `:763` (`handleCopyLink`), `:773` (`handleShare`)
- Modify: `src/screens/room/call.spec.tsx`

> **RECENSEMENT REFAIT le 2026-08-04 APRÈS la fusion d'`origin/main`.** Le plan
> d'origine citait quatre sites dans `call.tsx` ; il y en a six, et le sixième
> est **nouveau** : `handleCopyLink` (`:762-767`) est arrivé en amont pendant ce
> lot. Il construit `${activeAccount.instance.serverUrl}/${slug}` et **sort tôt
> si le compte est nul** — donc, tel quel, **la copie de lien est morte pour un
> invité**, silencieusement. Elle veut le même traitement que `handleShare`.
> Vérifie par `grep -n "getActiveAccount" src/screens/room/call.tsx` avant
> d'éditer : le compte peut avoir encore changé.

- [ ] **Step 1a : la salle d'attente d'abord**

`lobby.tsx` lit `getActiveAccount()` en **trois** endroits (`:62`, `:68`, `:85`),
et son état de départ traite `null` comme `error.unauthorized`. Pour un invité
ce n'est plus un échec : c'est le cas nominal.

```ts
describe("la salle d'attente en invité", () => {
  it('demande son entrée sous le nom mémorisé', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({
      kind: 'guest',
      serverUrl: 'https://meet.acme.com',
      displayName: 'Camille',
    });
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);

    await waitFor(() =>
      expect(entry).toHaveBeenCalledWith(expect.objectContaining({ kind: 'guest' }), 'reunion', 'Camille'),
    );
  });

  it("n'annonce PLUS « session expirée » faute de compte", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({
      kind: 'guest',
      serverUrl: 'https://meet.acme.com',
      displayName: 'Camille',
    });
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);

    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeOnTheScreen());
    expect(screen.queryByTestId('lobby-error')).toBe(null);
  });

  // La branche qui reste : NI compte NI session invité.
  it('annonce toujours l’échec quand il n’y a aucun visiteur', async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(null);

    await render(<LobbyScreen />);

    expect(screen.getByTestId('lobby-error')).toBeOnTheScreen();
  });

  it("ramène un invité à l'accueil public", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({
      kind: 'guest',
      serverUrl: 'https://meet.acme.com',
      displayName: 'Camille',
    });
    jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'waiting', livekitUrl: null, token: null },
    });
    await render(<LobbyScreen />);

    await fireEvent.press(screen.getByTestId('lobby-leave-btn'));

    expect(mockReplace).toHaveBeenCalledWith('/welcome');
  });
});
```

Implémentation : remplacer les trois `getActiveAccount()` par `getVisitor()`,
l'état de départ devenant `getVisitor() === null ? failed : requesting`, et le
bouton de sortie choisissant sa destination comme dans `call.tsx` ci-dessous.

Muter : figer la destination à `/home`.
Expected: « ramène un invité » rougit, et le test équivalent du compte reste vert.

- [ ] **Step 1b : écrire les tests de la séance**

> **Les `testID` ci-dessous ont été RELEVÉS DANS LA SOURCE le 2026-08-04**, pas
> écrits de mémoire — `call-header-copy` et `call-header-share`
> (`callHeader.tsx:189` et `:204`). Une première rédaction de ce plan citait
> `copy-link-btn` et `share-btn` : **aucun des deux n'existe**, et un
> `getByTestId` sur un identifiant absent jette au lieu d'échouer proprement,
> ce qui se lit comme un test cassé plutôt que comme une garde qui manque.
> Le bouton de sortie a plusieurs identifiants selon l'état rendu
> (`error-leave-btn`, `connecting-leave-btn`, celui de la barre) : **choisis
> celui que ta fixture atteint réellement**, et vérifie-le par `grep` avant de
> l'écrire.

```ts
describe('la sortie de séance', () => {
  it("ramène un COMPTE à l'accueil", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue({ kind: 'account', account: ACCOUNT });
    await renderCall();

    await fireEvent.press(screen.getByTestId('leave-btn'));

    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it("ramène un INVITÉ à l'écran d'accueil public", async () => {
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    await renderCall();

    await fireEvent.press(screen.getByTestId('leave-btn'));

    expect(mockReplace).toHaveBeenCalledWith('/welcome');
  });

  it('referme la session invité en sortant', async () => {
    const end = jest.spyOn(guest, 'endGuestSession');
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    await renderCall();

    await fireEvent.press(screen.getByTestId('leave-btn'));

    expect(end).toHaveBeenCalled();
  });
});

describe('le partage du lien', () => {
  it("porte le serveur de l'INVITÉ, pas une constante", async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'dismissedAction' });
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    await renderCall();

    await fireEvent.press(screen.getByTestId('call-header-share'));

    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://meet.acme.com/reunion' }),
    );
  });
});

// LA COMMANDE QUE LE PLAN D'ORIGINE AVAIT MANQUÉE. `handleCopyLink` est arrivé
// en amont pendant ce lot et sort tôt sur un compte nul : sans ce test, un
// invité appuie sur « Copier le lien » et il ne se passe RIEN — pas même la
// Snackbar, dont le commentaire de `call.tsx` dit pourtant qu'elle EST la
// commande. Un échec silencieux, donc le pire des deux.
describe('la copie du lien', () => {
  it("copie le lien avec le serveur de l'INVITÉ", async () => {
    const copy = jest.spyOn(Clipboard, 'setStringAsync').mockResolvedValue(true);
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    await renderCall();

    await fireEvent.press(screen.getByTestId('call-header-copy'));

    expect(copy).toHaveBeenCalledWith('https://meet.acme.com/reunion');
  });

  // Deuxième INSTRUCTION du même gestionnaire : le recensement par instructions
  // l'exige, et c'est elle qui rend la commande visible.
  it("annonce la copie à l'invité, comme à un compte", async () => {
    jest.spyOn(Clipboard, 'setStringAsync').mockResolvedValue(true);
    jest.spyOn(visitor, 'getVisitor').mockReturnValue(GUEST);
    await renderCall();

    await fireEvent.press(screen.getByTestId('call-header-copy'));

    await waitFor(() => expect(screen.getByText('call.linkCopied')).toBeOnTheScreen());
  });
});
```

- [ ] **Step 2 : lancer, vérifier l'échec** — Run: `npx jest src/screens/room/call.spec.tsx`

- [ ] **Step 3 : implémenter**

Dans `call.tsx`, `handleLeave` :
```tsx
// `endGuestSession` AVANT la navigation : `/welcome` ne consulte pas la
// session, mais un lien profond ouvert juste après reprendrait sinon le
// serveur de la réunion qu'on vient de quitter.
const current = getVisitor();
if (current?.kind === 'guest') endGuestSession();
router.replace(current?.kind === 'guest' ? '/welcome' : '/home');
```

`handleShare` :
```tsx
const current = getVisitor();
if (current === null) return;
const url = `${visitorServerUrl(current)}/${slug}`;
```

Et **corriger le commentaire de `NO_ACCOUNT`** (`call.tsx:134-139`) : sa
justification actuelle — « `access` ne se remplit que sans compte » — cesse
d'être vraie pour un invité, qui obtient bien un `access`. La garde réelle est
`canModerate`, et `is_administrable` vaut `false` pour un anonyme (mesuré le
2026-08-04). La conclusion tient, la raison change.

- [ ] **Step 4 : muter, puis commit**

Muter : `router.replace('/home')` inconditionnel.
Expected: « ramène un INVITÉ » rougit, « ramène un COMPTE » reste vert.

```bash
git commit -m "feat(call): Ramener un invité à l'accueil public en fin de séance"
```

---

## Task 9 : un lien profond sans compte ouvre le mode invité

**Files:**
- Modify: `app/_layout.tsx:46-62`
- Create: `src/navigation/openMeeting.ts` + `src/navigation/openMeeting.spec.ts`

La logique vit dans `src/`, jamais sous `app/` : `require.context` d'expo-router
tire tout `.tsx` du dossier dans le bundle, et un spec colocalisé y deviendrait
une route.

- [ ] **Step 1 : écrire les tests qui échouent**

```ts
import { resolveDeepLink } from 'src/navigation/openMeeting';

describe('resolveDeepLink', () => {
  it('rend la route de pré-join pour un lien reconnu', () => {
    expect(
      resolveDeepLink('https://meet.linagora.com/abc-defg-hij', ['meet.linagora.com'], true),
    ).toEqual({ route: '/room/abc-defg-hij/prejoin', guestServerUrl: null });
  });

  // Le trou bouché : sans compte, prejoin.tsx sortait de son effet et rendait
  // un sablier ÉTERNEL — sans message, sans sortie.
  it('ouvre une session invité quand aucun compte n’est connecté', () => {
    expect(
      resolveDeepLink('https://meet.linagora.com/abc-defg-hij', ['meet.linagora.com'], false),
    ).toEqual({
      route: '/room/abc-defg-hij/prejoin',
      guestServerUrl: 'https://meet.linagora.com',
    });
  });

  it('refuse un hôte hors allowlist, compte ou pas', () => {
    expect(resolveDeepLink('https://evil.example/abc-defg-hij', ['meet.linagora.com'], false))
      .toBe(null);
  });
});
```

- [ ] **Step 2 : lancer** — Run: `npx jest src/navigation/openMeeting.spec.ts` — FAIL, module absent.

- [ ] **Step 3 : implémenter**

```ts
export type DeepLinkTarget = {
  readonly route: string;
  // Non nul = il faut ouvrir une session invité avant de naviguer.
  readonly guestServerUrl: string | null;
};

// `parseMeetingLink` et son allowlist STRICTE, jamais `parsePastedMeeting` :
// un lien profond arrive sans qu'on l'ait demandé. C'est toute la différence
// de posture entre les deux, et l'élargir ici annulerait la protection.
export function resolveDeepLink(
  url: string,
  allowedHosts: readonly string[],
  signedIn: boolean,
): DeepLinkTarget | null {
  const slug = parseMeetingLink(url, allowedHosts);
  if (slug === null) return null;

  const route = `/room/${slug}/prejoin`;
  if (signedIn) return { route, guestServerUrl: null };

  // `new URL` ne peut plus jeter ici : `parseMeetingLink` a déjà validé l'URL.
  const { protocol, host } = new URL(url);
  if (protocol === `${APP_SCHEME}:`) {
    // Le schéma applicatif ne porte AUCUN hôte : `twakevisio://room/<slug>` a
    // pour `host` le littéral « room », un mot fixe du schéma, pas une
    // instance. Et rien dans cette application n'émet de tels liens pour le
    // partage — `handleShare` et `handleCopyLink` écrivent tous deux
    // `https://<serveur>/<slug>`. Il n'y a donc pas d'hôte à récupérer, et
    // aucune meilleure supposition que le défaut.
    return { route, guestServerUrl: DEFAULT_SERVER_URL };
  }
  // L'hôte du LIEN, pas le serveur par défaut : le lien dit sur quelle
  // instance la réunion se tient, et c'est la seule source qui le sache.
  return { route, guestServerUrl: `https://${host}` };
}
```

> **CORRECTION du 2026-08-05 — ce Step portait un BUG, trouvé par l'implémenteur
> qui a refusé de recopier le plan sans le vérifier.** La version d'origine
> enveloppait `new URL(url)` dans un `try`/`catch` et rendait
> `DEFAULT_SERVER_URL` depuis le `catch`, en croyant que le schéma applicatif
> faisait jeter. **Il ne jette pas.** Mesuré :
>
> ```
> new URL("twakevisio://room/abc-defg-hij")  → protocol=twakevisio:  host="room"
> new URL("https://meet.acme.com/abc-…")     → protocol=https:       host="meet.acme.com"
> new URL("pas une url")                     → JETTE TypeError
> ```
>
> Les seules chaînes qui font jeter sont celles que `parseMeetingLink` a déjà
> rejetées, donc le `catch` était **structurellement inatteignable**. Un invité
> ouvrant un lien `twakevisio://` aurait reçu `startGuestSession('https://room')`
> — un hôte absurde, en silence, produisant l'échec « indiscernable d'un lien
> cassé » que ce même plan dénonce ailleurs.
>
> C'est aussi pourquoi le quatrième test (schéma applicatif, non connecté) n'est
> pas facultatif : c'est lui qui a fait tomber le bug.

- [ ] **Step 4 : câbler `app/_layout.tsx`**

```tsx
const openSlug = (url: string): void => {
  const target = resolveDeepLink(url, allowedHosts, getActiveAccount() !== null);
  if (target === null) return;
  if (target.guestServerUrl !== null) startGuestSession(target.guestServerUrl);
  router.push(target.route);
};
```

- [ ] **Step 5 : barre complète, puis commit**

```bash
npm test && npm run typecheck && npm run lint
git commit -m "feat(navigation): Ouvrir un lien de réunion sans compte, en invité"
```

---

## Task 10 : la mesure qui manque, et le passage sur appareil

- [ ] **Step 1 : CONFIRMER sur l'instance le cas tranché par la source**

Déjà tranché **par lecture du code amont** le 2026-08-04 : un anonyme reçoit
**200 sans bloc `livekit`** sur `trusted` et `restricted`, donc la salle
d'attente, et jamais 401/403. Consigné dans la spec, section « Le cas non
public », avec les trois citations.

Il reste à le **confirmer sur l'instance** — la source dit ce que le code fait,
pas ce que cette instance déploie. Créer depuis l'app un salon `trusted`, puis un
`restricted`, et exécuter **sans en-tête d'autorisation** :

```sh
curl -s -i "https://meet.linagora.com/api/v1.0/rooms/<slug>/?username=Test" | head -20
curl -s -i -X POST "https://meet.linagora.com/api/v1.0/rooms/<slug>/request-entry/" \
     -H 'content-type: application/json' -d '{"username":"Test"}' | head -20
```

Attendu : 200, pas de `livekit`. Si l'instance contredit la source, revenir vers
le partenaire humain — c'est un écart de version, pas un détail d'implémentation.

- [ ] **Step 2 : essai sur appareil Android**

Le simulateur iOS ne publie ni caméra ni micro : un appareil est nécessaire.
Rappel de mesure : `adb shell dumpsys display | grep mUniqueId` — l'app peut
vivre sur un écran virtuel `scrcpy` dont l'identifiant change à chaque lancement.

Vérifier, en invité : la feuille remplie par collage, le nom, l'entrée en
séance, le chat, une réaction, et la sortie qui ramène à l'accueil.

- [ ] **Step 3 : `grep` de la règle abrogée**

```sh
grep -rn "serveur de réunion connu\|not point to a known" src/
```
Expected: aucun résultat. Un site qui CITE une règle en dépend autant qu'un site
qui l'applique.
