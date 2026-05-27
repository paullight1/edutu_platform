# Web App Admin Footer Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible admin footer entry in `edutu-web-app` and harden the client-side admin gate.

**Architecture:** Use the existing `/admin/*` route inside `edutu-web-app`. Keep footer navigation public, then enforce access with shared admin access logic used by `AdminGuard`.

**Tech Stack:** React 18, Vite, React Router 6, Clerk, Supabase profile reads, Vitest.

---

### Task 1: Write Red Tests

**Files:**
- Create: `edutu-web-app/src/test/__tests__/admin-footer.test.tsx`
- Create: `edutu-web-app/src/test/__tests__/admin-access.test.ts`

- [ ] Add a test that renders `LandingPageV3` and expects an `Admin` link with `href="/admin"`.
- [ ] Add tests that import `isAdminAccessAllowed` from `src/lib/adminAccess` and verify role/email allow and normal-user deny behavior.
- [ ] Run `npm run test -- admin-footer admin-access`; expect failure because the link/helper are not implemented yet.

### Task 2: Implement Shared Admin Access Logic

**Files:**
- Create: `edutu-web-app/src/lib/adminAccess.ts`
- Modify: `edutu-web-app/src/components/AdminGuard.tsx`
- Modify: `edutu-web-app/src/hooks/useAdminCheck.ts`

- [ ] Implement `ADMIN_ROLES`, `getConfiguredAdminEmails`, and `isAdminAccessAllowed`.
- [ ] Update `AdminGuard` to call the shared helper and fetch the signed-in user's Supabase profile role as an additional controlled-role signal.
- [ ] Update `useAdminCheck` to use the same helper.

### Task 3: Add Footer Link

**Files:**
- Modify: `edutu-web-app/src/components/LandingPageV3.tsx`

- [ ] Add `Link to="/admin"` labelled `Admin` in the `Resources` footer column.
- [ ] Keep the link visible to all visitors.

### Task 4: Verify

**Files:**
- Read only unless verification exposes a defect.

- [ ] Run `npm run test -- admin-footer admin-access`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
