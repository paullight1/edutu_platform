# Illustrated State System — Screen Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the high-traffic screens of both apps through `StateView`, so users actually see the 26 illustrated states, and delete `edutu-web-app/src/components/ui/EmptyState.tsx` once its last consumer is gone.

**Architecture:** Each screen replaces its hand-rolled `loading / error / length === 0` ternary with a single `useScreenState()` call plus one `<StateView>`. No fetch logic changes, no layout changes. Shaped skeletons stay where a screen has a known shape — they preserve layout better than any centred illustration.

**Tech Stack:** React + Tailwind (web, Vitest) · React Native + Expo Router (mobile, Jest) · `@edutu/ux-state` for the contract and geometry

**Prerequisite:** `docs/superpowers/plans/2026-08-03-illustrated-state-system.md` is complete (commits `5cda1da`…`ed52363`). `StateView`, `SceneRenderer` and `useScreenState` exist in both apps.

## Scope

**In:** the eleven list-bearing screens below — six on web, five on mobile — plus the deletion of `ui/EmptyState.tsx`.

**Deliberately out, from spec §7:**

- **Detail screens** — mobile `opportunities/[id]`, `copilot/[id]`, `goals/[id]`, `roadmap/[id]`, and web `OpportunityDetail`. A single-record screen has a different shape: `error:notFound` is its main event rather than an edge case, and there is no list to be empty. They deserve their own pass with `notFound` designed properly, not a list-screen pattern bent to fit.
- **`edutumobile/app/(app)/roadmaps.tsx`** — it carries another session's uncommitted work *and* a pre-existing lint error. Migrating it now would tangle two sessions' changes in one file. Mobile's goals flow is covered by `goals/index` (Task 8); `roadmaps.tsx` follows once that other work lands.
- **`opportunities/featured`** — a thin variant of `opportunities/index`; migrate it in the same pass as the detail screens.

**A note on precision.** Tasks 1, 2, 6, 7, 8 and 11 quote the exact existing code, because those blocks were read in full. Tasks 3, 4, 5, 9 and 10 give exact line anchors and the exact replacement, but say "use the file's own name" for a few local variables — those files are 650–2,900 lines and only their state-handling regions were surveyed. **Read the anchored region before editing it.** Inventing a variable name is the one way these tasks fail.

## Global Constraints

Every task's requirements implicitly include this section.

- **Never `git stash`.** Concurrent sessions share this working tree, which already carries ~50 modified files from other work. Read prior versions with `git show HEAD:<path>`.
- **`edutumobile/app/(app)/roadmaps.tsx` has a pre-existing lint error** (`react-hooks/set-state-in-effect`, line ~357) from another session's uncommitted work. Do not fix it and do not let it block a commit; lint your own files with `npx eslint <paths> --max-warnings 0`.
- **No layout or fetch changes.** This work replaces state surfaces only. If a screen's data flow looks wrong, note it and move on.
- **No new npm dependencies.** Web tests use `fireEvent` from `@testing-library/react` — `@testing-library/user-event` is not installed.
- **One commit per task.**
- Mobile test command: `cd edutumobile && npx jest <path> --maxWorkers=2`. Web: `cd edutu-web-app && npx vitest run <path>`.

### The skeleton rule

`StateView` renders a `loading` scene, but **a screen that already renders a shaped skeleton keeps it.** A skeleton grid that matches the real card layout tells the user what is coming and holds the scroll position; swapping it for a centred illustration is a downgrade. Use the `loading` scene only where a screen has no known shape.

Concretely: keep the existing `loading ?` skeleton branch, and hand `StateView` only the empty / error / offline / locked / denied states.

### The flow map

Every `StateView` needs a `flow`, which selects the first-run empty scene:

| Screen | `flow` |
|---|---|
| web `Dashboard`, mobile `(app)/index` | `home` |
| web `OpportunitiesPage`, mobile `opportunities/index`, `opportunities/featured` | `discovery` |
| web `SavedPage`, mobile `saved/index` | `saved` |
| web `ApplicationsPage`, `DeadlinesPage`, mobile `applied`, `deadlines` | `applied` |
| web `GoalsPage`, `RoadmapsPage`, mobile `goals/index`, `roadmaps` | `goals` |

### The migration pattern

Every task is this substitution. It is stated once here rather than repeated eleven times.

**Before** — a three-or-four-way ternary, with `error` as a string and no way to tell a filtered empty from a first-run one:

```tsx
{loading ? (
  <SkeletonGrid />
) : error ? (
  <ErrorState message={error} onRetry={() => void load()} />
) : items.length === 0 ? (
  <EmptyState icon={<Icon size={32} />} title="…" description="…" action={{…}} />
) : (
  <List items={items} />
)}
```

**After** — the skeleton stays; everything else becomes one declared state:

```tsx
const state = useScreenState({
  data: items,
  loading,
  error: loadError,          // pass the Error, not a string — see below
  filtersActive: Boolean(query || category !== 'all'),
});

// …in the render:
{loading ? (
  <SkeletonGrid />
) : showsContent(state) ? (
  <List items={items} />
) : (
  <StateView state={state} flow="goals" onRetry={() => void load()} onAction={…} />
)}
```

