import { act, renderHook } from '@testing-library/react-native';
import { Track } from 'livekit-client';
import type { Participant, Room } from 'livekit-client';

import type { FacingMode } from 'src/call/media';
import { useCallLayout } from 'src/call/useCallLayout';

function person(identity: string, isLocal = false): Participant {
  return {
    identity,
    name: identity,
    isLocal,
    isSpeaking: false,
    getTrackPublication: (source: Track.Source) =>
      source === Track.Source.Camera
        ? { trackSid: `ts-${identity}`, source, isMuted: false, track: {} }
        : undefined,
  } as unknown as Participant;
}

type RoomProbe = {
  readonly room: Room;
  readonly remotes: Map<string, Participant>;
  readonly subscribedEvents: () => string[];
  readonly emit: (event: string) => void;
};

// Les gestionnaires sont rangés dans une liste, comme le fait un
// `EventEmitter` : `off` n'en retire qu'une occurrence, et un ensemble
// masquerait la fuite d'une double attache.
function fakeRoom(): RoomProbe {
  const handlers = new Map<string, (() => void)[]>();
  const remoteParticipants = new Map<string, Participant>();

  const room = {
    localParticipant: person('me', true),
    remoteParticipants,
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
    remotes: remoteParticipants,
    subscribedEvents: () => Array.from(handlers.keys()),
    emit: (event: string) => {
      for (const handler of Array.from(handlers.get(event) ?? [])) handler();
    },
  };
}

describe('useCallLayout', () => {
  it('rend une disposition dès le premier rendu, sans attendre un événement', async () => {
    // Un écran qui attendrait une première notification de la Room resterait
    // noir jusqu'à ce que quelqu'un bouge — parfois jamais.
    const { room } = fakeRoom();

    const { result } = await renderHook(() => useCallLayout(room, 'user'));

    expect(result.current.stage.key).toBe('me:camera');
    expect(result.current.filmstrip).toEqual([]);
  });

  it('suit l’arrivée d’un participant annoncée par la Room', async () => {
    const { room, remotes, emit } = fakeRoom();
    const { result } = await renderHook(() => useCallLayout(room, 'user'));

    await act(async () => {
      remotes.set('bob', person('bob'));
      emit('participantConnected');
    });

    expect(result.current.stage.key).toBe('bob:camera');
    expect(result.current.filmstrip.map((tile) => tile.key)).toEqual(['me:camera']);
  });

  it('refait la sélection quand la caméra change de face', async () => {
    const { room, remotes } = fakeRoom();
    remotes.set('bob', person('bob'));
    const { result, rerender } = await renderHook(
      ({ facing }: { facing: FacingMode }) => useCallLayout(room, facing),
      { initialProps: { facing: 'user' as FacingMode } },
    );
    expect(result.current.filmstrip[0]?.mirror).toBe(true);

    await rerender({ facing: 'environment' });

    expect(result.current.filmstrip[0]?.mirror).toBe(false);
  });

  it('détache ses gestionnaires au démontage', async () => {
    // Sans cela, chaque passage sur l'écran laisse une Room qui rappelle un
    // composant démonté à chaque piste publiée par n'importe qui.
    const { room, subscribedEvents } = fakeRoom();
    const { unmount } = await renderHook(() => useCallLayout(room, 'user'));
    expect(subscribedEvents()).not.toEqual([]);

    await unmount();

    expect(subscribedEvents()).toEqual([]);
  });
});
