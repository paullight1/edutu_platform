# Edutu mobile store launch review — 31 October 2026

**Verdict: request changes. Hold App Store and Google Play submission.**

Reviewed the current `edutumobile/` source, native projects, Expo/EAS configuration, authentication, account deletion, AI data flow, purchases/restoration, community safety, and their relevant API/schema dependencies. There was no mobile working-tree diff when this review began. This is a launch readiness review of the current source, rather than a review of a proposed patch. Application code was not changed.

The installed stack is Expo 56 / React Native 0.85, despite older architecture documents describing Expo 55 / React Native 0.83. The findings below distinguish source evidence, locally reproduced behavior, and release checks that still need external evidence. No authenticated production database, provider, payment, or store-console operations were performed.

## Actionable findings

### 1. P1 — Account deletion uses the wrong identity for UUID-backed feature tables

**Location:** [delete-account/index.ts:141](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/supabase/functions/delete-account/index.ts:141), particularly the deletion loop at line 158.

The function takes the raw Clerk subject from `claims.sub` and uses that same value for every table. The API deliberately uses a derived UUID for several features: [ClerkAuthGuard:173](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api/src/auth/clerk-auth.guard.ts:173), [toDatabaseUserId:15](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api/src/common/user-id.ts:15), and the UUID `goals.user_id`, `quizzes.user_id`, and `flashcard_decks.user_id` definitions in [schema.ts:165](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api/src/db/schema.ts:165). The mobile CV service also explicitly distinguishes hashed profile/goal identifiers from raw CV identifiers.

For a normal `user_...` Clerk ID, deleting a UUID-backed table with that value produces an invalid UUID error. For text columns containing a derived UUID, the raw subject matches no rows. The loop aborts on non-`42P01` errors, and the UI consequently never reaches Clerk account deletion. Earlier deletes can already have committed, so a failed attempt can partially remove an account's data.

**Fix:** Put deletion behind a canonical, authenticated server workflow with table-specific ownership rules for both raw and derived identities. Make the operation retryable and avoid leaving partially deleted usable accounts. Do not perform a blind UUID conversion for every table: newer community and document tables intentionally use raw subjects.

**Verification gap:** No deletion integration test covers a real Clerk-shaped subject against the current schema. Seed goals, quizzes, CVs, and raw-subject community data; delete the account and verify every ownership representation. Inject a failure midway and test recovery.

### 2. P1 — Deletion omits current personal-data stores and local copies

**Location:** [delete-account/index.ts:11](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/supabase/functions/delete-account/index.ts:11), [storage cleanup:120](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/supabase/functions/delete-account/index.ts:120), and [settings.tsx:405](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/app/(app)/profile/settings.tsx:405).

The explicit deletion list excludes active personal-data tables including `user_ai_memories`, `ai_documents`, `user_uploads`, `application_documents`, `community_group_messages`, `community_dm_messages`, `saved_searches`, and `notification_push_tokens`. The document and memory schema definitions use independent text ownership fields without a profile deletion cascade: [schema.ts:401](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api/src/db/schema.ts:401). Storage cleanup handles only `ai-documents` and `creator-applications`, although uploaded CVs and transcripts live in `cv-files` ([schema.ts:447](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api/src/db/schema.ts:447)).

On-device deletion calls Clerk deletion/sign-out without purging offline CV data. CVs persist in AsyncStorage through [cv.ts:206](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/packages/core/src/services/cv.ts:206). Its `readLocalCVById` helper also scans all accounts' CV keys, rather than requiring the current account. This is a local ownership weakness; this review did not demonstrate remote access to another user's CV through the shipped UI.

Even after fixing finding 1, personal documents and memories would remain after the application claims deletion. Deleting a profile is insufficient for these independent tables. This conflicts with the product's published deletion promise and creates a launch/privacy risk. Google requires deletion paths for accounts and associated data, including a web request resource. [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

**Fix:** Inventory current data ownership across API, mobile, storage, notification tokens, and local caches. Delete or appropriately anonymize each category, explicitly document any required retention, recursively remove owned storage objects, and purge account-scoped local data/widgets. Scope offline CV reads and mutations to the active user. Preserve required financial audit records through an intentional retention policy rather than indiscriminate deletion.

