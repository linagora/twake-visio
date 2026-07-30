import { DEFAULT_CLIENT_ID } from 'src/constants';

// Deux instances de production partagent le même SSO et le même LiveKit.
// Aucune des deux n'expose config.oidc à ce jour, d'où le repli de la Task 5.
const KNOWN_CLIENT_IDS = {
  'meet.linagora.com': DEFAULT_CLIENT_ID,
  'visio.twake.app': DEFAULT_CLIENT_ID,
} as const satisfies Readonly<Record<string, string>>;

type KnownHost = keyof typeof KNOWN_CLIENT_IDS;

// Domaine d'adresse email → hôte de l'instance, résolu sans aucun appel réseau.
//
// Table délibérément distincte de KNOWN_CLIENT_IDS : listKnownHosts() sert
// d'allowlist au filtre de liens profonds, et rattacher un domaine d'email à
// une instance ne doit surtout pas élargir la liste des hôtes autorisés à
// ouvrir un salon dans l'application.
//
// Le type impose une cible déjà présente dans KNOWN_CLIENT_IDS : la voie rapide
// ne fait aucune vérification réseau, elle ne peut donc désigner qu'une
// instance dont on sait déjà obtenir le client_id — sinon elle renverrait une
// URL sur laquelle la connexion échouerait juste après. Une entrée fautive
// échoue à la compilation, pas à l'exécution chez l'utilisateur.
const KNOWN_EMAIL_DOMAINS = {
  'linagora.com': 'meet.linagora.com',
} as const satisfies Readonly<Record<string, KnownHost>>;

export function findKnownClientId(host: string): string | null {
  const table: Readonly<Record<string, string>> = KNOWN_CLIENT_IDS;
  return table[host.toLowerCase()] ?? null;
}

export function findKnownHostForDomain(domain: string): string | null {
  const table: Readonly<Record<string, string>> = KNOWN_EMAIL_DOMAINS;
  return table[domain.toLowerCase()] ?? null;
}

// Consommé par le filtre de liens profonds : un lien de réunion n'est accepté
// que s'il porte sur une instance connue.
export function listKnownHosts(): readonly string[] {
  return Object.keys(KNOWN_CLIENT_IDS);
}
