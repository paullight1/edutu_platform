# Mentor Platform — Phase 1: Foundation & Mentor Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Mentor" a real, production-ready role by unifying it with the existing Creator infrastructure — approved mentors unlock the dashboard, roadmap publishing, and marketplace listings; every user-facing "Creator" surface is rebranded to "Mentor"; the orphaned mobile apply route is wired up; and dashboards show real metrics (no fabricated numbers).

**Architecture:** One shared predicate `isApprovedMentor(profile)` (creator_status OR mentor_status = approved) replaces the inline creator-only gates in the backend, so `mentor_status` becomes load-bearing. Stats math is extracted into a pure `computeMentorStats()` function and exposed via the existing `GET /creator/dashboard` endpoint. The web app gains a net-new read-only Mentor Dashboard page (authoring stays in Phase 2). Mobile registers the apply route, gates its profile entry points on approval, and fixes the admin Clerk-sync bug. No table/column/route renames.

**Tech Stack:** NestJS + Drizzle ORM + Postgres (backend, jest); React 18 + Vite + React Router + Clerk + Tailwind theme tokens (web, vitest); Expo Router + React Native + Supabase JS (mobile, jest); i18next (web 6 locales, mobile ~9 locales).

## Global Constraints

- **No renames.** Internal identifiers stay `creator*` (`creator_applications`, `profiles.creator_status`, `/creator/dashboard`, `/creator-dashboard`, admin "Creator Applications"). Only user-visible strings become "Mentor." No `profiles.role` changes; no DB migration.
- **Unify by OR, never migrate.** Capability = `creator_status === 'approved' || mentor_status === 'approved'`. Existing approved creators must keep working.
- **Pricing is credits only** (85/15 split, `PLATFORM_FEE_PERCENT = 15`). No fiat, no payouts in this program.
- **No fabricated stats** anywhere in shipped UI. Every displayed number must come from real data or be removed/replaced with honest copy.
- **Lint gates are real** in all four packages (`--max-warnings 0`). Code must pass `lint` + `typecheck` + tests.
- **Node 20** across backend/web/mobile. Do not bump.
- **Never `git stash`** — this working tree is shared by concurrent sessions. Re-check shared files (`profile/index.tsx`, `_layout.tsx`, locale JSONs, `creator.service.ts`, `roadmaps.service.ts`, `App.tsx`, `PublicHeader.tsx`) for divergence before committing.
- **Mobile local jest** needs `-- --maxWorkers=2`.
- **id namespaces:** roadmaps are keyed by `toDatabaseUserId(userId)` (`roadmaps.createdBy`); marketplace/transactions/profiles in `creator.service.ts` are keyed by the raw `userId` as passed. Match each table the way its existing code already does.

---

## File Structure

**Backend** (`backend/services/services/api/`)
- Create: `src/common/mentor-access.ts` — `isApprovedMentor`, `deriveMentorStatus` (pure).
- Create: `src/common/mentor-access.spec.ts` — tests for the above.
- Create: `src/creator/mentor-stats.ts` — `computeMentorStats` (pure).
- Create: `src/creator/mentor-stats.spec.ts` — tests.
- Create: `src/creator/creator.service.spec.ts` — dashboard gate + stats wiring.
- Modify: `src/creator/creator.service.ts` — swap 2 gates; extend `getCreatorDashboard`.
- Modify: `src/roadmaps/roadmaps.service.ts` — swap 2 gates.
- Modify: `src/roadmaps/roadmaps.service.spec.ts` — add mentor-approved gate tests.

**Web** (`edutu-web-app/`)
- Create: `src/services/mentor.ts` — backend client (`getMentorDashboard`, `getMentorStatus`).
- Create: `src/test/__tests__/mentorService.test.ts` — service tests.
- Create: `src/components/MentorDashboardPage.tsx` — read-only dashboard.
- Modify: `src/App.tsx` — register `/mentor/dashboard`.
- Modify: `src/components/MentorPage.tsx` — de-fabricate stats + "Go to dashboard" for approved.
- Modify: `src/i18n/locales/{en,es,fr,de,zh,ar}.json` — mentor dashboard strings (en authoritative).

**Mobile** (`edutumobile/`)
- Modify: `app/(app)/_layout.tsx` — register `mentor-apply` Stack.Screen.
- Modify: `app/(app)/profile/index.tsx` — fetch approval status; rebrand + gate entry points.
- Create: `lib/creator-clerk-metadata.ts` — pure `clerkStatusMetadata(kind, status)`.
- Create: `__tests__/creatorClerkMetadata.test.ts` — tests.
- Modify: `app/admin/creator-applications.tsx` — use `clerkStatusMetadata` (mentor-aware sync).
- Modify: `app/(app)/mentor-apply.tsx` — de-fabricate intro stats.
- Modify: `lib/i18n/locales/en/*.json` — rebrand strings (creatorStudio, becomeCreator, mentorApply intro labels).

---

## BACKEND

### Task 1: `isApprovedMentor` / `deriveMentorStatus` predicates

**Files:**
- Create: `backend/services/services/api/src/common/mentor-access.ts`
- Test: `backend/services/services/api/src/common/mentor-access.spec.ts`

**Interfaces:**
- Produces: `isApprovedMentor(profile?: MentorAccessProfile | null): boolean`; `deriveMentorStatus(profile?: MentorAccessProfile | null): MentorStatus` where `MentorStatus = "approved" | "pending" | "rejected" | "none"`; `interface MentorAccessProfile { creatorStatus?: string | null; mentorStatus?: string | null }`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/common/mentor-access.spec.ts
import { isApprovedMentor, deriveMentorStatus } from "./mentor-access";

describe("isApprovedMentor", () => {
  it("is true when creator_status is approved", () => {
    expect(isApprovedMentor({ creatorStatus: "approved" })).toBe(true);
  });
  it("is true when mentor_status is approved", () => {
    expect(isApprovedMentor({ mentorStatus: "approved" })).toBe(true);
  });
  it("is false when neither is approved", () => {
    expect(isApprovedMentor({ creatorStatus: "pending", mentorStatus: "none" })).toBe(false);
  });
  it("is false for null/undefined", () => {
    expect(isApprovedMentor(null)).toBe(false);
    expect(isApprovedMentor(undefined)).toBe(false);
  });
});

