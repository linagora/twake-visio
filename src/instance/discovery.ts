import { REQUEST_TIMEOUT_MS } from 'src/constants';

import type { InstanceConfig, InstanceResult } from 'src/instance/types';

type RawConfig = {
  livekit?: { url?: string };
  recording?: { is_enabled?: boolean };
  subtitle?: { enabled?: boolean };
  telephony?: { enabled?: boolean };
  oidc?: { issuer?: string; mobile_client_id?: string };
};

function isRawConfig(value: unknown): value is RawConfig {
  return typeof value === 'object' && value !== null && 'livekit' in value;
}

async function fetchJson(url: string): Promise<unknown | null> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

// La redirection de /authenticate/ porte l'issuer ET le client_id dans son URL
// d'autorisation. On prend les deux : l'application réutilise le client OIDC de
// l'instance plutôt que d'en exiger un qui lui soit propre, ce qui la rend
// utilisable sur une instance qu'on ne connaît pas.
//
// Les valeurs diffèrent bel et bien d'un déploiement à l'autre — mesuré le
// 2026-07-30 : `livekit-meet` sur meet.linagora.com et visio.twake.app, tous
// deux adossés à sso.linagora.com, mais `meet` sur meet.twake.app, adossé à
// sign-up.twake.app. Une valeur codée en dur serait fausse quelque part.
//
// Repli non contractuel, à retirer quand toutes les instances exposent
// config.oidc.
type RedirectOidc = { readonly issuer: string; readonly clientId: string };

async function resolveOidcFromRedirect(serverUrl: string): Promise<RedirectOidc | null> {
  const response = await fetch(`${serverUrl}/api/v1.0/authenticate/`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const location = response.headers.get('location');
  if (location === null) return null;
  try {
    const authorizeUrl = new URL(location);
    const clientId = authorizeUrl.searchParams.get('client_id');
    if (clientId === null || clientId.length === 0) return null;
    return { issuer: authorizeUrl.origin, clientId };
  } catch {
    return null;
  }
}

export async function fetchInstanceConfig(serverUrl: string): Promise<InstanceResult> {
  const normalized = serverUrl.replace(/\/+$/, '');

  let raw: unknown | null;
  try {
    raw = await fetchJson(`${normalized}/api/v1.0/config/`);
  } catch {
    return { ok: false, error: 'unreachable' };
  }

  if (!isRawConfig(raw)) return { ok: false, error: 'not-a-meet-instance' };

  const livekitUrl = raw.livekit?.url;
  if (livekitUrl === undefined) return { ok: false, error: 'not-a-meet-instance' };

  let issuer = raw.oidc?.issuer ?? null;
  let clientId = raw.oidc?.mobile_client_id ?? null;

  if (issuer === null || clientId === null) {
    let fromRedirect: RedirectOidc | null;
    try {
      fromRedirect = await resolveOidcFromRedirect(normalized);
    } catch {
      return { ok: false, error: 'unreachable' };
    }
    // Ce que l'endpoint contractuel annonce prime ; le repli ne comble que ce
    // qui manque, jamais ne remplace.
    issuer = issuer ?? fromRedirect?.issuer ?? null;
    clientId = clientId ?? fromRedirect?.clientId ?? null;
  }

  if (issuer === null || clientId === null) {
    return { ok: false, error: 'oidc-undiscoverable' };
  }

  const config: InstanceConfig = {
    serverUrl: normalized,
    issuer,
    clientId,
    livekitUrl,
    features: {
      recording: raw.recording?.is_enabled === true,
      subtitle: raw.subtitle?.enabled === true,
      telephony: raw.telephony?.enabled === true,
    },
  };

  return { ok: true, value: config };
}
