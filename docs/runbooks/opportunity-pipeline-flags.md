# Opportunity Pipeline Feature-Flag Runbook

## Flags

```text
opportunity_state_actions
opportunity_my_path
opportunity_pipeline_home
opportunity_pipeline_navigation
```

Every flag defaults to false on web and mobile.

## Ownership

- Web values: Admin → Settings → Web Content → Opportunity pipeline rollout
- Mobile values: existing Admin → App Content → Feature switches/app control
- Web delivery: `GET /public/web-config`
- Mobile delivery: `GET /mobile-control/config`

## Activation order

1. `opportunity_state_actions`
2. `opportunity_my_path`
3. `opportunity_pipeline_home`
4. `opportunity_pipeline_navigation`

Do not enable navigation consolidation before My Path and state-aware actions
are stable for the target cohort.

## Pre-activation checks

- Confirm the target client version contains the flagged implementation.
- Confirm backend endpoints used by that implementation are deployed.
- Confirm old routes still resolve.
- Confirm application opening and submission confirmation remain separate.
- Record current flag values and the rollback owner.
- Record the cohort, start time, and observation window.

## Rollback order

1. Disable `opportunity_pipeline_navigation`.
2. Disable `opportunity_pipeline_home`.
3. Disable `opportunity_my_path`.
4. Disable `opportunity_state_actions`.

Rollback must restore the current interface without a database down-migration.
Keep additive data and event history for diagnosis.

## Failure posture

Missing, malformed, or unavailable web configuration resolves all pipeline
flags to false. Mobile callers must also pass `false` as the built-in fallback
when they begin consuming these flags in later PRs.
