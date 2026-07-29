import { DEFAULT_CLIENT_ID } from 'src/constants';

// Deux instances de production partagent le même SSO et le même LiveKit.
// Aucune des deux n'expose config.oidc à ce jour, d'où le repli de la Task 5.
const KNOWN_CLIENT_IDS: Readonly<Record<string, string>> = {
  'meet.linagora.com': DEFAULT_CLIENT_ID,
  'visio.twake.app': DEFAULT_CLIENT_ID,
};

export function findKnownClientId(host: string): string | null {
  return KNOWN_CLIENT_IDS[host.toLowerCase()] ?? null;
}
