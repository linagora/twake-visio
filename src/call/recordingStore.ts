import { RoomEvent } from 'livekit-client';
import type { Room } from 'livekit-client';

import { deriveRecordingState, type RecordingState } from 'src/call/recording';

// Trois événements, trois motifs distincts. La liste est exportée et vérifiée
// nom par nom par son test, comme `ROOM_VIEW_EVENTS` : un événement oublié ne
// casse rien en développement, il fige simplement l'indicateur sur l'appareil
// de quelqu'un d'autre.
//
//   RoomMetadataChanged     — la source de vérité change.
//   RecordingStatusChanged  — `activeRecording` bascule ; c'est la seconde
//                             moitié de la règle `started && isRecording`.
//   Reconnected             — `emitWhenConnected` met les événements en tampon
//                             pendant une reconnexion et ne les rejoue qu'après
//                             avoir émis `Reconnected` ; hors de ces deux
//                             fenêtres, il les jette (`return false`). Une
//                             ligne de coût, une fenêtre de perte fermée.
export const RECORDING_EVENTS = [
  RoomEvent.RoomMetadataChanged,
  RoomEvent.RecordingStatusChanged,
  RoomEvent.Reconnected,
] as const;

// Le contrat de `useSyncExternalStore` : `getSnapshot()` doit rendre la *même*
// valeur tant que rien n'a bougé, sans quoi le rendu boucle.
export type RecordingStore = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => RecordingState;
};

export function createRecordingStore(room: Room): RecordingStore {
  const listeners = new Set<() => void>();
  let state: RecordingState | null = null;

  // Périmer plutôt que relire : la lecture n'a lieu qu'au prochain
  // `getSnapshot()`, donc une rafale d'événements ne parse pas les métadonnées
  // autant de fois qu'elle compte d'événements.
  function invalidate(): void {
    state = null;
    // Copie de la liste : un abonné qui se désabonne en recevant l'avis ne doit
    // pas changer qui reçoit *cet* avis-là.
    for (const listener of Array.from(listeners)) listener();
  }

  return {
    subscribe(onChange: () => void): () => void {
      if (listeners.size === 0) {
        for (const event of RECORDING_EVENTS) room.on(event, invalidate);
      }
      listeners.add(onChange);

      // Entre la lecture faite pendant le rendu et cette ligne, une métadonnée
      // a pu arriver sans que personne n'écoutât.
      state = null;

      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) {
          for (const event of RECORDING_EVENTS) room.off(event, invalidate);
        }
      };
    },

    // **Lit la Room directement.** N'attend aucun événement pour le premier
    // état : le SDK n'émet pas `RoomMetadataChanged` à la jonction (au premier
    // `handleRoomUpdate`, `oldRoom` est indéfini), alors que `room.metadata`
    // est juste dès cet instant. C'est ce qui fait que quelqu'un rejoignant une
    // réunion déjà enregistrée voit l'indicateur.
    getSnapshot(): RecordingState {
      if (state === null) {
        state = deriveRecordingState({
          metadata: room.metadata,
          isRecording: room.isRecording,
        });
      }
      return state;
    },
  };
}
