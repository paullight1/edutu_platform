# Data Model and Ownership

Primary application schema source:

```text
backend/services/services/api/src/db/schema.ts
```

Canonical shared production migration stream:

```text
backend/services/services/api/supabase/migrations/
```

The platform backend uses Drizzle ORM with Postgres from `DATABASE_URL`; selected server-side integrations also use Supabase with service credentials. Shared schema evolution is owned by the backend even when web/admin/mobile consume the tables directly through tested RLS.

## Core table ownership

| Group | Tables | Domain owner |
| --- | --- | --- |
| Identity/Profile | `profiles` | platform backend; client self-service constrained by RLS |
| Notifications | `notifications`, `notification_preferences`, `notification_push_tokens`, `notification_queue` | notifications backend module |
| Goals | `goals`, `milestones` | goals backend module |
| Opportunities | `opportunities`, `user_opportunity_preferences`, `user_opportunity_signals` | opportunities backend module + scraper ingestion |
| Creator/Marketplace | `creator_applications`, `marketplace_listings`, `marketplace_enrollments`, `marketplace_packages`, `tickets`, `transactions` | creator/marketplace backend modules |
| Learning | quizzes/flashcards/study tables | learning backend modules |
| AI Governance | `ai_provider_keys`, `ai_routes`, `ai_prompts`, `ai_usage_logs` | AI backend/admin control plane |
| Blog | `blog_posts`, `blog_comments` | blog backend/admin |
| Roadmaps | roadmap/enrollment/intent/feedback tables | roadmaps backend module |
| Mobile Control | campaigns/flags/widget feeds/events | mobile-control backend module |

## Historical migration trees

These directories remain in Git only as applied/historical records and are frozen by Repository Governance:

- `supabase/migrations/`
- `edutu-web-app/supabase/migrations/`
- `edutumobile/supabase/migrations/`

They are not alternate schema authorities and must not receive new shared production migrations.

## Direct Supabase access policy

Direct client Supabase access is acceptable only when all of the following hold:

- RLS/column privileges are intentionally designed and tested;
- the operation is user-owned, not privileged business logic;
- the backend domain remains the schema/behavior owner;
- Clerk/Supabase token bridging is configured where required;
- the feature documents why direct access is preferable to the backend API.

Privileged mutations, billing state, administrative mutations, service-role operations, and authoritative recommendation/business rules go through the backend API.

## New table checklist

Every new shared table/change must identify:

- owning backend module/domain;
- canonical migration filename;
- RLS/privilege source;
- consumers (web/admin/mobile/service);
- rollout order;
- rollback/forward-fix approach for destructive changes.
