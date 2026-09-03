# Opportunity Pipeline Event Dictionary

All events are append-only records in `opportunity_journey_events`. A retry reuses the same per-user idempotency key and must not create a second event.

| Event | Meaning | Required metadata | Funnel use |
|---|---|---|---|
| `intent_created` | An inferred or explicit current intent was persisted | intent source and goal | Intent available |
| `intent_updated` | The user explicitly changed current intent | previous/new goal where available | Intent available |
| `focused_shortlist_generated` | The backend produced a bounded focused shortlist | batch ID, engine, result IDs, degraded flag | Focused shortlist exposure |
| `focused_shortlist_viewed` | A client confirmed the focused shortlist was actually displayed | batch ID, surface | Focused shortlist viewed |
| `recommendation_passed` | The user deliberately passed on a recommendation | opportunity ID, reason, surface | Decision recorded |
| `journey_shortlisted` | The user saved an opportunity for later consideration | opportunity ID | Decision recorded |
| `journey_activated` | The user deliberately began pursuing an opportunity | priority, intent ID | Journey activated |
| `task_started` | A preparation task moved into progress | task ID | Supporting metric |
| `task_completed` | A preparation task was completed | task ID, position | First task completed |
| `journey_ready_to_apply` | All required preparation tasks are complete | completed/required counts | Ready to apply |
| `application_opened` | The official application destination was opened | opportunity ID | Application opened only |
| `application_confirmed` | The user explicitly confirmed submission | opportunity ID, confirmation source | Confirmed application |
| `journey_interview` / `interview_recorded` | An interview stage was recorded | interview date where available | Interview recorded |
| `journey_outcome` | The user recorded offer, rejection, withdrawal, no response, or expiry | `outcome` | Offer/outcome metrics |
| `journey_reminder_queued` | One deduplicated next-action reminder entered the existing notification queue | reminder kind, task ID, scheduled time | Reminder guardrail |
| `legacy_imported` | A bookmark/application record was reconciled into a journey | legacy table and record ID | Data-quality audit only |

## Non-negotiable distinction

`application_opened` is not an application. It must never increment confirmed-application metrics. Only `application_confirmed` enters the confirmed-application funnel stage.

## North-star calculation

The numerator is the number of distinct users with a `task_completed` event within seven real elapsed days after their first `journey_activated` event for the same journey. The denominator is distinct users with a journey activation in the selected reporting window.

## Privacy

Event metadata must not contain CV text, essays, transcripts, reference letters, free-form application answers, access tokens, private contact details, or payment secrets. Reporting exposes counts and conversion rates, not document content.
