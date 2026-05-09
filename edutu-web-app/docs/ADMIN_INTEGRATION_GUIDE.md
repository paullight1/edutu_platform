# Edutu Admin Dashboard Integration Guide

## Overview

This document provides a comprehensive guide for integrating the Edutu mobile app with an admin dashboard. The admin dashboard will provide centralized control over:

1. **Feature Opportunities** - Managing and curating opportunities from n8n scraper
2. **Community Marketplace** - Approving, featuring, and moderating roadmaps
3. **In-App Notifications** - Sending broadcast messages to users
4. **Platform Statistics** - Viewing signups, applications, and engagement metrics
5. **Support & Feedback** - Responding to user help tickets
6. **Personalized Recommendations** - Configuring AI-driven opportunity matching

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Admin Services API](#admin-services-api)
4. [N8N Integration](#n8n-integration)
5. [Personalization Engine](#personalization-engine)
6. [Admin Dashboard Features](#admin-dashboard-features)
7. [Implementation Steps](#implementation-steps)
8. [Security Considerations](#security-considerations)
9. [Deployment Guide](#deployment-guide)

---

## Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Edutu App     │────▶│    Supabase     │◀────│  Admin Portal   │
│   (React/Vite)  │     │   (Backend)     │     │  (Separate App) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               ▲
                               │
                        ┌──────┴──────┐
                        │             │
                   ┌────┴────┐   ┌────┴────┐
                   │ n8n     │   │ Edge    │
                   │ Scraper │   │Functions│
                   └─────────┘   └─────────┘
```

### Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| Edutu App | React + Vite | Mobile-first user application |
| Admin Portal | React/Next.js | Admin dashboard (separate deployment) |
| Supabase | Postgres + Auth | Database, authentication, realtime |
| Edge Functions | Deno | Webhooks, scheduled tasks |
| n8n | Workflow automation | Opportunity scraping |

---

## Database Schema

### Core Admin Tables

The following tables have been added to support admin functionality:

#### 1. User Roles (`profiles` table enhancement)

```sql
ALTER TABLE public.profiles 
ADD COLUMN role text DEFAULT 'user' 
  CHECK (role IN ('user', 'moderator', 'support_agent', 'admin', 'super_admin'));
```

**Role Permissions:**

| Role | Capabilities |
|------|--------------|
| `super_admin` | Full access to all features |
| `admin` | Manage opportunities, marketplace, notifications, support |
| `moderator` | Marketplace moderation, send notifications, respond to support |
| `support_agent` | Respond to support tickets only |
| `user` | Regular app user |

#### 2. Notification Queue

```sql
CREATE TABLE public.notification_queue (
  id uuid PRIMARY KEY,
  payload jsonb NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

#### 3. Webhook API Keys

```sql
CREATE TABLE public.webhook_api_keys (
  id uuid PRIMARY KEY,
  key_hash text NOT NULL UNIQUE,
  name text NOT NULL,
  permissions text[] NOT NULL DEFAULT ARRAY['opportunities:write'],
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  expires_at timestamptz
);
```

#### 4. User Personalization

```sql
CREATE TABLE public.user_personalization (
  user_id uuid PRIMARY KEY,
  interests text[],
  career_goals text[],
  experience_level text,
  preferred_categories text[],
  preferred_locations text[],
  recommendation_weights jsonb
);
```

#### 5. Opportunity Click Tracking

```sql
CREATE TABLE public.opportunity_clicks (
  id uuid PRIMARY KEY,
  user_id uuid,
  opportunity_id uuid NOT NULL,
  click_type text NOT NULL, -- 'view', 'apply', 'bookmark', 'share'
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Running the Schema

```bash
# Run the main schema first
supabase db push --include-seed

# Then run the admin schema
psql -h <supabase-host> -U postgres -d postgres -f supabase/admin_schema.sql
```

---

## Admin Services API

### Location

All admin services are located in `src/services/admin/`:

```
src/services/admin/
├── adminService.ts          # Core admin functions
├── marketplaceAdmin.ts      # Marketplace moderation
├── opportunitiesWebhook.ts  # n8n webhook processing
└── opportunitiesSupabase.ts # Opportunity CRUD
```

### Key Functions

#### Authentication & Authorization

```typescript
import { checkAdminAccess, getAdminPermissions } from './services/admin/adminService';

// Check if current user is admin
const { isAdmin, role } = await checkAdminAccess();

// Get specific permissions
const permissions = await getAdminPermissions(userId);
```

#### Platform Statistics

```typescript
import { getAdminStats } from './services/admin/adminService';

const stats = await getAdminStats();
// Returns: { users, opportunities, marketplace, support, engagement }
```

#### Broadcast Notifications

```typescript
import { sendBroadcastNotification } from './services/admin/adminService';

await sendBroadcastNotification({
  title: 'New Scholarship Alert! 🎓',
  body: 'Check out the latest opportunities matching your profile.',
  kind: 'admin-broadcast',
  severity: 'info',
  targetAudience: 'active', // 'all', 'active', or 'specific'
  targetUserIds: [], // Only for 'specific' audience
});
```

#### Support Ticket Management

```typescript
import { respondToTicket, getAllTickets } from './services/admin/adminService';

// Get all tickets
const tickets = await getAllTickets({
  status: ['open', 'in_progress'],
  priority: ['high', 'urgent'],
  limit: 50
});

// Respond to a ticket
await respondToTicket({
  ticketId: 'uuid',
  message: 'Thank you for reaching out...',
  isResolution: false, // Set to true to close the ticket
  internalNote: 'Follow up needed' // Optional admin-only note
});
```

#### Marketplace Moderation

```typescript
import { 
  getPendingApprovals, 
  processApproval, 
  setFeaturedStatus 
} from './services/admin/marketplaceAdmin';

// Get pending submissions
const pending = await getPendingApprovals();

// Approve/reject a submission
await processApproval({
  itemId: 'uuid',
  decision: 'approve', // 'approve', 'reject', 'request_changes'
  note: 'Great contribution!',
  featured: true,
  featuredRank: 1
});

// Toggle featured status
await setFeaturedStatus('item-uuid', true, 1);
```

---

## N8N Integration

### Webhook Endpoint

**Production Endpoint:**
```
POST https://<project-ref>.supabase.co/functions/v1/n8n-webhook
```

**Headers:**
```
Content-Type: application/json
x-api-key: <your-webhook-api-key>
```

### Payload Structure

```json
{
  "action": "bulk_sync",
  "source": "scholarships-scraper",
  "timestamp": "2024-12-23T02:00:00Z",
  "opportunities": [
    {
      "externalId": "sch-001",
      "title": "Tech Innovation Scholarship 2025",
      "summary": "Full scholarship for tech students",
      "description": "Detailed description...",
      "category": "Scholarship",
      "organization": "Tech Foundation",
      "location": "Remote",
      "isRemote": true,
      "applicationUrl": "https://apply.techfoundation.org",
      "tags": ["tech", "scholarship", "undergraduate"],
      "eligibility": {
        "minAge": 18,
        "maxAge": 25,
        "gpaRequired": 3.5
      },
      "stipend": 50000,
      "currency": "USD",
      "openDate": "2024-12-01",
      "closeDate": "2025-03-31"
    }
  ],
  "metadata": {
    "scraperName": "edu-opportunities-scraper",
    "sourceUrl": "https://scholarships.example.com",
    "totalScraped": 25,
    "batchId": "batch-20241223-001"
  }
}
```

### Actions

| Action | Description |
|--------|-------------|
| `create` | Add new opportunities (skips if duplicate exists) |
| `update` | Update existing opportunities by externalId |
| `delete` | Remove opportunities by externalId |
| `bulk_sync` | Upsert: create new, update existing |

### N8N Workflow Setup

1. **Create a new workflow in n8n**
2. **Add a Schedule Trigger** (e.g., daily at midnight)
3. **Add HTTP Request nodes** for each scholarship source
4. **Add a Function node** to transform data to the expected format
5. **Add an HTTP Request node** to POST to the webhook

**Example n8n Function Node:**

```javascript
const opportunities = items.map(item => ({
  externalId: item.json.id,
  title: item.json.title,
  summary: item.json.description?.substring(0, 200),
  description: item.json.description,
  category: item.json.type || 'Scholarship',
  organization: item.json.provider,
  location: item.json.location || 'Global',
  isRemote: item.json.location === 'Remote',
  applicationUrl: item.json.link,
  tags: item.json.tags || [],
  closeDate: item.json.deadline,
  metadata: {
    originalData: item.json
  }
}));

return [{
  json: {
    action: 'bulk_sync',
    source: 'n8n-scraper',
    timestamp: new Date().toISOString(),
    opportunities,
    metadata: {
      scraperName: 'edu-opportunities-scraper',
      totalScraped: opportunities.length,
      batchId: `batch-${Date.now()}`
    }
  }
}];
```

### Generating API Keys

```sql
-- Generate a new API key (run in Supabase SQL Editor)
INSERT INTO public.webhook_api_keys (key_hash, name, description, permissions)
VALUES (
  encode(sha256('your-secret-api-key-here'), 'hex'),
  'n8n-scraper-prod',
  'Production API key for n8n opportunity scraper',
  ARRAY['opportunities:write']
);
```

---

## Personalization Engine

### How It Works

1. **User completes onboarding** → Preferences saved to `user_personalization`
2. **Opportunities are scraped** → Stored in `opportunities` table
3. **Match scores calculated** → Based on categories, tags, location
4. **Recommendations cached** → In `user_opportunity_recommendations`
5. **App displays personalized feed** → Sorted by match score

### Triggering Recommendations

```typescript
import { supabase } from '../lib/supabaseClient';

// Generate recommendations for a user
const { error } = await supabase.rpc('generate_user_recommendations', {
  p_user_id: userId
});
```

### Match Score Calculation

The default scoring:

| Factor | Points | Description |
|--------|--------|-------------|
| Category Match | 30 | Opportunity category matches preferred categories |
| Interest Match | 25 | Opportunity tags overlap with user interests |
| Location Match | 15 | Remote or matches preferred location |
| **Total Possible** | **70** | Minimum 20 to appear in recommendations |

### Customizing Weights

Users can personalize their recommendation weights:

```typescript
await supabase
  .from('user_personalization')
  .update({
    recommendation_weights: {
      category: 1.5,    // Increase category importance
      location: 0.5,    // Decrease location importance
      interests: 1.2    // Slightly boost interest matches
    }
  })
  .eq('user_id', userId);
```

---

## Admin Dashboard Features

### 1. Overview Dashboard

**Metrics to Display:**
- Total Users / Active Users (7-day)
- New Signups (daily/weekly trend)
- Active Opportunities / Expiring Soon
- Pending Marketplace Approvals
- Open Support Tickets
- AI Engagement (chat sessions)

**API Calls:**
```typescript
const stats = await getAdminStats();
const signupTrends = await getSignupAnalytics(30);
const supportMetrics = await getSupportAnalytics(30);
```

### 2. Opportunities Manager

**Features:**
- View all opportunities (active, expired, draft)
- Create/edit opportunities manually
- Feature/unfeature opportunities
- View opportunity performance (clicks, applications)
- Manage n8n sync settings

**Page Components:**
- Data table with filtering & sorting
- Quick actions (feature, edit, delete)
- Bulk import interface
- Webhook status indicator

### 3. Marketplace Moderation

**Features:**
- Queue of pending roadmap submissions
- Approve/reject/request changes workflow
- Feature management with ranking
- Moderator notes history
- Author notification on decisions

**Workflow:**
1. User submits roadmap → Status: `pending`
2. Admin reviews → Approves/rejects with note
3. User notified via in-app notification
4. Approved items appear in marketplace

### 4. Notification Center

**Features:**
- Send broadcast to all/active users
- Schedule future notifications
- Target specific user segments
- View notification delivery stats
- Template management

**Broadcast Types:**
- `admin-broadcast` - General announcements
- `system` - System updates
- `opportunity-highlight` - Featured opportunities

### 5. Support Center

**Features:**
- Ticket queue with priority sorting
- Full conversation view
- Quick response templates
- Internal notes (admin-only)
- SLA tracking (response times)
- Bulk actions (close resolved tickets)

### 6. Analytics Dashboard

**Metrics:**
- User growth trends
- Opportunity engagement funnel
- Category performance
- Geographic distribution
- AI usage patterns
- Support ticket trends

**Charts:**
- Line: Daily signups, active users
- Bar: Opportunities by category
- Pie: User distribution by experience level
- Funnel: Opportunity view → apply → accepted

---

## Implementation Steps

### Phase 1: Backend Setup (Week 1)

1. **Deploy Admin Schema**
   ```bash
   # From project root
   psql -h <host> -U postgres -d postgres -f supabase/admin_schema.sql
   ```

2. **Deploy Edge Function**
   ```bash
   supabase functions deploy n8n-webhook
   ```

3. **Configure Environment Variables**
   ```env
   VITE_N8N_WEBHOOK_URL=https://<project>.supabase.co/functions/v1/n8n-webhook
   VITE_N8N_API_KEY=your-generated-api-key
   ```

4. **Set Admin User Roles**
   ```sql
   UPDATE public.profiles
   SET preferences = preferences || '{"role": "admin"}'
   WHERE email = 'admin@edutu.com';
   ```

### Phase 2: Admin Portal Development (Weeks 2-3)

**Option A: Extend Existing Admin (`/admin` route)**

The app already has admin pages at `src/pages/admin/`. Extend these:

```
src/pages/admin/
├── AdminDashboard.tsx      ✅ Exists - enhance with stats API
├── opportunities/          ✅ Exists - add webhook controls
├── community-support/      ✅ Exists - enhance ticket management
├── notifications/          🆕 Create - broadcast center
└── analytics/              ✅ Exists - connect to real data
```

**Option B: Separate Admin Portal**

Create a new project for the admin dashboard:

```bash
npx create-vite@latest edutu-admin --template react-ts
cd edutu-admin
npm install @supabase/supabase-js recharts lucide-react
```

Share the Supabase client and types from the main app.

### Phase 3: N8N Integration (Week 4)

1. **Set up n8n instance** (self-hosted or cloud)
2. **Create scholarship scrapers** for target sources
3. **Configure webhook** with API key
4. **Schedule daily sync** jobs
5. **Monitor via audit_log** table

### Phase 4: Testing & Launch (Week 5)

1. **End-to-end testing** of all admin flows
2. **Load testing** webhook with batch data
3. **Security audit** of RLS policies
4. **Documentation** for admin users
5. **Staged rollout** to admin team

---

## Security Considerations

### Row Level Security (RLS)

All admin tables have RLS enabled with proper policies:

```sql
-- Example: Only admins can view all tickets
CREATE POLICY "Admins can view all tickets"
  ON public.support_tickets
  FOR SELECT
  USING (
    auth.uid() = user_id  -- Users see their own
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.role IN ('admin', 'super_admin', 'support_agent')
    )
  );
```

### API Key Security

- API keys are stored as SHA-256 hashes
- Keys can be scoped with specific permissions
- Keys have expiration dates
- Last-used timestamps tracked

### Audit Logging

All admin actions are logged:

```typescript
await logAdminAction(
  'marketplace:approve',    // action
  'community_post',         // entity_type
  postId,                   // entity_id
  { reason: 'High quality' } // metadata
);
```

View audit logs:
```sql
SELECT * FROM public.audit_log
WHERE created_at > now() - interval '7 days'
ORDER BY created_at DESC;
```

### Best Practices

1. **Use service role sparingly** - Only in Edge Functions
2. **Validate all inputs** - Especially webhook payloads
3. **Rate limit webhooks** - Prevent abuse
4. **Regular key rotation** - Expire and regenerate API keys
5. **Monitor audit logs** - Set up alerts for suspicious activity

---

## Deployment Guide

### Supabase Setup

1. **Ensure all tables exist**
   ```bash
   # Check tables
   SELECT tablename FROM pg_tables WHERE schemaname = 'public';
   ```

2. **Deploy Edge Functions**
   ```bash
   supabase login
   supabase link --project-ref <project-id>
   supabase functions deploy n8n-webhook
   ```

3. **Set Function Secrets**
   ```bash
   supabase secrets set N8N_API_KEY=your-secret-key
   ```

### Environment Configuration

**`.env` (App)**
```env
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_N8N_WEBHOOK_URL=https://<project>.supabase.co/functions/v1/n8n-webhook
```

**`.env` (Admin Portal - if separate)**
```env
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_ADMIN_MODE=true
```

### Monitoring

Set up monitoring for:

- **Webhook failures** - Check `audit_log` for errors
- **Queue processing** - Monitor `notification_queue` status
- **Support SLA** - Alert on ticket response times
- **Opportunity freshness** - Alert on stale data

---

## API Reference Summary

### Admin Service (`adminService.ts`)

| Function | Description |
|----------|-------------|
| `checkAdminAccess()` | Check if current user is admin |
| `getAdminPermissions(userId)` | Get user's admin permissions |
| `getAdminStats()` | Get platform statistics |
| `sendBroadcastNotification(payload)` | Send notification to users |
| `scheduleNotification(payload)` | Schedule future notification |
| `respondToTicket(response)` | Reply to support ticket |
| `getAllTickets(filters)` | Get all support tickets |
| `getSignupAnalytics(days)` | Get signup trends |
| `getSupportAnalytics(days)` | Get support metrics |
| `logAdminAction(...)` | Log admin activity |

### Marketplace Admin (`marketplaceAdmin.ts`)

| Function | Description |
|----------|-------------|
| `getMarketplaceItems(filters)` | Get marketplace items |
| `getPendingApprovals()` | Get items pending review |
| `getFeaturedItems()` | Get featured items |
| `processApproval(payload)` | Approve/reject item |
| `setFeaturedStatus(id, featured, rank)` | Set featured status |
| `addModeratorNote(id, note, authorId)` | Add mod note |

### Opportunities Webhook (`opportunitiesWebhook.ts`)

| Function | Description |
|----------|-------------|
| `processN8nWebhook(payload)` | Handle n8n webhook |
| `createOpportunityManually(data, adminId)` | Create opportunity |
| `updateOpportunityManually(id, data, adminId)` | Update opportunity |
| `deleteOpportunityManually(id, adminId)` | Delete opportunity |
| `featureOpportunity(id, featured, adminId)` | Feature/unfeature |

---

## Next Steps

1. ✅ **Backend services created** - `src/services/admin/`
2. ✅ **Database schema prepared** - `supabase/admin_schema.sql`
3. ✅ **Webhook endpoint ready** - `supabase/functions/n8n-webhook/`
4. ⬜ **Deploy schema to Supabase** - Run SQL migrations
5. ⬜ **Deploy Edge Function** - `supabase functions deploy`
6. ⬜ **Set up n8n workflows** - Create scrapers
7. ⬜ **Build/Enhance Admin UI** - Extend existing pages
8. ⬜ **Test end-to-end** - Verify all flows work

---

## Questions & Support

For questions about this integration:

1. Check the inline documentation in service files
2. Review the Supabase dashboard for table structures
3. Check `audit_log` for debugging admin operations
4. Review n8n execution history for webhook issues

---

*Document Version: 1.0*
*Last Updated: December 23, 2024*
