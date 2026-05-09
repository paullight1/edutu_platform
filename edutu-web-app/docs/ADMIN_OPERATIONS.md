# Admin Panel Operations Documentation

## Overview
The Edutu Admin Panel (`apps/admin/`) is the central hub for managing all platform operations. It controls opportunities, users, community content, analytics, AI features, and marketplace activities.

---

## Current Features Implemented

### 1. Dashboard & Overview
- **AdminDashboard.tsx** - Main dashboard with statistics
- **StatCard.tsx** - Reusable stat display component
- **Overview.tsx** - Overview section in admin sections

### 2. Opportunity Management
- **OpportunityList.tsx** - List all opportunities with filtering/search
- **OpportunityForm.tsx** - Create/Edit opportunity form
- **OpportunityDrawer.tsx** - Quick view/edit drawer

### 3. User Management
- **UsersList.tsx** - List all users with pagination/filtering
- **UserDetailDrawer.tsx** - View user details and actions
- **User management via /users route**

### 4. Community Management
- **CommunityPosts.tsx** - View and moderate community posts
- **AnnouncementsManager.tsx** - Create/manage announcements
- **AnnouncementForm.tsx** - Form for creating announcements
- **MarketplaceModeration.tsx** - Moderate marketplace listings
- **MarketplaceCreateModal.tsx** - Create marketplace items
- **SupportTickets.tsx** - View support tickets
- **TicketModal.tsx** - Respond to support tickets

### 5. Analytics
- **AnalyticsDashboard.tsx** - Analytics overview
- **Analytics page at /analytics**

### 6. AI Control
- **AIMentorConfig.tsx** - Configure AI mentor settings
- **RAGDataManager.tsx** - Manage RAG (Retrieval-Augmented Generation) data
- **RecommendationTuner.tsx** - Tune recommendation algorithms

### 7. Settings & System
- **Settings page at /settings**
- **System tools at /system**
- **HelpCenter at /help**

### 8. Layout Components
- **Sidebar.tsx** - Navigation sidebar
- **Topbar.tsx** - Top navigation bar

---

## Missing Components & Operations

### Critical Missing Features

#### 1. Opportunity Categories Management
```
MISSING: Category CRUD Operations
- Create/Edit/Delete opportunity categories
- Category-based filtering
- Category icons and colors management
```
**Current State:** Categories exist but no admin UI to manage them
**Required Files:**
- `components/admin/opportunities/CategoryManager.tsx`
- `components/admin/opportunities/CategoryForm.tsx`
- API endpoints for category CRUD

#### 2. Featured Opportunities System
```
MISSING: Featured Opportunities Management
- Mark opportunities as "Featured"
- Schedule featured placements
- Rotate featured opportunities
- Featured positions management (Hero, Spotlight, etc.)
```
**Current State:** No featured system exists
**Required Files:**
- `components/admin/opportunities/FeaturedManager.tsx`
- `components/admin/opportunities/FeaturedSchedule.tsx`
- API endpoints for featuring logic

#### 3. Bulk Operations
```
MISSING: Bulk Data Management
- Bulk opportunity import (CSV/Excel)
- Bulk status updates
- Bulk delete operations
- Bulk categorization
```
**Required Files:**
- `components/admin/opportunities/BulkImportModal.tsx`
- `components/admin/opportunities/BulkActions.tsx`
- `services/bulkOperations.ts`

#### 4. Opportunity Verification & Moderation
```
MISSING: Verification Workflow
- Manual verification queue
- Auto-verification rules
- Verification status tracking
- Rejection reasons management
```
**Required Files:**
- `components/admin/opportunities/VerificationQueue.tsx`
- `components/admin/opportunities/RejectionReasons.tsx`
- API workflow endpoints

#### 5. Analytics Deep Dive
```
MISSING: Advanced Analytics
- User engagement metrics
- Opportunity conversion rates
- Geographic distribution
- Category performance
- Trend analysis
- Export reports (PDF/CSV)
```
**Required Files:**
- `components/admin/analytics/EngagementMetrics.tsx`
- `components/admin/analytics/GeographicMap.tsx`
- `components/admin/analytics/TrendAnalysis.tsx`
- `components/admin/analytics/ReportGenerator.tsx`

