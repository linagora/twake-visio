import { refreshTokens } from 'src/auth/oidc';
import { loadTokens, saveTokens } from 'src/auth/storage';
import type { InstanceConfig } from 'src/instance/types';

// Marge avant expiration en deçà de laquelle on rafraîchit préventivement,
// pour qu'une requête ne parte pas avec un jeton qui expire en vol.
const REFRESH_GUARD_MS = 30_000;

const inFlight = new Map<string, Promise<string | null>>();

export async function getAccessToken(
  accountId: string,
  config: InstanceConfig,
): Promise<string | null> {
  const tokens = await loadTokens(accountId);
  if (tokens === null) return null;

  if (tokens.expiresAt - Date.now() > REFRESH_GUARD_MS) return tokens.accessToken;

  return forceRefresh(accountId, config);
}

export async function forceRefresh(
  accountId: string,
  config: InstanceConfig,
): Promise<string | null> {
  const pending = inFlight.get(accountId);
  if (pending !== undefined) return pending;

  const attempt = (async (): Promise<string | null> => {
    try {
      const tokens = await loadTokens(accountId);
      if (tokens === null || tokens.refreshToken === null) return null;

      const result = await refreshTokens(config, tokens.refreshToken);
      if (!result.ok) return null;

      // Une écriture refusée ne doit pas faire jeter un jeton déjà obtenu : la
      // session est valide, seule sa persistance a manqué. L'écarter renverrait
      // l'utilisateur vers une reconnexion dont il n'a aucun besoin.
      try {
        await saveTokens(accountId, result.value);
      } catch {
        // Jeton utilisable pour cette session, simplement non persisté.
      }

      return result.value.accessToken;
    } catch {
      // Tout autre rejet vaut « pas de jeton » pour l'appelant. Le laisser
      // remonter le ferait étiqueter « network » par le client API, et
      // l'utilisateur lirait « connexion impossible » au lieu de « session à
      // renouveler ». `attempt` ne rejette donc jamais, ce qui donne le même
      // contrat aux appelants concurrents qui attendent cette même promesse.
      return null;
    }
  })();

  inFlight.set(accountId, attempt);
  try {
    return await attempt;
  } finally {
    inFlight.delete(accountId);
  }
}

export function resetSessionForTest(): void {
  inFlight.clear();
}
