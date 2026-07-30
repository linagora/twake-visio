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
// Les événements du serveur ne publient que s'ils proviennent de l'ère
// courante — la même garde de génération que les commandes. Un `Disconnected`
// tardif issu d'une connexion abandonnée ne rature donc pas une nouvelle
// tentative, et un `Reconnecting` reçu hors séance ne fige pas la session dans
// un état d'où `connect()` est refusé.
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

  // L'ère qui possède la connexion vivante, `null` tant qu'aucune tentative
  // n'a abouti. C'est ce qui met les événements du serveur sous la *même*
  // garde que les commandes : toute commande ouvre une nouvelle ère, ce qui
  // orpheline la connexion précédente, et un événement issu d'une ère périmée
  // ne publie plus rien.
  let established: number | null = null;

  function setState(next: CallState): void {
    state = next;
    // Copie de la liste : un abonné qui se désabonne — ou en abonne un autre —
    // en recevant l'état ne doit pas changer qui reçoit *cette* notification.
    for (const listener of Array.from(listeners)) {
      try {
        listener(next);
      } catch (err: unknown) {
        // Un abonné qui lève ne doit pas arrêter la machine à états. Sans ce
        // filet, une erreur de rendu remontait jusqu'au `setState('connecting')`
        // initial : `room.connect()` n'était jamais appelé, l'état restait
        // `connecting` sans issue, `connect()` rejetait — perçant le contrat
        // « ne rejette jamais » — et les abonnés suivants n'étaient plus
        // notifiés alors que `state` avait avancé.
        //
        // Signalé plutôt qu'avalé : le défaut est chez l'abonné, et l'étouffer
        // le rendrait indiagnosticable. `console.error` est autorisé par
        // `eslint.config.js` et n'interrompt pas l'exécution, contrairement à
        // un jet différé qui ferait tomber l'application en production.
        console.error('[call] un abonné a levé en recevant un état', err);
      }
    }
  }

  // Vrai seulement quand la connexion vivante appartient à l'ère courante.
  // Faux avant toute connexion, après un raccrochage, et pour tout événement
  // qu'une commande plus récente a rendu caduc.
  function ownsLiveConnection(): boolean {
    return established === generation;
  }

  function onReconnecting(): void {
    if (!ownsLiveConnection()) return;
    setState({ status: 'reconnecting' });
  }

  // Sans ce retour à `connected`, l'écran resterait bloqué sur « reconnexion »
  // alors que la séance a repris.
  function onReconnected(): void {
    if (!ownsLiveConnection()) return;
    setState({ status: 'connected' });
  }

  function onDisconnected(): void {
    if (!ownsLiveConnection()) return;
    // La séance est finie : refermer l'ère. Sans cela un `Reconnecting` tardif
    // ferait repartir la machine de `disconnected` vers `reconnecting`, état
    // depuis lequel `connect()` est refusé — la session serait figée.
    generation += 1;
    setState({ status: 'disconnected', reason: 'closed' });
  }

  room.on(RoomEvent.Reconnecting, onReconnecting);
  room.on(RoomEvent.Reconnected, onReconnected);
  room.on(RoomEvent.Disconnected, onDisconnected);

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
    // Cette ère possède désormais la connexion : les événements du serveur qui
    // en proviennent seront publiés, ceux d'une ère précédente non.
    if (outcome.status === 'connected') established = era;
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
    try {
      // `Room.disconnect()` émet lui-même `RoomEvent.Disconnected`. La
      // nouvelle ère ouverte juste au-dessus l'orpheline, donc un raccrochage
      // volontaire ne fait plus clignoter `disconnected` — que l'UI lit comme
      // une erreur — avant `idle`. C'est ce que faisait un drapeau ad hoc, que
      // la garde de génération remplace.
      await room.disconnect();
    } catch {
      // Une coupure qui échoue laisse tout de même la séance terminée côté
      // application : garder l'état précédent bloquerait l'écran sur un appel
      // dont plus rien ne sort, sans aucun recours pour l'utilisateur.
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
