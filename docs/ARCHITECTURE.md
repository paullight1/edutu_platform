# Edutu Platform Architecture

Current platform architecture after the 5/5 production-readiness consolidation. See `ARCHITECTURE-BASELINE.md` for grandfathered debt and migration constraints, and `PACKAGE-OWNERSHIP.md` for shared-code rules.

## System context

```text
Learners, creators, admins, and partners
                  ↓
       web / mobile / admin clients
                  ↓
       NestJS API + approved edge functions
                  ↓
         Supabase Postgres and storage
                  ↓
Clerk, Gemini/OpenRouter, Paystack, RevenueCat,
Apify, n8n, push providers, and voice infrastructure
```

## Runtime ownership

| Runtime | Path | Responsibility |
| --- | --- | --- |
| Platform API | `backend/services/services/api` | Authentication, business rules, privileged data access, billing, entitlements, AI routing, scraper controls, notifications, admin APIs |
| Voice gateway | `backend/services/services/voice` | Real-time voice/session transport isolated from the main API |
| Web/PWA | `edutu-web-app` | Public discovery, learner workspace, marketplace, account and premium flows |
| Mobile | `edutumobile` | Expo learner application using the same authenticated API contracts |
| Admin | `admin` | Operational review, moderation, opportunity, creator, scraper, and platform controls |
| Shared packages | `packages` | Cross-app contracts and framework-independent reusable state |
| Database migrations | `backend/services/services/api/supabase/migrations` | Canonical forward-only shared database history |

## Trust and data boundaries

The API is the default owner of any operation involving service credentials, money, credits, entitlements, moderation, scraper execution, admin authority, or cross-user data. Web, mobile, and admin clients receive only public credentials and may use direct Supabase access only where reviewed RLS policies make the operation user-owned and safe.

No client may reference a Supabase service-role key or import implementation files from the API source tree. Architecture Governance enforces both rules.

## API request flow

1. A client obtains an authenticated Clerk or approved Supabase-compatible token.
2. The client sends the token and an optional request ID to the API.
3. request-ID, body-size, security-header, CORS, validation, and throttling middleware run before feature logic.
4. `ClerkAuthGuard` skips only routes explicitly marked `@Public()` and resolves the authenticated platform user for protected routes.
5. Controllers validate transport input and delegate to application/domain services.
6. Services apply authorization and business policy, then call repositories or provider adapters.
7. Structured errors and logs retain the request ID for operational correlation.

## Operational health contract

The API exposes three public health routes:

| Route | Purpose | Dependency behavior |
| --- | --- | --- |
| `GET /health/live` | Process liveness | Never probes the database; suitable for restart decisions |
| `GET /health/ready` | Traffic readiness | Executes a bounded `SELECT 1` through the canonical PostgreSQL pool; returns HTTP 503 when storage is unavailable |
| `GET /health` | Compatibility alias | Uses the same readiness semantics as `/health/ready` |

The database probe defaults to two seconds and is capped at ten seconds through `DATABASE_HEALTH_TIMEOUT_MS`. Public responses contain only sanitized failure categories, never raw connection errors or credentials. AI provider configuration is reported as operational context but does not masquerade as a successful database check.

## Core domain flows

### Opportunity ingestion and publication

1. An admin, schedule, or approved source triggers ingestion.
2. Source controls enforce rate, safety, provenance, and duplicate policies.
3. Extraction normalizes content; AI enrichment is applied only through governed routes.
4. Data-quality and review policy determine whether an opportunity can be published.
5. Published records feed discovery, ranking, application history, and notifications.

### Marketplace and entitlements

1. Creators submit listings through reviewed APIs.
2. Admin moderation controls publication state.
3. Enrollment or payment writes an auditable ledger transaction.
4. Durable entitlements are returned consistently to web and mobile.
5. Billing reconciliation repairs provider/local-state divergence without inflating balances.

### AI routing

1. A feature requests text or structured output through the server-side AI service.
2. Feature policy selects an allowed provider/model and cost ceiling.
3. Provider adapters execute with server-only credentials.
4. Structured responses are validated before use.
5. Usage, failure, and policy metadata are recorded for audit and cost control.

## Architecture invariants

- Privileged mutation logic lives in the API, not a UI component.
- Controllers remain transport-focused; domain rules belong in services or pure domain modules.
- Provider-specific code is isolated behind adapters where practical.
- Shared packages have stable public exports and do not import app pages or deployment wiring.
- New migrations use the canonical API migration directory; historical roots are frozen.
- New backend runtimes require explicit ownership and deployment evidence.
- Large modules are reduced behind tests; moving a large file without reducing coupling is not an architecture improvement.

## Deliberate next steps

The following are separate migrations, not hidden requirements of ordinary feature PRs:

1. Retire the grandfathered root Express backend after external hosting and rollback verification.
2. Flatten `backend/services/services/*` after every deployment root is updated and production-smoked.
3. Move reusable mobile-core modules into root packages after Metro/Jest/TypeScript/native-build verification.
4. Introduce a versioned public API and generated OpenAPI contract through a compatibility migration rather than changing every client route in place.
5. Standardize a global error envelope after existing client error handling is inventoried and contract-tested.
