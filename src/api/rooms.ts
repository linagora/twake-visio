import { anonFetch } from 'src/api/anon';
import { authedFetch } from 'src/api/client';
import type { ParticipantRole } from 'src/api/participants';
import { generateRoomCode } from 'src/api/roomCode';
import type { ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';
import { visitorName, visitorServerUrl, type Visitor } from 'src/auth/visitor';
import type { AccessLevel, Room, RoomAccess } from 'src/call/types';

type RawRoom = {
  id: string | null;
  slug: string;
  name?: string;
  access_level: AccessLevel;
  livekit?: { url: string; room: string; token: string };
  is_administrable?: boolean;
};

function toRoom(raw: RawRoom): Room {
  return {
    id: raw.id,
    slug: raw.slug,
    name: raw.name ?? raw.slug,
    accessLevel: raw.access_level,
  };
}

// Le branchement compte / invité, en UN seul endroit du dépôt.
//
// `username` ne part QUE pour un invité : sur le chemin authentifié, meet tire
// le nom du jeton porteur, et lui en passer un autre le laisserait choisir
// lequel croire.
async function visitorFetch<T>(
  visitor: Visitor,
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  if (visitor.kind === 'account') return await authedFetch<T>(visitor.account, path, init);
  return await anonFetch<T>(visitorServerUrl(visitor), path, init);
}

export async function fetchRoomAccess(
  visitor: Visitor,
  slug: string,
): Promise<ApiResult<RoomAccess>> {
  // Le nom vide n'ajoute AUCUN paramètre plutôt qu'un paramètre vide : meet
  // retomberait alors sur « Anonymous », ce qu'il fait déjà sans le paramètre,
  // mais une chaîne vide dans l'URL se lirait comme un nom choisi.
  const name = visitor.kind === 'guest' ? visitorName(visitor) : '';
  const query = name.length > 0 ? `?username=${encodeURIComponent(name)}` : '';
  const result = await visitorFetch<RawRoom>(
    visitor,
    `/api/v1.0/rooms/${encodeURIComponent(slug)}/${query}`,
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
    value: {
      room: toRoom(result.value),
      livekitUrl: livekit.url,
      token: livekit.token,
      isAdministrable: result.value.is_administrable === true,
    },
  };
}

// Borne de sécurité : l'instance de production renvoie des dizaines de salons et
// rien ne garantit qu'un compte n'en ait pas des milliers. Sans plafond, l'écran
// d'accueil pourrait enchaîner les requêtes indéfiniment au montage.
const MAX_ROOM_PAGES = 20;

// `next` est une URL absolue. On ne la suit que si elle porte sur la même
// origine que l'instance : la requête part avec le jeton porteur, et suivre une
// origine étrangère l'enverrait à un tiers.
function toSamePath(next: unknown, serverUrl: string): string | null {
  if (typeof next !== 'string' || next.length === 0) return null;
  try {
    const url = new URL(next);
    if (url.origin !== new URL(serverUrl).origin) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

// L'API pagine, et la version précédente ne lisait que `results` de la première
// page. Les salons étant rendus par ordre alphabétique de slug, l'accueil
// n'affichait que le début de l'alphabet : un salon nommé « Test mobile »
// n'apparaissait jamais, et le filtre répondait à juste titre qu'aucune réunion
// ne correspondait.
export async function fetchMyRooms(account: Account): Promise<ApiResult<readonly Room[]>> {
  const rooms: Room[] = [];
  let path: string | null = '/api/v1.0/rooms/';
  let pages = 0;

  while (path !== null && pages < MAX_ROOM_PAGES) {
    const result = await authedFetch<{ results: RawRoom[]; next?: unknown }>(account, path);
    if (!result.ok) {
      // Un échec sur la première page n'a rien à rendre. Sur une page suivante,
      // rendre ce qui est déjà là vaut mieux qu'une liste vide — mais jamais en
      // silence : une liste tronquée qui se présente comme complète est pire
      // qu'une liste courte annoncée.
      if (pages === 0) return result;
      console.error('[rooms] liste tronquée, page', pages + 1, 'en échec', result.error);
      break;
    }
    rooms.push(...result.value.results.map(toRoom));
    path = toSamePath(result.value.next, account.instance.serverUrl);
    pages += 1;
  }

  if (path !== null) {
    console.error('[rooms] liste tronquée au plafond de', MAX_ROOM_PAGES, 'pages');
  }
  return { ok: true, value: rooms };
}

// Le nom envoyé est un code tiré au sort, pas l'intitulé saisi.
//
// meet impose `slug = slugify(name)` — vérifié dans son modèle, l'affectation
// est inconditionnelle et écrase tout slug fourni — et le routeur de son client
// web n'accepte que la forme `xxx-yyyy-zzz`. Un salon nommé « Test mobile »
// recevait donc le slug `test-mobile`, que le web refuse : la réunion existait
// mais restait injoignable depuis un navigateur, et son lien impartageable.
//
// L'intitulé lisible est conservé à part, par `src/rooms/titles`. Il ne suit
// pas la réunion : c'est le prix de ce modèle, et il est documenté là-bas.
//
// Effet de bord bienvenu : le code ne dépendant plus du nom, deux réunions
// peuvent porter le même intitulé sans que la seconde échoue sur « Room with
// this Slug already exists ».
export async function createRoom(
  account: Account,
  input: { name: string; accessLevel: AccessLevel },
): Promise<ApiResult<Room>> {
  const result = await authedFetch<RawRoom>(account, '/api/v1.0/rooms/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: generateRoomCode(), access_level: input.accessLevel }),
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
  role: ParticipantRole,
): Promise<ApiResult<void>> {
  const result = await authedFetch<unknown>(account, '/api/v1.0/resource-accesses/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ resource: roomId, user: userId, role }),
  });
  if (!result.ok) return result;
  return { ok: true, value: undefined };
}

export type EntryStatus = 'waiting' | 'accepted' | 'denied';

export type EntryOutcome = {
  readonly participantId: string;
  readonly status: EntryStatus;
  readonly livekitUrl: string | null;
  readonly token: string | null;
};

type RawEntry = {
  id: string;
  status?: string;
  livekit?: { url: string; room: string; token: string };
};

// Un statut que ce code ne connaît pas est traité comme une attente. Le prendre
// pour une admission ferait entrer sans jeton ; le prendre pour un refus
// chasserait quelqu'un que le serveur n'a pas chassé.
function toEntryStatus(raw: string | undefined): EntryStatus {
  if (raw === 'accepted') return 'accepted';
  if (raw === 'denied') return 'denied';
  return 'waiting';
}

// L'endpoint est conçu pour être rappelé — « if waiting, refresh timeout to
// maintain position » — et porte à lui seul l'admission, le refus et le jeton.
// C'est donc lui qu'il faut scruter, et non `fetchRoomAccess`, qui ne change
// pas sur un refus.
export async function requestEntry(
  visitor: Visitor,
  slug: string,
  username: string,
): Promise<ApiResult<EntryOutcome>> {
  const result = await visitorFetch<RawEntry>(
    visitor,
    `/api/v1.0/rooms/${encodeURIComponent(slug)}/request-entry/`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username }),
    },
  );
  if (!result.ok) return result;

  return {
    ok: true,
    value: {
      participantId: result.value.id,
      status: toEntryStatus(result.value.status),
      livekitUrl: result.value.livekit?.url ?? null,
      token: result.value.livekit?.token ?? null,
    },
  };
}
