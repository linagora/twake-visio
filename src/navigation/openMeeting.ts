import { APP_SCHEME, DEFAULT_SERVER_URL } from 'src/constants';
import { parseMeetingLink } from 'src/navigation/deepLinks';

export type DeepLinkTarget = {
  readonly route: string;
  // Non nul = il faut ouvrir une session invité avant de naviguer.
  readonly guestServerUrl: string | null;
};

// `parseMeetingLink` et son allowlist STRICTE, jamais `parsePastedMeeting` :
// un lien profond arrive sans qu'on l'ait demandé. C'est toute la différence
// de posture entre les deux, et l'élargir ici annulerait la protection.
export function resolveDeepLink(
  url: string,
  allowedHosts: readonly string[],
  signedIn: boolean,
): DeepLinkTarget | null {
  const slug = parseMeetingLink(url, allowedHosts);
  if (slug === null) return null;

  const route = `/room/${slug}/prejoin`;
  if (signedIn) return { route, guestServerUrl: null };

  // `new URL` ne jette plus ici — `parseMeetingLink` a déjà validé la même
  // chaîne plus haut, donc un second appel ne jette pas davantage. Une
  // première version de ce code entourait cet appel d'un `try`/`catch` pour
  // le schéma applicatif : cette branche ne pouvait JAMAIS s'exécuter, et un
  // lien `twakevisio://` ouvert sans compte démarrait alors une session
  // invité sur `https://room` — l'hôte littéral du schéma, pas une instance.
  // Trouvé le 2026-08-05 en écrivant le test qui suit, avant tout code.
  const { protocol, host } = new URL(url);
  // **CETTE BRANCHE EST INATTEIGNABLE SUR APPAREIL, et son test unitaire y est
  // donc vide de sens.** Non pas à cause du `protocol` — le getter de React
  // Native le rend correctement — mais parce qu'on n'arrive jamais jusqu'ici :
  // `parseMeetingLink`, plus haut, aura déjà rendu `null` pour tout
  // `twakevisio://`, sa comparaison d'hôte à « room » ne pouvant être vraie
  // sous le `URL` de React Native (voir son commentaire, qui porte la mesure
  // du 2026-08-05).
  //
  // Ce qui suit décrit donc ce que la fonction ferait si le lien profond
  // applicatif vivait. PRÉ-EXISTANT, hors périmètre du mode invité, consigné
  // par décision explicite plutôt que corrigé.
  if (protocol === `${APP_SCHEME}:`) {
    // Un lien `twakevisio://room/<slug>` ne porte aucun hôte exploitable :
    // « room » est un littéral fixe du schéma, jamais une instance. Et rien
    // dans l'application ne génère un tel lien pour le partage — `handleShare`
    // et `handleCopyLink` de `call.tsx` émettent tous deux `https://<serveur>/
    // <slug>` — donc aucun hôte n'est à récupérer ni à deviner : le serveur
    // par défaut est la seule information disponible, pas un pis-aller.
    return { route, guestServerUrl: DEFAULT_SERVER_URL };
  }

  // L'hôte du LIEN, pas le serveur par défaut : le lien dit sur quelle
  // instance la réunion se tient, et c'est la seule source qui le sache.
  return { route, guestServerUrl: `https://${host}` };
}
