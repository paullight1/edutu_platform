# Production Secret Rotation Register

**Register date:** 2026-08-12

**Verification mode:** repository-local names only

**Secret values recorded:** none

This register inventories secret and security-sensitive environment variable names found in the local Render, backend, and Supabase function references. Presence in source does not prove that a variable is configured in production. Every production status, owner, and rotation date remains `UNKNOWN` until an authorized operator checks the relevant secret store without copying values into this file.

## Production verification protocol

For each entry, the operator must record only:

- configured: `YES`, `NO`, or `NOT REQUIRED`;
- owning team or role;
- provider/store and consuming service or function;
- last-rotated or last-updated timestamp, if available;
- rotation ticket/change reference and verification outcome.

Never record a credential value, connection string, private key, webhook token, API token, or secret fingerprint that can be used for authentication.

## Render backend secrets

The current Blueprint for candidate service `edutu-api` declares the first eight names below with `sync: false`. Other names are consumed by backend code or listed in the backend `.env.example` but are absent from the Blueprint; that drift must be resolved in a later task after production usage is confirmed.

| Secret or sensitive name | Local source/consumer | Blueprint state | Production state | Owner | Last rotated | Required operator action |
|---|---|---|---|---|---|---|
| `DATABASE_URL` | Render Blueprint; backend database client | `sync: false` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm configured for the production database; rotate through the database/provider and Render maintenance process. |
| `SUPABASE_URL` | Render Blueprint; backend Supabase clients | `sync: false` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Verify the hostname maps to the authoritative production ref. This is an endpoint, not a credential. |
| `SUPABASE_SERVICE_ROLE_KEY` | Render Blueprint; privileged backend clients | `sync: false` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Treat as critical; confirm it exists only in server-side stores and rotate with coordinated backend/Edge Function updates. |
| `CLERK_SECRET_KEY` | Render Blueprint; backend auth/encryption fallback | `sync: false` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Verify production-instance ownership and rotate through Clerk plus Render. |
| `ADMIN_EMAILS` | Render Blueprint; admin authorization | `sync: false` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Review as sensitive authorization configuration; reconcile membership with the approved admin roster. |
| `DEEPSEEK_API_KEY` | Render Blueprint; backend AI and canonical `scrape` function | `sync: false` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Verify provider/project ownership and rotate in every confirmed consumer. |
| `GEMINI_API_KEY` | Render Blueprint; backend AI/embeddings | `sync: false` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Verify provider/project ownership and rotate in Render and any confirmed function consumer. |
| `AI_KEY_ENCRYPTION_SECRET` | Render Blueprint; backend AI key encryption | `sync: false` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Treat as critical key-encryption material; use a planned re-encryption/cutover procedure before revocation. |
| `DIRECT_URL` | Backend `.env.example` | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm whether production migrations or jobs require it; if required, manage as a database credential. |
| `OPENROUTER_API_KEY` | Backend `.env.example`; AI adapter | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm usage, provider scope, and rotation metadata. |
| `OPENAI_API_KEY` | Backend `.env.example`; AI/audio adapter | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm usage, provider scope, and rotation metadata. |
| `GROQ_API_KEY` | Backend `.env.example`; AI adapter | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm usage, provider scope, and rotation metadata. |
| `SERPER_API_KEY` | Backend `.env.example`; opportunity enrichment | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm usage, provider scope, and rotation metadata. |
| `APIFY_WEBHOOK_API_KEY` | Backend `.env.example` | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm webhook authentication usage and rotate at producer and consumer together. |
| `SCRAPER_ALERT_SLACK_WEBHOOK_URL` | Backend `.env.example`; scraper alerts | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Treat the webhook URL as a credential; confirm channel ownership and rotate if exposed or stale. |
| `PROXYCURL_API_KEY` | Backend `.env.example`; LinkedIn import | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm usage, provider scope, and rotation metadata. |
| `SCRAPINGBEE_API_KEY` | Backend `.env.example`; scraping | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm usage, provider scope, and rotation metadata. |
| `PAYSTACK_SECRET_KEY` | Backend `.env.example`; billing | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Treat as critical payment credential; rotate with webhook/payment smoke checks. |
| `BACHS_WEBHOOK_SECRET` | Backend `.env.example`; billing webhook | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Rotate at webhook producer and Render consumer in one approved window. |
| `EDUTU_API_KEYS` | Backend `.env.example`; API key guard | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Inventory active clients before rotation; migrate clients and revoke old keys. |
| `API_KEY_PEPPER` | Backend `.env.example`; API key hashing | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Treat as critical; rotation requires a compatibility or rehash migration plan. |
| `VAPID_PRIVATE_KEY` | Backend `.env.example`; web push | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Rotate as a key pair and update affected push clients/configuration. |
| `GOOGLE_CLIENT_SECRET` | Backend `.env.example`; calendar OAuth | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Rotate in Google and Render; verify OAuth callback flow. |
| `MS_CLIENT_SECRET` | Backend `.env.example`; calendar OAuth | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Rotate in Microsoft and Render; verify OAuth callback flow. |
| `REDIS_URL` | Backend `.env.example`; cache | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Treat as a credential-bearing connection string when authentication data is embedded. |
| `COMMUNITY_CALL_TOKEN_SECRET` | Backend `.env.example`; call token signing | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Rotate with a bounded overlap window based on token TTL. |
| `APNS_PRIVATE_KEY` | Backend `.env.example`; iOS push | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm Apple key ownership and rotate with push delivery verification. |
| `FCM_PRIVATE_KEY` | Backend `.env.example`; Android push | absent | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm service-account ownership and rotate with push delivery verification. |

