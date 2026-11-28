# Edutu Auto Apply staging handoff

Updated 28 November 2026. The original Codex goal is paused. The local synthetic journey passed. The hosted provider journey, live OpenAI drafting, and physical iPhone push delivery are still pending.

## Deployment inventory

The four services below are in the [`auto-apply-staging` environment of the existing `edutu` Dokploy project](https://console.edutu.org/dashboard/project/r0MTR0iWP-ZKSfLuq7E7X/environment/pOTw_lb6cKU2OyCRTh67d). The latest dashboard check showed no deployments for either the staging API or the new staging adapter.

| Service | Purpose and last verified state |
| --- | --- |
| Auto Apply Staging API | NestJS API for learner auth, drafts, approvals, limits, receipts, and notifications. Points at the published staging branch. The private network attachment is saved and takes effect on deploy. |
| Auto Apply Staging Adapter | Intended long-running Compose browser worker. Points at `.dokploy/auto-apply/compose.staging.yaml` on the published staging branch. Autodeploy is off. The service still needs its runtime settings and approved mapping. |
| Auto Apply Synthetic Acceptance | Isolated, one-shot test with a synthetic learner, local PostgreSQL, and a test portal. The acceptance container exited successfully and its separate sandboxed worker showed healthy in Docker. |
| Auto Apply Staging Worker | Earlier standalone service. Its container exited with a Chromium sandbox error. Use the staging Compose adapter for the hosted test. |

- **API and adapter source** is [`paul/auto-apply-dokploy-staging` at `7f945ec3`](https://github.com/paullight1/edutu_platform/commit/7f945ec3092b02792d177e3114c7bd86397392d9).
- **Mobile source** is [`paul/auto-apply-device-staging` at `c84ec677`](https://github.com/paullight1/edutu_platform/commit/c84ec677b9f74baa8d9b1a190a1a68c2742b8d71). It has the `auto-apply-staging` internal device and `auto-apply-staging:simulator` EAS profiles. The published tree matches the locally tested mobile tree.
- **Private API–adapter network** is `edutu-auto-apply-staging-api`. Dokploy verified that it is an internal, attachable overlay. It is saved on the API. The adapter still needs `AUTO_APPLY_STAGING_API_NETWORK` set to that name and a separate filtered provider-egress network.

## Verified behavior

- The local API went through the browser worker's HTTPS listener with Chromium sandboxing enabled. It selected one of two fake CVs, answered a prompt, edited a draft, rejected stale approval, approved the current version once, and received `SIMULATOR-CV-f008d200`. The simulator fixtures provide synthetic drafts and receipts.
- iPhone simulator journeys covered first-use setup, a supporting PDF upload, a returning learner, background progress, Pause and Resume, review, and notification links to the correct attempt. Simulator-injected push and Live Activity links exercised navigation. Physical APNs delivery remains pending.
- Targeted verification passed for 147 backend tests, 127 mobile tests, three mobile release configuration tests, and TypeScript. The Applied tracker distinguishes a learner-recorded submission from a provider-confirmed receipt.
- The adapter supports explicitly mapped forms. Google Forms support and a provider-approved live sandbox run remain unverified. Earlier staging checks found the API runtime still lacked staging database, Clerk, and OpenAI settings. A local live OpenAI attempt returned a quota or credit error. Check the actual OpenAI project and route during staging.

## Deploy and verify in staging

1. **Confirm the sandbox and staging credentials.** Obtain an authorized provider sandbox form and the corresponding Edutu staging listing. Use a fictional profile and CV. Provision a separate staging database and storage, a Clerk test instance, a staging learner, and an OpenAI project key with available quota. Keep values in the relevant secrets stores.
2. **Apply the database migrations and deploy the API.** Verify the staging database and its migration baseline before applying the candidate's ordered migrations from `backend/services/services/api/supabase/migrations/`, including Auto Apply through `20261127083000_auto_apply_manual_review.sql`. In **Auto Apply Staging API → Environment → Environment Settings**, configure the staging database, Supabase, Clerk, and `OPENAI_API_KEY`. Verify the Auto Apply drafting route selects OpenAI and record a successful request using only synthetic data. Add the intended HTTPS staging API domain so the test build can reach it.
3. **Deploy the Compose adapter.** Configure the existing private overlay, filtered egress, shared `AUTO_APPLY_PROVIDER_TOKEN`, approved mapping file, and TLS certificate, key, and CA mounts. Keep Chromium sandboxing enabled and retain durable receipt storage. Configure the API's same-origin adapter endpoints and CA trust. Confirm readiness from the staging API and run the read-only mapping and learner availability check before enabling the test listing and learner. The [adapter runbook](../../edutu-web-app/scripts/auto-apply/README.md) specifies the Compose variables, endpoints, and verification command.
4. **Build and test on the physical iPhone.** Supply the staging API URL, staging Supabase URL and public key, and a Clerk `pk_test_` key through the EAS environment used by the staging profiles. The shared preview environment was observed using a live Clerk key. Use an isolated configuration for this build and preserve other preview consumers. Keep in mind that the staging build retains Edutu's native application identifiers. Verify push credentials and device registration, then receive a real Expo/APNs notification and tap it to the exact attempt.
5. **Run the acceptance journey and capture evidence.** Start from the opportunity page, select the fictional CV, answer missing information, verify a live OpenAI draft, edit and review what will be sent, approve the current version, and confirm a single submission and the sandbox receipt. Check that reopening the app retains progress. Verify the original acceptance checks for first-time and returning users, pause and resume, handoff and errors, edits and stale approval, allowance and recovery, and notification settings. Keep deployment IDs, sanitized logs, and receipt evidence beside the test results.
6. **Verify capacity before inviting 100 learners.** The adapter runs one browser operation at a time. Exercise realistic bursts in staging and record queue times, memory, retry outcomes, and duplicate submission checks. Start with a small, opt-in learner cohort on supported forms when authorized, then expand only when the measured results meet the agreed capacity and reliability targets. Keep the manual Apply path available and preserve pending receipt lookup during a rollback.

The current authorization covers staging and synthetic learner data. A production deployment or real applicant rollout needs explicit authorization and a separate release decision after the staging checks pass.

## Paste into a new Codex chat

```text
Finish Edutu Auto Apply in this workspace. Read AGENTS.md and docs/operations/auto-apply-staging-handoff.md. Read the original goal at /Users/MAC/.codex/attachments/397fb383-8fee-4a04-8ed1-5a1ac55c5c97/goal-objective.md if it is available. Use the published staging branches and current Dokploy/EAS state as the starting point. Preserve the dirty working tree and use an isolated checkout where needed.

Get the staging API and sandboxed browser adapter deployed and connected in Dokploy. Use fake applicant data and one explicitly authorized provider sandbox. Run through Edutu Mobile from the opportunity page to a verified provider receipt. Show that OpenAI generated the draft in staging, an actual push arrived on my physical iPhone and opened the correct attempt, the learner could edit and approve the final version, and the provider received exactly one application. Check the recovery, allowance, and notification cases in the handoff. Then verify readiness for a 100-learner pilot with a realistic staging load test and clearly report the queue and reliability results.

Use the staging secrets stores and preserve existing project settings and data. If access, a provider sandbox, credentials, or the physical phone require my involvement, identify the exact missing item and location and continue any independent work. Keep deployment in staging unless I explicitly authorize production after reviewing the staging evidence. Update the handoff with deployment IDs, tests, and remaining gaps. Only call the goal complete when the agreed gates are verified.
```
