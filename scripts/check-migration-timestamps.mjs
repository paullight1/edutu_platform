#!/usr/bin/env node

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(
  here,
  "..",
  "backend",
  "services",
  "services",
  "api",
  "supabase",
  "migrations",
);

// Historical collisions that predate this rule and correspond to already
// applied migrations. Do not extend this set for new files: choose a fresh
// timestamp instead.
const grandfathered = new Set([
  "20260705120000",
  "20260705140000",
  "20260707120000",
  "20260712150000",
  "20260714120000",
]);

const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));
const byPrefix = new Map();

for (const file of files) {
  const prefix = file.slice(0, 14);
  if (!/^\d{14}$/.test(prefix)) continue;
  const group = byPrefix.get(prefix) ?? [];
  group.push(file);
  byPrefix.set(prefix, group);
}

const offenders = [];
for (const [prefix, group] of byPrefix) {
  if (group.length > 1 && !grandfathered.has(prefix)) {
    offenders.push({ prefix, group });
  }
}

if (offenders.length > 0) {
  console.error("✗ Duplicate migration timestamp prefixes found:");
  for (const { prefix, group } of offenders) {
    console.error(`  ${prefix}: ${group.join(", ")}`);
  }
  console.error(
    "\nPick a fresh 14-digit timestamp. See docs/MIGRATIONS.md; never reuse one.",
  );
  process.exitCode = 1;
} else {
  console.log(
    `✓ ${files.length} migrations, no new timestamp collisions ` +
      `(${grandfathered.size} grandfathered).`,
  );
}
