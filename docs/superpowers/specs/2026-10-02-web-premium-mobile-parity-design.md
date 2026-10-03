# Edutu web premium and mobile feature parity

Date: 2026-10-02
Status: Proposed design for user review; implementation has not started in this chat.

## Intended outcome

The user wants the mobile payment-related feature set available in the web app with complete UI, UX, and functionality, reusing the shared backend. The strongest paid value is personalized help applying to a specific opportunity. Opportunity discovery, official requirements, deadlines, and application links remain accessible. Older opportunities are not a premium selling point.

Scope includes premium CV templates and AI tailoring; text AI coach and paid voice; opportunity fit checks and next actions; personalized application roadmaps; Application Copilot kits, essay outlines, and feedback; documents supporting those actions; goals and saved-search alerts; plan access, credits, purchase completion, history, and management. Admin module access applies where configured.

## Existing work to retain

The current branch is `paul/web-mobile-features`. Substantial uncommitted backend and web implementation predates this request. Preserve it and extend the existing surfaces. The October 1 feature contracts and implementation documents describe coach, voice, CV, uploads, Copilot, goals, saved searches, access policy, and wallet code. Their historical verification results are not evidence for changes made under this request.

Current gaps observed in source:

- Opportunity details link to Coach and Copilot but lack the mobile contextual fit/next-action/roadmap experience.
- Web CV selection exposes the six designs without the mobile premium template selection flow.
- Existing access summaries report allowance but do not provide a consistent action-specific upgrade and recovery journey.
- The upgrade page still describes Coach and CV as mobile-only and advertises unlimited AI despite tier-specific backend daily allowances.
- Both consumer checkout and the legacy hosted checkout are deliberately stopped by the backend. The hosted payment shell expects exchange, account, and intent-status contracts absent from that backend.
- Independent web release switches exist; mobile admin module locks also need an explicit web mapping and backend authorization where a module is paid.

## Approaches considered

1. **Recommended: extend the existing web surfaces and shared backend.** Add opportunity actions, consistent paid access, and the missing hosted payment completion protocol. Reuse existing persistence, Clerk identities, tier limits, and metering. This preserves work already in progress and gives desktop and browser users a native experience.
2. Embed mobile web screens. This reduces initial UI work but adds competing navigation, authentication, and browser lifecycle behavior to the current web app.
3. Build separate web feature services. This creates duplicated account data, quotas, and payment fulfillment and conflicts with the shared-backend requirement.

## User experience

### Opportunity-specific AI

Add an application-help section to an opportunity detail with: `Am I a fit?`, `What should I do next?`, `Build my application plan`, `Prepare with Copilot`, and `Tailor my CV`. Fit actions can use an owned uploaded CV. Each action carries the opportunity ID and supported intent to the backend; the server retrieves the canonical opportunity and owned applicant data.

Show answers in an accessible panel with loading, cancellation, failure, and retry states. Preserve the thread and allow continuation in Coach. Navigation does not automatically send or charge for a question. Heavy generation begins only after the user's explicit action. Generated plans show dated milestones and document requirements and can be saved through the established plan/goal contracts. Checklist completion does not mark an application submitted.

Desktop uses the existing detail layout with a readable help panel. Phone layouts use stacked actions and a bottom sheet that leaves the official application action reachable. Buttons have visible focus, keyboard support, touch targets, and appropriate loading announcements.

### Paid access

Read tier, costs, remaining allowance, and reset time from `/monetization/access` and billing status. Use the backend's configured free allowance and credit costs; establish no new prices or quotas in this design.

Allow credit-funded AI where the existing policy permits it. Paid tiers use their actual daily allowance. Voice requires a paid tier. Distinguish insufficient credits, a daily plan cap, unavailable billing, and expired access. A top-up must not imply that it resets a paid plan's daily cap. Preserve input and drafts through an upgrade and let the user explicitly resume the action after access is confirmed.

Premium template previews remain visible. Selecting a paid design or using a paid CV tailoring entry point offers the contextual upgrade. Retain the mobile free-trial behavior only when the backend can establish the same eligibility and consumption; do not implement an independent browser-only trial grant. The server authorizes paid record operations, and browser locks are only the presentation of that policy.

Update upgrade and wallet copy to show web capabilities, actual Lite/Pro/Scholar allowances, total charge, duration, currency, and renewal mode. Remove unsupported unlimited and early-access claims. Shared account entitlements unlock the correct access on both platforms.

