# Sous-périmètre C2 — Les réactions éphémères : plan d'implémentation

> **Pour les agents :** SOUS-COMPÉTENCE REQUISE — utiliser `superpowers:subagent-driven-development`
> (recommandé) ou `superpowers:executing-plans` pour dérouler ce plan tâche par tâche. Les
> étapes utilisent des cases à cocher (`- [ ]`).

**Source :** `docs/superpowers/specs/2026-07-30-scope-C-interaction-design.md`, dont ce plan livre
le sous-périmètre **C2** (§11, « Les réactions »). Les renvois `§n` renvoient à ce document. Les
faits `[V]` de ce plan qui ne sont pas déjà dans la conception ont été vérifiés dans **ce**
worktree (`reactions`, branche `design/reactions`, coupée sur `main` — dernier commit visible
`603f91a`), dans `node_modules/livekit-client` 2.18.0, ou en lisant le code déjà fusionné
(`src/screens/room/*.tsx`, `src/call/*.ts`).

**Le précédent que ce plan suit et ne décalque pas :** le sous-périmètre **C1** (main levée),
implémenté et fusionné — `docs/superpowers/plans/2026-07-30-scope-C1-hand.md`,
`src/call/hands.ts`, `src/api/hand.ts`, `src/screens/room/handControl.tsx`,
`src/screens/room/handBanner.tsx`. Même conception mère, même transport pour deux des trois
fonctions du périmètre C, même frontière pur/branché. Ce que C2 **réutilise tel quel** de C1 est
nommé à chaque tâche ; ce que C2 fait **différemment**, et pourquoi, aussi.

---

## But

En séance, on peut envoyer une réaction — un emoji parmi huit — et voir celles des autres, en
quasi-temps réel, sans ouvrir de conversation ni quitter la vidéo. Une réaction est un
**événement**, pas un état : elle apparaît en bulle au-dessus de la scène pendant trois secondes
puis disparaît, ne survit à aucune reconnexion, et n'existe pour personne qui arrive après
qu'elle est passée (§2.1, §7.4). Émettre est limité à 10 envois par seconde, silencieusement.
Aucun panneau n'est créé : les huit cibles vivent dans le menu « plus » que le périmètre D a
livré et que C1 a déjà nourri d'une troisième entrée (`HandControl`) — C2 y ajoute une
quatrième.

**Logiciel qui marche à la fin de ce plan** (§11.C2 de la conception) : réagir et voir réagir.
Aucun couplage à C3 (le chat, non livré ici).

---

## Architecture

Séparation reprise de C1 : le **pur** (décision, encodage, débit, purge — éprouvable sans SDK ni
rendu) d'un côté, le **branché** (SDK LiveKit) de l'autre, et deux coquilles aussi bêtes que
possible.

```
src/call/reactions.ts        (pur)      — types, glyphes, JSON, débit, purge, plafond
src/call/reactionStore.ts    (branché)  — DataReceived, publishData, purge à intervalle
src/screens/room/reactionPicker.tsx     — coquille d'émission : 8 cibles, dans le menu
src/screens/room/reactionOverlay.tsx    — coquille de réception : bulles sur la scène
src/screens/room/moreMenu.tsx (modifié) — accueille ReactionPicker, sans fermeture auto
src/screens/room/call.tsx (modifié)     — le magasin, un gestionnaire, la coquille de réception
```

**Ce que C2 réutilise tel quel de C1** : le menu « plus » existant (`MoreMenu`), sa recette de
test (`withPaper`/`settleMenus`/`open()`), la doctrine de couleur d'`AGENTS.md`, le patron
`subscribe`/`getSnapshot` de `createRoomViewStore`/`createRecordingStore`
(`src/call/participants.ts`, `src/call/recordingStore.ts`), et le double de `Room` de
`call.spec.tsx` (déjà un vrai émetteur depuis C1 — voir tâche 7).

**Ce que C2 fait différemment de C1, et pourquoi c'est plus simple sur un point précis** :

| | C1 (main levée) | C2 (réactions) |
|---|---|---|
| Transport | API REST à jeton LiveKit (`src/api/hand.ts`) | canal de données LiveKit, sans REST |
| Nature de la donnée | état, porté par un attribut participant | événement, ne survit pas à son instant |
| Type élargi hors de son propre fichier | `ParticipantView`/`RoomView` (`src/call/layout.ts`) ont dû gagner `handRaisedAt` | **aucun** — une réaction n'est l'attribut de personne ; elle vit dans son propre magasin, jamais dans `ParticipantView` |
| Magasin | aucun ; dérivé de `roomView` déjà lu | **nouveau** : `reactionStore`, avec `send()` et `dispose()` explicites |
| Purge | sans objet | un intervalle, actif seulement quand la liste n'est pas vide |

La ligne « type élargi » est le point que la leçon n°1 de C1 demande de vérifier pour **chaque**
tâche de ce plan (voir l'auto-relecture, en fin de document, pour l'audit complet). Le résultat
tient en une phrase : **aucune tâche de ce plan n'élargit un type construit dans un fichier
qu'elle ne modifie pas elle-même.** `MoreMenuProps` et `MessageKey` sont chacun élargis dans le
fichier qui les construit (tâches 6 et 7) ; `Reaction`/`ReactionKey`/`ReactionStore` sont
construits une seule fois (tâche 1 et 2) et seulement **consommés**, jamais élargis, ailleurs.

**Ce qui ne se reproduit pas ici** : l'obstacle (b) de C1 (`authedFetch` ne peut pas porter le
jeton LiveKit, §3.1) n'a pas d'équivalent — ce périmètre ne fait **aucun appel REST**. Pas de
`src/api/reactions.ts`. `publishData` et `DataReceived` passent par le canal de données de la
séance déjà ouverte, sans jeton distinct à porter ni à rafraîchir.

---

## Socle technique

Identique à C1 : TypeScript strict (`noUncheckedIndexedAccess`), React Native 0.86, Expo SDK 57,
`react-native-paper` 5.15.3, `livekit-client` 2.18.0, Jest + `@testing-library/react-native` 14.

Trois membres du SDK utilisés ici et absents de C1, vérifiés dans **ce** worktree :

- `RoomEvent.DataReceived` vaut la chaîne `"dataReceived"` **[V]**
  (`node_modules/livekit-client/dist/src/room/events.d.ts:203`).
- Signature au niveau `Room` : `dataReceived: (payload: Uint8Array, participant?: RemoteParticipant,
  kind?: DataPacket_Kind, topic?: string, encryptionType?: Encryption_Type) => void;` **[V]**
  (`node_modules/livekit-client/dist/src/room/Room.d.ts:312`).
- `LocalParticipant.publishData(data: Uint8Array, options?: DataPublishOptions): Promise<void>`
  **[V]** (`node_modules/livekit-client/dist/src/room/participant/LocalParticipant.d.ts`, section
  « Publish a new data payload »). `DataPublishOptions` porte un champ `reliable?: boolean`
  **[V]** (`node_modules/livekit-client/dist/src/room/types.d.ts:46-52`).
- `Room.getParticipantByIdentity(identity: string): Participant | undefined` **[V]**
  (`Room.d.ts:179`, retrouvé au même endroit que celui cité par la conception).

Les quatre sont exportés à la racine du paquet (`import { RoomEvent } from 'livekit-client'`,
`import type { Room, RemoteParticipant } from 'livekit-client'`) **[V]**
(`node_modules/livekit-client/dist/src/index.d.ts`, ligne d'export unique listant `RemoteParticipant`,
`Room`, etc.) — même style d'import que `src/call/participants.ts` et `src/call/recordingStore.ts`.

`TextEncoder`/`TextDecoder` : utilisés nulle part ailleurs dans `src/`, mais requis par la
conception pour le chat (§6.7) comme pour les réactions. Node 22 (la version qui exécute Jest ici)
les expose globalement **[V]** — aucun polyfill à ajouter dans `jest.setup.ts`.

**Aucune dépendance nouvelle.** `TouchableRipple` (tâche 4) est un export existant de
`react-native-paper`, déjà une dépendance ; il n'est simplement pas encore utilisé directement
ailleurs dans `src/screens`.

---

## Contraintes globales

- `@testing-library/react-native` 14 est **asynchrone** : `await render(...)`,
  `await fireEvent.press(...)`, `await view.unmount()`. `tsc` ne voit pas une promesse non
  attendue : c'est une expression valide.
- Écrans dans `src/screens/`, jamais sous `app/` : `require.context` d'expo-router balaierait un
  fichier de spec colocalisé et ferait entrer `@testing-library/react-native` dans le bundle.
- Exports **nommés** uniquement, `export default` interdit hors `app/`. Aucun `enum` : unions de
  chaînes.
- Aucun style en ligne : `StyleSheet.create` alimenté par `src/ui/tokens`, ou les styles partagés
  de `src/screens/room/controlBar.ts`.
- Aucune chaîne visible en dur. Sept locales (`en fr es it de vi ru`), **toutes remplies** ;
  `src/i18n/index.spec.ts` échoue si une clé manque quelque part, et passe sur une clé dupliquée
  en anglais partout — les sept doivent être **traduites**, pas recopiées.
- `react-hooks/set-state-in-effect` est une erreur : une garde qui pose un état passe par
  l'initialiseur paresseux du `useState`.
- Barre de qualité : `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`
  verts. Le lint garde un avertissement pré-existant sur `src/i18n/index.ts:32` : le laisser.
- Commits atomiques, Conventional Commits, jamais de `--no-verify`. Sujet à la forme phrase
  autorisé (le dépôt surcharge `subject-case`).
- **Committer d'abord, muter ensuite.** Chaque tâche écrit ses tests, écrit son code, fait passer
  la barre de qualité, **committe**, puis applique ses mutations sur le commit qui vient d'être
  créé et les annule par `git checkout -- <fichier>` avant la suivante. Une mutation appliquée
  sur du code **non committé** se perd — entièrement, feature comprise — au premier
  `git checkout --` : ce n'est pas juste la mutation qui saute.
- **Chaque test ajouté doit être éprouvé par mutation** : casser la règle qu'il prétend garder,
  constater le rouge précis (nommé dans la tâche), restaurer. Un test qui passe dans les deux cas
  ne garde rien — et ce plan n'en liste aucun qu'il n'a pas vérifié pouvoir faire tomber (voir
  l'auto-relecture pour les deux mutations volontairement **absentes** de la tâche 7, et pourquoi).
- **Pour tout test qui vérifie qu'une valeur remonte : installer au moins deux éléments
  distincts, viser le second.** Et quand deux entrées sont sœurs — deux boutons de réaction
  voisins, deux réactions dans la même bulle, deux locales du même bloc i18n — éprouver les deux.
- **Jamais `npm install`, `npm ci` ni `npm add` dans ce worktree** : `node_modules` y est un lien
  symbolique partagé avec l'arbre principal. Ce périmètre n'ajoute aucune dépendance (voir Socle
  technique).
- **`ApiResult` et l'obstacle (b) d'`authedFetch` ne concernent pas ce plan.** Aucune tâche
  n'appelle `authedFetch` ni ne lit un `ApiResult` : il n'y a aucun appel réseau dans tout ce
  périmètre. Vérifié en relisant chaque signature ci-dessous : aucune ne rend une `Promise`
  porteuse d'un `ApiError`.
- **La place dans la barre reste un invariant.** Aucune tâche de ce plan ne touche
  `styles.controls` ni `controlBar.ts`'s arithmétique (357 dp sur 360, voir A §3 et C §4.1) : la
  quatrième entrée du menu « plus » ne coûte aucun dp de barre, seulement une ligne de plus dans
  un menu qui existe déjà.

### La couleur : voir `AGENTS.md`, et seulement ce qui est spécifique à C2

La règle générale — pourquoi cet écran force un fond sombre dans les deux schémas, quelles props
doivent porter une couleur explicite, pourquoi aucun bouton n'est `disabled`, ce qu'un test peut
ou ne peut pas en prouver — vit dans `AGENTS.md`, section « Le fond de la séance est sombre dans
les deux schémas. Paper ne le sait pas. » **La lire là, jamais dans une copie.**

Ce qui est spécifique aux composants de ce plan, avec les ratios **réutilisés** (même paire de
tokens que C1 et `controlBar.ts` — pas de nouvelle paire à recalculer) :

| Élément livré ici | Prop | Valeur | Fond | Ratio |
|---|---|---|---|---|
| `reaction-picker-title` (`Text` labelSmall) | `style` | `barStyles.menuNote` (`textDark`) | `surfaceDark` (contenu du `Menu`) | **15,86:1** — repris de `controlBar.ts:29-35`, jamais recalculé : même paire de tokens |
| `reaction-bubble-*` (`View`) | `backgroundColor` | `tokens.color.surfaceDark` | — | nouvelle surface, posée **et** motivée ci-dessous |
| `reaction-bubble-name-*` (`Text`) | `style` | `tokens.color.textDark` | `surfaceDark` (la bulle elle-même, pas `backgroundDark`) | **15,86:1** — même paire que la ligne du dessus |
| glyphe emoji (`reaction-${key}`, `reaction-bubble-*` glyphe) | — | **aucune couleur posée**, délibérément | — | sans objet : un emoji Unicode pleine couleur (Apple Color Emoji, Noto Color Emoji) ignore la prop `color` de `Text` — ce n'est pas un texte au sens où la doctrine de contraste s'applique |
| `rippleColor` de `reaction-${key}` (`TouchableRipple`) | `rippleColor` | `BAR_RIPPLE_COLOR` | — | posé pour l'affordance, **non testable** — même limite que le reste de la barre (`AGENTS.md`, préréglage Jest `Platform.OS = 'ios'`) |