#### 6. User Role Management
```
MISSING: Role-Based Access Control (RBAC)
- Create/Edit/Delete admin roles
- Permission matrix UI
- Role assignment to users
- Activity logging by role
```
**Required Files:**
- `components/admin/users/RoleManager.tsx`
- `components/admin/users/PermissionMatrix.tsx`
- `components/admin/users/RoleAssignment.tsx`

#### 7. Content Moderation Queue
```
MISSING: Advanced Moderation
- AI-powered content flagging
- Moderation queue with priority
- Auto-moderation rules
- Appeal management
```
**Required Files:**
- `components/admin/community/ModerationQueue.tsx`
- `components/admin/community/AutoModRules.tsx`
- `components/admin/community/AppealManager.tsx`

#### 8. Notification Management
```
MISSING: System Notifications
- Push notification templates
- Scheduled notifications
- User segment targeting
- Notification analytics
```
**Required Files:**
- `components/admin/notifications/TemplateManager.tsx`
- `components/admin/notifications/ScheduleManager.tsx`
- `components/admin/notifications/Analytics.tsx`

#### 9. Financial Management
```
MISSING: Financial Dashboard
- Revenue tracking
- Marketplace transaction history
- Payout management
- Invoice generation
- Refund processing
```
**Required Files:**
- `components/admin/financial/RevenueDashboard.tsx`
- `components/admin/financial/TransactionHistory.tsx`
- `components/admin/financial/PayoutManagement.tsx`
- `components/admin/financial/InvoiceGenerator.tsx`

#### 10. System Health & Monitoring
```
MISSING: Monitoring Dashboard
- API health status
- Database performance
- Error logging
- Performance metrics
- Alert configuration
```
**Required Files:**
- `components/admin/system/MonitoringDashboard.tsx`
- `components/admin/system/AlertConfig.tsx`
- `components/admin/system/ErrorLogViewer.tsx`

---

## UI/UX Improvements Needed

### 1. Data Tables
- Add column resizing
- Add row selection with actions
- Add inline editing
- Add advanced filters (date range, multi-select)
- Add saved filter presets

### 2. Forms
- Add auto-save functionality
- Add draft preservation
- Add rich text editor for descriptions
- Add image/file upload with preview
- Add form validation feedback

### 3. Navigation
- Add breadcrumbs
- Add quick search (cmd+k)
- Add keyboard shortcuts
- Add recent items

### 4. Notifications
- Add toast notifications for actions
- Add notification center
- Add real-time updates

### 5. Loading States
- Add skeleton screens
- Add progress indicators for bulk operations
- Add optimistic updates

---

## Connected Operations

### Data Flow to Web App (`apps/web/`)
```
Admin Panel → Opportunities → Web App
├── OpportunityList → AllOpportunities.tsx
├── OpportunityForm → Create/Update API
├── FeaturedManager → Featured sections on Dashboard
└── Announcements → NotificationInbox.tsx
```

### Data Flow to Mobile App (`apps/edutu_mobile/`)
```
Admin Panel → Opportunities → Mobile App
├── OpportunityList → opportunities/index.tsx
├── FeaturedManager → Home feed
└── Announcements → Push notifications
```

### Data Flow to Landing Page (`apps/landing/`)
```
Admin Panel → Analytics → Landing Page
├── Featured opportunities count
├── User statistics
└── Marketplace data
```

---

## Admin Privilege Levels

### Current Implementation
- Simple admin check via `useAdminCheck` hook
- Binary access (admin vs non-admin)

### Required Privilege Levels
1. **Super Admin** - Full system access
2. **Content Admin** - Opportunities, Community, Announcements
3. **User Admin** - User management, Roles
4. **Analytics Admin** - Read-only analytics
5. **Support Admin** - Help center, Tickets only
6. **Finance Admin** - Financial operations only

---

## API Endpoints Required

### Opportunities API
```typescript
// Current (if exists)
GET    /api/opportunities
POST   /api/opportunities
PUT    /api/opportunities/:id
DELETE /api/opportunities/:id

// Missing
GET    /api/opportunities/featured
POST   /api/opportunities/:id/feature
DELETE /api/opportunities/:id/feature
POST   /api/opportunities/bulk-import
PUT    /api/opportunities/bulk-update
POST   /api/opportunities/verify/:id
GET    /api/opportunities/categories
POST   /api/opportunities/categories
PUT    /api/opportunities/categories/:id
DELETE /api/opportunities/categories/:id
```

