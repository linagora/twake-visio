import type { Room, TextStreamReader } from 'livekit-client';

import {
  appendMessage,
  CHAT_TOPIC,
  messageKey,
  unreadCount,
  type ChatMessage,
} from 'src/call/chat';

export type ChatSnapshot = {
  readonly log: readonly ChatMessage[];
  readonly unread: number;
};

// Le contrat de `useSyncExternalStore` : `getSnapshot()` doit rendre la *même*
// valeur tant que rien n'a bougé, sans quoi le rendu boucle. `send` et
// `markRead` sont sur le magasin plutôt que sur l'écran parce que le point de
// lecture et le fil vivent ici, et nulle part ailleurs.
export type ChatStore = {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => ChatSnapshot;
  // Ne rejette jamais — même contrat que `CallSession.connect`. `false` veut
  // dire « le message n'est pas parti » ; l'appelant garde alors le texte dans
  // la zone de saisie.
  send: (body: string) => Promise<boolean>;
  markRead: () => void;
  dispose: () => void;
};

export function createChatStore(room: Room): ChatStore {
  const listeners = new Set<() => void>();
  let log: readonly ChatMessage[] = [];
  // Les clés des messages déjà lus, jamais un horodatage : `sentAt` vient de
  // l'horloge de l'émetteur et n'est comparable à rien. Voir `unreadCount`.
  const readKeys = new Set<string>();
  let snapshot: ChatSnapshot | null = null;
  let disposed = false;

  function invalidate(): void {
    // Une lecture lancée avant `dispose()` peut se terminer après : prévenir
    // React d'un changement sur un magasin que l'écran a lâché n'apprend rien
    // à personne.
    if (disposed) return;
    snapshot = null;
    // Copie de la liste : un abonné qui se désabonne en recevant l'avis ne
    // doit pas changer qui reçoit *cet* avis-là.
    for (const listener of Array.from(listeners)) listener();
  }

  function receive(reader: TextStreamReader, participantInfo: { identity: string }): void {
    const { id, timestamp } = reader.info;
    const { identity } = participantInfo;
    // `participantInfo` ne porte QUE l'identité, jamais un `Participant` : le
    // nom se résout sur la Room, et il vaut `''` si la personne est déjà
    // partie. La coquille pose alors son propre repli.
    const name = room.getParticipantByIdentity(identity)?.name ?? '';

    reader
      .readAll()
      .then((body) => {
        log = appendMessage(log, {
          id,
          identity,
          name,
          body,
          sentAt: timestamp,
          editedAt: null,
          isLocal: false,
        });
        invalidate();
      })
      .catch((error: unknown) => {
        // Ce n'est l'action de personne : c'est le message d'un tiers,
        // malformé ou tronqué. Une Snackbar pour un incident que
        // l'utilisateur ne peut ni causer ni corriger est du bruit.
        // Journalisé, pas caché.
        console.error('chat: an incoming message could not be read', error);
      });
  }

  // Enregistré À LA CONSTRUCTION, pas à l'abonnement — et c'est la seule
  // différence de fond avec `createRoomViewStore` et `createRecordingStore`.
  // Ces deux-là projettent un ÉTAT : ils peuvent n'écouter qu'à partir du
  // premier abonné, puis périmer leur valeur pour rattraper le trou, parce que
  // la Room porte encore la vérité. Un message est un ÉVÉNEMENT : rien ne le
  // porte après son passage, il n'y a pas d'état présent à relire, et une
  // fenêtre sans écoute est une perte définitive.
  //
  // `registerTextStreamHandler` JETTE si un gestionnaire existe déjà pour le
  // topic (`DataStreamError`, `HandlerAlreadyRegistered`), tandis que
  // `unregisterTextStreamHandler` n'est qu'un `Map.delete` et ne jette jamais.
  // Les deux lignes dans cet ordre rendent l'invariant « un seul
  // enregistrement pour lk.chat » vrai PAR CONSTRUCTION — y compris quand
  // React appelle deux fois l'initialiseur d'un `useState` en mode strict.
  room.unregisterTextStreamHandler(CHAT_TOPIC);
  room.registerTextStreamHandler(CHAT_TOPIC, receive);

  return {
    subscribe(onChange: () => void): () => void {
      listeners.add(onChange);
      // Aucune péremption ici, contrairement aux deux autres magasins : leur
      // valeur vient de la Room et a pu changer sans personne pour l'écouter,
      // la nôtre vit dans cette fermeture et ne bouge que par `invalidate()`.
      return () => {
        listeners.delete(onChange);
      };
    },

    getSnapshot(): ChatSnapshot {
      if (snapshot === null) snapshot = { log, unread: unreadCount(log, readKeys) };
      return snapshot;
    },

    async send(body: string): Promise<boolean> {
      try {
        const info = await room.localParticipant.sendText(body, { topic: CHAT_TOPIC });
        // L'écho local est fabriqué APRÈS la résolution, depuis l'`id` et
        // l'horodatage que le SDK vient de rendre. Sans eux il faudrait
        // inventer un identifiant, et un identifiant inventé casserait la
        // règle d'édition d'`appendMessage`. LiveKit ne renvoie pas à
        // l'émetteur son propre paquet : il n'y a aucun doublon à craindre.
        log = appendMessage(log, {
          id: info.id,
          identity: room.localParticipant.identity,
          name: room.localParticipant.name ?? '',
          body,
          sentAt: info.timestamp,
          editedAt: null,
          isLocal: true,
        });
        invalidate();
        return true;
      } catch {
        return false;
      }
    },

    markRead(): void {
      // Marque lu ce qui est PRÉSENT, message par message.
      //
      // Le saut sur `isLocal` est une ÉCONOMIE, pas une garde, et aucun test ne
      // peut le faire rougir : `unreadCount` écarte déjà les siens, donc les
      // ajouter ici ne changerait aucun compte — seulement la taille de
      // l'ensemble, qui grossit déjà sans borne avec le fil. Mesuré : le
      // retirer laisse les 43 cas verts. C'est écrit pour qu'on ne cherche pas
      // le test manquant, qui n'existe pas.
      let changed = false;
      for (const message of log) {
        if (message.isLocal) continue;
        const key = messageKey(message);
        if (readKeys.has(key)) continue;
        readKeys.add(key);
        changed = true;
      }
      // Rien de neuf : ne pas périmer l'instantané, sans quoi
      // `useSyncExternalStore` reçoit un avis pour une valeur identique.
      if (!changed) return;
      invalidate();
    },

    dispose(): void {
      disposed = true;
      room.unregisterTextStreamHandler(CHAT_TOPIC);
      listeners.clear();
    },
  };
}
