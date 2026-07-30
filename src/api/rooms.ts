import { authedFetch } from 'src/api/client';
import type { ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';
import type { AccessLevel, Room, RoomAccess } from 'src/call/types';

type RawRoom = {
  id: string | null;
  slug: string;
  name?: string;
  access_level: AccessLevel;
  livekit?: { url: string; room: string; token: string };
};

type RoomRole = 'owner' | 'administrator' | 'member';

function toRoom(raw: RawRoom): Room {
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name ?? raw.slug,
    accessLevel: raw.access_level,
  };
}

export async function fetchRoomAccess(
  account: Account,
  slug: string,
): Promise<ApiResult<RoomAccess>> {
  const result = await authedFetch<RawRoom>(
    account,
    `/api/v1.0/rooms/${encodeURIComponent(slug)}/`,
  );
  if (!result.ok) return result;

  // Le backend n'inclut le bloc livekit que si l'appelant a droit d'entrer.
  // Son absence signifie que le salon exige un passage par la salle d'attente.
  const livekit = result.value.livekit;
  if (livekit === undefined) {
    return { ok: false, error: { kind: 'lobby', participantId: '' } };
  }

  return {
    ok: true,
    value: { room: toRoom(result.value), livekitUrl: livekit.url, token: livekit.token },
  };
}

export async function fetchMyRooms(account: Account): Promise<ApiResult<readonly Room[]>> {
  const result = await authedFetch<{ results: RawRoom[] }>(account, '/api/v1.0/rooms/');
  if (!result.ok) return result;
  return { ok: true, value: result.value.results.map(toRoom) };
}

export async function createRoom(
  account: Account,
  input: { name: string; accessLevel: AccessLevel },
): Promise<ApiResult<Room>> {
  const result = await authedFetch<RawRoom>(account, '/api/v1.0/rooms/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: input.name, access_level: input.accessLevel }),
  });
  if (!result.ok) return result;
  return { ok: true, value: toRoom(result.value) };
}

// perform_create n'attribue le rôle owner qu'au créateur. Sans cet appel, la
// personne pour qui la réunion est organisée n'a aucun droit de modération.
export async function grantRoomAccess(
  account: Account,
  roomId: string,
  userId: string,
  role: RoomRole,
): Promise<ApiResult<void>> {
  const result = await authedFetch<unknown>(account, '/api/v1.0/resource-accesses/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resource: roomId, user: userId, role }),
  });
  if (!result.ok) return result;
  return { ok: true, value: undefined };
}

export async function requestEntry(
  account: Account,
  slug: string,
  username: string,
): Promise<ApiResult<{ participantId: string }>> {
  const result = await authedFetch<{ id: string }>(
    account,
    `/api/v1.0/rooms/${encodeURIComponent(slug)}/request-entry/`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username }),
    },
  );
  if (!result.ok) return result;
  return { ok: true, value: { participantId: result.value.id } };
}
