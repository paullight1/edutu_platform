# Edutu: from opportunity discovery to meaningful progress

> **Superseded:** See the deeper [Edutu 2.0 product and architecture plan](./2026-09-28-edutu-v2-product-architecture.md) and its [home-screen concept](./2026-09-28-guidance-home-concept.html). This document is retained as the initial strategy draft.

**Status:** Product strategy draft, 28 September 2026  
**Primary audience assumption:** Students and early-career people who have a goal but are unsure which opportunity or preparation step matters next. Validate this segment with users before narrowing the whole product around it.

## Product decision

Make the central Edutu promise: **“Know your next step, and get help taking it.”** A good session should leave a person with one justified action and a way to complete or revise it. Discovery remains available, but a large feed is no longer the default answer to uncertainty.

The core loop is **Understand → Recommend → Decide → Prepare → Act → Record outcome → Adjust**. Edutu should never present a fit score as a probability of acceptance, invent eligibility certainty, or assert a numerical career readiness score without a validated model.

## What the repository shows today

| Existing asset | Evidence | Product implication |
| --- | --- | --- |
| Public landing page leads with “Your AI guide to global” opportunity types, matched opportunities, and “Get started free” | `edutu-web-app/src/components/LandingPageV3.tsx` | The first promise is discovery, while the proposed value is direction and execution. |
| Web onboarding asks about education, interests, and ambitions, then says the feed is personalized | `edutu-web-app/src/components/PersonalizationScreen.tsx` | Goal and preference capture exists; bottlenecks, time available, and what the person has already tried are not part of this first-run flow. |
| Web dashboard opens with category tiles, profile completion, and recommendation rails | `edutu-web-app/src/components/Dashboard.tsx` | The immediate visual hierarchy asks people to browse before it answers “what next?” |
| Web “My Plan” contains opportunity-specific tasks, progress, and a next step | `edutu-web-app/src/components/MyPlanPage.tsx`, `MyPlanDetailPage.tsx` | Execution exists, but it begins after selecting an opportunity; an empty plan sends users back to browsing. |
| Backend `opportunity-home` already returns intent, one next action, up to three active pursuits, and three default recommendations | `backend/services/services/api/src/opportunity-journeys/opportunity-home.service.ts` | Reuse this contract for the first decision-led home release. Confirm production data and client readiness before rollout. |
| Eligibility logic distinguishes eligible, likely, unclear, and ineligible | `backend/services/services/api/src/opportunity-journeys/opportunity-decision-support.ts` | Explain recommendations and uncertainty; do not silently turn missing data into rejection. |
| Admin funnel calls a bookmark or application “activation” | `backend/services/services/api/src/admin/admin.service.ts` | Add a progress metric that captures completed action, while preserving the old funnel for comparison. |
| Mobile has category discovery, ranked opportunity cards, plan components, and roadmaps | `edutumobile/app/(app)/index.tsx`, `edutumobile/components/opportunity-path/`, `edutumobile/components/roadmap/` | Treat mobile as a second surface of the same decision loop, with a shared backend contract. The mobile repo is a separate Git boundary. |

This is a code and documentation audit, not a live usability or production data audit. It establishes implementation opportunities, not measured user behavior.

## The proposed experience

1. **Arrival:** “Tell us what you want to move toward.” Offer concrete entry paths such as scholarship, first job, career change, or “I’m unsure.” Let visitors preview an example of Edutu’s advice before asking them to register.
2. **First run:** Ask for one goal, current stage, location or eligibility essentials, and the main blocker. Make time and constraints optional. Use saved profile fields to prefill; ask for more only when it changes the recommendation.
3. **First answer:** Show one recommended next action, a short reason, relevant evidence, and up to three options. Every option has “Pursue,” “Save for later,” or “Not relevant.” If eligibility is unclear, name the missing fact.
4. **Home:** Place **Your next step** first: task, due date if set, link to continue, and progress in the active pursuit. Put a small “Worth considering” shortlist underneath. Keep search, categories, community, and advanced tools accessible in navigation.
5. **Pursuit:** Connect fit explanation → application requirements → preparation tasks → official application link → status and follow-up → outcome. Permit “not ready yet” only when a verified requirement blocks the person; offer a useful preparation action and alternative. Never imply the user is unqualified from a weak model score alone.
6. **Return:** Resume an unfinished task, show a real change (deadline, completed step, new evidence, updated recommendation), and ask the user to confirm an outcome. Do not send generic reminders when there is no actionable change.

