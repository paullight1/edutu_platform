# Mobile Product Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver compact, pixel-precise mobile Opportunities, Communities, and Settings experiences while preserving current behavior and desktop layouts.

**Architecture:** Responsive behavior remains owned by the existing React components and Tailwind classes. Shared bottom-sheet primitives live beside the feature that consumes them, while current services, hooks, routes, and desktop markup remain intact.

**Tech Stack:** React 18, TypeScript, React Router, Tailwind CSS 3, Vitest, Testing Library, Vite.

**Spec:** `docs/superpowers/specs/2026-08-27-mobile-product-surfaces-design.md`

## Global Constraints

- Mobile gutter: 16px at 320–390px; 20px from 412px.
- Header and bottom navigation: 64px plus the relevant safe-area inset.
- All touch targets: minimum 44×44px.
- Mobile vertical rhythm: 4, 8, 12, 16, 24, 32px.
- Preserve desktop layouts, routes, data flow, dark mode, and focus states.
- Do not add dependencies or a new global override layer.

---

### Task 1: Responsive Opportunities structure

**Files:**
- Modify: `edutu-web-app/src/components/OpportunitiesPage.tsx`
- Modify: `edutu-web-app/src/components/OpportunitiesPageLegacy.tsx`
- Modify: `edutu-web-app/src/components/PublicOpportunitiesArchivePage.tsx`
- Create: `edutu-web-app/src/test/__tests__/opportunitiesMobileLayout.test.tsx`

**Interfaces:**
- Consumes: existing `Opportunity`, filtering, bookmark, search, sort, and pagination behavior.
- Produces: component-owned `MobileFilterSheet` and responsive `OpportunityCard`/public row markup.

- [ ] **Step 1: Write a failing source/component contract test**

```ts
expect(opportunitiesEntrySource).not.toContain("createPortal");
expect(opportunitiesEntrySource).not.toContain("!important");
expect(screen.getByRole("button", { name: /more opportunity filters/i })).toBeInTheDocument();
expect(screen.getByRole("dialog", { name: /opportunity filters/i })).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/test/__tests__/opportunitiesMobileLayout.test.tsx`

- [ ] **Step 3: Remove the wrapper override and implement responsive controls/cards**

```tsx
export default function OpportunitiesPage(props: OpportunitiesPageProps) {
  return <OpportunitiesPageLegacy {...props} />;
}
```

Use `sm:hidden` list-row markup and `hidden sm:flex` card markup in each opportunity component. Keep the search wrapper sticky only on mobile with `top-[calc(4rem+env(safe-area-inset-top))]`.

- [ ] **Step 4: Implement public mobile filters and rows while retaining desktop cards**

Use buttons for All, Scholarships, Internships, Fellowships, and More; route-backed category links remain links. Render the remaining public categories in an accessible bottom sheet.

- [ ] **Step 5: Run the focused test**

Run: `npm test -- --run src/test/__tests__/opportunitiesMobileLayout.test.tsx`

### Task 2: Public and authenticated Community hierarchy

**Files:**
- Modify: `edutu-web-app/src/features/community/CommunityLandingPage.tsx`
- Modify: `edutu-web-app/src/features/community/components/CommunityProductShell.tsx`
- Modify: `edutu-web-app/src/features/community/CommunityExplorePage.tsx`
- Modify: `edutu-web-app/src/features/community/components/GroupCard.tsx`
- Modify: `edutu-web-app/src/features/community/CommunityGroupsPage.tsx`
- Modify: `edutu-web-app/src/test/__tests__/communitySeo.test.tsx`
- Modify: `edutu-web-app/src/test/__tests__/communityProductShell.test.tsx`

**Interfaces:**
- Consumes: existing group API results, workspace header, and community routes.
- Produces: compact public previews, visible page heading, text segments, and flat mobile rows.

- [ ] **Step 1: Add failing assertions for hierarchy and mobile semantics**

```ts
expect(screen.getByRole("heading", { name: "Find people working toward the same opportunity." })).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "Explore communities" })).not.toHaveClass("sr-only");
expect(screen.getByRole("tablist", { name: "Community focus" })).toBeInTheDocument();
```

- [ ] **Step 2: Run focused community tests and verify failure**

Run: `npm test -- --run src/test/__tests__/communitySeo.test.tsx src/test/__tests__/communityProductShell.test.tsx`

- [ ] **Step 3: Implement the approved public hero and first-viewport previews**

Move a two-item `groups.slice(0, 2)` preview directly into the mobile hero, hide the decorative mock conversation below `lg`, and retain the full lower grid for desktop/all groups.

- [ ] **Step 4: Restore mobile page title and flatten authenticated controls**

Render a real visible `<h1>` in the mobile product shell. Use `role="tablist"` and `role="tab"` for the focus selector. Add responsive classes to `GroupCard` so mobile uses border-bottom rows and tablet/desktop uses cards.

- [ ] **Step 5: Simplify group section headings and run tests**

