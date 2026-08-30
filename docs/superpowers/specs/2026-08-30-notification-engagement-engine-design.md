# Notification Engagement Engine v1 Design

## Status

Approved in chat on 2026-08-30. This document records the agreed implementation scope for the Edutu mobile notification system.

## Goal

Turn Edutu's existing push transport into an adaptive engagement engine that repeatedly brings learners back for valuable actions: discovering relevant opportunities, progressing applications, improving their CV, and using Edutu AI to complete a concrete next step.

## Product principle

The system should have high energy and frequent relevance, not manipulative urgency. A notification may be interruptive only when it has a specific user reason, a useful destination, and a measurable target action. Opens are diagnostic; meaningful actions are the primary outcome.

## V1 scope

V1 includes:

- A canonical notification taxonomy shared by backend and mobile.
- Account-level topic preferences for opportunity discovery, application deadlines, CV coaching, AI coaching, goals, achievements, community, and reactivation.
- One candidate-ingestion service used by notification producers.
- Shadow and live scheduling modes.
- Adaptive delivery budgets based on user engagement state.
- Candidate producers for recent, interest, similar-interest, trending, potential-match, AI-coach, CV-update, and reactivation notifications.
- End-to-end attribution from candidate through delivery/open to destination and target action.
- Mobile preference controls, correct icons, deep links, and action telemetry.
- Admin-readable scheduler and conversion summaries through the existing queue/analytics surfaces.

V1 does not include a visual campaign builder, unrestricted AI-generated urgency, cross-company social proof, or a third-party marketing automation platform.

## Existing foundation retained

The implementation reuses:

- Expo push-token registration and token ownership.
- Contextual notification permission prompts.
- Android notification channels and interactive opportunity actions.
- Quiet hours and device timezone synchronization.
- `public.notifications`, `public.notification_queue`, and `public.notification_candidates`.
- Deduplication via `dedupe_key`.
- Delivery/open telemetry.
- The opportunity ranking service and user opportunity signals.
- Deadline, saved-search, goal, roadmap, community, and billing notification senders.

## Architecture

### Candidate producers

Producers identify a user, notification family, entity, destination, reason, urgency, relevance, expiration, and copy inputs. They do not send pushes directly.

The v1 producer families are:

- `opportunity-recent`: newly ingested opportunity with a strong user match.
- `opportunity-interest`: strong match based on profile and interaction affinity.
- `opportunity-similar`: opportunity similar to a recent save or application.
- `opportunity-trending`: opportunity with high recent positive-signal velocity in a relevant category.
- `opportunity-potential`: near-match that becomes actionable after one truthful profile improvement.
- `ai-coach`: one deterministic next-best action opened as a prefilled coach conversation.
- `cv-update`: missing or stale CV where observed behavior shows current application intent.
- `reactivation`: personalized digest after 3, 7, or 14 days without a meaningful action.

Existing deadline and transactional notifications retain their current senders in v1 but participate in the shared global delivery budget. They are candidates for a later migration only after live scheduler validation proves safe.

### Candidate ingestion

`NotificationCandidateService.enqueue()` is the sole write boundary for `notification_candidates`. It:

- Converts Clerk/raw user IDs to the canonical database UUID.
- Validates urgency and relevance into the inclusive `0..1` range.
- Requires an actionable route and bounded title/body.
- Uses the pending unique index for retry-safe idempotency.
- Stores campaign metadata including family, reason, source, variant, and target action.
- Supports `shadow`, `live`, and `off` modes through environment configuration.

### Scheduler

The existing scheduler remains the scoring implementation. V1 adds:

- Shadow mode that records winners and suppression decisions without delivery.
- Live mode that consumes and delivers winners.
- A per-user selection ceiling so a backlog cannot schedule every winning candidate at once.
- Priority protection for critical deadlines and transactional kinds.
- Conversion-weighted engagement when enough observations exist; open rate remains the fallback.

The scheduler score remains urgency × relevance × recency × engagement, followed by per-kind fatigue suppression and entity collapsing.

### Delivery budget

The current static budget becomes a tiered policy:

- `new`: at most 2 routine pushes per rolling 24 hours and 8 per 7 days during the first 7 days.
- `engaged`: at most 2 routine pushes per 24 hours and 8 per 7 days.
- `standard`: at most 1 routine push per 24 hours and 5 per 7 days.
- `dormant`: at most 1 routine push per 24 hours and 3 per 7 days.
- urgent application/deadline notifications may use the existing 2-per-day urgent ceiling.

