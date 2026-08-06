#!/usr/bin/env bash
#
# capture.sh — grabs the six raw screens the store listing is built from.
#
# Runs against a Release build on a 6.9" simulator (1320x2868 native, which is
# exactly Apple's required screenshot size — so the captures need no scaling).
#
# Release, not the dev client, on purpose: the dev client adds a purple splash
# and a floating dev-menu button, both of which would end up in the listing.
#
# The script cannot tap through the app, so it stops before each shot and waits
# for you to navigate. Get the screen right, then press Enter.
#
# Usage: ./scripts/store-shots/capture.sh [/path/to/Edutu.app]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE="$(cd "$HERE/../.." && pwd)"
RAW="$MOBILE/store-assets/raw"
SIM_NAME="Edutu-Shots"
BUNDLE_ID="com.tegm.edutuios"
APP_PATH="${1:-}"

say() { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$1"; }

mkdir -p "$RAW"

# 1. Resolve the simulator, creating it if this is a first run.
UDID="$(xcrun simctl list devices -j \
  | grep -B2 "\"name\" : \"$SIM_NAME\"" \
  | grep -o '"udid" : "[^"]*"' | head -1 | cut -d'"' -f4 || true)"
if [[ -z "$UDID" ]]; then
  say "Creating $SIM_NAME (iPhone 17 Pro Max)"
  UDID="$(xcrun simctl create "$SIM_NAME" \
    com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max \
    com.apple.CoreSimulator.SimRuntime.iOS-26-5)"
fi
say "Simulator $UDID"

xcrun simctl bootstatus "$UDID" -b >/dev/null 2>&1 || xcrun simctl boot "$UDID" || true
open -a Simulator

# 2. Install if an .app was passed or a Release build is sitting in the clone.
if [[ -z "$APP_PATH" ]]; then
  APP_PATH="$(find "$HOME/edutu-qa-build/edutumobile/ios/build/Build/Products/Release-iphonesimulator" \
    -maxdepth 1 -name '*.app' 2>/dev/null | head -1 || true)"
fi
if [[ -n "$APP_PATH" && -d "$APP_PATH" ]]; then
  say "Installing $(basename "$APP_PATH")"
  xcrun simctl install "$UDID" "$APP_PATH"
else
  warn "No .app found — assuming Edutu is already installed on the simulator"
fi

# 3. Apple rejects screenshots showing debug or partial status-bar chrome, so
#    pin it to the canonical 9:41 / full-signal / full-battery state.
say "Overriding status bar"
xcrun simctl status_bar "$UDID" override \
  --time "9:41" \
  --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 \
  --batteryState charged --batteryLevel 100

xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null 2>&1 || \
  warn "Could not launch $BUNDLE_ID — open it by hand"

# 4. One stop per shot. Reads id/screen/nav straight out of captions.json so the
#    shot list has exactly one definition.
say "Sign in, then walk through the six screens below."
echo

node -e '
  const {shots} = require("'"$HERE"'/captions.json");
  console.log(shots.map((s,i) => `${i+1}|${s.id}|${s.screen}|${s.nav}`).join("\n"));
' | while IFS='|' read -r num id screen nav; do
  printf '\033[1m Shot %s/6 — %s\033[0m\n' "$num" "$screen"
  printf '   %s\n' "$nav"
  read -r -p "   Press Enter to capture (s to skip): " ans </dev/tty
  if [[ "$ans" == "s" ]]; then
    warn "skipped $id"
    continue
  fi
  xcrun simctl io "$UDID" screenshot "$RAW/$id.png" >/dev/null 2>&1
  printf '   saved raw/%s.png\n\n' "$id"
done

say "Raw captures in $RAW"
say "Next: node scripts/store-shots/compose.mjs"