**Pass the error object, not the message.** `classifyError()` reads `status` / `statusCode` / `response.status` to tell `auth` from `notFound` from `server`. Screens that currently do `setError(e instanceof Error ? e.message : '…')` collapse that to a string and every failure becomes `server`. Each task therefore adds a parallel `loadError` state holding the caught value, and leaves the existing string state alone where other code reads it.

---

### Task 1: Web — SavedPage

The smallest and clearest of the six; do it first so the pattern is established.

**Files:**
- Modify: `edutu-web-app/src/components/SavedPage.tsx`
- Test: `edutu-web-app/src/test/__tests__/savedPageState.test.tsx`

**Interfaces:**
- Consumes: `useScreenState`, `StateView`, `showsContent` from `@/components/state`.
- Produces: nothing other screens depend on.

- [ ] **Step 1: Write the failing test**

```tsx
// edutu-web-app/src/test/__tests__/savedPageState.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StateView } from '@/components/state';

// SavedPage itself needs Clerk, a router and a live fetch, so its wiring is
// asserted through the contract it now delegates to rather than by mounting it.
describe('SavedPage states', () => {
  it('shows the saved first-run scene, not a generic one', () => {
    const { container } = render(
      <StateView state={{ kind: 'empty', reason: 'firstRun' }} flow="saved" />,
    );
    expect(screen.getByText(/nothing saved yet/i)).toBeTruthy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('tells an expired session apart from a server fault', () => {
    const auth = render(<StateView state={{ kind: 'error', cause: 'auth' }} flow="saved" />);
    const server = render(<StateView state={{ kind: 'error', cause: 'server' }} flow="saved" />);
    expect(auth.container.querySelector('h3')!.textContent).not.toBe(
      server.container.querySelector('h3')!.textContent,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/savedPageState.test.tsx
```

Expected: FAIL — the file does not exist yet, then PASS once written (it exercises already-shipped code). Its purpose is to lock the flow-specific copy in place; if it passes immediately, that is correct.

- [ ] **Step 3: Capture the real error and derive the state**

In `SavedPage.tsx`, add a parallel error holder beside the existing string state (around line 35):

```tsx
  const [error, setError] = useState<string | null>(null);
  // The raw failure, so classifyError() can tell 401 from 500. `error` stays a
  // string because the header still renders it.
  const [loadError, setLoadError] = useState<unknown>(null);
```

In `loadBookmarks`, set it alongside the string (around line 50 and 55):

```tsx
    setLoading(true);
    setError(null);
    setLoadError(null);
    try {
      const token = await resolveToken();
      setBookmarks(await getBookmarks(user.id, token));
    } catch (caught) {
      setLoadError(caught);
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load saved opportunities.",
      );
    } finally {
```

Make `resolveToken` throw something classifiable — it currently throws a bare `Error`, which `classifyError` maps to `server`, so an expired session shows "something went wrong on our side" instead of "sign in again":

```tsx
  const resolveToken = useCallback(async () => {
    const token = await getToken().catch(() => null);
    if (!token) {
      // Tagged so classifyError() reports `auth`; a bare Error would read as a
      // server fault and offer Retry, which cannot fix an expired session.
      throw Object.assign(
        new Error("Your session has expired. Sign in again to view saved opportunities."),
        { status: 401 },
      );
    }
    return token;
  }, [getToken]);
```

- [ ] **Step 4: Replace the error and empty branches**

Add the import beside the existing ones:

```tsx
import { StateView, showsContent, useScreenState } from "./state";
```

Remove `import { EmptyState, ErrorState } from "./ui/EmptyState";`.

Derive the state after the other hooks:

```tsx
  const screenState = useScreenState({ data: bookmarks, loading, error: loadError });
```

Replace the `) : error ? (` and `) : bookmarks.length === 0 ? (` branches (lines ~151–172) with a single branch. The `loading ?` skeleton branch above them is unchanged:

```tsx
          {loading ? (
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-[20px] border border-subtle bg-surface-elevated"
                />
              ))}
            </div>
          ) : !showsContent(screenState) ? (
            <div className={`mt-5 rounded-[20px] border ${surfaceClass}`}>
              <StateView
                state={screenState}
                flow="saved"
                onRetry={() => void loadBookmarks()}
                onAction={() => navigate("/opportunities")}
              />
            </div>
          ) : (
```

Leave the trailing content branch (`<div className="mt-5 grid gap-4 sm:grid-cols-2">` with the bookmark cards) exactly as it is.

- [ ] **Step 5: Remove the now-unused imports**

