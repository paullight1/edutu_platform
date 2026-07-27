# Growth Funnel + Cohort Retention Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the team one admin page showing the five-stage growth funnel (Signup → Onboarded → Activated → Retained → Paying) with weekly conversion + trend, plus W1/W2/W4 cohort retention — all from data Edutu already collects.

**Architecture:** One new admin-guarded backend endpoint `GET /admin/funnel` aggregates existing Postgres/Supabase tables with raw Drizzle `sql` queries (the pattern already used by `AdminService.getDashboard`). A daily `@Cron` writes an aggregate row into the existing-but-unused `analytics_snapshots` table for durability. A new lazy-loaded `Growth` page in the `admin/` React app renders a funnel bar chart and a cohort heatmap via `backendFetchJson`.

**Tech Stack:** NestJS + Drizzle (`db.execute(sql\`…\`)`), `@nestjs/schedule`, Jest (`jest.mock("../db")` SQL-text harness); React + Vite + Tailwind + lucide-react in `admin/`.

## Global Constraints

- **Backend aggregation must use `db.execute(sql\`…\`)` raw queries only** (no `db.select()` query-builder) so the `jest.mock("../db")` SQL-text harness can drive tests. Copy the helper `this.extractRows<T>(result)` / `this.extractCount(result)` already in `admin.service.ts`.
- **Endpoint is admin-only:** `AdminController` is already `@UseGuards(AdminGuard)` at class level — new routes inherit it. Do not add auth per-route.
- **Resilience:** each aggregate sub-query is independent; a thrown sub-query degrades that metric to `null` (rendered "—"), never fails the whole response. Conversion with an empty prior-stage denominator returns `null`, never `0`.
- **Known id-namespace limitation (do not try to fix in v1):** `user_id` columns are TEXT and some tables key on raw Clerk ids vs profile ids (see memory "3 id namespaces"). Stage matching is by `user_id` string equality; where namespaces differ, activation/retention is *undercounted*. This is acceptable for v1 and must be noted in the DTO doc-comment and the page's footnote. Do NOT add id-reconciliation logic here.
- **DTO style:** add `export interface` types to `backend/services/services/api/src/admin/admin.dto.ts`; import them in both the controller and the admin frontend (frontend re-exports admin DTOs via `admin/src/lib/adminApi.ts`).
- **Retention windows are relative week indices** from each user's signup: week index = `floor((activity_date − signup_date) / 7)`. W1 = index 1 (days 7–13), W2 = index 2 (days 14–20), W4 = index 4 (days 28–34). Week 0 (days 0–6) is the signup week and is NOT retention.

---

## File Structure

**Backend** (`backend/services/services/api/src/`)
- `admin/admin.dto.ts` — MODIFY: add `AdminFunnelResponse`, `AdminFunnelStage`, `AdminFunnelCohort` interfaces.
- `admin/admin.service.ts` — MODIFY: add `getFunnel()` + private helpers `buildFunnelStages()`, `buildCohorts()`, `activityUnionSql()`.
- `admin/admin.controller.ts` — MODIFY: add `@Get("funnel")`.
- `analytics/growth-snapshot.service.ts` — CREATE: `@Cron` daily job writing `analytics_snapshots`.
- `analytics/analytics.module.ts` — CREATE: module providing the cron (imports `AdminModule` to reuse `AdminService`).
- `app.module.ts` — MODIFY: register `AnalyticsModule`.
- `admin/admin.service.funnel.spec.ts` — CREATE: unit tests for funnel + cohorts.
- `analytics/growth-snapshot.service.spec.ts` — CREATE: unit test for the cron upsert.

**Frontend** (`admin/src/`)
- `lib/growthApi.ts` — CREATE: types (re-exported from backend DTO shape) + `getFunnel()` fetch.
- `pages/Growth.tsx` — CREATE: funnel bars + cohort heatmap page.
- `App.tsx` — MODIFY: lazy import, `<Route path="growth" …>`, nav entry.

---

## Task 1: Backend — funnel stage aggregation + endpoint

Builds `GET /admin/funnel` returning the five stages (Signup, Onboarded, Activated, Retained, Paying) with `total`, `newThisWeek`, `newLastWeek`, `convFromPrev`, plus the `referral` block. Cohorts come in Task 2 (returned as `[]` here).

**Files:**
- Modify: `backend/services/services/api/src/admin/admin.dto.ts`
- Modify: `backend/services/services/api/src/admin/admin.service.ts`
- Modify: `backend/services/services/api/src/admin/admin.controller.ts`
- Test: `backend/services/services/api/src/admin/admin.service.funnel.spec.ts`