**On force la surface de la bulle ET son texte, jamais l'un sans l'autre** — c'est la règle
d'`AGENTS.md` pour toute paire surface/texte de cet écran, et la tâche 5 l'applique explicitement.

**Sur l'absence de couleur du glyphe** : ce n'est pas une omission de la doctrine, c'est son
inapplicabilité. La doctrine porte sur du texte dont la couleur retomberait sur
`theme.colors.onSurface` en l'absence d'une couleur explicite ; un emoji rendu par la police
système ne retombe sur rien de tel — il a sa propre couleur, fixe, indépendante du thème. Poser
`color: tokens.color.textDark` dessus n'aurait aucun effet visible et laisserait croire, à la
lecture du code, qu'un test de contraste le garde. Aucun test de ce plan ne le prétend.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `src/call/reactions.ts` | **pur** : types, glyphes, JSON, débit, purge, plafond. Ni réseau, ni SDK, ni React |
| `src/call/reactions.spec.ts` | chaque fonction ligne à ligne, aux bornes exactes |
| `src/call/reactionStore.ts` | **branché** : `DataReceived`, `publishData`, purge à intervalle, `dispose()` |
| `src/call/reactionStore.spec.ts` | contre une fausse `Room`, le contrat `useSyncExternalStore`, `send`, `dispose` |
| les sept `src/i18n/locales/*.json` (modifiés) | 11 clés, réellement traduites |
| `src/screens/room/reactionPicker.tsx` | coquille : huit cibles de 44 dp, dans le menu « plus » |
| `src/screens/room/reactionPicker.spec.tsx` | rendu, envoi, accessibilité, couleur du titre |
| `src/screens/room/reactionOverlay.tsx` | coquille : bulles immobiles au-dessus de la scène |
| `src/screens/room/reactionOverlay.spec.tsx` | rendu conditionnel, attribution (soi/nom/anonyme), couleurs |
| `src/screens/room/moreMenu.tsx` (modifié) | accueille `ReactionPicker` en quatrième entrée, sans fermeture auto |
| `src/screens/room/moreMenu.spec.tsx` (modifié) | composition, et l'absence délibérée de fermeture |
| `src/screens/room/call.tsx` (modifié) | le magasin, un gestionnaire, la coquille de réception, le câblage |
| `src/screens/room/call.spec.tsx` (modifié) | le double de `Room` gagne `publishData`/`getParticipantByIdentity`, le câblage de bout en bout |

---

### Task 1 : le module pur — glyphes, JSON, débit, purge

**Files:**
- Create: `src/call/reactions.ts`
- Test: `src/call/reactions.spec.ts`

**Interfaces:**
- Consumes : rien. Ce module ne dépend d'aucun autre fichier du dépôt — contrairement à
  `src/call/hands.ts` (C1), qui devait attendre l'élargissement de `ParticipantView`. Aucune
  interdépendance de tâche ici : `tsc --noEmit` est vert dès la fin de cette tâche, seul.
- Produces :
  - `type ReactionKey = 'thumbs-up' | 'thumbs-down' | 'clapping-hands' | 'red-heart' |
    'face-with-tears-of-joy' | 'face-with-open-mouth' | 'party-popper' | 'folded-hands'`
  - `const REACTION_KEYS: readonly ReactionKey[]`
  - `function reactionGlyph(key: ReactionKey): string`
  - `type Reaction = { readonly id: string; readonly key: ReactionKey; readonly identity: string;
    readonly name: string; readonly isLocal: boolean; readonly at: number }`
  - `function encodeReaction(key: ReactionKey): string`
  - `function parseReaction(json: string): ReactionKey | null`
  - `const REACTION_BURST = 10`, `const REACTION_WINDOW_MS = 1_000`,
    `const REACTION_LIFETIME_MS = 3_000`, `const REACTION_MAX_VISIBLE = 6`
  - `function admitSend(recent: readonly number[], now: number): { readonly allowed: boolean;
    readonly recent: readonly number[] }`
  - `function appendReaction(list: readonly Reaction[], next: Reaction): readonly Reaction[]`
  - `function pruneReactions(list: readonly Reaction[], now: number): readonly Reaction[]`

**Les huit valeurs SONT les noms courts Unicode** (§5.C9) — la table de `reactionGlyph` est
mécanique, pas un choix esthétique :

| Valeur | Glyphe | Codepoints |
|---|---|---|
| `thumbs-up` | 👍 | U+1F44D |
| `thumbs-down` | 👎 | U+1F44E |
| `clapping-hands` | 👏 | U+1F44F |
| `red-heart` | ❤️ | U+2764 U+FE0F |
| `face-with-tears-of-joy` | 😂 | U+1F602 |
| `face-with-open-mouth` | 😮 | U+1F62E |
| `party-popper` | 🎉 | U+1F389 |
| `folded-hands` | 🙏 | U+1F64F |

**Le JSON exact que meet attend** (§6.4) : `{"type":"reactionReceived","data":{"emoji":<valeur>}}`
— `<valeur>` est la chaîne `ReactionKey` elle-même, jamais le glyphe. `parseReaction` rend `null`
pour tout ce qui n'est pas exactement cette forme, **sans jamais jeter** : le canal sans topic
porte une douzaine d'autres types (`participantMuted`, `roleChanged`, …, §2.3) qu'il faut ignorer,
pas faire échouer.

**`admitSend` — fenêtre glissante, bornes exactes.** Une entrée compte contre le budget tant que
`now - entrée < REACTION_WINDOW_MS` (strictement) : à `now - entrée === REACTION_WINDOW_MS`
pile, l'entrée est déjà hors fenêtre. Un appel refusé **ne grossit pas** la liste — seul un appel
accepté y ajoute `now` — sans quoi une rafale de 50 appuis en une seconde ne libérerait jamais de
budget tant qu'elle continue.