`Bookmark` is still used by the cards. Check nothing else broke:

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx eslint src/components/SavedPage.tsx --max-warnings 0 && echo "LINT CLEAN"
npx tsc -b 2>&1 | head -5 && echo "TSC CLEAN"
```

Expected: `LINT CLEAN`, `TSC CLEAN`.

- [ ] **Step 6: Run the tests**

```bash
npx vitest run src/test/__tests__/savedPageState.test.tsx
```

Expected: PASS, 2 tests.

- [ ] **Step 7: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add edutu-web-app/src/components/SavedPage.tsx \
        edutu-web-app/src/test/__tests__/savedPageState.test.tsx
git commit -m "feat(web): SavedPage renders illustrated states"
```

---

### Task 2: Web — RoadmapsPage

**Files:**
- Modify: `edutu-web-app/src/components/RoadmapsPage.tsx`

**Interfaces:**
- Consumes: the same three exports from `@/components/state`.

- [ ] **Step 1: Capture the real error**

Beside the existing state (line ~69):

```tsx
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
```

In `load()`:

```tsx
    setLoading(true);
    setError(null);
    setLoadError(null);
    try {
      setRoadmaps(await fetchRoadmaps({ limit: 40 }));
    } catch (caught) {
      setLoadError(caught);
      setError(
        caught instanceof Error ? caught.message : "Unable to load roadmaps.",
      );
    } finally {
      setLoading(false);
    }
```

- [ ] **Step 2: Derive the state, including the filtered distinction**

This screen already knows when the user has narrowed the list — that is exactly what separates `empty:filtered` from `empty:firstRun`, and it is the distinction the old `EmptyState` could not express:

```tsx
import { StateView, showsContent, useScreenState } from "./state";

  const filtersActive = Boolean(query) || category !== "all";
  const screenState = useScreenState({
    data: visible,
    loading,
    error: loadError,
    filtersActive,
  });
```

Remove `import { EmptyState, ErrorState } from "./ui/EmptyState";`.

- [ ] **Step 3: Replace the error and empty branches**

Replace lines ~281–305 (`) : error ? (` through the end of the `visible.length === 0` block), keeping the `loading ?` skeleton above untouched:

```tsx
          ) : !showsContent(screenState) ? (
            <div className={`mt-5 rounded-[20px] border ${surfaceClass}`}>
              <StateView
                state={screenState}
                flow="goals"
                onRetry={() => void load()}
                onAction={
                  filtersActive
                    ? () => {
                        setQuery("");
                        setCategory("all");
                      }
                    : undefined
                }
              />
            </div>
          ) : (
```

- [ ] **Step 4: Verify**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx eslint src/components/RoadmapsPage.tsx --max-warnings 0 && echo "LINT CLEAN"
npx tsc -b 2>&1 | head -5 && echo "TSC CLEAN"
npx vitest run 2>&1 | tail -4
```

Expected: lint and tsc clean, full suite still passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add edutu-web-app/src/components/RoadmapsPage.tsx
git commit -m "feat(web): RoadmapsPage renders illustrated states, filtered empty included"
```

---

### Task 3: Web — GoalsPage

**Files:**
- Modify: `edutu-web-app/src/components/GoalsPage.tsx`

Note this screen's error comes from the `useGoals` hook rather than local state, and it already guards `error && goals.length === 0` — which is the same precedence `deriveState` encodes (cached content beats a bare error).

- [ ] **Step 1: Derive the state**

Beside the hook (line ~90):

```tsx
import { StateView, showsContent, useScreenState } from "./state";

  const { goals, isLoading, error, refreshGoals, createGoal, updateGoal, deleteGoal } = /* unchanged */;

  const screenState = useScreenState({
    data: visibleGoals,
    loading: isLoading,
    error,
    // `visibleGoals` is `goals` after the search/filter pass, so an empty
    // result with goals present is a filtered empty, not a first run.
    filtersActive: goals.length > 0 && visibleGoals.length === 0,
  });
```

Remove `import { EmptyState, ErrorState } from "./ui/EmptyState";`.

- [ ] **Step 2: Replace the error and empty branches**

Replace lines ~305–325 (`) : error && goals.length === 0 ? (` through the end of the `visibleGoals.length === 0` block). The `isLoading ?` skeleton branch above stays:

```tsx
          ) : !showsContent(screenState) ? (
            <StateView
              state={screenState}
              flow="goals"
              onRetry={() => void refreshGoals()}
              onAction={() => setShowForm(true)}
            />
          ) : (
```

If the local variable that opens the create-goal form is not `setShowForm`, use whatever the existing `EmptyState` action's `onClick` called — copy it verbatim.

- [ ] **Step 3: Verify and commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx eslint src/components/GoalsPage.tsx --max-warnings 0 && npx tsc -b && npx vitest run 2>&1 | tail -4
cd .. && git add edutu-web-app/src/components/GoalsPage.tsx
git commit -m "feat(web): GoalsPage renders illustrated states"
```

---

### Task 4: Web — ApplicationsPage and DeadlinesPage

These two share a flow (`applied`) and an identical structure — a bare `{error ? <div>{error}</div> : null}` strip and a `length === 0` branch — so they migrate together.

**Files:**
- Modify: `edutu-web-app/src/components/ApplicationsPage.tsx`
- Modify: `edutu-web-app/src/components/DeadlinesPage.tsx`

- [ ] **Step 1: ApplicationsPage — capture the error and derive**

This screen sets `error` from three different operations (load, status update, delete). Only the **load** failure is a screen state; the other two are operation failures and become `InlineError` so the list stays on screen.

Beside the existing state (line ~174):

```tsx
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
```

In the load path only (line ~238):

```tsx
    setError(null);
    setLoadError(null);
    try {
      /* unchanged */
    } catch (caught) {
      setLoadError(caught);
      setError(caught instanceof Error ? caught.message : 'Unable to load applications.');
    }
