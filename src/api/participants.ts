import { authedFetch } from 'src/api/client';
import type { ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';

// Une personne en attente est une UUID côté lobby ; une personne connectée est
// une identité LiveKit. Les deux ne s'échangent pas — les confondre produit des
// 404 silencieux. Les signatures les gardent distinctes.
export type WaitingParticipant = {
  readonly id: string;
  readonly username: string;
};

export type ParticipantRole = 'owner' | 'administrator' | 'member';

function post(
  account: Account,
  roomId: string,
  path: string,
  body: unknown,
): Promise<ApiResult<unknown>> {
  return authedFetch<unknown>(account, `/api/v1.0/rooms/${encodeURIComponent(roomId)}/${path}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function toVoid(result: ApiResult<unknown>): ApiResult<void> {
  if (!result.ok) return result;
  return { ok: true, value: undefined };
}

export async function listWaitingParticipants(
  account: Account,
  roomId: string,
): Promise<ApiResult<readonly WaitingParticipant[]>> {
  const result = await authedFetch<{ participants?: WaitingParticipant[] }>(
    account,
    `/api/v1.0/rooms/${encodeURIComponent(roomId)}/waiting-participants/`,
  );
  if (!result.ok) return result;
  return { ok: true, value: result.value.participants ?? [] };
}

// Admettre et refuser sont le même endpoint : `allow_entry` les sépare. Prend
// l'UUID du lobby (`participant_id`), jamais une identité LiveKit.
export async function answerEntry(
  account: Account,
  roomId: string,
  participantId: string,
  allow: boolean,
): Promise<ApiResult<void>> {
  return toVoid(
    await post(account, roomId, 'enter', {
      participant_id: participantId,
      allow_entry: allow,
    }),
  );
}

export async function muteParticipant(
  account: Account,
  roomId: string,
  identity: string,
): Promise<ApiResult<void>> {
  return toVoid(
    await post(account, roomId, 'mute-participant', { participant_identity: identity }),
  );
}

export async function removeParticipant(
  account: Account,
  roomId: string,
  identity: string,
): Promise<ApiResult<void>> {
  return toVoid(
    await post(account, roomId, 'remove-participant', { participant_identity: identity }),
  );
}

export async function updateParticipantRole(
  account: Account,
  roomId: string,
  identity: string,
  role: ParticipantRole,
): Promise<ApiResult<void>> {
  return toVoid(
    await post(account, roomId, 'update-participant-role', {
      participant_identity: identity,
      role,
    }),
  );
}
