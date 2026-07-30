# Périmètre B — Participants et modération : plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les
> étapes utilisent des cases à cocher (`- [ ]`).

**But :** un modérateur voit et traite les demandes d'entrée pendant une séance, et dispose
d'un panneau de participants pour couper un micro, expulser ou changer un rôle.

**Architecture :** cinq endpoints REST de meet dans un module d'API, une file d'attente
comme module pur, une scrutation isolée dans un hook, deux composants minces qui reçoivent
leur état. La frontière est celle qui a fonctionné pour le rendu vidéo : la décision dans
un module pur et testable, la coquille aussi bête que possible.

**Socle technique :** TypeScript strict, React Native 0.86, Expo SDK 57, react-native-paper,
Jest + `@testing-library/react-native` 14.

## Contraintes globales

- `@testing-library/react-native` 14 est **asynchrone** : `await render(...)`,
  `await fireEvent.press(...)`. Sans `await`, `screen` reste non lié et la requête suivante
  lève ``render` function has not been called``. `tsc` ne le voit pas.
- Les écrans vivent dans `src/screens/`, jamais sous `app/` : `require.context`
  d'expo-router balaie tout `.tsx` du dossier et ferait entrer les tests dans le bundle.
- Exports **nommés** uniquement. `export default` n'est toléré que dans les fichiers de
  route sous `app/`.
- Aucun style en ligne : `StyleSheet.create` alimenté par `src/ui/tokens`.
- Aucune chaîne visible en dur. Sept locales (`en fr es it de vi ru`), **toutes remplies** ;
  `src/i18n/index.spec.ts` échoue si une clé manque.
- `react-hooks/set-state-in-effect` est une **erreur**, pas un avertissement : une garde qui
  pose un état passe par l'initialiseur paresseux du `useState`.
- Barre de qualité : `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`
  verts. Le lint a un avertissement pré-existant sur `src/i18n/index.ts:32` : le laisser.
- Commits atomiques, Conventional Commits, jamais de `--no-verify`.
- Chaque test ajouté doit être **éprouvé par mutation** : casser la règle qu'il prétend
  garder, constater le rouge, restaurer. Un test qui passe dans les deux cas ne garde rien.

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/api/participants.ts` | les cinq endpoints REST, typés, rendant des `ApiResult` |
| `src/api/participants.spec.ts` | leur contrat, contre un `authedFetch` bouchonné |
| `src/rooms/waitingQueue.ts` | **pur** : ordre, fusion, disparition. Ni réseau ni rendu |
| `src/rooms/waitingQueue.spec.ts` | la logique de file, éprouvée par mutation |
| `src/rooms/useWaitingParticipants.ts` | la scrutation, ses deux gardes, son arrêt |
| `src/rooms/useWaitingParticipants.spec.tsx` | le cycle de vie de la scrutation |
| `src/screens/room/waitingBanner.tsx` | coquille : reçoit une personne et deux actions |
| `src/screens/room/waitingBanner.spec.tsx` | câblage : quelle action part avec quel id |
| `src/screens/room/participantsPanel.tsx` | coquille : liste et trois actions |
| `src/screens/room/participantsPanel.spec.tsx` | câblage |
| `src/api/rooms.ts` (modifié) | `requestEntry` lit enfin `status` et `livekit` |
| `src/call/types.ts` (modifié) | `RoomAccess` porte `isAdministrable` |
| `src/screens/room/lobby.tsx` (modifié) | scrute `request-entry`, gère le refus |
| `src/screens/room/call.tsx` (modifié) | monte le bandeau et le panneau |

---

### Task 1 : `requestEntry` rend le statut, et `RoomAccess` porte le droit de modérer

**Files:**
- Modify: `src/api/rooms.ts`
- Modify: `src/call/types.ts`
- Test: `src/api/rooms.spec.ts`

**Interfaces:**
- Consumes: `authedFetch` de `src/api/client`
- Produces :
  - `type EntryStatus = 'waiting' | 'accepted' | 'denied'`
  - `requestEntry(account, slug, username): Promise<ApiResult<EntryOutcome>>` où
    `type EntryOutcome = { participantId: string; status: EntryStatus; livekitUrl: string | null; token: string | null }`
  - `RoomAccess` gagne `readonly isAdministrable: boolean`

`POST /rooms/{slug}/request-entry/` rend `{id, status, username, livekit}`. Le code actuel
ne lit que `id` et jette le reste — c'est pourquoi la salle d'attente ne peut pas détecter
un refus. Le service est conçu pour être rappelé : « if waiting, refresh timeout to
maintain position ».

`is_administrable` n'est exposé que par le sérialiseur de détail, jamais par celui de
liste. Il va donc sur `RoomAccess`, pas sur `Room` : le mettre sur `Room` ferait mentir
`fetchMyRooms`, où il serait toujours faux.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter dans `src/api/rooms.spec.ts` :

```ts
describe('requestEntry', () => {
  it('rend le statut et le jeton quand la demande est acceptée', async () => {
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'p-1',
        status: 'accepted',
        username: 'Ada',
        livekit: { url: 'wss://livekit.linagora.com', room: 'r-1', token: 'lk' },
      },
    });

    const result = await requestEntry(ACCOUNT, 'reunion', 'Ada');

    expect(result).toEqual({
      ok: true,
      value: {
        participantId: 'p-1',
        status: 'accepted',
        livekitUrl: 'wss://livekit.linagora.com',
        token: 'lk',
      },
    });
  });

  it('rend le refus, que rien ne permettait de détecter auparavant', async () => {
    // La salle d'attente scrutait fetchRoomAccess, qui ne change pas sur un
    // refus : la personne attendait indéfiniment.
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'p-1', status: 'denied', username: 'Ada' },
    });

    const result = await requestEntry(ACCOUNT, 'reunion', 'Ada');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('denied');
    expect(result.value.token).toBe(null);
  });

  it("traite un statut inconnu comme une attente plutôt que d'inventer", async () => {
    // Le backend peut gagner un état. Le prendre pour une admission ferait
    // entrer quelqu'un sans jeton ; le prendre pour un refus le chasserait à
    // tort. L'attente est le seul choix qui ne perde rien.
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { id: 'p-1', status: 'quelque-chose-de-neuf', username: 'Ada' },
    });

    const result = await requestEntry(ACCOUNT, 'reunion', 'Ada');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('waiting');
  });
});

describe('fetchRoomAccess, droit de modérer', () => {
  it('rend is_administrable', async () => {
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'r-1',
        slug: 'reunion',
        access_level: 'trusted',
        is_administrable: true,
        livekit: { url: 'wss://lk', room: 'r-1', token: 'lk' },
      },
    });

    const result = await fetchRoomAccess(ACCOUNT, 'reunion');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAdministrable).toBe(true);
  });

  it("vaut false quand le serveur ne le dit pas, plutôt que d'ouvrir la modération", async () => {
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: {
        id: 'r-1',
        slug: 'reunion',
        access_level: 'trusted',
        livekit: { url: 'wss://lk', room: 'r-1', token: 'lk' },
      },
    });

    const result = await fetchRoomAccess(ACCOUNT, 'reunion');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.isAdministrable).toBe(false);
  });
});
```

