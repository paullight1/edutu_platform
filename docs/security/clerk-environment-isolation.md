# Clerk environment isolation for canonical Edge Functions

The canonical Edge Functions live under `edutumobile/supabase/functions`.
Their Clerk JWTs must be verified against exactly one configured issuer for the
deployment environment.

## Production contract

Set these Supabase Edge Function environment values for every production
function that imports `_shared/clerk-auth.ts`:

```text
NODE_ENV=production
CLERK_ISSUER_URL=https://clerk.edutu.org
```

`DEPLOYMENT_MODE=production` is also accepted as the deployment-mode signal.
When either production signal is used, `CLERK_ISSUER_URL` is required, must be
an HTTPS origin without credentials, path, query, or fragment, and must not be
the known development issuer
`https://calm-gecko-44.clerk.accounts.dev`.

JWKS discovery is constructed only from the configured issuer:

```text
${CLERK_ISSUER_URL}/.well-known/jwks.json
```

The verifier rejects tokens whose `iss` differs from the normalized configured
issuer, as well as expired or not-yet-valid tokens, unsupported algorithms,
unknown signing keys, and invalid signatures. `CLERK_JWKS_URL` and a list of
fallback issuers are not accepted as alternate production trust roots.

## Development contract

Local/test deployments must set an explicit non-production mode, for example:

```text
NODE_ENV=development
CLERK_ISSUER_URL=https://calm-gecko-44.clerk.accounts.dev
```

When the mode is explicitly non-production and `CLERK_ISSUER_URL` is omitted,
the verifier retains the historical development fallback to the known Clerk
development issuer. No development fallback is available when the deployment
mode is production or unset.

## Protected entry-point audit

- `chat-proxy/index.ts`, `delete-account/index.ts`, and
  `report-ai-content/index.ts` call `verifyClerkRequest` before protected work.
- `clerk-webhook/index.ts` uses Svix webhook verification and is not a Clerk
  user-JWT entry point.
- `revenuecat-webhook/index.ts` uses its dedicated static webhook secret and is
  not a Clerk user-JWT entry point.
- `weekly-digest/index.ts` is a scheduler-owned function and is intentionally
  outside this task.

No direct JWT decoding or issuer-list bypass remains in the protected user
function entry points.

## Deployment verification hold

This repository does not contain the live Supabase Edge deployment values or a
live JWKS response. Before production rollout, operators must verify that every
protected function has `NODE_ENV` or `DEPLOYMENT_MODE` set to `production`,
that `CLERK_ISSUER_URL` is the live production issuer, and that the issuer's
`.well-known/jwks.json` endpoint is reachable. The focused tests use an
in-memory RSA key and injected fake issuer/JWKS dependencies and do not replace
that live verification.
