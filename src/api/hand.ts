import type { ApiResult } from 'src/api/types';
import { REQUEST_TIMEOUT_MS } from 'src/constants';

// N'accepte pas d'`Account` : le seul secret utilisé est le jeton de salle, et
// une signature qui prendrait un compte laisserait croire l'inverse.
// `authedFetch` ne peut structurellement pas servir ici — il étale son propre
// `authorization` EN DERNIER (`client.ts:68-72`), donc il écrase le nôtre, et
// son jeton vient de `getAccessToken`, c'est-à-dire de l'OIDC. Pire, sur 401 il
// rafraîchit la session et rejoue : pour cet endpoint-là, un 401 veut dire que
// le jeton de SALLE est invalide, et un aller-retour SSO renverrait exactement
// le même en-tête erroné.
//
// Ne rafraîchit donc jamais l'OIDC, ne rejoue jamais, ne lit pas le corps :
// `{"status":"success"}` n'ajoute rien à un 200.
export async function toggleHand(
  serverUrl: string,
  roomRef: string,
  livekitToken: string,
  raised: boolean,
): Promise<ApiResult<void>> {
  const url = `${serverUrl}/api/v1.0/rooms/${encodeURIComponent(roomRef)}/toggle-hand/`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${livekitToken}`,
      },
      body: JSON.stringify({ raised }),
      // Repris d'`authedFetch`, et pas inversé : 15 000 ms.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, error: { kind: 'network' } };
  }

  if (response.ok) return { ok: true, value: undefined };
  // Jamais `unauthorized` : ce message-là dit « session expirée » et enverrait
  // l'utilisateur se reconnecter pour un problème qui n'est pas là.
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: { kind: 'forbidden' } };
  }
  if (response.status === 404) return { ok: false, error: { kind: 'not-found' } };
  return { ok: false, error: { kind: 'server', status: response.status } };
}
