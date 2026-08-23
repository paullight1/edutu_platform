# Edutu Master Engine Hardening Design

## Goal

Turn the current Edutu opportunity backend into a safer, cheaper, more reusable engine without rewriting working subsystems. The immediate release target is to close the high-impact defects identified in the August 21 deep review while introducing boundaries that can later support project packs and durable distributed workers.

## Scope

This hardening slice changes existing engine behavior only where there is a concrete correctness, security, cost, scalability, or maintainability defect. It does not replace the current NestJS API, Supabase persistence, existing verification engine, or existing opportunity schema wholesale.

## Architecture decisions

### 1. Safe binary egress for opportunity images

All server-side image downloads must use a dedicated safe binary fetcher. The fetcher validates scheme/authority, resolves DNS, rejects any non-global address, pins the selected resolved address for the socket connection, revalidates every redirect, enforces an absolute timeout, caps response bytes, accepts only an explicit image MIME allowlist, and returns bytes only after a successful 2xx response.

The scraper image-storage path must stop using raw `axios.get()` for arbitrary scraped URLs. Image objects use a content hash for storage keys so identical images converge on one object. Bucket provisioning is removed from the request path; missing storage infrastructure is treated as an operational error rather than silently creating public infrastructure at runtime.

### 2. Truthful degraded snapshots and data normalization

Static opportunity snapshots use one recognized envelope and only expose rows that satisfy the same public visibility predicate as the live catalog. Legacy rows with no verification status are not treated as public merely because they are active.

Unknown monetary currency remains unknown rather than defaulting to USD. Unknown opportunity types remain unknown/reviewable rather than being coerced to `scholarship`.

### 3. AI cost and token policy

AI cost accounting is keyed by provider plus canonical model identity. Unknown model pricing is represented as unknown/unpriced, never zero-cost. OpenRouter namespaced models are priced independently from provider-native names.

Each compact structured feature receives a feature-level output budget. Reranking and other short JSON tasks must not inherit the generic 4096-token default when a much smaller response is sufficient.

### 4. Reranking is genuinely bidirectional

Hard eligibility gates remain deterministic. Soft AI reranking may increase or decrease a candidate's soft score within a bounded blend. The prompt uses compact normalized candidate features and short excerpts rather than full opportunity descriptions, reducing token usage and prompt-injection surface.

### 5. Source control plane

Source administration must support the fields already understood by the crawler: category, tier, priority, enabled state, grouping, parent relationship, and structured source config/selectors. Updates are patch-style and validated. This allows scholarship coverage to expand without code changes for every source.

### 6. Distributed developer API rate limiting

The correctness-critical per-minute consumer limiter moves from process-local memory to an atomic database-backed minute bucket. Local memory may remain only as an optional L1 optimization; it cannot define the authoritative quota in multi-replica deployments.

### 7. Runtime truthfulness and legacy containment

Production scraper misconfiguration must return an explicit unavailable/degraded result rather than synthetic mock success. Mock scrape behavior is permitted only in test/development mode behind an explicit engine-mode guard.

The root Express-era backend remains a migration target, not an authoritative runtime. No new functionality is added there. Follow-up removal is safe only after deployment/reference verification proves it is unused.

## Error handling

Security and trust checks fail closed. Optional AI enrichment and semantic scoring fail soft to deterministic behavior. Unknown facts remain unknown. Infrastructure absence is surfaced explicitly. Retries must not bypass egress, token, byte, or cost budgets.

## Testing strategy

Every behavior change is test-first. Security tests cover private IPs, redirect rebinding, MIME validation, and byte caps. Snapshot tests load the committed envelope shape and reject unverified rows. Normalization tests prove currency/type uncertainty is preserved. AI tests prove OpenRouter spend is priced and reranking can demote. API usage tests prove a shared database bucket is authoritative across service instances.

## Release gates

The focused tests for each slice must pass before moving on. Backend lint and build must pass for the modified backend. The full PR may remain red only for independently evidenced, pre-existing failures; those blockers are reported separately. Live deployment or production-database claims require genuine external evidence and are never inferred from repository tests.