#!/usr/bin/env bash
set -euo pipefail

# Une fois (ou à chaque rotation) : pose les secrets de signature et de
# distribution sur le dépôt GitHub de Twake Visio.
#
# Les secrets GitHub Actions sont en ÉCRITURE SEULE — ce script est le seul
# moyen de les (re)poser, et c'est ainsi qu'on réplique ceux partagés avec
# twake-drive-mobile : même équipe Apple, même dépôt match, même projet
# Firebase/Play.
#
# Les VALEURS ne vivent jamais dans git : elles sont dans un
# `.release-secrets.env` local et ignoré (copier `.release-secrets.env.example`).
# Ce script le lit et appelle `gh secret set` pour chacune — les valeurs passent
# donc de votre machine à GitHub sans transiter par personne.
#
# Usage : scripts/setup-release-secrets.sh [dépôt]
#   dépôt par défaut : linagora/twake-visio.

REPO="${1:-linagora/twake-visio}"
ROOT="$(git rev-parse --show-toplevel)"
ENV_FILE="$ROOT/.release-secrets.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "$ENV_FILE absent — copiez .release-secrets.env.example et remplissez-le." >&2
  exit 1
fi
command -v gh >/dev/null || { echo "GitHub CLI (gh) introuvable." >&2; exit 1; }

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

echo "Pose des secrets sur $REPO …"

set_secret() {
  local name="$1" value="${2:-}"
  if [[ -z "$value" ]]; then echo "  · ignoré : $name (non fourni)"; return; fi
  printf '%s' "$value" | gh secret set "$name" --repo "$REPO"
  echo "  ✓ $name"
}

# --- Secrets lus depuis un fichier (base64 ou contenu brut) ---
[[ -n "${ANDROID_KEYSTORE_FILE:-}" ]]        && set_secret ANDROID_KEYSTORE_BASE64          "$(base64 < "$ANDROID_KEYSTORE_FILE" | tr -d '\n')"
[[ -n "${GCP_SERVICE_ACCOUNT_FILE:-}" ]]     && set_secret FIREBASE_SERVICE_ACCOUNT_BASE64  "$(base64 < "$GCP_SERVICE_ACCOUNT_FILE" | tr -d '\n')"
[[ -n "${APP_STORE_CONNECT_API_KEY_FILE:-}" ]] && set_secret APP_STORE_CONNECT_API_KEY_CONTENT "$(base64 < "$APP_STORE_CONNECT_API_KEY_FILE" | tr -d '\n')"
[[ -n "${MATCH_DEPLOY_KEY_FILE:-}" ]]        && set_secret MATCH_DEPLOY_KEY                 "$(cat "$MATCH_DEPLOY_KEY_FILE")"

# --- Secrets donnés directement ---
set_secret ANDROID_KEYSTORE_PASSWORD          "${ANDROID_KEYSTORE_PASSWORD:-}"
set_secret ANDROID_KEY_ALIAS                  "${ANDROID_KEY_ALIAS:-}"
set_secret ANDROID_KEY_PASSWORD               "${ANDROID_KEY_PASSWORD:-}"
set_secret FIREBASE_APP_ID                    "${FIREBASE_APP_ID:-}"
set_secret APPLE_TEAM_ID                      "${APPLE_TEAM_ID:-}"
set_secret APP_STORE_CONNECT_API_KEY_ID       "${APP_STORE_CONNECT_API_KEY_ID:-}"
set_secret APP_STORE_CONNECT_ISSUER_ID        "${APP_STORE_CONNECT_ISSUER_ID:-}"
# La clé ASC et la clé de déploiement match acceptent aussi une valeur directe.
[[ -z "${APP_STORE_CONNECT_API_KEY_FILE:-}" ]] && set_secret APP_STORE_CONNECT_API_KEY_CONTENT "${APP_STORE_CONNECT_API_KEY_CONTENT:-}"
set_secret MATCH_GIT_URL                      "${MATCH_GIT_URL:-}"
set_secret MATCH_PASSWORD                     "${MATCH_PASSWORD:-}"
[[ -z "${MATCH_DEPLOY_KEY_FILE:-}" ]]         && set_secret MATCH_DEPLOY_KEY                 "${MATCH_DEPLOY_KEY:-}"

echo "Terminé. Vérifier les noms :  gh secret list --repo $REPO"
