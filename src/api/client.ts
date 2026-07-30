import type { ApiError, ApiResult } from 'src/api/types';
import type { Account } from 'src/auth/accounts';
import { forceRefresh, getAccessToken, type RefreshOutcome } from 'src/auth/session';
import { REQUEST_TIMEOUT_MS } from 'src/constants';

type RefreshRefusal = Extract<RefreshOutcome, { ok: false }>['reason'];

// Une indisponibilité du SSO doit se lire comme une panne, pas comme une
// session expirée : sinon l'utilisateur va se reconnecter contre un serveur
// incapable de l'authentifier, et recommence en boucle.
function mapRefusal(reason: RefreshRefusal): ApiError {
  return reason === 'unavailable' ? { kind: 'network' } : { kind: 'unauthorized' };
}

// Un 5xx ou tout autre statut non mappé reste distinct de `unauthorized` /
// `forbidden` : contrairement à src/auth/oidc.ts, qui réduit tout non-2xx à
// `invalid_grant`, ici une panne serveur ne doit jamais se lire comme un refus.
// Un 400 de Django REST Framework porte un objet dont chaque clé est un champ
// refusé et chaque valeur la liste des raisons. Le corps est lu ici parce que
// c'est la seule information exploitable de cette réponse : le statut seul dit
// « requête invalide » sans dire en quoi, et l'écran ne peut alors que proposer
// de réessayer à l'identique.
//
// La forme est vérifiée avant d'être annoncée : un 400 qui ne suit pas cette
// convention — une page HTML d'un proxy, par exemple — retombe sur `server`
// plutôt que de se faire passer pour une erreur de champ.
async function readValidation(response: Response): Promise<ApiResult<never>> {
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    return { ok: false, error: { kind: 'server', status: 400 } };
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: { kind: 'server', status: 400 } };
  }

  const fields: Record<string, readonly string[]> = {};
  for (const [field, reasons] of Object.entries(raw)) {
    if (Array.isArray(reasons) && reasons.every((reason) => typeof reason === 'string')) {
      fields[field] = reasons;
    }
  }

  if (Object.keys(fields).length === 0) {
    return { ok: false, error: { kind: 'server', status: 400 } };
  }
  return { ok: false, error: { kind: 'validation', fields } };
}

function mapStatus(status: number): ApiResult<never> {
  if (status === 403) return { ok: false, error: { kind: 'forbidden' } };
  if (status === 404) return { ok: false, error: { kind: 'not-found' } };
  return { ok: false, error: { kind: 'server', status } };
}

export async function authedFetch<T>(
  account: Account,
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  const url = `${account.instance.serverUrl}${path}`;

  const send = async (token: string): Promise<Response> =>
    fetch(url, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

  const initial = await getAccessToken(account.id, account.instance);
  if (!initial.ok) return { ok: false, error: mapRefusal(initial.reason) };
  let token = initial.token;

  let response: Response;
  try {
    response = await send(token);

    // Un seul rejeu : au-delà, le refus est structurel et non transitoire.
    // Reboucler ne ferait que marteler le SSO sans jamais réussir.
    if (response.status === 401) {
      const refreshed = await forceRefresh(account.id, account.instance);
      if (!refreshed.ok) return { ok: false, error: mapRefusal(refreshed.reason) };
      token = refreshed.token;
      response = await send(token);
      if (response.status === 401) {
        return { ok: false, error: { kind: 'unauthorized' } };
      }
    }
  } catch {
    // Un fetch qui rejette est une panne réseau, jamais un statut serveur :
    // ce chemin ne recouvre pas celui des réponses HTTP non-2xx ci-dessous.
    return { ok: false, error: { kind: 'network' } };
  }

  if (response.status === 400) return await readValidation(response);
  if (!response.ok) return mapStatus(response.status);

  try {
    return { ok: true, value: (await response.json()) as T };
  } catch {
    return { ok: false, error: { kind: 'server', status: response.status } };
  }
}
