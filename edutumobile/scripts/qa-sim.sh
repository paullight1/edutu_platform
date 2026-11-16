#!/usr/bin/env bash
#
# qa-sim.sh — one command to get the iOS Simulator running CURRENT code.
#
# Two things silently serve stale JS to the simulator, and this script fixes both:
#
#   1. A leftover Metro from an earlier session keeps port 8081. The simulator
#      deep-links to localhost:8081, so whichever bundler grabbed the port wins —
#      and a new `expo start` quietly falls back to 8082 rather than complaining.
#   2. ~/edutu-qa-build/edutumobile drifts. The repo lives under ~/Desktop, which
#      macOS TCC-protects, so xcodebuild can't run there and native builds run
#      from that plain-directory copy instead. It is NOT a git checkout, so it
#      freezes at whenever it was last synced.
#
# Metro always serves from the repo (so edits hot-reload); the clone is kept in
# step only so the next NATIVE rebuild isn't built from stale sources.
#
# Usage: ./scripts/qa-sim.sh [--no-clear]
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLONE="$HOME/edutu-qa-build/edutumobile"
BUNDLE_ID="com.tegm.edutuios"
PORT=8081

CLEAR_FLAG="--clear"
[[ "${1:-}" == "--no-clear" ]] && CLEAR_FLAG=""

say() { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$1"; }

# 1. Kill every stray bundler, then confirm the port is actually free. Without
#    the wait, the fresh `expo start` can lose the race to a dying process's
#    socket and silently pick 8082.
say "Killing stray Metro bundlers"
pkill -f 'expo start' 2>/dev/null || true
for _ in $(seq 1 15); do
  lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1 || break
  sleep 1
done
if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  warn "Port $PORT is still held by a non-Metro process:"
  lsof -nP -iTCP:$PORT -sTCP:LISTEN
  exit 1
fi

# 2. Sync repo -> clone. Excludes are load-bearing:
#    node_modules/ios/android  - clone has its own built/installed state
#    .env                      - clone keeps its own
#    ios/.xcode.env.local      - covered by ios/; holds the NODE_PATH build fix
#                                that makes headless xcodebuild codegen work
if [[ -d "$CLONE" ]]; then
  say "Syncing QA clone from repo"
  rsync -a --delete \
    --exclude 'node_modules/' --exclude 'ios/' --exclude 'android/' \
    --exclude '.expo/' --exclude '.env' --exclude '.git/' --exclude '.DS_Store' \
    "$REPO/" "$CLONE/"
  # Native config lives outside the JS bundle, so a change here needs a real
  # rebuild — Metro alone will not pick it up.
  if ! cmp -s "$REPO/app.config.js" "$CLONE/app.config.js"; then
    warn "app.config.js changed — native rebuild required, Metro won't apply it"
  fi
else
  warn "No QA clone at $CLONE — skipping sync (native rebuilds will need one)"
fi

# 3. Metro from the REPO, so live edits hot-reload into the simulator.
say "Starting Metro from repo on :$PORT"
cd "$REPO"
npx expo start --dev-client --port $PORT $CLEAR_FLAG &
METRO_PID=$!
trap 'kill $METRO_PID 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://localhost:$PORT/status" && break
  sleep 1
done
curl -sf -o /dev/null "http://localhost:$PORT/status" || { warn "Metro never came up"; exit 1; }

# 4. Cold-relaunch the app. A running app ignores the deep link, so terminate
#    first or it keeps whatever JS it already has in memory.
BOOTED="$(xcrun simctl list devices booted -j | grep -o '"udid" : "[^"]*"' | head -1 | cut -d'"' -f4 || true)"
if [[ -n "$BOOTED" ]]; then
  say "Reloading app on $BOOTED"
  xcrun simctl terminate "$BOOTED" "$BUNDLE_ID" >/dev/null 2>&1 || true
  sleep 2
  # Bypasses the dev-launcher menu and loads straight from Metro. The simulator
  # can't reach the launcher's LAN-IP entries; localhost works.
  xcrun simctl openurl "$BOOTED" \
    "edutu://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$PORT"
else
  warn "No booted simulator — boot one, then open:"
  warn "  edutu://expo-development-client/?url=http%3A%2F%2Flocalhost%3A$PORT"
fi

say "Metro is in the foreground. Ctrl-C stops it."
trap - EXIT
wait $METRO_PID
