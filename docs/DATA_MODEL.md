# Data Model and Ownership

Primary schema source:

```bash
edutu-platform/backend/services/services/api/src/db/schema.ts
```

The platform backend uses Drizzle ORM with a Postgres connection from `DATABASE_URL`. Some services also use a server-side Supabase client with `SUPABASE_SERVICE_ROLE_KEY`.

## Repository Ownership

Edutu is intentionally multi-repo:

- `edutu-platform` owns platform backend schema definitions, platform web/admin/waitlist data needs, scraper tables, and shared platform Supabase assets.
- `edutumobile` owns mobile app code and mobile-specific Supabase functions/migrations.

Migration ownership should be explicit because the workspace currently contains multiple Supabase migration folders.

## Core Table Groups

| Group | Tables | Owner |
| --- | --- | --- |
| Identity/Profile | `profiles` | Platform backend, shared with client RLS assumptions |
| Notifications | `notifications`, `notification_preferences`, `notification_push_tokens`, `notification_queue` | Platform backend and mobile |
| Goals | `goals`, `milestones` | Platform backend |
| Opportunities | `opportunities`, `user_opportunity_preferences`, `user_opportunity_signals` | Platform backend and scraper |
| Creator/Marketplace | `creator_applications`, `marketplace_listings`, `marketplace_enrollments`, `marketplace_packages`, `tickets`, `transactions` | Platform backend and admin |
| Learning | `quizzes`, `quiz_questions`, `quiz_attempts`, `flashcard_decks`, `flashcards`, `flashcard_study_sessions`, `flashcard_reviews` | Platform backend |
| AI Governance | `ai_provider_keys`, `ai_routes`, `ai_prompts`, `ai_usage_logs` | Platform backend/admin |
| Blog | `blog_posts`, `blog_comments` | Platform backend/admin |
| Roadmaps | `roadmaps`, `roadmap_enrollments`, `user_roadmap_intents`, `roadmap_feedback` | Platform backend |
| Mobile Control | `mobile_app_campaigns`, `mobile_feature_flags`, `widget_feeds`, `mobile_campaign_events` | Platform backend and mobile |

## Migration Locations Observed

| Path | Notes |
| --- | --- |
| `edutu-platform/supabase/migrations` | Shared platform migrations; includes mobile control plane hardening. |
| `edutu-platform/edutu-web-app/supabase/migrations` | Web-app-local migrations for billing, credits, Clerk RLS helpers, CV storage, and feature parity. |
| `edutumobile/supabase/migrations` | Mobile-repo migrations for CV builder, creator status, payments, feature flags, billing, and RLS fixes. |
| `edutu-platform/backend/services/services/api/drizzle.config.ts` | Drizzle config uses `src/db/schema.ts` and `DATABASE_URL`. |

## Recommended Migration Policy

1. Choose one canonical migration stream for shared production tables.
2. Keep mobile-only migrations inside `edutumobile` only when they are truly mobile-owned.
3. Treat duplicated or overlapping migration folders as pending reconciliation until reviewed.
4. Every new table should list:
   - owning repository
   - owning service/module
   - RLS policy source
   - migration source
   - backup/rollback notes

## Direct Supabase Access Policy

Direct client Supabase access is acceptable only when:

- RLS is designed and tested for the operation.
- The operation is not privileged business logic.
- The owning repo documents the table and policy expectations.
- Clerk token bridging is configured if the user is authenticated through Clerk.

Privileged operations should go through the backend API.
