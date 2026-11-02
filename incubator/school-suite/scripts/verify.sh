#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v node >/dev/null || { echo "Node.js 20+ is required"; exit 1; }
node --check "$ROOT/portal/tenants.js"
node --check "$ROOT/portal/app.js"
node --check "$ROOT/services/ai-gateway/server.mjs"
node --check "$ROOT/services/ai-gateway/server.test.mjs"
node --test "$ROOT/portal/preview.test.mjs" "$ROOT/services/ai-gateway/server.test.mjs"
echo "SchoolSuite offline checks passed"