**`appendReaction` plafonne à `REACTION_MAX_VISIBLE` en retirant la plus ancienne.** La
conception donne le plafond (§6.4, « Le plafond de six borne un flot ») mais ne dit pas qui
l'applique : ni `ReactionOverlay`, ni `reactionStore`, seulement cette fonction — c'est la
**décision** au sens de la séparation pur/branché, exactement comme `raisedHands` (C1) porte le
tri et pas la coquille qui l'affiche. Le débit qu'elle borne est réel : huit participants à
10 réactions/s chacun (le maximum qu'`admitSend` autorise **par émetteur**, puisque le débit ne
limite que l'émission locale, jamais la réception) peuvent produire bien plus que six réactions
par seconde.

**`pruneReactions` — bornes exactes.** Une réaction est effacée quand
`now - reaction.at >= REACTION_LIFETIME_MS` : gardée à `2 999` ms d'âge, effacée à `3 000` pile.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/call/reactions.spec.ts`, en entier :

```ts
import {
  admitSend,
  appendReaction,
  encodeReaction,
  parseReaction,
  pruneReactions,
  reactionGlyph,
  REACTION_BURST,
  REACTION_KEYS,
  REACTION_LIFETIME_MS,
  REACTION_MAX_VISIBLE,
  REACTION_WINDOW_MS,
  type Reaction,
} from 'src/call/reactions';

function reaction(id: string, at: number, overrides: Partial<Reaction> = {}): Reaction {
  return {
    id,
    key: 'thumbs-up',
    identity: id,
    name: id,
    isLocal: false,
    at,
    ...overrides,
  };
}

describe('REACTION_KEYS', () => {
  it('porte exactement les huit valeurs de meet, dans leur ordre déclaré', () => {
    // L'ordre compte : c'est celui dans lequel `ReactionPicker` (tâche 4) les
    // pose en grille.
    expect([...REACTION_KEYS]).toEqual([
      'thumbs-up',
      'thumbs-down',
      'clapping-hands',
      'red-heart',
      'face-with-tears-of-joy',
      'face-with-open-mouth',
      'party-popper',
      'folded-hands',
    ]);
  });
});

describe('reactionGlyph', () => {
  it('rend le glyphe Unicode de chaque valeur', () => {
    expect(reactionGlyph('thumbs-up')).toBe('👍');
    expect(reactionGlyph('folded-hands')).toBe('🙏');
    // Une troisième, au milieu de la table : sans elle, une fonction qui ne
    // mapperait correctement que les deux bornes de la liste passerait.
    expect(reactionGlyph('red-heart')).toBe('❤️');
  });
});

describe('encodeReaction', () => {
  it('produit le JSON exact que meet attend', () => {
    expect(encodeReaction('thumbs-up')).toBe(
      '{"type":"reactionReceived","data":{"emoji":"thumbs-up"}}',
    );
    // Une seconde valeur, distincte : sans elle, une fonction qui rendrait
    // toujours la même chaîne littérale passerait le premier cas.
    expect(encodeReaction('party-popper')).toBe(
      '{"type":"reactionReceived","data":{"emoji":"party-popper"}}',
    );
  });
});

describe('parseReaction', () => {
  it('accepte les huit valeurs, aller-retour avec encodeReaction', () => {
    for (const key of REACTION_KEYS) {
      expect(parseReaction(encodeReaction(key))).toBe(key);
    }
  });

  it('rejette un JSON invalide, sans jeter', () => {
    expect(() => parseReaction('{not json')).not.toThrow();
    expect(parseReaction('{not json')).toBeNull();
  });

  it('rejette une chaîne vide', () => {
    expect(parseReaction('')).toBeNull();
  });

  it('rejette un type autre que reactionReceived', () => {
    // Le canal sans topic porte une douzaine d'autres types : les ignorer est
    // le fonctionnement normal, pas une erreur.
    expect(parseReaction('{"type":"participantMuted","data":{"emoji":"thumbs-up"}}')).toBeNull();
  });

  it('rejette un objet sans `data`', () => {
    expect(parseReaction('{"type":"reactionReceived"}')).toBeNull();
  });

  it('rejette un emoji hors liste', () => {
    expect(
      parseReaction('{"type":"reactionReceived","data":{"emoji":"thumbs-sideways"}}'),
    ).toBeNull();
  });

  it("rejette une valeur JSON qui n'est pas un objet", () => {
    expect(parseReaction('42')).toBeNull();
    expect(parseReaction('"thumbs-up"')).toBeNull();
    expect(parseReaction('null')).toBeNull();
    expect(parseReaction('[1,2,3]')).toBeNull();
  });
});

describe('admitSend', () => {
  it('autorise les dix premiers appels dans la fenêtre', () => {
    let recent: readonly number[] = [];
    for (let i = 0; i < REACTION_BURST; i += 1) {
      const result = admitSend(recent, 0);
      expect(result.allowed).toBe(true);
      recent = result.recent;
    }
    expect(recent).toHaveLength(REACTION_BURST);
  });

  it('refuse le onzième appel dans la même fenêtre, sans grossir la liste', () => {
    let recent: readonly number[] = [];
    for (let i = 0; i < REACTION_BURST; i += 1) recent = admitSend(recent, 0).recent;

    const eleventh = admitSend(recent, 0);

    expect(eleventh.allowed).toBe(false);
    expect(eleventh.recent).toHaveLength(REACTION_BURST);
  });

  it('autorise de nouveau une fois la fenêtre entièrement écoulée', () => {
    let recent: readonly number[] = [];
    for (let i = 0; i < REACTION_BURST; i += 1) recent = admitSend(recent, 0).recent;

    // À la borne exacte : la fenêtre est déjà entièrement écoulée à
    // `now === REACTION_WINDOW_MS`, pas seulement au-delà.
    expect(admitSend(recent, REACTION_WINDOW_MS).allowed).toBe(true);
    expect(admitSend(recent, REACTION_WINDOW_MS + 1).allowed).toBe(true);
  });
});

describe('appendReaction', () => {
  it('ajoute à la fin', () => {
    const list = appendReaction([reaction('a', 0)], reaction('b', 1));
    expect(list.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('plafonne à REACTION_MAX_VISIBLE en retirant la plus ancienne, la seconde comprise', () => {
    let list: readonly Reaction[] = [];
    for (let i = 0; i < REACTION_MAX_VISIBLE; i += 1) {
      list = appendReaction(list, reaction(`r${i}`, i));
    }
    expect(list).toHaveLength(REACTION_MAX_VISIBLE);

    const withOneMore = appendReaction(list, reaction('r-new', 99));

    expect(withOneMore).toHaveLength(REACTION_MAX_VISIBLE);
    const ids = withOneMore.map((r) => r.id);
    expect(ids).not.toContain('r0');
    // La DEUXIÈME plus ancienne reste : sans cette assertion, une fonction
    // qui viderait toute la liste avant d'ajouter passerait aussi.
    expect(ids).toContain('r1');
    expect(ids).toContain('r-new');
  });
});

describe('pruneReactions', () => {
  it('garde une réaction juste avant sa durée de vie', () => {
    expect(pruneReactions([reaction('a', 0)], REACTION_LIFETIME_MS - 1)).toHaveLength(1);
  });

  it('efface une réaction à exactement sa durée de vie', () => {
    expect(pruneReactions([reaction('a', 0)], REACTION_LIFETIME_MS)).toHaveLength(0);
  });

  it('ne touche pas aux réactions encore fraîches, la seconde comprise', () => {
    const list = [reaction('old', 0), reaction('fresh', 2000)];
    expect(pruneReactions(list, 3000).map((r) => r.id)).toEqual(['fresh']);
  });
});
```

- [ ] **Step 2 : écrire le module**

`src/call/reactions.ts`, en entier :

```ts
// Les huit valeurs telles qu'elles circulent sur le fil. Union de chaînes, pas
// `enum` : le dépôt les interdit (`AGENTS.md`), et ce sont les noms courts
// Unicode eux-mêmes, pas un choix esthétique.
export type ReactionKey =
  | 'thumbs-up'
  | 'thumbs-down'
  | 'clapping-hands'
  | 'red-heart'
  | 'face-with-tears-of-joy'
  | 'face-with-open-mouth'
  | 'party-popper'
  | 'folded-hands';

// L'ordre déclaré ici est celui dans lequel `ReactionPicker` (tâche 4) pose
// les huit cibles en grille : quatre par rangée, dans cet ordre, sur deux
// rangées.
export const REACTION_KEYS: readonly ReactionKey[] = [
  'thumbs-up',
  'thumbs-down',
  'clapping-hands',
  'red-heart',
  'face-with-tears-of-joy',
  'face-with-open-mouth',
  'party-popper',
  'folded-hands',
];

const REACTION_GLYPHS: Readonly<Record<ReactionKey, string>> = {
  'thumbs-up': '👍',
  'thumbs-down': '👎',
  'clapping-hands': '👏',
  'red-heart': '❤️',
  'face-with-tears-of-joy': '😂',
  'face-with-open-mouth': '😮',
  'party-popper': '🎉',
  'folded-hands': '🙏',
};

export function reactionGlyph(key: ReactionKey): string {
  return REACTION_GLYPHS[key];
}

// Une réaction prête à afficher. `id` est fourni par l'appelant : un module
// pur n'appelle pas `crypto`, c'est `reactionStore` (tâche 2) qui le fabrique.
export type Reaction = {
  readonly id: string;
  readonly key: ReactionKey;
  readonly identity: string;
  // Vide quand l'émetteur a déjà quitté la salle au moment de la résolution.
  readonly name: string;
  readonly isLocal: boolean;
  // Millisecondes depuis l'époque : `Date.now()`, posé par l'appelant.
  readonly at: number;
};

export const REACTION_BURST = 10;
export const REACTION_WINDOW_MS = 1_000;
export const REACTION_LIFETIME_MS = 3_000;
export const REACTION_MAX_VISIBLE = 6;

// Le JSON exact que meet attend sur le canal sans topic. `<valeur>` est la
// chaîne ReactionKey elle-même : les huit valeurs de meet SONT les noms
// courts Unicode (§5.C9 de la conception).
export function encodeReaction(key: ReactionKey): string {
  return JSON.stringify({ type: 'reactionReceived', data: { emoji: key } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isReactionKey(value: unknown): value is ReactionKey {
  return typeof value === 'string' && REACTION_KEYS.some((candidate) => candidate === value);
}

// Rend `null` pour tout ce qui n'est pas une réaction connue — un autre type,
// un emoji hors liste, un JSON invalide, une valeur qui n'est pas un objet.
// C'est OBLIGATOIRE, pas une omission : le canal sans topic transporte toute
// la famille `NotificationType` de meet (participantMuted, roleChanged,
// screenRecordingStarted, …, §2.3), et cette fonction ne jette jamais.
export function parseReaction(json: string): ReactionKey | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isRecord(value)) return null;
  if (value.type !== 'reactionReceived') return null;
  if (!isRecord(value.data)) return null;

  return isReactionKey(value.data.emoji) ? value.data.emoji : null;
}

// Fenêtre glissante. Une entrée compte contre le budget tant que
// `now - entrée < REACTION_WINDOW_MS` : à la borne exacte, elle est déjà
// hors fenêtre. Rend la décision ET la fenêtre mise à jour — un limiteur qui
// muterait un tableau ne serait pas testable en table.
//
// Un appel REFUSÉ ne grossit pas la liste : seul un appel accepté y ajoute
// `now`. Sans cette règle, une rafale de cinquante appuis en une seconde ne
// libérerait jamais de budget tant qu'elle continue.
export function admitSend(
  recent: readonly number[],
  now: number,
): { readonly allowed: boolean; readonly recent: readonly number[] } {
  const kept = recent.filter((sentAt) => now - sentAt < REACTION_WINDOW_MS);
  if (kept.length >= REACTION_BURST) return { allowed: false, recent: kept };
  return { allowed: true, recent: [...kept, now] };
}

// Ajoute à la fin, et plafonne à REACTION_MAX_VISIBLE en retirant la plus
// ancienne. La conception donne le plafond (§6.4) mais pas qui l'applique :
// c'est ICI, au seul point où la liste grandit — pas dans `ReactionOverlay`,
// qui pose ce qu'on lui donne sans rien décider (voir tâche 5).
export function appendReaction(
  list: readonly Reaction[],
  next: Reaction,
): readonly Reaction[] {
  const appended = [...list, next];
  return appended.length > REACTION_MAX_VISIBLE
    ? appended.slice(appended.length - REACTION_MAX_VISIBLE)
    : appended;
}

// Efface une réaction dont l'âge atteint sa durée de vie. À la borne exacte
// (`now - reaction.at === REACTION_LIFETIME_MS`), elle est déjà effacée.
export function pruneReactions(
  list: readonly Reaction[],
  now: number,
): readonly Reaction[] {
  return list.filter((reaction) => now - reaction.at < REACTION_LIFETIME_MS);
}
```

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/call/reactions.spec.ts
npx tsc --noEmit
```

23 tests verts (5 `REACTION_KEYS`+`reactionGlyph`+`encodeReaction` confondus, 8 `parseReaction`, 3
`admitSend`, 2 `appendReaction`, 3 `pruneReactions`). `tsc` propre : cette tâche est **autonome**,
aucune autre ne la précède.

- [ ] **Step 4 : committer**

`feat(call): Encode, decode and rate-limit reactions`

- [ ] **Step 5 : éprouver par mutation**

Sur le commit qui vient d'être créé. Chaque ligne : mutation → test qui doit rougir →
`git checkout -- src/call/reactions.ts` avant la suivante.

1. `if (value.type !== 'reactionReceived') return null;` → supprimer la ligne — rougit
   `'rejette un type autre que reactionReceived'`.
2. `return isReactionKey(value.data.emoji) ? value.data.emoji : null;` →
   `return value.data.emoji as ReactionKey;` — rougit `'rejette un emoji hors liste'`.
3. `const kept = recent.filter((sentAt) => now - sentAt < REACTION_WINDOW_MS);` →
   `const kept = recent;` — rougit `'autorise de nouveau une fois la fenêtre entièrement
   écoulée'`.
4. `if (kept.length >= REACTION_BURST) return { allowed: false, recent: kept };` →
   `if (kept.length > REACTION_BURST) return { allowed: false, recent: kept };` — rougit
   `'refuse le onzième appel dans la même fenêtre'` (le onzième serait accepté).
5. `return appended.length > REACTION_MAX_VISIBLE ? appended.slice(...) : appended;` →
   `return appended;` (jamais de plafond) — rougit `'plafonne à REACTION_MAX_VISIBLE...'`.
6. `appended.slice(appended.length - REACTION_MAX_VISIBLE)` →
   `appended.slice(0, REACTION_MAX_VISIBLE)` (garde les plus anciennes au lieu des plus
   récentes) — rougit la même assertion, sur `'r-new'` absent du résultat.
7. `list.filter((reaction) => now - reaction.at < REACTION_LIFETIME_MS)` →
   `list.filter((reaction) => now - reaction.at <= REACTION_LIFETIME_MS)` — rougit
   `'efface une réaction à exactement sa durée de vie'`.

---

### Task 2 : le magasin branché — canal de données et publication

**Files:**
- Create: `src/call/reactionStore.ts`
- Test: `src/call/reactionStore.spec.ts`

**Interfaces:**
- Consumes :
  - `type Reaction`, `type ReactionKey`, `admitSend`, `appendReaction`, `pruneReactions`,
    `encodeReaction`, `parseReaction` de `src/call/reactions` (tâche 1, déjà committée)
  - `RoomEvent` (valeur), `type Room`, `type RemoteParticipant` de `livekit-client` — voir Socle
    technique pour les signatures vérifiées
- Produces :
  - `const REACTION_PRUNE_INTERVAL_MS = 250`
  - `type ReactionStore = { readonly subscribe: (onChange: () => void) => () => void;
    readonly getSnapshot: () => readonly Reaction[]; readonly send: (key: ReactionKey) =>
    Promise<boolean>; readonly dispose: () => void }`
  - `function createReactionStore(room: Room): ReactionStore`

**Différence structurelle avec `createRoomViewStore`/`createRecordingStore`** : ces deux-là
n'ont ni `send`, ni `dispose` — leur seul effet de bord (l'écoute d'événements `Room`) est géré
par le ref-compte de `subscribe`/`unsubscribe`, et rien ne les distingue d'un simple calcul
dérivé. `ReactionStore` porte un état propre (la liste de réactions, la fenêtre de débit) qui ne
doit **pas** être perdu si React jette et reconstruit le magasin — d'où `useState`, pas `useMemo`,
à l'appel (tâche 7, même motif que `call.tsx:157-159` déjà écrit pour `session`). L'abonnement à
`RoomEvent.DataReceived` est donc posé **à la construction**, pas au premier `subscribe()`, et
seul `dispose()` le retire.

**Le canal sans topic transporte toute la famille `NotificationType` de meet** (§2.3) :
`parseReaction` rend `null` pour tout ce qui n'est pas une réaction connue, et ce cas est ignoré
**silencieusement** — aucune notification, aucun changement de snapshot.

**`participant` est facultatif dans la signature du SDK** (voir Socle technique) ; sans lui, il
n'y a aucune identité à attribuer, et `Reaction.identity` n'est pas optionnel. Le paquet est
alors ignoré, au même titre qu'un JSON invalide — ce n'est pas un cas que la conception nomme
explicitement, mais c'est la seule lecture cohérente avec un type `Reaction.identity: string` non
nul.

**Le nom se résout par `room.getParticipantByIdentity(...)`, jamais par `participant.name`
directement** (§6.5, même patron que `chatStore`, non livré ici) : même si l'argument de
l'événement porte déjà un nom, passer par la `Room` est la même résolution uniforme que le chat
utilisera, et elle reste correcte même si `participant` portait un nom périmé.

**`send()` ne rejette jamais** — même contrat que `CallSession.connect` (`src/call/connection.ts`)
: `false` veut dire « la limite de débit a refusé » **ou** « `publishData` a rejeté ». Le store ne
distingue pas ces deux raisons dans sa valeur de retour. **Ce point n'est pas neutre** : voir la
tâche 7 et l'auto-relecture pour ce que cela implique côté écran, et le signalement qui en
découle.

**`dispose()` retire le gestionnaire et arrête l'intervalle de purge**, s'il tourne. Appelé
depuis le même nettoyage d'effet que `session.dispose()` dans `call.tsx` (tâche 7), **avant** lui.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/call/reactionStore.spec.ts`, en entier :

```ts
import { RoomEvent } from 'livekit-client';
import type { RemoteParticipant, Room } from 'livekit-client';

import { createReactionStore, REACTION_PRUNE_INTERVAL_MS } from 'src/call/reactionStore';
import { encodeReaction, REACTION_BURST } from 'src/call/reactions';

type Handler = (...args: unknown[]) => void;

// Un double de `Room` qui enregistre réellement ses gestionnaires par nom
// d'événement — même convention que le `RoomProbe` de
// `src/call/recordingStore.spec.ts` — étendu d'un registre d'identités pour
// `getParticipantByIdentity` et d'un `publishData` espionnable.
type RoomProbe = {
  readonly room: Room;
  readonly publishData: jest.Mock;
  readonly subscribedEvents: () => string[];
  readonly handlerCount: (event: string) => number;
  readonly emitData: (json: string, participant?: RemoteParticipant) => void;
  readonly registerParticipant: (identity: string, name: string) => void;
};

function participant(identity: string, name: string): RemoteParticipant {
  return { identity, name } as unknown as RemoteParticipant;
}

function fakeRoom(localIdentity: string, localName: string): RoomProbe {
  const handlers = new Map<string, Handler[]>();
  const publishData = jest.fn().mockResolvedValue(undefined);
  const registry = new Map<string, RemoteParticipant>();

  const room = {
    localParticipant: { identity: localIdentity, name: localName, publishData },
    getParticipantByIdentity: (identity: string) => registry.get(identity),
    on(event: string, handler: Handler): unknown {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return room;
    },
    off(event: string, handler: Handler): unknown {
      const attached = handlers.get(event) ?? [];
      const index = attached.indexOf(handler);
      if (index !== -1) attached.splice(index, 1);
      if (attached.length === 0) handlers.delete(event);
      return room;
    },
  };

  return {
    room: room as unknown as Room,
    publishData,
    subscribedEvents: () => Array.from(handlers.keys()).sort(),
    handlerCount: (event: string) => (handlers.get(event) ?? []).length,
    emitData: (json: string, who?: RemoteParticipant) => {
      const bytes = new TextEncoder().encode(json);
      for (const handler of Array.from(handlers.get(RoomEvent.DataReceived) ?? [])) {
        handler(bytes, who);
      }
    },
    registerParticipant: (identity: string, name: string) => {
      registry.set(identity, participant(identity, name));
    },
  };
}

describe('createReactionStore', () => {
  it("s'abonne à DataReceived dès sa construction", () => {
    const probe = fakeRoom('me', 'Me');
    createReactionStore(probe.room);

    expect(probe.subscribedEvents()).toEqual([RoomEvent.DataReceived]);
  });

  it('rend la même référence tant que rien ne bouge', () => {
    const store = createReactionStore(fakeRoom('me', 'Me').room);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('ignore un paquet dont le JSON est invalide, sans notifier', () => {
    const probe = fakeRoom('me', 'Me');
    const store = createReactionStore(probe.room);
    const onChange = jest.fn();
    store.subscribe(onChange);

    probe.emitData('{not json', participant('u-ada', 'Ada'));

    expect(store.getSnapshot()).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignore un type de paquet qui n'est pas une réaction, sans notifier", () => {
    const probe = fakeRoom('me', 'Me');
    const store = createReactionStore(probe.room);
    const onChange = jest.fn();
    store.subscribe(onChange);

    probe.emitData(
      JSON.stringify({ type: 'participantMuted', data: {} }),
      participant('u-ada', 'Ada'),
    );

    expect(store.getSnapshot()).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignore un paquet sans participant, faute d'identité à lui attribuer", () => {
    const probe = fakeRoom('me', 'Me');
    const store = createReactionStore(probe.room);

    probe.emitData(encodeReaction('thumbs-up'), undefined);

    expect(store.getSnapshot()).toEqual([]);
  });

  it('reçoit une réaction et résout le nom par getParticipantByIdentity, jamais par l’argument', () => {
    const probe = fakeRoom('me', 'Me');
    probe.registerParticipant('u-ada', 'Ada');
    const store = createReactionStore(probe.room);
    const onChange = jest.fn();
    store.subscribe(onChange);

    // Le nom porté par l'argument de l'événement est délibérément DIFFÉRENT
    // de celui enregistré dans la Room : si le store lisait `participant.name`
    // directement, ce test verrait "stale-name", pas "Ada".
    probe.emitData(encodeReaction('red-heart'), participant('u-ada', 'stale-name'));

    expect(store.getSnapshot()).toEqual([
      expect.objectContaining({
        key: 'red-heart',
        identity: 'u-ada',
        name: 'Ada',
        isLocal: false,
      }),
    ]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("replie sur une chaîne vide quand la Room ne connaît plus l'émetteur", () => {
    const probe = fakeRoom('me', 'Me');
    const store = createReactionStore(probe.room);

    probe.emitData(encodeReaction('thumbs-up'), participant('u-ghost', 'Ghost'));

    expect(store.getSnapshot()[0]?.name).toBe('');
  });

  describe('send', () => {
    it('publie sur le canal sans topic, en fiable', async () => {
      const probe = fakeRoom('me', 'Me');
      const store = createReactionStore(probe.room);

      await store.send('thumbs-up');

      expect(probe.publishData).toHaveBeenCalledTimes(1);
      const [bytes, options] = probe.publishData.mock.calls[0] as [
        Uint8Array,
        { reliable: boolean; topic?: string },
      ];
      expect(new TextDecoder().decode(bytes)).toBe(encodeReaction('thumbs-up'));
      expect(options).toEqual({ reliable: true });
    });

    it('pose son écho local seulement après la résolution de publishData', async () => {
      const probe = fakeRoom('me', 'Me');
      const store = createReactionStore(probe.room);

      const sent = await store.send('party-popper');

      expect(sent).toBe(true);
      expect(store.getSnapshot()).toEqual([
        expect.objectContaining({ key: 'party-popper', identity: 'me', isLocal: true }),
      ]);
    });

    it('ne pose aucun écho quand publishData rejette, et rend false', async () => {
      const probe = fakeRoom('me', 'Me');
      probe.publishData.mockRejectedValueOnce(new Error('offline'));
      const store = createReactionStore(probe.room);

      const sent = await store.send('thumbs-up');

      expect(sent).toBe(false);
      expect(store.getSnapshot()).toEqual([]);
    });

    it('refuse le onzième envoi dans la même seconde, sans appeler publishData', async () => {
      const probe = fakeRoom('me', 'Me');
      const store = createReactionStore(probe.room);

      for (let i = 0; i < REACTION_BURST; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        expect(await store.send('thumbs-up')).toBe(true);
      }
      probe.publishData.mockClear();

      expect(await store.send('thumbs-up')).toBe(false);
      expect(probe.publishData).not.toHaveBeenCalled();
    });
  });

  describe('purge automatique', () => {
    afterEach(() => jest.useRealTimers());

    it('efface une réaction après sa durée de vie et arrête son intervalle', async () => {
      jest.useFakeTimers();
      const probe = fakeRoom('me', 'Me');
      const store = createReactionStore(probe.room);
      await store.send('thumbs-up');
      expect(store.getSnapshot()).toHaveLength(1);

      jest.advanceTimersByTime(3000);

      expect(store.getSnapshot()).toHaveLength(0);
      expect(jest.getTimerCount()).toBe(0);
    });

    it("ne lance l'intervalle qu'une fois une réaction présente", async () => {
      jest.useFakeTimers();
      const probe = fakeRoom('me', 'Me');
      createReactionStore(probe.room);

      expect(jest.getTimerCount()).toBe(0);

      const store = createReactionStore(probe.room);
      await store.send('thumbs-up');

      expect(jest.getTimerCount()).toBeGreaterThan(0);
    });
  });

  describe('dispose', () => {
    it('détache exactement le gestionnaire attaché à la construction', () => {
      const probe = fakeRoom('me', 'Me');
      const store = createReactionStore(probe.room);
      expect(probe.handlerCount(RoomEvent.DataReceived)).toBe(1);

      store.dispose();

      expect(probe.handlerCount(RoomEvent.DataReceived)).toBe(0);
    });

    it("arrête l'intervalle de purge en cours", async () => {
      jest.useFakeTimers();
      const probe = fakeRoom('me', 'Me');
      const store = createReactionStore(probe.room);
      await store.send('thumbs-up');
      expect(jest.getTimerCount()).toBe(1);

      store.dispose();

      expect(jest.getTimerCount()).toBe(0);
      jest.useRealTimers();
    });
  });
});
```

`{ identity, name } as unknown as RemoteParticipant` : double assertion, couverte par l'exemption
`AGENTS.md` des fichiers `*.spec.*` — même idiome que `src/call/participants.spec.ts:22-31` (C1).

- [ ] **Step 2 : écrire le module**

`src/call/reactionStore.ts`, en entier :

```ts
import { RoomEvent } from 'livekit-client';
import type { RemoteParticipant, Room } from 'livekit-client';

import {
  admitSend,
  appendReaction,
  encodeReaction,
  parseReaction,
  pruneReactions,
  type Reaction,
  type ReactionKey,
} from 'src/call/reactions';

// Purge au tic, pas en continu : 3 000 ms de durée de vie sur douze tics
// laisse une bulle disparaître dans le quart de seconde qui suit sa
// péremption, pour un coût négligeable. L'intervalle ne tourne que pendant
// qu'il y a quelque chose à effacer (voir `schedulePurge` ci-dessous) :
// une séance sans réaction ne réveille jamais le moteur JS pour rien.
export const REACTION_PRUNE_INTERVAL_MS = 250;

// Le contrat de `useSyncExternalStore` : `getSnapshot()` rend la MÊME
// référence tant que rien n'a bougé.
export type ReactionStore = {
  readonly subscribe: (onChange: () => void) => () => void;
  readonly getSnapshot: () => readonly Reaction[];
  // Ne rejette jamais — même contrat que `CallSession.connect`
  // (`src/call/connection.ts`). `false` = la limite de débit a refusé, ou la
  // publication a échoué ; l'écho local n'est posé que sur `true`. Le store ne
  // distingue pas les deux raisons dans sa valeur de retour — voir `call.tsx`
  // (tâche 7) pour ce que cela implique côté affichage.
  readonly send: (key: ReactionKey) => Promise<boolean>;
  readonly dispose: () => void;
};

export function createReactionStore(room: Room): ReactionStore {
  const listeners = new Set<() => void>();
  let reactions: readonly Reaction[] = [];
  let recent: readonly number[] = [];
  let counter = 0;
  let pruneTimer: ReturnType<typeof setInterval> | null = null;

  function notify(): void {
    // Copie de la liste : un abonné qui se désabonne en recevant l'avis ne
    // doit pas changer qui reçoit CET avis-là. Même précaution que
    // `createRoomViewStore`/`createRecordingStore`.
    for (const listener of Array.from(listeners)) listener();
  }

  function schedulePurge(): void {
    if (pruneTimer !== null) return;
    pruneTimer = setInterval(() => {
      reactions = pruneReactions(reactions, Date.now());
      if (reactions.length === 0 && pruneTimer !== null) {
        clearInterval(pruneTimer);
        pruneTimer = null;
      }
      notify();
    }, REACTION_PRUNE_INTERVAL_MS);
  }

  // Le canal sans topic transporte toute la famille `NotificationType` de
  // meet (participantMuted, roleChanged, screenRecordingStarted, …, §2.3) :
  // `parseReaction` rend `null` pour tout ce qui n'est pas une réaction
  // connue, et ce cas est ignoré silencieusement — c'est obligatoire, pas une
  // omission.
  //
  // `participant` est facultatif dans la signature du SDK ; sans lui il n'y a
  // aucune identité à attribuer, et `Reaction.identity` n'est pas optionnel.
  // Le paquet est alors ignoré, au même titre qu'un JSON invalide.
  function handleData(payload: Uint8Array, participant?: RemoteParticipant): void {
    if (participant === undefined) return;
    const key = parseReaction(new TextDecoder().decode(payload));
    if (key === null) return;

    // Résolu via la Room, jamais via `participant.name` directement : même
    // patron de résolution que le chat (non livré ici), qui n'a lui aucun
    // accès direct au nom.
    const name = room.getParticipantByIdentity(participant.identity)?.name ?? '';
    counter += 1;
    reactions = appendReaction(reactions, {
      id: `${participant.identity}#${counter}`,
      key,
      identity: participant.identity,
      name,
      isLocal: false,
      at: Date.now(),
    });
    schedulePurge();
    notify();
  }

  room.on(RoomEvent.DataReceived, handleData);

  return {
    subscribe(onChange: () => void): () => void {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },

    getSnapshot(): readonly Reaction[] {
      return reactions;
    },

    async send(key: ReactionKey): Promise<boolean> {
      const admission = admitSend(recent, Date.now());
      recent = admission.recent;
      if (!admission.allowed) return false;

      try {
        await room.localParticipant.publishData(
          new TextEncoder().encode(encodeReaction(key)),
          { reliable: true },
        );
      } catch {
        return false;
      }

      counter += 1;
      reactions = appendReaction(reactions, {
        id: `${room.localParticipant.identity}#${counter}`,
        key,
        identity: room.localParticipant.identity,
        name: room.localParticipant.name ?? '',
        isLocal: true,
        at: Date.now(),
      });
      schedulePurge();
      notify();
      return true;
    },

    dispose(): void {
      room.off(RoomEvent.DataReceived, handleData);
      if (pruneTimer !== null) {
        clearInterval(pruneTimer);
        pruneTimer = null;
      }
      listeners.clear();
    },
  };
}
```

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/call/reactionStore.spec.ts
npx tsc --noEmit
```

