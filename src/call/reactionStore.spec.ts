import { RoomEvent } from 'livekit-client';
import type { RemoteParticipant, Room } from 'livekit-client';

import { createReactionStore } from 'src/call/reactionStore';
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
  // Sur tout le fichier, pas seulement sur `purge automatique` : les tests de
  // `send` ci-dessous n'appellent jamais `dispose()`, et sous de vrais
  // timers chacun laisse un `setInterval` orphelin (voir `schedulePurge`).
  // Un seul s'auto-efface correctement par store — mais une mutation qui
  // casserait la garde de réentrance de `schedulePurge` en armerait DIX pour
  // la seule rafale ci-dessous, dont neuf ne s'effacent jamais (voir ce
  // commentaire, plus bas, à l'endroit de cette garde) : un magasin non
  // disposé y survivrait au processus Jest lui-même. Des timers FAKE
  // n'ouvrent aucune poignée réelle : qu'ils soient armés, orphelins ou
  // jamais avancés ne peut jamais empêcher Jest de sortir.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("s'abonne à DataReceived dès sa construction", () => {
    const probe = fakeRoom('me', 'Me');
    createReactionStore(probe.room);

    expect(probe.subscribedEvents()).toEqual([RoomEvent.DataReceived]);
  });

  it('détache le gestionnaire de la construction précédente sur la même Room', () => {
    // `room.on` est ADDITIF et ne jette jamais sur un doublon, contrairement
    // à `registerTextStreamHandler` (`chatStore.ts`) : sans garde, une
    // seconde construction sur la même Room — le double appel de
    // l'initialiseur d'un `useState` en mode strict — empilerait un second
    // gestionnaire au lieu de remplacer le premier.
    const probe = fakeRoom('me', 'Me');
    createReactionStore(probe.room);

    createReactionStore(probe.room);

    expect(probe.handlerCount(RoomEvent.DataReceived)).toBe(1);
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
        expect(await store.send('thumbs-up')).toBe(true);
      }
      probe.publishData.mockClear();

      expect(await store.send('thumbs-up')).toBe(false);
      expect(probe.publishData).not.toHaveBeenCalled();
    });
  });

  describe('purge automatique', () => {
    it('efface une réaction après sa durée de vie et arrête son intervalle', async () => {
      const probe = fakeRoom('me', 'Me');
      const store = createReactionStore(probe.room);
      await store.send('thumbs-up');
      expect(store.getSnapshot()).toHaveLength(1);

      jest.advanceTimersByTime(3000);

      expect(store.getSnapshot()).toHaveLength(0);
      expect(jest.getTimerCount()).toBe(0);
    });

    it("ne lance l'intervalle qu'une fois une réaction présente", async () => {
      const probe = fakeRoom('me', 'Me');
      createReactionStore(probe.room);

      expect(jest.getTimerCount()).toBe(0);

      const store = createReactionStore(probe.room);
      await store.send('thumbs-up');

      expect(jest.getTimerCount()).toBeGreaterThan(0);
    });

    // La garde de `schedulePurge` (`if (pruneTimer !== null) return;`) n'est
    // exercée par aucun des deux tests ci-dessus : chacun n'appelle `send`
    // qu'une seule fois, donc `schedulePurge` n'y est jamais rappelée pendant
    // qu'un intervalle est déjà armé. Un second envoi, avant toute avance du
    // temps, doit rester sur le MÊME intervalle plutôt que d'en armer un
    // second.
    //
    // Ce test est le seul filet pour cette garde : sous de vrais timers, la
    // casser (ex. `if (false) return;`) laisserait la rafale de `send`
    // ci-dessus armer dix intervalles au lieu d'un — et `dispose()` (voir
    // plus bas) n'en efface qu'un seul, celui que `pruneTimer` référence en
    // dernier. Les neuf autres ne s'auto-effacent JAMAIS : leur propre
    // fermeture voit `pruneTimer` déjà nul (mis à `null` par celui qui s'est
    // effacé le premier) et leur garde de purge (`pruneTimer !== null`) reste
    // fausse pour toujours. Neuf `setInterval` réels, orphelins, qui
    // rappellent `notify()` toutes les 250 ms sans fin : c'est ce qui
    // empêchait Jest de sortir avant que ce fichier passe aux timers fake
    // (mesuré : `timeout 25 npx jest …` tué après 25 s pile, `real 25,01`,
    // contre 1,24 s une fois le fichier sur `jest.useFakeTimers()`). Un test
    // affaibli ici dégraderait donc un rouge immédiat en un blocage muet.
    it("n'arme pas un second intervalle tant que le premier n'a pas fini de purger", async () => {
      const probe = fakeRoom('me', 'Me');
      const store = createReactionStore(probe.room);

      await store.send('thumbs-up');
      expect(jest.getTimerCount()).toBe(1);

      await store.send('thumbs-down');
      expect(jest.getTimerCount()).toBe(1);
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
      const probe = fakeRoom('me', 'Me');
      const store = createReactionStore(probe.room);
      await store.send('thumbs-up');
      expect(jest.getTimerCount()).toBe(1);

      store.dispose();

      expect(jest.getTimerCount()).toBe(0);
    });

    // Drapeau terminal, comme `chatStore.ts`. `send()` peut être en vol au
    // moment de la libération : sans lui, la résolution tardive de
    // `publishData` ajouterait quand même son écho et rearmerait un
    // intervalle de purge pour un magasin que l'écran a déjà lâché — du
    // travail inutile, puisque `notify()` ne peut de toute façon plus avertir
    // personne (`listeners` est déjà vidé par `dispose()`). `true` reste la
    // bonne valeur de retour : la publication a réellement réussi, seul
    // l'écho local est sauté.
    it("n'ajoute plus d'écho ni ne rearme la purge quand publishData se résout après dispose", async () => {
      const probe = fakeRoom('me', 'Me');
      let resolvePublish: () => void = () => undefined;
      probe.publishData.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolvePublish = resolve;
          }),
      );
      const store = createReactionStore(probe.room);

      const pending = store.send('thumbs-up');
      store.dispose();
      resolvePublish();
      const sent = await pending;

      expect(sent).toBe(true);
      expect(store.getSnapshot()).toEqual([]);
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
