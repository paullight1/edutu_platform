# Edutu Mobile + Web App UX and Functionality Recommendations

Date: May 22, 2026

Scope reviewed:
- Mobile app: `edutumobile`
- Web app: `edutu-platform/edutu-web-app`

## Product Thesis

Edutu should feel less like a directory of opportunities and more like a learner operating system: discover the right opportunity, understand fit, prepare a credible application, track deadlines, and improve after each attempt.

The strongest organizing principle is learner lifecycle:

1. Discover
2. Decide
3. Prepare
4. Apply
5. Track
6. Grow

This is more coherent than the current mix of Home, Explore, Market, Roadmaps, Goals, Saved, Applied, CV, Creator, Wallet, and Profile as separate destinations.

## Highest Priority Recommendations

### 1. Make Navigation Persistent and Lifecycle-Based

Current issue:
- Mobile defines Home, Explore, Roadmaps, and Menu tabs, but the bottom nav only renders when `activeRoute === "home"` in `edutumobile/app/(app)/_layout.tsx`. Users lose the primary nav after tapping into Explore, Roadmaps, or Profile.
- Web uses Home, Explore, Market, More in `src/components/Navigation.tsx`, but `src/components/AppLayout.tsx` hides navigation on many important routes.
- Web dashboard also has its own sidebar and menu, creating competing navigation systems.

Recommendation:
- Use one persistent primary nav for top-level app areas.
- Suggested top-level nav:
  - Home
  - Discover
  - Plan
  - Track
  - Me
- Put CV, Saved, Applied, Deadlines, Settings, Wallet, Creator tools, and Help under contextual surfaces, not scattered as hidden standalone pages.

Suggested mapping:
- Discover: opportunities, filters, search, recommendations, saved discovery lists.
- Plan: roadmaps, goals, AI roadmap generation, weekly tasks.
- Track: deadlines, applications, reminders, documents, status history.
- Me: profile, personalization, CV, billing, settings, creator status.

Why:
- A learner can predict where features live.
- Web and mobile become easier to keep in parity.
- Saved and Applied stop feeling like secondary profile utilities; they become part of the application workflow.

### 2. Turn Opportunities Into an Application Workflow

Current issue:
- Opportunity cards are visually rich, but the next action is still mostly open/save/apply.
- Saved and Applied are separate lists, not a guided pipeline.
- Details do not yet feel like a decision cockpit.

Recommendation:
- Redesign opportunity detail around the decision a learner needs to make:
  - Fit score with specific reasons.
  - Eligibility checklist.
  - Required documents.
  - Deadline timeline.
  - Estimated preparation effort.
  - Similar past winners or creator roadmaps.
  - CTA sequence: Save, Build plan, Tailor CV, Track application, Apply externally.

Add statuses:
- Interested
- Preparing
- Applied
- Interviewing
- Accepted
- Rejected
- Archived

Why:
- Edutu becomes useful after the user finds an opportunity.
- This creates a natural loop between Discover, Plan, CV, AI chat, and Track.

### 3. Replace Stats-First Home With a Weekly Action Dashboard

Current issue:
- Mobile home leads with stat cards and quick actions.
- Web home includes stats, menus, feed items, promos, and sidebars.
- Both surfaces risk becoming dashboards about the app rather than dashboards for the learner's next action.

Recommendation:
- Make Home answer: "What should I do next this week?"
- Suggested sections:
  - Today: 1-3 urgent actions.
  - Upcoming deadlines.
  - Continue preparing: active roadmap/application.
  - Recommended opportunities because of profile fit.
  - Improve your profile/CV to unlock better matches.

Keep stats, but move them below action cards or into a Progress view.

Why:
- Students need prioritization more than analytics.
- This makes the AI and roadmap features feel practical, not ornamental.

### 4. Unify Roadmaps, Goals, and Marketplace

Current issue:
- Mobile has Roadmaps, Goals, Roadmap Templates, Creator Dashboard, and Marketplace-like creator flows.
- Web labels the marketplace as Market/Community while mobile labels a major tab Roadmaps.
- Existing docs already identify marketplace/community split as architecture debt.

Recommendation:
- Reposition these as one concept: Paths.
- A Path can be:
  - Edutu-generated AI plan.
  - Creator-verified roadmap.
  - User-created goal plan.
  - Opportunity-specific application plan.

