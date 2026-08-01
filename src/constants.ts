export const APP_SCHEME = 'twakevisio';

// L'URL de retour du SSO. **HTTPS, et non le schéma personnalisé**, pour une
// raison mesurée trois fois par comparaison contrôlée — même appareil, même
// navigateur, même serveur, une seule variable :
//
//   session SSO absente → formulaire → POST → redirection → BLOQUÉ
//   session SSO présente → pas de formulaire → GET seul → revient dans l'app
//
// Chrome ne dispatche pas d'intention applicative pour une redirection vers un
// schéma personnalisé quand cette redirection répond à un POST de formulaire.
// Il le fait pour un App Link HTTPS vérifié. C'est donc la PREMIÈRE connexion
// qui cassait — celle où l'on saisit son mot de passe —, et elle passait à la
// seconde tentative parce que la session venait d'être créée.
//
// **Un hôte FIXE, et un seul.** Les filtres d'intention d'Android sont déclarés
// à la compilation : on ne peut pas en ajouter un à l'exécution quand on
// découvre l'instance depuis le domaine de l'adresse e-mail. « Un App Link par
// instance » est donc structurellement impossible, et un hôte fixe est la seule
// forme viable. Cela ne coûte rien de plus en exploitation : chaque instance
// doit de toute façon déclarer notre URL de retour dans son client OIDC, que
// celle-ci soit un schéma personnalisé ou une adresse HTTPS.
//
// L'hôte n'est **jamais contacté** au retour du SSO : Android lit son
// `assetlinks.json` une fois à l'installation, puis dispatche localement.
//
// PROVISOIRE — hôte de développement. Basculer vers un domaine de production
// coûte cette ligne, la même dans `app.json`, et le même fichier servi ailleurs.
export const OIDC_REDIRECT_URI = 'https://meet.twake-dev.maudet.cloud/auth/mobile-callback';

// Conservé : c'est le schéma de l'application, utilisé par les liens profonds
// vers une réunion. Seul le retour du SSO passe désormais en HTTPS.
export const OIDC_LEGACY_REDIRECT_URI = `${APP_SCHEME}://callback`;
export const DEFAULT_CLIENT_ID = 'twake-visio';
export const DEFAULT_SERVER_URL = 'https://meet.linagora.com';
export const REQUEST_TIMEOUT_MS = 15_000;
