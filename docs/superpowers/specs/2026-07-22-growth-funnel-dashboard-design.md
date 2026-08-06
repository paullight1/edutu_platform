# Growth Funnel + Cohort Retention Dashboard — Design

**Date:** 2026-07-22
**Status:** Approved (design), pending implementation plan
**Owner:** Product/PM

## Why

The goal is launch → profit → 100,000 users. "100k" is not a single lever; it is the
output of a funnel. We cannot manage what we cannot see. Today Edutu has **no product-
analytics pipeline** (mobile `analytics.ts` and web `analyticsAggregator.ts` are console
stubs; `analytics_events` / `analytics_snapshots` tables exist but have no writers). The
admin app shows point-in-time counts (`/admin/dashboard`) and revenue (`/monetization`),
but no funnel and no cohorts — so we cannot tell *which stage leaks* or *whether retention
is improving*.

This dashboard gives the team one source of truth for the five numbers that compound into
100k, built entirely on data Edutu **already collects** — no client instrumentation
required to ship v1.

## Scope

**In scope (v1):**
- A backend aggregation endpoint returning (a) a weekly funnel snapshot and (b) a cohort
  retention matrix.
- A daily snapshot cron writing to the existing (unused) `analytics_snapshots` table.
- A new **Growth** page in the standalone `admin/` app: funnel bar chart + cohort
  retention heatmap.

**Out of scope (explicitly deferred):**
- **Pre-signup visit tracking** — no landing-page analytics exist. Measuring visit→signup
  needs Plausible/GA on the web + landing pages. Separate ~30-min task. The funnel is
  labelled as starting at **Signup** so the top number is never mistaken for total traffic.
- Wiring the stubbed client event pipeline (`analytics_events`, mobile `trackEvent`).
  Not needed for this funnel; revisit only if we need screen-level steps
  (e.g. `paywall_view → subscribe`).
- Cohort *revenue* / LTV curves. v1 cohorts track engagement retention only.

## Funnel stage definitions

| Stage | Definition | Data source |
|---|---|---|
| **Signup** | Profile row exists | `profiles.created_at` |
| **Onboarded** | Completed onboarding | `profiles.preferences → 'onboarding' → 'completed' = true` (JSON) |
| **Activated** | Saved **OR** applied to ≥1 opportunity | `opportunity_bookmarks` OR `opportunity_applications` (any status) for the user |
| **Retained** | Any activity ≥7 days after signup | activity timestamps (see "Retention data source") |
| **Paying** | Pro (unexpired) or a real non-sandbox transaction | `profiles.is_pro` / `pro_expires_at`, `billing_transactions` + `payment_transactions` |

**Referral** (user invited ≥1 person) is reported as a parallel metric beside the funnel,
not a funnel stage. Source: referral tables (migration 032).

Activation is deliberately **save OR apply** (confirmed with owner) — the core value action
and the earliest reliable "aha" signal. Onboarding-completed is a softer upstream step and
is shown, but activation is the stage we optimize.

## Retention data source (the key technical decision)

Cohort retention asks: *of users who signed up in week X, what % were active in W1 / W2 /
W4 after signup?* `profiles.last_seen_at` stores only the **latest** activity, so it cannot
answer "active in week 2 specifically." We need historical activity. v1 uses **both** of:

1. **Retroactive reconstruction (primary — gives data on day one).**
   Derive per-user "active days" by unioning `created_at` (or equivalent) timestamps across:
   - `user_opportunity_signals` (the richest historical event log: view/save/apply/search),
   - `opportunity_applications`,
   - `opportunity_bookmarks`,
   - `ai_usage_events`,
   - `billing_transactions` / `payment_transactions`.

   From these, compute each user's active weeks relative to their `created_at` cohort week.
   This produces real cohort curves immediately from existing data.

2. **Forward daily snapshot (durability + `last_seen_at`-only users).**
   A daily cron writes an aggregate row into the existing **`analytics_snapshots`** table
   (`snapshot_type`, `timeframe`, `metrics` jsonb, `generated_at`). Makes future queries
   cheap and captures activity whose only trace is `last_seen_at`.