describe("deriveMentorStatus", () => {
  it("returns approved when either status is approved", () => {
    expect(deriveMentorStatus({ mentorStatus: "approved" })).toBe("approved");
  });
  it("returns pending when a status is pending and none approved", () => {
    expect(deriveMentorStatus({ creatorStatus: "pending" })).toBe("pending");
  });
  it("returns rejected when a status is rejected and none pending/approved", () => {
    expect(deriveMentorStatus({ mentorStatus: "rejected" })).toBe("rejected");
  });
  it("returns none by default", () => {
    expect(deriveMentorStatus({})).toBe("none");
    expect(deriveMentorStatus(null)).toBe("none");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/services/services/api && npx jest src/common/mentor-access.spec.ts`
Expected: FAIL — `Cannot find module './mentor-access'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/common/mentor-access.ts
export interface MentorAccessProfile {
  creatorStatus?: string | null;
  mentorStatus?: string | null;
}

export type MentorStatus = "approved" | "pending" | "rejected" | "none";

/**
 * Unified capability gate. An approved creator OR an approved mentor is an
 * approved mentor — mentor_status is load-bearing alongside creator_status.
 */
export function isApprovedMentor(
  profile?: MentorAccessProfile | null,
): boolean {
  return (
    profile?.creatorStatus === "approved" ||
    profile?.mentorStatus === "approved"
  );
}

/** Coarse status for banners/UI, preferring the most-unlocked state. */
export function deriveMentorStatus(
  profile?: MentorAccessProfile | null,
): MentorStatus {
  if (isApprovedMentor(profile)) return "approved";
  const statuses = [profile?.mentorStatus, profile?.creatorStatus];
  if (statuses.includes("pending")) return "pending";
  if (statuses.includes("rejected")) return "rejected";
  return "none";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend/services/services/api && npx jest src/common/mentor-access.spec.ts`
Expected: PASS (2 suites, 8 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/services/api/src/common/mentor-access.ts backend/services/services/api/src/common/mentor-access.spec.ts
git commit -m "feat(mentor): unified isApprovedMentor/deriveMentorStatus predicates"
```

---

### Task 2: `computeMentorStats` pure stats function

**Files:**
- Create: `backend/services/services/api/src/creator/mentor-stats.ts`
- Test: `backend/services/services/api/src/creator/mentor-stats.spec.ts`

**Interfaces:**
- Consumes: `MentorStatus` (conceptually — passed as the `mentorStatus` string).
- Produces: `computeMentorStats(input: MentorStatsInput): MentorStats` with the two interfaces below.

- [ ] **Step 1: Write the failing test**

```typescript
// src/creator/mentor-stats.spec.ts
import { computeMentorStats } from "./mentor-stats";

const base = {
  publishedRoadmaps: 0, activeListings: 0,
  roadmapEnrollments: 0, listingEnrollments: 0,
  totalCreditsEarned: 0, walletBalance: 0,
  ratingSum: 0, ratingCount: 0, mentorStatus: "approved" as const,
};

describe("computeMentorStats", () => {
  it("sums published content and learners across roadmaps + listings", () => {
    const s = computeMentorStats({ ...base, publishedRoadmaps: 3, activeListings: 2, roadmapEnrollments: 40, listingEnrollments: 10 });
    expect(s.publishedContent).toBe(5);
    expect(s.learnersReached).toBe(50);
  });
  it("computes a weighted average rating rounded to 1dp", () => {
    // two roadmaps: (4.0 x 3) + (5.0 x 1) = 17 over 4 ratings = 4.25 -> 4.3
    const s = computeMentorStats({ ...base, ratingSum: 17, ratingCount: 4 });
    expect(s.avgRating).toBe(4.3);
    expect(s.ratingCount).toBe(4);
  });
  it("returns null avgRating when there are no ratings", () => {
    expect(computeMentorStats(base).avgRating).toBeNull();
  });
  it("passes through earnings, wallet and status", () => {
    const s = computeMentorStats({ ...base, totalCreditsEarned: 1200, walletBalance: 340, mentorStatus: "pending" });
    expect(s.creditsEarned).toBe(1200);
    expect(s.walletBalance).toBe(340);
    expect(s.mentorStatus).toBe("pending");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/services/services/api && npx jest src/creator/mentor-stats.spec.ts`
Expected: FAIL — `Cannot find module './mentor-stats'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/creator/mentor-stats.ts
export interface MentorStatsInput {
  publishedRoadmaps: number;
  activeListings: number;
  roadmapEnrollments: number;
  listingEnrollments: number;
  totalCreditsEarned: number;
  walletBalance: number;
  ratingSum: number; // Σ(ratingAvg × ratingCount) across the mentor's roadmaps
  ratingCount: number; // Σ ratingCount
  mentorStatus: "approved" | "pending" | "rejected" | "none";
}

export interface MentorStats {
  publishedContent: number;
  learnersReached: number;
  creditsEarned: number;
  walletBalance: number;
  avgRating: number | null;
  ratingCount: number;
  mentorStatus: string;
}

export function computeMentorStats(input: MentorStatsInput): MentorStats {
  return {
    publishedContent: input.publishedRoadmaps + input.activeListings,
    learnersReached: input.roadmapEnrollments + input.listingEnrollments,
    creditsEarned: input.totalCreditsEarned,
    walletBalance: input.walletBalance,
    avgRating:
      input.ratingCount > 0
        ? Math.round((input.ratingSum / input.ratingCount) * 10) / 10
        : null,
    ratingCount: input.ratingCount,
    mentorStatus: input.mentorStatus,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend/services/services/api && npx jest src/creator/mentor-stats.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/services/services/api/src/creator/mentor-stats.ts backend/services/services/api/src/creator/mentor-stats.spec.ts
git commit -m "feat(mentor): pure computeMentorStats aggregation"
```

---

### Task 3: Swap roadmap publish/create gates to `isApprovedMentor`

**Files:**
- Modify: `backend/services/services/api/src/roadmaps/roadmaps.service.ts:279` (`createByCreator`), `:368` (`setMineVisibility`)
- Test: `backend/services/services/api/src/roadmaps/roadmaps.service.spec.ts`

**Interfaces:**
- Consumes: `isApprovedMentor` from `../common/mentor-access`.

- [ ] **Step 1: Add the failing test** (append to `roadmaps.service.spec.ts`)

```typescript
  it("lets an approved mentor (mentor_status only) publish a personal roadmap", async () => {
    // requireOwnedRoadmap → first select returns the owned roadmap
    const ownedWhere = jest.fn().mockResolvedValue([
      { id: "r1", createdBy: "u1", status: "personal" },
    ]);
    // profile lookup → mentor-only approval
    const profileWhere = jest.fn().mockResolvedValue([
      { creatorStatus: "none", mentorStatus: "approved", role: "user" },
    ]);
    const from = jest
      .fn()
      .mockReturnValueOnce({ where: ownedWhere })
      .mockReturnValueOnce({ where: profileWhere });
    mockedDb.select.mockReturnValue({ from });

    const returning = jest.fn().mockResolvedValue([{ id: "r1", status: "published" }]);
    const updWhere = jest.fn().mockReturnValue({ returning });
    const set = jest.fn().mockReturnValue({ where: updWhere });
    mockedDb.update.mockReturnValue({ set });
    jest.spyOn(service as any, "invalidateRoadmapCache").mockResolvedValue(undefined);

    await expect(service.setMineVisibility("u1", "r1", true)).resolves.toBeDefined();
    expect(mockedDb.update).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/services/services/api && npx jest src/roadmaps/roadmaps.service.spec.ts -t "approved mentor"`
Expected: FAIL — throws `ForbiddenException("Only approved creators can publish roadmaps.")` because the gate only checks `creatorStatus`.

- [ ] **Step 3: Apply the gate swap**

Add the import near the other `../common` imports (line 45 area):

```typescript
import { matchProfileUserId, toDatabaseUserId } from "../common/user-id";
import { isApprovedMentor } from "../common/mentor-access";
```

In `createByCreator` replace line 279:

```typescript
    const isApprovedCreator = isApprovedMentor(profile);
```

In `setMineVisibility` replace line 368:

```typescript
      const isApprovedCreator = isApprovedMentor(profile);
```

(Leave the `isAdmin` role fallback and the `ForbiddenException` messages unchanged.)

- [ ] **Step 4: Run tests to verify pass**

Run: `cd backend/services/services/api && npx jest src/roadmaps/roadmaps.service.spec.ts`
Expected: PASS (existing suite + the new test).

- [ ] **Step 5: Commit**

```bash
git add backend/services/services/api/src/roadmaps/roadmaps.service.ts backend/services/services/api/src/roadmaps/roadmaps.service.spec.ts
git commit -m "feat(mentor): approved mentors can create/publish roadmaps"
```

---

### Task 4: Mentor-aware dashboard gate + real stats

**Files:**
- Modify: `backend/services/services/api/src/creator/creator.service.ts` (imports; `getCreatorDashboard` at `:295-344`; `createListing` gate at `:354`)
- Test: `backend/services/services/api/src/creator/creator.service.spec.ts` (new)

**Interfaces:**
- Consumes: `isApprovedMentor`, `deriveMentorStatus` from `../common/mentor-access`; `computeMentorStats` from `./mentor-stats`; `toDatabaseUserId` from `../common/user-id`; `roadmaps` from `../db/schema`.
- Produces: `getCreatorDashboard` return now includes `stats: MentorStats` and a bug-fixed `totalEarnings` (true SUM, not last-20).

- [ ] **Step 1: Write the failing test** (new `creator.service.spec.ts`)

```typescript
import { db } from "../db";
import { CreatorService } from "./creator.service";

jest.mock("../db", () => ({ db: { select: jest.fn() } }));
jest.mock("../notifications/notifications.service", () => ({
  NotificationsService: class {},
}));

const mockedDb = db as unknown as { select: jest.Mock };

describe("CreatorService.getCreatorDashboard", () => {
  let service: CreatorService;
  beforeEach(() => {
    jest.resetAllMocks();
    service = new CreatorService({ broadcast: jest.fn() } as any);
  });

  const wireSelects = (rows: any[][]) => {
    // Each db.select() call returns a chain resolving to the next rows array.
    let call = 0;
    mockedDb.select.mockImplementation(() => {
      const result = rows[call++] ?? [];
      const chain: any = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => Promise.resolve(result),
        then: (r: any) => Promise.resolve(result).then(r),
      };
      return chain;
    });
  };

  it("throws Forbidden when neither creator nor mentor is approved", async () => {
    wireSelects([[{ creatorStatus: "none", mentorStatus: "none" }]]);
    await expect(service.getCreatorDashboard("u1")).rejects.toThrow(
      "Creator access not granted.",
    );
  });

  it("returns stats for an approved mentor", async () => {
    wireSelects([
      [{ creatorStatus: "none", mentorStatus: "approved" }], // profile
      [ // listings
        { status: "active", enrollmentCount: 10 },
        { status: "pending", enrollmentCount: 0 },
      ],
      [{ total: 900 }], // earnings SUM
      [{ amount: 500 }], // recent earnings (limit 20)
      [ // roadmaps
        { status: "published", enrollmentCount: 30, ratingAvg: "4.5", ratingCount: 2 },
        { status: "personal", enrollmentCount: 5, ratingAvg: "0", ratingCount: 0 },
      ],
    ]);
    const result = await service.getCreatorDashboard("u1");
    expect(result.stats.publishedContent).toBe(2); // 1 published roadmap + 1 active listing
    expect(result.stats.learnersReached).toBe(40); // 30 roadmap + 10 listing
    expect(result.stats.creditsEarned).toBe(900); // true SUM
    expect(result.stats.avgRating).toBe(4.5);
    expect(result.stats.mentorStatus).toBe("approved");
  });
});
```

> NOTE: adjust the `wireSelects` chain order to match the exact query order after you edit `getCreatorDashboard` in Step 3. The order asserted here is: profile → listings → earnings-sum → recent-earnings → roadmaps.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend/services/services/api && npx jest src/creator/creator.service.spec.ts`
Expected: FAIL — `stats` is undefined and `getCreatorDashboard` rejects/throws differently (gate still creator-only).

- [ ] **Step 3: Edit `creator.service.ts`**

Add imports (top of file):

```typescript
import { roadmaps } from "../db/schema";
import { toDatabaseUserId } from "../common/user-id";
import { isApprovedMentor, deriveMentorStatus } from "../common/mentor-access";
import { computeMentorStats } from "./mentor-stats";
```

Replace the `createListing` gate at line 354:

```typescript
    if (!profile || !isApprovedMentor(profile)) {
      throw new ForbiddenException("Only approved creators can list items.");
    }
```

Replace `getCreatorDashboard` (lines 295-344) with:

```typescript
  async getCreatorDashboard(userId: string) {
    // Guard: approved creators OR approved mentors
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .execute();
    if (!isApprovedMentor(profile)) {
      throw new ForbiddenException("Creator access not granted.");
    }

    const myListings = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.sellerId, userId))
      .orderBy(desc(marketplaceListings.createdAt))
      .execute();

    const totalEnrollments = myListings.reduce(
      (sum, l) => sum + (l.enrollmentCount || 0),
      0,
    );
    const activeListings = myListings.filter(
      (l) => l.status === "active",
    ).length;

    // True lifetime earnings (the old code summed only the last 20 rows).
    const [earningsTotalRow] = await db
      .select({
        total: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "creator_earning"),
        ),
      )
      .execute();
    const totalEarnings = Number(earningsTotalRow?.total ?? 0);

    const recentEarnings = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "creator_earning"),
        ),
      )
      .orderBy(desc(transactions.createdAt))
      .limit(20)
      .execute();

    // Roadmap aggregates — roadmaps are keyed by the derived uuid.
    const dbUserId = toDatabaseUserId(userId);
    const myRoadmaps = await db
      .select()
      .from(roadmaps)
      .where(eq(roadmaps.createdBy, dbUserId))
      .execute();

    const publishedRoadmaps = myRoadmaps.filter(
      (r) => r.status === "published",
    ).length;
    const roadmapEnrollments = myRoadmaps.reduce(
      (s, r) => s + (r.enrollmentCount ?? 0),
      0,
    );
    const ratingCount = myRoadmaps.reduce(
      (s, r) => s + (r.ratingCount ?? 0),
      0,
    );
    const ratingSum = myRoadmaps.reduce(
      (s, r) => s + Number(r.ratingAvg ?? 0) * (r.ratingCount ?? 0),
      0,
    );

    const stats = computeMentorStats({
      publishedRoadmaps,
      activeListings,
      roadmapEnrollments,
      listingEnrollments: totalEnrollments,
      totalCreditsEarned: totalEarnings,
      walletBalance: profile?.creditsBalance ?? 0,
      ratingSum,
      ratingCount,
      mentorStatus: deriveMentorStatus(profile),
    });

    return {
      listings: myListings,
      totalListings: myListings.length,
      totalEnrollments,
      totalEarnings,
      recentEarnings,
      platformFeePercent: PLATFORM_FEE_PERCENT,
      creatorCutPercent: 100 - PLATFORM_FEE_PERCENT,
      stats,
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend/services/services/api && npx jest src/creator/creator.service.spec.ts`
Expected: PASS (2 tests). If the chain order assertion fails, align `wireSelects` order with the final query order.

- [ ] **Step 5: Verify the whole backend still compiles + lints + boots**

Run:
```bash
cd backend/services/services/api && npx jest src/creator src/common src/roadmaps && npm run lint && npm run build && node dist/main
```
Expected: jest PASS; lint 0 warnings; build succeeds; `node dist/main` reaches "Nest application successfully started" (Ctrl-C after). If boot fails, check DI/imports.

- [ ] **Step 6: Commit**

```bash
git add backend/services/services/api/src/creator/creator.service.ts backend/services/services/api/src/creator/creator.service.spec.ts
git commit -m "feat(mentor): dashboard gate accepts mentors + returns real stats (fixes earnings-total bug)"
```

---

## WEB

### Task 5: Web mentor backend client (`services/mentor.ts`)

**Files:**
- Create: `edutu-web-app/src/services/mentor.ts`
- Test: `edutu-web-app/src/test/__tests__/mentorService.test.ts`

**Interfaces:**
- Consumes: `getApiBaseUrl` from `../lib/apiBaseUrl` (throws if `VITE_BACKEND_URL`/`VITE_API_URL` unset).
- Produces: `getMentorDashboard(token: string): Promise<MentorDashboard>`; `getMentorStatus(token: string): Promise<MentorApplicationStatus | null>`; exported types `MentorStats`, `MentorListing`, `MentorDashboard`, `MentorApplicationStatus`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/__tests__/mentorService.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMentorDashboard } from "../../services/mentor";

vi.mock("../../lib/apiBaseUrl", () => ({
  getApiBaseUrl: () => "https://api.example.com",
}));

describe("getMentorDashboard", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls /creator/dashboard with a bearer token and returns json", async () => {
    const payload = { listings: [], totalListings: 0, stats: { publishedContent: 2 } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getMentorDashboard("tok-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/creator/dashboard",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok-1" }),
      }),
    );
    expect(result.stats.publishedContent).toBe(2);
  });

  it("throws the server message on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ message: "Creator access not granted." }),
    }));
    await expect(getMentorDashboard("tok-1")).rejects.toThrow("Creator access not granted.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd edutu-web-app && npx vitest run src/test/__tests__/mentorService.test.ts`
Expected: FAIL — `Cannot find module '../../services/mentor'`.

- [ ] **Step 3: Write the service** (mirrors `src/services/developer.ts:74-103`)

```typescript
// src/services/mentor.ts
import { getApiBaseUrl } from "../lib/apiBaseUrl";

export interface MentorStats {
  publishedContent: number;
  learnersReached: number;
  creditsEarned: number;
  walletBalance: number;
  avgRating: number | null;
  ratingCount: number;
  mentorStatus: string;
}

export interface MentorListing {
  id: string;
  title: string;
  category: string;
  status: string;
  price: number;
  enrollmentCount: number;
}

export interface MentorDashboard {
  listings: MentorListing[];
  totalListings: number;
  totalEnrollments: number;
  totalEarnings: number;
  platformFeePercent: number;
  creatorCutPercent: number;
  stats: MentorStats;
}

export interface MentorApplicationStatus {
  status: string | null;
  application_kind?: string | null;
}

async function requestMentor<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const apiBaseUrl = getApiBaseUrl("Mentor API");
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      data?.message || data?.error?.message || "Mentor request failed",
    );
  }
  return data as T;
}

export function getMentorDashboard(token: string) {
  return requestMentor<MentorDashboard>("/creator/dashboard", token);
}

export function getMentorStatus(token: string) {
  return requestMentor<MentorApplicationStatus | null>(
    "/creator/status",
    token,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd edutu-web-app && npx vitest run src/test/__tests__/mentorService.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add edutu-web-app/src/services/mentor.ts edutu-web-app/src/test/__tests__/mentorService.test.ts
git commit -m "feat(mentor-web): backend client for mentor dashboard + status"
```

---

### Task 6: Web Mentor Dashboard page + route

**Files:**
- Create: `edutu-web-app/src/components/MentorDashboardPage.tsx`
- Modify: `edutu-web-app/src/App.tsx` (lazy import near `:62`; route near the other protected routes)

**Interfaces:**
- Consumes: `getMentorDashboard`, `getMentorStatus`, types from `../services/mentor`; `useAuth` (Clerk `getToken`); `ProtectedRoute` (already in `App.tsx:279`); `PublicEditorialShell` (the chrome `DeveloperDashboardPage` uses).

**Verified web conventions (from recon — apply these exactly):**
- Wrap **all** returned JSX in `<PublicEditorialShell>…</PublicEditorialShell>` (the full-bleed dashboard chrome; `DeveloperDashboardPage.tsx` is the reference). Add `import PublicEditorialShell from "./PublicEditorialShell";`.
- Confirmed tokens: surfaces `bg-surface-elevated` / `bg-surface-body`; text `text-text-primary` / `text-text-secondary` / `text-text-muted`; borders `border-subtle` / `divide-subtle`; brand `text-brand` / `bg-brand`; error `border-danger/30 bg-danger/10 text-danger`. Never `text-primary`.
- The load pattern (`isLoaded`/`isSignedIn`/`getToken` from `@clerk/clerk-react`, `useCallback` loader, `void load()` in effect) mirrors `DeveloperDashboardPage.tsx:149-197`.

- [ ] **Step 1: Write the page** (the code below is the logic skeleton — wrap its returns in `PublicEditorialShell` per the note above)

```tsx
// src/components/MentorDashboardPage.tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useTranslation } from "react-i18next";
import {
  getMentorDashboard,
  getMentorStatus,
  type MentorDashboard,
} from "../services/mentor";

type Load = "loading" | "ready" | "unapproved" | "error";

export default function MentorDashboardPage() {
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [state, setState] = useState<Load>("loading");
  const [data, setData] = useState<MentorDashboard | null>(null);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const token = await getToken();
      if (!token) throw new Error("Unable to read your session.");
      try {
        const dashboard = await getMentorDashboard(token);
        setData(dashboard);
        setState("ready");
      } catch {
        // Not approved yet (403) — fall back to showing the application status.
        const status = await getMentorStatus(token).catch(() => null);
        setStatusLabel(status?.status ?? "none");
        setState("unapproved");
      }
    } catch {
      setState("error");
    }
  }, [getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-text-secondary">
        {t("mentorDashboard.loading", { defaultValue: "Loading your Mentor Studio…" })}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <p className="text-text-secondary">
          {t("mentorDashboard.error", { defaultValue: "We couldn't load your dashboard." })}
        </p>
        <button onClick={() => void load()} className="mt-4 rounded-lg bg-brand px-4 py-2 text-white">
          {t("common.retry", { defaultValue: "Retry" })}
        </button>
      </div>
    );
  }

  if (state === "unapproved") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-text-primary">
          {t("mentorDashboard.title", { defaultValue: "Mentor Studio" })}
        </h1>
        <p className="mt-3 text-text-secondary">
          {statusLabel === "pending"
            ? t("mentorDashboard.pending", { defaultValue: "Your mentor application is under review. We'll notify you once it's approved." })
            : t("mentorDashboard.notMentor", { defaultValue: "Become an approved mentor to publish roadmaps and resources." })}
        </p>
        <button onClick={() => navigate("/mentor")} className="mt-6 rounded-lg bg-brand px-5 py-2.5 text-white">
          {t("mentorDashboard.applyCta", { defaultValue: "Become a Mentor" })}
        </button>
      </div>
    );
  }

  const s = data!.stats;
  const cards = [
    { label: t("mentorDashboard.stats.published", { defaultValue: "Published content" }), value: s.publishedContent },
    { label: t("mentorDashboard.stats.learners", { defaultValue: "Learners reached" }), value: s.learnersReached },
    { label: t("mentorDashboard.stats.earned", { defaultValue: "Credits earned" }), value: s.creditsEarned },
    { label: t("mentorDashboard.stats.rating", { defaultValue: "Avg rating" }), value: s.avgRating ?? "—" },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">
          {t("mentorDashboard.title", { defaultValue: "Mentor Studio" })}
        </h1>
        <p className="text-text-secondary">
          {t("mentorDashboard.subtitle", { defaultValue: "Your impact and published content." })}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-subtle bg-surface-elevated p-4">
            <div className="text-2xl font-bold text-text-primary">{c.value}</div>
            <div className="mt-1 text-xs text-text-secondary">{c.label}</div>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">
          {t("mentorDashboard.listingsTitle", { defaultValue: "Your listings" })}
        </h2>
        {data!.listings.length === 0 ? (
          <p className="text-text-secondary">
            {t("mentorDashboard.noListings", { defaultValue: "You haven't published anything yet." })}
          </p>
        ) : (
          <ul className="divide-y divide-subtle rounded-xl border border-subtle">
            {data!.listings.map((l) => (
              <li key={l.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium text-text-primary">{l.title}</div>
                  <div className="text-xs capitalize text-text-secondary">{l.category} · {l.status}</div>
                </div>
                <div className="text-sm text-text-secondary">{l.enrollmentCount} enrolled</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Register the route in `App.tsx`**

Add a lazy import near the other lazy imports (`App.tsx:62` area):

```tsx
const MentorDashboardPage = lazy(() => import("./components/MentorDashboardPage"));
```

Add the route wrapped in `ProtectedRoute`. Place it near the other protected dashboards (e.g. by the `/dashboard/developer` route ~`App.tsx:593`) and **before the `*` catch-all at `App.tsx:793`** (`<Route path="*" element={<Navigate to="/dashboard" replace />} />`) — a route after the catch-all never matches. `/mentor` (public `MentorPage`) is a different path, so there's no collision:

```tsx
      <Route
        path="/mentor/dashboard"
        element={
          <ProtectedRoute>
            <MentorDashboardPage />
          </ProtectedRoute>
        }
      />
```

- [ ] **Step 3: Verify typecheck + build**

Run: `cd edutu-web-app && npm run typecheck && npm run build`
Expected: no type errors; build succeeds. (`npm run build` regenerates `public/sitemap.xml` — do not commit an unintended sitemap change.)

- [ ] **Step 4: Manually verify the route resolves**

Run: `cd edutu-web-app && npm run dev` then visit `/mentor/dashboard` while signed in.
Expected: signed-in + unapproved → "Become a Mentor" state; approved → stat cards render.

- [ ] **Step 5: Commit**

```bash
git add edutu-web-app/src/components/MentorDashboardPage.tsx edutu-web-app/src/App.tsx
git commit -m "feat(mentor-web): read-only Mentor Studio dashboard at /mentor/dashboard"
```

---

### Task 7: De-fabricate MentorPage stats + link approved mentors to the dashboard

**Files:**
- Modify: `edutu-web-app/src/components/MentorPage.tsx` (hardcoded stat blocks at `:400-403`, `:608-610`, `:634`)
- Modify: `edutu-web-app/src/i18n/locales/en.json` (+ other 5 locales as fallback keys)

**Interfaces:**
- Consumes: `useAuth` (already imported for `userId`), `getMentorStatus` from `../services/mentor`.

- [ ] **Step 1: Replace fabricated funding/mentor/learner numbers with honest program facts.**

In the landing stats bar (`:400-403`) and the intro step (`:608-610`), remove invented totals (`$1,070,304`, `20+`, `8,400+`, `31+`, `10K+`, `500+`) and keep only defensible facts. Replace the three intro stat cards with:

```tsx
              {[
                { value: "85%", label: t("mentor.stats.revenueShare", { defaultValue: "You keep 85%" }) },
                { value: t("mentor.stats.freeValue", { defaultValue: "Free" }), label: t("mentor.stats.freeLabel", { defaultValue: "No cost to apply" }) },
                { value: t("mentor.stats.reviewValue", { defaultValue: "2–3 days" }), label: t("mentor.stats.reviewLabel", { defaultValue: "Application review" }) },
              ].map((s) => (
                // ...existing stat-card markup, using s.value / s.label...
              ))}
```

For the landing bar and the "31+ countries" callout, delete the fabricated figures (or replace with the same three honest facts). Do not invent a stats endpoint here — that is Phase 3.

- [ ] **Step 2: Add a "Go to Mentor Studio" affordance for approved mentors.**

Near the top of `MentorPage`, after the existing sign-in/prefill effects, add:

```tsx
  const [isApprovedMentor, setIsApprovedMentor] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      if (!isSignedIn) return;
      try {
        const token = await getToken();
        if (!token) return;
        const status = await getMentorStatus(token);
        if (active) setIsApprovedMentor(status?.status === "approved");
      } catch {
        /* non-fatal */
      }
    })();
    return () => { active = false; };
  }, [isSignedIn, getToken]);