## Supabase Edge Function secrets and sensitive configuration

The canonical tree currently contains only `scrape`. The remaining consumers are in noncanonical trees and must not be assumed deployed; they are included so an operator can reconcile live function secrets before those functions are migrated or retired.

| Secret or sensitive name | Local function reference | Production state | Owner | Last rotated | Required operator action |
|---|---|---|---|---|---|
| `DEEPSEEK_API_KEY` | canonical `scrape` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | If `scrape` is deployed, confirm secret scope and rotate with function redeployment/verification. |
| `SUPABASE_SERVICE_ROLE_KEY` | noncanonical `chat-proxy`, `n8n-webhook`, `clerk-webhook`, `delete-account`, `report-ai-content`, `revenuecat-webhook`, `weekly-digest` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Enumerate deployed consumers; rotate all confirmed copies in the same controlled cutover. |
| `OPENROUTER_API_KEY` | noncanonical `chat-proxy` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm whether deployed and rotate only through the verified function secret store. |
| `OPENAI_API_KEY` | noncanonical mobile `chat-proxy` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm whether deployed and rotate with audio/chat verification. |
| `CLERK_WEBHOOK_SECRET` | noncanonical `clerk-webhook` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Rotate at Clerk and the verified Edge Function consumer together. |
| `REVENUECAT_WEBHOOK_SECRET` | noncanonical `revenuecat-webhook` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Rotate at RevenueCat and the verified Edge Function consumer together. |
| `SUPABASE_EMAIL_API_KEY` | noncanonical `weekly-digest` | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm provider ownership and rotate if the function is retained. |
| `CLERK_ISSUER_URL` | noncanonical shared Clerk auth helper; backend auth | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm exactly one production issuer across Render and protected functions. This is security-sensitive configuration, not a secret. |
| `CLERK_JWKS_URL` | noncanonical shared Clerk auth helper | `UNKNOWN` | `UNKNOWN` | `UNKNOWN` | Confirm it belongs to the same production Clerk instance as the issuer. This is not a secret. |

Supabase-provided `SUPABASE_URL` and public/anonymous keys may be automatically available to functions. They are identifiers/public credentials, not service-role secrets, but their project binding must still match the authoritative production ref.

## Public client configuration (not secrets)

These locally referenced names must never be substituted for service-role or server credentials. They do not require secret rotation, but project/issuer binding should be verified during deployment inventory:

- `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`, `VITE_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_URL`
- `CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `VAPID_PUBLIC_KEY`, `VITE_VAPID_PUBLIC_KEY`
- `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`, `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`

## Rotation workflow

No credential was rotated during this local-only task. For each authorized rotation:

1. Confirm the authoritative production project/service and every active consumer; open an approved maintenance/change record.
2. Create the replacement credential at the provider with the narrowest required scope.
3. Update Render and/or the verified Supabase Edge Function secret store without placing the value in source, logs, tickets, screenshots, or this register.
4. Redeploy or restart affected consumers and verify health, authentication, billing/webhook, AI, database, or function behavior as applicable.
5. Revoke the previous credential only after all consumers are verified on the replacement.
6. Record owner, timestamp, ticket, configured state, verification result, and next review date—never the value.

Any secret with `UNKNOWN` production state remains an unresolved inventory item and must not be assumed absent or safe.
