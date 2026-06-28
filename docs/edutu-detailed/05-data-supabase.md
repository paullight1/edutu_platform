# 05. Data and Supabase Documentation

## Data Sources of Truth

There are several overlapping schema sources:

| Location | Type | Notes |
| --- | --- | --- |
| `backend/services/services/api/src/db/schema.ts` | Drizzle schema | Core backend ORM schema. |
| `backend/services/services/api/supabase/schema.sql` | Supabase baseline schema | Broad product schema with RLS policies. |
| `backend/services/services/api/supabase/migrations` | Backend API migrations | Scraper, personalization, performance, roadmaps, RLS, AI, partner API. |
| `edutu-web-app/supabase/migrations` | Web app migrations | Feature parity, credits, billing, Clerk RLS helpers, CV status. |
| `edutu-platform/supabase/migrations` | Shared platform migrations | Mobile control plane and privilege hardening. |
| `edutumobile/supabase/migrations` | Mobile migrations | CV builder, creator profiles, payments, feature flags, billing, user ID conversion. |
| `admin/supabase/blog_schema.sql` | Admin schema | Blog/admin content support. |
| `other-files/SCRAPER/supabase/migrations` | Archived scraper schema | Historical scraper reference. |
| `edutu-web/scripts/*.sql` | Waitlist SQL | Waitlist table setup and seed data. |

## Drizzle Core Tables

`src/db/schema.ts` includes:

- `profiles`
- `notifications`
- `notification_preferences`
- `notification_push_tokens`
- `notification_queue`
- `goals`
- `milestones`
- `opportunities`
- `user_opportunity_preferences`
- `user_opportunity_signals`
- `creator_applications`
- `marketplace_listings`
- `marketplace_enrollments`
- `marketplace_packages`
- `tickets`
- `transactions`
- `quizzes`
- `quiz_questions`
- `quiz_attempts`
- `flashcard_decks`
- `flashcards`
- `flashcard_study_sessions`
- `flashcard_reviews`
- `ai_provider_keys`
- `ai_routes`
- `ai_prompts`
- `ai_usage_logs`
- `blog_posts`
- `blog_comments`
- `roadmaps`
- `roadmap_enrollments`
- `user_roadmap_intents`
- `roadmap_feedback`
- `mobile_app_campaigns`
- `mobile_feature_flags`
- `widget_feeds`
- `mobile_campaign_events`

## Backend Supabase Migrations

| Migration | Purpose |
| --- | --- |
| `20250120000000_scraper_tables.sql` | `scraping_sources`, `scraped_urls`, `scrape_logs`, `scraper_config`. |
| `20251028081031_cv_storage_status.sql` | CV storage/status support. |
| `20260427093000_opportunity_personalization.sql` | Opportunity preferences/signals/recommendation support. |
| `20260505000000_performance_indexes.sql` | Performance indexes. |
| `20260505100000_roadmaps_system.sql` | Roadmap system tables. |
| `20260513000000_rls_hardening.sql` | RLS hardening. |
| `20260514000000_deadline_aware_roadmap_adoption.sql` | Deadline-aware roadmap adoption. |
| `20260514093000_opportunity_admin_scale_dedupe.sql` | Opportunity admin scale and dedupe. |
| `20260515000000_ai_control_plane.sql` | AI provider key/route/prompt/usage control plane. |
| `20260522000000_opportunity_engine_canonical_compat.sql` | Opportunity engine compatibility. |
| `20260522010000_edutu_api_consumers.sql` | Partner API consumers and usage events. |

## Web App Supabase Migrations

| Migration | Purpose |
| --- | --- |
| `20250508_phase1_feature_parity.sql` | Extended bookmarks, applications, calendar events, profile fields. |
| `20251028081031_cv_storage_status.sql` | CV status/storage support. |
| `20260509000000_credit_transactions_table.sql` | Credit transaction table and policies. |
| `20260509000001_atomic_credit_operations.sql` | Atomic credit operations. |
| `20260514000000_billing_entitlements.sql` | Billing subscriptions, entitlements, transactions. |
| `20260514001000_clerk_user_rls_helpers.sql` | Clerk/Supabase RLS helper functions. |

