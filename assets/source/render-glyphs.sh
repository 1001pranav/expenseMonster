#!/usr/bin/env bash
# Renders icons from the Ionicons font the app already uses:
# - launcher shortcuts (long-press the app icon): assets/shortcuts/<name>.png, 432×432 (108dp at
#   xxxhdpi), indigo glyph inside the adaptive-icon safe zone (background set in withAndroidShortcuts.js)
# - home-screen widget buttons: assets/widget/<name>.png, 96×96 white glyphs (24dp at xxxhdpi)
# Usage: CHROMIUM=/path/to/chromium assets/source/render-glyphs.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
CHROMIUM=${CHROMIUM:-chromium}
FONT="$PWD/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf"
GLYPHS=node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json
OUT=assets/shortcuts
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

# $1 out file, $2 glyph name, $3 canvas px, $4 font px, $5 colour
render() {
  local code
  code=$(node -e "process.stdout.write(String(require('./$GLYPHS')['$2']))")
  cat > "$TMP/page.html" <<HTML
<!doctype html><html><head><style>
@font-face{font-family:Ion;src:url("file://$FONT")}
html,body{margin:0;width:${3}px;height:$(( $3 + 200 ))px;background:transparent}
div{width:${3}px;height:${3}px;display:flex;align-items:center;justify-content:center;
    font-family:Ion;font-size:${4}px;line-height:1;color:$5}
</style></head><body><div>&#$code;</div></body></html>
HTML
  "$CHROMIUM" --headless --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --default-background-color=00000000 --window-size=$3,$(( $3 + 200 )) --allow-file-access-from-files \
    --screenshot="$TMP/raw.png" "file://$TMP/page.html" >/dev/null 2>&1
  convert "$TMP/raw.png" -crop "${3}x${3}+0+0" +repage "$1"
}

# Shortcuts: same icons as the in-app "+" sheet and tabs.
for pair in expense:remove-circle scan:scan dues:calendar assistant:sparkles; do
  render "$OUT/${pair%%:*}.png" "${pair#*:}" 432 150 '#5B3DF5'
done

# Widget buttons.
mkdir -p assets/widget
for pair in expense:remove-circle income:add-circle scan:scan; do
  render "assets/widget/${pair%%:*}.png" "${pair#*:}" 96 88 '#FFFFFF'
done
# Widget preview for the picker on Android < 12 (12+ renders the real layout). Mirrors
# plugins/withAndroidWidget.js: logo + three translucent pills on the brand colour.
pill() { echo "<div class=b><img src=\"file://$PWD/assets/widget/$1.png\"><span>$2</span></div>"; }
cat > "$TMP/preview.html" <<HTML
<!doctype html><html><head><style>
html,body{margin:0;width:512px;height:300px;background:transparent;font-family:Roboto,Arial,sans-serif}
.w{box-sizing:border-box;width:512px;height:112px;padding:12px;border-radius:48px;background:#5B3DF5;display:flex;align-items:center;gap:8px}
.logo{width:88px;height:88px;padding:8px;box-sizing:border-box}
.b{flex:1;height:88px;border-radius:32px;background:rgba(255,255,255,.13);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:24px}
.b img{width:44px;height:44px;margin-bottom:4px}
</style></head><body><div class=w><img class=logo src="file://$PWD/assets/splash-icon.png">
$(pill expense Expense)$(pill income Income)$(pill scan Scan)</div></body></html>
HTML
"$CHROMIUM" --headless --no-sandbox --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --default-background-color=00000000 --window-size=512,300 --allow-file-access-from-files \
  --screenshot="$TMP/preview-raw.png" "file://$TMP/preview.html" >/dev/null 2>&1
convert "$TMP/preview-raw.png" -crop 512x112+0+0 +repage assets/widget/preview.png

echo "rendered shortcut and widget icons"
