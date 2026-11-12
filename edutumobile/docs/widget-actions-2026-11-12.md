# Actionable widgets — 12 November 2026

Implemented the requested three improvements on top of the widget loading/resize fixes. The Android suite now has ten providers and 18 layout resources (including the preview-only Top Matches layout). iOS adds Next Step to the existing widget bundle and adds the medium Ask Edutu family.

## Behavior

- **Today’s Next Step:** small, medium and large. Reads the current account’s pursuing My Plan journeys through NestJS. Selects real pending/in-progress tasks, prioritizing primary pursuits and earlier due dates. Completed/skipped tasks, ended pursuits and expired opportunities are excluded. Continue opens the owning plan. Large placements can show a second task. Plan mutations trigger a refresh. Signed-out, empty, unavailable and cached states are distinct. The iOS timeline removes expired tasks at midnight; rolling/undated opportunities remain eligible.
- **Ask Edutu:** small and medium, plus the existing iOS circular accessory. Reuses the approved transparent guide from `edutu-web-app/public/mascot/edutu-profile-guide.png`. Android bundles it as a drawable; iOS copies the local asset into the widget extension’s shared image container. The medium widget pairs guidance with the mascot and a chat action. The whole card opens chat; it does not pretend to accept text input on the home screen.
- **Top Matches:** medium/large placements expose separate Save targets. Small/accessory placements retain one View target for platform compatibility. Long titles in the large list have more room, with deadline information moved into the subtitle. Save opens `edutu://widget-save?id=…`, authenticates with the existing Clerk session, and POSTs to the NestJS bookmark endpoint. It never toggles/removes a bookmark and never falls back to a direct database write. The receipt shows pending, server-confirmed success, or retry; signed-out visitors are asked to sign in. No auth token is stored in native widget JSON or image assets.

Account switches clear the Next Step snapshot before publishing new account data; generation checks prevent requests that were in flight during sign-out from republishing private tasks. Background execution without a Clerk session preserves the current snapshot rather than falsely claiming the user signed out. Sign-out replaces the Next Step timeline with an empty signed-out state and clears the other Android data files.

## Previews

The sample artwork uses the real approved mascot, representative text and the implemented layout hierarchy. It is not a device screenshot.

- [Light actions and sizes](widget-previews/actions-sheet.png)
- [Dark actions and sizes](widget-previews/actions-sheet-dark.png)
- [Entire suite — light](widget-previews/contact-sheet.png)
- [Entire suite — dark](widget-previews/contact-sheet-dark.png)

Regenerate with `python3 scripts/generate-widget-previews.py`, then `node scripts/sync-widget-templates.cjs`. The committed templates allow clean Expo prebuild to regenerate the whole suite, including the new provider, mascot and previews.

## Verification commands

```sh
npm test -- --runInBand --testTimeout=30000 __tests__/widgetSave.test.ts __tests__/widgetSaveScreen.test.tsx __tests__/nextStepWidget.test.ts __tests__/widgetSuiteSync.test.ts __tests__/opportunityWidgetSync.test.ts __tests__/widgetTimelineReset.test.ts __tests__/myPlanActions.test.tsx __tests__/myPlanScreen.test.tsx
npm run typecheck
node --test scripts/widget-resources.test.cjs scripts/widget-plugin.test.cjs
bash scripts/check-widget-native.sh
xcrun swiftc -frontend -parse ios/ExpoWidgetsTarget/OpportunityWidget.swift ios/ExpoWidgetsTarget/index.swift
```

The isolated native renderer builds a separate instrumentation APK with production widget sources/resources. It renders sample RemoteViews at 100%, 160% and 200% font scale in light/dark modes without opening/stopping Edutu or switching the emulator’s foreground screen:

```sh
bash scripts/render-widget-native-previews.sh --compile-only
bash scripts/render-widget-native-previews.sh --render-only
```

The test APK is cached at `/tmp/edutu-widget-preview.apk`. It contains sample data and no network/auth code paths are invoked by the renderer. Full APK/IPA build, live account Save verification, iOS visual rendering and launcher/OEM tests remain separate release checks. A native rebuild/reinstall is required for these changes; OTA JavaScript updates cannot add native widget providers/resources.


## Results

- 41 tests passed across eight widget, save-receipt and My Plan suites (30-second Jest allowance used on the busy shared workstation).
- 22 resource/prebuild checks passed, including native/template parity and complete regeneration of ten providers and 18 layouts.
- Production widget resources and Kotlin compiled against Android API 35. The isolated preview APK also compiled and signed successfully.
- Full mobile `npm run typecheck` passed. Targeted ESLint passed with zero warnings. Swift widget sources passed syntax parsing. `git diff --check` passed.
- Off-screen Android rendering could not complete because the shared emulator repeatedly disconnected during installation. No native screenshots are represented as completed; the supplied sheets are sample artwork.