### Suggested home hierarchy

```text
Your next step                         [Continue]
Why this step / deadline / progress
Active pursuit: 1 primary, up to 2 secondary
Three options worth considering        [View reason]
Search and explore                     [Open all opportunities]
```

This uses progressive disclosure: common decisions are visible first, deeper browsing stays one tap away. The layout principle is supported by [Nielsen Norman Group's guidance on progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/); the exact hierarchy still needs testing with Edutu users.

## Prioritized roadmap

| Order | Workstream and owner surface | Deliverable | Release gate |
| --- | --- | --- | --- |
| **0: weeks 1–2** | Research and measurement: product, design, data | Interview 8–12 recent signups or target users across “unsure,” “choosing,” and “applying”; review current funnel cohorts; baseline signup, first pursuit, completed task, application confirmation, and D7 return. | Team can name the dominant first-session blocker and has a trustworthy baseline for each event. |
| **1: weeks 2–5** | Decision-led home: backend + web | Use `opportunity-home` on web; show next action and three explained choices above discovery; provide honest empty, loading, stale, and unclear-eligibility states. Add a route from the first answer to a plan. | A new user can reach a specific action, and a returning user can resume it, without searching the catalog. |
| **2: weeks 3–6** | Onboarding and public conversion: web | Rework landing message around direction, show a concrete sample outcome, use a single primary CTA (“Find my next step”), and streamline first-run questions to those needed for the initial answer. | Compare qualified signup and first-action rates against the current experience; no decline in users successfully reaching browsing. |
| **3: weeks 5–9** | Execution loop: backend + web + mobile | Show requirement checklist, attach tasks to a pursuit, record application opened/submitted, follow-up and outcome; bring the same next action to mobile home. | Users can complete and resume a pursuit across devices; application status does not depend only on an outbound click. |
| **4: weeks 9–12** | Learning and personalization: product + data | Collect dismiss reasons, missing evidence, and outcome feedback; tune shortlist quality and reminder timing; test goal-level plans only after opportunity pursuits work. | Recommendations improve against explicit feedback and completed actions, without increasing low-quality notifications. |

**Do not start with:** a new general AI chat surface, a large course catalog, a universal “career readiness %,” or fully automated rejection advice. Each adds complexity before the decision-to-action loop is proven.

## Measurement and experiments

**North star candidate:** **weekly users completing a meaningful next action tied to a declared goal.** Count distinct users, not clicks. A meaningful action is an independently recorded step such as completing a required preparation task, confirming an application submission, completing a portfolio milestone, or recording a follow-up. Verify important self-reported outcomes when possible. This candidate should be validated against D30 retention and real opportunities won.

**Funnel:** landing visit → qualified signup → goal captured → first answer seen → pursuit started → first required task completed → application submitted or alternate milestone reached → D7/D30 return. Segment by goal, new/returning, web/mobile, acquisition source, and eligibility confidence.

**Guardrails:** time to first useful answer, recommendation “not relevant” rate, unclear/ineligible advice errors, task abandonment, notification opt-outs, and accessibility issues. Track acceptance and rejections separately from self-reported activity. Do not equate more applications with success if match quality falls.

**Experiments:**

1. Current discovery-first dashboard vs. next-action-first dashboard. Primary measure: first meaningful action per new user within 7 days; guardrail: opportunity detail visits and D7 return.
2. “Get started free” vs. “Find my next step” landing CTA, with matching first-run copy. Primary measure: qualified signup that reaches a first answer, not raw button clicks.
3. Full existing onboarding vs. shorter goal + blocker intake with later progressive questions. Primary measure: first answer reached; guardrail: answer relevance and missing eligibility facts.

Run experiments only after event definitions and baseline quality are checked. Do not invent lift targets from absent analytics. [Baymard's form research](https://baymard.com/research-articles/checkout-flow-average-form-fields) supports reducing visible effort, but its checkout findings do not establish an Edutu conversion rate.

## Decisions to validate with users

- Which segment feels the strongest “I don’t know what to do next” tension: final-year students, recent graduates, scholarship seekers, or career switchers?
- Is the first useful outcome choosing an opportunity, receiving a credible plan, or completing a preparation task?
- What evidence makes a recommendation trustworthy, and when does “wait before applying” feel helpful versus discouraging?
- Which outcome can Edutu reliably observe rather than asking users to claim it?

The first release should be a narrow, measurable change to the home and first-run path. Broader career guidance follows evidence that this loop helps people make progress.
