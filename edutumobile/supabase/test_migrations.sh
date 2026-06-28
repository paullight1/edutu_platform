#!/bin/bash
# Migration Test Script
# Runs all SQL migrations in order against a test database and reports results.
#
# Usage: ./test_migrations.sh [database_url]
#   If no URL provided, defaults to $SUPABASE_TEST_DB_URL env var.

set -e

DB_URL="${1:-$SUPABASE_TEST_DB_URL}"

if [ -z "$DB_URL" ]; then
  echo "❌ No database URL provided."
  echo "Usage: ./test_migrations.sh postgres://user:pass@host:5432/dbname"
  echo "   Or: export SUPABASE_TEST_DB_URL=postgres://..."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "❌ Migrations directory not found: $MIGRATIONS_DIR"
  exit 1
fi

echo "🔍 Testing migrations against: ${DB_URL%@*}"  # hide password
echo "📂 Migrations directory: $MIGRATIONS_DIR"
echo ""

PASSED=0
FAILED=0
FAILURES=()

for migration in "$MIGRATIONS_DIR"/*.sql; do
  filename=$(basename "$migration")
  echo -n "  ▶ $filename ... "

  if psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$migration" > /dev/null 2>&1; then
    echo "✅ PASS"
    ((PASSED++))
  else
    echo "❌ FAIL"
    ((FAILED++))
    FAILURES+=("$filename")
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: $PASSED passed, $FAILED failed out of $((PASSED + FAILED)) migrations"

if [ ${#FAILURES[@]} -gt 0 ]; then
  echo ""
  echo "Failed migrations:"
  for f in "${FAILURES[@]}"; do
    echo "  ❌ $f"
  done
  exit 1
else
  echo "✅ All migrations passed!"
  exit 0
fi