```

And in the landing hero, when `isApprovedMentor`, render a button that routes to `/mentor/dashboard`:

```tsx
  {isApprovedMentor && (
    <button onClick={() => navigate("/mentor/dashboard")} className="rounded-lg bg-brand px-5 py-2.5 text-white">
      {t("mentor.goToDashboard", { defaultValue: "Go to Mentor Studio" })}
    </button>
  )}
```

(`getMentorStatus` and `navigate`/`useNavigate` must be imported; `getToken`/`isSignedIn` come from the already-imported Clerk `useAuth`.)

- [ ] **Step 3: Add the en.json strings** under a `mentor` / `mentorDashboard` namespace (values shown above as `defaultValue` — add real keys so the 6 locales stay consistent; other locales inherit via i18next fallback to `en` until translated).

- [ ] **Step 4: Verify**

Run: `cd edutu-web-app && npm run typecheck && npm run lint && npx vitest run`
Expected: types clean, 0 lint warnings, existing tests green.

- [ ] **Step 5: Commit**

```bash
git add edutu-web-app/src/components/MentorPage.tsx edutu-web-app/src/i18n/locales/en.json
git commit -m "feat(mentor-web): remove fabricated stats; approved mentors get a dashboard link"
```

---

## MOBILE

### Task 8: Register the orphaned `mentor-apply` route

**Files:**
- Modify: `edutumobile/app/(app)/_layout.tsx` (Stack list; `creator-apply` at `:1431`)

- [ ] **Step 1: Add the Stack.Screen** immediately after the `creator-apply` screen (line 1431):

```tsx
                    <Stack.Screen name="mentor-apply" />
