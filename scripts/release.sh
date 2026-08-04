#!/usr/bin/env bash
set -euo pipefail

# Monte la version marketing et pose le tag vX.Y.Z. C'est le tag qui déclenche
# les deux publications signées (release-ios.yml + release-android.yml).
#
#   version marketing = ce tag         (v0.8.0 → 0.8.0)
#   numéro de build   = le run_number de la CI, monotone
#
# Le bump touche `package.json` ET `app.json`. Ce second point n'est pas
# cosmétique : l'écran Réglages lit sa version depuis `app.json` par
# `expo-constants`, donc un tag posé sans ce bump afficherait l'ancien numéro
# dans une application par ailleurs à jour. Voir docs/ci-cd-signed-release.md.
#
# Usage : scripts/release.sh <X.Y.Z> [remote]

VERSION="${1:-}"
REMOTE="${2:-origin}"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage : $0 <X.Y.Z> [remote]   (ex. $0 0.8.1)" >&2
  exit 1
fi

TAG="v$VERSION"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "main" ]]; then
  echo "Attention : vous êtes sur « $BRANCH », pas « main »." >&2
  read -r -p "Continuer quand même ? [o/N] " ok; [[ "$ok" =~ ^[OoYy]$ ]] || exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "L'arbre de travail n'est pas propre — commitez ou remisez d'abord." >&2
  exit 1
fi
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "Le tag $TAG existe déjà." >&2
  exit 1
fi

echo "Passage en version $VERSION …"
node - "$VERSION" <<'NODE'
const fs = require('fs');
const version = process.argv[2];
for (const file of ['package.json', 'app.json']) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (file === 'app.json') json.expo.version = version;
  else json.version = version;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`  ${file} mis à jour`);
}
NODE

git add package.json app.json
git commit -m "chore(release): $TAG"
git tag -a "$TAG" -m "Release $TAG"

echo
echo "Bump commité, tag $TAG créé."
echo "Pousser le tag déclenche les deux publications signées."
read -r -p "Pousser « $TAG » (et le commit) vers « $REMOTE » maintenant ? [o/N] " reply
if [[ "$reply" =~ ^[OoYy]$ ]]; then
  git push "$REMOTE" HEAD
  git push "$REMOTE" "$TAG"
  echo "Poussé. Suivre :  gh run list --repo linagora/twake-visio"
else
  echo "Non poussé. Quand vous serez prêt :"
  echo "  git push $REMOTE HEAD && git push $REMOTE $TAG"
fi
