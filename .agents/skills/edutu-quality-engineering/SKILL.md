---
name: edutu-quality-engineering
description: Plan and perform focused verification for Edutu API, web, admin, scraper, billing, and Expo mobile changes. Use for test design, regression analysis, release acceptance, or reproduction of bugs.
---

# Edutu Quality Engineering

Translate the requested behavior and changed code into risk-focused verification. Start with the changed files and trace affected callers, user journeys, permissions, data writes, and platform boundaries.

## Workflow

- Identify affected packages and read their current scripts; the platform root is not a single installable monorepo, and mobile is a separate repository boundary.
- Cover expected behavior plus likely failure cases: unauthenticated/unauthorized, invalid input, empty data, timeouts/retries, duplicate submissions, stale cache/offline behavior, provider failure, and user ownership.
- For billing, include idempotency, webhook verification, ledger/entitlement consistency, retries, and reconciliation. For AI, include malformed output, provider errors, usage limits, and safe display. For opportunities, include duplicates, expired deadlines, bad URLs, source failure, and moderation state.
- Prefer an existing test style and the narrowest meaningful checks. Do not create broad test scaffolding unrelated to the change.
- Separate code evidence from runtime evidence. Do not claim tests passed unless they ran; list environmental limitations and residual coverage gaps.
- For formal code review, use `edutu-code-review` plus `edutu-web-review`, `edutu-mobile-review`, or `edutu-payments-review` when relevant. Those review skills do not implement fixes unless asked.

## Output

Summarize the behavior covered, commands actually run, result, and remaining risk. For a test plan, name scenarios and why each protects a real Edutu flow.

## References

- `docs/OPERATIONS.md`
- `docs/API.md`
- `edutumobile/README.md`
