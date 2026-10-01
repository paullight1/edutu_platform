# Edutu project context

Snapshot: `paullight1/edutu_platform`, `develop`, commit
`f5598344e68ac1afa315edb6149b030a60946378`, inspected 2026-09-06.
Use `evidence.json` for exact source fingerprints and inspected scope. This is
a starting map, not a claim that all implementation or deployed systems were audited.

## Observed from repository sources

| Surface | Verified manifest/entry point | Declared checks to inspect before running |
| --- | --- | --- |
| NestJS API | `backend/services/services/api/package.json` | `npm run lint`, `npm test -- --runInBand`, `npm run build`, `npm run test:e2e` |
| React/Vite web | `edutu-web-app/package.json` | `npm run lint`, `npm test`, `npm run typecheck`, `npm run build` |
| Expo/React Native mobile | `edutumobile/package.json` | `npm run lint`, `npm test -- --runInBand`, `npm run typecheck` |
| React/Vite admin | `admin/package.json` | `npm run lint`, `npm test`, `npm run build` |

Run each command inside its own package. These are declared commands, not passed
checks or permission to install/run anything. Web build has SEO pre/post steps;
mobile installation has a postinstall script. Review lifecycle side effects.
There is no declared standalone admin `typecheck` script in this snapshot;
its build invokes TypeScript. Do not invent one or assume a root workspace runner.

The API `src/app.module.ts` registers auth, opportunities, opportunity submissions,
scraper, billing, AI, profile, documents, communities, support, and other modules.
Registration is not proof that every route or protection works.

The inspected opportunities controller excerpt (lines 1-160) applies a capped
public feed, requests active records, and uses `stripInternalOpportunityFieldsBatch`.
It also declares search and recommendation-related entry points. Service internals,
complete controllers, and deployed behavior were not fully audited in this task.

Existing review contracts live in `code-review-agents/`: shared, mobile, web,
and payments. Preserve them and read by path when selected. The shared contract
requires evidence-based P0-P3 findings and API/identity/security boundaries.
The payments contract covers Paystack, RevenueCat, entitlement/credit consistency,
and replay safety; reverify provider details and units in current code.

Existing architecture governance declares `node --test scripts/architecture-boundaries.test.mjs`
and `node scripts/check-architecture-boundaries.mjs`. Their results are unknown here.

## Approved working rules, not claims of implemented behavior

Keep privileged business logic and new opportunity-journey lifecycle writes in
the NestJS API/domain layer. Existing direct Supabase paths require a deliberate
reason and correct RLS. Do not change approved architecture to justify a bug.

Preserve the existing UI system, shell/navigation, legacy routes/records, and
rollout flags. New rollout flags remain disabled pending review. Opening an
external application link is not submission; applied requires explicit confirmation.
AI enhancement must retain review/approval rather than automatic overwrite.

Use feature branches and exact-head review against `develop`. Production release
uses staging review and a develop-to-main release PR with manual promotion.
This package does not merge, deploy, apply migrations, or enable features.

## Known drift and limits

The root guide contains older `edutu_mobile/` examples, but the inspected mobile
manifest is `edutumobile/package.json`. Prefer the live tree for path facts.
Older environment examples are not a safe deployment template: public client
variables must never contain service-role or AI/provider secrets.

Dependency declarations do not establish runtime use. Existing auth/Supabase
exceptions, complete user journeys, CI health, deployment state, business-rule
coverage, and agent-runtime behavior still require task-specific verification.

When an anchor changes, inspect the diff, revise supported statements, and obtain
review before updating `evidence.json`. Never auto-refresh hashes to silence a gate.