```

- [ ] **Step 2: Verify typecheck**

Run: `cd edutumobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "edutumobile/app/(app)/_layout.tsx"
git commit -m "fix(mentor-mobile): register mentor-apply in the navigation stack"
```

---

### Task 9: Mentor-aware admin Clerk-sync (pure helper + wiring)

**Files:**
- Create: `edutumobile/lib/creator-clerk-metadata.ts`
- Test: `edutumobile/__tests__/creatorClerkMetadata.test.ts`
- Modify: `edutumobile/app/admin/creator-applications.tsx` (`:179`, `:230`)

**Interfaces:**
- Produces: `clerkStatusMetadata(kind: string | null | undefined, status: "approved" | "rejected"): Record<string, string>` — returns `{ mentorStatus }` for mentor kind, else `{ creatorStatus }`.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/creatorClerkMetadata.test.ts
import { clerkStatusMetadata } from "../lib/creator-clerk-metadata";

describe("clerkStatusMetadata", () => {
  it("syncs mentorStatus for a mentor application", () => {
    expect(clerkStatusMetadata("mentor", "approved")).toEqual({ mentorStatus: "approved" });
  });
  it("syncs creatorStatus for a creator application", () => {
    expect(clerkStatusMetadata("creator", "approved")).toEqual({ creatorStatus: "approved" });
  });
  it("defaults to creatorStatus when kind is null", () => {
    expect(clerkStatusMetadata(null, "rejected")).toEqual({ creatorStatus: "rejected" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd edutumobile && npm test -- --maxWorkers=2 creatorClerkMetadata`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

