# Weekly Digest Edge Function Security Runbook

## Scope and trust boundary

The canonical function is
`edutumobile/supabase/functions/weekly-digest/index.ts`. It is a scheduler-only
POST endpoint. It does not accept user JWTs, browser CORS calls, or a caller
selected user list. The function validates a timestamped HMAC credential,
claims one `(digest_day, execution_date)` job in the database, then processes a
bounded recipient set with the service-role Supabase client.

The HTTP response contains only `{ "sent": number, "skipped": number }`.
Emails, user IDs, provider responses, and query errors must not be returned or
written to logs.

## Required configuration

Store all values as server-side Edge Function secrets or scheduler secrets. Do
not put the service-role key or email provider key in a client bundle.

| Variable | Requirement |
|---|---|
| `SUPABASE_URL` | The Supabase project URL for the deployed canonical function. |
| `SUPABASE_SERVICE_ROLE_KEY` | Required server-only key used for the job-lock RPC and recipient queries. Never expose or log it. |
| `SUPABASE_EMAIL_API_KEY` | Server-only email provider key. Missing configuration is a retryable job failure and is never disclosed. |
| `WEEKLY_DIGEST_JOB_SECRET` | Random secret of at least 32 bytes, shared only by the scheduler and Edge Function. |
| `WEEKLY_DIGEST_JOB_KEY` | Optional stable scheduler principal matching `[A-Za-z0-9:_-]{1,80}`; defaults to `weekly-digest`. |
| `WEEKLY_DIGEST_PAGE_SIZE` | Optional positive integer, default 50, maximum 100. |
| `WEEKLY_DIGEST_MAX_RECIPIENTS` | Optional positive integer, default 500, maximum 5,000. |
| `WEEKLY_DIGEST_EMAIL_TIMEOUT_MS` | Optional positive integer, default 10,000 ms, maximum 30,000 ms. |

## Scheduler authentication contract

The scheduler sends a `POST` with the exact JSON body `{"day":6}` where day is
an integer from 1 (Monday) through 7 (Sunday). It must send:

- `x-edutu-digest-job-key`: the configured stable job key;
- `x-edutu-digest-timestamp`: ten-digit Unix seconds;
- `x-edutu-digest-signature`: `v1=<lowercase hex HMAC-SHA256>`.

The signed message is:

```text
<timestamp>.<job-key>.<exact raw request body>
```

Timestamps older or newer than five minutes, missing/short secrets, unknown job
keys, malformed signatures, and mismatches are rejected with the same generic
401 response. Signature comparison is constant-time. Do not substitute a
browser session token or a user JWT for this scheduler credential.

If the Supabase gateway is configured to require a Supabase JWT before the
function runs, configure the function's gateway auth mode to allow this
application-level scheduler boundary only after the HMAC handler is deployed.
The HMAC check remains mandatory for every POST.

## Idempotency and execution bounds

Apply the canonical migrations
`edutumobile/supabase/migrations/033_weekly_digest_job_lock.sql` followed by
`edutumobile/supabase/migrations/034_weekly_digest_retryable_job_claims.sql`
before enabling the schedule. Together they create and harden
`public.weekly_digest_jobs` with:

- a primary key on `(digest_day, execution_date)`;
- `status` values of `in_flight`, `succeeded`, or `failed`;
- a random claim token, attempt count, and fifteen-minute lease;
- RLS enabled;
- no `public`, `anon`, or `authenticated` table privileges;
- explicit service-role-only access; and
- service-role-only `claim_weekly_digest_job`, `complete_weekly_digest_job`, and
  `fail_weekly_digest_job` RPCs.

The function atomically claims the job before reading preferences, profiles,
goals, or bookmarks and before calling the email provider. A `succeeded` job or
an unexpired `in_flight` lease is duplicate-suppressed and returns
`{ "sent": 0, "skipped": 0 }` without recipient or email work. A failed claim
or an expired lease can be claimed again with a fresh token. Provider errors,
missing provider configuration, recipient data errors, and thrown send errors
mark the token `failed` so the next scheduler run can retry, including when a
recipient has no email address. Completion requires the current
claim token, so an old worker cannot complete or fail a newer lease.

Recipient queries are ordered and paged. One invocation processes at most the
configured page size and maximum recipient count, and each email request has a
bounded timeout. A failed individual recipient increments `skipped` and does
not expose the recipient or abort the remaining bounded batch.

## Enablement sequence

1. Identify the production Supabase project ref, deployed function revision,
   scheduler identity, and UTC schedule. Record them in the release ticket.
2. Apply and verify the job-lock migration in staging. Confirm the table RLS,
   table grants, function grants, and service-role RPC behavior.
3. Configure the Edge secrets and scheduler secret. Keep the schedule paused.
4. Deploy the canonical function and run signed staging tests for missing,
   stale, tampered, and valid credentials, invalid days, duplicate claims, and
   bounded execution, including a failure followed by a retry.
5. Confirm the scheduler sends the exact body and headers above, then enable
   the production schedule. Do not use a query-string day or a caller-selected
   user ID/list.
6. Monitor only aggregate invocation status, sent/skipped counts, claim
   failures, and provider latency. Do not log emails, IDs, raw payloads, or
   provider response bodies.

## Verification hold

Live production identifiers and scheduler access were not available during
this implementation. Production release is therefore held until an authorized
operator records all of the following for the exact project and revision:

```text
Supabase project ref: UNKNOWN
Canonical function deployment/revision: UNKNOWN
Scheduler identity and cron expression: UNKNOWN
Job-lock migration applied timestamp (UTC): UNKNOWN
Gateway JWT/auth mode verified timestamp (UTC): UNKNOWN
Operator: UNKNOWN
```

The hold is cleared only after the project ref, function revision, scheduler
identity/cron, migration application, and gateway auth mode are verified in
the deployment system. Before release, also run the project-scoped Supabase
Security Advisor and Performance Advisor, recording UTC timestamps and results
against that same project ref and revision. Repository tests cannot replace
live schema, scheduler, or advisor evidence.

## Local verification

```bash
npx deno test --allow-env --allow-net edutumobile/supabase/functions/weekly-digest/index_test.ts
npx deno check --allow-import edutumobile/supabase/functions/weekly-digest/index.ts
git diff --check
```