Three consecutive unopened notifications halve a family's score. Six mute the family for 14 days. Explicit dismissal immediately suppresses the matching entity and contributes a strong negative signal.

### Copy generation

Every candidate has deterministic fallback copy. AI may refine copy only after the opportunity, match score, deadline, reason, and destination are fixed. Generated copy must:

- Be grounded only in supplied facts.
- Use no more than one emoji.
- Avoid all caps, fake scarcity, invented social proof, guilt, or unsupported eligibility claims.
- Keep titles at 60 characters or less and bodies at 160 characters or less at the backend boundary.
- Fall back immediately on timeout, validation failure, cost limit, or model error.

### Preferences

The account preference model adds:

- `cv_coaching`
- `ai_coaching`
- `community_updates`
- `reactivation_nudges`

Opportunity sub-families share `opportunity_alerts` in v1 to avoid an unwieldy settings screen. Deadline, goal, achievement, weekly digest, and marketing settings continue unchanged. The backend remains the authority; device-local haptics remain in AsyncStorage.

### Telemetry and attribution

Each delivered notification carries:

- `notificationId`
- `candidateId`
- `campaignId`
- `family`
- `variantId`
- `targetAction`
- `destination`

An authenticated event endpoint accepts bounded events:

- `destination_loaded`
- `opportunity_saved`
- `application_started`
- `application_progressed`
- `cv_updated`
- `coach_started`
- `goal_progressed`
- `dismissed`

Events are idempotent per notification, event name, and entity. The backend verifies notification ownership before insert. Mobile reports destination load after navigation and reports explicit notification actions. Existing opportunity-signal writes continue to train recommendations.

### Database security

New tables live in `public` with RLS enabled. Client roles receive no direct write grant for candidate or attribution tables; the NestJS backend owns writes with the service role/database connection. Any authenticated read is user-owned. The migration revokes `anon` access and grants service-role access explicitly.

## Mobile behavior

- Registration remains silent on launch and contextual when a user first saves an opportunity with a future deadline.
- New notification kinds have correct icons and routes.
- Topic switches are shown in an expandable notification-preferences section.
- The inbox uses the backend API as the canonical data source. Legacy direct `user_notifications` writes and delivery services are removed.
- Android keeps separate opportunity, deadline, CV/coach, and community channels.
- iOS `Not interested` opens the app when necessary so the negative signal is not silently lost.
- Foreground notifications avoid extra in-app haptic duplication when the notification itself already produced sound/haptics.

## Failure handling

- Candidate insert conflicts are success-equivalent idempotent outcomes.
- A producer failure affects only that producer and user.
- Scheduler shadow-mode failures never affect existing notification senders.
- Live scheduler delivery uses the existing durable queue and dedupe keys.
- Telemetry is fire-and-forget on mobile and never blocks navigation.
- AI failure always falls back to deterministic copy.
- Preference lookup fails closed for email and uses stored/default push preferences according to the existing transport behavior.

## Rollout

1. Deploy schema and code with candidate mode `off`.
2. Enable `shadow` for internal users, then 5% of eligible users.
3. Compare shadow winners, suppressions, and timing against existing sends for at least seven days.
4. Enable live delivery for 5%, then 25%, 50%, and 100% if guardrails remain healthy.
5. Increase eligible engaged-user weekly budgets from 5 to 6, then 8; do not jump directly to 8.
6. Preserve a 5% eligible no-routine-push holdout for incremental-retention measurement.

## Success metrics

Primary:

- Meaningful target actions per delivered routine push.
- Incremental weekly active users versus holdout.

Secondary:

- Delivery-to-open rate.
- Open-to-destination-load rate.
- Destination-to-target-action rate.
- Seven- and thirty-day retained meaningful activity.

Guardrails:

- Notification permission disablement.
- Explicit dismissals and family mutes.
- Consecutive unopened streaks.
- Dead push-token rate.
- Support complaints.
- AI cost per successful target action.

## Verification requirements

- Unit tests for candidate validation, dedupe, producer eligibility, tier classification, budgets, scoring, and preference mapping.
- Controller/service tests for ownership and idempotent telemetry.
- Migration tests for constraints, RLS, grants, and uniqueness.
- Mobile tests for preference normalization, kind rendering, routing metadata, and action reporting.
- Backend test suite, mobile typecheck, mobile notification Jest tests, and SQL security tests before rollout.