15 tests verts. `tsc` propre — cette tâche ne dépend que de la tâche 1, déjà committée.

- [ ] **Step 4 : committer**

`feat(call): Publish and receive reactions over the data channel`

- [ ] **Step 5 : éprouver par mutation**

Sur le commit qui vient d'être créé, `git checkout -- src/call/reactionStore.ts` entre chaque.

1. `if (participant === undefined) return;` → supprimer la ligne — rougit `'ignore un paquet sans
   participant...'` (lève sur `participant.identity` de `undefined`, ou produit une réaction
   `identity: undefined` selon la mutation exacte ; les deux rougissent le test).
2. `const name = room.getParticipantByIdentity(participant.identity)?.name ?? '';` →
   `const name = participant.name ?? '';` — rougit `'reçoit une réaction et résout le nom par
   getParticipantByIdentity...'` (rendrait `"stale-name"` au lieu de `"Ada"`).
3. `if (pruneTimer !== null) return;` (dans `schedulePurge`) → supprimer la ligne — rougit
   `'efface une réaction après sa durée de vie et arrête son intervalle'` (`getTimerCount()`
   resterait à 2 au lieu de 0, un second intervalle ayant été armé par le second appel de
   `schedulePurge` dans le même tic).
4. `if (reactions.length === 0 && pruneTimer !== null) { clearInterval(...); }` → supprimer le
   bloc — rougit la même assertion (`getTimerCount()` resterait à 1).
5. dans `send`, `if (!admission.allowed) return false;` → supprimer la ligne — rougit `'refuse le
   onzième envoi...'` (`publishData` serait appelé un onzième coup).
