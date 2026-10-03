# Edutu Codex Role Skills and Workflow

These repo-scoped skills give Codex repeatable role-specific workflows. They are not human hiring roles and do not spawn agents by themselves. Invoke a skill explicitly with `$skill-name`, or let Codex select it from the task description. Skills work best alongside the current source, package manifests, and feature documentation.

## Skills in this repo

| Skill | Use it for | Main Edutu surface |
|---|---|---|
| `edutu-product-discovery` | User problems, prioritization, feature specs, UX, measurement plans | Learner workflows across web and mobile |
| `edutu-backend-engineering` | API contracts, NestJS services, auth, data access, migrations, billing, AI | `backend/services/services/api` |
| `edutu-web-engineering` | Learner-facing web/PWA, React UI, API integration, admin UI | `edutu-web-app`, `admin` |
| `edutu-mobile-engineering` | Expo Router, native behavior, offline access, notifications, widgets, releases | `edutumobile` |
| `edutu-quality-engineering` | Test planning, regression, API/UI/mobile verification, release criteria | All shipped surfaces |
| `edutu-devops-sre` | Build/deploy, secrets, health, telemetry, recovery, incident response | API, web, database, mobile releases |
| `edutu-security-privacy` | AuthZ, PII, uploads, webhooks, AI keys, data access, privacy review | All trust boundaries |
| `edutu-opportunity-operations` | Source quality, scraping, review queues, listing corrections | `crawl4ai-scraper`, API, admin |
| `edutu-community-support` | Community workflows, moderation, learner support, issue triage | Community, DMs, calls, support |
| `edutu-creator-partner-operations` | Creator intake, marketplace, roadmap publication, partner API | Creator, marketplace, roadmaps, `/v1` |
| `edutu-growth-analytics` | Acquisition, SEO, content, lifecycle, instrumentation, outcome analysis | Public pages and learner journeys |
| `edutu-business-operations` | Payment reconciliation, refunds, provider records, operating controls | Paystack, RevenueCat, wallet, entitlements |

Existing marketing skills under `.agents/skills/` remain available. For example, use `analytics`, `seo-audit`, `content-strategy`, `copywriting`, `onboarding`, or `churn-prevention` when the request specifically matches them. The official Expo plugin is installed in Codex for current Expo-specific guidance.

## Delivery workflow

1. **Discover:** Use `edutu-product-discovery` to state the user problem, current behavior, target outcome, constraints, and observable success measure. For ops-originated work, start with the opportunity, support, community, creator, or business-operations skill that found the issue.
2. **Design the change:** Read the relevant architecture/API docs and trace the current implementation. Identify affected surfaces, data ownership, permissions, loading/error/offline states, and migration needs.
3. **Implement by surface:** Use backend, web, or mobile skills for the actual code. Keep privileged business logic in the API. Coordinate API contract changes with each client that consumes them.
4. **Review risk:** Use `edutu-security-privacy` for sensitive data, auth, uploads, billing, provider callbacks, AI credentials, or cross-user access. Use the existing `edutu-code-review` and applicable web/mobile/payments review skills for code review; those reviewers are review-only unless implementation is requested.
5. **Verify:** Use `edutu-quality-engineering` to select focused verification from the affected package scripts. Report commands actually run and any environment limitation. Do not describe a build or test as passing unless it ran successfully.
6. **Release and learn:** Use `edutu-devops-sre` for deploy/rollback/health checks. Use `edutu-growth-analytics` to measure learner outcomes and the appropriate operations skill to watch data quality, support load, moderation, partner, or payment fallout.

## Current architecture references

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — service ownership, trust boundaries, core flows.
- [`API.md`](API.md) — backend modules, route groups, and auth categories.
- [`OPERATIONS.md`](OPERATIONS.md) — local commands, environment, release, and incident checklists.
- [`DATA_MODEL.md`](DATA_MODEL.md) — canonical table ownership and migration guidance.
- [`edutumobile/README.md`](../edutumobile/README.md) — separate mobile repository boundary and mobile data-access rules.