```typescript
// lib/creator-clerk-metadata.ts
export function clerkStatusMetadata(
  kind: string | null | undefined,
  status: "approved" | "rejected",
): Record<string, string> {
  return kind === "mentor"
    ? { mentorStatus: status }
    : { creatorStatus: status };
}
```

- [ ] **Step 4: Wire it into the admin screen.** In `app/admin/creator-applications.tsx`, import the helper and replace the two hardcoded `metadata: { creatorStatus: 'approved' }` objects (lines 179 and 230) with `metadata: clerkStatusMetadata(selectedApp?.application_kind, 'approved')`.

```tsx
import { clerkStatusMetadata } from "../../lib/creator-clerk-metadata";
// ...line 179:
                            metadata: clerkStatusMetadata(selectedApp?.application_kind, 'approved'),
// ...line 230:
                            body: { userId: app.user_id, metadata: clerkStatusMetadata(selectedApp?.application_kind, 'approved') },
```

- [ ] **Step 5: Run test + typecheck**

Run: `cd edutumobile && npm test -- --maxWorkers=2 creatorClerkMetadata && npx tsc --noEmit`
Expected: PASS + no new type errors.

- [ ] **Step 6: Commit**

```bash
git add edutumobile/lib/creator-clerk-metadata.ts edutumobile/__tests__/creatorClerkMetadata.test.ts edutumobile/app/admin/creator-applications.tsx
git commit -m "fix(mentor-mobile): admin approval syncs mentorStatus for mentor applications"
```

