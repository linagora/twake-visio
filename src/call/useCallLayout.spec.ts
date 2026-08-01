import { act, renderHook } from '@testing-library/react-native';
import { Track } from 'livekit-client';
import type { Participant, Room } from 'livekit-client';

import type { Box } from 'src/call/grid';
import type { CallLayout } from 'src/call/layout';
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

// La boîte de contenu de l'écran de couverture du Pixel 10 Pro Fold en
// portrait. Ces tests portent sur l'abonnement à la Room, pas sur la
// géométrie : ils veulent juste une boîte, et une boîte réelle vaut mieux
// qu'une inventée.
const BOX: Box = { width: 443, height: 900 };

// `CallLayout` est une union discriminée : sans partage d'écran ni épinglage,
// ces tests observent toujours le mode `grid`. L'aide rétrécit et jette avec le
// mode réellement obtenu, plutôt qu'un `as` qui mentirait.
function asGrid(layout: CallLayout | null): Extract<CallLayout, { mode: 'grid' }> {
  if (layout === null || layout.mode !== 'grid') {
    throw new Error(`mode attendu 'grid', obtenu '${layout?.mode ?? 'null'}'`);
  }
  return layout;
}

describe('useCallLayout', () => {
  it('rend une disposition dès le premier rendu, sans attendre un événement', async () => {
    // Un écran qui attendrait une première notification de la Room resterait
    // noir jusqu'à ce que quelqu'un bouge — parfois jamais.
    const { room } = fakeRoom();

    const { result } = await renderHook(() => useCallLayout(room, 'user', BOX, null));

    expect(asGrid(result.current).tiles.map((t) => t.key)).toEqual(['me:camera']);
  });

  it('ne rend aucune disposition tant que la boîte n’est pas mesurée', async () => {
    // Il n'y a pas de disposition possible sans savoir dans quoi on dispose :
    // le nombre de tuiles, leur taille et l'axe de la bande en descendent tous
    // les trois. Une valeur inventée en attendant ferait sauter la disposition
    // une trame plus tard, sous une vidéo en cours de lecture.
    const { room } = fakeRoom();

    const { result } = await renderHook(() => useCallLayout(room, 'user', null, null));

    expect(result.current).toBeNull();
  });

  it('rend la disposition dès que la boîte arrive, sans remonter la Room', async () => {
    // L'autre côté de la paire : MÊME Room, MÊME appel, seule la boîte change.
    // C'est la paire qui prouve que `box` est câblée, pas l'un des deux tests
    // pris seul.
    const { room } = fakeRoom();
    const { result, rerender } = await renderHook(
      ({ box }: { box: Box | null }) => useCallLayout(room, 'user', box, null),
      { initialProps: { box: null as Box | null } },
    );
    expect(result.current).toBeNull();

    await rerender({ box: BOX });

    expect(asGrid(result.current).tiles[0]?.key).toBe('me:camera');
  });

  it('suit l’arrivée d’un participant annoncée par la Room', async () => {
    const { room, remotes, emit } = fakeRoom();
    const { result } = await renderHook(() => useCallLayout(room, 'user', BOX, null));

    await act(async () => {
      remotes.set('bob', person('bob'));
      emit('participantConnected');
    });

    expect(asGrid(result.current).tiles.map((tile) => tile.key)).toEqual([
      'me:camera',
      'bob:camera',
    ]);
  });

  it('refait la sélection quand la caméra change de face', async () => {
    const { room, remotes } = fakeRoom();
    remotes.set('bob', person('bob'));
    const { result, rerender } = await renderHook(
      ({ facing }: { facing: FacingMode }) => useCallLayout(room, facing, BOX, null),
      { initialProps: { facing: 'user' as FacingMode } },
    );
    expect(asGrid(result.current).tiles[0]?.mirror).toBe(true);

    await rerender({ facing: 'environment' });

    expect(asGrid(result.current).tiles[0]?.mirror).toBe(false);
  });

  it('détache ses gestionnaires au démontage', async () => {
    // Sans cela, chaque passage sur l'écran laisse une Room qui rappelle un
    // composant démonté à chaque piste publiée par n'importe qui.
    const { room, subscribedEvents } = fakeRoom();
    const { unmount } = await renderHook(() => useCallLayout(room, 'user', BOX, null));
    expect(subscribedEvents()).not.toEqual([]);

    await unmount();

    expect(subscribedEvents()).toEqual([]);
  });
});