Ajouter `requestEntry` à l'import en tête du fichier.

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/api/rooms`
Attendu : ÉCHEC — `value.status` indéfini, `isAdministrable` absent.

- [ ] **Step 3 : étendre `RoomAccess`**

Dans `src/call/types.ts` :

```ts
export type RoomAccess = {
  readonly room: Room;
  readonly livekitUrl: string;
  readonly token: string;
  // Exposé par le sérialiseur de détail seulement, jamais par celui de liste :
  // il ne peut donc pas vivre sur `Room`, où `fetchMyRooms` le rendrait
  // toujours faux. Vaut exactement `is_administrator_or_owner` côté serveur,
  // la même règle que la permission `HasPrivilegesOnRoom` qu'exigent les
  // endpoints de modération.
  readonly isAdministrable: boolean;
};
```

- [ ] **Step 4 : implémenter dans `src/api/rooms.ts`**

Étendre `RawRoom` avec `is_administrable?: boolean`, puis dans `fetchRoomAccess`, ajouter
au `value` rendu :

```ts
    isAdministrable: result.value.is_administrable === true,
```

Remplacer `requestEntry` :

```ts
export type EntryStatus = 'waiting' | 'accepted' | 'denied';

export type EntryOutcome = {
  readonly participantId: string;
  readonly status: EntryStatus;
  readonly livekitUrl: string | null;
  readonly token: string | null;
};

type RawEntry = {
  id: string;
  status?: string;
  livekit?: { url: string; room: string; token: string };
};

// Un statut que ce code ne connaît pas est traité comme une attente. Le prendre
// pour une admission ferait entrer sans jeton ; le prendre pour un refus
// chasserait quelqu'un que le serveur n'a pas chassé.
function toEntryStatus(raw: string | undefined): EntryStatus {
  if (raw === 'accepted') return 'accepted';
  if (raw === 'denied') return 'denied';
  return 'waiting';
}

