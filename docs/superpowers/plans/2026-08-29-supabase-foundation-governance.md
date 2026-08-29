# Supabase Foundation and Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one canonical Supabase root, capture and reconcile the production baseline, freeze legacy migration sources, ratchet direct client database access downward, and enforce the architecture in CI without revoking runtime access yet.

**Architecture:** The repository root `supabase/` becomes the only writable Supabase project. Existing backend, web, and mobile migration histories are preserved as non-deployable archives after a production baseline is captured. Pure Node governance checks make new migration roots, duplicate timestamps, migration-tree edits, and new direct client Data API calls fail locally and in CI.

**Tech Stack:** Node.js 22 built-in test runner, Supabase CLI 2.116+, PostgreSQL 17, GitHub Actions, JSON governance artifacts, existing NestJS/Drizzle repository conventions.

**Spec:** `docs/superpowers/specs/2026-08-29-supabase-api-first-hybrid-design.md`

## Global Constraints

- Production continuity requires zero planned downtime and no destructive baseline rebuild.
- `/supabase` is the only active Supabase project and deployment root.
- Supabase SQL migrations own physical schema evolution; Drizzle remains a query/type mapping.
- Production `drizzle-kit push` must not be used.
- Clerk `sub` stored as `text` is the canonical application identity.
- This plan installs governance and reconciles known migration-ledger drift; it does not revoke client runtime privileges.
- Existing user changes in the dirty worktree must remain untouched. Each commit stages only files named in its task.
- Applied migration contents and filenames remain immutable; historical files move only after their digests and provenance are captured.
- The three known raw SQL applications are versions `20260827070117`, `20260828120000`, and `20260828153000`.
- Use Supabase CLI commands discovered from CLI 2.116 help. Never use `--include-all` against production during this plan.

## Plan decomposition

This is the first independently testable plan in the approved architecture. Later plans cover:

1. critical admin/billing/profile/API boundary migration;
2. remaining web and mobile durable-data migration;
3. Storage, Realtime, and Edge Function consolidation;
4. database privilege, function, policy, index, and retention hardening.

## File map

| File | Responsibility |
| --- | --- |
| `scripts/supabase-governance.mjs` | Pure repository scanners and validators. |
| `scripts/supabase-governance.test.mjs` | Unit tests for canonical-root, collision, frozen-history, and direct-access rules. |
| `scripts/check-supabase-governance.mjs` | Read-only CLI entrypoint used locally and in CI. |
| `scripts/capture-supabase-governance-baseline.mjs` | Explicitly updates reviewed legacy digests and direct-access baselines. |
| `supabase/governance/legacy-migrations.json` | Immutable filename and SHA-256 inventory of historical migration roots. |
| `supabase/governance/direct-client-baseline.txt` | Sorted set of current client files containing durable Supabase calls. |
| `supabase/governance/capabilities.json` | Machine-readable target Realtime/Storage capability declarations. |
| `supabase/config.toml` | Only active Supabase CLI project configuration. |
| `supabase/baseline/2026-08-29/*` | Production schema, ledger, catalog, and integrity hashes captured before archival. |
| `.github/workflows/architecture-governance.yml` | Fast governance test/check job. |
| `.github/workflows/ci.yml` | Removes conflicting legacy-tree logic and invokes the consolidated check. |
| `docs/MIGRATIONS.md` | Operator-facing migration ownership and commands. |
| `docs/operations/supabase-ledger-reconciliation.md` | Evidence and recovery procedure for the three repaired ledger entries. |
| `supabase/archive/README.md` | Provenance and non-deployable status of archived histories. |

---

### Task 1: Build the canonical-root and migration-history validator

**Files:**
- Create: `scripts/supabase-governance.mjs`
- Create: `scripts/supabase-governance.test.mjs`
- Create: `scripts/check-supabase-governance.mjs`

**Interfaces:**
- Produces: `inspectSupabaseGovernance(root: string): Promise<string[]>`
- Produces: `collectMigrationInventory(root: string): Promise<MigrationInventory>`
- Produces: `sha256File(path: string): Promise<string>`
- Consumes later: baseline JSON and direct-access baseline created in Task 2.