UI model:
- `Discover > Opportunity > Build Path`
- `Plan > My Paths`
- `Plan > Explore Paths`
- `Me > Creator Studio`

Why:
- "Roadmap", "goal", "template", "marketplace item", and "community story" are currently internal distinctions. Learners care about a credible path to an outcome.

### 5. Make Edutu AI a Command Layer, Not a Separate Chat Room

Current issue:
- Mobile has a strong floating AI voice button.
- Web routes `/app/chat` back to home and does not expose the same command layer.
- Chat is valuable, but it should act on current context.

Recommendation:
- Add a cross-platform AI command pattern:
  - On opportunity detail: "Check my eligibility", "Build a plan", "Tailor my CV", "Explain why this fits me".
  - On CV: "Improve this bullet", "Match this CV to opportunity".
  - On Track: "What should I do before this deadline?"
  - On Home: "Plan my week".

For web, add a command palette or floating assistant button. For mobile, keep the voice button but add contextual prompt chips.

Why:
- AI becomes a productivity layer across the workflow instead of a destination users must remember to visit.

## Functionality and Architecture Risks Blocking Good UX

### 1. Client Apps Still Read Supabase Directly

Project instructions say clients should go through the NestJS backend, but both apps still perform direct Supabase reads/writes for important product data.

Examples:
- Mobile home, saved, applied, profile, roadmaps, creator dashboard.
- Web services for opportunities, bookmarks, applications, profile, admin, support, analytics.

Recommendation:
- Move user-specific business flows behind backend APIs:
  - bookmarks
  - applications
  - deadlines
  - profile preferences
  - roadmap enrollment
  - creator status
  - wallet/credits

Why:
- Easier authorization.
- Consistent business rules.
- Better auditability.
- Better web/mobile parity.
- Less duplicated client logic.

### 2. Profile and Personalization Need One Source of Truth

Current issue:
- There are traces of Clerk metadata, Supabase profiles, user preferences, onboarding state, and app-specific profile services.
- Existing docs already identify Clerk-to-Supabase sync as a critical gap.

Recommendation:
- Treat Supabase profile/preferences as the product source of truth after auth.
- Clerk should authenticate identity.
- Backend should expose `/profile`, `/profile/preferences`, and `/profile/completeness`.
- Both web and mobile should consume the same profile shape.

Why:
- Better recommendations depend on reliable profile data.
- Cross-device continuity depends on shared product state.

### 3. Remove Mock and Temporary Production Paths

Signals found:
- Web chat has mock fallback responses.
- Web analytics aggregator is mock.
- Web support tickets are mock.
- Web admin opportunities service still has mock implementations.
- Web package service includes hardcoded/sample package content.
- Mobile Explore has `TEMP_AD_BANNERS` and a "Sponsored" banner.
- Mobile header notification count is hardcoded.

Recommendation:
- Put all mock behavior behind explicit development flags.
- Production should show unavailable states or real data, not simulated success.
- Replace temporary banners with backend-configured campaigns or remove them.

Why:
- Mock success creates user trust problems.
- Ads/promos must be controllable, measurable, and removable without app releases.

### 4. Standardize API Configuration

Current issue:
- Mobile uses mixed defaults such as `http://localhost:3000` and `http://localhost:3001`.
- Roadmaps in mobile default to `3001`, while shared config defaults to `3000`.
- Web has `VITE_API_URL` and throws in production if missing, which is good, but client services still bypass the API in many places.

Recommendation:
- Create one environment contract:
  - Mobile: `EXPO_PUBLIC_API_URL`
  - Web: `VITE_API_URL`
  - Backend default dev port documented once.
- Block production builds if required API URL is missing.

Why:
- Misconfigured environments are a direct UX bug: blank screens, stale data, failed enrollments, and broken AI actions.

## UI Recommendations

### 1. Establish an Edutu-Native Design System

Current issue:
- Root `DESIGN.md` references a Webflow-inspired visual system.
- Actual apps use a mix of slate surfaces, purple/indigo gradients, rounded glass navigation, and card-heavy layouts.
- Mobile and web feel related but not fully aligned.

Recommendation:
- Define Edutu's own system:
  - Purpose: trustworthy, energetic, education-first.
  - Colors: reduce overuse of purple/indigo gradients; use color semantically for urgency, success, scholarship, career, document readiness.
  - Radius: use consistent radius tiers.
  - Cards: reserve cards for actual objects, not every section.
  - Typography: use tighter hierarchy on dashboards and dense utility screens.