**Interfaces:**
- Produces:
  - `AdminService.getFunnel(): Promise<AdminFunnelResponse>`
  - `interface AdminFunnelStage { key: 'signup'|'onboarded'|'activated'|'retained'|'paying'; label: string; total: number | null; newThisWeek: number | null; newLastWeek: number | null; convFromPrev: number | null }`
  - `interface AdminFunnelCohort { cohortWeek: string; size: number; w1Pct: number | null; w2Pct: number | null; w4Pct: number | null }`
  - `interface AdminFunnelResponse { generatedAt: string; stages: AdminFunnelStage[]; referral: { invitersTotal: number | null; invitersThisWeek: number | null }; cohorts: AdminFunnelCohort[] }`

- [ ] **Step 1: Add DTO interfaces**

In `admin/admin.dto.ts`, append:

```typescript
export interface AdminFunnelStage {
  key: "signup" | "onboarded" | "activated" | "retained" | "paying";
  label: string;
  /** Cumulative population currently at this stage. null if the query failed. */
  total: number | null;
  /** Users who entered this stage in the last 7 days. */
  newThisWeek: number | null;
  /** Users who entered this stage in the 7 days before that. */
  newLastWeek: number | null;
  /** total / previous stage total, in [0,1]. null for signup or empty prior stage. */
  convFromPrev: number | null;
}

export interface AdminFunnelCohort {
  /** ISO week label, e.g. "2026-W28". */
  cohortWeek: string;
  size: number;
  /** % of cohort active in relative week 1 / 2 / 4. null if window not yet elapsed. */
  w1Pct: number | null;
  w2Pct: number | null;
  w4Pct: number | null;
}

export interface AdminFunnelResponse {
  generatedAt: string;
  /**
   * NOTE: stage matching is by user_id string equality across tables that may
   * use different id namespaces (Clerk vs profile). Cross-namespace users are
   * undercounted at activated/retained. See plan Global Constraints.
   */
  stages: AdminFunnelStage[];
  referral: { invitersTotal: number | null; invitersThisWeek: number | null };
  cohorts: AdminFunnelCohort[];
}
```

- [ ] **Step 2: Write the failing test**

Create `admin/admin.service.funnel.spec.ts`. It mocks `../db` with the SQL-text harness (copied from `monetization.metering.spec.ts`) and routes each rendered query to a canned result by matching a table name / marker in the SQL.

```typescript
import { Logger } from "@nestjs/common";

jest.mock("../db", () => {
  const handlers: Record<string, any> = {};
  (globalThis as Record<string, any>).__funnelHandlers = handlers;
  const render = (query: any): string =>
    ((query?.queryChunks ?? []) as any[])
      .map((c) =>
        typeof c === "string" ? c : Array.isArray(c?.value) ? c.value.join("") : "",
      )
      .join("");
  const execute = async (query: any) => {
    const text = render(query);
    return handlers.execute ? handlers.execute(text) : { rows: [] };
  };
  return { db: { execute } };
});

import { AdminService } from "./admin.service";

const handlers = (): Record<string, any> =>
  (globalThis as Record<string, any>).__funnelHandlers;

/** Route a rendered SQL string to a canned { rows } payload by content marker. */
function route(map: Array<[string, any[]]>) {
  return (text: string) => {
    for (const [marker, rows] of map) if (text.includes(marker)) return { rows };
    return { rows: [] };
  };
}

function buildService(): AdminService {
  // Constructor is (clerkClient, auditService); getFunnel touches neither, so stub both.
  // AdminService does NOT import from ../auth — no auth mock needed.
  return new AdminService({} as any, { record: async () => undefined } as any);
}

describe("AdminService.getFunnel — stages", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("computes totals, weekly entrants, and conversion from previous stage", async () => {
    handlers().execute = route([
      // stage totals (each query tagged with a distinct marker comment)
      ["-- funnel:signup:total", [{ count: 100 }]],
      ["-- funnel:onboarded:total", [{ count: 60 }]],
      ["-- funnel:activated:total", [{ count: 30 }]],
      ["-- funnel:retained:total", [{ count: 12 }]],
      ["-- funnel:paying:total", [{ count: 6 }]],
      // weekly entrants (this week / last week) — one query returns both columns
      ["-- funnel:signup:weekly", [{ this_week: 20, last_week: 15 }]],
      ["-- funnel:onboarded:weekly", [{ this_week: 10, last_week: 8 }]],
      ["-- funnel:activated:weekly", [{ this_week: 5, last_week: 4 }]],
      ["-- funnel:retained:weekly", [{ this_week: 3, last_week: 2 }]],
      ["-- funnel:paying:weekly", [{ this_week: 1, last_week: 1 }]],
      // referral
      ["-- funnel:referral", [{ total: 8, this_week: 2 }]],
    ]);

    const res = await buildService().getFunnel();

    const byKey = Object.fromEntries(res.stages.map((s) => [s.key, s]));
    expect(byKey.signup.total).toBe(100);
    expect(byKey.signup.convFromPrev).toBeNull();
    expect(byKey.onboarded.total).toBe(60);
    expect(byKey.onboarded.convFromPrev).toBeCloseTo(0.6);
    expect(byKey.activated.convFromPrev).toBeCloseTo(0.5); // 30/60
    expect(byKey.activated.newThisWeek).toBe(5);
    expect(byKey.paying.convFromPrev).toBeCloseTo(0.5); // 6/12
    expect(res.referral.invitersTotal).toBe(8);
    expect(res.cohorts).toEqual([]);
  });

  it("returns null conversion when the prior stage is empty, and null total on query failure", async () => {
    handlers().execute = (text: string) => {
      if (text.includes("-- funnel:activated:total")) throw new Error("boom");
      if (text.includes("-- funnel:onboarded:total")) return { rows: [{ count: 0 }] };
      if (text.includes(":total")) return { rows: [{ count: 0 }] };
      if (text.includes(":weekly")) return { rows: [{ this_week: 0, last_week: 0 }] };
      if (text.includes("referral")) return { rows: [{ total: 0, this_week: 0 }] };
      return { rows: [] };
    };
    const res = await buildService().getFunnel();
    const byKey = Object.fromEntries(res.stages.map((s) => [s.key, s]));
    expect(byKey.activated.total).toBeNull(); // sub-query threw → degraded
    expect(byKey.retained.convFromPrev).toBeNull(); // prev (activated) null/0 → null
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend/services/services/api && npx jest admin/admin.service.funnel.spec.ts`
Expected: FAIL — `getFunnel is not a function`.

