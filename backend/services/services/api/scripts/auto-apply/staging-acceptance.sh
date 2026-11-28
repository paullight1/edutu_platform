#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

# Run only the isolated pilot. All four services communicate over loopback.
if [[ "${AUTO_APPLY_TEST_LOAD_LEARNERS:-0}" != 0 ]]; then
  checker=(scripts/auto-apply/check-simulator-load.mjs)
else
  export AUTO_APPLY_TEST_CV_SELECTION=1
  checker=(scripts/auto-apply/check-simulator-pilot.mjs --selected-cv)
fi
bash scripts/auto-apply/run-simulator-pilot.sh &
pilot_pid=$!
trap 'kill -TERM "$pilot_pid" 2>/dev/null || true; wait "$pilot_pid" 2>/dev/null || true' EXIT
for ((i=0; i<90; i++)); do
  kill -0 "$pilot_pid" 2>/dev/null || { wait "$pilot_pid"; exit 1; }
  if (echo > "/dev/tcp/127.0.0.1/${AUTO_APPLY_TEST_API_PORT:-8093}") 2>/dev/null; then
    node "${checker[@]}"
    exit 0
  fi
  sleep 1
done
echo "The staging pilot did not become ready." >&2
exit 1