- [ ] **Step 1: Write failing canonical-root tests**

Create `scripts/supabase-governance.test.mjs` with fixtures that assert:

```js
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { inspectSupabaseGovernance } from "./supabase-governance.mjs";

async function write(root, path, content) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "edutu-supabase-governance-"));
  try {
    await write(root, "supabase/migrations/20260829090000_valid.sql", "select 1;\n");
    await write(root, "supabase/governance/legacy-migrations.json", "{\"version\":1,\"files\":[]}\n");
    await write(root, "supabase/governance/direct-client-baseline.txt", "");
    await write(root, "supabase/governance/capabilities.json", "{\"version\":1,\"realtime\":[],\"storage\":[]}\n");
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("accepts the root Supabase migration directory", async () => {
  await fixture(async (root) => {
    assert.deepEqual(await inspectSupabaseGovernance(root), []);
  });
});

test("rejects a new app-local migration root", async () => {
  await fixture(async (root) => {
    await write(root, "admin/supabase/migrations/20260829090100_wrong.sql", "select 1;\n");
    assert.ok((await inspectSupabaseGovernance(root)).includes(
      "unexpected active migration: admin/supabase/migrations/20260829090100_wrong.sql",
    ));
  });
});

test("rejects duplicate canonical timestamps", async () => {
  await fixture(async (root) => {
    await write(root, "supabase/migrations/20260829090000_collision.sql", "select 2;\n");
    assert.ok((await inspectSupabaseGovernance(root)).includes(
      "duplicate canonical migration version 20260829090000",
    ));
  });
});

test("rejects malformed canonical migration names", async () => {
  await fixture(async (root) => {
    await write(root, "supabase/migrations/29-08-2026-wrong.sql", "select 1;\n");
    assert.ok((await inspectSupabaseGovernance(root)).includes(
      "invalid canonical migration filename: supabase/migrations/29-08-2026-wrong.sql",
    ));
  });
});
```

- [ ] **Step 2: Run the tests and verify the module is missing**

Run: `node --test scripts/supabase-governance.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/supabase-governance.mjs`.

- [ ] **Step 3: Implement the repository scanner**

Create `scripts/supabase-governance.mjs` with these constants and exports:

```js
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

export const CANONICAL_MIGRATION_ROOT = "supabase/migrations";
export const HISTORICAL_MIGRATION_ROOTS = Object.freeze([
  "backend/services/services/api/supabase/migrations",
  "edutu-web-app/supabase/migrations",
  "edutumobile/supabase/migrations",
]);

const CANONICAL_NAME = /^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)*)\.sql$/u;
const IGNORED = new Set([".git", ".worktrees", ".claude", "dist", "node_modules"]);

export async function sha256File(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function collectMigrationInventory(root) {
  const files = [];

  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue;
      const absolute = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      if (!entry.isFile() || !entry.name.endsWith(".sql")) continue;
      const path = relative(root, absolute).split(sep).join("/");
      if (path.startsWith("supabase/migrations/") || path.includes("/supabase/migrations/")) {
        files.push(path);
      }
    }
  }

  await walk(root);
  return { files: files.sort() };
}

export async function inspectSupabaseGovernance(root) {
  const violations = [];
  const { files } = await collectMigrationInventory(root);
  const canonical = files.filter((path) => path.startsWith(`${CANONICAL_MIGRATION_ROOT}/`));
  const archived = files.filter((path) => path.startsWith("supabase/archive/"));
  const historical = new Set(HISTORICAL_MIGRATION_ROOTS);

  for (const path of files) {
    const directory = path.slice(0, path.lastIndexOf("/"));
    if (!path.startsWith(`${CANONICAL_MIGRATION_ROOT}/`) &&
        !path.startsWith("supabase/archive/") &&
        !historical.has(directory)) {
      violations.push(`unexpected active migration: ${path}`);
    }
  }

  const versions = new Map();
  for (const path of canonical) {
    const filename = path.slice(path.lastIndexOf("/") + 1);
    const match = CANONICAL_NAME.exec(filename);
    if (!match) {
      violations.push(`invalid canonical migration filename: ${path}`);
      continue;
    }
    const group = versions.get(match[1]) ?? [];
    group.push(path);
    versions.set(match[1], group);
  }
  for (const [version, group] of versions) {
    if (group.length > 1) violations.push(`duplicate canonical migration version ${version}`);
  }

  void archived;
  return [...new Set(violations)].sort();
}
```