---

### Task 10: Profile entry points — fetch approval, rebrand, gate

**Files:**
- Modify: `edutumobile/app/(app)/profile/index.tsx` (`checkRole` effect `:130-145`; menu item `:151`; banner `:280-298`)

**Interfaces:**
- Consumes: `supabase` + `toSafeUUID` (already imported/used at `:137`).

- [ ] **Step 1: Extend the role effect to also read approval status.** Replace the `.select('role')` query in the `checkRole` effect (line 136) so it also pulls the status columns, and store an approval flag:

```tsx
    const [isApprovedMentor, setIsApprovedMentor] = useState(false);
    // ...inside checkRole:
                const { data } = await supabase
                    .from('profiles')
                    .select('role, creator_status, mentor_status')
                    .eq('user_id', toSafeUUID(user.id))
                    .single();
                setIsAdmin(data?.role === 'admin');
                setIsApprovedMentor(
                    data?.creator_status === 'approved' || data?.mentor_status === 'approved',
                );
```

- [ ] **Step 2: Rebrand the "Creator Studio" menu item** (line 151) — keep the route `/creator-dashboard`, change the i18n keys to the mentor ones added in Task 12:

```tsx
                { id: 'creator', title: t('view.menu.mentorStudio'), desc: t('view.menu.mentorStudioDesc'), icon: LayoutGrid, route: '/creator-dashboard', color: '#6366F1', bg: 'rgba(99,102,241,0.15)' },
```

