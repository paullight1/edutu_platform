# Edutu Supabase API-First Hybrid Architecture

Date: 2026-08-29
Status: Approved in chat; awaiting review of this written specification

## Purpose

Simplify Edutu's Supabase architecture without interrupting production, losing data, weakening authorization, or breaking web and mobile functionality. The target keeps the parts of Supabase that materially help the product—managed Postgres, Realtime transport, Storage, and narrowly scoped Edge Functions—while making the NestJS API the single durable application-data contract.

## Audit baseline

The design responds to the following observed state in the linked `edutu.ai` project and repository:

- Four active-looking migration roots contain 160 SQL migration files.
- Fifteen migration versions collide across or within those roots.
- Production reports 145 migration-history entries; 60 local migrations and 37 remote entries cannot be matched reliably by version or name.
- Three SQL files executed on 2026-08-29 are present in production but absent from the remote migration ledger.
- The live `public` schema contains 143 tables, 207 functions, 148 RLS policies, and 48 `SECURITY DEFINER` functions.
- Supabase advisors reported 24 security warnings and 16 performance warnings.
- Fifty RLS-enabled tables have no policies. This is safe only when client privileges are also revoked.
- One anonymous and fifteen authenticated `SECURITY DEFINER` functions remain executable through the Data API; some are intentional user operations, while others need to move behind the API or become invoker-safe.
- Fifty-two non-test client files directly use Supabase data operations: 14 web, 34 mobile, and 4 admin.
- Realtime currently publishes four tables.
- Nine Storage buckets exist; the observed public `creator-proofs` bucket conflicts with the intended private handling of creator evidence.
- AI usage tables account for a material share of database size and need an explicit retention policy.

The production database is authoritative evidence of current state. It is not automatically the desired final design.

## Goals

1. Establish one migration and Supabase deployment root.
2. Make NestJS the only durable business-data contract for clients.
3. Preserve direct Supabase use only where it provides a clear platform benefit.
4. Make authorization, privileged functions, and Storage ownership explicit and testable.
5. Reconcile migration history without rewriting or destructively rebuilding production.
6. Detect schema, migration, privilege, and ORM drift in CI.
7. Preserve billing, credit, identity, application, community, and notification integrity throughout the transition.

## Non-goals

- Rebuilding the production database from scratch.
- Renaming or moving all existing tables in one release.
- Replacing Supabase, Clerk, NestJS, or Drizzle.
- Removing RLS from backend-owned tables.
- Dropping indexes only because the advisor labels them unused.
- Rewriting every feature in one deployment.

## Target architecture

### Durable application data

Web, mobile, and admin clients send all durable reads and mutations through the NestJS API. This includes profiles, opportunities, bookmarks, applications, goals, communities, admin operations, billing, credits, entitlements, AI usage, and account lifecycle.

The backend verifies Clerk tokens, derives the caller identity, applies domain authorization, and accesses Postgres through Drizzle or a narrowly scoped server-side Supabase client when a Supabase-specific capability requires it. User IDs supplied by clients never authorize access.

### Direct Supabase capabilities

Direct client Supabase access is limited to:

1. **Realtime subscriptions** on an explicit allowlist. Realtime delivers change signals and bounded payloads; initial state, backfill, durable writes, and authorization-sensitive reads come from the NestJS API.
2. **Signed Storage transfers**. The backend validates ownership, purpose, MIME type, size, and object path before issuing a short-lived upload or download capability. Sensitive buckets remain private.
3. **Clerk JWT transport** needed for the approved Realtime and Storage operations.

The steady-state client contract contains no business `.from()` calls and no privileged business `.rpc()` calls. Temporary exceptions require an owner, reason, test, removal milestone, and expiry date in the capability manifest.

### Edge Functions

Supabase Edge Functions are limited to provider webhooks, scheduled jobs, and Supabase-native integration points. They are not a parallel general-purpose application API.

Every active function must:

- live under the canonical root;
- have exactly one deployable implementation;
- fail closed when authentication or required secrets are absent;
- verify provider signatures or scheduler credentials;
- use bounded input, timeouts, response-size limits, and safe outbound-fetch rules where applicable;
- make retries idempotent before side effects;
- avoid returning or logging unnecessary PII;
- call a reviewed private database contract or an authenticated internal backend endpoint.

## Identity and authorization

