# Opportunity Pipeline Test Matrix

This matrix is the release contract for the intentional opportunity pipeline.
PR 1 establishes the cases; later PRs add executable coverage.

## Core dimensions

| Dimension | Required cases |
| --- | --- |
| Authentication | anonymous, authenticated, expired session |
| Intent | missing, inferred, explicit, edited |
| Platform | web, Android, iOS |
| Connectivity | online, stale cached read, offline queued write, replay |
| Theme | web light/dark, mobile light/dark, non-default mobile theme |
| Journey stage | Discover, Pursuing, Applied, Outcome |
| Compatibility | bookmark only, draft application, submitted application, interview, terminal outcome |
| Concurrency | web and mobile open together, stale version, duplicate tap |
| Recommendation | healthy, degraded, empty, explicit ineligibility |
| Deadline | future, urgent, passed, missing/rolling |

## PR 1 controls

- [ ] All four web flags default to false.
- [ ] All four mobile flags default to false.
- [ ] Legacy settings without flag fields still parse.
- [ ] Explicit web and mobile values remain independent.
- [ ] Public web config returns only the supported web pipeline flags.
- [ ] A settings outage returns disabled web flags.
- [ ] The web hook starts disabled.
- [ ] The web hook enables a feature only after an explicit true value.
- [ ] The admin helper rejects malformed values by normalising them to false.
- [ ] No learner-facing component consumes these flags in PR 1.

## Later functional cases

1. Missing intent produces a non-blocking inferred focus.
2. Editing intent refreshes the focused shortlist.
3. Focused home returns three recommendations and never more than five.
4. Explicitly ineligible opportunities cannot be pursued.
5. First active pursuit becomes primary.
6. Second and third active pursuits become secondary.
7. A fourth active pursuit is rejected with an actionable resolution state.
8. Completing a task on web appears on mobile.
9. Completing required tasks produces Ready to apply.
10. Opening an application records an open event but does not confirm submission.
11. Not yet retains the Pursuing state.
12. Explicit confirmation moves the journey to Applied.
13. Interview and each terminal outcome can be recorded.
14. A legacy bookmark appears in Discover.
15. A legacy submitted application appears in Applied.
16. Offline retries create one event and one state transition.
17. A stale cross-device version returns the current server journey.
18. Recommendation degradation preserves the next action and active pursuits.
19. Feature-flag rollback restores the current experience.
20. Existing Saved, Applications, Deadlines, and Roadmap deep links continue to resolve.

## UI conservation checks

- [ ] No new global palette or typography.
- [ ] No replacement web shell.
- [ ] No replacement mobile navigation implementation.
- [ ] New web components use existing semantic surface/text/brand classes.
- [ ] New mobile components use current theme tokens.
- [ ] Existing opportunity cards remain unchanged when new optional props are absent.
- [ ] Focus, next action, pursuits, and recommendations do not duplicate existing rails.
- [ ] Keyboard focus, screen-reader labels, touch targets, dark mode, loading,
      empty, stale, offline, conflict, and error states are covered.
