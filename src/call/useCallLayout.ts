import type { Room } from 'livekit-client';
import { useMemo, useSyncExternalStore } from 'react';

import { selectLayout, type CallLayout } from 'src/call/layout';
import type { FacingMode } from 'src/call/media';
import { createRoomViewStore } from 'src/call/participants';

// Le seul point de contact entre la Room et le rendu. Il n'y a aucune règle
// ici : la lecture est dans `src/call/participants`, la décision dans
// `src/call/layout`, et l'écran ne reçoit qu'une liste de vignettes.
//
// `useSyncExternalStore` plutôt qu'un `useEffect` qui poserait l'état : c'est
// lui qui referme le trou entre la lecture faite pendant le rendu et l'attache
// des gestionnaires, en relisant juste après l'abonnement.
export function useCallLayout(room: Room, facing: FacingMode): CallLayout {
  // Le magasin ne retient rien tant que personne ne s'y abonne — c'est React
  // qui appelle `subscribe` et son nettoyage. Un `useMemo` jeté ne laisse donc
  // aucun gestionnaire derrière lui, contrairement à une session d'appel.
  const store = useMemo(() => createRoomViewStore(room), [room]);
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return useMemo(() => selectLayout(view, facing), [view, facing]);
}
