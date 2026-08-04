/**
 * Les hôtes voisins d'une instance, déduits de celui de meet.
 *
 * `https://meet.<domaine>` → `https://<étiquette>.<domaine>`, en remplaçant le
 * PREMIER label. C'est la règle du widget web (`BASE_DOMAIN`), reprise telle
 * quelle et validée avec Michel-Marie.
 *
 * **C'est une HYPOTHÈSE sur les autres instances** : rien ne garantit qu'elles
 * nomment leurs hôtes ainsi. Ce fichier est le seul endroit à corriger si l'une
 * d'elles fait autrement — c'est précisément pourquoi les deux appelants
 * passent par ici plutôt que de recopier chacun les cinq mêmes lignes.
 *
 * Rien dans `/api/v1.0/config/` n'annonce ces hôtes : mesuré le 2026-08-03, la
 * réponse de `meet.twake-dev.maudet.cloud` ne porte aucune clé de calendrier.
 * La déduction n'est donc pas un raccourci, c'est le seul signal disponible.
 */
export function siblingHost(serverUrl: string, label: string): string | null {
  let host: string;
  try {
    host = new URL(serverUrl).hostname;
  } catch {
    return null;
  }
  const dot = host.indexOf('.');
  // Sans domaine parent il n'y a rien à remplacer : préfixer donnerait un hôte
  // inexistant, donc une requête qui échoue sans nommer sa cause.
  if (dot < 0) return null;
  return `https://${label}${host.slice(dot)}`;
}
