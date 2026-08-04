// L'identifiant de l'action « Rejoindre ». Il voyage dans la notification et
// revient dans la réponse ; le changer casserait les rappels DÉJÀ posés sur les
// appareils, que le système tient indépendamment de l'application.
export const JOIN_ACTION = 'join';

/**
 * Le slug à ouvrir en réponse à une notification, ou `null`.
 *
 * **Pure, et volontairement ignorante d'`expo-notifications`.** L'identifiant
 * de l'action par défaut lui est passé plutôt qu'importé : importer le module
 * natif ici obligerait chaque test à le bouchonner, et un bouchon qui dérive de
 * la vraie valeur rend le test vert contre une implémentation fausse.
 *
 * Deux actions ouvrent la réunion, et c'est délibéré : le bouton « Rejoindre »,
 * et l'appui sur le corps de la notification. Quelqu'un qui tape la
 * notification veut rejoindre ; l'envoyer sur l'accueil serait un pas de plus à
 * faire pour rien.
 */
export function slugFromResponse(
  actionIdentifier: string,
  data: unknown,
  defaultActionIdentifier: string,
): string | null {
  if (actionIdentifier !== JOIN_ACTION && actionIdentifier !== defaultActionIdentifier) return null;
  if (typeof data !== 'object' || data === null) return null;
  const slug = (data as { readonly slug?: unknown }).slug;
  return typeof slug === 'string' && slug.length > 0 ? slug : null;
}

/**
 * La route du pré-accueil pour un slug.
 *
 * Le pré-accueil et non la salle d'attente : c'est déjà où mène « Rejoindre »
 * depuis l'accueil (`src/screens/home.tsx`), et un même mot doit faire une même
 * chose. La salle d'attente n'a de sens que pour un salon fermé ; son
 * comportement varierait donc d'un salon à l'autre.
 */
export function prejoinRoute(slug: string): string {
  return `/room/${slug}/prejoin`;
}
