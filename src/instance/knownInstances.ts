// Allowlist des hôtes d'instances connues. Elle ne sert plus qu'à deux choses,
// et surtout plus à deviner un client OIDC : celui-ci est lu sur l'instance
// elle-même par la découverte, ce qui rend l'application utilisable sur un
// déploiement dont ce dépôt n'a jamais entendu parler.
const KNOWN_HOSTS = ['meet.linagora.com', 'visio.twake.app'] as const;

type KnownHost = (typeof KNOWN_HOSTS)[number];

// Domaine d'adresse email → hôte de l'instance, résolu sans aucun appel réseau.
//
// Table délibérément distincte de KNOWN_HOSTS : listKnownHosts() sert d'allowlist
// au filtre de liens profonds, et rattacher un domaine d'email à une instance ne
// doit surtout pas élargir la liste des hôtes autorisés à ouvrir un salon dans
// l'application.
//
// Le type impose une cible déjà présente dans KNOWN_HOSTS : une entrée fautive
// échoue à la compilation, pas à l'exécution chez l'utilisateur.
//
// `twake.app` est délibérément absent : meet.twake.app est un déploiement
// distinct de visio.twake.app, avec un autre SSO et un autre LiveKit. Rattacher
// le domaine à l'un enverrait ces adresses sur la mauvaise instance.
const KNOWN_EMAIL_DOMAINS = {
  'linagora.com': 'meet.linagora.com',
} as const satisfies Readonly<Record<string, KnownHost>>;

export function findKnownHostForDomain(domain: string): string | null {
  const table: Readonly<Record<string, string>> = KNOWN_EMAIL_DOMAINS;
  return table[domain.toLowerCase()] ?? null;
}

// Consommé par le filtre de liens profonds : un lien de réunion n'est accepté
// que s'il porte sur une instance connue.
export function listKnownHosts(): readonly string[] {
  return KNOWN_HOSTS;
}
