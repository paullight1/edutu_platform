#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Run only the isolated pilot. All four services communicate over loopback.
AUTO_APPLY_TEST_CV_SELECTION=1 bash scripts/auto-apply/run-simulator-pilot.sh &
pilot_pid=$!
trap 'kill "$pilot_pid" 2>/dev/null || true' EXIT
for ((i=0; i<90; i++)); do
  kill -0 "$pilot_pid" 2>/dev/null || { wait "$pilot_pid"; exit 1; }
  if (echo > "/dev/tcp/127.0.0.1/${AUTO_APPLY_TEST_API_PORT:-8093}") 2>/dev/null; then
    node scripts/auto-apply/check-simulator-pilot.mjs --selected-cv
    exit 0
  fi
  sleep 1
done
echo "The staging pilot did not become ready." >&2
exit 1
