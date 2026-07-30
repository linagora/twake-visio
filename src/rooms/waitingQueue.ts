import type { WaitingParticipant } from 'src/api/participants';

// Le serveur rend une liste, pas un flux. La fusion préserve l'ordre déjà connu
// et ajoute les nouveaux à la fin : réordonner ferait changer de personne sous
// le doigt qui s'apprête à répondre.
export function mergeWaiting(
  current: readonly WaitingParticipant[],
  fetched: readonly WaitingParticipant[],
): readonly WaitingParticipant[] {
  const byId = new Map(fetched.map((participant) => [participant.id, participant]));
  const kept: WaitingParticipant[] = [];

  for (const known of current) {
    const fresh = byId.get(known.id);
    if (fresh === undefined) continue;
    kept.push(fresh);
    byId.delete(known.id);
  }

  return [...kept, ...byId.values()];
}

export function firstWaiting(queue: readonly WaitingParticipant[]): WaitingParticipant | null {
  return queue[0] ?? null;
}

export function withoutParticipant(
  queue: readonly WaitingParticipant[],
  id: string,
): readonly WaitingParticipant[] {
  return queue.filter((participant) => participant.id !== id);
}
