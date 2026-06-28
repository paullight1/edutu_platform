# 07. Operations and Runbooks

## Local Development Startup

### Backend API

```bash
cd edutu-platform/backend/services/services/api
npm install
npm run dev
```

Default URL:

```text
http://localhost:3000
```

### Standalone Admin

```bash
cd edutu-platform/admin
npm install
npm run dev
```

Default Vite URL:

```text
http://localhost:5173
```

### Main Web App

```bash
cd edutu-platform/edutu-web-app
npm install
npm run dev
```

### Mobile App

```bash
cd edutumobile
npm install
npm run dev
```

### Waitlist

```bash
cd edutu-platform/edutu-web
npm install
npm run dev
```

### Python Scraper

```bash
cd edutu-platform/crawl4ai-scraper
pip install -r requirements.txt
python main.py --all --save
```

## Environment Setup Checklist

### Backend API

Required/high-value:

- `PORT`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLERK_SECRET_KEY`
- `ADMIN_EMAILS`
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`
- `AI_KEY_ENCRYPTION_SECRET`
- `PAYSTACK_SECRET_KEY`
- `FRONTEND_URL`
- `ADMIN_URL`
- `MOBILE_APP_URL`
- `EDUTU_API_KEYS`

### Admin

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_BACKEND_URL`
- `VITE_API_URL`
- `VITE_OPENROUTER_API_KEY`
- `VITE_WEBHOOK_URL`

### Web App

- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`
- `VITE_ADMIN_EMAILS`
- `VITE_SENTRY_DSN`
- `VITE_APP_VERSION`
- `VITE_N8N_WEBHOOK_URL`
- `VITE_N8N_API_KEY`

### Mobile

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`
- `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`
- `GOOGLE_SERVICES_JSON`

### Scraper

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional AI/API provider keys depending on scraper path

## Verification Checklist

### Backend

```bash
cd edutu-platform/backend/services/services/api
npm run test
npm run test:e2e
npm run build
```

### Web App

```bash
cd edutu-platform/edutu-web-app
npm run typecheck
npm run test
npm run build
```

### Admin

```bash
cd edutu-platform/admin
npm run build
```

### Mobile

```bash
cd edutumobile
npm run typecheck
npm run test
```

## Release Runbooks

### Backend Release

1. Confirm migrations are in the canonical migration home.
2. Run backend tests and build.
3. Confirm required env vars are present.
4. Run Drizzle migration/push only after reviewing SQL.
5. Smoke test health endpoint, auth endpoint, opportunities, profile, billing status.
6. Validate webhook endpoints with test payloads.
7. Monitor logs for auth failures, DB pool errors, AI provider errors, webhook failures.

### Admin Release

1. Confirm target backend URL.
2. Confirm Supabase URL/anon key.
3. Build admin.
4. Login as admin.
5. Verify dashboard, opportunities, scraper, mobile control, and profile routes.
6. Confirm non-admin user is denied.

### Web App Release

1. Run typecheck, tests, build.
2. Verify Clerk key and Supabase keys.
3. Verify app routes under `/app`.
4. Verify premium gates and billing success path.
5. Verify embedded admin access.
6. Verify PWA manifest/icons.
7. For Android, run Capacitor sync and native build checks.

### Mobile Release

1. Run typecheck and tests.
2. Confirm Expo/Clerk/Supabase/RevenueCat env vars.
3. Verify sign-in, onboarding, home, opportunities, goals, chat, CV, notifications.
4. Verify push permissions and token sync.
5. Verify mobile control campaign rendering and kill switch.
6. Verify widget snapshot and deep links.
7. Build through Expo/native workflow.

### Scraper Run

1. Confirm sources and robots/rate limits.
2. Run a small source test.
3. Review extracted fields and quality score.
4. Save to database only after dedupe behavior is verified.
5. Review admin pending queue.
6. Track source result and failures.

## Incident Runbooks

### API Outage

1. Check process health and logs.
2. Check DB connection pool errors.
3. Check CORS/env changes.
4. Check Clerk/Supabase auth provider status.
5. Roll back recent backend deploy or migration if needed.

### Bad Scraper Import

1. Pause scheduled scraper.
2. Identify scrape job and source.
3. Export affected opportunity IDs/source URLs.
4. Move bad rows to rejected/draft if possible instead of deleting immediately.
5. Fix parser/source config.
6. Re-run limited scrape and compare output.

### AI Provider Failure

1. Check AI usage logs by feature/provider/model.
2. Switch route to fallback provider/model if configured.
3. Disable affected feature route if output quality is unsafe.
4. Communicate degraded feature state in admin/mobile/web if user-visible.

### Billing/Webhook Failure

1. Verify Paystack/RevenueCat provider status.
2. Check webhook signature/secret/env.
3. Replay provider event if supported.
4. Reconcile billing tables and entitlements.
5. Audit duplicate processing/idempotency.

