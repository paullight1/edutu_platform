# Scrape Edge Function Security Runbook

## Purpose and trust boundary

`supabase/functions/scrape` fetches and extracts one page from an explicitly
approved scholarship source. It is not a general proxy. The handler authenticates
the caller before resolving or fetching the submitted URL and returns generic
errors so callers cannot use it to probe target reachability.

The function does not write to Supabase. Any future persistence must remain in a
backend or worker that uses a server-side service-role credential; never expose a
service-role key in a request or response.

## Required secrets and configuration

Configure these as Edge Function secrets without recording their values:

| Variable | Requirement |
|---|---|
| `SCRAPE_ALLOWED_HOSTS` | Comma-separated exact hostnames. No wildcards, schemes, ports, paths, or implicit subdomains. Start only with currently approved sources such as `opportunitiescircle.com`, `oyaopportunities.com`, `globalscholardesk.com`, `scholars4dev.com`, and `www.scholarshipportal.com`; remove any source not operationally approved. |
| `SCRAPE_ALLOWED_ORIGINS` | Comma-separated exact admin browser origins. Wildcards and `null` are rejected. HTTPS is required except for loopback development origins. |
| `SCRAPE_INTERNAL_JOB_SECRET` | Random secret of at least 32 characters, stored only by the function and trusted scheduler. |
| `CLERK_ISSUER_URL` | Exact HTTPS origin for the production Clerk instance. |
| `CLERK_AUTHORIZED_PARTIES` | Comma-separated exact Clerk authorized-party origins. |
| `CLERK_SECRET_KEY` | Server-only Clerk key used to load server-controlled role/email data after JWT verification. |
| `ADMIN_EMAILS` | Optional exact administrator email allowlist, matching the backend admin policy. |
| `DEEPSEEK_API_KEY` | Server-only provider key. |

Optional bounded settings are `SCRAPE_FETCH_TIMEOUT_MS` (default 10000, maximum
30000), `SCRAPE_MAX_RESPONSE_BYTES` (default 1000000, maximum 2000000),
`SCRAPE_MAX_REDIRECTS` (default 3, maximum 5), and
`SCRAPE_RATE_LIMIT_PER_MINUTE` (default 10, maximum 60). The AI endpoint remains
restricted to HTTPS on `api.deepseek.com`.

## Authentication contracts

Admin calls send a Clerk session token as `Authorization: Bearer <token>`. The
function verifies RS256, issuer, expiry/not-before, signature, and authorized
party, then confirms an approved server-controlled Clerk role or `ADMIN_EMAILS`
entry. Missing/invalid credentials return 401; authenticated non-admin users
return 403.

Internal jobs send:

- `x-edutu-job-key`: stable rate-limit principal matching
  `[A-Za-z0-9:_-]{1,80}`.
- `x-edutu-job-timestamp`: current Unix seconds, within five minutes.
- `x-edutu-job-signature`: `v1=<lowercase hex HMAC-SHA256>`.

The signed message is `<timestamp>.<job-key>.<exact raw request body>`. Rotate the
job secret after suspected disclosure and update scheduler/function atomically.

Because the function supports a custom HMAC credential, deployment may need the
Supabase gateway's JWT check disabled for this function. Do that only when this
handler version is deployed: application-level authentication remains mandatory
for every POST. Confirm the deployed auth mode rather than inferring it from this
repository.

## Network and response controls

Only HTTPS URLs on an exact configured hostname are accepted. Credentials,
non-default ports, fragments, wildcard/subdomain matching, non-HTML responses,
private/loopback/link-local/reserved IPv4 or IPv6 answers, and over-limit bodies
are rejected. Redirects are manual and each destination is reparsed, re-allowlisted,
and DNS-checked. DNS or runtime API failure is fail-closed. The response body is
streamed under the byte limit, and one abort deadline covers DNS, redirects, and
download. Attacker-controlled page text is stripped and capped at 8,000 characters
before provider input; provider output is capped at 65,536 bytes.

The in-isolate rate limiter is defense in depth, not a globally distributed quota.
Keep platform/API-gateway rate limiting enabled for production traffic.

## Pre-deployment verification

Do not deploy until an authorized operator has confirmed the production project,
Clerk issuer, deployed function identity/auth mode, and exact source/origin lists.
No live evidence is established by repository state.

Run locally:

```bash
npx deno test --allow-env --allow-net supabase/functions/scrape/index_test.ts
npx deno check --allow-import supabase/functions/scrape/index.ts
git diff --check
```

In a disposable local/staging function environment, smoke-test:

1. Missing auth returns 401 and performs no target fetch.
2. A normal Clerk user returns 403; a verified admin succeeds.
3. A correctly signed internal job succeeds; stale/tampered signatures return 401.
4. Wildcard/disallowed origins receive no CORS allow-origin header.
5. HTTP, loopback, RFC1918, link-local, metadata, disallowed-host, redirect-loop,
   oversized, timeout, and non-HTML requests fail with the generic error.
6. One approved HTTPS source succeeds and the response/logs contain no Clerk,
   scheduler, AI, Supabase, or full attacker-controlled URL secrets.

After deployment, monitor only coarse event/status metrics. The function logs the
caller kind on failure, never the submitted URL, provider error, token, or secret.