Create `scripts/check-supabase-governance.mjs` as a thin runner that resolves the repository root, calls `inspectSupabaseGovernance`, prints each violation, and sets `process.exitCode = 1` when violations exist.

- [ ] **Step 4: Run the focused tests**

Run: `node --test scripts/supabase-governance.test.mjs`

Expected: PASS for all four tests.

- [ ] **Step 5: Commit the validator foundation**

```bash
git add scripts/supabase-governance.mjs scripts/supabase-governance.test.mjs scripts/check-supabase-governance.mjs
git commit -m "test(db): establish Supabase governance validator"
```

---

### Task 2: Add frozen-history and direct-client ratchets

**Files:**
- Modify: `scripts/supabase-governance.mjs`
- Modify: `scripts/supabase-governance.test.mjs`
- Create: `scripts/capture-supabase-governance-baseline.mjs`
- Create: `supabase/governance/legacy-migrations.json`
- Create: `supabase/governance/direct-client-baseline.txt`
- Create: `supabase/governance/capabilities.json`

**Interfaces:**
- Produces: `collectLegacyMigrationDigests(root): Promise<Array<{path:string,sha256:string}>>`
- Produces: `collectDirectSupabaseDataFiles(root): Promise<string[]>`
- Produces: ratchet semantics where existing direct-access files pass and any newly introduced file fails.

- [ ] **Step 1: Add failing ratchet tests**

Extend `scripts/supabase-governance.test.mjs` with tests that:

```js
test("rejects a changed historical migration", async () => {
  await fixture(async (root) => {
    await write(root, "backend/services/services/api/supabase/migrations/20260829080000_old.sql", "select 1;\n");
    const first = await collectLegacyMigrationDigests(root);
    await write(root, "supabase/governance/legacy-migrations.json", JSON.stringify({ version: 1, files: first }) + "\n");
    await write(root, "backend/services/services/api/supabase/migrations/20260829080000_old.sql", "select 2;\n");
    assert.ok((await inspectSupabaseGovernance(root)).includes(
      "historical migration changed: backend/services/services/api/supabase/migrations/20260829080000_old.sql",
    ));
  });
});

test("allows existing direct calls but rejects a new direct-data file", async () => {
  await fixture(async (root) => {
    await write(root, "edutu-web-app/src/services/existing.ts", "supabase.from('profiles').select('*');\n");
    await write(root, "supabase/governance/direct-client-baseline.txt", "edutu-web-app/src/services/existing.ts\n");
    assert.deepEqual(await inspectSupabaseGovernance(root), []);
    await write(root, "admin/src/new-direct.ts", "supabase.rpc('unsafe');\n");
    assert.ok((await inspectSupabaseGovernance(root)).includes(
      "new direct Supabase data access: admin/src/new-direct.ts",
    ));
  });
});
```

Import `collectLegacyMigrationDigests` from the governance module.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test scripts/supabase-governance.test.mjs`

Expected: FAIL because digest and direct-access collectors are not exported.

- [ ] **Step 3: Implement immutable-history and direct-access collection**

Add SHA-256 collection for every file under `HISTORICAL_MIGRATION_ROOTS`. Read `supabase/governance/legacy-migrations.json`, compare both filename and digest sets, and emit exact `historical migration added`, `historical migration removed`, or `historical migration changed` violations.

Scan these source roots for `.js`, `.jsx`, `.ts`, and `.tsx` files:

```js
export const CLIENT_SOURCE_ROOTS = Object.freeze([
  "admin/src",
  "edutu-web-app/src",
  "edutumobile/app",
  "edutumobile/components",
  "edutumobile/lib",
  "edutumobile/packages/core/src",
]);