6. `reactions = appendReaction(reactions, {...})` (dans `send`, après l'`await`) → le déplacer
   **avant** l'`await room.localParticipant.publishData(...)` — rougit `'ne pose aucun écho quand
   publishData rejette...'`.
7. `room.off(RoomEvent.DataReceived, handleData);` → supprimer la ligne — rougit `'détache
   exactement le gestionnaire attaché à la construction'`.

---

### Task 3 : les onze clés, dans les sept locales

**Files:**
- Modify: `src/i18n/locales/en.json`, `src/i18n/locales/fr.json`, `src/i18n/locales/es.json`,
  `src/i18n/locales/it.json`, `src/i18n/locales/de.json`, `src/i18n/locales/vi.json`,
  `src/i18n/locales/ru.json`

**Interfaces:**
- Consumes : rien en TypeScript. `src/i18n/index.spec.ts` compare les jeux de clés des sept
  fichiers entre eux (`Object.keys(en).sort()` contre chacun des six autres) — aucune dépendance
  de code.
- Produces : 11 clés × 7 locales = 77 entrées.

Table complète, valeur `en` de référence (§6.11 de la conception, verbatim) :

| Clé | Rôle | Valeur `en` |
|---|---|---|
| `call.reactions` | titre de section, dans le menu | Reactions |
| `call.you` | émetteur d'une bulle locale | You |
| `call.reactionFailed` | `Snackbar` — **ajoutée, non câblée** : voir tâche 7 et l'auto-relecture | Reaction not sent |
| `reaction.thumbsUp` | accessibilité, 👍 | Thumbs up |
| `reaction.thumbsDown` | accessibilité, 👎 | Thumbs down |
| `reaction.clap` | accessibilité, 👏 | Clap |
| `reaction.heart` | accessibilité, ❤️ | Heart |
| `reaction.laughing` | accessibilité, 😂 | Laughing |
| `reaction.surprised` | accessibilité, 😮 | Surprised |
| `reaction.celebration` | accessibilité, 🎉 | Celebration |
| `reaction.please` | accessibilité, 🙏 | Please |

`call.unnamedParticipant` (déjà présent, C1) sert de repli pour un nom vide, réutilisé par
`ReactionOverlay` (tâche 5). Aucune clé n'est retirée.

**Registre par locale** — repris de chaque fichier existant (main levée, C1), pour la forme
utilisée pour « votre » : `es` formel (« Su mano »), `de` formel (« Ihre Hand »), `it` informel
(« la tua mano »), `ru` formel (« Ваша рука »), `fr` formel (« Votre main »). `call.you` suit la
même forme dans chaque fichier.

- [ ] **Step 1 : ajouter les 11 clés à `en.json`**

Après `"call.handFailed": "Could not change your hand",` (ligne 61), avant
`"participants.title"` :

```json
  "call.reactions": "Reactions",
  "call.you": "You",
  "call.reactionFailed": "Reaction not sent",
  "reaction.thumbsUp": "Thumbs up",
  "reaction.thumbsDown": "Thumbs down",
  "reaction.clap": "Clap",
  "reaction.heart": "Heart",
  "reaction.laughing": "Laughing",
  "reaction.surprised": "Surprised",
  "reaction.celebration": "Celebration",
  "reaction.please": "Please",
```

- [ ] **Step 2 : `fr.json`** (formel, « vous »), même point d'insertion

```json
  "call.reactions": "Réactions",
  "call.you": "Vous",
  "call.reactionFailed": "Réaction non envoyée",
  "reaction.thumbsUp": "Pouce levé",
  "reaction.thumbsDown": "Pouce baissé",
  "reaction.clap": "Applaudissements",
  "reaction.heart": "Cœur",
  "reaction.laughing": "Rire",
  "reaction.surprised": "Surprise",
  "reaction.celebration": "Célébration",
  "reaction.please": "S'il vous plaît",
```

- [ ] **Step 3 : `es.json`** (formel, « usted »)

```json
  "call.reactions": "Reacciones",
  "call.you": "Usted",
  "call.reactionFailed": "No se pudo enviar la reacción",
  "reaction.thumbsUp": "Pulgar arriba",
  "reaction.thumbsDown": "Pulgar abajo",
  "reaction.clap": "Aplausos",
  "reaction.heart": "Corazón",
  "reaction.laughing": "Risa",
  "reaction.surprised": "Sorpresa",
  "reaction.celebration": "Celebración",
  "reaction.please": "Por favor",
```

- [ ] **Step 4 : `it.json`** (informel, « tu »)

```json
  "call.reactions": "Reazioni",
  "call.you": "Tu",
  "call.reactionFailed": "Reazione non inviata",
  "reaction.thumbsUp": "Pollice in su",
  "reaction.thumbsDown": "Pollice in giù",
  "reaction.clap": "Applausi",
  "reaction.heart": "Cuore",
  "reaction.laughing": "Risata",
  "reaction.surprised": "Sorpresa",
  "reaction.celebration": "Celebrazione",
  "reaction.please": "Per favore",
```

- [ ] **Step 5 : `de.json`** (formel, « Sie »)

```json
  "call.reactions": "Reaktionen",
  "call.you": "Sie",
  "call.reactionFailed": "Reaktion nicht gesendet",
  "reaction.thumbsUp": "Daumen hoch",
  "reaction.thumbsDown": "Daumen runter",
  "reaction.clap": "Applaus",
  "reaction.heart": "Herz",
  "reaction.laughing": "Lachen",
  "reaction.surprised": "Überraschung",
  "reaction.celebration": "Feier",
  "reaction.please": "Bitte",
```

- [ ] **Step 6 : `vi.json`**

```json
  "call.reactions": "Biểu cảm",
  "call.you": "Bạn",
  "call.reactionFailed": "Không thể gửi biểu cảm",
  "reaction.thumbsUp": "Giơ ngón tay cái",
  "reaction.thumbsDown": "Ngón tay cái chỉ xuống",
  "reaction.clap": "Vỗ tay",
  "reaction.heart": "Trái tim",
  "reaction.laughing": "Cười",
  "reaction.surprised": "Ngạc nhiên",
  "reaction.celebration": "Ăn mừng",
  "reaction.please": "Làm ơn",
```

- [ ] **Step 7 : `ru.json`** (formel, « Вы »)

```json
  "call.reactions": "Реакции",
  "call.you": "Вы",
  "call.reactionFailed": "Не удалось отправить реакцию",
  "reaction.thumbsUp": "Палец вверх",
  "reaction.thumbsDown": "Палец вниз",
  "reaction.clap": "Аплодисменты",
  "reaction.heart": "Сердце",
  "reaction.laughing": "Смех",
  "reaction.surprised": "Удивление",
  "reaction.celebration": "Праздник",
  "reaction.please": "Пожалуйста",
```

- [ ] **Step 8 : lancer et vérifier**

```
npx jest src/i18n/index.spec.ts
npx tsc --noEmit
npx prettier --check src/i18n/locales
```

- [ ] **Step 9 : committer**

`feat(i18n): Add the reaction keys`

- [ ] **Step 10 : éprouver par mutation**

`git checkout -- src/i18n/locales/<fichier>.json` entre chaque.

1. Retirer `"reaction.please"` de `de.json` seulement — rougit
   `'ne laisse aucune clé manquante dans une locale'` (`src/i18n/index.spec.ts`), sur `de`.
2. Ajouter une clé `"reaction.extra": "x"` à `es.json` seulement (une clé EN TROP, pas manquante)
   — rougit la même assertion, cette fois sur `es` (le jeu de clés ne correspond plus à la
   référence dans les deux sens : `toEqual` compare des tableaux triés, un de plus fait échouer
   autant qu'un de moins).

---

### Task 4 : la coquille d'émission — huit cibles dans le menu

**Files:**
- Create: `src/screens/room/reactionPicker.tsx`
- Test: `src/screens/room/reactionPicker.spec.tsx`

**Interfaces:**
- Consumes :
  - `type ReactionKey`, `REACTION_KEYS`, `reactionGlyph` de `src/call/reactions` (tâche 1)
  - `BAR_RIPPLE_COLOR`, `barStyles` de `src/screens/room/controlBar` — **existants, non
    modifiés**
  - `tokens` de `src/ui/tokens` — existant, non modifié
- Produces :
  - `type ReactionPickerProps = { readonly onSend: (key: ReactionKey) => void }`
  - `function ReactionPicker(props: ReactionPickerProps): React.ReactElement`

**Pas de `Menu.Item`.** `HandControl` (C1) utilise un `Menu.Item` parce que lever la main est
**une** commande. Ici, huit cibles doivent tenir en grille, et surtout : **on peut envoyer
plusieurs réactions de suite** (§5.C8) — un `Menu.Item` refermerait le menu au premier appui, ce
qui est exactement ce qu'il ne faut pas. `TouchableRipple` (`react-native-paper`, déjà une
dépendance) est le bon niveau : un `Pressable` avec ondulation Material, sans le comportement
« ligne de menu » qu'apporterait `Menu.Item`.

**Largeur explicite, motivée.** Le contenu d'un `Menu` de Paper est intrinsèque (mesuré par le
périmètre C1 lui-même, dans son analyse de `audioOutputControl.tsx`) : sans largeur posée, huit
cibles de 44 dp s'aligneraient sur une seule rangée dès qu'un écran est assez large, au lieu des
quatre par rangée voulues (§5.C8). `4 × 44 + 3 × 8 = 200` dp fait tenir exactement quatre ; un
cinquième en demanderait `5 × 44 + 4 × 8 = 252`, hors des 200 dp posés.

**Aucune couleur sur le glyphe**, et c'est nommé dans le code : un emoji Unicode pleine couleur
ignore la prop `color`. La doctrine de contraste d'`AGENTS.md` porte sur du texte qui *retomberait*
sur une couleur de thème sans intervention — un glyphe emoji ne retombe sur rien de tel.

**La correspondance `ReactionKey` → clé i18n d'accessibilité est ici, pas dans
`src/call/reactions.ts`.** C'est un choix de présentation (quel libellé accessible porter),
distinct de la décision pure que `reactionGlyph` porte (quel glyphe afficher) — voir
l'auto-relecture pour le motif complet de cette séparation.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/screens/room/reactionPicker.spec.tsx`, en entier :

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { tokens } from 'src/ui/tokens';
import { ReactionPicker } from './reactionPicker';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe('ReactionPicker', () => {
  it('affiche les huit cibles', async () => {
    await render(<ReactionPicker onSend={jest.fn()} />);

    expect(screen.getByTestId('reaction-thumbs-up')).toBeTruthy();
    expect(screen.getByTestId('reaction-thumbs-down')).toBeTruthy();
    expect(screen.getByTestId('reaction-clapping-hands')).toBeTruthy();
    expect(screen.getByTestId('reaction-red-heart')).toBeTruthy();
    expect(screen.getByTestId('reaction-face-with-tears-of-joy')).toBeTruthy();
    expect(screen.getByTestId('reaction-face-with-open-mouth')).toBeTruthy();
    expect(screen.getByTestId('reaction-party-popper')).toBeTruthy();
    expect(screen.getByTestId('reaction-folded-hands')).toBeTruthy();
  });

  it('envoie la clé pressée, et seulement celle-là', async () => {
    const onSend = jest.fn();
    await render(<ReactionPicker onSend={onSend} />);

    await fireEvent.press(screen.getByTestId('reaction-red-heart'));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('red-heart');

    // Une seconde cible, distincte : sans elle, un rappel qui enverrait
    // toujours 'red-heart' passerait le premier appui aussi.
    await fireEvent.press(screen.getByTestId('reaction-party-popper'));

    expect(onSend).toHaveBeenCalledWith('party-popper');
  });

  it('porte un accessibilityLabel distinct par bouton', async () => {
    await render(<ReactionPicker onSend={jest.fn()} />);

    expect(screen.getByTestId('reaction-thumbs-up').props.accessibilityLabel).toBe(
      'reaction.thumbsUp',
    );
    // La dernière de la table, distincte de la première : sans elle, une
    // fonction qui rendrait toujours la même clé passerait le test ci-dessus.
    expect(screen.getByTestId('reaction-folded-hands').props.accessibilityLabel).toBe(
      'reaction.please',
    );
  });

  it('porte une couleur explicite sur son titre de section', async () => {
    await render(<ReactionPicker onSend={jest.fn()} />);

    expect(screen.getByTestId('reaction-picker-title')).toHaveStyle({
      color: tokens.color.textDark,
    });
  });

  it('cible quatre boutons par rangée avec une largeur explicite', async () => {
    await render(<ReactionPicker onSend={jest.fn()} />);

    expect(screen.getByTestId('reaction-grid')).toHaveStyle({ width: 200 });
  });
});
```

- [ ] **Step 2 : écrire le composant**

`src/screens/room/reactionPicker.tsx`, en entier :

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableRipple } from 'react-native-paper';

import { reactionGlyph, REACTION_KEYS, type ReactionKey } from 'src/call/reactions';
import { BAR_RIPPLE_COLOR, barStyles } from 'src/screens/room/controlBar';
import { tokens } from 'src/ui/tokens';

// Traduit chaque valeur du fil vers sa clé i18n d'accessibilité. Mécanique,
// comme la table de `reactionGlyph` — mais c'est un choix de PRÉSENTATION
// (quel libellé accessible porter), pas une décision sur la donnée (quel
// glyphe afficher) : elle vit ici, jamais dans `src/call/reactions.ts`, qui
// n'exporte que ce que la conception liste (§6.4).
const REACTION_LABEL_KEYS: Readonly<Record<ReactionKey, string>> = {
  'thumbs-up': 'reaction.thumbsUp',
  'thumbs-down': 'reaction.thumbsDown',
  'clapping-hands': 'reaction.clap',
  'red-heart': 'reaction.heart',
  'face-with-tears-of-joy': 'reaction.laughing',
  'face-with-open-mouth': 'reaction.surprised',
  'party-popper': 'reaction.celebration',
  'folded-hands': 'reaction.please',
};

const styles = StyleSheet.create({
  // Largeur explicite : le contenu d'un `Menu` de Paper est intrinsèque —
  // sans elle, huit cibles s'aligneraient sur une seule rangée dès qu'un
  // écran est assez large. 4 × 44 + 3 × 8 = 200 : quatre par rangée, jamais
  // cinq (5 × 44 + 4 × 8 = 252, hors de ces 200 dp).
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 200, gap: tokens.spacing.sm },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Un emoji Unicode pleine couleur (Apple Color Emoji, Noto Color Emoji)
  // ignore la couleur de premier plan qu'on lui poserait : ce n'est donc pas
  // un oubli de la doctrine de contraste d'`AGENTS.md`, qui porte sur du
  // texte retombant sur une couleur de thème — un glyphe emoji ne retombe sur
  // rien de tel.
  glyph: { fontSize: 28 },
});

export type ReactionPickerProps = { readonly onSend: (key: ReactionKey) => void };

// Huit cibles de 44 dp, dans le menu « plus », jamais dans la barre — la
// barre est pleine (`controlBar.ts`, §4.1 de la conception). Pas de
// `Menu.Item` : on peut envoyer plusieurs réactions de suite, et un
// `Menu.Item` refermerait le menu au premier appui. C'est `MoreMenu` (tâche 6)
// qui décide de ne pas envelopper `onSend` d'un `setVisible(false)`, à
// l'inverse de ses trois voisines.
export function ReactionPicker({ onSend }: ReactionPickerProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <View>
      <Text testID="reaction-picker-title" variant="labelSmall" style={barStyles.menuNote}>
        {t('call.reactions')}
      </Text>
      <View testID="reaction-grid" style={styles.grid}>
        {REACTION_KEYS.map((key) => (
          <TouchableRipple
            key={key}
            testID={`reaction-${key}`}
            style={styles.button}
            borderless
            rippleColor={BAR_RIPPLE_COLOR}
            accessibilityLabel={t(REACTION_LABEL_KEYS[key])}
            onPress={() => onSend(key)}
          >
            <Text style={styles.glyph}>{reactionGlyph(key)}</Text>
          </TouchableRipple>
        ))}
      </View>
    </View>
  );
}
```

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/screens/room/reactionPicker.spec.tsx
npx tsc --noEmit
```

5 tests verts. `tsc` propre.

- [ ] **Step 4 : committer**

`feat(call): Offer eight reactions from the more menu`

- [ ] **Step 5 : éprouver par mutation**

`git checkout -- src/screens/room/reactionPicker.tsx` entre chaque.

1. `onPress={() => onSend(key)}` → `onPress={() => onSend('thumbs-up')}` — rougit `'envoie la clé
   pressée...'` (le second appui enverrait aussi `'thumbs-up'`).