## Shared Platform Migrations

| Migration | Purpose |
| --- | --- |
| `20260519091914_mobile_control_plane.sql` | Mobile campaigns, feature flags, widget feeds, campaign events. |
| `20260519092033_mobile_control_privilege_hardening.sql` | Mobile control privilege hardening. |

## Mobile Supabase Migrations

| Migration | Purpose |
| --- | --- |
| `001_cv_builder.sql` | CV templates and user CVs; pro/trial fields. |
| `002_creator_profiles_follows.sql` | Creator profiles, follows, achievements, community story extensions. |
| `003_add_creator_status.sql` | Creator status on profiles. |
| `003_cv_builder_refactor.sql` | CV template/user CV refactor. |
| `004_cv_builder_logs.sql` | CV builder logs. |
| `004_payment_system.sql` | Subscriptions, transactions, credit purchases. |
| `005_convert_user_id_to_text.sql` | Converts many user ID columns to text. |
| `006_creator_applications_rls.sql` | Creator application RLS. |
| `006_unified_bookmarks.sql` | Unified bookmark model. |
| `007_testimonials.sql` | Testimonials. |
| `008_feature_flags.sql` | Feature flags. |
| `009_billing_entitlements.sql` | Billing entitlements. |
| `010_fix_profiles_rls_recursion.sql` | Profile RLS recursion fix. |

## Edge Functions

| Location | Function | Purpose |
| --- | --- | --- |
| Backend API Supabase | `chat-proxy` | Chat proxy. |
| Backend API Supabase | `n8n-webhook` | n8n integration webhook. |
| Web app Supabase | `chat-proxy` | Chat proxy copy. |
| Web app Supabase | `n8n-webhook` | n8n webhook copy. |
| Shared platform Supabase | `scrape` | Scrape function. |
| Mobile Supabase | `chat-proxy` | Mobile chat proxy. |
| Mobile Supabase | `clerk-webhook` | Clerk webhook. |
| Mobile Supabase | `delete-account` | Account deletion. |
| Mobile Supabase | `revenuecat-webhook` | RevenueCat webhook. |

## Storage Buckets Observed

| Bucket | Visibility | Purpose | Constraints |
| --- | --- | --- | --- |
| `cv-files` | Private | User CV uploads | 5 MB objects, PDF/DOC/DOCX/ODT/TXT, max 3 CV files per user through helper function. |
| `avatars` | Public | Profile/admin avatar images | 5 MB objects, JPEG/PNG/GIF/WebP. |
| `opportunities_images` | Service-managed | Scraper-proxied opportunity images | Used by Nest scraper service. |

## Notable Functions and Triggers

- `set_updated_at`
- `handle_new_user`
- `ensure_analytics_profile`
- `touch_analytics_activity`
- `increment_goal_daily_metric`
- `get_signup_trends`
- `get_opportunity_performance`
- `get_support_metrics`
- `generate_user_recommendations`
- `spend_credits`
- `add_credits`
- `current_app_user_id`
- `cv_files_under_limit`

## Data Risks

1. Migration duplication: same concepts appear in backend, web app, and mobile migration directories.
2. Type mismatch: backend Drizzle `profiles.user_id` is UUID, mobile migrations convert user IDs to text.
3. Bookmark/application tables have multiple names and extended variants.
4. Edge function copies can drift.
5. RLS helpers need a canonical auth-token strategy.
6. Active Python scraper writes canonical fields such as `canonical_url`, `content_fingerprint`, `quality_score`, `validation_status`, and `image_url`; base schemas do not always define every field.
7. `add_credits()` transaction type should be reconciled with the `credit_transactions.type` check constraint.
8. Some archived scraper RLS policies use `USING (true)` and should not be copied into production.

## Recommended Data Governance

1. Pick one canonical migration home.
2. Mark other SQL folders as generated, historical, or app-local.
3. Maintain a data dictionary for each table.
4. Create a table ownership matrix: backend-only, client-RLS allowed, edge-function only, service-role only.
5. Add a schema drift check in CI.
6. Define a single ID policy for Clerk IDs and DB user IDs.
7. Add a migration-order checklist for canonical opportunity columns before scraper deploys.
