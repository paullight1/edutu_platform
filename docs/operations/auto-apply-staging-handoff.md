# Edutu Auto Apply staging handoff

Updated 28 November 2026. Local runs completed 100 synthetic applications. The first hosted stress run admitted 100 but returned 28 receipts before the cutoff. The hosted provider journey, live OpenAI drafting, physical iPhone push delivery, and hosted test at the mobile polling cadence remain open.

## Deployment inventory

The four services below are in the [`auto-apply-staging` environment of the existing `edutu` Dokploy project](https://console.edutu.org/dashboard/project/r0MTR0iWP-ZKSfLuq7E7X/environment/pOTw_lb6cKU2OyCRTh67d). The latest dashboard check showed no deployments for either the staging API or the new staging adapter.

| Service | Purpose and last verified state |
| --- | --- |
| Auto Apply Staging API | Service ID `9gzzWzlxzP8BuU_Jqbrmv`. Dokploy showed no deployment IDs. Environment Settings contained only `NODE_ENV` and `PORT`. The private network attachment is saved and takes effect on deploy. |
| Auto Apply Staging Adapter | Service ID `5yRB9U6esp25gzeFFkBAO`. Dokploy showed no deployment IDs. Compose path is `.dokploy/auto-apply/compose.staging.yaml` and autodeploy is off. The adapter still needs its runtime settings and approved mapping. |
| Auto Apply Synthetic Acceptance | Isolated, one-shot test with a synthetic learner, local PostgreSQL, and a test portal. The acceptance container exited successfully and its separate sandboxed worker showed healthy in Docker. |
| Auto Apply Staging Worker | Earlier standalone service. Its container exited with a Chromium sandbox error. Use the staging Compose adapter for the hosted test. |

- **API and adapter source** is [`paul/auto-apply-dokploy-staging`](https://github.com/paullight1/edutu_platform/tree/paul/auto-apply-dokploy-staging). The earlier hosted candidate was `7f945ec3`. The branch also carries the synthetic load test and worker fixes documented below.
- **Mobile source** is [`paul/auto-apply-device-staging` at `c84ec677`](https://github.com/paullight1/edutu_platform/commit/c84ec677b9f74baa8d9b1a190a1a68c2742b8d71). It has the `auto-apply-staging` internal device and `auto-apply-staging:simulator` EAS profiles. The published tree matches the locally tested mobile tree.
- **Private API–adapter network** is `edutu-auto-apply-staging-api`. Dokploy verified that it is an internal, attachable overlay. It is saved on the API and configured on the adapter as `AUTO_APPLY_STAGING_API_NETWORK`. The API's six private adapter endpoints are set, and both pilot lists are empty. The adapter still needs a separate filtered provider-egress network, mounted files, and shared token.

## Verified behavior

- The local API went through the browser worker's HTTPS listener with Chromium sandboxing enabled. It selected one of two fake CVs, answered a prompt, edited a draft, rejected stale approval, approved the current version once, and received `SIMULATOR-CV-f008d200`. The simulator fixtures provide synthetic drafts and receipts.
- iPhone simulator journeys covered first-use setup, a supporting PDF upload, a returning learner, background progress, Pause and Resume, review, and notification links to the correct attempt. Simulator-injected push and Live Activity links exercised navigation. Physical APNs delivery remains pending.
- Targeted verification passed for 147 backend tests, 127 mobile tests, three mobile release configuration tests, and TypeScript. The Applied tracker distinguishes a learner-recorded submission from a provider-confirmed receipt.
- The adapter supports explicitly mapped forms. Google Forms support and a provider-approved live sandbox run remain unverified. Earlier staging checks found the API runtime still lacked staging database, Clerk, and OpenAI settings. A local live OpenAI attempt returned a quota or credit error. Check the actual OpenAI project and route during staging.

## Deploy and verify in staging

### Provider approval

Lever provides sandbox accounts through its partner review. Ask through the [Lever Partnership Interest form](https://www.lever.co/partnershipinterest). If Edutu already has a partner with Greenhouse Recruiting Pro, a Greenhouse sandbox admin can arrange a mock posting and confirm the sandbox-only job board URL. Neither provider's sandbox has been approved or mapped for Edutu yet. Verify the exact form read-only against the adapter before claiming compatibility. [Lever sandbox process](https://hire.lever.co/developer/partner), [Greenhouse sandbox guidance](https://support.greenhouse.io/hc/en-us/articles/17053185557787-Use-a-sandbox)

Suggested staging listing title after approval: **Auto Apply sandbox · Lever** (or the approved provider's name).

> **Subject:** Request for one fictional application in a Lever sandbox
>
> Hello Lever Partnerships team,
>
> Edutu is testing a learner-controlled application assistant. The learner reviews the completed form and explicitly approves submission. Could you authorize one automated browser submission on a sandbox-only test posting, or direct us to the appropriate tenant administrator or testing program?
>
> We would use a fictional applicant and a synthetic résumé. We would submit once, confirm that the sandbox received the application, and stop. We will run our load tests against our own isolated fixture.
>
> If this test is permitted, please share the exact candidate-facing sandbox application URL, any restrictions on browser-based testing, and a ticket or written approval reference we can retain. We can follow a different supported test method if a hosted sandbox form is unavailable.
>
> Thank you,
> Edutu

### Deployment steps

1. **Confirm the sandbox and staging credentials.** Obtain an authorized provider sandbox form and the corresponding Edutu staging listing. Use a fictional profile and CV. Provision a separate staging database and storage, a Clerk test instance, a staging learner, and an OpenAI project key with available quota. Keep values in the relevant secrets stores.
2. **Apply the database migrations and deploy the API.** Verify the staging database and its migration baseline before applying the candidate's ordered migrations from `backend/services/services/api/supabase/migrations/`, including Auto Apply through `20261127083000_auto_apply_manual_review.sql`. In **Auto Apply Staging API → Environment → Environment Settings**, configure the staging database, Supabase, Clerk, and `OPENAI_API_KEY`. Verify the Auto Apply drafting route selects OpenAI and record a successful request using only synthetic data. Add the intended HTTPS staging API domain so the test build can reach it.
3. **Deploy the Compose adapter.** Configure the existing private overlay, filtered egress, shared `AUTO_APPLY_PROVIDER_TOKEN`, approved mapping file, and TLS certificate, key, and CA mounts. Keep Chromium sandboxing enabled and retain durable receipt storage. Configure the API's same-origin adapter endpoints and CA trust. Confirm readiness from the staging API and run the read-only mapping and learner availability check before enabling the test listing and learner. The [adapter runbook](../../edutu-web-app/scripts/auto-apply/README.md) specifies the Compose variables, endpoints, and verification command.
4. **Build and test on the physical iPhone.** Supply the staging API URL, staging Supabase URL and public key, and a Clerk `pk_test_` key through the EAS environment used by the staging profiles. The shared preview environment was observed using a live Clerk key. Use an isolated configuration for this build and preserve other preview consumers. Keep in mind that the staging build retains Edutu's native application identifiers. Verify push credentials and device registration, then receive a real Expo/APNs notification and tap it to the exact attempt.
5. **Run the acceptance journey and capture evidence.** Start from the opportunity page, select the fictional CV, answer missing information, verify a live OpenAI draft, edit and review what will be sent, approve the current version, and confirm a single submission and the sandbox receipt. Check that reopening the app retains progress. Verify the original acceptance checks for first-time and returning users, pause and resume, handoff and errors, edits and stale approval, allowance and recovery, and notification settings. Keep deployment IDs, sanitized logs, and receipt evidence beside the test results.
6. **Verify capacity before inviting 100 learners.** The adapter runs one browser operation at a time. Exercise realistic bursts in staging against a separate synthetic portal fixture and reserve the approved provider sandbox for the single acceptance submission. Record admission and worker queue times, container memory, retry outcomes, and duplicate submissions. Start with a small, opt-in learner cohort on supported forms when authorized, then expand only when the measured results meet the agreed capacity and reliability targets. Keep the manual Apply path available and preserve pending receipt lookup during a rollback.

## 28 November staging recheck

| Gate | Evidence |
| --- | --- |
| Pinned API and mobile sources | The source recheck used the published API at `e052fdd6` and mobile at `c84ec677`. The files used for the recheck came from the published code and were extracted outside the shared checkout. |
| API behavior | 132 focused tests passed across Auto Apply controller, admin, worker, activity, and notification services. The API build TypeScript check passed. |
| Synthetic receipt | Published staging acceptance script, local PostgreSQL, and HTTPS adapter with Chromium sandboxing enabled. The selected research CV, missing answer and in-app notification link, edited draft, stale approval rejection, one provider-fixture write, and one allowance charge were verified. Synthetic receipt `SIMULATOR-CV-83d67bdb`. |
| Allowance and recovery | The browser-backed quota fixture passed the three-run limit, concurrent and duplicate starts, admin override, simulated paid entitlement, and UTC reset checks. An expired provider session paused before any portal write and resumed the same attempt. Post-approval pause returned to review and restored edits. Preflight blocked an unmapped required field before charging. Incomplete submit settings preserved the attempt and used no allowance until restored. |
| Submission and drafting recovery | Disabling the pilot blocked new starts and recovered an existing receipt without a second write. An interruption after the first POST of a multi-page form left the attempt unresolved and blocked replay. Entering provider-site submission mode preserved the draft and blocked Edutu approval until the learner switched back. A learner-recorded submission completed the original attempt and tracker without a second write. After a simulated drafting outage, one retry resumed the original attempt and reached review without another allowance charge. |
| Notification preference | Android fixture verified that disabling push preserved the in-app prompt and re-enabling it resumed progress delivery without rebinding. Expo transport was simulated. |
| Mobile build and tests | 132 tests passed across seven focused mobile suites, three release configuration tests passed separately, and mobile TypeScript passed. EAS returned no iOS builds for profile `auto-apply-staging`, and the device listing returned no Apple teams for account `edutu`. Shared EAS preview still uses a live Clerk publishable key. Xcode listed the paired iPhone 14 Pro Max as unavailable. |
| Hosted load and receipt | Pending. The approved provider form, hosted application receipt, and Dokploy load evidence are still required. See the local rehearsal below. |

The published API defaults `docs.sop` drafting to DeepSeek. In the staging database, set the `docs.sop` row in `public.ai_routes` to OpenAI and a model the staging project can use. Verify a successful `docs.sop` request logs OpenAI as the provider and leaves sensitive content unsampled.

The sandbox owner needs to supply the exact approved form URL, approval reference for one fictional submission, and the matching Edutu staging listing ID or enough information to create it. Install the stage-only `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, and funded `OPENAI_API_KEY` under **Auto Apply Staging API → Environment → Environment Settings**, or identify existing staging secrets by reference. Confirm the test Clerk issuer and learner. The connected Edutu Supabase account showed no active staging project. Keep keys and database passwords in the staging secret stores.

For adapter deployment, the Compose host needs the approved mapping, read-only TLS certificate/key/CA mounts, and a filtered egress network for the approved host. The API needs its mounted CA and the same adapter token in Dokploy. Keep the pilot IDs empty until readiness and mapping verification pass. The iOS build needs the confirmed staging HTTPS API and Supabase endpoints, a staging Supabase public key, and a `pk_test_` Clerk publishable key in an isolated build configuration. Verify Apple signing and push credentials for the Edutu EAS project. The paired iPhone must be connected and unlocked for installation and the physical notification tap.

The published API runs preparation and approved submission on 15-second schedules, claiming at most one attempt per tick for each operation. A burst of 100 already-approved attempts takes at least 24 minutes 45 seconds from the first submission claim to the last on one API instance, even before adapter contention, receipt time, or retries. The local fixture polls every second. Use the deployed job cadence when measuring the staging pilot.

### Interrupted 100-learner local rehearsal

The loopback rehearsal used 100 fictional learners, one sandboxed Chromium instance, PostgreSQL, a synthetic drafting response, and a CV form with 150 ms of added portal latency. Ten waves of ten starts were spaced six seconds apart. All 100 were admitted by the 61-second sample after 45 HTTP 503 start retries. By the 145-second sample the worker had recorded 57 preparation deferrals and two submission deferrals.

Chromium disconnected during the run. The fixture had recorded three confirmed submissions and two unconfirmed attempts. The portal recorded three successful writes for three distinct fictional learners, with zero duplicate writes observed. A database snapshot showed that 16 failed attempts with no usable progress had restored their allowances and ten failed attempts with usable progress retained the charge. The Mac restarted before the timing percentiles and RSS summary were collected. The Compose runtime's restart, persistent receipt lookup, and recovery under replay need a separate hosted check.

### Completed 100-learner local rehearsal

The repeatable load fixture used the same loopback sandbox, one Chromium instance, ten waves of ten fictional learners, and synthetic drafting. It ran after the adapter change that waits for browser-context cleanup before sending a response. All 100 learners had a unique synthetic CV receipt and one allowance charge by **4 minutes 32 seconds**. The portal recorded 100 successful writes for 100 learners, with zero duplicates. Chromium remained connected.

| Metric | Result |
| --- | --- |
| Start admission | Median 1.15 seconds, p95 6.81 seconds, max 8.86 seconds |
| Admission to first question | Median 1 minute 45 seconds, p95 3 minutes 16 seconds, max 3 minutes 31 seconds |
| Approval to receipt | Median 2.03 seconds, p95 3.11 seconds, max 16.89 seconds |
| Retries and deferrals | 55 learner-start HTTP 503 retries. The adapter returned 16 verification, eight preparation, and four submission HTTP 503 responses. |
| Memory | Peak Node fixture RSS of 337 MiB. A separate host sample observed up to 771 MiB summed Chromium process RSS and 195 MiB summed PostgreSQL process RSS. Summed RSS can count shared memory more than once. |

The trial used a one-second local tick and did not measure hosted container memory. The production scheduler change was tested separately and makes preparation and submission share one 15-second schedule so both get a turn. To rerun the synthetic load test, set `AUTO_APPLY_TEST_LOAD_LEARNERS=100` on the isolated **Auto Apply Synthetic Acceptance** Compose job, or follow the local command in the [adapter runbook](../../edutu-web-app/scripts/auto-apply/README.md). Measure the real staging cadence separately before inviting learners.

### Hosted stress run and mobile-cadence replay

In Dokploy, **Auto Apply Synthetic Acceptance** was repointed to `paul/auto-apply-dokploy-staging`, with automatic deploys off and `AUTO_APPLY_TEST_LOAD_LEARNERS=100`. The build used the isolated Compose job with network mode `none`. The hosted one-second polling run at `d36ee152` ran in acceptance container `6c78f653832e` and exited with code 1 after the 12-minute cutoff. It admitted all 100 learners and completed **28 receipts**. There were 28 successful portal writes and zero duplicates. Chromium was still connected at the final sample.

- The hosted run logged 112 learner-start retries. The adapter returned 21 verification, 37 preparation, and two submission HTTP 503 responses.
- Admission p95 was 32.88 seconds for all 100 learners. First-question p95 was 11 minutes 1 second among the 29 learners who reached the question. Approval-to-receipt p95 was 36.58 seconds among the 28 completed learners. The latter two measurements describe completed steps only.
- The combined fixture had a 1.5 CPU quota and a 1.5 GiB memory limit. Dokploy observed about 151% CPU and 982 MiB memory in one sample. Peak Node-only RSS was about 366 MiB.
- The test now defaults to the mobile app's eight-second status interval. Locally, that driver completed 100 learners in **4 minutes 44 seconds**, with 100 unique receipts, one allowance charge per learner, 1,560 status reads, and zero duplicate writes. Its first-question p95 was 3 minutes 7 seconds. The hosted run with this polling cadence is still pending.

### Staging environment provisioning

- The user confirmed `my-edutu's Org` for the isolated `edutu-auto-apply-staging` project. Creation in `eu-west-1` returned `PaymentRequiredException` because the organization has overdue invoices. A follow-up project listing confirmed creation did not leave a project behind. The organization owner needs to settle the invoices under **Billing → Invoices** before project creation can be retried.
- Clerk Dashboard opened at its sign-in page. Once signed in to the Edutu workspace, create the separate `Edutu Auto Apply Staging` application and use its Development instance. Use test credentials for the fixture learner and staging clients.
- A fresh local PostgreSQL probe confirmed that `20251028081031_cv_storage_status.sql` expects `public.cv_records` to exist. A second replay loaded the checked-in `schema.sql` with local Auth and Storage metadata stubs, then stopped at `20260505000000_performance_indexes.sql` because `public.flashcard_reviews` was absent. Use a validated schema-only baseline and its migration history before applying release migrations to the new Supabase project. The local simulator's fixture schema was built for the acceptance harness.

The current authorization covers staging and synthetic learner data. A production deployment or real applicant rollout needs explicit authorization and a separate release decision after the staging checks pass.

## Paste into a new Codex chat

```text
Finish Edutu Auto Apply in this workspace. Read AGENTS.md and docs/operations/auto-apply-staging-handoff.md. Read the original goal at /Users/MAC/.codex/attachments/397fb383-8fee-4a04-8ed1-5a1ac55c5c97/goal-objective.md if it is available. Use the published staging branches and current Dokploy/EAS state as the starting point. Preserve the dirty working tree and use an isolated checkout where needed.

Get the staging API and sandboxed browser adapter deployed and connected in Dokploy. Use fake applicant data and one explicitly authorized provider sandbox. Run through Edutu Mobile from the opportunity page to a verified provider receipt. Show that OpenAI generated the draft in staging, an actual push arrived on my physical iPhone and opened the correct attempt, the learner could edit and approve the final version, and the provider received exactly one application. Check the recovery, allowance, and notification cases in the handoff. Then verify readiness for a 100-learner pilot with a realistic staging load test and clearly report the queue and reliability results.

Use the staging secrets stores and preserve existing project settings and data. If access, a provider sandbox, credentials, or the physical phone require my involvement, identify the exact missing item and location and continue any independent work. Keep deployment in staging unless I explicitly authorize production after reviewing the staging evidence. Update the handoff with deployment IDs, tests, and remaining gaps. Only call the goal complete when the agreed gates are verified.
```
