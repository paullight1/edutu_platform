# Dashboard Onboarding Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a cleaner dashboard banner and Best Shots section, denser opportunity cards, and a skippable mascot-led onboarding quiz that saves through Edutu's existing profile APIs.

**Architecture:** Extract the existing personalization wizard into a reusable onboarding flow rendered by both the dashboard dialog and standalone route. Keep visibility/session dismissal in the dashboard, preserve the existing persistence services, and isolate carousel and card-density changes in their current components.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Lucide React, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-26-dashboard-onboarding-refresh-design.md`

## Global Constraints

- Target only `edutu-web-app` plus its design/plan documentation.
- Keep all durable profile writes behind the NestJS backend and existing Clerk metadata mirror; do not add browser-to-Supabase writes.
- Keep onboarding skippable and session-dismissed until the profile reaches the existing score threshold of 60.
- Preserve keyboard, screen-reader, reduced-motion, dark-mode, mobile, desktop, and Capacitor behavior.
- Do not modify unrelated landing-page changes already present in the worktree.

---

### Task 1: Reusable Onboarding Flow

**Files:**
- Create: `edutu-web-app/src/components/onboarding/OnboardingFlow.tsx`
- Create: `edutu-web-app/src/components/onboarding/onboardingOptions.ts`
- Modify: `edutu-web-app/src/components/PersonalizationScreen.tsx`
- Test: `edutu-web-app/src/components/onboarding/OnboardingFlow.test.tsx`

**Interfaces:**
- Produces: `OnboardingFlow({ presentation, showWelcome, onComplete, onDismiss })`, where `presentation` is `"modal" | "page"`, `onComplete` runs after successful persistence, and `onDismiss` is optional.
- Consumes: `usePersonalization`, `useAuth`, Clerk `getToken`, `saveOnboardingProfile`, `updateBackendProfile`, and `syncOpportunityPreferences`.

- [ ] **Step 1: Write failing interaction tests**

Cover welcome-to-quiz transition, next/back answer preservation, final interest-or-goal validation, successful completion callback, and failed-save answer preservation.

- [ ] **Step 2: Run focused test to verify failure**

Run: `npm test -- --run src/components/onboarding/OnboardingFlow.test.tsx`
Expected: FAIL because `OnboardingFlow` does not exist.

- [ ] **Step 3: Extract options and implement the shared flow**

Move the existing interest, goal, education, experience, destination, and step configuration into `onboardingOptions.ts`. Move the existing form state, validation, fields, and save orchestration into `OnboardingFlow.tsx`; add the mascot welcome state, four-dot progress, responsive scrolling, safe-area footer, and error-preserving save behavior.

- [ ] **Step 4: Make the standalone route a thin page wrapper**

Render `OnboardingFlow` with `presentation="page"`; navigate to `/dashboard` after completion or skip.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- --run src/components/onboarding/OnboardingFlow.test.tsx`
Expected: PASS.

### Task 2: Dashboard First-Run Modal

**Files:**
- Modify: `edutu-web-app/src/components/dashboard/ProfileCompletionPrompt.tsx`
- Modify: `edutu-web-app/src/components/dashboard/ProfileCompletionPrompt.test.tsx`
- Modify: `edutu-web-app/src/components/Dashboard.tsx`

**Interfaces:**
- Consumes: `OnboardingFlow` from Task 1.
- Produces: `ProfileCompletionPrompt({ open, userName, onComplete, onDismiss })`; `onComplete` closes the modal and triggers dashboard profile/personalization refresh.

- [ ] **Step 1: Update prompt tests to describe the embedded quiz**

