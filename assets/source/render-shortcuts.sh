#!/usr/bin/env bash
# Renders launcher-shortcut icon foregrounds (long-press the app icon) from the Ionicons font
# the app already uses. Output: assets/shortcuts/<name>.png, 432×432 (108dp at xxxhdpi),
# glyph inside the adaptive-icon safe zone. The background colour is set in plugins/withAndroidShortcuts.js.
# Usage: CHROMIUM=/path/to/chromium assets/source/render-shortcuts.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
CHROMIUM=${CHROMIUM:-chromium}
FONT="$PWD/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf"
GLYPHS=node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json
OUT=assets/shortcuts
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

# name → Ionicons glyph (same icons as the in-app "+" sheet and tabs)
for pair in expense:remove-circle scan:scan dues:calendar assistant:sparkles; do
  name=${pair%%:*}
  glyph=${pair#*:}
  code=$(node -e "process.stdout.write(String(require('./$GLYPHS')['$glyph']))")
  cat > "$TMP/$name.html" <<HTML
<!doctype html><html><head><style>
@font-face{font-family:Ion;src:url("file://$FONT")}
html,body{margin:0;width:432px;height:600px;background:transparent}
div{width:432px;height:432px;display:flex;align-items:center;justify-content:center;
    font-family:Ion;font-size:150px;line-height:1;color:#4F46E5}
</style></head><body><div>&#$code;</div></body></html>
HTML
  "$CHROMIUM" --headless --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --window-size=432,600 --allow-file-access-from-files \
    --screenshot="$TMP/$name-raw.png" "file://$TMP/$name.html" >/dev/null 2>&1
  convert "$TMP/$name-raw.png" -crop 432x432+0+0 +repage "$OUT/$name.png"
done
echo "rendered shortcut icons into $OUT"
