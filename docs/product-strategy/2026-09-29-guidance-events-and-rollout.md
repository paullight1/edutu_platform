# Guidance loop events and release gates

This first web slice uses the existing `useAnalytics().trackEvent` activity aggregator and the existing immutable opportunity-journey event rows. It does not add a new analytics vendor or database schema.

## Event contract

| Event | Emit boundary | Useful denominator |
| --- | --- | --- |
| `guidance_home_viewed` | Signed-in dashboard home response has resolved (including error state); metadata contains response state and whether an active pursuit/recommendation exists. | Signed-in dashboard sessions with the feature enabled. |
| `guidance_continue_plan` | User selects Continue plan from the card. | Guidance home views with an active pursuit. |
| `guidance_view_recommendation` | User selects the recommendation CTA. | Guidance home views with a current recommendation. |
| `guidance_explore_clicked` | User uses the browse fallback. | Empty, degraded, or unavailable guidance views. |
| `guidance_edit_preferences` | User opens personalization from inferred-intent guidance. | Guidance views whose intent source is inferred. |
| `journey_started` | The API confirms `createOpportunityJourney`. | Opportunity details with an Add to My Plan action. |
| `required_task_completed` | Task update response confirms the required task is completed. | Required tasks shown in active plans. |
| `application_opened` | `application-opened` response confirms the transition. An external link click by itself is not counted. | Plans where the backend action is `open_application` and a safe official URL exists. |
| `application_submitted_self_reported` | The user explicitly confirms submission and the API confirms `application-confirmed`. | Plans in `application_opened`. This is a user report, not verification from the external provider. |
| `outcome_recorded` | The API confirms a supported outcome transition. | Plans in applied/interview states. |

Event properties use journey, opportunity, task, outcome, and response-state identifiers only; they omit free-text profile data. Journey event rows remain the source of truth for state transitions. If the activity aggregator is unavailable, its failures must not roll back a confirmed journey action.

## Rollout gates

1. Keep `VITE_GUIDANCE_HOME_ENABLED` reversible at build configuration. It defaults to enabled in `.env.example`; set it to `false` for an immediate web-build rollback.
2. Before changing landing-page copy or calling a copy experiment, capture the current funnel baseline for landing visits, signup completion, first opportunity detail, and first saved/applied action. This implementation does not claim to have that baseline or a stable experiment assignment.
3. Enable the feature in staging and walk the signed-in dashboard and My Plan paths on desktop and a narrow phone viewport. Confirm API events/state after each transition and test with the flag off and API unavailable.
4. Release through the existing environment-level flag first. Do not claim per-user/staff cohort control until the deployment system provides a cohort assignment and the analytics dashboard can report the event denominators above.
5. Compare first guidance action, first required-task completion within seven days, API failure rate, relevance feedback, and D7 return. A raw signup increase is not sufficient if downstream action quality declines.

## Current measurement limit

The code emits named events through the current aggregator, but this repository does not establish a dashboard, experiment assignment, or historical denominator for the funnel. Review those operational pieces before making a causal product claim.