- [ ] **Step 4: Implement `getFunnel` + helpers**

In `admin/admin.service.ts`, import the new DTO types alongside the existing admin.dto imports, then add the method. Each stage total is its own `db.execute`; the marker comments in the SQL are what the tests match on. Wrap each sub-query so a throw degrades to `null`.

```typescript
private async safeCount(run: () => Promise<unknown>): Promise<number | null> {
  try {
    const rows = this.extractRows<{ count?: number }>(await run());
    return Number(rows[0]?.count ?? 0);
  } catch (error) {
    this.logger.error(`funnel count failed: ${(error as Error).message}`);
    return null;
  }
}

/**
 * SQL fragment: (user_id, created_at) for any real activity, one per union member.
 * NOTE: ai_usage_events.created_at is `timestamp` (no tz) in the live DB while the
 * others are `timestamptz`; cast every member to timestamptz so the UNION resolves
 * to one type. All user_id columns are `text` in the live DB (verified), so the
 * downstream join `p.user_id = act.user_id` is a valid text-to-text comparison.
 */
private activityUnionSql() {
  return sql`
    select user_id, created_at::timestamptz as created_at from user_opportunity_signals
    union all select user_id, created_at::timestamptz from opportunity_applications
    union all select user_id, created_at::timestamptz from opportunity_bookmarks
    union all select user_id, created_at::timestamptz from ai_usage_events
    union all select user_id, created_at::timestamptz from billing_transactions
  `;
}

async getFunnel(): Promise<AdminFunnelResponse> {
  const generatedAt = new Date().toISOString();
  const activity = this.activityUnionSql();

  const [
    signupTotal, onboardedTotal, activatedTotal, retainedTotal, payingTotal,
  ] = await Promise.all([
    this.safeCount(() => db.execute(sql`-- funnel:signup:total
      select count(*)::int as count from profiles`)),
    this.safeCount(() => db.execute(sql`-- funnel:onboarded:total
      select count(*)::int as count from profiles
      where (preferences->'onboarding'->>'completed')::boolean is true`)),
    this.safeCount(() => db.execute(sql`-- funnel:activated:total
      select count(distinct user_id)::int as count from (
        select user_id from opportunity_bookmarks
        union select user_id from opportunity_applications) a`)),
    this.safeCount(() => db.execute(sql`-- funnel:retained:total
      select count(distinct act.user_id)::int as count
      from (${activity}) act
      join profiles p on p.user_id = act.user_id
      where act.created_at >= p.created_at + interval '7 days'`)),
    this.safeCount(() => db.execute(sql`-- funnel:paying:total
      select count(*)::int as count from profiles
      where is_pro is true and (pro_expires_at is null or pro_expires_at > now())`)),
  ]);

  const weekly = async (marker: string, query: any) => {
    try {
      const rows = this.extractRows<{ this_week?: number; last_week?: number }>(
        await db.execute(query),
      );
      return {
        newThisWeek: Number(rows[0]?.this_week ?? 0),
        newLastWeek: Number(rows[0]?.last_week ?? 0),
      };
    } catch {
      return { newThisWeek: null, newLastWeek: null };
    }
  };

  const [wSignup, wOnboarded, wActivated, wRetained, wPaying] = await Promise.all([
    weekly("signup", sql`-- funnel:signup:weekly
      select
        count(*) filter (where created_at >= now() - interval '7 days')::int as this_week,
        count(*) filter (where created_at >= now() - interval '14 days'
                          and created_at < now() - interval '7 days')::int as last_week
      from profiles`),
    weekly("onboarded", sql`-- funnel:onboarded:weekly
      select
        count(*) filter (where ts >= now() - interval '7 days')::int as this_week,
        count(*) filter (where ts >= now() - interval '14 days'
                          and ts < now() - interval '7 days')::int as last_week
      from (select (preferences->'onboarding'->>'completedAt')::timestamptz as ts
            from profiles
            where (preferences->'onboarding'->>'completed')::boolean is true) o
      where ts is not null`),
    weekly("activated", sql`-- funnel:activated:weekly
      select
        count(*) filter (where first_at >= now() - interval '7 days')::int as this_week,
        count(*) filter (where first_at >= now() - interval '14 days'
                          and first_at < now() - interval '7 days')::int as last_week
      from (
        select user_id, min(created_at) as first_at from (
          select user_id, created_at from opportunity_bookmarks
          union all select user_id, created_at from opportunity_applications) a
        group by user_id) f`),
    weekly("retained", sql`-- funnel:retained:weekly
      select
        count(*) filter (where first_ret >= now() - interval '7 days')::int as this_week,
        count(*) filter (where first_ret >= now() - interval '14 days'
                          and first_ret < now() - interval '7 days')::int as last_week
      from (
        select act.user_id, min(act.created_at) as first_ret
        from (${activity}) act
        join profiles p on p.user_id = act.user_id
        where act.created_at >= p.created_at + interval '7 days'
        group by act.user_id) r`),
    weekly("paying", sql`-- funnel:paying:weekly
      select
        count(*) filter (where pro_since >= now() - interval '7 days')::int as this_week,
        count(*) filter (where pro_since >= now() - interval '14 days'
                          and pro_since < now() - interval '7 days')::int as last_week
      from profiles where pro_since is not null`),
  ]);

  const conv = (num: number | null, den: number | null): number | null =>
    num === null || den === null || den === 0 ? null : num / den;

  const stages: AdminFunnelStage[] = [
    { key: "signup", label: "Signup", total: signupTotal, ...wSignup, convFromPrev: null },
    { key: "onboarded", label: "Onboarded", total: onboardedTotal, ...wOnboarded,
      convFromPrev: conv(onboardedTotal, signupTotal) },
    { key: "activated", label: "Activated", total: activatedTotal, ...wActivated,
      convFromPrev: conv(activatedTotal, onboardedTotal) },
    { key: "retained", label: "Retained", total: retainedTotal, ...wRetained,
      convFromPrev: conv(retainedTotal, activatedTotal) },
    { key: "paying", label: "Paying", total: payingTotal, ...wPaying,
      convFromPrev: conv(payingTotal, retainedTotal) },
  ];

  let referral: AdminFunnelResponse["referral"] = { invitersTotal: null, invitersThisWeek: null };
  try {
    const rows = this.extractRows<{ total?: number; this_week?: number }>(
      await db.execute(sql`-- funnel:referral
        select count(distinct referrer_id)::int as total,
               count(distinct referrer_id) filter (
                 where created_at >= now() - interval '7 days')::int as this_week
        from referrals`),
    );
    referral = {
      invitersTotal: Number(rows[0]?.total ?? 0),
      invitersThisWeek: Number(rows[0]?.this_week ?? 0),
    };
  } catch (error) {
    this.logger.error(`funnel referral failed: ${(error as Error).message}`);
  }

  return { generatedAt, stages, referral, cohorts: [] };
}
```