const DIRECT_DATA_PATTERN = /\bsupabase\s*\.\s*(?:from|rpc)\s*\(|\bsupabase\s*\.\s*storage\s*\.\s*from\s*\(/u;
```

Ignore test files, test directories, declarations, generated output, Edge Functions, and the Supabase client factory itself. Compare the sorted result to `direct-client-baseline.txt`; only files absent from the baseline are violations. Files removed from the repository require no baseline edit, so the baseline acts as a one-way ratchet.

- [ ] **Step 4: Create the explicit baseline capture command**

Create `scripts/capture-supabase-governance-baseline.mjs` with an explicit `--write` requirement. Without `--write`, exit non-zero and explain that baseline changes require review. With it, write deterministic sorted legacy digests and direct-client filenames using a trailing newline.

Run:

```bash
node scripts/capture-supabase-governance-baseline.mjs --write
```

Expected: creates `legacy-migrations.json` and `direct-client-baseline.txt`; the direct baseline contains the currently detected web/mobile/admin files and no test or Edge Function paths.

- [ ] **Step 5: Declare the target direct capabilities**

Create `supabase/governance/capabilities.json` with this exact initial preservation model:

```json
{
  "version": 1,
  "identity": {
    "provider": "clerk",
    "claim": "sub",
    "databaseType": "text"
  },
  "realtime": [
    { "resource": "public.blog_posts", "status": "review", "clients": ["web"] },
    { "resource": "public.community_group_calls", "status": "approved", "clients": ["web", "mobile"] },
    { "resource": "public.community_group_messages", "status": "approved", "clients": ["web", "mobile"] },
    { "resource": "public.notifications", "status": "approved", "clients": ["web", "mobile"] }
  ],
  "storage": [
    { "bucket": "avatars", "visibility": "public", "status": "approved" },
    { "bucket": "blog-images", "visibility": "public", "status": "approved" },
    { "bucket": "opportunities_images", "visibility": "public", "status": "approved" },
    { "bucket": "opportunity-share-cards", "visibility": "public", "status": "approved" },
    { "bucket": "ai-documents", "visibility": "private", "status": "approved" },
    { "bucket": "community-assets", "visibility": "private", "status": "approved" },
    { "bucket": "creator-applications", "visibility": "private", "status": "approved" },
    { "bucket": "creator-proofs", "visibility": "private", "status": "remediate" },
    { "bucket": "cv-files", "visibility": "private", "status": "approved" }
  ]
}
```

- [ ] **Step 6: Run the full governance check**

Run:

```bash
node --test scripts/supabase-governance.test.mjs
node scripts/check-supabase-governance.mjs
```

Expected: PASS and `Supabase governance checks passed.`

- [ ] **Step 7: Commit the ratchets**

```bash
git add scripts/supabase-governance.mjs scripts/supabase-governance.test.mjs scripts/capture-supabase-governance-baseline.mjs supabase/governance
git commit -m "chore(db): freeze legacy migrations and direct access"
```

---

### Task 3: Switch repository governance to the root Supabase owner

**Files:**
- Modify: `scripts/check-architecture-boundaries.mjs`
- Modify: `scripts/architecture-boundaries.test.mjs`
- Delete: `scripts/check-migration-ownership.mjs`
- Delete: `scripts/migration-ownership.mjs`
- Delete: `scripts/migration-ownership.test.mjs`
- Delete: `scripts/check-migration-timestamps.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/architecture-governance.yml`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `node scripts/check-supabase-governance.mjs` from Tasks 1–2.
- Produces: one local and CI governance command with no contradictory canonical-root rules.

- [ ] **Step 1: Remove migration ownership from the generic architecture test**

Remove migration-directory fixtures and assertions from `architecture-boundaries.test.mjs`. The dedicated Supabase governance test already proves that `admin/supabase/migrations` is rejected. This prevents two scripts from encoding competing migration ownership rules.

- [ ] **Step 2: Run the architecture test and observe the old allowlist behavior**

Run: `node --test scripts/architecture-boundaries.test.mjs`

Expected: FAIL until the obsolete migration-root inspection is removed.

- [ ] **Step 3: Delegate all migration-root inspection to Supabase governance**

Delete `ALLOWED_MIGRATION_ROOTS` and the `supabase/migrations` directory branch from `check-architecture-boundaries.mjs`. Root ownership, historical roots, and `supabase/archive` are validated only by `check-supabase-governance.mjs`. Historical backend/web/mobile roots remain temporarily present and are immutable until Task 6 archives them.

- [ ] **Step 4: Consolidate package and workflow commands**

Set root scripts to:

```json
{
  "scripts": {
    "check:architecture": "node scripts/check-large-file-budgets.mjs && node scripts/check-architecture-boundaries.mjs && node scripts/check-supabase-governance.mjs",
    "test:governance": "node --test scripts/architecture-boundaries.test.mjs scripts/supabase-governance.test.mjs",
    "supabase:status": "supabase migration list --linked --workdir .",
    "supabase:push:dry": "supabase db push --linked --dry-run --workdir ."
  }
}
```

Preserve existing dependencies and devDependencies.

In `architecture-governance.yml`, run `npm run test:governance` followed by `npm run check:architecture`.

In `ci.yml`, remove the old migration-ownership/timestamp invocations and the Bash legacy-tree diff block. Add:

```yaml
      - run: node --test scripts/supabase-governance.test.mjs
      - run: node scripts/check-supabase-governance.mjs
```

- [ ] **Step 5: Remove superseded scripts and verify no references remain**

Delete the four old ownership/timestamp files listed above.

Run:

```bash
rg -n "migration-ownership|check-migration-timestamps" package.json scripts .github
npm run test:governance
npm run check:architecture
```

Expected: `rg` returns no matches; both npm commands pass.

- [ ] **Step 6: Commit consolidated governance**

```bash
git add package.json scripts .github/workflows/architecture-governance.yml .github/workflows/ci.yml
git commit -m "ci(db): enforce root Supabase ownership"
```

---

### Task 4: Establish the only active Supabase CLI configuration

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/README.md`
- Delete: `edutu-web-app/supabase/config.toml`
- Modify: `edutumobile/package.json`
- Modify: `edutumobile/deploy-migrations.sh`
- Modify: `edutumobile/deploy-migrations.ps1`

**Interfaces:**
- Produces: all CLI commands resolve the repository root through `--workdir`.
- Produces: no app package can push its historical migration folder.

- [ ] **Step 1: Add a failing configuration ownership test**

Add a governance test that walks the repository for `supabase/config.toml` and expects exactly:

```js
assert.deepEqual(configs, ["supabase/config.toml"]);
```

Expected current failure: the only configuration is under `edutu-web-app/supabase/config.toml`.

- [ ] **Step 2: Create the minimal root configuration**

Create `supabase/config.toml`:

```toml
project_id = "edutu"

[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 17

[db.migrations]
enabled = true
schema_paths = []

[db.seed]
enabled = false
sql_paths = []

[realtime]
enabled = true

[storage]
enabled = true
file_size_limit = "50MiB"

[auth]
enabled = true
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = ["http://127.0.0.1:5173"]
jwt_expiry = 3600
enable_signup = false
enable_anonymous_sign_ins = false
```

Delete the web-app configuration so nested CLI execution cannot select it.

- [ ] **Step 3: Disable app-local migration deployment**

Remove the `migrate` script from `edutumobile/package.json` and replace both deployment scripts with a fail-fast message directing operators to:

```bash
npm run supabase:status
npm run supabase:push:dry
```

The scripts must exit non-zero and must not invoke `supabase db push`.

- [ ] **Step 4: Document root-only operator behavior**

Create `supabase/README.md` covering:

- root-only CLI execution;
- `npm run supabase:status` for read-only status;
- `npm run supabase:push:dry` for a reviewed dry run;
- prohibition on `--include-all` and production `drizzle-kit push`;
- requirement for one migration per reviewed change;
- relationship between migrations, Drizzle mappings, Realtime, Storage, and Edge Functions.

- [ ] **Step 5: Verify configuration ownership and CLI parsing**

Run:

```bash
node --test scripts/supabase-governance.test.mjs
npx supabase --workdir . status
rg -n "supabase db push" edutumobile/package.json edutumobile/deploy-migrations.sh edutumobile/deploy-migrations.ps1
```

Expected: governance tests pass; Supabase CLI resolves the root project; `rg` finds no push command in mobile-owned files.

- [ ] **Step 6: Commit the root CLI boundary**

```bash
git add supabase/config.toml supabase/README.md edutu-web-app/supabase/config.toml edutumobile/package.json edutumobile/deploy-migrations.sh edutumobile/deploy-migrations.ps1
git commit -m "chore(db): centralize Supabase CLI ownership"
```

---

### Task 5: Capture production evidence and reconcile the known ledger gap

**Files:**
- Create: `supabase/baseline/2026-08-29/schema.sql`
- Create: `supabase/baseline/2026-08-29/migrations.json`
- Create: `supabase/baseline/2026-08-29/live-catalog.json`
- Create: `supabase/baseline/2026-08-29/checksums.sha256`
- Create: `supabase/baseline/2026-08-29/README.md`
- Create: `scripts/verify-supabase-baseline.mjs`
- Create: `scripts/verify-supabase-baseline.test.mjs`
- Create: `docs/operations/supabase-ledger-reconciliation.md`

**Interfaces:**
- Produces: immutable evidence used before historical migration archival.
- Produces: verified migration-history entries for the three SQL changes already present in production.

- [ ] **Step 1: Write failing artifact validation tests**

Create tests that assert:

- all five baseline artifacts exist;
- `migrations.json` contains project ref `sioxocmrjmdevsdlzjns` and the observed remote ledger;
- `live-catalog.json` records Postgres 17, all public tables/functions/policies, Storage buckets, Realtime publications, and function grants;
- `schema.sql` contains DDL but no table data copies or secret values;
- every artifact digest matches `checksums.sha256`;
- the README labels the snapshot non-deployable and contains the capture commands.

Run: `node --test scripts/verify-supabase-baseline.test.mjs`

Expected: FAIL because the verifier and artifacts do not exist.

- [ ] **Step 2: Capture the schema-only dump**

Run from the repository root using the linked project and an operator-supplied database password:

```bash
npx supabase db dump --linked --schema public,storage --keep-comments --file supabase/baseline/2026-08-29/schema.sql
```

Expected: a schema-only SQL dump; inspect it to confirm no `COPY` statements or secret values are present.

- [ ] **Step 3: Capture the migration ledger and catalog through the Supabase plugin**

Use `list_migrations` for project `sioxocmrjmdevsdlzjns` and save its structured migration array plus `capturedAt`, project ref, project name, and CLI version to `migrations.json`.

Use read-only catalog SQL to save these arrays to `live-catalog.json`:

- public tables with RLS flags and privileges;
- policies and expressions;
- functions with identity arguments, security mode, search path, and execute grants;
- views and security-invoker options;
- indexes and constraints;
- Storage buckets and policies;
- `supabase_realtime` publication tables;
- extensions and schemas.

Do not include table row data, auth users, emails, object names containing user IDs, secrets, or provider credentials.

- [ ] **Step 4: Verify the three raw SQL changes before ledger repair**

Execute this read-only production query and require every value to pass:

```sql
select
  (select count(*) = 2 from public.community_groups
   where slug in ('scholarship-opportunities-hub', 'global-opportunities-network')) as seed_ok,
  to_regclass('public.community_message_likes') is not null as likes_table_ok,
  to_regclass('public.community_creation_requests') is not null as requests_table_ok,
  (select count(*) = 3 from information_schema.columns
   where table_schema = 'public' and table_name = 'community_group_messages'
     and column_name in ('parent_message_id', 'pinned_at', 'pinned_by')) as engagement_columns_ok,
  (select count(*) = 3 from information_schema.columns
   where table_schema = 'public' and table_name = 'community_groups'
     and column_name in ('management_scope', 'trending_rank', 'updated_at')) as admin_columns_ok;
```

Expected: all five values are `true`. Stop without repairing history if any value is false.

- [ ] **Step 5: Repair only the verified ledger entries**

Run:

```bash
npx supabase migration repair --linked --status applied 20260827070117 20260828120000 20260828153000
npx supabase migration list --linked
```

Expected: all three versions appear exactly once in the remote ledger. Do not repair any other unmatched migration in this plan.

- [ ] **Step 6: Record integrity hashes and recovery procedure**

Create `checksums.sha256` using SHA-256 over the four evidence artifacts, sorted by path. Implement `verify-supabase-baseline.mjs` to verify structure and hashes without network access.

Document in `docs/operations/supabase-ledger-reconciliation.md`:

- pre-repair schema evidence;
- exact versions repaired;
- why SQL was not re-executed;
- post-repair ledger evidence;
- recovery command using `migration repair --status reverted` only if the production objects are proven absent and a database operator approves the correction.

- [ ] **Step 7: Run baseline verification**

Run:

```bash
node --test scripts/verify-supabase-baseline.test.mjs
node scripts/verify-supabase-baseline.mjs
npm run supabase:push:dry
```

Expected: tests and verifier pass; dry run proposes no reapplication of the three repaired migrations.

- [ ] **Step 8: Commit the immutable production baseline**

```bash
git add supabase/baseline/2026-08-29 scripts/verify-supabase-baseline.mjs scripts/verify-supabase-baseline.test.mjs docs/operations/supabase-ledger-reconciliation.md
git commit -m "docs(db): capture and reconcile production baseline"
```

---

### Task 6: Archive legacy migration roots without losing provenance

**Files:**
- Create: `supabase/archive/README.md`
- Move: `backend/services/services/api/supabase/migrations/` → `supabase/archive/backend-api/migrations/`
- Move: `edutu-web-app/supabase/migrations/` → `supabase/archive/web-app/migrations/`
- Move: `edutumobile/supabase/migrations/` → `supabase/archive/mobile/migrations/`
- Modify: `scripts/supabase-governance.mjs`
- Modify: `scripts/supabase-governance.test.mjs`
- Modify: backend migration contract tests that intentionally inspect historical SQL
- Modify: documentation and runbooks containing active commands for legacy paths

**Interfaces:**
- Consumes: verified digests and production baseline from Tasks 2 and 5.
- Produces: only `supabase/migrations` remains discoverable as an active migration directory.

- [ ] **Step 1: Add a failing archive-completeness test**

Add a test that loads `legacy-migrations.json`, maps each historical path to its archive destination, and asserts every recorded digest exists at exactly one destination while the three legacy active directories do not exist. The backend file `20260828120000_community_post_engagement.sql` is the sole promotion exception: its captured digest must exist at `supabase/migrations/20260828120000_community_post_engagement.sql`, not in the archive.

Run: `node --test scripts/supabase-governance.test.mjs`

Expected: FAIL because the legacy directories are still active.

- [ ] **Step 2: Move historical files mechanically**

Move files without editing SQL contents:

```bash
mkdir -p supabase/archive/backend-api supabase/archive/web-app supabase/archive/mobile
git mv backend/services/services/api/supabase/migrations supabase/archive/backend-api/migrations
git mv edutu-web-app/supabase/migrations supabase/archive/web-app/migrations
git mv edutumobile/supabase/migrations supabase/archive/mobile/migrations
```

Before staging, compare archived SHA-256 values with `legacy-migrations.json`. Stop if any content digest differs.

- [ ] **Step 3: Preserve historical contract-test intent**

Update tests that inspect historical SQL to resolve `supabase/archive/...` explicitly. Tests for the three 2026-08-29 canonical files must resolve root `supabase/migrations` instead:

- `community-first-impression-seed.spec.ts` → root canonical migration;
- `community-admin-management.migration.spec.ts` → root canonical migration;
- `community-post-engagement.migration.spec.ts` → root canonical migration after moving that SQL file into `supabase/migrations` without changing its contents;
- older billing/PGlite fixtures → the matching archive path.

No production code may import or execute archived SQL.

- [ ] **Step 4: Mark archive files non-deployable**

Create `supabase/archive/README.md` stating that the files are historical evidence, may contain obsolete or unsafe policies, are excluded from CLI discovery, and must never be copied into a live database. Include the original root-to-archive mapping and the baseline date.

- [ ] **Step 5: Replace active legacy documentation paths**

Update these current operational documents to root ownership:

- `docs/MIGRATIONS.md`
- `docs/ARCHITECTURE.md`
- `docs/ARCHITECTURE-BASELINE.md`
- `docs/edutu-detailed/05-data-supabase.md`
- `backend/services/services/api/DEPLOYMENT.md`
- `edutumobile/DEPLOYMENT.md`

Historical audits and dated plans retain their original paths because they are evidence, but add no executable instructions pointing operators at archived files.

- [ ] **Step 6: Verify archive integrity and affected contracts**

Run:

```bash
node --test scripts/supabase-governance.test.mjs
node scripts/check-supabase-governance.mjs
cd backend/services/services/api && npm test -- --runInBand billing-schema.contract.spec.ts community-first-impression-seed.spec.ts community-post-engagement.migration.spec.ts community-admin-management.migration.spec.ts community-realtime.migration.spec.ts
```

Expected: governance and all migration contract tests pass.

- [ ] **Step 7: Commit migration archival**

```bash
git add supabase/archive supabase/migrations backend/services/services/api/supabase/migrations edutu-web-app/supabase/migrations edutumobile/supabase/migrations scripts docs backend/services/services/api/src backend/services/services/api/test backend/services/services/api/DEPLOYMENT.md edutumobile/DEPLOYMENT.md
git commit -m "refactor(db): archive competing migration histories"
```

---

### Task 7: Final foundation verification and handoff

**Files:**
- Modify: `docs/MIGRATIONS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ARCHITECTURE-BASELINE.md`
- Modify: `docs/edutu-detailed/05-data-supabase.md`
- Create: `docs/operations/supabase-api-first-rollout.md`

**Interfaces:**
- Produces: the entry conditions and measured baseline for the next critical-boundary plan.

- [ ] **Step 1: Document the verified foundation state**

Record:

- the canonical root and CLI commands;
- baseline artifact paths and capture date;
- repaired versions and post-repair evidence;
- the current count of direct client files as the ratchet start;
- approved Realtime and Storage capabilities;
- the order of the four remaining implementation plans;
- the rule that runtime privilege revocation begins only after replacement APIs and compatible clients ship.

- [ ] **Step 2: Run repository governance**

Run:

```bash
npm run test:governance
npm run check:architecture
node scripts/verify-supabase-baseline.mjs
npm run supabase:status
npm run supabase:push:dry
```

Expected: all commands pass; status shows the repaired ledger entries; dry run does not attempt archived migrations.

- [ ] **Step 3: Run affected application verification**

Run:

```bash
cd backend/services/services/api && npm run lint && npm run test -- --runInBand && npm run build
cd ../../../../edutu-web-app && npm run typecheck && npm run test && npm run build
cd ../edutumobile && npm run typecheck && npm run test -- --runInBand
cd ../admin && npm run build && npm run test
```

Expected: all commands pass. If unrelated pre-existing dirty-worktree failures occur, record exact failing tests and prove the governance-specific test set remains green before proceeding.

- [ ] **Step 4: Re-run Supabase advisors without changing production**

Run security and performance advisors and save the new counts in `docs/operations/supabase-api-first-rollout.md`. This plan does not attempt to make advisor counts zero; it establishes the measured input for later hardening.

- [ ] **Step 5: Commit the foundation handoff**

```bash
git add docs/MIGRATIONS.md docs/ARCHITECTURE.md docs/ARCHITECTURE-BASELINE.md docs/edutu-detailed/05-data-supabase.md docs/operations/supabase-api-first-rollout.md
git commit -m "docs(db): hand off API-first Supabase foundation"
```

## Foundation completion gate

Do not start the critical-boundary plan until all conditions hold:

- root `supabase/` is the only active CLI project;
- legacy migration digests match the pre-archive baseline;
- the three raw SQL versions are present exactly once in the remote ledger;
- `supabase db push --dry-run` does not propose archived or already applied SQL;
- governance prevents new direct client data files and new migration roots;
- no client privilege has been revoked by this plan;
- affected backend migration contract tests pass;
- the production baseline contains no data or secrets.