- [ ] **Step 3: Gate + rebrand the banner** (lines 280-298): route it to `/mentor-apply`, use mentor copy, and hide it once approved:

```tsx
                {/* Become a Mentor Banner — hidden once approved */}
                {!isApprovedMentor && (
                <TouchableOpacity
                    style={[styles.creatorBanner, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '30' }]}
                    onPress={() => router.push('/mentor-apply')}
                    activeOpacity={0.8}
                >
                    <View style={[styles.creatorIcon, { backgroundColor: colors.primary }]}>
                        <Crown size={24} color="#fff" />
                    </View>
                    <View style={styles.creatorContent}>
                        <Text style={[styles.creatorTitle, { color: colors.foreground }]}>
                            {t('view.becomeMentor')}
                        </Text>
                        <Text style={[styles.creatorDesc, { color: textSecondary }]}>
                            {t('view.becomeMentorDesc')}
                        </Text>
                    </View>
                    <ChevronRight size={20} color={colors.primary} />
                </TouchableOpacity>
                )}
```

- [ ] **Step 4: Verify typecheck + lint** (React Compiler lint is strict — no set-state-in-render):

Run: `cd edutumobile && npx tsc --noEmit && npm run lint`
Expected: no new errors/warnings.

- [ ] **Step 5: Commit**

```bash
git add "edutumobile/app/(app)/profile/index.tsx"
git commit -m "feat(mentor-mobile): profile shows Mentor Studio when approved, Become a Mentor otherwise"
```

