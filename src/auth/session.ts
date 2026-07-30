import { refreshTokens } from 'src/auth/oidc';
import { loadTokens, saveTokens } from 'src/auth/storage';
import type { InstanceConfig } from 'src/instance/types';

// Trois issues, parce que l'appelant doit pouvoir dire trois choses
// différentes à l'utilisateur : « connectez-vous », « votre session a expiré »,
// « le service est indisponible ». Un `string | null` les confondait, et un
// SSO en panne se lisait « session expirée ».
export type RefreshOutcome =
  { ok: true; token: string } | { ok: false; reason: 'no-session' | 'refused' | 'unavailable' };

// Marge avant expiration en deçà de laquelle on rafraîchit préventivement,
// pour qu'une requête ne parte pas avec un jeton qui expire en vol.
const REFRESH_GUARD_MS = 30_000;

const inFlight = new Map<string, Promise<RefreshOutcome>>();

export async function getAccessToken(
  accountId: string,
  config: InstanceConfig,
): Promise<RefreshOutcome> {
  const tokens = await loadTokens(accountId);
  if (tokens === null) return { ok: false, reason: 'no-session' };

  if (tokens.expiresAt - Date.now() > REFRESH_GUARD_MS) {
    return { ok: true, token: tokens.accessToken };
  }

  return forceRefresh(accountId, config);
}

export async function forceRefresh(
  accountId: string,
  config: InstanceConfig,
): Promise<RefreshOutcome> {
  const pending = inFlight.get(accountId);
  if (pending !== undefined) return pending;

  const attempt = (async (): Promise<RefreshOutcome> => {
    try {
      const tokens = await loadTokens(accountId);
      if (tokens === null || tokens.refreshToken === null) {
        return { ok: false, reason: 'no-session' };
      }

      const result = await refreshTokens(config, tokens.refreshToken);
      if (!result.ok) {
        // Une panne du SSO ou du réseau n'est pas un refus : la session est
        // peut-être parfaitement valide, seul le service manque.
        const transient = result.error === 'server' || result.error === 'network';
        return { ok: false, reason: transient ? 'unavailable' : 'refused' };
      }

      // Une écriture refusée ne doit pas faire jeter un jeton déjà obtenu : la
      // session est valide, seule sa persistance a manqué. L'écarter renverrait
      // l'utilisateur vers une reconnexion dont il n'a aucun besoin.
      try {
        await saveTokens(accountId, result.value);
      } catch {
        // Jeton utilisable pour cette session, simplement non persisté.
      }

      return { ok: true, token: result.value.accessToken };
    } catch {
      // Tout autre rejet est traité comme une indisponibilité, non comme un
      // refus : rien ne prouve que la session soit morte. Le laisser
      // remonter le ferait étiqueter « network » par le client API, et
      // l'utilisateur lirait « connexion impossible » au lieu de « session à
      // renouveler ». `attempt` ne rejette donc jamais, ce qui donne le même
      // contrat aux appelants concurrents qui attendent cette même promesse.
      return { ok: false, reason: 'unavailable' };
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