// L'endpoint est conçu pour être rappelé — « if waiting, refresh timeout to
// maintain position » — et porte à lui seul l'admission, le refus et le jeton.
// C'est donc lui qu'il faut scruter, et non `fetchRoomAccess`, qui ne change
// pas sur un refus.
export async function requestEntry(
  account: Account,
  slug: string,
  username: string,
): Promise<ApiResult<EntryOutcome>> {
  const result = await authedFetch<RawEntry>(
    account,
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

- [ ] **Step 5 : réparer les appelants**

`src/screens/room/lobby.tsx` consomme `result.value.participantId`. Le champ existe
toujours ; vérifier que `npm run typecheck` passe et corriger le cas échéant.

- [ ] **Step 6 : lancer les tests**

Run : `npm test`
Attendu : tout vert.

- [ ] **Step 7 : éprouver par mutation**

Remplacer `toEntryStatus` par `() => 'accepted'`. Le test du refus doit rougir. Restaurer.
Remplacer `is_administrable === true` par `true`. Le second test de `fetchRoomAccess` doit
rougir. Restaurer.

- [ ] **Step 8 : commit**

```bash
git add src/api/rooms.ts src/api/rooms.spec.ts src/call/types.ts
git commit -m "feat(api): Read the entry status and the right to moderate"
```

---

### Task 2 : la salle d'attente scrute le bon endpoint et annonce un refus

**Files:**
- Modify: `src/screens/room/lobby.tsx`
- Test: `src/screens/room/lobby.spec.tsx`
- Modify: les sept fichiers de `src/i18n/locales/`

**Interfaces:**
- Consumes: `requestEntry`, `EntryOutcome` de la Task 1
- Produces: rien que d'autres tâches consomment

La scrutation ajoutée aujourd'hui interroge `fetchRoomAccess`. Elle détecte l'admission
parce qu'un jeton finit par apparaître, mais **ne peut jamais détecter un refus**.

- [ ] **Step 1 : ajouter la clé de refus dans les sept locales**

`lobby.denied`, à placer après `lobby.noModerator` :

| Locale | Valeur |
|---|---|
| `en` | `Your request to join was declined` |
| `fr` | `Votre demande d'entrée a été refusée` |
| `es` | `Su solicitud de entrada ha sido rechazada` |
| `it` | `La tua richiesta di partecipazione è stata rifiutata` |
| `de` | `Ihre Beitrittsanfrage wurde abgelehnt` |
| `vi` | `Yêu cầu tham gia của bạn đã bị từ chối` |
| `ru` | `Ваш запрос на вход отклонён` |

- [ ] **Step 2 : écrire les tests qui échouent**

Ajouter dans `src/screens/room/lobby.spec.tsx`, dans le `describe` du chemin d'admission :

```ts
  it('annonce un refus au lieu de faire attendre indéfiniment', async () => {
    const entry = jest
      .spyOn(rooms, 'requestEntry')
      .mockResolvedValue({ ok: true, value: WAITING });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-waiting')).toBeTruthy());

    entry.mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'denied', livekitUrl: null, token: null },
    });
    await tick();

    expect(screen.getByTestId('lobby-denied')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('cesse de scruter une fois refusé', async () => {
    const entry = jest.spyOn(rooms, 'requestEntry').mockResolvedValue({
      ok: true,
      value: { participantId: 'p-1', status: 'denied', livekitUrl: null, token: null },
    });

    await render(<LobbyScreen />);
    await waitFor(() => expect(screen.getByTestId('lobby-denied')).toBeTruthy());
    const callsAfterDenial = entry.mock.calls.length;

    await tick();
    await tick();

    // Continuer à demander l'entrée après un refus revient à insister auprès
    // du serveur pour une décision déjà prise.
    expect(entry.mock.calls.length).toBe(callsAfterDenial);
  });
```

avec, en tête du `describe` :

```ts
  const WAITING = {
    participantId: 'p-1',
    status: 'waiting' as const,
    livekitUrl: null,
    token: null,
  };
```

- [ ] **Step 3 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/lobby`
Attendu : ÉCHEC — `lobby-denied` introuvable.

- [ ] **Step 4 : implémenter**

Dans `src/screens/room/lobby.tsx`, ajouter `| { kind: 'denied' }` à `LobbyState`, remplacer
l'import de `fetchRoomAccess` par le seul `requestEntry`, et remplacer le corps de l'effet
de scrutation :

```tsx
  const awaitingAdmission = state.kind === 'waiting' || state.kind === 'no-moderator';

  useEffect(() => {
    if (!awaitingAdmission) return;
    const account = getActiveAccount();
    if (account === null) return;

    let stopped = false;
    const timer = setInterval(() => {
      void requestEntry(account, slug, account.displayName)
        .then((result) => {
          if (stopped) return;
          if (!result.ok) {
            // Une coupure passagère ne doit pas éjecter quelqu'un de la file.
            if (result.error.kind === 'unauthorized') {
              stopped = true;
              clearInterval(timer);
              setState({ kind: 'failed', message: 'error.unauthorized' });
            }
            return;
          }
          if (result.value.status === 'accepted') {
            stopped = true;
            clearInterval(timer);
            router.replace(`/room/${slug}/call`);
            return;
          }
          if (result.value.status === 'denied') {
            stopped = true;
            clearInterval(timer);
            setState({ kind: 'denied' });
          }
        })
        .catch(() => undefined);
    }, ADMISSION_POLL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [awaitingAdmission, slug, router]);
```

Porter `ADMISSION_POLL_MS` à `5000`, la cadence validée, et ajouter le rendu :

```tsx
  if (state.kind === 'denied') {
    return (
      <View style={styles.root}>
        <Text testID="lobby-denied" variant="titleMedium" style={styles.message}>
          {t('lobby.denied')}
        </Text>
      </View>
    );
  }
```

- [ ] **Step 5 : lancer les tests**

Run : `npm test`
Attendu : tout vert. Les tests de scrutation existants qui bouchonnaient `fetchRoomAccess`
doivent être réécrits pour bouchonner `requestEntry` — ils rendent aujourd'hui
`{ ok: false, error: { kind: 'lobby' } }`, ce qui n'a plus de sens ici.

- [ ] **Step 6 : éprouver par mutation**

Retirer la branche `denied`. Les deux nouveaux tests doivent rougir. Restaurer.

- [ ] **Step 7 : commit**

```bash
git add src/screens/room/lobby.tsx src/screens/room/lobby.spec.tsx src/i18n/locales
git commit -m "fix(rooms): Poll the endpoint that can report a refusal"
```

---

### Task 3 : les cinq endpoints de participants

**Files:**
- Create: `src/api/participants.ts`
- Test: `src/api/participants.spec.ts`

**Interfaces:**
- Consumes: `authedFetch` de `src/api/client`, `ApiResult` de `src/api/types`
- Produces :
  - `type WaitingParticipant = { readonly id: string; readonly username: string }`
  - `type ParticipantRole = 'owner' | 'administrator' | 'member'`
  - `listWaitingParticipants(account, roomId): Promise<ApiResult<readonly WaitingParticipant[]>>`
  - `answerEntry(account, roomId, participantId, allow): Promise<ApiResult<void>>`
  - `muteParticipant(account, roomId, identity): Promise<ApiResult<void>>`
  - `removeParticipant(account, roomId, identity): Promise<ApiResult<void>>`
  - `updateParticipantRole(account, roomId, identity, role): Promise<ApiResult<void>>`

**Deux identifiants qui ne s'échangent pas.** Une personne en attente est une **UUID**
(`participant_id`, ce que rend `list_waiting_participants`). Une personne connectée est une
**identité LiveKit** (`participant_identity`, ce que porte `ParticipantView.identity`). Les
signatures les gardent distincts : `answerEntry` prend le premier, les trois autres le
second.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/api/participants.spec.ts` :

```ts
import * as client from 'src/api/client';
import {
  answerEntry,
  listWaitingParticipants,
  muteParticipant,
  removeParticipant,
  updateParticipantRole,
} from 'src/api/participants';
import type { Account } from 'src/auth/accounts';

const ACCOUNT = {
  id: 'https://sso.linagora.com|u-1',
  instance: {
    serverUrl: 'https://meet.linagora.com',
    issuer: 'https://sso.linagora.com',
    clientId: 'twake-visio',
    livekitUrl: 'https://livekit.linagora.com',
    features: { recording: true, subtitle: true, telephony: false },
  },
  email: 'ada@linagora.com',
  displayName: 'Ada',
} as Account;

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('listWaitingParticipants', () => {
  it('rend les personnes en attente', async () => {
    jest.spyOn(client, 'authedFetch').mockResolvedValue({
      ok: true,
      value: { participants: [{ id: 'p-1', username: 'Ada' }] },
    });

    const result = await listWaitingParticipants(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: true, value: [{ id: 'p-1', username: 'Ada' }] });
  });

  it('rend une liste vide plutôt que de casser sur une réponse sans participants', async () => {
    // Le serveur rend `{"participants": []}` sur un salon public, mais rien ne
    // garantit la forme si la route change.
    jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    const result = await listWaitingParticipants(ACCOUNT, 'r-1');

    expect(result).toEqual({ ok: true, value: [] });
  });

  it('appelle la bonne route', async () => {
    const spy = jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: true, value: { participants: [] } });

    await listWaitingParticipants(ACCOUNT, 'r-1');

    expect(spy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/r-1/waiting-participants/');
  });
});

describe('answerEntry', () => {
  it('admet une personne', async () => {
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    await answerEntry(ACCOUNT, 'r-1', 'p-1', true);

    expect(spy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/r-1/enter/');
    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ participant_id: 'p-1', allow_entry: true });
  });

  it('refuse par le même endpoint', async () => {
    // `allow_entry` est un booléen : admettre et refuser ne sont pas deux
    // routes. Se tromper de valeur laisse entrer qui on voulait écarter.
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    await answerEntry(ACCOUNT, 'r-1', 'p-1', false);

    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ participant_id: 'p-1', allow_entry: false });
  });
});

describe('actions de modération', () => {
  it('coupe un micro par identité LiveKit', async () => {
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    await muteParticipant(ACCOUNT, 'r-1', 'PA_abc');

    expect(spy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/r-1/mute-participant/');
    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ participant_identity: 'PA_abc' });
  });

  it('expulse par identité LiveKit', async () => {
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    await removeParticipant(ACCOUNT, 'r-1', 'PA_abc');

    expect(spy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/r-1/remove-participant/');
    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ participant_identity: 'PA_abc' });
  });

  it('change un rôle', async () => {
    const spy = jest.spyOn(client, 'authedFetch').mockResolvedValue({ ok: true, value: {} });

    await updateParticipantRole(ACCOUNT, 'r-1', 'PA_abc', 'administrator');

    expect(spy.mock.calls[0]?.[1]).toBe('/api/v1.0/rooms/r-1/update-participant-role/');
    const init = spy.mock.calls[0]?.[2] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      participant_identity: 'PA_abc',
      role: 'administrator',
    });
  });

  it("remonte l'erreur sans la traduire", async () => {
    jest
      .spyOn(client, 'authedFetch')
      .mockResolvedValue({ ok: false, error: { kind: 'forbidden' } });

    const result = await removeParticipant(ACCOUNT, 'r-1', 'PA_abc');

    expect(result).toEqual({ ok: false, error: { kind: 'forbidden' } });
  });
});
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/api/participants`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : implémenter**

`src/api/participants.ts` :

```ts
import { authedFetch } from 'src/api/client';
import type { ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';

// Une personne en attente est une UUID côté lobby ; une personne connectée est
// une identité LiveKit. Les deux ne s'échangent pas — les confondre produit des
// 404 silencieux. Les signatures les gardent distincts.
export type WaitingParticipant = {
  readonly id: string;
  readonly username: string;
};

export type ParticipantRole = 'owner' | 'administrator' | 'member';

function post(
  account: Account,
  roomId: string,
  path: string,
  body: unknown,
): Promise<ApiResult<unknown>> {
  return authedFetch<unknown>(account, `/api/v1.0/rooms/${encodeURIComponent(roomId)}/${path}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function toVoid(result: ApiResult<unknown>): ApiResult<void> {
  if (!result.ok) return result;
  return { ok: true, value: undefined };
}

export async function listWaitingParticipants(
  account: Account,
  roomId: string,
): Promise<ApiResult<readonly WaitingParticipant[]>> {
  const result = await authedFetch<{ participants?: WaitingParticipant[] }>(
    account,
    `/api/v1.0/rooms/${encodeURIComponent(roomId)}/waiting-participants/`,
  );
  if (!result.ok) return result;
  return { ok: true, value: result.value.participants ?? [] };
}

// Admettre et refuser sont le même endpoint : `allow_entry` les sépare.
export async function answerEntry(
  account: Account,
  roomId: string,
  participantId: string,
  allow: boolean,
): Promise<ApiResult<void>> {
  return toVoid(await post(account, roomId, 'enter', {
    participant_id: participantId,
    allow_entry: allow,
  }));
}

export async function muteParticipant(
  account: Account,
  roomId: string,
  identity: string,
): Promise<ApiResult<void>> {
  return toVoid(
    await post(account, roomId, 'mute-participant', { participant_identity: identity }),
  );
}

export async function removeParticipant(
  account: Account,
  roomId: string,
  identity: string,
): Promise<ApiResult<void>> {
  return toVoid(
    await post(account, roomId, 'remove-participant', { participant_identity: identity }),
  );
}

export async function updateParticipantRole(
  account: Account,
  roomId: string,
  identity: string,
  role: ParticipantRole,
): Promise<ApiResult<void>> {
  return toVoid(
    await post(account, roomId, 'update-participant-role', {
      participant_identity: identity,
      role,
    }),
  );
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx jest src/api/participants`
Attendu : PASSE.

- [ ] **Step 5 : éprouver par mutation**

Inverser `allow_entry: allow` en `allow_entry: !allow`. Les deux tests d'`answerEntry`
doivent rougir. Restaurer.

- [ ] **Step 6 : commit**

```bash
git add src/api/participants.ts src/api/participants.spec.ts
git commit -m "feat(api): Add the waiting list and the moderation actions"
```

---

### Task 4 : la file d'attente, module pur

**Files:**
- Create: `src/rooms/waitingQueue.ts`
- Test: `src/rooms/waitingQueue.spec.ts`

**Interfaces:**
- Consumes: `WaitingParticipant` de `src/api/participants`
- Produces :
  - `mergeWaiting(current: readonly WaitingParticipant[], fetched: readonly WaitingParticipant[]): readonly WaitingParticipant[]`
  - `firstWaiting(queue: readonly WaitingParticipant[]): WaitingParticipant | null`
  - `withoutParticipant(queue: readonly WaitingParticipant[], id: string): readonly WaitingParticipant[]`

Le serveur rend une liste, pas un flux. Entre deux interrogations, des personnes arrivent
et d'autres disparaissent — parce qu'un autre modérateur les a traitées, ou qu'elles ont
renoncé. La fusion doit **préserver l'ordre d'arrivée déjà connu** : réordonner ferait
changer de personne sous le doigt qui s'apprête à appuyer sur Admettre.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/rooms/waitingQueue.spec.ts` :

```ts
import { firstWaiting, mergeWaiting, withoutParticipant } from 'src/rooms/waitingQueue';

const ada = { id: 'p-1', username: 'Ada' };
const bob = { id: 'p-2', username: 'Bob' };
const cid = { id: 'p-3', username: 'Cid' };

describe('mergeWaiting', () => {
  it("conserve l'ordre déjà connu et ajoute les nouveaux à la fin", () => {
    // Réordonner ferait changer de personne sous le doigt qui s'apprête à
    // appuyer sur Admettre.
    expect(mergeWaiting([ada, bob], [bob, ada, cid])).toEqual([ada, bob, cid]);
  });

  it('retire ceux que le serveur ne liste plus', () => {
    // Un autre modérateur a répondu, ou la personne a renoncé.
    expect(mergeWaiting([ada, bob], [bob])).toEqual([bob]);
  });

  it('accepte une première liste', () => {
    expect(mergeWaiting([], [ada, bob])).toEqual([ada, bob]);
  });

  it('rend une liste vide quand plus personne n\\'attend', () => {
    expect(mergeWaiting([ada], [])).toEqual([]);
  });

  it('prend le nom le plus récent pour une personne déjà connue', () => {
    expect(mergeWaiting([ada], [{ id: 'p-1', username: 'Ada L.' }])).toEqual([
      { id: 'p-1', username: 'Ada L.' },
    ]);
  });
});

describe('firstWaiting', () => {
  it('rend la première personne', () => {
    expect(firstWaiting([ada, bob])).toEqual(ada);
  });

  it('rend null sur une file vide', () => {
    expect(firstWaiting([])).toBe(null);
  });
});

describe('withoutParticipant', () => {
  it('retire la personne traitée', () => {
    expect(withoutParticipant([ada, bob], 'p-1')).toEqual([bob]);
  });

  it("ne bronche pas sur un identifiant absent", () => {
    expect(withoutParticipant([ada], 'p-9')).toEqual([ada]);
  });

  it("ne modifie pas la liste qu'on lui passe", () => {
    const queue = [ada, bob];

    withoutParticipant(queue, 'p-1');

    expect(queue).toEqual([ada, bob]);
  });
});
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/rooms/waitingQueue`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : implémenter**

```ts
import type { WaitingParticipant } from 'src/api/participants';

// Le serveur rend une liste, pas un flux. La fusion préserve l'ordre déjà connu
// et ajoute les nouveaux à la fin : réordonner ferait changer de personne sous
// le doigt qui s'apprête à répondre.
export function mergeWaiting(
  current: readonly WaitingParticipant[],
  fetched: readonly WaitingParticipant[],
): readonly WaitingParticipant[] {
  const byId = new Map(fetched.map((participant) => [participant.id, participant]));
  const kept: WaitingParticipant[] = [];

  for (const known of current) {
    const fresh = byId.get(known.id);
    if (fresh === undefined) continue;
    kept.push(fresh);
    byId.delete(known.id);
  }

  return [...kept, ...byId.values()];
}

export function firstWaiting(
  queue: readonly WaitingParticipant[],
): WaitingParticipant | null {
  return queue[0] ?? null;
}

export function withoutParticipant(
  queue: readonly WaitingParticipant[],
  id: string,
): readonly WaitingParticipant[] {
  return queue.filter((participant) => participant.id !== id);
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx jest src/rooms/waitingQueue`
Attendu : PASSE.

- [ ] **Step 5 : éprouver par mutation**

Remplacer le corps de `mergeWaiting` par `return fetched;`. Le premier test doit rougir.
Restaurer.

- [ ] **Step 6 : commit**

```bash
git add src/rooms/waitingQueue.ts src/rooms/waitingQueue.spec.ts
git commit -m "feat(rooms): Merge the waiting list without reordering it"
```

---

### Task 5 : la scrutation et ses deux gardes

**Files:**
- Create: `src/rooms/useWaitingParticipants.ts`
- Test: `src/rooms/useWaitingParticipants.spec.tsx`

**Interfaces:**
- Consumes: `listWaitingParticipants`, `answerEntry`, `WaitingParticipant` de
  `src/api/participants` ; `mergeWaiting`, `withoutParticipant` de `src/rooms/waitingQueue`
- Produces :
  - `useWaitingParticipants(account, roomId, enabled): { waiting: readonly WaitingParticipant[]; answer: (id: string, allow: boolean) => void }`

`enabled` porte les deux gardes réunies par l'appelant : le salon n'est pas public **et**
`isAdministrable` est vrai. Faux, le hook n'émet aucune requête.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/rooms/useWaitingParticipants.spec.tsx` :

```tsx
import { act, render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import * as participants from 'src/api/participants';
import type { Account } from 'src/auth/accounts';
import { useWaitingParticipants } from 'src/rooms/useWaitingParticipants';

const ACCOUNT = { id: 'a', displayName: 'Ada' } as Account;

function Probe({ enabled }: { enabled: boolean }): React.ReactElement {
  const { waiting } = useWaitingParticipants(ACCOUNT, 'r-1', enabled);
  return <Text testID="count">{String(waiting.length)}</Text>;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.restoreAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

async function tick(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
}

describe('useWaitingParticipants', () => {
  it("n'interroge rien quand la garde est fermée", async () => {
    const list = jest.spyOn(participants, 'listWaitingParticipants');

    await render(<Probe enabled={false} />);
    await tick();

    // Un salon public n'a pas de salle d'attente, et une personne sans
    // privilège se ferait refuser : interroger serait du bruit garanti.
    expect(list).not.toHaveBeenCalled();
  });

  it('interroge quand la garde est ouverte', async () => {
    const list = jest
      .spyOn(participants, 'listWaitingParticipants')
      .mockResolvedValue({ ok: true, value: [{ id: 'p-1', username: 'Ada' }] });

    await render(<Probe enabled />);
    await tick();

    expect(list).toHaveBeenCalledWith(ACCOUNT, 'r-1');
  });

  it('arrête de scruter au démontage', async () => {
    const list = jest
      .spyOn(participants, 'listWaitingParticipants')
      .mockResolvedValue({ ok: true, value: [] });

    const view = await render(<Probe enabled />);
    await tick();
    const before = list.mock.calls.length;

    await view.unmount();
    await tick();
    await tick();

    // Un intervalle non nettoyé interroge le serveur pour un écran que plus
    // personne ne regarde, et fuit un timer par visite.
    expect(list.mock.calls.length).toBe(before);
  });
});
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/rooms/useWaitingParticipants`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 3 : implémenter**

```ts
import { useCallback, useEffect, useState } from 'react';

import {
  answerEntry,
  listWaitingParticipants,
  type WaitingParticipant,
} from 'src/api/participants';
import type { Account } from 'src/auth/accounts';
import { mergeWaiting, withoutParticipant } from 'src/rooms/waitingQueue';

// Cinq secondes. L'endpoint est limité à 150 requêtes par minute et par
// utilisateur : douze laissent un ordre de grandeur de marge. Plus court
// martèlerait le serveur pour un événement rare ; plus long laisse quelqu'un
// devant une porte sans savoir si on l'a entendu.
const WAITING_POLL_MS = 5000;

export type WaitingParticipants = {
  readonly waiting: readonly WaitingParticipant[];
  readonly answer: (id: string, allow: boolean) => void;
};

export function useWaitingParticipants(
  account: Account,
  roomId: string,
  enabled: boolean,
): WaitingParticipants {
  const [waiting, setWaiting] = useState<readonly WaitingParticipant[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    const timer = setInterval(() => {
      void listWaitingParticipants(account, roomId)
        .then((result) => {
          if (stopped || !result.ok) return;
          setWaiting((current) => mergeWaiting(current, result.value));
        })
        .catch(() => undefined);
    }, WAITING_POLL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [account, roomId, enabled]);

  const answer = useCallback(
    (id: string, allow: boolean): void => {
      // Retiré tout de suite : la personne a répondu, et attendre le prochain
      // tour laisserait le bandeau proposer une décision déjà prise.
      setWaiting((current) => withoutParticipant(current, id));
      void answerEntry(account, roomId, id, allow).catch(() => undefined);
    },
    [account, roomId],
  );

  return { waiting, answer };
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx jest src/rooms/useWaitingParticipants`
Attendu : PASSE.

- [ ] **Step 5 : éprouver par mutation**

Retirer `if (!enabled) return;`. Le premier test doit rougir. Retirer le nettoyage de
l'intervalle. Le troisième doit rougir. Restaurer.

- [ ] **Step 6 : commit**

```bash
git add src/rooms/useWaitingParticipants.ts src/rooms/useWaitingParticipants.spec.tsx
git commit -m "feat(rooms): Poll the waiting list only where it can answer"
```

---

### Task 6 : le bandeau

**Files:**
- Create: `src/screens/room/waitingBanner.tsx`
- Test: `src/screens/room/waitingBanner.spec.tsx`
- Modify: les sept fichiers de `src/i18n/locales/`

**Interfaces:**
- Consumes: `WaitingParticipant` de `src/api/participants`
- Produces :
  - `WaitingBanner({ participant, remaining, onAnswer }): React.ReactElement | null`
    où `onAnswer: (id: string, allow: boolean) => void`

Une seule personne à la fois, la première arrivée, avec le nombre de personnes restantes.
Une pile de bandeaux mangerait la vidéo, qui est la raison d'être de l'écran.

- [ ] **Step 1 : ajouter les clés dans les sept locales**

| Clé | `en` | `fr` |
|---|---|---|
| `waiting.knocking` | `{{name}} would like to join` | `{{name}} demande à entrer` |
| `waiting.admit` | `Admit` | `Admettre` |
| `waiting.refuse` | `Refuse` | `Refuser` |
| `waiting.others` | `{{count}} more waiting` | `{{count}} autre(s) en attente` |

Les cinq autres locales : `es` — `{{name}} quiere unirse` / `Admitir` / `Rechazar` /
`{{count}} más en espera` ; `it` — `{{name}} chiede di entrare` / `Ammetti` / `Rifiuta` /
`altri {{count}} in attesa` ; `de` — `{{name}} möchte beitreten` / `Zulassen` / `Ablehnen` /
`{{count}} weitere warten` ; `vi` — `{{name}} muốn tham gia` / `Cho vào` / `Từ chối` /
`còn {{count}} người đang chờ` ; `ru` — `{{name}} хочет присоединиться` / `Впустить` /
`Отклонить` / `ещё {{count}} в ожидании`.

- [ ] **Step 2 : écrire les tests qui échouent**

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { WaitingBanner } from './waitingBanner';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const ADA = { id: 'p-1', username: 'Ada' };

describe('WaitingBanner', () => {
  it("ne s'affiche pas quand personne n'attend", async () => {
    await render(<WaitingBanner participant={null} remaining={0} onAnswer={jest.fn()} />);

    expect(screen.queryByTestId('waiting-banner')).toBe(null);
  });

  it('admet la personne affichée', async () => {
    const onAnswer = jest.fn();

    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={onAnswer} />);
    await fireEvent.press(screen.getByTestId('waiting-admit'));

    expect(onAnswer).toHaveBeenCalledWith('p-1', true);
  });

  it('refuse la personne affichée', async () => {
    // Admettre et refuser partent vers le même endpoint : inverser le booléen
    // laisserait entrer qui on voulait écarter.
    const onAnswer = jest.fn();

    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={onAnswer} />);
    await fireEvent.press(screen.getByTestId('waiting-refuse'));

    expect(onAnswer).toHaveBeenCalledWith('p-1', false);
  });

  it('annonce les personnes restantes', async () => {
    await render(<WaitingBanner participant={ADA} remaining={2} onAnswer={jest.fn()} />);

    expect(screen.getByTestId('waiting-others')).toBeTruthy();
  });

  it("n'annonce rien quand personne d'autre n'attend", async () => {
    await render(<WaitingBanner participant={ADA} remaining={0} onAnswer={jest.fn()} />);

    expect(screen.queryByTestId('waiting-others')).toBe(null);
  });
});
```

- [ ] **Step 3 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/waitingBanner`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 4 : implémenter**

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import type { WaitingParticipant } from 'src/api/participants';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: {
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    backgroundColor: tokens.color.surfaceDark,
  },
  actions: { flexDirection: 'row', gap: tokens.spacing.sm },
});

type Props = {
  readonly participant: WaitingParticipant | null;
  readonly remaining: number;
  readonly onAnswer: (id: string, allow: boolean) => void;
};

// Une seule personne à la fois : une pile de bandeaux mangerait la vidéo, qui
// est la raison d'être de l'écran.
export function WaitingBanner({
  participant,
  remaining,
  onAnswer,
}: Props): React.ReactElement | null {
  const { t } = useTranslation();
  if (participant === null) return null;

  return (
    <View testID="waiting-banner" style={styles.root}>
      <Text variant="titleMedium">
        {t('waiting.knocking', { name: participant.username })}
      </Text>
      {remaining > 0 ? (
        <Text testID="waiting-others">{t('waiting.others', { count: remaining })}</Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          mode="contained"
          testID="waiting-admit"
          onPress={() => onAnswer(participant.id, true)}
        >
          {t('waiting.admit')}
        </Button>
        <Button
          mode="outlined"
          testID="waiting-refuse"
          onPress={() => onAnswer(participant.id, false)}
        >
          {t('waiting.refuse')}
        </Button>
      </View>
    </View>
  );
}
```

- [ ] **Step 5 : lancer les tests**

Run : `npx jest src/screens/room/waitingBanner`
Attendu : PASSE.

- [ ] **Step 6 : éprouver par mutation**

Inverser les booléens des deux boutons. Les tests d'admission et de refus doivent rougir
tous les deux. Restaurer.

- [ ] **Step 7 : commit**

```bash
git add src/screens/room/waitingBanner.tsx src/screens/room/waitingBanner.spec.tsx src/i18n/locales
git commit -m "feat(rooms): Show who is knocking, with admit and refuse"
```

---

### Task 7 : le panneau de participants

**Files:**
- Create: `src/screens/room/participantsPanel.tsx`
- Test: `src/screens/room/participantsPanel.spec.tsx`
- Modify: les sept fichiers de `src/i18n/locales/`

**Interfaces:**
- Consumes: `ParticipantView` de **`src/call/layout`** (et non `src/call/participants`,
  qui ne fait que le produire), `ParticipantRole` de `src/api/participants`
- Produces :
  - `ParticipantsPanel({ participants, canModerate, onMute, onRemove, onRole }): React.ReactElement`
    où `onMute` et `onRemove` prennent `(identity: string) => void` et `onRole` prend
    `(identity: string, role: ParticipantRole) => void`

- [ ] **Step 1 : ajouter les clés dans les sept locales**

| Clé | `en` | `fr` |
|---|---|---|
| `participants.title` | `Participants` | `Participants` |
| `participants.mute` | `Mute` | `Couper le micro` |
| `participants.remove` | `Remove` | `Expulser` |
| `participants.promote` | `Make administrator` | `Passer administrateur` |

`es` — `Participantes` / `Silenciar` / `Expulsar` / `Hacer administrador` ; `it` —
`Partecipanti` / `Disattiva microfono` / `Rimuovi` / `Rendi amministratore` ; `de` —
`Teilnehmer` / `Stummschalten` / `Entfernen` / `Zum Administrator machen` ; `vi` —
`Người tham gia` / `Tắt tiếng` / `Xóa` / `Đặt làm quản trị viên` ; `ru` — `Участники` /
`Отключить микрофон` / `Удалить` / `Назначить администратором`.

- [ ] **Step 2 : écrire les tests qui échouent**

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import type { ParticipantView } from 'src/call/layout';
import { ParticipantsPanel } from './participantsPanel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const view = (identity: string, name: string, isLocal = false): ParticipantView =>
  ({
    identity,
    name,
    isLocal,
    isSpeaking: false,
    lastSpokeAt: null,
    joinedAt: null,
    camera: null,
  }) as ParticipantView;

describe('ParticipantsPanel', () => {
  it('liste les personnes connectées', async () => {
    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada'), view('PA_2', 'Bob')]}
        canModerate={false}
        onMute={jest.fn()}
        onRemove={jest.fn()}
        onRole={jest.fn()}
      />,
    );

    expect(screen.getAllByTestId('participant-row')).toHaveLength(2);
  });

  it("n'offre aucune action sans droit de modérer", async () => {
    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada')]}
        canModerate={false}
        onMute={jest.fn()}
        onRemove={jest.fn()}
        onRole={jest.fn()}
      />,
    );

    // Le serveur refuserait de toute façon : proposer un geste voué à échouer
    // se lit comme une panne de l'application.
    expect(screen.queryByTestId('participant-mute')).toBe(null);
    expect(screen.queryByTestId('participant-remove')).toBe(null);
  });

  it("coupe le micro par l'identité LiveKit", async () => {
    const onMute = jest.fn();

    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada')]}
        canModerate
        onMute={onMute}
        onRemove={jest.fn()}
        onRole={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('participant-mute'));

    expect(onMute).toHaveBeenCalledWith('PA_1');
  });

  it('expulse par la même identité', async () => {
    const onRemove = jest.fn();

    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada')]}
        canModerate
        onMute={jest.fn()}
        onRemove={onRemove}
        onRole={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('participant-remove'));

    expect(onRemove).toHaveBeenCalledWith('PA_1');
  });

  it('ne propose pas de se modérer soi-même', async () => {
    await render(
      <ParticipantsPanel
        participants={[view('PA_1', 'Ada', true)]}
        canModerate
        onMute={jest.fn()}
        onRemove={jest.fn()}
        onRole={jest.fn()}
      />,
    );

    // S'expulser d'un pouce mal placé n'est pas rattrapable.
    expect(screen.queryByTestId('participant-remove')).toBe(null);
  });
});
```

- [ ] **Step 3 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/participantsPanel`
Attendu : ÉCHEC — module introuvable.

- [ ] **Step 4 : implémenter**

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, List, Text } from 'react-native-paper';

import type { ParticipantRole } from 'src/api/participants';
import type { ParticipantView } from 'src/call/layout';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  root: { flex: 1, padding: tokens.spacing.md, gap: tokens.spacing.sm },
  actions: { flexDirection: 'row', gap: tokens.spacing.xs },
});

type Props = {
  readonly participants: readonly ParticipantView[];
  readonly canModerate: boolean;
  readonly onMute: (identity: string) => void;
  readonly onRemove: (identity: string) => void;
  readonly onRole: (identity: string, role: ParticipantRole) => void;
};

export function ParticipantsPanel({
  participants,
  canModerate,
  onMute,
  onRemove,
  onRole,
}: Props): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View style={styles.root}>
      <Text variant="titleMedium">{t('participants.title')}</Text>
      <FlatList
        data={[...participants]}
        keyExtractor={(participant) => participant.identity}
        renderItem={({ item }) => (
          <List.Item
            testID="participant-row"
            title={item.name.length > 0 ? item.name : item.identity}
            right={() =>
              // Sans droit de modérer, le serveur refuserait : proposer un
              // geste voué à échouer se lit comme une panne. Et personne ne se
              // modère soi-même — s'expulser d'un pouce mal placé n'est pas
              // rattrapable.
              canModerate && !item.isLocal ? (
                <View style={styles.actions}>
                  <Button
                    testID="participant-mute"
                    mode="text"
                    onPress={() => onMute(item.identity)}
                  >
                    {t('participants.mute')}
                  </Button>
                  <Button
                    testID="participant-remove"
                    mode="text"
                    onPress={() => onRemove(item.identity)}
                  >
                    {t('participants.remove')}
                  </Button>
                  <Button
                    testID="participant-promote"
                    mode="text"
                    onPress={() => onRole(item.identity, 'administrator')}
                  >
                    {t('participants.promote')}
                  </Button>
                </View>
              ) : null
            }
          />
        )}
      />
    </View>
  );
}
```

- [ ] **Step 5 : lancer les tests**

Run : `npx jest src/screens/room/participantsPanel`
Attendu : PASSE.

- [ ] **Step 6 : éprouver par mutation**

Retirer `&& !item.isLocal`. Le dernier test doit rougir. Remplacer `canModerate &&` par
`true &&`. Le second doit rougir. Restaurer.

- [ ] **Step 7 : commit**

```bash
git add src/screens/room/participantsPanel.tsx src/screens/room/participantsPanel.spec.tsx src/i18n/locales
git commit -m "feat(rooms): List the participants and their moderation actions"
```

---

### Task 8 : monter le bandeau et le panneau dans la séance

**Files:**
- Modify: `src/screens/room/call.tsx`
- Test: `src/screens/room/call.spec.tsx`

**Interfaces:**
- Consumes: tout ce qui précède
- Produces: rien

L'écran de séance connaît déjà `RoomAccess` — il en tire désormais `room.id`,
`room.accessLevel` et `isAdministrable` pour ouvrir ou fermer la garde.

- [ ] **Step 1 : écrire les tests qui échouent**

```tsx
  it("n'interroge pas la file sur un salon public", async () => {
    // Le serveur rend `[]` sur un salon public et 404 sur `enter` : interroger
    // serait du bruit garanti, et l'écran de création propose `public` par
    // défaut.
    const list = jest.spyOn(participants, 'listWaitingParticipants');
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
      ok: true,
      value: {
        room: { id: 'r-1', slug: 'reunion', name: 'r', accessLevel: 'public' },
        livekitUrl: 'wss://lk',
        token: 'lk',
        isAdministrable: true,
      },
    });

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    expect(list).not.toHaveBeenCalled();
  });

  it("n'interroge pas la file sans droit de modérer", async () => {
    const list = jest.spyOn(participants, 'listWaitingParticipants');
    jest.spyOn(rooms, 'fetchRoomAccess').mockResolvedValue({
      ok: true,
      value: {
        room: { id: 'r-1', slug: 'reunion', name: 'r', accessLevel: 'trusted' },
        livekitUrl: 'wss://lk',
        token: 'lk',
        isAdministrable: false,
      },
    });

    await render(<CallScreen />);
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    expect(list).not.toHaveBeenCalled();
  });
```

Importer `* as participants from 'src/api/participants'` en tête du spec.

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Run : `npx jest src/screens/room/call`
Attendu : ÉCHEC — `isAdministrable` absent des bouchons, ou la garde n'existe pas.

- [ ] **Step 3 : implémenter**

Dans `src/screens/room/call.tsx`, tenir l'accès complet plutôt que ses seuls morceaux :

```tsx
  const [access, setAccess] = useState<RoomAccess | null>(null);
```

renseigné dans l'effet de connexion existant, puis :

```tsx
  // Les deux gardes réunies : un salon public n'a pas de salle d'attente, et
  // sans privilège le serveur refuserait la requête.
  const canModerate = access !== null && access.isAdministrable;
  const hasLobby = access !== null && access.room.accessLevel !== 'public';

  const { waiting, answer } = useWaitingParticipants(
    account,
    access?.room.id ?? '',
    canModerate && hasLobby,
  );
```

Poser le bandeau au-dessus de la scène et le panneau derrière un bouton de la barre de
contrôle, avec `firstWaiting(waiting)` comme personne affichée et
`Math.max(waiting.length - 1, 0)` comme reste.

- [ ] **Step 4 : lancer les tests**

Run : `npm test`
Attendu : tout vert. Les bouchons existants de `fetchRoomAccess` dans
`src/screens/room/call.spec.tsx` et `prejoin.spec.tsx` doivent gagner `isAdministrable`.

- [ ] **Step 5 : éprouver par mutation**

Remplacer `canModerate && hasLobby` par `true`. Les deux nouveaux tests doivent rougir.
Restaurer.

- [ ] **Step 6 : vérifier la barre complète**

```bash
npm test && npm run typecheck && npm run lint && npm run format:check
```

- [ ] **Step 7 : commit**

```bash
git add src/screens/room/call.tsx src/screens/room/call.spec.tsx src/screens/room/prejoin.spec.tsx
git commit -m "feat(call): Answer the door without leaving the meeting"
```

---

## Ce que ce plan ne fait pas

- **Aucune notification hors premier plan.** Décidé : cela demanderait des notifications
  push, donc un service, des jetons d'appareil, et un backend meet qui sache les émettre —
  aucun endpoint d'abonnement n'existe dans son API.
- **Rien n'est vérifié sur appareil.** Comme tout le reste de ce socle, ce périmètre est
  validé contre des doubles. Le comportement réel d'un refus au-delà du statut `denied` —
  la personne est-elle retirée de la file, peut-elle redemander l'entrée — reste à établir
  sur une instance vivante.
- **`mute_participant` porte un commentaire `TEMPORARY`** dans la source de meet : son
  authentification y est reconnue comme insuffisante et compensée par une vérification de
  présence. Ce contrat peut changer sous nous.
