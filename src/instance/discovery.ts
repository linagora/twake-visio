import { REQUEST_TIMEOUT_MS } from 'src/constants';
import { findKnownClientId } from 'src/instance/knownInstances';
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

// La redirection de /authenticate/ porte l'issuer dans son URL d'autorisation.
// Repli non contractuel, à retirer quand toutes les instances exposent config.oidc.
async function resolveOidcFromRedirect(serverUrl: string): Promise<string | null> {
  const response = await fetch(`${serverUrl}/api/v1.0/authenticate/`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const location = response.headers.get('location');
  if (location === null) return null;
  try {
    const authorizeUrl = new URL(location);
    return authorizeUrl.origin;
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

  if (issuer === null) {
    try {
      issuer = await resolveOidcFromRedirect(normalized);
    } catch {
      return { ok: false, error: 'unreachable' };
    }
  }

  if (clientId === null) {
    clientId = findKnownClientId(new URL(normalized).host);
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
