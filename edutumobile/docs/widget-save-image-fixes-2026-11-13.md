# Widget Save and source-image fixes — 13 November 2026

## Save reliability

The original v23 APK reproduced “Save not confirmed” after a cold launch. The old helper collapsed token failures, HTTP errors and network failures to `null`, and the widget action made one attempt. Its exact historical transport failure was not recoverable from those receipts.

The widget Save action now opts into typed transport errors and makes at most two idempotent POST attempts. It refreshes the Clerk token before retrying, recovers temporary network/server failures, and does not retry permanent permission errors. Account changes and leaving the screen cancel the operation. Request timeouts remain active when a caller supplies a cancellation signal. Success still requires a backend acknowledgement; the action never falls back to a direct database write. Diagnostics include transport kind/status/attempt only, without tokens, account IDs or opportunity IDs.

- Source fix: `bb162165`; source-image prevention: `899bcd1d` on `paul/mobile-widget-improvements`.
- Android widget-test OTA: `01a1d507-4fd9-78b0-8166-42c901360017`, group `c0fb9daf-eaa8-432f-995d-af211ea738e1`, runtime `1.0.0-sdk57`.
- Installed base APK: version code 23. No production mobile channel or Play release was changed.
- The four public API/auth runtime settings were checked against the APK's embedded bundle before publishing.
- A clean Metro export with source maps verified the actual Save route and service sources. An earlier isolated export reused a stale Router context from the previous diagnostic snapshot; it was superseded by the clean update above.
- Three cold launches using the authorized test account and the same opportunity (`28758c31-ee93-4516-acf8-81528ba75bc2`) showed server-confirmed success. The opportunity also remained visible in Saved Opportunities. Repeating this upsert did not authorize saving other opportunities.

## Incorrect scholarship photo

The source page for Chevron listing `a33d1b3a-12b8-40a1-a58d-77ac502f6bc7` had no article image. A broad `main img` fallback selected a Tongji University thumbnail from “Fully funded abroad” recommendations. A separate advertisement was also eligible for this fallback.

Extraction now prefers explicit article/content containers and excludes advertisements. Two regression cases reproduce this page structure. The affected live listing was corrected using the verified Chevron photograph from the matching internship listing, preserving source provenance and an image-review audit. Its previous generated share-card reference was invalidated.

The verified photo is hosted in the existing public `opportunities_images` bucket at:

`sha256/23/e5/23e53c52598ad007699a737498cd4392ce352040b04e9cd7f16f211aeca00355.jpg`

SHA-256: `23e53c52598ad007699a737498cd4392ce352040b04e9cd7f16f211aeca00355`.

## Backend release and rollback

The production backend still tracks `main`, commit `f84e6a0e626dd97191b1efa531d50433f151d0e5`. Dokploy's first attempt to patch the large scraper file failed with `spawn E2BIG` before building. That large-file patch is disabled.

A small enabled patch to `backend/services/services/api/Dockerfile` applies the two guarded, tested image-selector edits before `npm run build`. This deployment completed successfully in 6m 43s; the running backend container is `a5be62f9ffab`. The deployed `ScraperService` was invoked against the regression fixture and returned `[]`, confirming it excludes both the unrelated Tongji recommendation and the advertisement. `/health/ready` subsequently reported ready and the database up.

**Release follow-up:** Remove the temporary Dockerfile patch after merging the source fix into `main`. Its guards deliberately stop a future build if the original source selector has changed, rather than silently overwriting changed scraper logic. The disabled large-file patch can remain disabled. Rollback uses Dokploy's previous successful deployment; the source-image review metadata retains the previous incorrect URL.

## Verification

- Focused mobile: 4 suites / 18 tests passed in the workspace; the isolated release passed its 3 Save suites / 16 tests and TypeScript check.
- Scraper: 54 tests passed, including both new image regressions. The exact small build-patch transformation also passed the 54-test suite and an isolated Nest build.
- The broad mobile run passed 1,030 tests across 154 suites; `communityCallSignaling.test.ts` could not initialize due to local `ENOSPC`, then passed all 3 tests after clearing regenerable build caches.
- The broad backend run exhausted Node's heap; it is not reported as a passing full suite. Focused tests and the isolated/backend production builds passed.

Evidence is in the parent workspace's `output/verification/widget-save-image-2026-11-13/`, including cold-launch receipts, the Saved Opportunities screen, before/after source images and test logs. Earlier size/theme verification remains in the 12 November report.
