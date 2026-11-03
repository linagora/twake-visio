export const APP_SCHEME = 'twakevisio';

// La `redirect_uri` envoyée au SSO, et ce que l'application guette au retour.
// Le SSO doit lister `twakevisio:` dans le `form-action` de sa CSP, sans quoi
// Chrome bloque la redirection qui suit le POST du formulaire de connexion :
// voir `docs/oidc-registration.md`.
export const OIDC_RETURN_URL = `${APP_SCHEME}://callback`;

export const DEFAULT_CLIENT_ID = 'twake-visio';
export const DEFAULT_SERVER_URL = 'https://meet.linagora.com';
export const REQUEST_TIMEOUT_MS = 15_000;