2. `width: 200` → `width: 260` — rougit `'cible quatre boutons par rangée...'`.
3. `accessibilityLabel={t(REACTION_LABEL_KEYS[key])}` → `accessibilityLabel={t('reaction.thumbsUp')}`
   — rougit `'porte un accessibilityLabel distinct par bouton'` (sur `reaction-folded-hands`).
4. `style={barStyles.menuNote}` (sur le titre) → supprimer la prop — rougit `'porte une couleur
   explicite sur son titre de section'`.
5. `{REACTION_KEYS.map((key) => (...))}` → `{REACTION_KEYS.slice(0, 7).map((key) => (...))}` —
   rougit `'affiche les huit cibles'` (`reaction-folded-hands` absent).

---

### Task 5 : la coquille de réception — bulles sur la scène

**Files:**
- Create: `src/screens/room/reactionOverlay.tsx`
- Test: `src/screens/room/reactionOverlay.spec.tsx`

**Interfaces:**
- Consumes :
  - `type Reaction`, `reactionGlyph` de `src/call/reactions` (tâche 1)
  - `tokens` de `src/ui/tokens` — existant, non modifié
- Produces :
  - `type ReactionOverlayProps = { readonly reactions: readonly Reaction[] }`
  - `function ReactionOverlay(props: ReactionOverlayProps): React.ReactElement | null`

**Ne rend rien au repos** (`reactions.length === 0` → `null`), même patron que `HandBanner`/
`RecordingIndicator` (C1/D) : toujours montée dans `call.tsx`, jamais enveloppée d'une condition.

**Aucune animation** (§5.C12) : les bulles sont immobiles, la disparition est un démontage sec —
le plafond de six et la durée de vie de 3 s vivent dans `reactionStore` (tâche 2), cette coquille
pose la liste qu'on lui donne, rien de plus.

**`pointerEvents="none"` sur tout le conteneur** : la vue recouvre l'écran entier
(`position: 'absolute'`, quatre bords à 0) pour rester visible que la scène ou le panneau de
participants soit affiché — un appui doit traverser jusqu'à ce qu'il y a en dessous, sur toute sa
surface. Placée en dernier enfant de `styles.root` dans `call.tsx` (tâche 7), donc peinte
au-dessus de tout le reste de l'écran, bandeaux et barre de contrôle compris — une robustesse
contre un futur réglage de position, pas une nécessité aujourd'hui : `paddingBottom` la maintient
déjà au-dessus de la barre.

**Position exacte non spécifiée par la conception, choisie ici** : ancrée en bas à droite,
empilement vers le haut, la plus récente au plus près des commandes. C'est un choix raisonnable,
pas une mesure — voir l'auto-relecture.

**La surface de la bulle ET son texte portent tous deux une couleur explicite**, jamais l'un sans
l'autre (`AGENTS.md`) : `backgroundColor: tokens.color.surfaceDark` sur la bulle,
`color: tokens.color.textDark` sur le nom.

- [ ] **Step 1 : écrire les tests qui échouent**

`src/screens/room/reactionOverlay.spec.tsx`, en entier :

```tsx
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { Reaction } from 'src/call/reactions';
import { tokens } from 'src/ui/tokens';
import { ReactionOverlay } from './reactionOverlay';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function reaction(overrides: Partial<Reaction> = {}): Reaction {
  return {
    id: 'r-1',
    key: 'thumbs-up',
    identity: 'u-ada',
    name: 'Ada',
    isLocal: false,
    at: 0,
    ...overrides,
  };
}

describe('ReactionOverlay', () => {
  it('ne rend rien sans réaction', async () => {
    await render(<ReactionOverlay reactions={[]} />);

    expect(screen.queryByTestId('reaction-overlay')).toBe(null);
  });

  it('affiche une bulle par réaction, la seconde comprise', async () => {
    await render(
      <ReactionOverlay
        reactions={[
          reaction({ id: 'r-1', key: 'thumbs-up', name: 'Ada', isLocal: false }),
          reaction({ id: 'r-2', key: 'party-popper', name: 'Bob', isLocal: false }),
        ]}
      />,
    );

    expect(screen.getByTestId('reaction-bubble-r-1')).toBeTruthy();
    expect(screen.getByTestId('reaction-bubble-name-r-2')).toHaveTextContent('Bob');
  });

  it('étiquette sa propre bulle « You », jamais son nom', async () => {
    await render(
      <ReactionOverlay reactions={[reaction({ id: 'r-1', name: 'Ada', isLocal: true })]} />,
    );

    expect(screen.getByTestId('reaction-bubble-name-r-1')).toHaveTextContent('call.you');
  });

  it("replie sur le libellé d'anonyme un nom vide, à distance", async () => {
    await render(
      <ReactionOverlay reactions={[reaction({ id: 'r-1', name: '   ', isLocal: false })]} />,
    );

    expect(screen.getByTestId('reaction-bubble-name-r-1')).toHaveTextContent(
      'call.unnamedParticipant',
    );
  });

  it('porte une couleur explicite sur le nom, et un fond explicite sur la bulle', async () => {
    await render(<ReactionOverlay reactions={[reaction({ id: 'r-1' })]} />);

    expect(screen.getByTestId('reaction-bubble-name-r-1')).toHaveStyle({
      color: tokens.color.textDark,
    });
    expect(screen.getByTestId('reaction-bubble-r-1')).toHaveStyle({
      backgroundColor: tokens.color.surfaceDark,
    });
  });
});
```

- [ ] **Step 2 : écrire le composant**

`src/screens/room/reactionOverlay.tsx`, en entier :

```tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { reactionGlyph, type Reaction } from 'src/call/reactions';
import { tokens } from 'src/ui/tokens';

const styles = StyleSheet.create({
  // Recouvre l'écran entier, scène ou panneau : `pointerEvents="none"` laisse
  // tout appui traverser jusqu'à ce qu'il y a en dessous — aucune bulle n'est
  // pressable. Ancrée en bas à droite, au-dessus de la barre : position
  // choisie, pas mesurée (voir le plan).
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    padding: tokens.spacing.md,
    paddingBottom: tokens.spacing.xl,
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    backgroundColor: tokens.color.surfaceDark,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.xs,
    marginTop: tokens.spacing.xs,
  },
  glyph: { fontSize: 24 },
  // Cet écran force un fond sombre dans les deux schémas alors que le thème
  // Paper suit le schéma système : sans couleur explicite, ce texte
  // retomberait sur `onSurface`, quasi-noir en schéma clair. Voir `AGENTS.md`.
  // Forcée en même temps que `bubble.backgroundColor` ci-dessus, jamais
  // l'une sans l'autre.
  name: { color: tokens.color.textDark },
});

export type ReactionOverlayProps = { readonly reactions: readonly Reaction[] };

// Des bulles immobiles, jamais animées (§5.C12 de la conception) : sur une
// grille vidéo de téléphone, une animation flottante masquerait des visages,
// et RNTL ne pourrait de toute façon rien en dire. Le plafond de six et la
// durée de vie de 3 s vivent dans `reactionStore` ; cette coquille pose la
// liste qu'on lui donne, rien de plus — même division du travail que
// `HandBanner`/`RecordingIndicator`.
export function ReactionOverlay({ reactions }: ReactionOverlayProps): React.ReactElement | null {
  const { t } = useTranslation();
  if (reactions.length === 0) return null;

  return (
    <View testID="reaction-overlay" pointerEvents="none" style={styles.root}>
      {reactions.map((reaction) => {
        const trimmed = reaction.name.trim();
        const label = reaction.isLocal
          ? t('call.you')
          : trimmed.length > 0
            ? trimmed
            : t('call.unnamedParticipant');

        return (
          <View key={reaction.id} testID={`reaction-bubble-${reaction.id}`} style={styles.bubble}>
            <Text style={styles.glyph}>{reactionGlyph(reaction.key)}</Text>
            <Text testID={`reaction-bubble-name-${reaction.id}`} style={styles.name}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/screens/room/reactionOverlay.spec.tsx
npx tsc --noEmit
```

5 tests verts.

- [ ] **Step 4 : committer**

`feat(call): Show received reactions as bubbles over the stage`

- [ ] **Step 5 : éprouver par mutation**

`git checkout -- src/screens/room/reactionOverlay.tsx` entre chaque.

1. `if (reactions.length === 0) return null;` → supprimer la ligne — rougit `'ne rend rien sans
   réaction'`.
2. `reaction.isLocal ? t('call.you') : ...` → toujours `t('call.you')` — rougit `'affiche une
   bulle par réaction, la seconde comprise'` (Bob, non local, afficherait `call.you`).
3. `trimmed.length > 0 ? trimmed : t('call.unnamedParticipant')` → toujours `trimmed` — rougit
   `"replie sur le libellé d'anonyme un nom vide..."`.
4. `backgroundColor: tokens.color.surfaceDark` (dans `styles.bubble`) → supprimer la ligne —
   rougit `'porte une couleur explicite sur le nom, et un fond explicite sur la bulle'`.
5. `color: tokens.color.textDark` (dans `styles.name`) → supprimer la ligne — rougit la même
   assertion, sur l'autre moitié.

---

### Task 6 : accueillir le picker dans le menu « plus »

**Files:**
- Modify: `src/screens/room/moreMenu.tsx`
- Modify (tests): `src/screens/room/moreMenu.spec.tsx`

**Interfaces:**
- Consumes :
  - `type ReactionKey` de `src/call/reactions` (tâche 1)
  - `ReactionPicker` de `src/screens/room/reactionPicker` (tâche 4)
- Produces :
  - `MoreMenuProps` gagne `readonly onSendReaction: (key: ReactionKey) => void` — type
    **construit et élargi dans le même fichier**, par la même tâche : aucun voisin n'a besoin
    d'être touché.

**Quatrième entrée, jamais fermée sur l'appui — à l'inverse des trois précédentes.** `share-btn`,
`RecordingControl` et `HandControl` enveloppent chacun leur rappel d'un `setVisible(false)` posé
par `MoreMenu` lui-même (pas par le composant enfant). `ReactionPicker` reçoit `onSendReaction`
**tel quel**, sans enveloppe : c'est ce qui permet d'envoyer plusieurs réactions sans rouvrir le
menu (§5.C8).

- [ ] **Step 1 : écrire les tests qui échouent**