**Verification gap:** Seed AI memories, drafted documents, uploaded files, community/DM content, push tokens, and local CVs. Verify deletion and retry behavior, including nested storage paths and multiple accounts sharing one device. Confirm a delayed provider webhook cannot recreate an active deleted account.

### 3. P1 — iOS rejects valid incoming-call timestamps before reporting to CallKit

**Location:** [AppDelegate.swift:59](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/ios/Edutu/AppDelegate.swift:59).

The delegate parses `ringExpiresAt` with a default `ISO8601DateFormatter`. The backend sends `Date.toISOString()` values, which include fractional seconds: [community-calls.service.ts:487](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api/src/community-calls/community-calls.service.ts:487). The default formatter rejects that representation. The guard then invokes completion and returns before `RNCallKeep.reportNewIncomingCall`.

**Locally reproduced with Swift/Foundation:** parsing `2026-10-31T10:15:30.123Z` with the current formatter returned `false`; enabling `.withFractionalSeconds` returned `true`. No APNs delivery was performed. Besides losing incoming calls, returning without reporting a VoIP call can cause iOS to terminate the app under PushKit's reporting contract. [Apple PushKit requirements](https://developer.apple.com/documentation/pushkit/pkpushtype/voip?language=objc).

**Fix:** Accept the server's fractional timestamp format and support any intentional non-fractional fallback. Audit malformed/expired push handling against the relevant iOS PushKit reporting requirements, rather than simply completing a reportable push without CallKit handling.

**Verification gap:** Add a native payload-parsing regression check using a real backend fixture. Verify incoming calls on a physical iPhone while foregrounded, backgrounded, and cold-started, plus delayed/expired deliveries. The JavaScript Jest suite cannot validate this native delegate path.

### 4. P1 — Personal AI data is sent without a specific disclosure and explicit permission gate

**Location:** [cv.ts:819](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/packages/core/src/services/cv.ts:819), with profile identity collection at [cv.ts:775](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/packages/core/src/services/cv.ts:775).

CV generation sends name/email/profile context, goals, and potentially the full current CV to the AI-backed API. The API enriches this context and passes it to the model service ([cv.service.ts:419](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/backend/services/services/api/src/cv/cv.service.ts:419)). Chat and live voice provide additional AI data-sharing paths. Searches through the mobile and relevant API flows found generic sign-up terms/privacy copy and OS permissions, but no specific AI sharing permission state/gate before these operations. The in-app privacy summary does not identify the AI recipients or explain what personal content is shared ([home.json:143](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/lib/i18n/locales/en/home.json:143)).

Apple guideline 5.1.2(i) requires disclosure of third-party AI sharing and explicit permission before personal data is shared. A generic terms/privacy notice does not demonstrate that requirement has been met. [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing).

**Fix:** Before the first affected AI operation, explain the data categories, actual configured providers, purpose, and relevant handling/retention. Offer a clear affirmative choice, persist the disclosure version and choice per account, and enforce it consistently across CV, chat, documents, inline AI actions, and live voice. A decline must prevent the corresponding data transmission. Keep the public policy and store privacy disclosures aligned with actual routing.

**Verification gap:** Test fresh accounts, social sign-in, accept/decline, account switching, provider/disclosure changes, and every AI entry point. Assert that no personal-data AI request leaves before permission.

### 5. P2 — Production app/universal links still have placeholders; iOS lacks the native entitlement

**Location:** [iOS entitlements:4](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/ios/Edutu/Edutu.entitlements:4), [AASA:6](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app/public/.well-known/apple-app-site-association:6), and [Android association:8](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutu-web-app/public/.well-known/assetlinks.json:8).

