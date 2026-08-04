import { readResponse } from 'src/api/client';
import type { ApiResult } from 'src/api/types';
import { REQUEST_TIMEOUT_MS } from 'src/constants';

// Une requête SANS aucune identité.
//
// Mesuré le 2026-08-04 sur meet.linagora.com, sans en-tête d'autorisation :
// `GET /api/v1.0/rooms/<slug>/?username=…` rend 200 et un jeton LiveKit complet
// sur un salon public, et `POST …/request-entry/` rend 200 également. Le
// backend n'a donc rien à changer pour qu'un invité entre.
//
// AUCUN rejeu de 401, à la différence d'`authedFetch` : il n'y a pas de jeton à
// rafraîchir, et rejouer à l'identique ne ferait que doubler la requête.
//
// AUCUN en-tête `authorization`, et c'est le point : en poser un, fût-il vide,
// ferait basculer meet sur son chemin authentifié, qui refuserait.
export async function anonFetch<T>(
  serverUrl: string,
  path: string,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${serverUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: { kind: 'network' } };
  }

  // Le 401 est traduit ICI, et non dans `mapStatus` que partage tout le monde.
  //
  // Sur une requête anonyme il n'a qu'un sens possible — « cette ressource
  // exige un compte » — et c'est ce que l'écran doit pouvoir dire. `mapStatus`
  // le laisse tomber dans `server`, ce qui est juste pour `livekitFetch`, dont
  // le porteur EXISTE et dont un 401 signale un jeton de salle périmé, pas une
  // authentification manquante. Deux causes différentes sous un même code : les
  // confondre ferait proposer « se connecter » au milieu d'une séance.
  if (response.status === 401) return { ok: false, error: { kind: 'unauthorized' } };

  return await readResponse<T>(response);
}