- Clerk `sub`, represented as `text`, is the canonical application user ID.
- Policies and functions derive identity from verified JWT claims or backend context; they do not trust request body user IDs.
- Authorization does not use user-editable metadata.
- New policies use explicit `TO` roles and avoid deprecated `auth.role()` checks.
- RLS helper calls are wrapped for statement-level evaluation where safe and their lookup columns are indexed.
- Admin authorization is backend-owned. Admin clients do not directly query administrative tables or invoke administrative RPCs.
- `SECURITY DEFINER` is exceptional. A definer function requires a pinned safe `search_path`, fully qualified objects, explicit identity and authorization checks when user-callable, minimal grants, and tests for anonymous, ordinary authenticated, admin, and service-role callers.

## Database schema boundaries

The existing `public` schema remains a compatibility surface during convergence. New service-only tables and privileged helper functions should use an unexposed private schema. Existing objects move only when the operational benefit exceeds the compatibility risk.

Every table or function is classified in a machine-readable capability manifest with:

- domain owner;
- backend read/write permissions;
- client Data API permissions;
- Realtime publication status;
- Storage association;
- Edge Function callers;
- identity column and ownership rule;
- data sensitivity and retention class;
- deprecation status.

Service-only public tables keep RLS as defense in depth but must also revoke `anon` and `authenticated` privileges. RLS with no policy is accepted only for a documented service-only object with verified privilege revocation.

## Canonical migration and schema ownership

### Active source

`/supabase` becomes the only active Supabase project root. Future SQL migrations live only in `/supabase/migrations`, and deployable Edge Functions live only in `/supabase/functions`.

Legacy SQL from the backend, web, and mobile roots is preserved under a clearly non-deployable archive with provenance documentation. CI rejects new migration files outside the canonical root and rejects duplicate versions.

### Production baseline

Before moving files, the project captures:

- a schema-only production snapshot;
- the Supabase migration ledger;
- function definitions and grants;
- table privileges and RLS policies;
- Storage buckets and policies;
- Realtime publications;
- installed extensions and their schemas.

The snapshot is a reference artifact, not an automatically executed migration. Production migration history is not rewritten casually, and applied migrations are never renamed.

The three raw SQL changes executed on 2026-08-29 are reconciled with the ledger using the supported Supabase migration workflow only after a staging replay confirms the schema and ledger converge without re-executing non-idempotent DDL.

### Drizzle ownership

Supabase SQL migrations own physical schema evolution, RLS, grants, functions, triggers, Storage policies, publications, and extensions. Drizzle owns backend query mappings and application types.

Production `drizzle-kit push` is prohibited. CI compares Drizzle mappings with the canonical database schema and fails on incompatible drift. Generated database types are refreshed from the canonical schema rather than maintained as an independent source of truth.

## Migration from direct client access

Direct-access removal proceeds capability by capability:

1. Inventory the operation, caller, tables/RPCs, authorization assumptions, offline behavior, and tests.
2. Add or confirm the NestJS endpoint and shared contract.
3. Ship clients using the backend path while the previous path remains compatible.
4. Measure use of the legacy path and verify the replacement under retry, offline, and expired-session conditions.
5. Revoke the obsolete table/function privilege.
6. Remove the client adapter and obsolete RLS/RPC contract after the compatibility window.

Priority order is:

1. admin operations;
2. billing, credits, entitlements, and payment history;
3. profile and authorization mutations;
4. applications, creator review, and sensitive uploads;
5. communities and moderation;
6. goals, bookmarks, notifications, and analytics;
7. public/catalog reads that benefit from backend caching and stable response contracts.

## Storage and Realtime

Sensitive buckets, including CVs, AI documents, creator applications, creator proofs, and private community assets, are private. Public buckets require an explicit public-content classification and bounded MIME/size rules.

The backend owns object paths and metadata records. Upload completion is verified before durable metadata is trusted. Delete and replacement flows clean up both storage objects and metadata safely.

Realtime publication is allowlisted per table and event. Subscription authorization uses Clerk-backed RLS, and backend endpoints remain the recovery path after disconnects, missed events, or token refresh failures. Realtime events never grant permissions or confirm payment state.

## Security and performance remediation

Security work is prioritized by exploitability rather than advisor count:

1. anonymous privileged functions and client-callable administrative or arbitrary-user functions;
2. public sensitive Storage buckets;
3. broad client table privileges on service-owned data;
4. mutable search paths and unsafe privileged function placement;
5. deprecated or ambiguous authorization policies;
6. leaked-password protection and remaining platform configuration warnings.

