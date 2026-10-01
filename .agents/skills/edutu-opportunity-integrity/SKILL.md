---
name: edutu-opportunity-integrity
description: "Use when changing Edutu opportunity ingestion, publication, eligibility, deadlines, recommendations, AI enhancement, or application progress."
---

# Edutu Opportunity Integrity

## Workflow

1. Read `agent-system/README.md`. Trace the affected flow from source/admin/client
   through the API and persistence to public projection and UI. Start at
   `backend/services/services/api/src/opportunities/` and inspect related
   submission, verification, scraper, and test code before claiming behavior.
2. Keep authoritative source, source date, deadline timezone, eligibility facts,
   editorial changes, and uncertainty distinct. Missing eligibility must remain
   unknown; a recommendation is not a promise that the person qualifies.
3. Preserve draft/review/published/expired semantics actually defined by the
   approved contract. Check duplicate imports, changed sources, invalid URLs,
   expiry boundaries, and stale caches or embeddings after a change.
4. Preserve public-versus-privileged data projection. The inspected controller
   uses a capped public feed and strips internal fields; reverify current
   behavior and test that new fields do not leak through public endpoints.
5. Treat fetched HTML, documents, and AI suggestions as untrusted input. Require
   source-supported claims and review before applying enhancement. Do not
   automatically overwrite approved content with generated text.
6. For an opportunity-journey feature, opening an external application link
   must not mark submission. Only explicit confirmation may move to applied.
   This is a target invariant, not a claim that a journey module already exists.
7. Test absent/contradictory eligibility, deadline boundaries, duplicate retries,
   withdrawn opportunities, stale records, and cross-user progress changes.

## Evidence

Return source-to-field provenance, current state transitions, verified symbols,
requirement/test mapping, uncertainty, and effects on web, mobile, and admin.

## Stop conditions

Do not invent sources, deadlines, eligibility, application outcomes, or user
submission. Do not bypass editorial approval or treat an AI explanation as
independent evidence. Unsupported data must remain visibly unknown.