---

### Task 11: De-fabricate the mentor-apply intro stats

**Files:**
- Modify: `edutumobile/app/(app)/mentor-apply.tsx` (`:199-210`)

- [ ] **Step 1: Replace the fabricated numbers** (`10K+`, `500+`) with honest facts; keep `85%`:

```tsx
                            <View style={styles.statsRow}>
                                {[
                                    { num: '85%', label: t('mentorApply.intro.statRevenue'), color: '#00d722' },
                                    { num: t('mentorApply.intro.freeValue', { defaultValue: 'Free' }), label: t('mentorApply.intro.statFree', { defaultValue: 'No cost to apply' }), color: '#146ef5' },
                                    { num: t('mentorApply.intro.reviewValue', { defaultValue: '2–3 days' }), label: t('mentorApply.intro.statReview', { defaultValue: 'Application review' }), color: '#7a3dff' },
                                ].map((stat, i) => (
                                    <View key={i} style={[styles.statCard, { backgroundColor: cardBg, borderColor }]}>
                                        <Text style={[styles.statNum, { color: stat.color }]}>{stat.num}</Text>
                                        <Text style={[styles.statLabel, { color: textSecondary }]}>{stat.label}</Text>
                                    </View>
                                ))}
                            </View>
```

- [ ] **Step 2: Verify typecheck**

Run: `cd edutumobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "edutumobile/app/(app)/mentor-apply.tsx"
git commit -m "fix(mentor-mobile): replace fabricated apply-intro stats with honest facts"
```

---

### Task 12: Mobile i18n rebrand strings (en authoritative)

**Files:**
- Modify: `edutumobile/lib/i18n/locales/en/*.json` (locate exact files via grep below)

- [ ] **Step 1: Find the files that own the keys**

Run:
```bash
cd edutumobile && grep -rln "creatorStudio\|becomeCreator\|mentorApply" lib/i18n/locales/en/
```
Expected: the profile namespace file (owns `view.menu.creatorStudio`, `view.becomeCreator`) and `misc.json` (owns `mentorApply.*`).

- [ ] **Step 2: Add the new mentor keys** alongside the existing ones (do not delete the old keys other code may still use). In the profile namespace file add:

```json
"view": {
  "menu": {
    "mentorStudio": "Mentor Studio",
    "mentorStudioDesc": "Publish roadmaps & resources, track your impact"
  },
  "becomeMentor": "Become a Mentor",
  "becomeMentorDesc": "Share your roadmaps and earn from your expertise"
}
```

In `misc.json`, under `mentorApply.intro`, add the honest-stat keys used in Task 11:

```json
"freeValue": "Free",
"statFree": "No cost to apply",
"reviewValue": "2–3 days",
"statReview": "Application review"
```

- [ ] **Step 3: Regenerate resources if the repo requires it**

Run:
```bash
cd edutumobile && node scripts/gen-i18n-resources.js 2>/dev/null || echo "no gen script — resources load directly"
```
(Other locales inherit `en` via i18next fallback until translated — acceptable for this phase.)

- [ ] **Step 4: Verify typecheck + a quick jest smoke**

Run: `cd edutumobile && npx tsc --noEmit && npm test -- --maxWorkers=2 mobileMentorApply`
Expected: types clean; existing mentor-apply test still green.

- [ ] **Step 5: Commit**

```bash
git add edutumobile/lib/i18n/locales/
git commit -m "feat(mentor-mobile): Mentor Studio / Become a Mentor i18n strings"
```

---

### Task 13: Full-suite verification gate

**Files:** none (verification only)

- [ ] **Step 1: Backend**

Run: `cd backend/services/services/api && npx jest && npm run lint && npm run build && node dist/main`
Expected: all tests PASS; 0 lint warnings; build OK; boots to "successfully started" (Ctrl-C after).

- [ ] **Step 2: Web**

Run: `cd edutu-web-app && npm run typecheck && npm run lint && npx vitest run && npm run build`
Expected: clean typecheck; 0 lint warnings; tests PASS; build OK. Confirm `public/sitemap.xml` isn't an unintended staged change.

- [ ] **Step 3: Mobile**

Run: `cd edutumobile && npx tsc --noEmit && npm run lint && npm test -- --maxWorkers=2`
Expected: clean types; 0 lint warnings; tests PASS.

- [ ] **Step 4: Final review pass** — invoke `superpowers:requesting-code-review` on the Phase-1 diff before merging. Address findings, then finish per `superpowers:finishing-a-development-branch`.

---

## Self-Review (spec coverage)

| Spec section | Covered by |
|---|---|
| §5.1 unified gate (4 call sites) | Task 3 (roadmaps ×2) + Task 4 (creator ×2, dashboard + createListing) |
| §5.2 real dashboard stats | Task 2 (pure) + Task 4 (endpoint) + Task 6 (web render); mobile already real, apply-intro de-fabricated in Task 11 |
| §5.2 earnings-total bug | Task 4 (SQL SUM replaces last-20) |
| §5.3 admin Clerk-sync fix | Task 9 |
| §5.4 web rebrand + dashboard route | Task 6 + Task 7 |
| §5.5 mobile register + rebrand + gate + stats | Tasks 8, 10, 11, 12 |
| §5.5 i18n swaps | Task 7 (web) + Task 12 (mobile) |
| §7 testing | Tasks 1,2,3,4,5,9 unit tests + Task 13 gate |

**Deviations from spec (discovered during planning, intentional):**
- The web app has **no** existing creator/mentor dashboard component (the web `CLAUDE.md` route table is stale) — Task 6 builds one net-new (read-only; authoring is Phase 2).
- The mobile dashboard already renders **real** derived stats and status badges — the fabricated numbers are on the apply *intro* screens, so "replace hardcoded stats" is addressed by the backend endpoint + web render + Task 11's de-fabrication, not by rewriting the mobile dashboard. Wiring the mobile dashboard to the new `/creator/dashboard` `stats` (learnersReached/avgRating) is deferred to Phase 2 to keep Phase 1 low-risk.
