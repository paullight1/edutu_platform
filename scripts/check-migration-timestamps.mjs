#!/usr/bin/env node
/**
 * Guard against duplicate migration timestamp prefixes in the authoritative
 * tree. Two migrations sharing a timestamp apply in a nondeterministic order.
 *
 * The five collisions below predate this rule and are already applied to the
 * live project — they can't be renamed without breaking the migration tracker,
 * so they're grandfathered. Any NEW collision fails the check.
 *
 * Usage: node scripts/check-migration-timestamps.mjs
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(
  here,
  "..",
  "backend",
  "services",
  "services",
  "api",
  "supabase",
  "migrations",
);

// Known, already-applied collisions (see docs/MIGRATIONS.md). Do NOT add to
// this list to silence a new collision — pick a fresh timestamp instead.
const GRANDFATHERED = new Set([
  "20260705120000",
  "20260705140000",
  "20260707120000",
  "20260712150000",
  "20260714120000",
]);

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
const byPrefix = new Map();
for (const file of files) {
  const prefix = file.slice(0, 14);
  if (!/^\d{14}$/.test(prefix)) continue;
  (byPrefix.get(prefix) ?? byPrefix.set(prefix, []).get(prefix)).push(file);
}

const offenders = [];
for (const [prefix, group] of byPrefix) {
  if (group.length > 1 && !GRANDFATHERED.has(prefix)) {
    offenders.push({ prefix, group });
  }
}

if (offenders.length > 0) {
  console.error("✗ Duplicate migration timestamp prefixes found:");
  for (const { prefix, group } of offenders) {
    console.error(`  ${prefix}: ${group.join(", ")}`);
  }
  console.error(
    "\nPick a fresh 14-digit timestamp. See docs/MIGRATIONS.md. Never reuse one.",
  );
  process.exit(1);
}

console.log(
  `✓ ${files.length} migrations, no new timestamp collisions ` +
    `(${GRANDFATHERED.size} grandfathered).`,
);