Why:
- The product should feel credible enough for scholarships and career decisions, not like a generic AI productivity app.

### 2. Reduce Mobile Home Density

Current issue:
- Five quick actions are squeezed across the mobile width.
- Stat cards, opportunity grids, and quick actions compete for first-screen priority.

Recommendation:
- Use a 2-column quick action grid or a horizontal command strip.
- Promote only the next best action above the fold.
- Move rarely used actions into Me or command search.

### 3. Make Empty, Loading, and Error States Actionable

Current issue:
- Some failures only log to console.
- Empty states exist, but not all of them explain the next best action in the same lifecycle.

Recommendation:
- Every empty/error state should answer:
  - What happened?
  - Is my data safe?
  - What can I do next?
  - Can I retry?

Examples:
- Saved empty: suggest saving 3 opportunities to compare.
- Applied empty: suggest tracking the next external application.
- Roadmaps empty: offer AI-generated path from user goal.
- Deadlines empty: suggest adding deadline from saved opportunities.

## Feature Recommendations

### Quick Wins

1. Persist primary nav on all top-level mobile and web app routes.
2. Rename Market/Community/Roadmaps into one clearer taxonomy.
3. Replace hardcoded notification badges with real unread counts.
4. Remove temporary mobile sponsored banners or wire them to backend campaigns.
5. Add "compare" to saved opportunities.
6. Add application status editing on mobile, matching web behavior.
7. Add contextual AI chips on opportunity detail and CV screens.
8. Add "Profile match quality" card that tells users exactly what to complete next.

### Medium Bets

1. Application Workspace
   - Documents, CV, essays, references, tasks, external links, reminders, notes.

2. Opportunity Compare
   - Compare deadline, eligibility, award value, effort, location, fit, documents.

3. Weekly Plan
   - Auto-build a weekly schedule from active roadmaps, saved deadlines, and applications.

4. Creator Trust Layer
   - Proof, outcome, timeline, ratings, sample deliverables, refund/quality policy.

5. Recommendation Explanation System
   - "Why this match" with profile signals and missing data.

### Larger Product Bets

1. Edutu Readiness Score
   - A score per opportunity based on eligibility, documents, CV strength, deadline risk, and profile fit.

2. Guided Application Mode
   - Step-by-step application preparation with AI and human creator resources.

3. Regional Opportunity Intelligence
   - Country-aware scholarship availability, visa/eligibility notes, exam requirements, and local deadlines.

4. Mentor/Creator Hand-Off
   - If a learner is stuck, route them from AI guidance to a verified creator or mentor path.

## Recommended Implementation Order

### Phase 1: Trust and Coherence

- Make primary navigation persistent and consistent.
- Remove production mock/temporary paths.
- Fix hardcoded notification and sponsored content.
- Standardize API URL behavior.
- Document final IA labels.

### Phase 2: Lifecycle Workflow

- Redesign opportunity detail as a decision cockpit.
- Connect Saved, Applied, Deadlines, CV, and Roadmaps into one application pipeline.
- Add application status editing and notes on mobile.
- Add compare view for saved opportunities.

### Phase 3: Shared Backend Product API

- Move user-specific product flows from direct Supabase calls to backend APIs.
- Standardize profile and personalization source of truth.
- Add server-side recommendation/filtering endpoints.
- Add analytics events around lifecycle actions.

### Phase 4: AI and Creator Differentiation

- Add contextual AI commands across screens.
- Reposition roadmaps/goals/marketplace as Paths.
- Build creator trust signals.
- Add weekly planning and readiness scoring.

## Success Metrics

Track these before and after changes:

- Profile completion rate.
- Opportunity detail to save rate.
- Save to application-start rate.
- Application-start to applied-tracked rate.
- Deadline reminder opt-in rate.
- AI command usage by context.
- Roadmap/path adoption rate.
- CV tailoring usage per application.
- Return visits within 7 days of saving an opportunity.
- Percentage of active users with at least one tracked application.

## Bottom Line

Edutu already has many strong pieces: opportunities, roadmaps, AI, CV, saved items, applications, deadlines, creator flows, payments, and notifications. The biggest opportunity is not adding another standalone feature. It is connecting the existing pieces into a clear learner lifecycle so every screen helps the user move from discovery to a stronger application.