Performance remediation prioritizes measured access patterns:

- add covering indexes for foreign keys used by joins and cascades;
- remove truly duplicate indexes after confirming constraint ownership;
- optimize per-row RLS helper evaluation;
- retain new or low-traffic indexes until representative query evidence exists;
- introduce an explicit retention and archival policy for AI usage events and logs;
- use query plans and `pg_stat_statements` for high-cost paths before structural changes.

## Deployment and rollback safety

- Changes are small, forward-only, and independently verifiable.
- Each migration runs against a production-derived staging baseline before production.
- Migrations set appropriate lock and statement timeouts.
- Large index builds use non-blocking patterns where transactions permit them.
- Destructive drops occur only after a compatibility release and telemetry confirms no callers remain.
- Backup/restore readiness is verified before high-risk schema changes.
- The normal rollback is a forward repair migration. Applied migration files and ledger entries are not rewritten.
- Billing, credits, and entitlements require invariant checks before and after every relevant migration.

## CI and verification

CI must verify:

- exactly one active Supabase root;
- globally unique migration versions;
- no deployable migration outside the canonical directory;
- clean migration replay into an empty local database;
- expected convergence against the captured baseline;
- RLS on all exposed tables;
- explicit privilege classification for every public table and function;
- no unapproved anonymous or authenticated `SECURITY DEFINER` execution;
- pinned search paths on privileged functions;
- no client business `.from()` or privileged `.rpc()` use outside temporary manifest exceptions;
- Drizzle/schema compatibility;
- SQL security tests for anonymous, authenticated, admin, and service-role behavior;
- backend contract tests and affected web/mobile/admin tests.

## Rollout stages

### Stage 0 — Evidence and freeze

Capture the production baseline, migration ledger, capability inventory, and restoration procedure. Prevent new migration roots and direct client access from being added.

### Stage 1 — Canonical tooling

Create the single root configuration, archive legacy roots, add the capability manifest, and install CI drift checks. No production privileges are revoked in this stage.

### Stage 2 — Critical boundary migration

Move admin, billing, credits, profile authorization, creator review, and sensitive upload operations behind NestJS. Harden the corresponding live privileges after client rollout.

### Stage 3 — Product data convergence

Move remaining direct durable operations behind stable backend contracts while preserving approved Realtime and signed Storage capabilities.

### Stage 4 — Database hygiene

Reconcile policies, functions, grants, indexes, retention, Edge Functions, and schema placement. Remove deprecated compatibility objects after telemetry-based review.

## Acceptance criteria

The architecture is complete when:

- `/supabase` is the only active project and deployment root;
- migration versions are unique and the canonical stream replays successfully;
- the production schema and migration ledger have a documented, reproducible reconciliation point;
- client code contains no durable business `.from()` calls or privileged business `.rpc()` calls;
- direct access consists only of approved Realtime subscriptions and signed Storage transfers;
- admin and billing operations are backend-only;
- no anonymous `SECURITY DEFINER` function is executable;
- every authenticated privileged function is explicitly justified and tested;
- service-only tables have no client privileges;
- sensitive buckets are private and ownership-tested;
- Drizzle drift fails CI;
- web, mobile, admin, Edge Function, and backend verification passes;
- rollout produces no data loss and no planned application downtime.

## Key risks and mitigations

- **Hidden client dependency:** use repository scans, runtime telemetry, compatibility releases, and delayed revocation.
- **Migration-ledger mismatch:** reconcile in staging first and never replay uncertain non-idempotent SQL directly in production.
- **Authorization regression:** retain RLS during transition and test every role before privilege changes.
- **Mobile upgrade lag:** keep versioned API compatibility until supported mobile releases have adopted the new path.
- **Billing inconsistency:** preserve provider-event idempotency and verify ledger/entitlement invariants transactionally.
- **Realtime gaps:** treat events as invalidation signals and recover authoritative state through the API.
- **Over-refactoring:** move existing objects only when required for security, ownership, or clear maintenance value.

## Final decisions

- Architecture style: API-first hybrid.
- Production continuity: zero planned downtime and no destructive baseline rebuild.
- Canonical migration root: `/supabase`.
- Durable client data contract: NestJS API.
- Direct Supabase contract: allowlisted Realtime and backend-authorized signed Storage only.
- Canonical user identity: Clerk `sub` as `text`.
- Physical schema authority: Supabase SQL migrations.
- ORM role: Drizzle query mapping and types, with drift verification.
