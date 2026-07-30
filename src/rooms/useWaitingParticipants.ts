import { useCallback, useEffect, useState } from 'react';

import {
  answerEntry,
  listWaitingParticipants,
  type WaitingParticipant,
} from 'src/api/participants';
import type { ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';
import { mergeWaiting, withoutParticipant } from 'src/rooms/waitingQueue';

// Cinq secondes. L'endpoint est limité à 150 requêtes par minute et par
// utilisateur : douze laissent un ordre de grandeur de marge. Plus court
// martèlerait le serveur pour un événement rare ; plus long laisse quelqu'un
// devant une porte sans savoir si on l'a entendu.
const WAITING_POLL_MS = 5000;

export type WaitingParticipants = {
  readonly waiting: readonly WaitingParticipant[];
  // Rend le résultat du réseau plutôt que de l'avaler : `ApiResult<void>`
  // rend son échec ordinaire comme une valeur (`{ ok: false }`), jamais
  // comme un rejet, et le hook n'a pas d'écran à lui pour l'afficher. C'est
  // à l'appelant (`call.tsx`) de lire `result.ok` et de brancher l'échec sur
  // le mécanisme d'affichage qu'il a déjà pour ses propres actions de
  // modération.
  readonly answer: (id: string, allow: boolean) => Promise<ApiResult<void>>;
};

export function useWaitingParticipants(
  account: Account,
  roomId: string,
  enabled: boolean,
): WaitingParticipants {
  const [waiting, setWaiting] = useState<readonly WaitingParticipant[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    // `setInterval` relance un appel sans attendre la résolution du
    // précédent : sur un réseau lent, un tour peut répondre après un tour
    // plus récent que lui. Appliquer cette réponse périmée par-dessus un état
    // plus frais ferait réapparaître, comme nouvelle arrivante, une personne
    // qu'un tour plus récent a déjà retirée — par exemple quelqu'un que
    // l'autre modérateur vient d'admettre. Seule la réponse du tour le plus
    // récemment émis compte : `latestSeq` la désigne.
    let latestSeq = 0;
    const timer = setInterval(() => {
      const seq = ++latestSeq;
      void listWaitingParticipants(account, roomId)
        .then((result) => {
          if (stopped || !result.ok || seq !== latestSeq) return;
          setWaiting((current) => mergeWaiting(current, result.value));
        })
        .catch(() => undefined);
    }, WAITING_POLL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [account, roomId, enabled]);

  const answer = useCallback(
    (id: string, allow: boolean): Promise<ApiResult<void>> => {
      // Retiré tout de suite : la personne a répondu, et attendre le prochain
      // tour laisserait le bandeau proposer une décision déjà prise. Le
      // résultat du réseau est rendu tel quel, pas avalé par un `.catch` qui
      // ne verrait de toute façon jamais passer l'échec ordinaire
      // d'`answerEntry` — voir `WaitingParticipants.answer` ci-dessus.
      setWaiting((current) => withoutParticipant(current, id));
      return answerEntry(account, roomId, id, allow);
    },
    [account, roomId],
  );

  return { waiting, answer };
}
