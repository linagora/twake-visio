import { RoomEvent } from 'livekit-client';
import type { Room } from 'livekit-client';

import { createRecordingStore, RECORDING_EVENTS } from 'src/call/recordingStore';

// Un double de `Room` qui enregistre réellement ses gestionnaires par nom
// d'événement, et dont les deux lectures sont des accesseurs : c'est la seule
// façon de vérifier que le magasin relit après un événement au lieu de rendre
// une valeur figée. Même convention que le `RoomProbe` de `participants.spec.ts`.
type RoomProbe = {
  readonly room: Room;
  readonly setMetadata: (metadata: string | undefined) => void;
  readonly setRecording: (isRecording: boolean) => void;
  readonly subscribedEvents: () => string[];
  readonly handlerCount: (event: string) => number;
  readonly emit: (event: string) => void;
};

function fakeRoom(metadata: string | undefined, isRecording = false): RoomProbe {
  const handlers = new Map<string, (() => void)[]>();
  let currentMetadata = metadata;
  let currentRecording = isRecording;

  const room = {
    get metadata(): string | undefined {
      return currentMetadata;
    },
    get isRecording(): boolean {
      return currentRecording;
    },
    on(event: string, handler: () => void): unknown {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return room;
    },
    off(event: string, handler: () => void): unknown {
      const attached = handlers.get(event) ?? [];
      const index = attached.indexOf(handler);
      if (index !== -1) attached.splice(index, 1);
      if (attached.length === 0) handlers.delete(event);
      return room;
    },
  };

  return {
    room: room as unknown as Room,
    setMetadata: (next: string | undefined) => {
      currentMetadata = next;
    },
    setRecording: (next: boolean) => {
      currentRecording = next;
    },
    subscribedEvents: () => Array.from(handlers.keys()).sort(),
    handlerCount: (event: string) => (handlers.get(event) ?? []).length,
    emit: (event: string) => {
      for (const handler of Array.from(handlers.get(event) ?? [])) handler();
    },
  };
}

const STARTED = JSON.stringify({
  recording_mode: 'screen_recording',
  recording_status: 'started',
});
const SAVING = JSON.stringify({ recording_mode: 'screen_recording', recording_status: 'saving' });

describe('RECORDING_EVENTS', () => {
  it('porte exactement les trois événements attendus, nom par nom', () => {
    // Un événement oublié ne casse rien en développement : il fige simplement
    // l'indicateur sur l'appareil de quelqu'un d'autre.
    expect([...RECORDING_EVENTS]).toEqual([
      RoomEvent.RoomMetadataChanged,
      RoomEvent.RecordingStatusChanged,
      RoomEvent.Reconnected,
    ]);
  });
});

describe('createRecordingStore', () => {
  it('lit la Room avant tout événement', () => {
    // Le cas « rejoindre une réunion déjà enregistrée » : le SDK n'émet PAS
    // `RoomMetadataChanged` à la jonction. Un magasin qui attendrait
    // l'événement resterait à `idle` toute la séance.
    const probe = fakeRoom(STARTED, true);

    const store = createRecordingStore(probe.room);

    expect(store.getSnapshot()).toEqual({ phase: 'recording', mode: 'screen_recording' });
  });

  it('rend la même valeur tant que rien ne bouge', () => {
    // Le contrat de `useSyncExternalStore` : une valeur neuve à chaque appel
    // fait boucler le rendu.
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);

    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('relit après un changement de métadonnées', () => {
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);
    store.subscribe(() => undefined);
    expect(store.getSnapshot()).toEqual({ phase: 'recording', mode: 'screen_recording' });

    probe.setMetadata(SAVING);
    probe.emit(RoomEvent.RoomMetadataChanged);

    expect(store.getSnapshot()).toEqual({ phase: 'saving', mode: 'screen_recording' });
  });

  it('relit sur la bascule de RecordingStatusChanged', () => {
    // La seconde moitié de la règle `started && isRecording` : sans cet
    // événement, la phase resterait « démarrage » alors que l'egress a démarré.
    const probe = fakeRoom(STARTED, false);
    const store = createRecordingStore(probe.room);
    store.subscribe(() => undefined);
    expect(store.getSnapshot()).toEqual({ phase: 'starting', mode: 'screen_recording' });

    probe.setRecording(true);
    probe.emit(RoomEvent.RecordingStatusChanged);

    expect(store.getSnapshot()).toEqual({ phase: 'recording', mode: 'screen_recording' });
  });

  it('relit après une reconnexion', () => {
    // `emitWhenConnected` met les événements en tampon pendant une reconnexion
    // et ne les rejoue qu'après avoir émis `Reconnected` — et en jette hors de
    // ces deux fenêtres.
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);
    store.subscribe(() => undefined);
    store.getSnapshot();

    probe.setMetadata(undefined);
    probe.emit(RoomEvent.Reconnected);

    expect(store.getSnapshot()).toEqual({ phase: 'idle', mode: null });
  });

  it('avertit ses abonnés', () => {
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);
    const onChange = jest.fn();
    store.subscribe(onChange);

    probe.emit(RoomEvent.RoomMetadataChanged);

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('s’abonne aux trois événements et détache tout au désabonnement', () => {
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);

    const unsubscribe = store.subscribe(() => undefined);

    expect(probe.subscribedEvents()).toEqual([...RECORDING_EVENTS].sort());
    unsubscribe();
    expect(probe.subscribedEvents()).toEqual([]);
  });

  it('n’attache qu’un gestionnaire par événement pour deux abonnés', () => {
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);

    const first = store.subscribe(() => undefined);
    const second = store.subscribe(() => undefined);

    expect(probe.handlerCount(RoomEvent.RoomMetadataChanged)).toBe(1);
    first();
    expect(probe.handlerCount(RoomEvent.RoomMetadataChanged)).toBe(1);
    second();
    expect(probe.handlerCount(RoomEvent.RoomMetadataChanged)).toBe(0);
  });

  it('ne détache pas tant qu’un abonné reste, et continue de le prévenir', () => {
    // Complète le test précédent : compter les gestionnaires posés sur la Room
    // ne dit pas si l'abonné restant est encore prévenu par un événement réel.
    // Même convention que `participants.spec.ts` (« ne détache pas tant qu'un
    // abonné reste ») : deux abonnés, le premier part, le second doit
    // continuer à recevoir les avis.
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);
    const staying = jest.fn();

    const leaving = store.subscribe(() => undefined);
    store.subscribe(staying);
    leaving();

    expect(probe.subscribedEvents()).not.toEqual([]);
    probe.emit(RoomEvent.RoomMetadataChanged);
    expect(staying).toHaveBeenCalledTimes(1);
  });

  it('périme la valeur au moment de l’abonnement', () => {
    // Entre la lecture faite pendant le rendu et l'abonnement, une métadonnée a
    // pu arriver sans personne pour l'écouter.
    const probe = fakeRoom(STARTED, true);
    const store = createRecordingStore(probe.room);
    const before = store.getSnapshot();

    probe.setMetadata(SAVING);
    store.subscribe(() => undefined);

    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot()).toEqual({ phase: 'saving', mode: 'screen_recording' });
  });
});