**Retention windows:** W1 / W2 / W4 (confirmed) — active in the calendar week 1 / 2 / 4
weeks after the signup week.

## Architecture

Follows the established admin aggregation pattern (raw Drizzle `sql` count/sum queries in
`admin.service.ts`, guarded by `AdminGuard`, consumed by a React page in `admin/`).

### Backend
- **`GET /admin/funnel`** (new) in `AdminController` → `AdminService.getFunnel()`.
  Returns:
  ```
  {
    funnel: {
      stages: [
        { key: 'signup',    thisWeek, lastWeek, total },
        { key: 'onboarded', thisWeek, lastWeek, total, convFromPrev },
        { key: 'activated', thisWeek, lastWeek, total, convFromPrev },
        { key: 'retained',  thisWeek, lastWeek, total, convFromPrev },
        { key: 'paying',    thisWeek, lastWeek, total, convFromPrev }
      ],
      referral: { invitersThisWeek, invitersTotal }
    },
    cohorts: [
      { cohortWeek: '2026-W28', size, w1Pct, w2Pct, w4Pct }
      // one row per recent signup-week cohort (last ~12 weeks)
    ]
  }
  ```
  Conversion rates computed relative to the previous stage's population, not to signup, so
  each `convFromPrev` reads as "of people who reached the prior stage, what % advanced."

- **Daily cron** `growth-snapshot`: aggregates the day's active-user / stage counts and
  upserts one `analytics_snapshots` row (`snapshot_type='engagement'`). Scheduled with the
  existing Nest scheduler pattern used by other crons.

### Admin UI (`admin/`)
- New route/page **`/growth`** → `admin/src/pages/Growth.tsx`, data via
  `admin/src/lib/*Api.ts` (new `growthApi.ts` or fold into existing admin api client).
- **Funnel view (top):** horizontal bars per stage with count, conversion-from-previous %,
  and trend vs last week; the **leakiest stage** (lowest `convFromPrev`) visually flagged so
  the "fix this next" answer is unmissable.
- **Cohort heatmap (below):** rows = signup-week cohorts (newest at top), columns = W1/W2/W4,
  cell = retention %, colour-scaled. Cohort size shown per row.
- Added to admin nav beside Dashboard and Monetization.

## Components & boundaries

- `AdminService.getFunnel()` — pure aggregation; one clear job (read tables → shape the
  funnel+cohort payload). Testable with seeded rows; no UI concerns.
- `GrowthSnapshotCron` — one job: compute today's aggregate, upsert one snapshot row.
  Independent of the read endpoint (endpoint works without it via reconstruction).
- `Growth.tsx` + `growthApi` — presentation only; consumes the endpoint payload, owns no
  business logic. Funnel component and cohort-heatmap component are separable.

## Error handling
- Endpoint is admin-guarded; unauthenticated/non-admin → existing guard behaviour.
- Each aggregate query is independent; a single failing sub-query degrades that metric to
  `null` (rendered as "—") rather than failing the whole page — matches existing dashboard
  resilience.
- Divide-by-zero on conversion rates (empty prior stage) → rate reported as `null`, not `0`.
- Cron failure logs and no-ops for the day; reconstruction path keeps the endpoint working.

## Testing
- Unit: seed `profiles` + signal/bookmark/application/billing rows across known dates;
  assert stage counts, conversion rates, and W1/W2/W4 cohort percentages.
- Edge cases: user with signup but no onboarding; onboarded but not activated; activated
  then never returned (retained=false); sandbox transaction excluded from Paying;
  empty prior stage → `null` conversion.
- Cron: assert exactly one `analytics_snapshots` row upserted per day (idempotent re-run).

## Success criteria
- Admin can, in one page, read this-week counts + conversion rate for all five stages with
  trend vs last week, and see W1/W2/W4 retention per recent cohort — all from live data on
  first deploy (no waiting period).
- The leakiest stage is identifiable at a glance.
- No new client instrumentation required to ship.

## Follow-on (post-v1, tracked separately)
- Landing-page visit analytics (Plausible/GA) to add the Visit→Signup step.
- Cohort revenue/LTV curves.
- Wire the client event pipeline if screen-level funnels become necessary.