Note: the weekly-entrant closures use `Promise.all`; `newThisWeek`/`newLastWeek` spread onto each stage. The `marker` arg is unused at runtime (the marker lives inside the SQL) — keep it for readability or drop it; tests match on the SQL text, not the arg.

- [ ] **Step 5: Add the controller route**

In `admin/admin.controller.ts`, add `AdminFunnelResponse` to the `admin.dto` type imports and add:

```typescript
@Get("funnel")
async getFunnel(): Promise<AdminFunnelResponse> {
  return this.adminService.getFunnel();
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend/services/services/api && npx jest admin/admin.service.funnel.spec.ts`
Expected: PASS (both tests).

- [ ] **Step 7: Typecheck + lint the touched files**

Run: `cd backend/services/services/api && npx tsc --noEmit && npx eslint src/admin/admin.service.ts src/admin/admin.controller.ts src/admin/admin.dto.ts`
Expected: no errors. (Backend lint gate is `--max-warnings 0`.)

- [ ] **Step 8: Commit**

```bash
git add backend/services/services/api/src/admin/admin.dto.ts \
        backend/services/services/api/src/admin/admin.service.ts \
        backend/services/services/api/src/admin/admin.controller.ts \
        backend/services/services/api/src/admin/admin.service.funnel.spec.ts
git commit -m "feat(admin): funnel-stage aggregation endpoint GET /admin/funnel"
```

---

## Task 2: Backend — cohort retention (W1/W2/W4)

