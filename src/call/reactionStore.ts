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

// `chatStore` évite le doublon de gestionnaire via `registerTextStreamHandler`,
// qui JETTE si un gestionnaire existe déjà pour le topic — `unregister` d'abord
// rend l'invariant « un seul enregistrement » vrai PAR CONSTRUCTION. `room.on`
// n'a pas cette notion : il est ADDITIF, deux appels empilent deux
// gestionnaires au lieu que le second remplace le premier, et rien ne jette
// jamais. Un simple `room.off(RoomEvent.DataReceived, handleData)` juste avant
// le `on`, comme le fait `chatStore` pour son propre gestionnaire, ne
// suffirait pas : `handleData` est une fermeture NEUVE à chaque appel de
// `createReactionStore`, donc `off` ne peut désigner que CELLE-CI, jamais
// celle d'un appel précédent — elle n'a encore rien à retirer.
//
// Il faut donc une mémoire qui survit à l'appel, tenue ici plutôt que dans le
// SDK : `activeHandlers` retient, par `Room`, la dernière fermeture posée par
// ce module. Une construction qui en trouve une la détache avant de poser la
// sienne — même invariant que `chatStore` (un seul gestionnaire actif),
// obtenu par un mécanisme différent parce que l'API sous-jacente diffère. Même
// hasard que lui, aussi : sans cela, le double appel de l'initialiseur d'un
// `useState` en mode strict laisserait le gestionnaire de l'instance jetée
// attaché à la Room pour toujours — capable, avec elle, de rearmer un
// intervalle de purge que plus personne ne peut atteindre. Un `WeakMap`, pas
// un `Map` : une Room qu'on ne revoit jamais ne doit pas retenir sa fermeture
// indéfiniment.
const activeHandlers = new WeakMap<
  Room,
  (payload: Uint8Array, participant?: RemoteParticipant) => void
>();

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
  // Terminal, comme `chatStore.disposed` — pour une raison différente de la
  // sienne : `getSnapshot()` ici rend `reactions` directement, sans
  // instantané mis en cache à protéger d'une dérive de référence. Le seul
  // gain est d'éviter du travail inutile dans `send()` (voir plus bas) pour
  // un magasin que l'écran a déjà lâché.
  let disposed = false;

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

  // Voir le commentaire au-dessus d'`activeHandlers`. Lire l'ancienne
  // fermeture AVANT d'écrire la nôtre, jamais l'inverse : sinon
  // `previousHandler` désignerait la nôtre, pas celle d'un appel précédent.
  const previousHandler = activeHandlers.get(room);
  if (previousHandler !== undefined) room.off(RoomEvent.DataReceived, previousHandler);
  activeHandlers.set(room, handleData);
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
        await room.localParticipant.publishData(new TextEncoder().encode(encodeReaction(key)), {
          reliable: true,
        });
      } catch {
        return false;
      }

      // La publication a réussi : le message est bien parti, quoi qu'il
      // arrive ensuite. Mais si `dispose()` s'est intercalé pendant l'attente,
      // ajouter quand même l'écho ne servirait à personne — voir le
      // commentaire sur `disposed` plus haut — donc `true` reste la bonne
      // valeur de retour sans que le reste s'exécute.
      if (disposed) return true;

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
      disposed = true;
      room.off(RoomEvent.DataReceived, handleData);
      if (pruneTimer !== null) {
        clearInterval(pruneTimer);
        pruneTimer = null;
      }
      listeners.clear();
    },
  };
}