Render headings as `${label} ${rows.length}` and omit mobile eyebrow/body repetition. Re-run the focused tests from Step 2.

### Task 3: Community destructive action sheet

**Files:**
- Create: `edutu-web-app/src/features/community/components/CommunityActionSheet.tsx`
- Modify: `edutu-web-app/src/features/community/CommunityGroupsPage.tsx`
- Modify: `edutu-web-app/src/features/community/CommunityChatsPage.tsx`
- Modify: `edutu-web-app/src/features/community/CommunityGroupPage.tsx`
- Modify: `edutu-web-app/src/features/community/CommunityGroupSettingsPage.tsx`
- Create: `edutu-web-app/src/test/__tests__/CommunityActionSheet.test.tsx`

**Interfaces:**
- Produces: `CommunityActionSheet({ open, title, description, confirmLabel, busy?, onConfirm, onClose })`.
- Consumes: unchanged async destructive action callbacks.

- [ ] **Step 1: Write failing action-sheet interaction tests**

```ts
render(<CommunityActionSheet open title="Leave community" description="You may need a new invitation." confirmLabel="Leave" onClose={onClose} onConfirm={onConfirm} />);
await user.click(screen.getByRole("button", { name: "Leave" }));
expect(onConfirm).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- --run src/test/__tests__/CommunityActionSheet.test.tsx`

- [ ] **Step 3: Implement the accessible sheet**

The fixed overlay contains one `role="dialog"`, sticky heading, scrollable description body, and fixed two-action footer. Escape/backdrop closes only while not busy.

- [ ] **Step 4: Replace community `window.confirm` call sites with pending-action state**

Each screen stores the destructive target, opens the shared sheet, and invokes the current async callback only from `onConfirm`.

- [ ] **Step 5: Verify no community native confirmations remain**

Run: `rg -n "window\\.confirm|confirm\\(" edutu-web-app/src/features/community`

Expected: no matches.

### Task 4: Native grouped Settings

**Files:**
- Modify: `edutu-web-app/src/components/SettingsPage.tsx`
- Modify: `edutu-web-app/src/components/AppearanceSettings.tsx`
- Modify: `edutu-web-app/src/components/WebPushSettings.tsx`
- Modify: `edutu-web-app/src/components/ReminderSettings.tsx`
- Modify: `edutu-web-app/src/components/MemberSettingsPanel.tsx`
- Modify: `edutu-web-app/src/test/__tests__/MemberSettingsPanel.test.tsx`
- Create: `edutu-web-app/src/test/__tests__/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: existing theme, push, reminders, privacy, Clerk security/session, export, and deletion behavior.
- Produces: grouped list components/rows, full-row toggles, and labeled sheet forms.

- [ ] **Step 1: Write failing grouped-list and form-label tests**

```ts
expect(screen.getByRole("heading", { name: "Preferences" })).toBeInTheDocument();
expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
expect(screen.getByLabelText("Current password")).toBeInTheDocument();
expect(screen.getByLabelText("New password")).toBeInTheDocument();
```

- [ ] **Step 2: Run focused settings tests and verify failure**

Run: `npm test -- --run src/test/__tests__/MemberSettingsPanel.test.tsx src/test/__tests__/SettingsPage.test.tsx`

- [ ] **Step 3: Recompose settings into the five approved groups**

Remove per-control shadow cards. Render section labels outside a single `overflow-hidden rounded-2xl border` list. Pass compact row rendering or extracted controls from Appearance, WebPush, and Reminder components.

- [ ] **Step 4: Make rows tappable and sheets structurally fixed**

Use 44px-minimum row buttons. Update `SheetShell` to `grid grid-rows-[auto_minmax(0,1fr)_auto]`, with sticky heading and scrollable body. Add explicit labels for all password/deletion fields.

- [ ] **Step 5: Run focused settings tests**

Run the command from Step 2 and confirm zero failures.

### Task 5: Full verification and viewport review

**Files:**
- Modify only if verification reveals a scoped defect.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified production build and responsive mobile behavior.

- [ ] **Step 1: Run all targeted tests**

Run: `npm test -- --run src/test/__tests__/opportunitiesMobileLayout.test.tsx src/test/__tests__/communitySeo.test.tsx src/test/__tests__/communityProductShell.test.tsx src/test/__tests__/CommunityActionSheet.test.tsx src/test/__tests__/MemberSettingsPanel.test.tsx src/test/__tests__/SettingsPage.test.tsx`

- [ ] **Step 2: Run TypeScript**

Run: `npm run typecheck`

- [ ] **Step 3: Run production build**

Run: `npm run build`

- [ ] **Step 4: Inspect at 320, 390, and 412px**

Verify header/safe-area spacing, no horizontal clipping, 44px actions, first opportunity/public preview visibility, sticky search behavior, sheet title/body/actions, and both light/dark modes.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check && git status --short`

Confirm only scoped files plus pre-existing user changes are present.