### Users API
```typescript
// Missing
GET    /api/users/roles
POST   /api/users/roles
PUT    /api/users/roles/:id
DELETE /api/users/roles/:id
POST   /api/users/:id/assign-role
GET    /api/users/:id/activity
```

### Analytics API
```typescript
// Missing
GET    /api/analytics/engagement
GET    /api/analytics/geographic
GET    /api/analytics/trends
GET    /api/analytics/export
POST   /api/analytics/reports
```

---

## Priority Implementation Plan

### Phase 1: Critical (Week 1-2)
1. Featured Opportunities System
2. Bulk Import/Export
3. Category Management
4. Basic RBAC

### Phase 2: Important (Week 3-4)
1. Advanced Analytics Dashboard
2. Content Moderation Queue
3. Notification System
4. Financial Basics

### Phase 3: Enhancement (Week 5-6)
1. System Monitoring
2. Advanced Moderation Rules
3. Report Generation
4. UI/UX Improvements

---

## Files to Create

### Priority 1 - Admin Components
```
src/components/admin/
├── opportunities/
│   ├── CategoryManager.tsx      # NEW
│   ├── CategoryForm.tsx         # NEW
│   ├── FeaturedManager.tsx     # NEW
│   ├── FeaturedSchedule.tsx    # NEW
│   ├── BulkImportModal.tsx     # NEW
│   ├── BulkActions.tsx         # NEW
│   ├── VerificationQueue.tsx   # NEW
│   └── RejectionReasons.tsx    # NEW
├── users/
│   ├── RoleManager.tsx         # NEW
│   ├── PermissionMatrix.tsx    # NEW
│   └── RoleAssignment.tsx      # NEW
├── analytics/
│   ├── EngagementMetrics.tsx   # NEW
│   ├── GeographicMap.tsx        # NEW
│   ├── TrendAnalysis.tsx       # NEW
│   └── ReportGenerator.tsx     # NEW
├── notifications/
│   ├── TemplateManager.tsx     # NEW
│   ├── ScheduleManager.tsx    # NEW
│   └── Analytics.tsx          # NEW
├── community/
│   ├── ModerationQueue.tsx     # NEW
│   ├── AutoModRules.tsx        # NEW
│   └── AppealManager.tsx       # NEW
└── financial/
    ├── RevenueDashboard.tsx    # NEW
    ├── TransactionHistory.tsx  # NEW
    ├── PayoutManagement.tsx    # NEW
    └── InvoiceGenerator.tsx   # NEW
```

### Priority 2 - Services
```
src/services/
├── opportunities.ts             # Update existing
├── categories.ts                # NEW
├── featured.ts                  # NEW
├── bulkOperations.ts           # NEW
├── users.ts                    # Update existing
├── roles.ts                    # NEW
├── analytics.ts                # NEW
├── notifications.ts            # NEW
├── moderation.ts              # NEW
└── financial.ts               # NEW
```

### Priority 3 - Hooks
```
src/hooks/
├── useCategories.ts            # NEW
├── useFeatured.ts              # NEW
├── useBulkOperations.ts        # NEW
├── useRoles.ts                 # NEW
├── useAnalytics.ts             # Update existing
├── useNotifications.ts         # Update existing
└── useModeration.ts            # NEW
```

---

## Integration Checklist

- [ ] Connect opportunity CRUD to Web App
- [ ] Connect opportunity CRUD to Mobile App
- [ ] Connect featured system to all apps
- [ ] Connect announcements to push notifications
- [ ] Connect user management with Clerk
- [ ] Connect analytics with database
- [ ] Connect marketplace with financial system

---

## Testing Requirements

### Unit Tests
- Form validation
- Component rendering
- Hook logic
- Utility functions

### Integration Tests
- API endpoints
- Data flow between admin and apps
- Authentication flow
- Role-based access

### E2E Tests
- Complete admin workflows
- Opportunity creation flow
- User management flow
- Bulk operations

---

*Last Updated: 2026-04-07*
*Document Version: 1.0*