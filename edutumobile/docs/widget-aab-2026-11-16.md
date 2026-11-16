# Widget internal testing AAB — 16 November 2026

Built and signed version 25 without an EAS cloud build. Published to Google Play internal testing; the console confirms **Available to internal testers**, released 16 November 2026 at 11:15 Africa/Lagos.

## Artifact

- App: Edutu 1.0.0, package `com.edutu.com`, version code **25**.
- Bundle: `output/android/edutu-actionable-widgets-v25.aab` in the parent workspace.
- Size: **115,554,921 bytes**.
- SHA-256: `2546400019f72722fc83df9bde4eb140d5eef7b9b531cfdf177b42165287aac3`.
- Expo SDK57 / runtime `1.0.0-sdk57`; update channel `internal-widgets-20261116`.
- ABIs: arm64-v8a, armeabi-v7a, x86, x86_64.
- Source: same verified application source as APK v24, with version/channel configuration for internal testing. Includes compact Top Matches Save, Next Step, Ask Edutu mascot, bounded Save retries/token refresh, and the notification manifest merger correction.
- The corrected scholarship photo is live backend data, rather than an image embedded in the bundle.

## Build route

EAS Free Android quota was exhausted until 1 December. The suggested 15 GB was a conservative workspace allowance, not a fixed minimum or the final bundle size. A direct Gradle attempt reused installed dependencies but still encountered `java.io.IOException: No space left on device` while transforming build dependencies. Approximately 2 GB of stale Codex Sparkle updater installation cache was removed; source files, APKs and emulator data were preserved.

Built the unsigned bundle on a GitHub-hosted Ubuntu runner using the isolated branch `paul/widget-aab-build-20261116`, source commit `34b7233`. The workflow pins npm 11.13.0, generates Android cleanly, and runs `:app:bundleRelease` for all four architectures. Build succeeded in **31m 38s**, with **1439 tasks executed**.

Build: https://github.com/paullight1/edutu_platform/actions/runs/43840666074

Only public mobile runtime values and Firebase Android client configuration were supplied to the runner. No upload keystore or passwords were sent to GitHub. The downloaded unsigned bundle was signed locally with the existing Play upload key, using environment-based password arguments. Signing files are private and excluded from Git in the isolated build directory.

## Verification

- ZIP integrity passed before signing.
- `jarsigner -verify` passed.
- Upload certificate SHA-256 matches the prior Play v15 AAB: `B4:B6:D6:F4:65:05:56:DF:1C:7F:94:B7:5E:6C:31:BF:82:7E:A4:C6:57:8F:D8:86:CC:11:DD:CB:47:0F:8D:17`.
- Google bundletool 1.18.3 validation passed.
- Manifest confirms package/version and **ten widget providers**, including Next Step, Top Matches, Ask Edutu, Deadlines, News and the Trending variants.
- Compiled compact widget contains the separate Save resource, and the mascot drawable is included.
- Embedded Hermes bundle contains the authenticated Save error/retry/token-refresh markers and production API hostname.
- Production Clerk publishable key used for the build matches the verified v24 APK.
- All four ABI library sets are included.

The prior v24 release records the 231 native size/theme/font fixture renders and focused widget/action tests. This AAB does not add a new emulator/account action verification claim. Evidence and build logs: `output/verification/widget-aab-2026-11-16/`.

## Google Play

Published the existing internal testing draft, release 6, named “Edutu 1.0.0 (25) — actionable widgets”. Previous internal version was 22. Release notes cover compact Save, Next Step, Ask Edutu, size/theme layouts and Save/image fixes. Existing testers and production were not changed.

Tester link: https://play.google.com/apps/internaltest/4699527667199538630

Console: https://play.google.com/console/u/0/developers/9149384899624621665/app/4974645204649364451/tracks/4699527667199538630/releases/6/details

Play accepted the bundle and reported no blocking errors. Nonblocking warnings concern a missing optional deobfuscation file and loss of support for one `google generic_x86` Google gcar Android 8.1 emulator, affecting **zero installs**. Phone support is 12,262 models and tablet support is 2,740 models. Play estimates 50.1 MB for a new install and 11.2 MB for an update from the previous release.

Publication evidence: `output/verification/widget-aab-2026-11-16/play-internal-v25-published.jpg`.