```

Leave the update and delete `catch` blocks setting `error` alone.

Then:

```tsx
import { InlineError, StateView, showsContent, useScreenState } from './state';

  const screenState = useScreenState({ data: applications, loading, error: loadError });
```

- [ ] **Step 2: ApplicationsPage — replace the error strip and the empty branch**

Replace the bare error strip (line ~357):

```tsx
        {error && showsContent(screenState) ? (
          // A failed status update while the list is on screen: recover in
          // place rather than replacing what the user was reading.
          <InlineError message={error} onRetry={() => void load()} className="mb-4" />
        ) : null}

        {loading ? null : !showsContent(screenState) ? (
          <StateView
            state={screenState}
            flow="applied"
            onRetry={() => void load()}
            onAction={() => navigate('/opportunities')}
          />
        ) : null}
```

Then delete the separate `applications.length === 0` empty branch further down, since `StateView` now owns it. Keep the `{!loading && applications.length > 0 ? …}` content branch.

- [ ] **Step 3: DeadlinesPage — same substitution**

Beside the existing state (line ~182):

```tsx
  const [loadError, setLoadError] = useState<unknown>(null);
```

Set it in the catch at line ~203 exactly as in Step 1, then:

```tsx
import { InlineError, StateView, showsContent, useScreenState } from './state';

  const screenState = useScreenState({ data: datedWorkItems, loading, error: loadError });
