import { fetchInstanceConfig } from 'src/instance/discovery';
import { findKnownHostForDomain } from 'src/instance/knownInstances';

export type EmailResolutionError = 'invalid-email' | 'instance-not-found';

// « instance-not-found » est distinct d'une erreur de connexion : il ne signale
// pas une panne mais l'absence de convention applicable, et c'est à ce
// résultat-là que l'écran doit répondre en proposant la saisie manuelle du
// serveur plutôt qu'une impasse.
export type EmailResolution =
  { ok: true; value: string } | { ok: false; error: EmailResolutionError };

// Partie locale sans espace ni @, puis un domaine en étiquettes alphanumériques
// séparées par des points — au moins un point, jamais de tiret en tête ou en
// queue d'étiquette. Le point exigé écarte « ada@localhost » et tout ce qui ne
// donnerait pas un hôte joignable une fois préfixé par « meet. ».
const EMAIL = /^[^\s@]+@([a-z0-9]([a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+)$/;

function normalizeEmailDomain(email: string): string | null {
  return EMAIL.exec(email.trim().toLowerCase())?.[1] ?? null;
}

// La détection ne conclut jamais sur un code HTTP. Mesuré : meet.linagora.com
// sert /.well-known/twake-configuration en 200 avec le HTML de l'application —
// un test d'existence fondé sur le code y verrait un endpoint. Le contrat, c'est
// la forme JSON de /api/v1.0/config/, que fetchInstanceConfig sait déjà lire.
//
// « oidc-undiscoverable » vaut trouvé : la config a été lue et validée, donc
// l'hôte est le bon et seule la découverte OIDC a échoué. Passer à la candidate
// suivante conclurait « introuvable » pour une instance bel et bien trouvée ;
// s'arrêter ici laisse signIn rapporter la vraie cause.
async function isMeetInstance(serverUrl: string): Promise<boolean> {
  const result = await fetchInstanceConfig(serverUrl);
  return result.ok || result.error === 'oidc-undiscoverable';
}

// N'utilise pas /.well-known/twake-configuration, contrairement à Twake Drive :
// cet endpoint rend une URL de cloudery Cozy, qui délivre une session Cozy
// Stack que cette application n'a pas et ne doit pas avoir (voir AGENTS.md).
export async function fetchServerUrlForEmail(email: string): Promise<EmailResolution> {
  const domain = normalizeEmailDomain(email);
  if (domain === null) return { ok: false, error: 'invalid-email' };

  const known = findKnownHostForDomain(domain);
  if (known !== null) return { ok: true, value: `https://${known}` };

  // Du moins cher au plus cher, et on s'arrête à la première qui répond.
  for (const candidate of [`https://meet.${domain}`, `https://${domain}`]) {
    if (await isMeetInstance(candidate)) return { ok: true, value: candidate };
  }

  return { ok: false, error: 'instance-not-found' };
}
