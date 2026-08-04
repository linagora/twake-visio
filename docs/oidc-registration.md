# Enregistrement OIDC — ce qui doit exister hors du dépôt

Aucune ligne de code ne remplace ces déclarations : sans elles, la connexion
échoue **après** l'authentification, LemonLDAP ne validant le client et sa
redirection qu'à ce moment-là.

> Ce document a déjà été perdu une fois. Il vivait dans le `README`, d'où il
> avait été rapatrié en catastrophe après que `docs/` eut été sorti du suivi
> git — l'épisode est raconté dans `AGENTS.md`. Il est ici, versionné, et le
> `README` y renvoie plutôt que de le recopier.

## Le client

**`twake-visio` est un client OIDC public à part entière sur `sso.linagora.com`**,
avec PKCE, la redirection `twakevisio://callback`, et une **audience** qui rend
ses access-tokens valables pour meet. Fait le 2026-07-30. Client distinct de
celui de l'application web, décision assumée : on garde des comptes séparés, ce
qui permet de révoquer, restreindre ou auditer le mobile indépendamment du web.

L'application ne réutilise donc **pas** le client annoncé par l'instance dans la
redirection de `/api/v1.0/authenticate/`. Cette voie a été implémentée puis
annulée : elle rendrait l'application utilisable sur une instance inconnue sans
enregistrement préalable, mais elle ferait passer le mobile par le client de
l'application web, ce qui perd précisément cette séparation. À rouvrir si un
déploiement on-premise refuse d'enregistrer un client dédié.

La cible reste `config.oidc.mobile_client_id`, que `suitenumerique/meet`
n'expose pas encore. Jusque-là, `DEFAULT_CLIENT_ID` porte la valeur.

## Ne pas conclure de l'absence de `none` que c'est impossible

Point de vigilance mesuré le 2026-07-30 sur
`https://sso.linagora.com/.well-known/openid-configuration` :

    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"]
    code_challenge_methods_supported:      ["plain", "S256"]

PKCE est supporté et **`none` est absent** de la liste — or c'est ainsi qu'un
client public s'authentifie. Ce sont bien les **métadonnées qui sont périmées**,
pas la capacité : un échange de jeton en client public, avec PKCE et sans
`client_secret`, aboutit sur ce SSO. Vérifié le 2026-07-30 avec l'outil de
LemonLDAP lui-même :

    llng --choice 1_LDAP --llng-server sso.linagora.com --pkce \
         --client-id livekit-meet --redirect-uri "https://meet.linagora.com" oidc_tokens

rend `access_token`, `id_token` et `refresh_token`.

Sur la sécurité d'un client public, la règle de LemonLDAP est « soit un mot de
passe, soit PKCE » : un client sans secret mais avec PKCE n'ouvre pas de brèche.

## Séparer les deux déclarations manquantes sans accès au SSO

Le portail ne dit pas laquelle des deux manque, mais **l'erreur change de nature
selon la cause**. Mesuré sur appareil le 2026-07-30, en empruntant le temps d'un
essai le client `livekit-meet` de l'application web :

| `client_id` envoyé | Erreur du portail LemonLDAP              | Cause                                                                        |
| ------------------ | ---------------------------------------- | ---------------------------------------------------------------------------- |
| `twake-visio`      | « Cette application n'est pas reconnue » | le client n'existe pas                                                       |
| `livekit-meet`     | « URL non autorisée »                    | le client existe, `twakevisio://callback` n'est pas une redirection déclarée |

Le second ne se voit qu'une fois le premier fait. Noter aussi que le portail
affiche son formulaire de connexion pour n'importe quelle redirection, y compris
`schemeinexistant://x` : il ne la valide **qu'après** authentification, donc
aucune sonde anonyme ne peut trancher. Un `NegotiationError` côté LiveKit, en
revanche, ne vient jamais de là — voir `src/call/permissions.ts`.

## Côté meet

**Activer `lasuite.oidc_resource_server` sur le déploiement
`meet.linagora.com`**, en ajoutant `ResourceServerAuthentication` aux classes
d'authentification et en configurant l'introspection contre
`https://sso.linagora.com/oauth2/introspect`.
