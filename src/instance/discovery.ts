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

// La redirection de /authenticate/ porte l'issuer ET le client_id de l'instance
// dans son URL d'autorisation. Repli non contractuel, à retirer quand toutes les
// instances exposent config.oidc.
type RedirectOidc = { readonly issuer: string; readonly clientId: string | null };

async function resolveOidcFromRedirect(serverUrl: string): Promise<RedirectOidc | null> {
  const response = await fetch(`${serverUrl}/api/v1.0/authenticate/`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const location = response.headers.get('location');
  if (location === null) return null;
  try {
    const authorizeUrl = new URL(location);
    const fromQuery = authorizeUrl.searchParams.get('client_id');
    return {
      issuer: authorizeUrl.origin,
      // Une chaîne vide n'est pas un client : la traiter comme tel ouvrirait le
      // navigateur sur une URL d'autorisation sans client, que le SSO refuse
      // après que la personne s'est authentifiée pour rien.
      clientId: fromQuery !== null && fromQuery.length > 0 ? fromQuery : null,
    };
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

  // Trois sources de client, de la plus fiable à la plus large.
  //
  // 1. `config.oidc.mobile_client_id` — le contrat. Une instance qui déclare un
  //    client dédié au mobile veut qu'on l'utilise. Null partout aujourd'hui,
  //    mais c'est la cible.
  // 2. La table des instances connues — `twake-visio` sur meet.linagora.com et
  //    visio.twake.app, où il est enregistré avec la redirection native et
  //    l'audience qui rend ses jetons valables pour meet. Passer devant le
  //    repli est indispensable : ces instances annoncent `livekit-meet` dans
  //    leur redirection, un client web dont `twakevisio://callback` n'est pas
  //    une redirection déclarée. L'emprunter y casserait la connexion.
  // 3. Le client que l'instance annonce elle-même. C'est ce qui rend
  //    l'application utilisable sur un déploiement dont ce dépôt n'a jamais
  //    entendu parler — mesuré : `livekit-meet` sur meet.twake-dev.maudet.cloud,
  //    `meet` sur meet.maudet.cloud. Une valeur codée en dur serait fausse
  //    quelque part.
  //
  // Cela n'exempte pas d'enregistrer `twakevisio://callback` comme redirection
  // autorisée du client emprunté : le repli évite de créer un client, pas de
  // déclarer la redirection.
  let issuer = raw.oidc?.issuer ?? null;
  let clientId = raw.oidc?.mobile_client_id ?? findKnownClientId(new URL(normalized).host);

  if (issuer === null || clientId === null) {
    let fromRedirect: RedirectOidc | null;
    try {
      fromRedirect = await resolveOidcFromRedirect(normalized);
    } catch {
      return { ok: false, error: 'unreachable' };
    }
    // Le repli comble ce qui manque, il ne remplace jamais ce qui précède.
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
