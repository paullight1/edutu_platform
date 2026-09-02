# Edutu Intentional Opportunity Pipeline Contract

## Product promise

Edutu helps a learner choose an opportunity worth pursuing and guides the
learner through one next action until an application is explicitly confirmed
and its outcome is recorded.

## Scope of the programme

The implementation spans:

- `backend/services/services/api` — business rules and authenticated writes
- `edutu-web-app` — web/PWA learner experience
- `edutumobile` — Expo learner experience
- `admin` — staged rollout controls and operational reporting
- `backend/services/services/api/supabase/migrations` — canonical shared schema

`paullight1/edutuMOBILEAPP` and `my-edutu/Edutu_Mobile` are not implementation
targets for this programme unless a separate release-source reconciliation
proves that either repository has replaced `edutumobile`.

## UI-conservative rule

The opportunity pipeline is a functional integration, not a visual redesign.

Implementation must preserve the current:

- Edutu logo and palette
- typography and icon systems
- web workspace shell and semantic surface classes
- mobile themes and `useTheme()` tokens
- card, badge, button, dialog, loading, empty, and error patterns
- mobile bottom-navigation animation
- web sidebar interaction

Concept mockups define information hierarchy only:

1. Current focus
2. One next action
3. Active pursuits
4. Three focused recommendations
5. General exploration

## User-facing stages

| Stage | Meaning |
| --- | --- |
| Discover | The learner is considering or has shortlisted an opportunity |
| Pursuing | The learner has committed and is preparing or ready to apply |
| Applied | The learner explicitly confirmed submission or reached interview |
| Outcome | The opportunity ended in offer, rejection, withdrawal, no response, expiry, or archive |

## Truthful application contract

Opening an external application link never marks an application as submitted.

The product records two distinct facts:

1. `application_opened`
2. `application_confirmed`

Only an explicit learner action such as **Yes, I submitted it** moves the
journey into Applied. **Not yet** keeps it in Pursuing. **I decided not to
continue** closes it through the withdrawal flow.

## Intentionality limits

- Three focused recommendations by default
- Five focused recommendations maximum
- One primary active pursuit
- Two secondary active pursuits
- One backend-calculated next action for every active pursuit

The full catalogue remains available in Explore.

## Current intent

Current intent is separate from the long-term profile. It can be inferred from
existing preferences, profile information, active goals, searches, and category
signals. An inferred intent is non-blocking and always editable. Explicit
learner choices override inference.

## Architecture rules

- New opportunity-journey writes go through the NestJS API.
- Mobile offline writes queue the API action; they do not reproduce business
  rules with direct database writes.
- The backend owns state transitions, active-pursuit limits, progress, next
  action, submission confirmation, and outcome changes.
- Every retryable write carries an idempotency key.
- Every state-changing write uses optimistic version checking.
- Recommendation, eligibility, reasons, risks, and estimated-effort snapshots
  are retained when the learner makes a decision.
- AI may assist later, but the core pipeline works deterministically without it.
- Rollback disables feature flags; it does not require a destructive migration.

## Rollout flags

| Key | Purpose |
| --- | --- |
| `opportunity_state_actions` | State-aware opportunity primary actions |
| `opportunity_my_path` | Unified journey workspace |
| `opportunity_pipeline_home` | Current focus, next action, pursuits, and bounded shortlist |
| `opportunity_pipeline_navigation` | Makes My Path the primary lifecycle destination |

All flags default to false.

## North-star metric

Percentage of active users who select an eligible opportunity and complete the
first required preparation action within seven days.

## Funnel

```text
intent_available
→ focused_shortlist_viewed
→ opportunity_decision_recorded
→ journey_activated
→ first_task_completed
→ ready_to_apply
→ apply_link_opened
→ application_confirmed
→ interview_recorded
→ offer_recorded
```

## PR 1 non-goals

PR 1 does not create the journey schema, state machine, My Path page, focused
home components, or state-aware opportunity actions. It establishes this
contract and the default-off rollout controls that later PRs must obey.
