# Actionable Edutu widgets

User-approved scope: Today’s Next Step, mascot in Ask Edutu, Save on Top Matches, light/dark size previews.

- Today’s Next Step reads actual My Plan journeys through the existing authenticated NestJS API; pending/in-progress tasks only, prioritize the primary pursuit and earliest due date. It opens the correct plan, without marking anything complete. Empty, signed-out, unavailable and stale states remain distinct. Small shows one task, medium adds opportunity context/progress, large adds the next task when available.
- Ask Edutu uses the existing approved 640px transparent guide, bundled locally on Android and copied to the shared WidgetKit container on iOS. Small and medium layouts plus the existing circular accessory. No generated replacement mascot.
- Top Matches medium/large show Save links to an authenticated in-app action receipt. This is an app-opening action, not a silent background bookmark. It uses POST to the NestJS bookmark endpoint, never toggles/removes a save, never reports local success, and offers retry on failure. Small/accessory placements remain a single View target for compatibility.
- Save and Continue targets are separate from the card target; native storage contains no auth tokens. New account/sign-out clears personal task data. Only the current account may publish async results.
- Keep native prebuild templates and checked-in projects in sync. Produce labelled sample artwork for all three widgets at supported sizes in both themes; real native screenshots remain conditional on a usable simulator.

Implementation sequence: (1) failing task-selection/save-contract tests; (2) task model/sync and authenticated receipt; (3) Android providers/layouts/registration; (4) iOS layouts/registration and mascot; (5) preview artwork and resource/template checks; (6) targeted tests, full typecheck, native resource/Kotlin compilation, Swift syntax and UI lint.
