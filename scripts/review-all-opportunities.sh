#!/usr/bin/env bash
#
# One-click "review all remaining opportunities".
#
# Runs the backend verification pipeline over the entire backlog
# (status in active / pending / pending_review). Every candidate's live
# apply/source URL and deadline is checked, and the result is applied:
#
#   reachable URL, deadline in future  -> status = active   (now browseable)
#   dead link (404/410)                -> status = pending_review
#   deadline passed                    -> status = expired
#   transient error (timeout/5xx)      -> status unchanged, retried later
#
# This is a safe, honest review: it never force-publishes a broken link.
# New scraped opportunities arrive as `pending`, so re-run this whenever you
# want to promote the freshly-scraped, still-valid ones to the live catalog.
#
# Usage:
#   ./scripts/review-all-opportunities.sh            # dry-run preview, then real run
#   ./scripts/review-all-opportunities.sh --preview  # dry-run only, no writes
#
# Env overrides:
#   BACKEND_URL   (default http://localhost:3010)
#   ADMIN_EMAIL   (default nwosupaul3@gmail.com — must be in the backend ADMIN_EMAILS)
#
# Note: the local admin bypass requires EDUTU_LOCAL_ADMIN_BYPASS=true in the
# backend .env (already set for local dev).

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:3010}"
ADMIN_EMAIL="${ADMIN_EMAIL:-nwosupaul3@gmail.com}"
ENDPOINT="${BACKEND_URL}/opportunities/admin/verification/run"

run() {
  local dry="$1"
  curl -s -X POST "$ENDPOINT" \
    -H "X-Edutu-Admin-Email: ${ADMIN_EMAIL}" \
    -H "Content-Type: application/json" \
    -d "{\"limit\":1000,\"maxAgeHours\":720,\"concurrency\":12,\"dryRun\":${dry}}" \
    --max-time 600 \
  | python3 -c "import sys,json; d=json.load(sys.stdin); d.pop('outcomes',None); print(json.dumps(d,indent=2))"
}

echo "==> Reviewing backlog via ${ENDPOINT} (admin: ${ADMIN_EMAIL})"
echo ""
echo "--- Dry run (preview, no DB writes) ---"
run true

if [[ "${1:-}" == "--preview" ]]; then
  echo ""
  echo "Preview only. Re-run without --preview to apply."
  exit 0
fi

echo ""
echo "--- Applying (real run) ---"
run false
echo ""
echo "Done. 'verifiedCount' opportunities are now status=active and browseable."
