---
name: edutu-api-data-safety
description: "Use when Edutu changes affect the NestJS API, authorization, ownership, database schemas, migrations, Supabase access, or privileged writes."
---

# Edutu API and Data Safety

## Workflow

1. Read `agent-system/README.md`, the shared reviewer at
   `code-review-agents/edutu-code-review/SKILL.md`, and current auth, DTO,
   service, schema/migration, and test files. The API root is nested at
   `backend/services/services/api/`; verify current structure.
2. Trace caller identity through authentication, role checks, resource ownership,
   and database access. Client-supplied user IDs, hidden buttons, or a valid token
   alone do not establish authorization. Check anonymous and cross-user attempts.
3. Keep privileged business writes in the API. Do not introduce direct client
   writes for new opportunity-journey tables. Existing client/Supabase paths need
   a documented reason and correctly scoped RLS; do not silently rewrite them.
4. Inspect migration ordering, constraints, null/backfill behavior, transactions,
   concurrency, idempotency, indexes, and rollback/forward-repair feasibility.
   Distinguish a checked-in migration from a migration applied to any environment.
5. Require server-only service-role/provider/webhook/AI credentials. Public
   `VITE_*` and `EXPO_PUBLIC_*` values must not carry privileged secrets. Inspect
   examples and access code without dumping actual environment values or PII.
6. For credits, checkout, subscriptions, or webhooks, also read
   `code-review-agents/edutu-payments-review/SKILL.md`; verify currency units and
   provider contracts in current code rather than assuming the guide is current.

## Evidence

Return trust boundaries, affected symbols, ownership/role matrix, migration
risk, failure/retry cases, tests run, and P0-P3 findings with concrete fixes.
Separate required invariants from protections actually verified.

## Stop conditions

Never run `db:push`, `db:migrate`, seeding, cleanup, or production SQL merely
because a README lists the command. Require explicit environment-specific
approval. Block release for unresolved access-control or data-integrity risk.
