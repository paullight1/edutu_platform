# Edutu widget review and fixes — 12 November 2026

The checked-in Android app registers **nine widget providers using 13 XML layouts**. The iOS configuration declares eight widget types plus accessory families; News is Android-only. This differs from the reported 12 widgets in the installed picker. The installed APK/version and launcher still need comparison before attributing every on-device symptom to this checkout.

## Findings addressed

| Severity | Finding | Fix | Verification |
|---|---|---|---|
| P1 | Eleven of 13 Android layouts contain unsupported plain `View` nodes. Hidden empty states are inflated too. This is a concrete source-level cause of launcher inflation failure. | Replace spacer and scrim nodes with supported, empty `LinearLayout` containers. | Resource allowlist check; AAPT2 resource compilation. Device inflation remains unverified. |
| P1 | `updateSafely` catches provider errors, but cannot catch inflation errors in the separate launcher process. Its fallback also contained unsupported views. | Correct the actual layouts and fallback; log provider errors instead of discarding all diagnostic evidence. | Native compilation; fallback included in resource checks. |
| P1 | Cold rendering of image widgets and News could make synchronous HTTP requests before painting. Executors were also launched without retaining the receiver's pending result. | Cache-only initial rendering; network refresh on workers with `goAsync`, coalescing and completion after queued render work. | Native compilation; source inspection. Process-death tests remain required. |
| P2 | Trending selects three or five rows while allowing 40 dp heights. Narrow, tall placements could select the large list first. | Height-based row budget, font-scale allowance, narrow hero priority, supported minimum dimensions, Android 12 size mappings and older-launcher resize callbacks. | Executable Kotlin sizing checks and native compilation. |
| P2 | Grid and thumbnail list offer resizing without changing density. iOS medium Grid/List/Deadlines are also too dense. | Android Grid adapts between one/four tiles and List budgets rows; iOS medium Grid uses two tiles, List and Deadlines use two rows. | Kotlin checks, TypeScript checks; native visual testing remains required. |
| P2 | Native fallback uses the old `edutu-platform.onrender.com` host. Cached image feeds could prevent refresh indefinitely. | Align with the app's `backend.edutu.org` default; use timestamp-based refresh checks. | Resource configuration test and backend route inspection. |
| P2 | Android writes do not request an immediate home-screen update. Sign-out omits the Top Matches JSON, and empty iOS timeline calls do nothing. | Debounced file observer broadcasts updates to placed widgets; clear all four JSON files; replace empty iOS timelines with default snapshots. | Native compilation and seven timeline-reset tests. |
| P2 | Four configured iOS widgets are missing from the checked-in Swift bundle. | Register Spotlight, Grid, Ticker and List in the compiled widget source/bundle. | Swift syntax parse; full Xcode build remains required. |
| P2 | Clean Android prebuild only recreates the original scaffold while registering all receivers. | Store the complete native suite in config-plugin templates and regenerate all sources/resources, including observer startup. | Isolated clean-prebuild fixture: nine providers, 13 layouts, package rewriting, idempotent receivers and observer setup. |
| P2 | `previewLayout` alone provides no tailored artwork on older launchers. | Add light/dark PNG picker images for all nine providers and sample XML content. | Resource references and compilation; artwork inspected. |

Android's restricted widget view classes and responsive layouts are documented in [RemoteViews](https://developer.android.com/reference/android/widget/RemoteViews) and [flexible widget layouts](https://developer.android.com/develop/ui/views/appwidgets/layouts).

## Size behavior

Dimensions are available dp after launcher sizing, not promises about a specific launcher's cell grid. Widget picker artwork uses representative dimensions.

| Widget | Android sizing | iOS families |
|---|---|---|
| Top Matches | Narrow: single match; wide: featured match; tall/wide: rows according to height | Small, medium, large; circular, rectangular and inline accessories |
| Deadlines | Narrow: next deadline/countdown; wide: height-budgeted agenda | Small countdown; medium two-row agenda; large agenda; rectangular accessory |
| Trending | Narrow: featured item; wide: ranked list with height-budgeted rows | Small, medium, large |
| Spotlight | Resizable poster with rotating opportunities | Small, medium, large |
| Grid | Narrow/short: one tile; wide/short: two tiles; narrow/tall: two stacked tiles; wide/tall: four tiles | Medium two tiles; large four tiles |
| Ticker | Wide banner; minimum 110 dp high | Medium |
| List | One to four thumbnail rows according to height; metadata hidden at narrower widths | Medium two rows; large five rows |
| News | Wide banner; minimum 110 dp high | Not implemented |
| Ask Edutu | Single chat launcher; horizontal resizing | Small; circular accessory |

## Previews

These are **generated picker artwork with sample data, not emulator screenshots or proof of native rendering**. Live photographs replace branded fallback surfaces when downloads succeed. The sheets include 15 representative type/size combinations in each theme.

- [Light preview sheet](widget-previews/contact-sheet.png)
- [Dark preview sheet](widget-previews/contact-sheet-dark.png)

Regenerate the artwork with `python3 scripts/generate-widget-previews.py` (Pillow required). After changing native widget files or generated artwork, run `node scripts/sync-widget-templates.cjs` so clean prebuild uses the same sources.

## Release verification

A native rebuild/reinstall is required; JavaScript OTA updates cannot replace Android resources/providers or the iOS widget extension.

Before release, test on an Android 11 launcher and an Android 12+ launcher, and build the iOS extension. Add every widget before opening the app; verify empty, cached and populated states; resize and rotate; try 100%, 160% and 200% font scales; switch light/dark themes; tap every row and banner; test offline/reboot/process death; sign out and verify private data clears. Compare the installed APK's provider list against this inventory.

The available Android emulator could not start because of insufficient disk space. Full APK/IPA builds and real launcher screenshots were not produced. Compilation and JavaScript tests are useful evidence, but do not prove launcher/OEM compatibility.

## Validation results

- Android widget resources compiled with AAPT2 against API 35; all widget Kotlin sources compiled with the bundled Kotlin compiler.
- Ten executable Kotlin sizing assertions passed, including large text and narrow/tall cases.
- Seventeen resource/prebuild assertions passed, covering allowed views, backend host, older-launcher previews, regeneration and template/native parity.
- Eighteen Jest tests passed across widget sync, Android sign-out cleanup and seven iOS timeline resets.
- Full mobile `npm run typecheck` passed. Targeted widget ESLint and Swift source syntax parsing passed.
- `git diff --check` passed for the widget changes.

Evidence is in [the shared Android renderer](../android/app/src/main/java/com/edutu/com/widgets/WidgetSupport.kt), [Trending sizing](../android/app/src/main/java/com/edutu/com/widgets/TrendingWidgetProvider.kt), [the sizing policy](../android/app/src/main/java/com/edutu/com/widgets/WidgetSizing.kt), [refresh observation](../android/app/src/main/java/com/edutu/com/widgets/WidgetRefreshObserver.kt), [suite cleanup](../lib/widgetSuiteSync.ts), [the iOS bundle](../ios/ExpoWidgetsTarget/index.swift), and [the prebuild plugin](../plugins/android-widget/index.js).

Verdict: approve with follow-up for native build/device verification. The source checks above passed; launcher rendering, process-death behavior, OEM compatibility and the full iOS extension build remain unverified.
