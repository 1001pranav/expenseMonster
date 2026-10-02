#!/usr/bin/env bash
# Renders monster.svg into the PNGs app.config.ts points at. Needs Chromium and ImageMagick.
# Usage: CHROMIUM=/path/to/chromium assets/source/render.sh
set -euo pipefail
cd "$(dirname "$0")"
CHROMIUM=${CHROMIUM:-chromium}
OUT=..
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
SVG=$(sed '1d' monster.svg)  # drop the comment line

# $1 name, $2 css background, $3 scale of the mark (1 = as drawn), $4 mark colour
page() {
  cat > "$TMP/$1.html" <<HTML
<!doctype html><html><head><style>
html,body{margin:0;width:1024px;height:1200px;background:$2;overflow:hidden}
svg{position:absolute;inset:0;width:1024px;height:1024px;transform:scale($3);color:$4}
#monster{fill:$4}
</style></head><body>$SVG</body></html>
HTML
  "$CHROMIUM" --headless --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --window-size=1024,1200 --screenshot="$TMP/$1-raw.png" "file://$TMP/$1.html" >/dev/null 2>&1
  # The headless viewport is shorter than the window, so render tall and crop.
  convert "$TMP/$1-raw.png" -crop 1024x1024+0+0 +repage "$TMP/$1.png"
}

GRADIENT='linear-gradient(145deg,#6366F1 0%,#4F46E5 55%,#4338CA 100%)'

# iOS / legacy launcher: full bleed, no transparency allowed.
page icon "$GRADIENT" 1.18 '#fff'
convert "$TMP/icon.png" -background '#4F46E5' -alpha remove -alpha off "$OUT/icon.png"

# Android adaptive icon: the launcher masks to a circle/squircle and only the centre ~66% is safe,
# so the mark is drawn smaller on a transparent foreground over a separate gradient background.
page fg transparent 0.84 '#fff'
convert "$TMP/fg.png" -resize 512x512 "$OUT/android-icon-foreground.png"
page bg "$GRADIENT" 0 '#fff'
convert "$TMP/bg.png" -resize 512x512 -alpha off "$OUT/android-icon-background.png"
# Themed (Material You) icon: single-colour silhouette, the system tints it.
page mono transparent 0.84 '#000'
convert "$TMP/mono.png" -resize 432x432 "$OUT/android-icon-monochrome.png"

# Splash: white mark on the indigo splash background set in app.config.ts.
page splash transparent 1.25 '#fff'
convert "$TMP/splash.png" "$OUT/splash-icon.png"

convert "$TMP/icon.png" -resize 48x48 "$OUT/favicon.png"
echo "rendered icons into $(cd "$OUT" && pwd)"