Dans `src/screens/room/moreMenu.spec.tsx` : le type `Overrides` gagne
`onSendReaction?: (key: ReactionKey) => void;` (import `type { ReactionKey } from
'src/call/reactions';` en tête de fichier), et la fonction `menu()` gagne, dans les props passées
à `<MoreMenu>` :

```tsx
      onSendReaction={overrides.onSendReaction ?? jest.fn()}
```

Nouveaux tests, ajoutés à la fin du `describe('MoreMenu', ...)` existant :

```tsx
  it('offre les huit réactions et les garde après un envoi', async () => {
    const onSendReaction = jest.fn();
    await render(menu({ onSendReaction }));

    await open();
    await waitFor(() => expect(screen.getByTestId('reaction-thumbs-up')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('reaction-thumbs-up'));

    expect(onSendReaction).toHaveBeenCalledWith('thumbs-up');
    // À l'inverse de ses trois voisines (`share-btn`, `recording-toggle`,
    // `hand-toggle`), une réaction NE referme PAS le menu.
    expect(screen.getByTestId('reaction-thumbs-up')).toBeTruthy();
  });

  it('envoie une seconde réaction sans rouvrir le menu', async () => {
    const onSendReaction = jest.fn();
    await render(menu({ onSendReaction }));

    await open();
    await waitFor(() => expect(screen.getByTestId('reaction-red-heart')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('reaction-thumbs-up'));
    await fireEvent.press(screen.getByTestId('reaction-red-heart'));

    expect(onSendReaction).toHaveBeenNthCalledWith(1, 'thumbs-up');
    expect(onSendReaction).toHaveBeenNthCalledWith(2, 'red-heart');
  });
```

- [ ] **Step 2 : modifier le composant**

Dans `src/screens/room/moreMenu.tsx` — ajouter aux imports :

```tsx
import type { ReactionKey } from 'src/call/reactions';
import { ReactionPicker } from 'src/screens/room/reactionPicker';
```

`MoreMenuProps` gagne (après `readonly onToggleHand: () => void;`) :

```tsx
  readonly onSendReaction: (key: ReactionKey) => void;
```

Destructuration de la fonction : ajouter `onSendReaction` aux props reçues. Corps du `<Menu>`,
juste après `<HandControl .../>` :

```tsx
      <ReactionPicker onSend={onSendReaction} />
```

Aucune enveloppe `() => { setVisible(false); ... }` : `onSendReaction` passe tel quel, à
l'inverse des trois lignes qui précèdent.

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/screens/room/moreMenu.spec.tsx
npx tsc --noEmit
npx eslint src/screens/room/moreMenu.tsx --ext .tsx
```

Tous les tests existants du fichier (15, avant cette tâche) plus les 2 nouveaux, verts — sans
qu'aucune assertion existante n'ait dû être modifiée : le prop par défaut de `menu()` couvre tous
les appels déjà écrits.

- [ ] **Step 4 : committer**

`feat(call): Wire the reaction picker into the more menu`

- [ ] **Step 5 : éprouver par mutation**

`git checkout -- src/screens/room/moreMenu.tsx` entre chaque.

1. `<ReactionPicker onSend={onSendReaction} />` →
   `<ReactionPicker onSend={() => { setVisible(false); onSendReaction; }} />` (fermeture
   accidentelle, alignée à tort sur les trois voisines) — rougit `'offre les huit réactions et les
   garde après un envoi'` (`reaction-thumbs-up` disparaîtrait après l'appui).
2. `onSend={onSendReaction}` → `onSend={onToggleHand}` (mauvais rappel branché) — rougit `'envoie
   une seconde réaction sans rouvrir le menu'` (`onSendReaction` ne serait jamais appelé).

---

### Task 7 : le câblage dans la séance

**Files:**
- Modify: `src/screens/room/call.tsx`
- Modify (tests): `src/screens/room/call.spec.tsx`

**Interfaces:**
- Consumes :
  - `type ReactionKey` de `src/call/reactions` (tâche 1)
  - `createReactionStore` de `src/call/reactionStore` (tâche 2)
  - `ReactionOverlay` de `src/screens/room/reactionOverlay` (tâche 5)
  - `MoreMenu` avec sa nouvelle prop `onSendReaction` (tâche 6)
- Produces :
  - `MessageKey` (`call.tsx`) gagne `| 'call.reactionFailed'` — type **construit et élargi dans
    le même fichier**.
  - Un gestionnaire `handleSendReaction: (key: ReactionKey) => void`, non exporté.

**Le magasin, comme `recordingStore` et `roomViewStore`, mais avec un `dispose()` explicite.**
`useState`, jamais `useMemo` — React se réserve le droit de jeter un `useMemo`
(`call.tsx:157-159`, commentaire déjà écrit pour `session`), et un magasin jeté laisserait
derrière lui un abonnement `RoomEvent.DataReceived` sur une `Room` vivante que plus personne ne
détacherait. `createReactionStore` s'abonne dès sa construction ; il n'y a pas de second instant
où le faire.

**`reactionStore.dispose()` avant `session.dispose()`, dans le même nettoyage d'effet** — détacher
le canal de données pendant que la `Room` existe encore est la même précaution que le
désabonnement de `setCallState` juste au-dessus (`call.tsx:304-312`).

**Le point non tranché par la conception, résolu ici par prudence — et signalé.**
`ReactionStore.send()` rend un simple `boolean` (tâche 2) : il ne dit pas **pourquoi** un envoi a
échoué. Or la conception demande un traitement différent selon la raison (§8) :

- limite de débit refusée → **jamais** de message, en toute circonstance (§5.C11, formulation
  absolue : « son refus n'est signalé par aucun message ») ;
- `publishData` rejeté, hors reconnexion → `Snackbar` « Reaction not sent ».

Avec un simple `boolean`, l'écran ne peut PAS distinguer les deux cas. Suivre §8 à la lettre
(`Snackbar` sur tout `!sent` hors reconnexion) **violerait** systématiquement §5.C11 dans le cas
le plus fréquent : la limite de débit se déclenche justement quand quelqu'un appuie vite et
plusieurs fois d'affilée — l'usage normal d'un bouton de réaction, pas un cas rare — et cette
rafale ordinaire afficherait alors la même `Snackbar` « trop bavarde » que §5.C11 refuse
explicitement. Ce plan choisit donc le **silence dans les deux cas** : `handleSendReaction`
n'appelle jamais `setNotice`. La clé `call.reactionFailed` et la variante de `MessageKey` sont
ajoutées (elles font partie des onze clés listées par la conception, §6.11) mais **ne sont
câblées nulle part** — prêtes pour la résolution de cette tension, pas mortes par oubli. Voir
l'auto-relecture pour les trois issues possibles et à qui elles appartiennent.

- [ ] **Step 1 : écrire les tests qui échouent**

Dans `src/screens/room/call.spec.tsx`, trois modifications au double de `Room` partagé, **avant**
les nouveaux tests :

1. Le type des gestionnaires passe de zéro argument à variadique, et `mockRoom` gagne
   `getParticipantByIdentity` (qui réutilise `remoteParticipants`, déjà rempli par les tests
   existants via `remoteParticipant(...)`) et `publishData` sur son `localParticipant` :

```tsx
type RoomHandler = (...args: unknown[]) => void;
const mockRoomHandlers = new Map<string, RoomHandler[]>();
const mockPublishData = jest.fn().mockResolvedValue(undefined);

const mockRoom: {
  localParticipant: unknown;
  remoteParticipants: Map<string, unknown>;
  readonly metadata: string | undefined;
  readonly isRecording: boolean;
  getParticipantByIdentity: (identity: string) => unknown;
  on: (event: string, handler: RoomHandler) => unknown;
  off: (event: string, handler: RoomHandler) => unknown;
} = {
  localParticipant: {
    identity: 'me',
    isLocal: true,
    isSpeaking: false,
    get attributes(): Record<string, string> {
      return mockLocalAttributes;
    },
    getTrackPublication: () => mockCameraPublication,
    publishData: mockPublishData,
  },
  remoteParticipants: new Map<string, unknown>(),
  get metadata(): string | undefined {
    return mockRoomMetadata;
  },
  get isRecording(): boolean {
    return mockRoomIsRecording;
  },
  // Réutilise `remoteParticipants`, déjà rempli par les tests existants
  // (`remoteParticipant(...)`) : `reactionStore` n'a besoin d'aucune donnée
  // de plus pour résoudre un nom d'émetteur.
  getParticipantByIdentity: (identity: string) => mockRoom.remoteParticipants.get(identity),
  on(event: string, handler: RoomHandler): unknown {
    mockRoomHandlers.set(event, [...(mockRoomHandlers.get(event) ?? []), handler]);
    return mockRoom;
  },
  off(event: string, handler: RoomHandler): unknown {
    const attached = mockRoomHandlers.get(event) ?? [];
    const index = attached.indexOf(handler);
    if (index !== -1) attached.splice(index, 1);
    if (attached.length === 0) mockRoomHandlers.delete(event);
    return mockRoom;
  },
};
```

2. `emitRoom` gagne des arguments variadiques, transmis tels quels — le seul appel existant
   (`emitRoom('participantAttributesChanged')`, ligne ~1680) continue de fonctionner sans
   modification :

```tsx
async function emitRoom(event: string, ...args: unknown[]): Promise<void> {
  await act(async () => {
    for (const handler of Array.from(mockRoomHandlers.get(event) ?? [])) handler(...args);
  });
}
```

3. Nouveau bloc de tests, ajouté à la fin du fichier :

```tsx
describe('CallScreen, réactions', () => {
  it('envoie une réaction depuis le menu, sans jamais fermer celui-ci', async () => {
    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('reaction-thumbs-up')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('reaction-thumbs-up'));

    await waitFor(() => expect(mockPublishData).toHaveBeenCalledTimes(1));
    const [bytes, options] = mockPublishData.mock.calls[0] as [
      Uint8Array,
      { reliable: boolean },
    ];
    expect(new TextDecoder().decode(bytes)).toBe(
      '{"type":"reactionReceived","data":{"emoji":"thumbs-up"}}',
    );
    expect(options).toEqual({ reliable: true });
    // À l'inverse de `hand-toggle`, une réaction ne referme pas le menu.
    expect(screen.getByTestId('reaction-thumbs-up')).toBeTruthy();
  });

  it('affiche sa propre bulle après un envoi accepté', async () => {
    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('reaction-red-heart')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('reaction-red-heart'));

    await waitFor(() => expect(screen.getByTestId('reaction-overlay')).toBeTruthy());
  });

  it("n'affiche aucune bulle et ne montre aucune Snackbar quand la publication échoue", async () => {
    mockPublishData.mockRejectedValueOnce(new Error('offline'));
    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('reaction-thumbs-up')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('reaction-thumbs-up'));

    await waitFor(() => expect(mockPublishData).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('reaction-overlay')).toBeNull();
    expect(screen.getByTestId('call-notice').props.visible).toBe(false);
  });

  it('affiche une bulle avec le nom quand un autre participant réagit', async () => {
    mockRoom.remoteParticipants.set('u-ada', remoteParticipant('u-ada', 'Ada'));
    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    await emitRoom(
      'dataReceived',
      new TextEncoder().encode('{"type":"reactionReceived","data":{"emoji":"party-popper"}}'),
      { identity: 'u-ada' },
    );

    await waitFor(() => expect(screen.getByTestId('reaction-overlay')).toBeTruthy());
    expect(screen.getByText('Ada')).toBeTruthy();
  });

  it("ignore un paquet de données qui n'est pas une réaction", async () => {
    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());

    await emitRoom(
      'dataReceived',
      new TextEncoder().encode('{"type":"participantMuted","data":{}}'),
      { identity: 'u-ada' },
    );

    expect(screen.queryByTestId('reaction-overlay')).toBeNull();
  });

  it('efface une bulle après sa durée de vie', async () => {
    jest.useFakeTimers();
    await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('more-btn')).toBeTruthy());
    await settleMenus();
    await fireEvent.press(screen.getByTestId('more-btn'));
    await waitFor(() => expect(screen.getByTestId('reaction-thumbs-up')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('reaction-thumbs-up'));
    await waitFor(() => expect(screen.getByTestId('reaction-overlay')).toBeTruthy());

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    expect(screen.queryByTestId('reaction-overlay')).toBeNull();
    jest.useRealTimers();
  });

  it('détache le canal de données au démontage', async () => {
    const view = await render(withPaper(<CallScreen />));
    await waitFor(() => expect(screen.getByTestId('leave-btn')).toBeTruthy());
    expect(mockRoomHandlers.get('dataReceived')?.length ?? 0).toBeGreaterThan(0);

    await view.unmount();

    expect(mockRoomHandlers.get('dataReceived') ?? []).toHaveLength(0);
  });
});
```

- [ ] **Step 2 : modifier `call.tsx`**

Imports, ajoutés au bloc existant :

```ts
import type { ReactionKey } from 'src/call/reactions';
import { createReactionStore } from 'src/call/reactionStore';
```

et, avec les autres imports de `src/screens/room` :

```ts
import { ReactionOverlay } from 'src/screens/room/reactionOverlay';
```

`MessageKey` (lignes 67-74) gagne, après `'call.handFailed'` :

```ts
  | 'call.reactionFailed'
```

Après la déclaration de `recordingStore`/`recordingState` (lignes 257-258), avant `roomId` :

```ts
  // Troisième magasin indépendant, comme `recordingStore` et `roomViewStore` :
  // `useState`, pas `useMemo` — React se réserve le droit de jeter un
  // `useMemo`, et un magasin jeté laisserait derrière lui un abonnement
  // `RoomEvent.DataReceived` sur une `Room` vivante que plus personne ne
  // détacherait. `createReactionStore` s'abonne dès sa construction : il n'y
  // a pas de second instant où le faire.
  const [reactionStore] = useState(() => createReactionStore(session.getRoom()));
  const reactions = useSyncExternalStore(reactionStore.subscribe, reactionStore.getSnapshot);
```

L'effet de nettoyage (lignes 304-312) devient :

```ts
  useEffect(() => {
    const unsubscribe = session.subscribe(setCallState);
    return () => {
      unsubscribe();
      // Avant `session.dispose()` : détacher le canal de données pendant que
      // la Room existe encore, la même précaution que le désabonnement de
      // `setCallState` juste au-dessus.
      reactionStore.dispose();
      session.dispose();
    };
  }, [session, reactionStore]);
```

Nouveau gestionnaire, après `handleToggleHand` :

```ts
  // Le store ne distingue pas, dans son booléen, un refus de débit d'un
  // échec de publication (§6.5/§7.5 de la conception ne rendent que
  // `boolean`) — alors que la limite de débit doit rester silencieuse en
  // toute circonstance (§5.C11 : « son refus n'est signalé par aucun
  // message »). Suivre §8 à la lettre (Snackbar sur tout échec hors
  // reconnexion) violerait donc §5.C11 dans le cas le plus fréquent : presser
  // vite est justement ce qui déclenche la limite de débit. Ce plan choisit
  // le silence dans les deux cas — voir le plan d'implémentation pour le
  // détail et le signalement à qui possède la conception.
  //
  // `.catch()` par discipline, pas par nécessité : `send()` ne rejette
  // jamais (même contrat que `CallSession.connect`), mais rien ne l'affirme
  // au typage — même motif que `handleSelectAudioOutput` un peu plus haut.
  const handleSendReaction = (key: ReactionKey): void => {
    reactionStore.send(key).catch(() => undefined);
  };
```

JSX — `MoreMenu` gagne la prop (bloc existant, lignes 737-748) :

```tsx
        <MoreMenu
          recording={recordingState}
          canRecord={canRecord}
          recordingBusy={recordingBusy}
          handRaised={handRaised}
          handBusy={handBusy}
          hands={hands}
          onShare={handleShare}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          onToggleHand={handleToggleHand}
          onSendReaction={handleSendReaction}
        />
```

Et, en tout dernier enfant de `styles.root` — après le bloc `controls` (ligne 771), avant la
`Snackbar` (ligne 777) — pour peindre au-dessus de tout le reste de l'écran :

```tsx
      <ReactionOverlay reactions={reactions} />
```

- [ ] **Step 3 : lancer et vérifier**

```
npx jest src/screens/room/call.spec.tsx
npx tsc --noEmit
npx eslint src/screens/room/call.tsx --ext .tsx
npx prettier --check src/screens/room/call.tsx src/screens/room/call.spec.tsx
```

Tous les tests existants du fichier passent **sans modification** — le double de `Room` reste
compatible (les deux nouveaux champs sont additifs, `emitRoom` accepte toujours zéro argument
supplémentaire) — plus les 7 nouveaux.

- [ ] **Step 4 : committer**

`feat(call): Wire reactions into the call screen`

- [ ] **Step 5 : éprouver par mutation**

`git checkout -- src/screens/room/call.tsx` entre chaque.

1. `reactionStore.send(key).catch(() => undefined);` →
   `reactionStore.send(key).then((sent) => setNotice(sent ? null : 'call.reactionFailed'));` —
   rougit `"n'affiche aucune bulle et ne montre aucune Snackbar quand la publication échoue"`
   (`call-notice` deviendrait visible).
2. Supprimer `reactionStore.dispose();` du nettoyage d'effet — rougit `'détache le canal de
   données au démontage'`.
3. `<ReactionOverlay reactions={reactions} />` → `<ReactionOverlay reactions={[]} />` — rougit
   `'affiche sa propre bulle après un envoi accepté'` et `'affiche une bulle avec le nom quand un
   autre participant réagit'`.
4. `onSendReaction={handleSendReaction}` → supprimer la prop (ou la remplacer par `jest.fn()`
   inline non branché) — `tsc` rougirait déjà (`MoreMenuProps.onSendReaction` est requis), et à
   défaut le test `'envoie une réaction depuis le menu...'` rougirait à l'exécution
   (`mockPublishData` jamais appelé).
5. `getParticipantByIdentity: (identity: string) => mockRoom.remoteParticipants.get(identity),` →
   `getParticipantByIdentity: () => undefined,` — rougit `'affiche une bulle avec le nom quand un
   autre participant réagit'` (`screen.getByText('Ada')` ne trouverait rien).

**Deux mutations volontairement absentes de cette liste**, et pourquoi : inverser l'ordre
`reactionStore.dispose(); session.dispose();` n'est prouvable par aucun test de ce fichier —
`mockDispose` est un simple espion (`jest.fn()`), il ne démonte rien de réel, et l'ordre entre les
deux appels n'a donc aucun effet observable dans cet environnement. Remplacer le `useState` du
magasin par un `useMemo` n'est prouvable non plus : `React.StrictMode` n'est utilisé nulle part
dans ce dépôt **[V]** (recherche vide sur `app/` et `src/`), et sans le double-appel de
développement qu'il impose, `useState` et `useMemo` se comportent identiquement le temps d'un
test. Les deux points restent vrais **à la lecture du code**, pas à la preuve par test — même
limite que celle qu'`AGENTS.md` nomme déjà pour les couleurs.

---

## Auto-relecture

### Couverture de la conception

| Décision de la conception | Portée par |
|---|---|
| C8 — émettre et recevoir, huit emoji, dans le panneau jamais dans la barre | Tâches 4 (émettre), 5 (recevoir), 6 (dans le menu, pas la barre) |
| C9 — glyphes Unicode, table mécanique | Tâche 1 (`reactionGlyph`) |
| C10 — écho local après résolution de `publishData` | Tâche 2 (`send`, l'écho posé après l'`await`) |
| C11 — débit à 10/1 000 ms, refus silencieux | Tâche 1 (`admitSend`), tâche 7 (silence choisi pour lever la tension avec §8 — voir plus bas) |
| C12 — six visibles, 3 000 ms, bulles statiques | Tâches 1 (`REACTION_MAX_VISIBLE`, `pruneReactions`), 2 (purge à intervalle), 5 (rendu statique) |
| C13 — accessibilité à l'émission seulement, pas de réglage | Tâche 4 (`accessibilityLabel` par bouton) ; aucun écran de réglage créé |
| C18 — un seul point d'entrée, le menu existant | Tâche 6 (quatrième entrée de `MoreMenu`, aucun panneau créé) |
| §6.8 `ReactionOverlayProps = { reactions }` | Tâche 5, signature reprise à l'identique |
| §6.4/§6.5, toutes les signatures de `reactions.ts`/`reactionStore.ts` | Tâches 1 et 2, reprises littéralement |
| §6.11, les onze clés C2 | Tâche 3 |
| §11.C2 « logiciel qui marche » : réagir et voir réagir, sans coupler à C3 | L'ensemble des sept tâches ; aucun fichier de C3 (`chat.ts`, `chatStore.ts`, `InteractionPanel`) n'est touché |

Rien de la section « Réactions » (§5, C8-C13) n'est laissé sans tâche. Ce que ce plan **ne**
livre pas, par construction : `chat.ts`/`chatStore.ts` (C3), tout renommage de `moreMenu.tsx` en
panneau (C1 a déjà tranché : le menu suffit), et la file d'attente/position de main levée (C1,
déjà livrée).

