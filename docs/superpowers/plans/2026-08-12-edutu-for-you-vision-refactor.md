# Edutu For You Vision Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reframe the Edutu For You page as an emotionally persuasive impact campaign that clearly explains the learner journey, promotes the real product capabilities, and converts both young people and partners without overstating composite stories.

**Architecture:** Keep the existing React/Vite page and backend story API. Centralize campaign copy, feature actions, timeline content, and sourced statistics in `src/lib/edutuForYou.ts`; keep page composition in `EdutuForYouPage.tsx`; keep story-specific trust presentation in `StoryCard.tsx`. Use the existing routes for actions and avoid introducing a new backend contract.

**Tech Stack:** React, TypeScript, React Router, Tailwind utilities, Framer Motion, Vitest, Testing Library.

## Global Constraints

- Preserve Edutu’s existing indigo/navy visual system and theme tokens.
- Make the hero image visible in the stacking context; content must remain readable over it.
- Composite stories must be visibly labelled on every story card.
- Do not present composite stories as verified outcomes.
- Every promoted product capability must have a benefit, proof-oriented explanation, and honest CTA.
- Keep the page usable at 375px, 768px, and 1440px.
- Respect reduced-motion behavior already used by the page.
- Use test-first changes for new behavior and run the narrowest relevant test after each behavior change.

---

### Task 1: Add failing campaign acceptance tests

**Files:**
- Modify: `edutu-web-app/src/test/__tests__/edutuForYou.test.tsx`

**Interfaces:**
- Consumes: existing `EdutuForYouPage`, `STORIES`, `PILLARS`, and `PROGRAM_TIMELINE` exports.
- Produces: executable expectations for the new hero, journey, timeline, and story-disclosure behavior.

- [ ] **Step 1: Replace the old all-nine-immediately-visible expectation with progressive story expectations**

Assert that the page initially renders three story cards, each card exposes `Illustrative composite`, and an explicit reveal control exposes the remaining stories.

- [ ] **Step 2: Add a failing hero conversion test**

Assert that the hero contains:

```tsx
screen.getByRole("link", { name: /help open the next door/i });
screen.getByRole("link", { name: /find my opportunities/i });
```

- [ ] **Step 3: Add a failing feature-promotion test**

Assert that the page exposes links named `Find my matches`, `Build my application`, `Meet the community`, and `Browse opportunities`, with their intended routes.

- [ ] **Step 4: Add a failing timeline test**

Assert that `A year in the program`, `Month 1`, `Months 2–3`, `Months 4–6`, `Months 7–9`, and `Months 10–12` are rendered.

- [ ] **Step 5: Run the focused test and verify the expected failures**

Run:

```bash
cd edutu-web-app && npm test -- --run src/test/__tests__/edutuForYou.test.tsx
```

Expected: failures for the new hero labels, feature links, timeline, and progressive story behavior because the current implementation does not provide them.

---

### Task 2: Refactor the campaign content model and copy

**Files:**
- Modify: `edutu-web-app/src/lib/edutuForYou.ts`

**Interfaces:**
- Consumes: existing `PILLARS`, `GAP_STATS`, and campaign constants.
- Produces: `PROGRAM_TIMELINE`, feature CTA metadata, revised hero copy, source links, and corrected impact framing.

- [ ] **Step 1: Add source URLs and correct the employment wording**

Extend `GapStat` with an optional `sourceHref`. Keep source labels visible. Replace the ambiguous `1 in 3` claim with wording that matches the AfDB source, such as `2 in 3` non-student youth being unemployed, discouraged, or marginally employed.

- [ ] **Step 2: Add honest feature action metadata**

Extend `Pillar` with `ctaLabel` and `ctaPath`. Use:

```ts
{ ctaLabel: "Find my matches", ctaPath: "/signup" }
{ ctaLabel: "Build my application", ctaPath: "/signup" }
{ ctaLabel: "Meet the community", ctaPath: "/community" }
{ ctaLabel: "Browse opportunities", ctaPath: "/opportunities" }
```

- [ ] **Step 3: Add the program timeline**

Create a typed `PROGRAM_TIMELINE` constant with five stages covering profile, application preparation, submission, mentorship/iteration, and outcomes/pay-it-forward.

- [ ] **Step 4: Rewrite the hero and join copy around capability and access**

