# Android widget emulator verification — 12 November 2026

## Build and environment

- App: `com.edutu.com`, version 1.0.0 / Android version code 22.
- Corrected internal APK build: `cb3fc57b-b0a1-42e5-bf9a-e0cf8d028372`.
- EAS: https://expo.dev/accounts/edutu/projects/hanaedutu/builds/cb3fc57b-b0a1-42e5-bf9a-e0cf8d028372
- APK: `output/android/edutu-widgets-verified-v22.apk` in the parent workspace.
- SHA-256: `f9c01cb077ca627a0bfe2b4504425785567a2ac1247dc35a70c149fca313c375`.
- Base widget commit: `8e89e055`; isolated build snapshot with the corrections: `f4799cc`.
- Embedded JavaScript, ARM64 libraries, ZIP CRC and APK signing verified. Runtime uses the isolated `widget-test` update channel.
- Device: `Edutu_Play_API35`, Android 15 / API 35, ARM64, Pixel launcher, 720 × 1600 with density 280.

The original Play-signed Edutu installation could not be updated with the EAS signing key. The user authorized replacing that emulator installation; the new APK was installed successfully. An attempted separate test AVD was removed. Hardware graphics (`-gpu host -feature -Vulkan`) avoided repeated System UI timeouts seen with software rendering on this workstation.

## Corrections from actual rendering

- Compact Ask Edutu uses a short Ask action at large font settings and preserves its full accessible name.
- Compact Next Step uses short header/action text at large font settings, including signed-out states.
- News, Spotlight and Ticker adapt headline line counts to placement height and font scale; tight placements omit secondary labels that previously overlapped or clipped.
- Grid adapts each tile’s headline and deadline to the tile height and font scale.
- Trending List hides secondary metadata/deadlines and, in narrow large-text placements, the thumbnail, preserving usable headline space.
- Compact Deadlines and Trending Now constrain their headers to the remaining width rather than allowing text outside the widget. The compact countdown uses a shorter unit at large font settings.
- Config-plugin templates remain synchronized with native sources/resources for clean Expo prebuilds.

## Coverage

The Android APK contains **ten providers**. Sizes below are content dimensions in dp. Continuous resizing is sampled at the supported minimum and representative wide/tall placements.

| Widget | Installed APK placement matrix |
| --- | --- |
| Top Matches | 140 × 140, 340 × 160, 340 × 340 |
| Deadlines | 140 × 140, 340 × 160, 340 × 340 |
| Trending Now | 140 × 140, 340 × 160, 340 × 340 |
| Ask Edutu | 140 × 140, 340 × 160 |
| Today’s Next Step | 140 × 140, 340 × 160, 340 × 340 |
| Spotlight | 110 × 110, 140 × 140, 340 × 160, 340 × 340 |
| Grid | 110 × 110, 140 × 140, 340 × 160, 340 × 340 |
| Ticker | 180 × 110, 340 × 160, 340 × 340 |
| Trending List | 220 × 140, 340 × 160, 340 × 340 |
| News | 180 × 110, 340 × 160, 340 × 340 |

The installed APK host uses Android’s real `AppWidgetHost`, binds providers from `com.edutu.com`, changes options on the same widget ID when resizing, waits for a real provider update, detects Android inflation errors, and captures the widget pixels with `PixelCopy`. It does not inject fixture data into Edutu. Public widgets use feed/cache data; account-owned widgets use the signed-in test account. The user authorized sign-in testing and saving one opportunity.

The isolated native sample renderer uses production Kotlin/layouts and representative content at 100%, 160% and 200% font scale. **228 size/theme/font combinations plus three Next Step fallback states passed.** It asserts that actionable labels are not truncated and that visible text stays inside the widget without overlapping other text. Long headlines can intentionally ellipsize in compact placements.

- 22 resource/plugin checks passed, including clean-prebuild generation and source/template parity.
- 14 Kotlin sizing-policy checks passed.
- Android widget resources and Kotlin compiled against API 35.
- Before the corrections, device logs reproduced the old installed APK’s unsupported `android.view.View` inflation error. The corrected layouts use supported RemoteViews classes.
- Pixel launcher listed all ten providers and their previews. Next Step and Ask Edutu were added through the normal launcher Add flow.
- Ask Edutu and the account-owned plan action reached Edutu’s authentication screen while signed out; no unmatched-route failure was observed.

## Screenshots

These are native Android renders with sample content, captured after the layout corrections. They are not mockups or authenticated-account screenshots.

- [All layouts in light mode](widget-previews/emulator-native-light.jpg)
- [All layouts in dark mode](widget-previews/emulator-native-dark.jpg)
- [Large-text layout fixes, before and after](widget-previews/emulator-large-text-fixes.jpg)

## Final installed APK and account checks

Full-resolution captures, per-placement JSON results, contact sheets, large-text before/after comparison and a filterable `gallery.html` are in `output/verification/widgets-android-2026-11-12/` in the parent workspace. `native-final/` contains sample-content renders; `installed-final-light/` and `installed-final-dark/` contain the final v22 release-APK captures. Initial-build captures remain separately named `installed-v22-*` for comparison.

**The final v22 APK passed all 62 captures: 31 placements per theme.** Every placement received a real provider update and reported no inflation/capture error (88 updates in light mode, 83 in dark mode). The installed APK SHA-256 was checked against the build artifact during this run. A previously interrupted run is retained separately and is not counted as a pass.

The account's My Plan contained a closed application with a “Confirm application status” action and a last-synced warning. It had no eligible pending preparation task for Today’s Next Step, which correctly displayed its empty-state prompt. A populated task's live backend synchronization could not be established with this account; the sample renderer covers its populated layout.

The authorized Save test used one opportunity, Chevron NMA Undergraduate Internship 2027 For Nigerians (`28758c31-ee93-4516-acf8-81528ba75bc2`). Initial requests showed a truthful “Save not confirmed” receipt. Later attempts succeeded, and Saved Opportunities visibly contained that exact title. The cause of the initial failure was not established. A temporary request-error diagnostic was published only to the isolated `widget-test` channel, then that channel was rolled back to the APK's embedded bundle and the temporary source changes were removed. No production deployment, database migration, or console write was performed.

During account-action testing, another build replaced the installed v22 APK: version code 23, matching `output/android/edutu-my-plan-v23.apk` (SHA-256 `944bb9f6328605014d0b22b8cd511ea4ec408638fd841680812b2eae23772d0a`). The Save success and Saved Opportunities screenshots therefore establish the action on v23, not on the exact v22 APK used for the 62 original captures. Android rejected a normal downgrade to v22; the signed-in installation was preserved. A second full matrix on this exact v23 APK also passed all 62 placements (31 per theme), with real provider updates and no inflation/capture errors. Its captures are in `installed-v23-light/` and `installed-v23-dark/`; the gallery and installed contact sheets now show v23.

One public feed entry has a mismatched source image: Chevron NMA Undergraduate Internship 2027, ID `a33d1b3a-12b8-40a1-a58d-77ac502f6bc7`, returns a Tongji scholarship image from the API. The image downloaded directly from the returned `image_url` matches the widget screenshot. This is a catalog/source-image issue; the widget displays the supplied asset. No production listing was modified during this widget test.

These checks cover this Pixel/API-35 emulator. Other Android versions/OEM launchers and iOS were not device-tested in this run.
