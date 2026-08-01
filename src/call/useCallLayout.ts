import type { Room } from 'livekit-client';
import { useMemo, useSyncExternalStore } from 'react';

import type { Box } from 'src/call/grid';
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
export function useCallLayout(
  room: Room,
  facing: FacingMode,
  // La boîte mesurée par `onLayout`, ou `null` tant que la mesure n'est pas
  // arrivée — ce qui dure une trame, et se voit à côté des secondes de
  // négociation WebRTC qui précèdent.
  box: Box | null,
  // Une clé de tuile, ou `null` : relayée telle quelle à `selectLayout`, jamais
  // décidée ici. Voir `src/call/layout.ts`.
  pin: string | null,
): CallLayout | null {
  // Le magasin ne retient rien tant que personne ne s'y abonne — c'est React
  // qui appelle `subscribe` et son nettoyage. Un `useMemo` jeté ne laisse donc
  // aucun gestionnaire derrière lui, contrairement à une session d'appel.
  const store = useMemo(() => createRoomViewStore(room), [room]);
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot);

  // Les DEUX NOMBRES en dépendance, jamais l'objet : `onLayout` reconstruit un
  // objet à chaque mesure, même quand la boîte n'a pas bougé d'un dp. Comparer
  // l'identité referait donc toute la sélection — et toutes les tuiles — à
  // chaque trame que la coquille remesure.
  const width = box?.width ?? null;
  const height = box?.height ?? null;

  return useMemo(
    () =>
      width === null || height === null ? null : selectLayout(view, facing, { width, height }, pin),
    [view, facing, width, height, pin],
  );
}
