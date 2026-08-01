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