```

Replace the bare error strip at line ~462 with the `InlineError` form from Step 2, and replace the `datedWorkItems.length === 0` branch at line ~715 with:

```tsx
            ) : !showsContent(screenState) ? (
              <StateView
                state={screenState}
                flow="applied"
                onRetry={() => void load()}
                onAction={() => navigate('/opportunities')}
              />
            ) : (
```

Leave the `bookmarks.length === 0` branch at line ~772 alone — it is a section inside the page, not the page state, and Task 6 covers section slots.

- [ ] **Step 4: Verify and commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx eslint src/components/ApplicationsPage.tsx src/components/DeadlinesPage.tsx --max-warnings 0
npx tsc -b && npx vitest run 2>&1 | tail -4
cd .. && git add edutu-web-app/src/components/ApplicationsPage.tsx edutu-web-app/src/components/DeadlinesPage.tsx
git commit -m "feat(web): applications and deadlines render illustrated states"
```

---

### Task 5: Web — OpportunitiesPage

**Files:**
- Modify: `edutu-web-app/src/components/OpportunitiesPage.tsx`

This screen's `error` comes from `useOpportunities()` and is already an error value, so no parallel holder is needed. It also has both a search term and filter chips, so `filtersActive` is a real disjunction — and it currently renders two different empties (`EmptySearchResults`, `EmptyOpportunities`) that collapse into one `empty:filtered`.

- [ ] **Step 1: Derive the state**

Beside the hook (line ~687):

```tsx
import { StateView, showsContent, useScreenState } from './state';

  const { data: opportunities, loading, error, refresh } = useOpportunities();

  const filtersActive = Boolean(searchQuery) || activeFilterCount > 0;
  const screenState = useScreenState({
    data: filteredOpportunities,
    loading,
    error,
    filtersActive,
  });
```

Use whatever the file already calls the post-filter list and the active-filter count; if there is no count variable, derive one from the filter state the `clearAllFilters` function resets.

Remove `import { EmptyOpportunities, EmptySearchResults } from "./ui/EmptyState";`.

- [ ] **Step 2: Replace the error branch and both empties**

Replace the `{error ? (` block at line ~1419 with nothing — `StateView` now owns it — and replace the `EmptySearchResults` / `EmptyOpportunities` branch at lines ~1546–1551 with:

```tsx
            <StateView
              state={screenState}
              flow="discovery"
              onRetry={() => void refresh()}
              onAction={clearAllFilters}
            />
```

Keep the `{loading ? (` skeleton branch at line ~1446 exactly as it is — this screen has the most valuable skeletons in the app.

Guard the content branch with `showsContent(screenState)` so the list only renders when there is something to render.

- [ ] **Step 3: Verify and commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx eslint src/components/OpportunitiesPage.tsx --max-warnings 0
npx tsc -b && npx vitest run 2>&1 | tail -4
cd .. && git add edutu-web-app/src/components/OpportunitiesPage.tsx
git commit -m "feat(web): OpportunitiesPage renders illustrated states"
```

---

### Task 6: Web — Dashboard, and delete `ui/EmptyState`

Dashboard is the last consumer, so its migration and the deletion are one commit.

**Files:**
- Modify: `edutu-web-app/src/components/Dashboard.tsx`
- Delete: `edutu-web-app/src/components/ui/EmptyState.tsx`
- Test: `edutu-web-app/src/test/__tests__/emptyStateRemoved.test.ts`

Dashboard renders the same `ErrorState` / `EmptyState` pair **three times** (lines ~1967, ~2094, ~2161) against one set of computed values (`opportunityEmptyTitle`, `opportunityEmptyDescription`, `opportunityEmptyAction` at lines ~1046–1060). All three become the same `StateView`.

- [ ] **Step 1: Write the guard test**

```ts
// edutu-web-app/src/test/__tests__/emptyStateRemoved.test.ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A deleted primitive that comes back is a decoy the next screen adopts, so
// its absence is asserted rather than trusted.
describe('the legacy EmptyState primitive', () => {
  it('no longer exists', () => {
    expect(existsSync(resolve(__dirname, '../../components/ui/EmptyState.tsx'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx vitest run src/test/__tests__/emptyStateRemoved.test.ts
```

Expected: FAIL — the file still exists.

- [ ] **Step 3: Derive one state for the opportunity feed**

Next to the existing computed values (line ~1046), replacing `opportunityEmptyTitle` / `Description` / `Action` with a single state plus the two overrides that stay screen-specific:

```tsx
import { StateView, showsContent, useScreenState } from "./state";

    const opportunityScreenState = useScreenState({
      data: visibleHomeOpportunities,
      loading: opportunitiesLoading,
      error: opportunityFeedError,
      // A discovery category is a filter. Selecting one and finding nothing is
      // a filtered empty, not "you have no recommendations".
      filtersActive: Boolean(selectedDiscoveryCategory),
    });

    const opportunityEmptyTitle = selectedDiscoveryCategory
      ? t("dashboard.empty.noCategoryFound", {
          category: selectedDiscoveryCategory.title.toLowerCase(),
        })
      : t("dashboard.empty.noRecommendations");
    const opportunityEmptyDescription = selectedDiscoveryCategory
      ? t("dashboard.empty.tryAnotherCategory")
      : t("dashboard.empty.noRecommendationsDescription");
    const opportunityEmptyAction = selectedDiscoveryCategory
      ? () => setActiveDiscoveryCategory(null)
      : onViewAllOpportunities;
    const opportunityEmptyActionLabel = selectedDiscoveryCategory
      ? t("dashboard.empty.showAll")
      : t("dashboard.empty.browseOpportunities");
```

Note `opportunityEmptyAction` changes shape from `{ label, onClick }` to a bare function, with the label alongside — that is what `StateView` takes.

- [ ] **Step 4: Replace all three ErrorState/EmptyState pairs**

At each of the three sites, replace the `<ErrorState … />` and `<EmptyState … />` pair with one element. Keep whatever wrapper `<div>` each site already has:

```tsx
                        <StateView
                          state={opportunityScreenState}
                          flow="home"
                          title={opportunityEmptyTitle}
                          body={opportunityEmptyDescription}
                          actionLabel={opportunityEmptyActionLabel}
                          onAction={opportunityEmptyAction}
                          onRetry={() => void refreshOpportunities()}
                        />
```

Use whatever refresh function the surrounding code already calls; if the site has no refresh available, omit `onRetry` — `StateView` simply renders no action for retryable states then.

Remove `import { EmptyState, ErrorState } from "./ui/EmptyState";` (line 24).

- [ ] **Step 5: Confirm no consumers remain, then delete**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
grep -rn "ui/EmptyState\|EmptyOpportunities\|EmptySearchResults\|EmptyNotifications\|EmptyAchievements\|EmptyInbox\|EmptyFolder\|OfflineState\|ComingSoonState" src || echo "NO CONSUMERS REMAIN"
```

Expected: `NO CONSUMERS REMAIN`. Any hit must be migrated before proceeding.

`ui/EmptyState.tsx` also exports an `OfflineBanner`. Check whether the separate `src/components/OfflineBanner.tsx` is the one actually used:

```bash
grep -rn "from \"./ui/EmptyState\"\|OfflineBanner" src --include=*.tsx | grep -v "src/components/OfflineBanner.tsx"
```

If anything imports `OfflineBanner` from `ui/EmptyState`, repoint it at `src/components/OfflineBanner.tsx` first. Then:

```bash
git rm src/components/ui/EmptyState.tsx
```

- [ ] **Step 6: Verify**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx tsc -b && echo "TSC CLEAN"
npx eslint src --max-warnings 0 && echo "LINT CLEAN"
npx vitest run 2>&1 | tail -5
npm run build 2>&1 | tail -3
```

Expected: all clean, full suite passing, build succeeding.

- [ ] **Step 7: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add -A edutu-web-app/src
git commit -m "feat(web): Dashboard renders illustrated states; delete legacy EmptyState"
```

---

### Task 7: Mobile — saved/index

**Files:**
- Modify: `edutumobile/app/(app)/saved/index.tsx`

Two separate empties here: the screen-level "nothing saved" (line ~166) and a filter-level "none match this tab" (line ~211). They are exactly `empty:firstRun` and `empty:filtered`.

- [ ] **Step 1: Derive both states**

```tsx
import { StateView, useScreenState } from '../../../components/state';

    const savedState = useScreenState({ data: savedOpps, loading });
    const filterState = useScreenState({
      data: filteredOpps,
      loading,
      filtersActive: true,
    });
```

Remove `import { EmptyState } from "../../../components/ui/EmptyState";`.

- [ ] **Step 2: Replace the screen-level empty**

Replace lines ~166–170:

```tsx
                {savedOpps.length === 0 ? (
                    <StateView
                        state={savedState}
                        flow="saved"
                        onAction={() => router.push('/opportunities')}
                    />
                ) : (
```

- [ ] **Step 3: Replace the filter-level empty**

Replace lines ~211–219. Note `fill={false}` — this sits inside a `ScrollView` and must not claim `flex: 1` — and a reduced `sceneSize`, because a hero-scale scene between filter tabs and a list is out of proportion:

```tsx
                        {filteredOpps.length === 0 ? (
                            <StateView
                                state={filterState}
                                flow="saved"
                                fill={false}
                                sceneSize={140}
                                title={t(`filters.none.${filter}`)}
                                body=""
                            />
                        ) : (
```

- [ ] **Step 4: Verify and commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx eslint "app/(app)/saved/index.tsx" --max-warnings 0 && echo "LINT CLEAN"
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "saved/index" || echo "TSC CLEAN"
cd .. && git add "edutumobile/app/(app)/saved/index.tsx"
git commit -m "feat(mobile): saved screen renders illustrated states"
```

---

### Task 8: Mobile — goals/index, deleting the theme-blind EmptySection

`EmptySection` (line ~104) hardcodes `#f8fafc`, `#1e293b`, `#94a3b8` and `#64748b`. The app ships 9 theme packages × light/dark, so it is correct in one palette out of eighteen. It has three call sites (~569, ~618, ~669).

**Files:**
- Modify: `edutumobile/app/(app)/goals/index.tsx`

- [ ] **Step 1: Delete the `EmptySection` component**

Remove the whole function at lines ~104–139, plus the `emptyBox`, `emptyIconCircle`, `emptyTitle`, `emptyDesc`, `emptyActionBtn` and `emptyActionText` entries from its `StyleSheet`.

- [ ] **Step 2: Replace the "nothing matches" call site**

At line ~569:

```tsx
                {isNarrowed && filteredGoals.length === 0 && (
                    <View style={styles.section}>
                        <StateView
                            state={{ kind: 'empty', reason: 'filtered' }}
                            flow="goals"
                            fill={false}
                            sceneSize={150}
                            title={t('empty.noMatch.title')}
                            body={t('empty.noMatch.description')}
                            actionLabel={t('empty.noMatch.action')}
                            onAction={clearNarrowing}
                        />
                    </View>
                )}
```

- [ ] **Step 3: Replace the "no roadmaps" call site**

At line ~618:

```tsx
                            <StateView
                                state={{ kind: 'empty', reason: 'firstRun' }}
                                flow="goals"
                                fill={false}
                                sceneSize={150}
                                title={t('empty.noRoadmaps.title')}
                                body={t('empty.noRoadmaps.description')}
                                actionLabel={t('empty.noRoadmaps.action')}
                                onAction={() => router.push('/roadmaps')}
                            />
```

- [ ] **Step 4: Replace the "no personal goals" call site**

At line ~669:

```tsx
                            <StateView
                                state={{ kind: 'empty', reason: 'firstRun' }}
                                flow="goals"
                                fill={false}
                                sceneSize={150}
                                title={t('empty.noPersonalGoals.title')}
                                body={t('empty.noPersonalGoals.description')}
                                actionLabel={t('empty.noPersonalGoals.action')}
                                onAction={() => router.push('/goals/add')}
                            />
```

Add `import { StateView } from '../../../components/state';` and drop any icon imports (`Search`, `Map`, `Target`) that were only used to feed `EmptySection`.

- [ ] **Step 5: Verify no hardcoded empty-state colour survives**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
grep -n "EmptySection\|emptyBox\|emptyIconCircle" "app/(app)/goals/index.tsx" || echo "EMPTYSECTION GONE"
npx eslint "app/(app)/goals/index.tsx" --max-warnings 0 && echo "LINT CLEAN"
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "goals/index" || echo "TSC CLEAN"
```

Expected: `EMPTYSECTION GONE`, `LINT CLEAN`, `TSC CLEAN`.

- [ ] **Step 6: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add "edutumobile/app/(app)/goals/index.tsx"
git commit -m "feat(mobile): goals screen renders illustrated states; drop theme-blind EmptySection"
```

---

### Task 9: Mobile — deadlines and applied

**Files:**
- Modify: `edutumobile/app/(app)/deadlines.tsx`
- Modify: `edutumobile/app/(app)/applied.tsx`

Both currently return `null` when their list is empty (`deadlines.tsx:28`, `applied.tsx:559`) — the user is shown a blank screen with no explanation, which is the worst state in either app.

- [ ] **Step 1: deadlines — replace the silent null**

At line ~28, the helper that returns `null` for an empty list is a *section* helper. Leave it, and add a screen-level state where the sections are rendered:

```tsx
import { StateView, showsContent, useScreenState } from '../../components/state';

  const screenState = useScreenState({ data: items, loading, error: loadError });
```

Then wrap the section list:

```tsx
  {!showsContent(screenState) ? (
    <StateView
      state={screenState}
      flow="applied"
      onRetry={() => void load()}
      onAction={() => router.push('/opportunities')}
    />
  ) : (
    /* the existing section list, unchanged */
  )}
```

Use whatever the file already calls its item array, loading flag and reload function.

- [ ] **Step 2: applied — same substitution**

At line ~652 the screen already has `{loading && applications.length === 0 && ( … )}`. Add beside it:

```tsx
import { StateView, showsContent, useScreenState } from '../../components/state';

  const screenState = useScreenState({ data: applications, loading });
```

and replace the `applications.length === 0` early return at line ~559 (or the branch that renders nothing) with:

```tsx
  {!loading && !showsContent(screenState) ? (
    <StateView
      state={screenState}
      flow="applied"
      onAction={() => router.push('/opportunities')}
    />
  ) : null}
```

- [ ] **Step 3: Verify and commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx eslint "app/(app)/deadlines.tsx" "app/(app)/applied.tsx" --max-warnings 0 && echo "LINT CLEAN"
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "deadlines|applied" || echo "TSC CLEAN"
cd .. && git add "edutumobile/app/(app)/deadlines.tsx" "edutumobile/app/(app)/applied.tsx"
git commit -m "feat(mobile): deadlines and applied explain themselves instead of rendering blank"
```

---

### Task 10: Mobile — opportunities/index

**Files:**
- Modify: `edutumobile/app/(app)/opportunities/index.tsx`

This screen already branches on `{error && !loading ? (` at line ~1335, so it has an error surface but no empty or offline one.

- [ ] **Step 1: Derive the state**

```tsx
import { StateView, showsContent, useScreenState } from '../../../components/state';

  const filtersActive = Boolean(searchQuery) || selectedCategory !== 'all';
  const screenState = useScreenState({
    data: filteredOpportunities,
    loading,
    error,
    filtersActive,
  });
```

Use the file's own names for the search term, category and filtered list.

- [ ] **Step 2: Replace the error branch**

Replace the `{error && !loading ? ( … ) : null}` block at line ~1335 with:

```tsx
      {!loading && !showsContent(screenState) ? (
        <StateView
          state={screenState}
          flow="discovery"
          onRetry={() => void refresh()}
          onAction={filtersActive ? clearFilters : undefined}
        />
      ) : null}
```

Keep every existing loading skeleton and the content list untouched.

- [ ] **Step 3: Verify and commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
npx eslint "app/(app)/opportunities/index.tsx" --max-warnings 0 && echo "LINT CLEAN"
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "opportunities/index" || echo "TSC CLEAN"
cd .. && git add "edutumobile/app/(app)/opportunities/index.tsx"
git commit -m "feat(mobile): discovery renders illustrated empty, filtered and error states"
```

---

### Task 11: Mobile — home, replacing `FeaturedEmptyState`

**Files:**
- Modify: `edutumobile/app/(app)/index.tsx`

`FeaturedEmptyState` (line ~1028) hardcodes eight indigo literals (`rgba(99,102,241,…)`, `#6366F1`, `#E2E8F0`, `#1E293B`, `#94A3B8`, `#A5B4FC`, `#4F46E5`), so it stays indigo in all nine theme packs. It is a compact **row**, not a full-screen state — so it keeps its card shape and swaps only the glyph-in-a-circle for an inline scene.

- [ ] **Step 1: Rewrite `FeaturedEmptyState` around a scene**

Replace the body of the component at lines ~1028–1072. The card, the row layout and the chevron stay; the `featuredEmptyIllus` circle with its `Star` becomes a scene, and every literal becomes a token:

```tsx
function FeaturedEmptyState({ onPress }: { onPress?: () => void }) {
    const { t } = useTranslation('home');
    const tokens = useStateTokens('flow');

    return (
        <AnimatedPressable
            onPress={onPress}
            style={[styles.featuredEmptyCard, {
                backgroundColor: tokens.wash,
                borderColor: tokens.ring,
            }]}
            entering={FadeInDown.duration(360).springify()}
            hapticFeedback="light"
            scaleTo={0.98}
        >
            {/* Layout MUST live on this inner row: AnimatedPressable puts the
                card `style` on its outer wrapper but nests children in flex:1
                column views, so flexDirection on the card style is ignored. */}
            <View style={styles.featuredEmptyRow}>
                {/* An inline-stage scene rather than a hero one: this is a
                    56px row, and a hero scene here would dwarf the copy. */}
                <SceneRenderer scene="emptyDiscovery" size={56} />
                <View style={styles.featuredEmptyBody}>
                    <Text
                        style={[styles.featuredEmptyTitle, { color: tokens.title }]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.3}
                    >
                        {t('featured.emptyTitle', { defaultValue: 'Featured picks coming soon' })}
                    </Text>
                    <Text
                        style={[styles.featuredEmptyHint, { color: tokens.body }]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={1.3}
                    >
                        {t('featured.emptyHint', { defaultValue: 'Explore all opportunities' })}
                    </Text>
                </View>
                {/* Chevron affordance only — the whole card is the tap target, so a
                    labelled "Explore" button would be a redundant second action. */}
                <View style={[styles.featuredEmptyChevron, { backgroundColor: tokens.wash }]}>
                    <ChevronRight size={18} color={tokens.hue} />
                </View>
            </View>
        </AnimatedPressable>
    );
}
```

Add `import { SceneRenderer, useStateTokens } from '../../components/state';`. Delete the `featuredEmptyIllus` style entry, now unused.

- [ ] **Step 2: Update the call site**

At line ~1756 the component no longer takes `isDark`:

```tsx
                            <FeaturedEmptyState onPress={() => router.push('/opportunities')} />
```

- [ ] **Step 3: Replace the silent "no other opportunities" branch**

At line ~1856 the screen renders nothing when the explore grid is empty:

```tsx
                {otherOpportunities.length === 0 && !opportunitiesLoading && (
                    <StateView
                        state={{ kind: 'empty', reason: 'firstRun' }}
                        flow="home"
                        fill={false}
                        sceneSize={150}
                        onAction={() => router.push('/opportunities')}
                    />
                )}
```

Add `StateView` to the same import.

- [ ] **Step 4: Verify no indigo literal survives in the empty card**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
sed -n '1020,1080p' "app/(app)/index.tsx" | grep -n "99,102,241\|#6366F1\|#A5B4FC\|#4F46E5" || echo "NO HARDCODED INDIGO"
npx eslint "app/(app)/index.tsx" --max-warnings 0 && echo "LINT CLEAN"
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "(app)/index" || echo "TSC CLEAN"
npx jest components/state --maxWorkers=2 2>&1 | tail -4
```

Expected: `NO HARDCODED INDIGO`, `LINT CLEAN`, `TSC CLEAN`, tests passing.

- [ ] **Step 5: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add "edutumobile/app/(app)/index.tsx"
git commit -m "feat(mobile): home featured and explore states follow the theme"
```

---

### Task 12: Verify the whole migration and record what is left

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-cross-platform-illustrated-state-system-design.md` (status line only)

- [ ] **Step 1: Full verification of both apps**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app
npx tsc -b && npm run lint && npx vitest run 2>&1 | tail -4 && npm run build 2>&1 | tail -3

cd ../edutumobile
npx tsc --noEmit -p tsconfig.json && echo "TSC CLEAN"
npx jest components/state lib --maxWorkers=2 2>&1 | tail -4
npx eslint components app --max-warnings 0 2>&1 | tail -6
```

Expected: web fully clean; mobile clean except the pre-existing `roadmaps.tsx` error noted in the Global Constraints, which is another session's work.

- [ ] **Step 2: Count what still bypasses the system**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile
echo "Alert.alert calls: $(grep -rn 'Alert\.alert' app components | wc -l) in $(grep -rln 'Alert\.alert' app components | wc -l) files"
echo "raw ActivityIndicator files: $(grep -rln 'ActivityIndicator' app components | wc -l)"
echo "screens using StateView: $(grep -rln 'StateView' app | wc -l)"
```

Record the three numbers in the commit message — they are the baseline the follow-on work is measured against.

- [ ] **Step 3: Update the spec status**

In `docs/superpowers/specs/2026-08-03-cross-platform-illustrated-state-system-design.md`, change the `**Status:**` line to:

```markdown
**Status:** Implemented. System + high-traffic flows shipped. Deferred per §9:
the `Alert.alert` migration, the `ActivityIndicator` migration, the three lint
guardrails, and the profile / settings / wallet / onboarding / admin flows.
```

- [ ] **Step 4: Commit**

```bash
cd /Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder
git add docs/superpowers/specs/2026-08-03-cross-platform-illustrated-state-system-design.md
git commit -m "docs: mark the illustrated state system implemented"
```

---

## After this plan

Every high-traffic screen on both apps renders illustrated states, and the legacy web `EmptyState` is gone.

Still owed, and unchanged from spec §9 — these are the follow-on, not this plan:

- The `Alert.alert` call sites → `notify()` (baseline recorded in Task 12)
- The raw `ActivityIndicator` files → `BrandedLoader` or a skeleton
- The three lint guardrails (ban `Alert.alert`, ban raw `ActivityIndicator`, ban hex literals under `components/state/`), which can only be turned on once those counts reach zero
- Mobile: profile, settings, wallet, referrals, onboarding, auth, admin
- Web: every screen beyond the six migrated here