### Existing supporting pages

Retain and complete the existing coach, voice, structured CV editor, Copilot, documents, goals, and saved searches. Keep the preparation tools grouped in My Plan, alerts under Explore, and billing under Profile. Reuse the existing account-scoped draft recovery and revision-conflict handling.

Respect admin module access for AI Chat, CV Builder, Copilot, Goals & Roadmaps, and Saved-search Alerts when those locks are configured. A locked wallet must still provide a route to purchase or manage access so it cannot prevent recovery. Release availability and payment eligibility remain separate concepts.

## Architecture

All business calls go through the Clerk-authenticated NestJS backend at `backend/services/services/api`. Supabase and AI credentials remain server-side. Reuse the existing Coach stream protocol, metering interceptor, ownership checks, structured CV bridge, Copilot APIs, document transport, and plan/goal APIs. Preserve compatibility with mobile callers and raw/derived identity mappings already used by each service.

Use a shared web access-policy hook and contextual upgrade component across opportunity actions, CV, Copilot, and voice. The backend remains authoritative for pricing, charging, premium eligibility, and entitlement fulfillment. Do not automatically retry metered mutations or ambiguous checkout requests under a new identity. Continue existing read retry and checkout idempotency behavior.

Introduce additive backend contracts only for identified gaps: canonical premium template/access metadata, necessary owned premium-operation checks, and the hosted payment protocol. Do not bypass the existing payment release hold by deleting its guard.

## Payment completion

Complete the hosted shell's expected contract using short-lived single-use handoff codes and opaque sessions whose authority is bound to the authenticated billing principal. Store token hashes, expiry, and consumption state; reject replays and expired codes. Keep session secrets out of URLs and client storage. The shell's server uses its HTTP-only cookie when calling the canonical API.

Implement owned account and intent-status reads, provider management, and the consumer checkout path. Use server-owned catalog products and existing idempotency keys. Treat verified webhook fulfillment as purchase completion; a redirect or provider `paid` state alone cannot grant credits or premium access. Preserve purchase state on browser return and provide explicit pending, failed, cancelled, and completed feedback.

Enable the existing checkout gate only after the complete path can run with configured sandbox credentials and owner-scoped status checks. Implementation includes the protocol and sandbox verification support; live charges, production deployment, and changing real prices are separate release actions.

## Work packages

1. Shared feature access and premium template policy, with upgrade and recovery UI.
2. Opportunity-specific AI actions, owned CV context, and roadmap preparation integrated into existing detail/Coach/Copilot flows.
3. CV, Copilot, voice, and supporting page parity plus accurate upgrade messaging.
4. Hosted payment completion, wallet return recovery, and cross-platform entitlement confirmation.

Each package builds on the existing code and is independently verifiable. The full requested scope includes all four packages; package order does not remove later work from the request.

## Acceptance and verification

- A free signed-in user can browse an opportunity and use its permitted AI allowance; insufficient credits opens a relevant offer and preserves the original action.
- A paid user receives the correct Lite/Pro/Scholar allowance, and hitting a daily limit displays the reset rather than offering a misleading top-up.
- Opportunity fit and next-action requests include canonical opportunity context and only an owned uploaded CV. Opening the page cannot spend credits.
- A generated roadmap and Copilot kit can be reopened; essay outline/feedback preserves drafts and rejects stale cross-device writes.
- Premium CV selection and tailoring enforce the intended policy without losing the free CV or draft. All existing sections and supported exports remain usable.
- Voice handles microphone refusal, unavailable access, reservation expiry, end/navigation cleanup, and explicit continuation.
- Payment handoff rejects replay, expiry, wrong-owner reads, and tampered return destinations. Repeated provider events cannot grant twice. A successful browser return waits for canonical fulfillment before resuming a paid feature.
- Admin module locks do not block access management or imply a new daily allowance. Existing mobile contracts continue to work.
- Focused backend and component tests cover money, ownership, quota errors, stale revisions, and action recovery; web typecheck and production build pass. Browser checks cover opportunity actions, upgrade, CV, and wallet on desktop and phone widths using an available backend and test account.
- Report provider or credential limitations explicitly. Passing mock tests is not evidence that an external AI, voice, notification, or payment provider completed a real operation.

## Review decision

Approve or revise this proposed design before product implementation. Then write and review a task-level implementation plan using the Superpowers workflow. Reuse this session and the current checkout to preserve the existing uncommitted feature work.
