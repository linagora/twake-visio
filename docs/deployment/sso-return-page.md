# Ce que chaque instance `meet` doit servir pour que le mobile puisse se connecter

**Deux gestes, aucun code applicatif.** À faire une fois par instance, par qui l'opère.

Sans eux, la **première** connexion mobile reste bloquée sur une page blanche après la
saisie du mot de passe. Les suivantes passent, ce qui rend le défaut trompeur : il ne se
manifeste que sur un appareil neuf ou une session vidée.

---

## 1. Servir la page de rebond à `/auth/mobile-callback`

Dix lignes de HTML statique, **identiques pour toutes les instances**. Aucun état serveur,
aucun rendu dynamique, aucune dépendance.

```html
<!doctype html>
<meta charset="utf-8" />
<title>Twake Visio</title>
<script>
  location.replace('twakevisio://callback' + location.search);
</script>
<p>Ouverture de Twake Visio...</p>
<p><a href="twakevisio://callback">Ouvrir manuellement</a></p>
```

Elle doit être servie **hors de la route attrape-tout du SPA** — sinon elle rend la page de
l'application avec un code 200 parfaitement trompeur. En nginx :

```nginx
location = /auth/mobile-callback {
    default_type text/html;
    add_header Cache-Control "no-store";
    return 200 '<!doctype html><meta charset="utf-8"><title>Twake Visio</title><script>location.replace("twakevisio://callback" + location.search);</script><p>Ouverture de Twake Visio...</p><p><a href="twakevisio://callback">Ouvrir manuellement</a></p>';
}
```

**Vérifier le CONTENU, jamais le seul code HTTP** :

```bash
curl -s "https://<instance>/auth/mobile-callback?code=X" | head -c 60
# doit commencer par <!doctype html><meta charset="utf-8"><title>Twake Visio</title>
# et NON par <!doctype html><html lang="en" data-lk-theme=…
```

## 2. Déclarer l'URL de retour dans le client OIDC de l'instance

`https://<instance>/auth/mobile-callback`, **sans barre finale**.

La comparaison OAuth d'une `redirect_uri` est une **égalité de chaîne stricte** : une barre
en trop et le SSO répond « URL non autorisée ». Dans le doute, déclarer les deux formes.

Sous LemonLDAP::NG, c'est `oidcRPMetaDataOptionsRedirectUris` du client concerné, en plus
des URL déjà présentes. Redémarrer le service ensuite.

---

## Pourquoi une page de rebond, et pas une redirection directe

Établi **trois fois par comparaison contrôlée** — même appareil, même navigateur, même
serveur, une seule variable :

| session SSO | chaîne                              | résultat                   |
| ----------- | ----------------------------------- | -------------------------- |
| absente     | formulaire → **POST** → redirection | **bloqué**                 |
| présente    | pas de formulaire → **GET** seul    | revient dans l'application |

**Chrome ne dispatche pas d'intention applicative pour une redirection en schéma
personnalisé quand cette redirection répond à un POST de formulaire.** La page HTTPS termine
la chaîne du POST ; le saut vers l'application part ensuite d'un document déjà chargé, ce que
Chrome dispatche — mesuré sur appareil, **sans geste utilisateur**.

Le lien « Ouvrir manuellement » n'est qu'un filet, jamais nécessaire dans les mesures faites.

## Pourquoi pas un App Link Android

Les filtres d'intention sont figés **à la compilation**. Une application publiée sur les
stores ne peut donc pas déclarer le domaine d'un client qu'elle découvrira plus tard depuis
une adresse e-mail. Un App Link aurait imposé soit un hôte unique appartenant à l'éditeur —
que chaque client souverain devrait alors déclarer dans son propre SSO —, soit une
recompilation par client. La page de rebond évite les deux, et **règle iOS du même coup**,
dont les Universal Links portent la même contrainte.

## Ce qui reste vrai côté application

L'URL de retour est **dérivée de l'instance découverte** (`src/auth/oidc.ts`,
`redirectUriFor`). Aucun domaine n'est écrit en dur, et aucune recompilation n'est nécessaire
pour un nouveau client.

## État constaté le 2026-08-01

| instance                      | page de rebond            | URL déclarée                              | première connexion             |
| ----------------------------- | ------------------------- | ----------------------------------------- | ------------------------------ |
| `meet.twake-dev.maudet.cloud` | servie                    | déclarée                                  | **passe**                      |
| `meet.linagora.com`           | **absente** (rend le SPA) | **absente** (seule `/api/v1.0/callback/`) | échoue — « URL non autorisée » |
