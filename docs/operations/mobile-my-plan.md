# Mobile My Plan

Groups has been replaced by My Plan in `edutumobile`. The tab uses the canonical Nest journey API by default. The old Plan tab is labelled Goals. Social screens redirect to My Plan and the native community calling bootstrap is disabled.

## Deployment order

1. Apply only the two new migrations through the backend's normal database deployment process, in this order:
   - `backend/services/services/api/supabase/migrations/20260902090000_opportunity_journey_pipeline.sql`
   - `backend/services/services/api/supabase/migrations/20260903090000_opportunity_journey_event_immutability.sql`
2. Deploy the Nest API with `OpportunityJourneysModule` registered in `AppModule`.
3. Release the updated `edutumobile` build after verifying the authenticated `/me/opportunity-journeys?stage=pursuing` endpoint.

These migrations create four API-owned tables; RLS is enabled and direct mobile/web database access is revoked. All journey operations use Clerk-authenticated backend routes. No production migrations or deployment were performed during implementation.

Existing bookmarks and applications are imported for each account when its plan is read. Imports are idempotent. Newer forward status changes from the existing Applications screen also reconcile into the plan; older records cannot rewind a journey or overwrite a decided outcome. Legacy draft applications enter Shortlist so pursuing them creates the full preparation checklist. Old mobile records specifically marked as a submit merely because the website opened require submission confirmation. Genuine historical submission and outcome dates are retained.

New journey updates also project into the existing bookmark/application tables so Applications and Deadlines can see them. Application status values use the deployed table's vocabulary (`submitted`, `interview`, `offer`, etc.). Projection errors are surfaced; retrying the same journey request does not duplicate the canonical mutation. PostgreSQL uniqueness prevents duplicate projected applications.

## User flow

From opportunity details, choose Start pursuing or Add to shortlist. Open a plan card to complete or reopen preparation tasks. Completing required tasks makes the application link available. Opening the link records only that event; Confirm submission requires an explicit confirmation. Already submitted supports users who completed their application outside Edutu. Submitted applications can progress to Interview, Offer, Not selected, No response, or Withdrawn; closed records can be archived.

The backend owns progress, next actions, eligibility checks, and the three-active-pursuit limit. Generic transitions cannot bypass activation or submission confirmation. Required tasks cannot be skipped, and task edits cannot rewind an opened/submitted/closed application. Writes use optimistic versions and stable retry keys. After a conflict, refresh before making another change.

My Plan reads one stage at a time; the backend batches tasks and selects compact opportunity summaries for the list. Offline snapshots are account-scoped and labelled; offline detail writes are disabled. Failed writes are never presented as successful or silently queued.

## Verification

The `opportunity-plan.e2e.spec.ts` test runs real HTTP routes through the domain service and PostgreSQL (PGlite), with test authentication. It covers shortlisting, activation, task completion, retries, opening without submission, explicit confirmation, interview and offer, legacy projections, reload, and account isolation. It reproduces the deployed legacy status constraint and identity mapping.

Run the focused checks from the relevant package:

- Backend: `npm test -- --runInBand --testTimeout=60000 --testPathPatterns='opportunity-journey|opportunity-plan|opportunity-intent|opportunity-home|opportunity-shortlist|opportunity-next-action|opportunity-effort|opportunity-decision-support'`
- Backend production types: `npx tsc --noEmit -p tsconfig.build.json`
- Mobile: `npm test -- --runInBand myPlanActions.test.tsx myPlanScreen.test.tsx myPlanJourney.test.ts`
- Mobile types: `npm run typecheck`

Before a release, verify one signed-in account on a device through checklist → external browser → submission confirmation → result. Automated tests do not exercise the real Clerk sign-in flow or an external provider's application form.