Assert that the mascot welcome is shown, "Maybe later" dismisses, "Personalize my feed" enters step one without navigation, and successful completion calls the dashboard callback.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- --run src/components/dashboard/ProfileCompletionPrompt.test.tsx`
Expected: FAIL because the prompt still navigates to `/app/personalization`.

- [ ] **Step 3: Embed the shared onboarding flow**

Replace the static marketing prompt with `OnboardingFlow presentation="modal" showWelcome`; keep existing dialog focus behavior and session dismissal semantics.

- [ ] **Step 4: Wire completion into Dashboard**

Remove `startProfileCompletion` navigation for the automatic prompt. Close the prompt on completion, refresh the available completeness/personalization data, and expose a compact reopen action from the Best Shots empty state.

- [ ] **Step 5: Run prompt and state tests**

Run: `npm test -- --run src/components/dashboard/ProfileCompletionPrompt.test.tsx`
Expected: PASS.

### Task 3: Banner Simplification

**Files:**
- Modify: `edutu-web-app/public/advertising/dashboard-launch-mobile.png`
- Modify: `edutu-web-app/src/components/Dashboard.tsx`
- Test: `edutu-web-app/src/components/dashboard/BannerCarousel.test.tsx`

**Interfaces:**
- Produces: a banner carousel with HTML copy, no CTA pill, centered pagination dots, and an isolated next-slide arrow.

- [ ] **Step 1: Add failing carousel behavior tests**

Assert CTA copy is absent, dots report the active slide, and clicking "Next promotion" changes slides without activating the promotion link.

- [ ] **Step 2: Run focused test to verify failure**

Run: `npm test -- --run src/components/dashboard/BannerCarousel.test.tsx`
Expected: FAIL because CTA pills still render and no next control exists.

- [ ] **Step 3: Clean the banner asset**

Edit the existing 1200-by-300 launch creative to remove floating square/pill feature icons while preserving the phone, learners, navy/gold atmosphere, and empty copy area.

- [ ] **Step 4: Refactor carousel controls**

Remove CTA rendering, move dots to bottom center, add a 40-pixel right-edge chevron button with `aria-label="Next promotion"`, stop event propagation/default navigation from the chevron, and preserve pause/reduced-motion behavior.

- [ ] **Step 5: Run carousel tests**

Run: `npm test -- --run src/components/dashboard/BannerCarousel.test.tsx`
Expected: PASS.

### Task 4: Best Shots and Opportunity Density

**Files:**
- Modify: `edutu-web-app/src/components/Dashboard.tsx`
- Modify: `edutu-web-app/src/components/dashboard/DashboardOpportunityCard.tsx`
- Test: `edutu-web-app/src/components/dashboard/DashboardOpportunityCard.test.tsx`

**Interfaces:**
- Produces: single-surface Best Shots empty state and compact card variants with unchanged opportunity click behavior.

- [ ] **Step 1: Add failing card-density tests**

Assert desktop grid, mobile carousel, and mobile grid variants retain essential title/category/deadline content while using the new compact layout markers/classes.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- --run src/components/dashboard/DashboardOpportunityCard.test.tsx`
Expected: FAIL against the current dimensions.

- [ ] **Step 3: Remove the nested Best Shots border**

Render empty copy directly inside the section surface and use a small arrow text action to reopen onboarding when the prompt is closed.

- [ ] **Step 4: Compact card variants**

Reduce desktop grid minimum height to about 216 pixels and media height to about 104 pixels; reduce mobile carousel height to about 168 pixels and narrow-grid media/padding proportionally. Preserve focus rings, image fallbacks, truncation, urgency, and match cues.

- [ ] **Step 5: Run card tests**

Run: `npm test -- --run src/components/dashboard/DashboardOpportunityCard.test.tsx`
Expected: PASS.

### Task 5: Integrated Verification

**Files:**
- Modify only files required to fix defects exposed by verification.

- [ ] **Step 1: Run focused dashboard tests**

Run: `npm test -- --run src/components/onboarding/OnboardingFlow.test.tsx src/components/dashboard/ProfileCompletionPrompt.test.tsx src/components/dashboard/BannerCarousel.test.tsx src/components/dashboard/DashboardOpportunityCard.test.tsx`
Expected: PASS.

- [ ] **Step 2: Run TypeScript**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: exit 0 with Vite output generated.

- [ ] **Step 4: Verify in a browser**

Check desktop and mobile viewports for banner dots/arrow, one-border Best Shots, modal scrolling and focus, saved onboarding completion, compact cards, dark mode, and reduced motion.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check` and `git status --short`. Confirm no unrelated user files were overwritten and report any remaining external verification gap.