### Chasse aux formules creuses

Relu tâche par tâche : chaque étape de code est le code réel, chaque mutation nomme la ligne
exacte et le test exact qu'elle fait rougir. Un endroit a été corrigé pendant cette relecture :
la première version de la tâche 7 listait « inverser l'ordre des deux `dispose()` » et « remplacer
`useState` par `useMemo` » comme mutations éprouvables. Les deux se sont révélées **invérifiables**
avec les doubles de test disponibles (`mockDispose` est un espion inerte ; `React.StrictMode`
n'est utilisé nulle part dans ce dépôt, donc rien ne distingue les deux Hooks le temps d'un test).
Les deux ont été retirées de la liste des mutations et déplacées dans le paragraphe qui les nomme
explicitement comme **non prouvables par test** — exactement la discipline qu'`AGENTS.md` demande
déjà pour les couleurs : dire ce qu'un test ne peut pas prouver plutôt que de prétendre le
contraire.

### Cohérence des types entre tâches

`ReactionKey` et `Reaction` sont construits **une seule fois**, tâche 1, et seulement **consommés**
ensuite — jamais élargis hors de `src/call/reactions.ts`. Vérifié fichier par fichier :

- `reactionStore.ts` (tâche 2) : `import { ... type Reaction, type ReactionKey } from
  'src/call/reactions'` — aucun champ ajouté.
- `reactionPicker.tsx` (tâche 4) : `import { ..., type ReactionKey } from 'src/call/reactions'` —
  la table `REACTION_LABEL_KEYS` est indexée par `ReactionKey` mais n'en change pas la forme.
- `reactionOverlay.tsx` (tâche 5) : `import { ..., type Reaction } from 'src/call/reactions'` —
  lu, jamais réécrit.
- `moreMenu.tsx` (tâche 6) : `import type { ReactionKey } from 'src/call/reactions'` — utilisé
  seulement dans la signature de `MoreMenuProps.onSendReaction`, un type que ce même fichier
  construit et élargit dans le même commit.
- `call.tsx` (tâche 7) : `import type { ReactionKey } from 'src/call/reactions'` — même usage,
  et `MessageKey` (construit dans `call.tsx`) est élargi dans le même fichier, par la même tâche.

**Aucune tâche de ce plan n'élargit un type construit dans un fichier qu'elle ne modifie pas
elle-même.** C'est la vérification exacte que la leçon n°1 de C1 demande, et le résultat est net :
contrairement à C1 (`ParticipantView`/`RoomView` élargis dans `layout.ts` pour un besoin né dans
`hands.ts`/`participants.ts`), aucune réaction n'est portée par `ParticipantView` — le magasin de
réactions est entièrement parallèle à la vue de salon, et ce plan n'a donc trouvé, en cherchant
délibérément, **aucun** cas de la classe de bogue que C1 a payée deux fois sur huit tâches.

### Vérification que chaque tâche est committable seule

| Tâche | Dépend de (déjà committé) | `tsc --noEmit` vert seule ? |
|---|---|---|
| 1 | rien | oui — aucune tâche n'attend une autre pour compiler, à la différence de C1 (tâche 1 ↔ tâche 3) |
| 2 | 1 | oui |
| 3 | rien (JSON seul) | sans objet — insérable à n'importe quel point de la séquence |
| 4 | 1 | oui |
| 5 | 1 | oui |
| 6 | 1, 4 | oui |
| 7 | 1, 2, 5, 6 | oui |

Aucune tâche ne laisse le dépôt dans un état où `npm test`/`npm run typecheck` échoue entre son
commit et le suivant — propriété que C1 n'avait **pas** pour sa tâche 1 (`tsc` restait rouge
jusqu'à la fin de sa tâche 3, par construction). Chaque ligne de code de ce plan appartient à
l'unique tâche qui la committe ; aucun fichier n'est touché par deux tâches à la fois sauf
`moreMenu.tsx`/`moreMenu.spec.tsx` (tâche 6 seule) et `call.tsx`/`call.spec.tsx` (tâche 7 seule) —
jamais partagé entre deux tâches numérotées différemment.

---

## Points que la conception n'a pas tranchés

1. **La distinction entre un refus de débit et un échec de publication, dans `ReactionStore.send()`
   (§6.5).** La signature donnée (`Promise<boolean>`) ne permet pas à l'écran de les distinguer,
   alors que §8 demande un traitement différent (silence total pour le premier, `Snackbar`
   conditionnelle pour le second) — et le premier cas est le plus fréquent en usage réel (une
   rafale d'appuis, pas une panne réseau). Ce plan choisit le silence dans les deux cas (tâche 7),
   ajoute la clé `call.reactionFailed` et la variante de `MessageKey` sans les câbler, et signale
   la question plutôt que de la trancher. Trois issues possibles, qui appartiennent à qui possède
   la conception :
   - accepter le silence total comme comportement définitif, et retirer `call.reactionFailed` ;
   - accepter l'occasionnel faux positif de §8 (une `Snackbar` sur un refus de débit hors
     reconnexion) et câbler `handleSendReaction` en conséquence ;
   - élargir `ReactionStore.send()` pour rendre trois issues au lieu d'un booléen (par exemple
     `'sent' | 'rate-limited' | 'failed'`), ce qui est un changement d'interface, pas un détail
     d'implémentation.
2. **La position exacte de `ReactionOverlay` sur l'écran** (tâche 5) : la conception dit « bulles
   au-dessus de la scène » sans anchrer un coin ni une marge. Ce plan choisit bas-droite, empilé
   vers le haut — raisonnable, non mesuré. À vérifier sur un appareil de 360 dp, comme la barre
   elle-même (§9.3 de la conception).