Read-only HTTP checks of both production association URLs returned the same placeholder Apple team ID and Play signing fingerprint as the checked-in files. Consequently neither domain association is ready to verify against a store-signed app. The committed iOS entitlements also omit `com.apple.developer.associated-domains`, despite `app.config.js` declaring `applinks:edutu.org`. The native projects are committed, so the app config alone does not prove the missing capability will be generated; the ordinary EAS flow skips prebuild for existing native projects. [Expo native-project guidance](https://docs.expo.dev/workflow/continuous-native-generation/).

Opportunity and referral/share links therefore cannot be relied on to open the installed app. This does not establish that custom-scheme Clerk sign-in is broken: those are different paths.

**Fix:** Publish the real Apple team/app identity and Play App Signing certificate fingerprint, add the associated-domain capability to the native iOS target/provisioning, and serve the association files with the expected content types. The live AASA response was `application/octet-stream`; configure it as JSON. Verify the release-signed entitlements rather than only Expo config.

**Verification gap:** Test HTTPS links from another app on clean store-signed iOS/Android installations, with the app both cold and already open. Verify Android domain-association status and the archived iOS entitlements. Deploy the web association correction through the production Docploy workflow.

### 6. P2 — Restore reports success before server-side access is restored

**Location:** [paywall.tsx:353](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/app/(app)/paywall.tsx:353).

`handleRestore` displays “Your purchases have been restored” whenever RevenueCat's restore request succeeds. It does not verify that any relevant entitlement was returned or wait for canonical server fulfillment. `refreshStatus` can also display RevenueCat state while the server still denies access. A successful SDK call with no purchases, a delayed transfer/webhook, or a failed server update can therefore produce a misleading success message and a still-locked paid feature. New purchases already use a separate server confirmation flow, making restoration inconsistent.

**Fix:** Distinguish no eligible purchases, processing, confirmed restored access, and provider errors. After restoration, reconcile the relevant authoritative entitlement and refresh feature access before showing completion. Do not require an expiry extension for an already-active restored entitlement: restoration differs from a new purchase.

**Verification gap:** Cover an empty store account, existing restored access, restoration to a new Clerk account/device, delayed webhook/transfer, and server failure. Verify a real paid server operation after the UI reports restoration.

### 7. P2 — The prepared listing screenshots show the iOS boot screen

**Location:** [App Store screenshot](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/store-assets/appstore/01-home.png), [Play screenshot](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/store-assets/play/01-home.png), and [capture.sh:84](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/edutumobile/scripts/store-shots/capture.sh:84).

Visual inspection of both prepared images shows an Apple logo and boot progress bar inside the device frame, under a headline promising the Edutu home feed. Neither image shows the app. The Play image also uses this iOS boot capture. Only `01-home.png` exists in each output directory, although the caption manifest defines six product screens. These local assets are unsuitable for a store listing and do not substantiate the advertised functionality. This review did not inspect images already uploaded to either store console. Apple's screenshot guidance requires actual app use. [Apple metadata guidelines](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata).

**Fix:** Recapture a fully booted device running the release app with representative populated data. Capture the intended home, opportunity detail, coach, deadlines, roadmap, and CV flows; produce and visually inspect platform-appropriate listing images. Make screenshot capture fail when Edutu cannot launch, rather than warning and permitting an unrelated screen capture.

**Verification gap:** Open every final generated PNG at submission size, confirm real app content and legible captions, and compare the uploaded store-console assets with the reviewed files. Image dimensions alone did not catch this failure.

## Verification and submission gates

A JavaScript export is not a signed native build or a store approval test. Commands were run from `edutumobile/` unless stated otherwise.

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0. |
| `npm test -- --runInBand --silent --runTestsByPath __tests__/config.test.ts __tests__/billingRouting.test.ts __tests__/billingFulfillment.test.ts __tests__/paymentsIdentity.test.ts __tests__/proStatusFulfillment.test.ts` | Passed: 5 suites, 19 tests. |
| `npm test -- --runInBand --silent` | Incomplete. Repeated UI test timeouts/failures were observed; stopped the broad run and reran the affected files separately. No full-suite pass is claimed. |
| `npm test -- --runInBand --silent --runTestsByPath __tests__/communityForms.test.tsx __tests__/communityChat.test.tsx __tests__/mobileOpportunityDetail.test.tsx` | Failed: 2 suites failed, 1 passed; 5 tests failed, 68 passed. Community forms passed on this rerun. Community chat failed lifecycle/report persistence/block/roster scenarios; opportunity detail failed the AI-summary test timeout. Some failures are timing-related; a production defect is not established merely by these test failures. Resolve or explain them in an isolated CI/device verification run. |
| `npm run lint` | Incomplete: manually interrupted after more than 16 minutes without a final result. No lint pass or lint diagnostic failure is claimed. |
| `CI=1 npx expo install --check` | Failed compatibility check: recommended patches for Expo, auth-session, dev-client, linking, router, sharing, and jest-expo differ from the installed versions. This is a maintenance/verification issue; no specific runtime defect was inferred from patch versions alone. |
| `CI=1 npx expo export --platform ios --platform android --max-workers 2 --output-dir /tmp/edutu-mobile-launch-export-limited` | Incomplete: interrupted after more than 6 minutes at Metro startup without completed platform bundles. An earlier default-worker export was also interrupted and retried with the worker limit. Expo returned exit 0 on interruption, but there was no completed export evidence, so this is not a passing build. |
| `plutil -lint` for app Info.plist, PrivacyInfo.xcprivacy, entitlements, and Expo.plist | Passed syntax checks. This does not validate privacy declarations or signed capabilities. |
| Swift/Foundation timestamp reproduction | Current parser rejected the backend ISO timestamp; fractional-seconds parser accepted it. Confirms finding 3's parsing failure. |
| `xcodebuild -version` | Local Xcode 26.5, build 17F42. No app archive was built. |
| Icon inspection | `assets/icon.png`: 1024 × 1024, no alpha channel. |
| Listing asset inspection | Opened both generated store PNGs: both contain the iOS boot screen, confirming finding 7. |
| Public HTTPS checks | Privacy, terms, and support URLs returned HTML/200. Both association files returned 200 with placeholder identities. Browser inspection timed out, so rendered policy/support content was not certified. |

All review-started checks were stopped or completed before handoff. The incomplete lint/export runs and failing UI tests remain release verification gaps; this report does not treat them as proven product crashes.

The source already contains several useful launch controls: Apple and Google sign-in UI, native RevenueCat checkout, a production test-key guard, restore/manage controls, terms/privacy links, community report/block controls, AI content reporting, a Clerk token bridge, production OTA channel separation, Android AAB output, and remote version auto-increment. Their presence is source evidence; real provider/device behavior still needs verification.

Before submission, collect the following release evidence:

| Gate | Evidence required |
| --- | --- |
| Signed release artifacts | Successful production iOS archive/IPA and Android AAB; correct bundle/package IDs, signing, versions, and production EAS environment. Local Android Gradle release configuration uses the debug signing config; verify the final EAS signing result rather than submitting a directly built debug-signed artifact. |
| Current SDK requirements | Apple currently requires Xcode 26+/iOS 26 SDK; Google Play requires target API 36 for new submissions/updates from August 31, 2026. The installed RN catalog targets 36; inspect the final AAB manifest. [Apple requirements](https://developer.apple.com/news/upcoming-requirements/), [Google target API requirements](https://developer.android.com/google/play/requirements/target-sdk). |
| Android native libraries | Validate 16 KB page-size compatibility of the actual AAB, especially WebRTC and other bundled native libraries; library versions alone are not proof. [Android verification guidance](https://developer.android.com/guide/practices/page-sizes). |
| Billing cutover | Real Apple/Play purchase, restore, cancellation, expiry, refund, and delayed-webhook evidence. The repository's [IAP evidence record:24](/Users/MAC/Desktop/Desktop/app-projects/Edutu_Folder/docs/verification/revenuecat-iap-launch-evidence.md:24) still marks external cutover/transactions pending. This review did not determine whether those external steps have since happened. Confirm the Nest webhook is active and the retired Supabase endpoint is no longer registered. |
| Account/privacy flows | Resolve findings 1, 2, and 4; verify in-app and public web deletion paths, current App Privacy/Data safety answers, retention, SDK data collection, and required-reason manifests. HTTP 200 from a SPA policy URL alone does not validate its rendered content. |
| Review access and metadata | Working reviewer account/instructions, social sign-in including Apple private relay, any verification bypass appropriate for reviewers, support contact, screenshots, descriptions, age/content ratings, UGC/AI declarations, and paid-agreement/product approval status. No store-console metadata was inspected. |
| Device smoke tests | Small iPhone and supported minimum iOS; mid-range Android; slow/offline network; permission denial; app restart; sign-out/account switching; purchases; deletion; push/calls; widgets; large text; dark mode; Arabic/RTL; reduced motion. No store-signed physical-device smoke test was performed. |
| Release controls | Confirm native crash visibility/symbolication, production API health in Docploy, provider secrets/keys, push credentials, OTA compatibility and rollback. `runtimeVersion` is fixed at `1.0.0`, so future native changes require an intentional runtime/version strategy. |

**Approval condition:** Resolve the P1 findings and verify the relevant P2 flows, then attach signed-build, store/provider, and device evidence. This review does not certify the current app for submission.