Use emotionally specific, plain language. Avoid leading with “underprivileged” and “AI infrastructure”; retain the mission in supporting copy and FAQ/context where it is useful.

- [ ] **Step 5: Run typecheck to catch model consumers that need updates**

Run:

```bash
cd edutu-web-app && npm run typecheck
```

Expected: any new required field errors identify the exact render sites to update in Task 3.

---

### Task 3: Recompose the page around the learner journey

**Files:**
- Modify: `edutu-web-app/src/components/EdutuForYouPage.tsx`

**Interfaces:**
- Consumes: revised campaign constants, `PILLARS`, `PROGRAM_TIMELINE`, and the existing story API.
- Produces: image-led hero, emotional narrative beat, feature CTAs, and timeline section.

- [ ] **Step 1: Add the failing implementation target for the visible hero image**

Keep the hero image in the DOM but move it to a visible stacking layer (`z-0`) with the scrim above it and content at `z-20`. Do not use a negative z-index behind the section background.

- [ ] **Step 2: Replace equal-weight hero CTAs**

Use the partner action as the primary campaign CTA (`Help open the next door`) and a clearly beneficiary-oriented secondary CTA (`Find my opportunities`) linking to `/signup`.

- [ ] **Step 3: Add the emotional narrative beat below the hero**

Introduce a short, clearly labelled composite situation before the statistical gap section. Use the existing Aisha narrative without presenting it as a verified Edutu outcome.

- [ ] **Step 4: Add feature CTAs to each pillar**

Render the CTA from `pillar.ctaLabel` and `pillar.ctaPath`. Keep the descriptions focused on user outcomes rather than system capabilities.

- [ ] **Step 5: Render the `A year in the program` timeline**

Use a responsive five-stage layout: horizontal on desktop, stacked on mobile. Include the month label, stage title, and one-sentence outcome for each stage.

- [ ] **Step 6: Add conversion prompts at the journey transitions**

Keep one CTA after the feature journey, one after the timeline, and the partner CTA. Avoid adding new duplicate mailto destinations with unrelated labels.

- [ ] **Step 7: Run the focused tests and verify they still fail only for story-card behavior**

Run the feature test file after the page changes. Expected: hero, feature, and timeline assertions pass; story progressive-disclosure assertions remain red until Task 4.

---

### Task 4: Make story trust and progressive disclosure explicit

**Files:**
- Modify: `edutu-web-app/src/components/edutu-for-you/StoryCard.tsx`
- Modify: `edutu-web-app/src/components/EdutuForYouPage.tsx`
- Modify: `edutu-web-app/src/test/__tests__/edutuForYou.test.tsx`

**Interfaces:**
- Consumes: `Story.isComposite`, existing story routes, and the seed/API story list.
- Produces: per-card composite labels and a three-card default with an accessible “show more” control.

- [ ] **Step 1: Add the visible per-card disclosure**

Render `Illustrative composite` on every composite card. Use the actual outcome label only when `story.isComposite === false`.

- [ ] **Step 2: Add progressive story state**

Initialize `showAllStories` to `false`, render the first three stories by default, and reveal the rest from an accessible button. Keep the section attribution line while any displayed story is composite.

- [ ] **Step 3: Test the reveal behavior**

Assert that three cards are visible initially, clicking `See more situations we design for` reveals all seeded stories, and every visible composite card carries the disclosure.

- [ ] **Step 4: Run the focused test suite**

Run:

```bash
cd edutu-web-app && npm test -- --run src/test/__tests__/edutuForYou.test.tsx
```

Expected: all Edutu For You tests pass.

---

### Task 5: Verify the refactor and browser behavior

**Files:**
- Modify only files required by the previous tasks.

- [ ] **Step 1: Run tests, typecheck, and lint**

```bash
cd edutu-web-app
npm test -- --run src/test/__tests__/edutuForYou.test.tsx
npm run typecheck
npm run lint
```

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

Confirm the SEO generation and route-meta injection complete without errors.

- [ ] **Step 3: Perform browser verification**

Check `/edutuforyou` at 375px, 768px, and 1440px for:

- visible hero image and readable scrim
- no horizontal overflow
- primary and secondary CTA visibility
- feature CTA destinations
- timeline stacking
- composite labels on cards
- reveal button behavior
- no broken images

- [ ] **Step 4: Inspect the final diff**

Run `git diff --check` and confirm unrelated dirty-worktree changes were not modified.

