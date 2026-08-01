export const APP_SCHEME = 'twakevisio';

// Le chemin de la page de rebond, servi par CHAQUE instance de meet. L'URL de
// retour complète est dérivée de l'instance découverte depuis le domaine de
// l'adresse e-mail : il n'y a donc AUCUN hôte en dur, et rien à recompiler pour
// un nouveau client.
//
// Pourquoi une page de rebond plutôt qu'une redirection directe vers le schéma :
// Chrome ne dispatche pas d'intention applicative pour une redirection en
// schéma personnalisé qui répond à un POST de formulaire — donc la PREMIÈRE
// connexion, celle où l'on saisit son mot de passe, restait bloquée. Établi
// trois fois par comparaison contrôlée. La page HTTPS termine la chaîne du
// POST ; le saut vers l'application part ensuite d'un document déjà chargé, ce
// que Chrome dispatche — mesuré sur appareil, sans geste utilisateur.
//
// Un App Link n'est donc PAS nécessaire : les filtres d'intention d'Android
// sont figés à la compilation, ce qui aurait interdit toute découverte
// dynamique d'instance. C'est ce que cette forme évite.
export const OIDC_CALLBACK_PATH = '/auth/mobile-callback';

// Ce que l'application GUETTE au retour, et ce vers quoi la page de rebond
// saute. Distinct de l'URL déclarée au SSO, qui est celle de la page.
export const OIDC_RETURN_URL = `${APP_SCHEME}://callback`;

export const DEFAULT_CLIENT_ID = 'twake-visio';
export const DEFAULT_SERVER_URL = 'https://meet.linagora.com';
export const REQUEST_TIMEOUT_MS = 15_000;
