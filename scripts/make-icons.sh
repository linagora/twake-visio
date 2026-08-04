#!/usr/bin/env bash
set -euo pipefail

# Régénère les PNG d'icônes depuis les SVG d'`assets/`. À relancer après toute
# modification d'un SVG ; les PNG sont versionnés parce que ni `expo prebuild`
# ni la CI ne savent rastériser un SVG.
#
# Dépendance : `rsvg-convert` (librsvg), `brew install librsvg`.
#
# **Pas ImageMagick.** Sur cette machine, `magick` délègue le SVG à Inkscape,
# dont l'installation est cassée, et retombe alors SANS ERREUR sur son moteur
# interne, dont le rendu est approximatif. Un rendu faux qui réussit est pire
# qu'un rendu qui échoue.

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE"

command -v rsvg-convert >/dev/null || {
  echo "rsvg-convert introuvable. brew install librsvg" >&2
  exit 1
}
python3 -c 'import PIL' 2>/dev/null || {
  echo "Pillow introuvable. pip3 install Pillow" >&2
  exit 1
}

echo "Rendu des SVG…"
rsvg-convert -w 1024 -h 1024 assets/icon.svg -o /tmp/tv-icon.png
rsvg-convert -w 1024 -h 1024 assets/adaptive-icon.svg -o assets/adaptive-icon.png
rsvg-convert -w 1024 -h 1024 assets/adaptive-icon-background.svg -o assets/adaptive-icon-background.png

python3 - <<'PY'
from PIL import Image

# `icon.png` est APLATI sur blanc, donc sans canal alpha. App Store Connect
# refuse un PNG qui en porte un, **même entièrement opaque** : « Invalid large
# app icon. The icon can't be transparent nor contain an alpha channel. » Le
# rejet arrive après l'archivage et l'envoi, soit vingt minutes plus tard.
src = Image.open('/tmp/tv-icon.png').convert('RGBA')
plat = Image.new('RGB', src.size, (255, 255, 255))
plat.paste(src, (0, 0), src)
plat.save('assets/icon.png')

# L'icône de la fiche Google Play, à déposer à la main dans la console.
plat.resize((512, 512), Image.LANCZOS).save('assets/store/play-icon-512.png')
print('  assets/icon.png, assets/store/play-icon-512.png')
PY

echo "Vérification…"
python3 - <<'PY'
from PIL import Image
import sys

attendu = {
    'assets/icon.png': ((1024, 1024), False),
    'assets/adaptive-icon.png': ((1024, 1024), True),
    'assets/adaptive-icon-background.png': ((1024, 1024), False),
    'assets/store/play-icon-512.png': ((512, 512), False),
}
faux = 0
for chemin, (taille, alpha_attendu) in attendu.items():
    im = Image.open(chemin)
    a = im.mode in ('RGBA', 'LA') or 'transparency' in im.info
    ok = im.size == taille and a == alpha_attendu
    faux += not ok
    print(f"  {'ok ' if ok else 'NON'} {chemin}  {im.size}  alpha={a}")
if faux:
    print('Au moins une sortie ne correspond pas à ce qui est attendu.', file=sys.stderr)
    sys.exit(1)
PY

# Guillemets SIMPLES, et c'est une correction, pas un style : entre guillemets
# doubles, les accents graves sont une substitution de commande. La première
# version de cette ligne a donc LANCÉ `expo prebuild --clean` au lieu de
# l'afficher, en fin de script, sans que rien ne le signale.
echo 'Fait. `npx expo prebuild --clean` régénère ensuite les déclinaisons natives.'
