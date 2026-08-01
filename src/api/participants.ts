import { authedFetch, livekitFetch } from 'src/api/client';
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

// La seule des quatre actions qui ne passe PAS par le porteur OIDC, et la
// seule qui exige un second champ. Les deux ont été mesurés sur une instance
// réelle, pas lus dans une documentation :
//
// 1. Sondage des routes sans jeton — `remove-participant/`, `enter/`,
//    `waiting-participants/` et `update-participant/` répondent 401, mais
//    `mute-participant/` répond 404 `{"detail":"No Room matches the given
//    query."}` : elle résout l'objet AVANT d'authentifier, parce que sa pile
//    d'authentification n'est pas la même (`LiveKitTokenAuthentication` en
//    tête, cf. `viewsets.py` de suitenumerique/meet). Une route inventée rend,
//    elle, la page HTML de Django — c'est le CORPS qui distingue les deux 404,
//    jamais le statut.
// 2. Avec le porteur OIDC, l'appel rendait **403** sur un salon dont
//    `is_administrable` vaut pourtant `true` — établi en constatant qu'une
//    EXPULSION, gardée par `HasPrivilegesOnRoom` seule, réussissait au même
//    instant sur le même salon avec le même compte. Les droits étaient donc
//    bons ; c'est le justificatif qui ne l'était pas.
//
// `CanMuteParticipant` accepte le jeton LiveKit dès lors qu'il est émis pour
// CE salon (`request.auth.video.room == str(obj.id)`) — celui-là même qui a
// servi à rejoindre la séance. Réserve assumée : sur un salon configuré
// `everyone_can_mute: false`, ce chemin refuse là où le porteur OIDC d'un
// administrateur passerait sur `main`. Le porteur OIDC ne marchant pas sur
// l'instance mesurée, il n'existe aucun justificatif correct dans les deux cas
// à la fois ; on prend celui qui fonctionne, et le défaut du serveur est
// `everyone_can_mute: true`.
//
// `track_sid` vient de `ParticipantView.micTrackSid`. Sans lui,
// `MuteParticipantSerializer` refuse la requête — un 400 que le 403 masquait.
export async function muteParticipant(
  serverUrl: string,
  livekitToken: string,
  roomId: string,
  identity: string,
  trackSid: string,
): Promise<ApiResult<void>> {
  return toVoid(
    await livekitFetch(serverUrl, livekitToken, roomId, 'mute-participant', {
      participant_identity: identity,
      track_sid: trackSid,
    }),
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
