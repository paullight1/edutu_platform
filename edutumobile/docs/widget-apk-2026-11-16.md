# Android actionable widget APK — 16 November 2026

This release adds a dedicated **Save** button to compact Android Top Matches. The 48dp touch target is separate from the card, which continues to open opportunity details. Medium/large Save actions use the same authenticated, idempotent Save receipt with bounded retries and token refresh. At larger font scales the compact title uses one line and hides the deadline chip to preserve the action. Native config-plugin templates are synchronized for clean prebuilds.

The other widgets retain their contextual actions: Ask Edutu opens chat, Today’s Next Step continues the owning My Plan journey, deadline/trending items open opportunity details, and news opens the selected article. Empty states open the corresponding discovery or plan screen. Save opens Edutu for authentication and server confirmation; it does not store credentials in the widget.

## Build

- Android version code: 24; app version: 1.0.0.
- Build: `2e5b5c93-a2e4-45c0-a413-3108431e09a4`.
- EAS: https://expo.dev/accounts/edutu/projects/hanaedutu/builds/2e5b5c93-a2e4-45c0-a413-3108431e09a4
- SDK 57 / runtime `1.0.0-sdk57`.
- Source: committed widget/Save fixes through `17a8a5cb`, plus compact Save commit `f019a2db` and notification manifest correction `5fe9eb4f`.
- Isolated archive: build-compatible SDK57 manifests/configuration and committed application source, with the small manifest correction applied before retry.
- Channel: `widget-apk-20261116`, separate from older widget-test updates.
- Uses the existing EAS signing key. Fixes are embedded in the APK.
- Generated the native Android project cleanly from Expo SDK57 and the widget config plugin. Unrelated working-tree application changes were excluded.
- The scholarship-image correction is live data from the backend; it is not an image hardcoded into this APK. The live API was checked to return the verified hosted Chevron photo.

The first cloud attempt (`971bc37a-ec53-4285-80eb-d9499e71cbc7`) failed before producing an APK because Expo and Firebase declared different default notification colour resources. A config plugin now preserves Expo’s configured colour with `tools:replace="android:resource"`. Three regression tests and a real clean prebuild verified the generated manifest. The retry reuses version code 24 because no version-24 APK was distributed.

## Artifact

- Local APK: `output/android/edutu-actionable-widgets-v24.apk` in the parent workspace.
- SHA-256: `55230f6990cf5545514945b99bd61b03551ee1f1f7eae7be6689e854968143f1`.
- Size: 179,680,748 bytes; includes ARM64, ARMv7, x86 and x86_64 libraries.
- APK version 24 / package `com.edutu.com`, ZIP integrity and signature verified. Certificate matches the prior v23 APK.
- All ten providers, isolated test channel, embedded Save retry markers and compact 48dp action were verified in the downloaded APK.
- The APK installed over v23 on the emulator successfully, preserving its data.

## Verification

- The resource regression initially failed because compact Top Matches had no separate Save target.
- The native regression reproduced the missing compact Save action in both themes and all three font settings against the previous compiled widgets.
- Updated native rendering passed **228 widget/size/theme/font cases plus three non-ready Next Step states**. Compact Save is clickable, remains untruncated, and measures at least 48dp in both dimensions; the card remains independently clickable.
- **23** widget resource/prebuild tests and **3** notification manifest regression tests passed, including regeneration, template parity, preservation of existing merger directives, and idempotence.
- **29** focused Save/receipt/Next Step/widget-sync tests passed in the isolated release source.
- Isolated TypeScript check and native resource/Kotlin compilation passed.

Screenshots and test logs are in the parent workspace’s `output/verification/widget-apk-2026-11-16/` directory. The native previews use representative fixture data and are not live account screenshots.

EAS Expo Doctor completed 18 of 21 checks. Its nonblocking warnings concern the retained iOS native folder/CNG metadata, React Native Directory metadata for existing calling/wallet dependencies, and newer SDK57 patch releases available since the dependency set used by the prior APK. This build keeps that tested, locked dependency set. The cloud log confirms Android prebuild generated a new native directory and completed successfully; these warnings are not recorded as a clean Expo Doctor pass.

## Final emulator check

Version 24 installed successfully over v23. A foreground Save smoke check was blocked by an Android System UI ANR in the software-rendered emulator. Restarting with the previously stable hardware renderer was then refused by the emulator's disk-space check (the host reported approximately 2.0 GiB free). The emulator was stopped; no local account data was erased. This release does not claim a completed live account action check on v24. Package/signature checks and the 231 native fixture renders are recorded separately above.

## Trying the widgets

Install the new APK, open Edutu once to sync current widget data, then long-press the launcher and choose **Widgets → Edutu**. Add Top Matches, resize it, and compare tapping the card with tapping Save. Ask Edutu opens chat; Today’s Next Step requires an active My Plan pursuit with an eligible pending task to show a personalized Continue action.