Extends `getFunnel` to populate `cohorts[]`: for each recent signup-week cohort, the % active in relative weeks 1, 2, 4. A `wNPct` is `null` when that window has not fully elapsed for the cohort (so young cohorts don't read as 0% retention).

**Files:**
- Modify: `backend/services/services/api/src/admin/admin.service.ts`
- Test: `backend/services/services/api/src/admin/admin.service.funnel.spec.ts`

**Interfaces:**
- Consumes: `AdminFunnelCohort` (Task 1), `activityUnionSql()` (Task 1).
- Produces: `AdminService.getFunnel()` now returns non-empty `cohorts` when data exists.

- [ ] **Step 1: Write the failing test**

Append to `admin.service.funnel.spec.ts`:

```typescript
describe("AdminService.getFunnel — cohorts", () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("returns per-cohort W1/W2/W4 percentages, null when window not elapsed", async () => {
    handlers().execute = (text: string) => {
      if (text.includes("-- funnel:cohorts")) {
        return {
          rows: [
            { cohort_week: "2026-W20", size: 50, w1_pct: 0.4, w2_pct: 0.3, w4_pct: 0.2 },
            { cohort_week: "2026-W29", size: 10, w1_pct: 0.5, w2_pct: null, w4_pct: null },
          ],
        };
      }
      if (text.includes(":total")) return { rows: [{ count: 0 }] };
      if (text.includes(":weekly")) return { rows: [{ this_week: 0, last_week: 0 }] };
      if (text.includes("referral")) return { rows: [{ total: 0, this_week: 0 }] };
      return { rows: [] };
    };

    const res = await buildService().getFunnel();
    expect(res.cohorts).toHaveLength(2);
    expect(res.cohorts[0]).toMatchObject({ cohortWeek: "2026-W20", size: 50, w1Pct: 0.4, w4Pct: 0.2 });
    expect(res.cohorts[1].w2Pct).toBeNull(); // window not yet elapsed
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/services/services/api && npx jest admin/admin.service.funnel.spec.ts -t cohorts`
Expected: FAIL — `cohorts` is `[]`.

- [ ] **Step 3: Implement `buildCohorts` and wire it in**

Add the private method to `admin.service.ts`. It computes, per signup-week cohort over the last 12 weeks, the fraction of the cohort with any activity in relative week 1/2/4. `NULLIF`/`CASE` yields `null` when the cohort is too young for that window (`now()` hasn't passed `signup + (index+1)*7 days`).

```typescript
private async buildCohorts(): Promise<AdminFunnelResponse["cohorts"]> {
  const activity = this.activityUnionSql();
  try {
    const rows = this.extractRows<{
      cohort_week: string; size: number;
      w1_pct: number | null; w2_pct: number | null; w4_pct: number | null;
    }>(
      await db.execute(sql`-- funnel:cohorts
        with cohort as (
          select user_id,
                 date_trunc('week', created_at) as wk,
                 created_at as signup_at
          from profiles
          where created_at >= now() - interval '12 weeks'
        ),
        acts as (
          select c.user_id, c.wk, c.signup_at,
                 floor(extract(epoch from (a.created_at - c.signup_at)) / 604800)::int as widx
          from cohort c
          join (${activity}) a on a.user_id = c.user_id
        ),
        per_user as (
          select c.user_id, c.wk, c.signup_at,
                 bool_or(a.widx = 1) as w1,
                 bool_or(a.widx = 2) as w2,
                 bool_or(a.widx = 4) as w4
          from cohort c
          left join acts a on a.user_id = c.user_id
          group by c.user_id, c.wk, c.signup_at
        )
        select to_char(wk, 'IYYY"-W"IW') as cohort_week,
               count(*)::int as size,
               case when now() >= min(signup_at) + interval '14 days'
                    then avg((w1)::int) end as w1_pct,
               case when now() >= min(signup_at) + interval '21 days'
                    then avg((w2)::int) end as w2_pct,
               case when now() >= min(signup_at) + interval '35 days'
                    then avg((w4)::int) end as w4_pct
        from per_user
        group by wk
        order by wk desc`),
    );
    return rows.map((r) => ({
      cohortWeek: r.cohort_week,
      size: Number(r.size),
      w1Pct: r.w1_pct === null ? null : Number(r.w1_pct),
      w2Pct: r.w2_pct === null ? null : Number(r.w2_pct),
      w4Pct: r.w4_pct === null ? null : Number(r.w4_pct),
    }));
  } catch (error) {
    this.logger.error(`funnel cohorts failed: ${(error as Error).message}`);
    return [];
  }
}
```

Then in `getFunnel`, replace the final return so cohorts run in parallel with the rest. Change the end of `getFunnel` from `return { generatedAt, stages, referral, cohorts: [] };` to:

```typescript
  const cohorts = await this.buildCohorts();
  return { generatedAt, stages, referral, cohorts };
```

(For minimal latency you may hoist `this.buildCohorts()` into the earlier `Promise.all`; sequential is fine for v1 and keeps the diff small.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend/services/services/api && npx jest admin/admin.service.funnel.spec.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Typecheck + lint**

Run: `cd backend/services/services/api && npx tsc --noEmit && npx eslint src/admin/admin.service.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/services/services/api/src/admin/admin.service.ts \
        backend/services/services/api/src/admin/admin.service.funnel.spec.ts
git commit -m "feat(admin): W1/W2/W4 cohort retention in GET /admin/funnel"
```

---

## Task 3: Backend — daily growth snapshot cron

A `@Cron` job that calls `AdminService.getFunnel()` once a day and upserts one row into the existing `analytics_snapshots` table (`snapshot_type='engagement'`, `timeframe='7d'`, `metrics` jsonb). Durability + a base for future time-series without waiting.

**Files:**
- Create: `backend/services/services/api/src/analytics/growth-snapshot.service.ts`
- Create: `backend/services/services/api/src/analytics/analytics.module.ts`
- Modify: `backend/services/services/api/src/app.module.ts`
- Test: `backend/services/services/api/src/analytics/growth-snapshot.service.spec.ts`

**Interfaces:**
- Consumes: `AdminService.getFunnel()` (Task 1/2).
- Produces: `GrowthSnapshotService.captureDailySnapshot(): Promise<void>` (the `@Cron` target; also callable directly in tests).

- [ ] **Step 1: Write the failing test**

Create `analytics/growth-snapshot.service.spec.ts`:

```typescript
import { Logger } from "@nestjs/common";

jest.mock("../db", () => {
  const executed: string[] = [];
  (globalThis as Record<string, any>).__snapSql = executed;
  const render = (query: any): string =>
    ((query?.queryChunks ?? []) as any[])
      .map((c) => (typeof c === "string" ? c : Array.isArray(c?.value) ? c.value.join("") : ""))
      .join("");
  return { db: { execute: async (q: any) => { executed.push(render(q)); return { rows: [] }; } } };
});

import { GrowthSnapshotService } from "./growth-snapshot.service";

const snapSql = (): string[] => (globalThis as Record<string, any>).__snapSql;

describe("GrowthSnapshotService", () => {
  beforeEach(() => {
    snapSql().length = 0;
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("writes one engagement snapshot row from the funnel payload", async () => {
    const adminService = {
      getFunnel: async () => ({
        generatedAt: "2026-07-22T00:00:00Z",
        stages: [{ key: "signup", label: "Signup", total: 100, newThisWeek: 20, newLastWeek: 15, convFromPrev: null }],
        referral: { invitersTotal: 8, invitersThisWeek: 2 },
        cohorts: [],
      }),
    } as any;

    await new GrowthSnapshotService(adminService).captureDailySnapshot();

    const inserts = snapSql().filter((t) => t.includes("analytics_snapshots"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toContain("engagement");
  });

  it("never throws even if getFunnel fails", async () => {
    const adminService = { getFunnel: async () => { throw new Error("db down"); } } as any;
    await expect(
      new GrowthSnapshotService(adminService).captureDailySnapshot(),
    ).resolves.toBeUndefined();
    expect(snapSql().filter((t) => t.includes("analytics_snapshots"))).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/services/services/api && npx jest analytics/growth-snapshot.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `analytics/growth-snapshot.service.ts`:

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { AdminService } from "../admin/admin.service";

/**
 * Once a day, snapshots the growth funnel into analytics_snapshots so the
 * admin funnel gains real day-over-day history without waiting for a pipeline.
 */
@Injectable()
export class GrowthSnapshotService {
  private readonly logger = new Logger(GrowthSnapshotService.name);

  constructor(private readonly adminService: AdminService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async captureDailySnapshot(): Promise<void> {
    try {
      const funnel = await this.adminService.getFunnel();
      const metrics = JSON.stringify({
        stages: funnel.stages,
        referral: funnel.referral,
        cohorts: funnel.cohorts,
      });
      await db.execute(sql`
        insert into analytics_snapshots (snapshot_type, timeframe, metrics, generated_at, notes)
        values ('engagement', '7d', ${metrics}::jsonb, now(), 'growth-snapshot cron')
      `);
      this.logger.log("growth snapshot written");
    } catch (error) {
      this.logger.error(`growth snapshot failed: ${(error as Error).message}`);
    }
  }
}
```

- [ ] **Step 4: Create the module and register it**

Create `analytics/analytics.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { GrowthSnapshotService } from "./growth-snapshot.service";

@Module({
  imports: [AdminModule],
  providers: [GrowthSnapshotService],
})
export class AnalyticsModule {}
```

In `app.module.ts`, import `AnalyticsModule` and add it to the `imports` array (near the other feature modules). `ScheduleModule.forRoot()` is already present, so no extra scheduler wiring is needed. `AdminModule` already `exports: [AdminService]`, so the injection resolves.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend/services/services/api && npx jest analytics/growth-snapshot.service.spec.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Typecheck + lint**

Run: `cd backend/services/services/api && npx tsc --noEmit && npx eslint src/analytics/growth-snapshot.service.ts src/analytics/analytics.module.ts src/app.module.ts`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/services/services/api/src/analytics/ backend/services/services/api/src/app.module.ts
git commit -m "feat(analytics): daily growth-snapshot cron into analytics_snapshots"
```

---

## Task 4: Frontend — growth API client

Typed client for the new endpoint, mirroring `admin/src/lib/monetizationApi.ts` (which uses `backendFetchJson`).

**Files:**
- Create: `admin/src/lib/growthApi.ts`

**Interfaces:**
- Consumes: backend `AdminFunnelResponse` shape (Task 1).
- Produces: `getFunnel(): Promise<AdminFunnelResponse>`, plus exported types `AdminFunnelResponse`, `AdminFunnelStage`, `AdminFunnelCohort` for `Growth.tsx`.

- [ ] **Step 1: Implement the client**

Create `admin/src/lib/growthApi.ts`:

```typescript
import { backendFetchJson } from "./backend";

export interface AdminFunnelStage {
  key: "signup" | "onboarded" | "activated" | "retained" | "paying";
  label: string;
  total: number | null;
  newThisWeek: number | null;
  newLastWeek: number | null;
  convFromPrev: number | null;
}

export interface AdminFunnelCohort {
  cohortWeek: string;
  size: number;
  w1Pct: number | null;
  w2Pct: number | null;
  w4Pct: number | null;
}

export interface AdminFunnelResponse {
  generatedAt: string;
  stages: AdminFunnelStage[];
  referral: { invitersTotal: number | null; invitersThisWeek: number | null };
  cohorts: AdminFunnelCohort[];
}

export function getFunnel(): Promise<AdminFunnelResponse> {
  return backendFetchJson<AdminFunnelResponse>("/admin/funnel");
}
```

- [ ] **Step 2: Typecheck**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add admin/src/lib/growthApi.ts
git commit -m "feat(admin-ui): growth funnel API client"
```

---

## Task 5: Frontend — Growth page (funnel bars + cohort heatmap)

New page rendering the funnel (bars with count, conversion-from-previous %, week trend, leakiest-stage highlight) and the cohort heatmap (rows = signup weeks, cols = W1/W2/W4, colour-scaled). Wired into the router and nav.

**Files:**
- Create: `admin/src/pages/Growth.tsx`
- Modify: `admin/src/App.tsx`

**Interfaces:**
- Consumes: `getFunnel`, `AdminFunnelResponse`, `AdminFunnelStage`, `AdminFunnelCohort` (Task 4).

- [ ] **Step 1: Implement the page**

Create `admin/src/pages/Growth.tsx`. Follow `Dashboard.tsx` conventions (Tailwind, lucide-react, `useEffect` fetch, loading/error states). Keep pure presentation.

```tsx
import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import {
  getFunnel,
  type AdminFunnelResponse,
  type AdminFunnelStage,
  type AdminFunnelCohort,
} from "../lib/growthApi";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const num = (v: number | null) => (v === null ? "—" : v.toLocaleString());

function Trend({ now, prev }: { now: number | null; prev: number | null }) {
  if (now === null || prev === null) return <Minus className="h-4 w-4 text-gray-400" />;
  if (now > prev) return <span className="flex items-center text-green-600 text-sm"><TrendingUp className="h-4 w-4 mr-1" />{now - prev > 0 ? `+${now - prev}` : now - prev}</span>;
  if (now < prev) return <span className="flex items-center text-red-600 text-sm"><TrendingDown className="h-4 w-4 mr-1" />{now - prev}</span>;
  return <span className="flex items-center text-gray-500 text-sm"><Minus className="h-4 w-4 mr-1" />0</span>;
}

/** Lowest non-null convFromPrev = the biggest leak; highlight it. */
function leakiestKey(stages: AdminFunnelStage[]): string | null {
  const withConv = stages.filter((s) => s.convFromPrev !== null);
  if (withConv.length === 0) return null;
  return withConv.reduce((a, b) => ((b.convFromPrev as number) < (a.convFromPrev as number) ? b : a)).key;
}

function heat(v: number | null): string {
  if (v === null) return "bg-gray-100 text-gray-400";
  if (v >= 0.4) return "bg-green-600 text-white";
  if (v >= 0.25) return "bg-green-400 text-white";
  if (v >= 0.15) return "bg-yellow-300 text-gray-900";
  if (v >= 0.05) return "bg-orange-300 text-gray-900";
  return "bg-red-300 text-gray-900";
}

export default function Growth() {
  const [data, setData] = useState<AdminFunnelResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    getFunnel()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, []);

  const leak = useMemo(() => (data ? leakiestKey(data.stages) : null), [data]);
  const maxTotal = useMemo(
    () => (data ? Math.max(1, ...data.stages.map((s) => s.total ?? 0)) : 1),
    [data],
  );

  if (loading) return <div className="p-6 text-gray-500">Loading growth…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return null;

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Growth</h1>
        <p className="text-sm text-gray-500">
          Funnel starts at Signup — pre-signup visits are not yet tracked. Some cross-namespace
          users may be undercounted at Activated/Retained.
        </p>
      </div>

      {/* Funnel */}
      <section className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Funnel (conversion vs previous stage)</h2>
        <div className="space-y-3">
          {data.stages.map((s) => (
            <div key={s.key} className={`rounded-lg border p-4 ${leak === s.key ? "border-red-400 bg-red-50" : "border-gray-100"}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{s.label}</span>
                  {leak === s.key && (
                    <span className="flex items-center text-xs text-red-600"><AlertTriangle className="h-3 w-3 mr-1" />biggest leak</span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">conv {pct(s.convFromPrev)}</span>
                  <span className="text-lg font-bold text-gray-900">{num(s.total)}</span>
                  <Trend now={s.newThisWeek} prev={s.newLastWeek} />
                </div>
              </div>
              <div className="h-2 rounded bg-gray-100">
                <div className="h-2 rounded bg-blue-500" style={{ width: `${((s.total ?? 0) / maxTotal) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-sm text-gray-500">
          Referrers: <span className="font-semibold text-gray-900">{num(data.referral.invitersTotal)}</span>
          {" "}(+{num(data.referral.invitersThisWeek)} this week)
        </div>
      </section>

      {/* Cohort retention */}
      <section className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Cohort retention (active in week after signup)</h2>
        {data.cohorts.length === 0 ? (
          <p className="text-sm text-gray-500">No cohort data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="py-2 pr-4">Cohort</th>
                  <th className="py-2 pr-4">Size</th>
                  <th className="py-2 pr-4">W1</th>
                  <th className="py-2 pr-4">W2</th>
                  <th className="py-2 pr-4">W4</th>
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((c: AdminFunnelCohort) => (
                  <tr key={c.cohortWeek} className="border-t border-gray-100">
                    <td className="py-2 pr-4 font-medium text-gray-900">{c.cohortWeek}</td>
                    <td className="py-2 pr-4 text-gray-600">{c.size}</td>
                    {[c.w1Pct, c.w2Pct, c.w4Pct].map((v, i) => (
                      <td key={i} className="py-2 pr-4">
                        <span className={`inline-block px-2 py-1 rounded ${heat(v)}`}>{pct(v)}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Wire route + nav in `App.tsx`**

Add the lazy import near the other page imports:

```tsx
const Growth = lazy(() => import("./pages/Growth"));
```

Add the route inside the authenticated `<Route path="/" element={<Layout />}>` block, next to `monetization`:

```tsx
<Route path="growth" element={<Growth />} />
```

Add a nav entry wherever the sidebar/nav items are defined in `App.tsx` (match the existing item shape used for "Monetization" — same `to`/`label`/`icon` pattern). Use the `TrendingUp` icon from lucide-react and label "Growth", path `/growth`. If nav items live in a separate array, add:

```tsx
{ to: "/growth", label: "Growth", icon: TrendingUp },
```

(Locate the existing nav array by searching `App.tsx` for the "Monetization" nav entry and mirror it exactly — including whatever access-gating wraps admin-only items.)

- [ ] **Step 3: Typecheck + lint + build**

Run: `cd admin && npx tsc --noEmit && npx eslint src/pages/Growth.tsx src/App.tsx && npm run build`
Expected: no errors; build succeeds. (Admin lint gate is `--max-warnings 0`.)

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/Growth.tsx admin/src/App.tsx
git commit -m "feat(admin-ui): Growth page — funnel bars + cohort retention heatmap"
```

---

## Self-Review Notes

- **Spec coverage:** Signup/Onboarded/Activated/Retained/Paying stages (Task 1) ✓; retention reconstruction via activity union (Task 1 `activityUnionSql`, Task 2 cohorts) ✓; forward daily snapshot into `analytics_snapshots` (Task 3) ✓; Growth admin page with funnel + heatmap + leak highlight (Task 5) ✓; referral parallel metric (Task 1) ✓; blind-spot label for pre-signup visits (Task 5 header copy) ✓; error/degrade-to-null handling (Global Constraints, Task 1 `safeCount`/`conv`) ✓.
- **Deferred (spec-approved):** visit tracking, client event pipeline, cohort revenue/LTV — no tasks, intentional.
- **Type consistency:** `AdminFunnelResponse`/`AdminFunnelStage`/`AdminFunnelCohort` defined identically in `admin.dto.ts` (Task 1) and `growthApi.ts` (Task 4); `getFunnel()` signature stable across Tasks 1–3; `convFromPrev`, `w1Pct/w2Pct/w4Pct`, `newThisWeek/newLastWeek` names used consistently in service, client, and page.
- **Known limitation carried into UI:** id-namespace undercount is surfaced in the page subheader and DTO doc-comment, not silently hidden.
