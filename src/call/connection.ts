import { Room, RoomEvent } from 'livekit-client';

import type { CallState, RoomAccess } from 'src/call/types';

export type CallListener = (state: CallState) => void;

export type CallSession = {
  connect: (access: RoomAccess) => Promise<void>;
  disconnect: () => Promise<void>;
  subscribe: (listener: CallListener) => () => void;
  getState: () => CallState;
  getRoom: () => Room;
};

// Ce module ne connaît ni OIDC ni instance : il reçoit une URL et un jeton.
//
// La machine à états. Deux sources de transitions : les commandes de
// l'application, et les événements du serveur relayés par le SDK.
//
//   départ           déclencheur                    arrivée
//   ───────────────────────────────────────────────────────────────────────
//   idle             connect()                      connecting
//   disconnected     connect()                      connecting
//   connecting       room.connect() résolu           connected
//   connecting       room.connect() rejeté           disconnected (motif)
//   connected        RoomEvent.Reconnecting          reconnecting
//   reconnecting     RoomEvent.Reconnected           connected
//   connected        RoomEvent.Disconnected          disconnected (« closed »)
//   reconnecting     RoomEvent.Disconnected          disconnected (« closed »)
//   n'importe lequel disconnect()                    idle
//
// Aucune transition depuis `connected` ou `reconnecting` sur `connect()` : la
// séance est déjà ouverte. Aucune non plus tant qu'une tentative est en vol,
// et cet appel-là rend la promesse de la tentative en cours.
//
// `disconnected` porte toujours un motif, parce que l'écran doit pouvoir dire
// pourquoi la séance s'est arrêtée. `idle` est réservé à l'absence de séance :
// avant la première connexion, et après un raccrochage volontaire.
export function createCallSession(): CallSession {
  const room = new Room();
  const listeners = new Set<CallListener>();
  let state: CallState = { status: 'idle' };

  // Verrou de concurrence. On garde la promesse de la tentative en vol plutôt
  // qu'un simple booléen, pour la rendre aux appelants suivants : après son
  // `await`, chacun lit alors un état arrêté. Une garde qui se contenterait de
  // sortir résoudrait immédiatement le second appelant, qui croirait la
  // connexion finie alors qu'elle est encore en cours.
  let pending: Promise<void> | null = null;

  // Génération courante. Chaque commande — `connect()` comme `disconnect()` —
  // en ouvre une nouvelle, et le résultat d'une génération périmée ne publie
  // plus rien. Sans ce compteur, une connexion abandonnée qui se dénoue après
  // le raccrochage republierait `connected` et ferait rebasculer en séance un
  // écran que l'utilisateur vient de quitter.
  let generation = 0;

  // `Room.disconnect()` émet lui aussi `RoomEvent.Disconnected`. Sans ce
  // drapeau, un raccrochage volontaire ferait clignoter `disconnected` — que
  // l'UI lit comme une erreur — juste avant `idle`.
  let hangingUp = false;

  function setState(next: CallState): void {
    state = next;
    // Copie de la liste : un abonné qui se désabonne — ou en abonne un autre —
    // en recevant l'état ne doit pas changer qui reçoit *cette* notification.
    for (const listener of Array.from(listeners)) listener(next);
  }

  room.on(RoomEvent.Reconnecting, () => setState({ status: 'reconnecting' }));
  // Sans ce retour à `connected`, l'écran resterait bloqué sur « reconnexion »
  // alors que la séance a repris.
  room.on(RoomEvent.Reconnected, () => setState({ status: 'connected' }));
  room.on(RoomEvent.Disconnected, () => {
    if (hangingUp) return;
    setState({ status: 'disconnected', reason: 'closed' });
  });

  // Ne rejette jamais : l'issue d'une tentative est portée par l'état publié,
  // pas par la promesse. Tous les appelants concurrents reçoivent donc le même
  // contrat, et aucun rejet non capturé ne remonte d'un appel `void connect()`.
  async function attempt(access: RoomAccess, era: number): Promise<void> {
    setState({ status: 'connecting' });

    let outcome: CallState;
    try {
      await room.connect(access.livekitUrl, access.token);
      outcome = { status: 'connected' };
    } catch (err: unknown) {
      outcome = {
        status: 'disconnected',
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    if (era !== generation) return;
    setState(outcome);
  }

  function connect(access: RoomAccess): Promise<void> {
    if (pending !== null) return pending;
    // `reconnecting` compte comme une séance ouverte : le SDK est en train de
    // rétablir ce transport-là, en ouvrir un second le mettrait à la poubelle.
    if (state.status === 'connected' || state.status === 'reconnecting') {
      return Promise.resolve();
    }

    generation += 1;
    const era = generation;

    // Le verrou est posé sur la promesse d'`attempt`, puis levé par un
    // `finally` attaché après coup. Un nettoyage écrit à l'intérieur d'`attempt`
    // s'exécuterait avant la pose si `room.connect` levait de façon synchrone
    // (URL invalide), et le verrou resterait fermé pour toujours.
    const settled = attempt(access, era);
    pending = settled.finally(() => {
      // Une tentative périmée ne relâche pas un verrou qui ne lui appartient
      // plus : `disconnect()` l'a déjà relâché, et une nouvelle tentative a pu
      // en poser un autre depuis.
      if (era === generation) pending = null;
    });
    return pending;
  }

  async function disconnect(): Promise<void> {
    // Périmer la tentative en vol et relâcher le verrou avant d'appeler le SDK :
    // `Room.disconnect()` interrompt lui-même la connexion en cours via son
    // AbortController, il n'y a donc pas de transport orphelin à attendre.
    generation += 1;
    const era = generation;
    pending = null;
    hangingUp = true;
    try {
      await room.disconnect();
    } catch {
      // Une coupure qui échoue laisse tout de même la séance terminée côté
      // application : garder l'état précédent bloquerait l'écran sur un appel
      // dont plus rien ne sort, sans aucun recours pour l'utilisateur.
    } finally {
      hangingUp = false;
    }

    // Une coupure lente peut se terminer après qu'une nouvelle tentative a
    // repris la main. Publier `idle` raturerait alors le `connecting` de cette
    // tentative, et l'écran repartirait à zéro au milieu d'une connexion.
    if (era !== generation) return;
    setState({ status: 'idle' });
  }

  return {
    connect,
    disconnect,

    subscribe(listener: CallListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getState(): CallState {
      return state;
    },

    getRoom(): Room {
      return room;
    },
  };
}
