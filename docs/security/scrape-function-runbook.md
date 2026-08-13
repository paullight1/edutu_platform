# Scrape Edge Function Security Runbook

## Purpose and trust boundary

`supabase/functions/scrape` extracts one page from an explicitly approved
scholarship source through the Render egress service. It is not a general
proxy. The handler authenticates the caller and validates the exact target
allowlist before signing a request to the configured egress route; only the
backend egress service resolves or fetches the target URL. Generic errors keep
callers from probing target reachability.

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
| `SCRAPE_EGRESS_URL` | Required HTTPS URL for the backend `POST /internal/scraper-egress` route. It must be the exact deployed route, not a target page URL or a generic proxy. Missing or non-HTTPS configuration fails closed. |
| `SCRAPE_EGRESS_SHARED_SECRET` | Required server-only HMAC secret of at least 32 bytes. It must exactly match the Render `SCRAPE_EGRESS_SHARED_SECRET`; never expose or log its value. |
| `SCRAPE_EGRESS_PRINCIPAL` | Optional stable principal sent to Render in `x-edutu-egress-principal`; defaults to `edge-job`. |
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

Only HTTPS URLs on an exact configured hostname are accepted before signing.
Credentials, non-default ports, fragments, wildcard/subdomain matching, and
missing egress configuration are rejected. The signed POST contains exactly
`{"url":"..."}` and uses HMAC-SHA256 over
`<timestamp>.<principal>.<exact raw body>`. Render performs DNS/private-network,
redirect, timeout, response-size, and HTML-content enforcement before returning
the `{text, finalUrl}` result. Attacker-controlled page text is stripped and
capped at 8,000 characters before provider input; provider output is capped at
65,536 bytes.

The in-isolate rate limiter is defense in depth, not a globally distributed quota.
Keep platform/API-gateway rate limiting enabled for production traffic.

## Pre-deployment verification

Do not deploy until an authorized operator has confirmed the production project,
Clerk issuer, deployed function identity/auth mode, exact source/origin lists,
and the matching Edge/Render egress configuration.

### Render egress enablement sequence

Use this order so the Edge function never becomes dependent on an unconfigured
or unauthenticated route:

1. Identify and record the production Supabase project ref, Render service, and
   release commit. Generate one random HMAC secret of at least 32 bytes; place
   it in the Edge secret store as `SCRAPE_EGRESS_SHARED_SECRET` and in Render as
   `SCRAPE_EGRESS_SHARED_SECRET`. Compare configured secret values through the
   secret manager, not by printing them.
2. Configure Edge `SCRAPE_EGRESS_URL` to the exact HTTPS URL whose path is the
   backend `POST /internal/scraper-egress` route. Do not point it at a source
   hostname, redirect target, or generic proxy. Keep the Edge function
   fail-closed until the route is deployed.
3. Deploy the backend route with the same shared secret and matching exact
   `SCRAPE_EGRESS_ALLOWED_HOSTS` values. Keep the Render egress service disabled
   until the route and configuration are present; then set
   `SCRAPE_EGRESS_ENABLED=true` in Render and restart/redeploy the service.
4. Verify the signed route contract in staging or the approved canary path:
   `POST /internal/scraper-egress`, JSON body exactly `{"url":"..."}`, headers
   `x-edutu-egress-timestamp`, `x-edutu-egress-signature`, and
   `x-edutu-egress-principal`, with HMAC over
   `<timestamp>.<principal>.<exact raw body>`. A missing/mismatched secret,
   wrong route, disabled backend, or disallowed source must fail generically.
5. Deploy the Edge function only after the Render route is ready, then run the
   approved-source and disallowed-source smoke tests. Never enable the Edge
   path with a placeholder secret or a route that accepts unsigned requests.

### Mandatory Supabase advisor release gate

An operator must complete both advisor checks for the identified production
project before release. Repository tests are not a substitute for live advisor
evidence. Record the following in the release report or change ticket:

```text
Supabase project ref: <exact production project ref>
Release commit / deployed Edge revision: <commit or revision>
Security Advisor completed: <YYYY-MM-DDTHH:MM:SSZ>
Security Advisor result: <no unresolved release-blocking findings / details>
Performance Advisor completed: <YYYY-MM-DDTHH:MM:SSZ>
Performance Advisor result: <no unresolved release-blocking findings / details>
Operator: <named operator>
```

The timestamps must be UTC and tied to the exact project ref and release
revision. The release is blocked if either advisor result is missing, belongs
to a different project, is not timestamped, or has an unresolved critical/high
finding relevant to this change. Run the Security Advisor and Performance
Advisor from the Supabase Dashboard for that project (or the approved
project-scoped CLI/MCP equivalent) immediately before the production release.

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
