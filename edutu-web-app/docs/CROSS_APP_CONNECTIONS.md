# Cross-App Connections & Data Flow Documentation

## Overview
Edutu consists of four interconnected applications that share data, authentication, and functionality:

```
┌─────────────────┐     ┌─────────────────┐
│   Landing      │────▶│    Web App      │
│   (Marketing)  │     │   (Main App)    │
└─────────────────┘     └─────────────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐     ┌─────────────────┐
│  Admin Panel    │◀───▶│  Mobile App     │
│  (Management)   │     │  (edutu_mobile) │
└─────────────────┘     └─────────────────┘
```

---

## Application Architecture

### Technology Stack by App

| App | Framework | Auth | State | API |
|-----|-----------|------|-------|-----|
| Landing | Vite + React | Clerk | React Context | REST |
| Web | Vite + React | Clerk | React Context | REST + Firebase |
| Admin | Vite + React | Clerk | React Context | REST |
| Mobile | Expo + RN | Clerk | Zustand | REST + Firebase |
| API | NestJS | JWT | Drizzle ORM | PostgreSQL |

---

## Data Flow Diagram

### Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                               EXTERNAL APIs                                   │
│  • Job Boards    • Scholarship Databases    • Government APIs               │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ADMIN PANEL                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌────────────────┐   │
│  │ Opportunity │  │    User      │  │ Community   │  │   Analytics    │   │
│  │  Management │  │  Management  │  │  Management │  │   Dashboard    │   │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘   │
│         │                 │                  │                   │            │
│         └─────────────────┼──────────────────┴───────────────────┘            │
│                           │                                                  │
│                           ▼                                                  │
│                  ┌─────────────────┐                                        │
│                  │   Services/API  │                                        │
│                  └────────┬────────┘                                        │
└──────────────────────────┼──────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│    Landing    │  │   Web App     │  │  Mobile App   │
│   (Read-Only) │  │ (Read/Write)  │  │ (Read/Write)  │
└───────────────┘  └───────────────┘  └───────────────┘
        │                  │                  │
        │                  ▼                  │
        │         ┌───────────────┐          │
        │         │    Clerk Auth  │          │
        │         └───────────────┘          │
        │                  │                  │
        │                  ▼                  │
        │         ┌───────────────┐          │
        └────────▶│  Supabase DB  │◀─────────┘
                  └───────────────┘
```

---

## Detailed Connection Mappings

### 1. Opportunities Data Flow

```
Admin Panel                    Web App                    Mobile App
    │                              │                           │
    ├──Create Opportunity────────▶│                           │
    │   POST /api/opportunities   │                           │
    │                              │                           │
    ├──Update Opportunity────────▶│                           │
    │   PUT /api/opportunities/:id │                           │
    │                              │                           │
    ├──Delete Opportunity         │                           │
    │   DELETE /api/opps/:id       │                           │
    │                              │                           │
    ├──Mark as Featured──────────▶│                           │
    │                              │                           │
    │                    Fetch Opportunities                  │
    │                    GET /api/opportunities               │
    │                    GET /api/opportunities/featured     │
    │                    GET /api/opportunities/:id           │
    │                                                      │
    │                                          Fetch Opportunities
    │                                          GET /api/opportunities
    │                                          GET /api/opportunities/featured
    │                                          GET /api/opportunities/:id
```

#### Opportunity Schema
```typescript
interface Opportunity {
  id: string;
  title: string;
  organization: string;
  description: string;
  requirements: string[];
  benefits: string[];
  location: string;
  type: 'job' | 'scholarship' | 'grant' | 'fellowship' | 'internship';
  category: string;
  deadline: string;
  applicationUrl: string;
  imageUrl?: string;
  isFeatured: boolean;
  featuredUntil?: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'expired';
  views: number;
  applications: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

### 2. User Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLERK AUTHENTICATION                               │
│                                                                              │
│  ┌─────────┐    ┌──────────┐    ┌─────────────┐    ┌────────────────┐   │
│  │ Landing │───▶│  Sign In │───▶│ Clerk Verify │───▶│  Issue Token   │   │
│  │  Page   │    │   Modal  │    │   (Server)   │    │   (JWT)        │   │
│  └─────────┘    └──────────┘    └─────────────┘    └───────┬────────┘   │
│                                                              │              │
│  ┌─────────┐    ┌──────────┐    ┌─────────────┐           │              │
│  │ Web App │◀────│ Redirect │◀───│ Update State │◀──────────┘              │
│  │         │    │  to /app  │    │  + User Data │                          │
│  └─────────┘    └──────────┘    └─────────────┘                          │
│                                                                              │
│  ┌─────────┐    ┌──────────┐    ┌─────────────┐    ┌────────────────┐   │
│  │  Admin  │───▶│  Check   │───▶│  Verify Role │───▶│  Grant Access  │   │
│  │  Panel  │    │   Role   │    │   (Admin)    │    │  (Dashboard)   │   │
│  └─────────┘    └──────────┘    └─────────────┘    └────────────────┘   │
│                                                                              │
│  ┌───────────┐   ┌──────────┐    ┌─────────────┐    ┌────────────────┐  │
│  │ Mobile    │──▶│  Sign In │───▶│ Clerk Verify │───▶│ Update State   │  │
│  │   App     │    │   (SDK)  │    │   (SDK)      │    │  + Store Data  │  │
│  └───────────┘    └──────────┘    └─────────────┘    └────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Notifications Flow

```
Admin Panel                    Web App                    Mobile App
    │                              │                           │
    ├──Create Announcement────────▶│                          │
    │   POST /api/announcements   │   GET /api/notifications │
    │                              │   (Poll every 5 min)     │
    │                              │                          │
    ├──Mark as Urgent─────────────▶│                          │
    │   Push Notification          │                          │
    │   (FCM/APNS)                │                          │
    │                              │              Push Notification
    │                              │              (FCM/APNS)
    │                              │                           │
    ├──Support Ticket─────────────▶│                           │
    │   Notify user               │                           │
```

### 4. Community & Marketplace Flow

```
Admin Panel                    Web App                    Mobile App
    │                              │                           │
    ├──Create Roadmap─────────────▶│                           │
    │   POST /api/roadmaps         │   GET /api/roadmaps       │
    │                              │   GET /api/roadmaps/:id   │
    │                              │                           │
    ├──Approve Post───────────────▶│                           │
    │   POST /api/posts/:id/approve│  GET /api/posts          │
    │                              │  GET /api/posts/:id       │
    │                              │                           │
    ├──Create Marketplace Item────▶│                           │
    │   POST /api/marketplace     │  GET /api/marketplace    │
    │                              │  GET /api/marketplace/:id │
    │                              │                           │
    ├──Purchase Item         ◀─────┤                          │
    │   POST /api/purchase         │  POST /api/purchase      │
    │   (Web only for now)        │                           │
```

### 5. Goals & Progress Flow

```
Web App                        Mobile App                 API
    │                              │                           │
    ├──Create Goal────────────────▶│                           │
    │   POST /api/goals            │  POST /api/goals         │
    │                              │                           │
    ├──Update Progress────────────▶│                          │
    │   PUT /api/goals/:id         │  PUT /api/goals/:id      │
    │                              │                          │
    ├──Sync Progress──────────────▶│                          │
    │   GET /api/goals/user/:id   │  GET /api/goals/user/:id │
    │                              │                          │
    └──────────────────────────────┘                          │
          Goals sync across apps via same user ID              │
```

### 6. AI Features Flow

```
Admin Panel                    Web App                    Mobile App
    │                              │                           │
    ├──Configure AI──────────────▶│                           │
    │   POST /api/ai/config       │   GET /api/ai/config     │
    │                              │                           │
    ├──Train RAG Data─────────────▶│                           │
    │   POST /api/ai/rag          │                           │
    │                              │                           │
    ├──Tune Recommendations──────▶│                          │
    │   PUT /api/ai/recommendations│                          │
    │                              │                           │
    │                    AI Chat Request                    │
    │                    POST /api/ai/chat                   │
    │                    (Web & Mobile)                      │
    │                              │                           │
    │                    Get Recommendations                │
    │                    GET /api/ai/recommendations         │
```

---

## Shared Services

### 1. API Service (services/api/)
```typescript
// Shared base URL and configuration
const API_BASE_URL = process.env.VITE_API_URL || 'https://edutu-api.onrender.com';

// Common headers
const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getClerkToken()}`,
});

// API methods
export const api = {
  get: async <T>(endpoint: string) => { /* ... */ },
  post: async <T>(endpoint: string, data: any) => { /* ... */ },
  put: async <T>(endpoint: string, data: any) => { /* ... */ },
  delete: async <T>(endpoint: string) => { /* ... */ },
};
```

### 2. Auth Service
```typescript
// Shared auth utilities
export const auth = {
  getCurrentUser: () => { /* ... */ },
  isAuthenticated: () => { /* ... */ },
  hasRole: (role: string) => { /* ... */ },
  signOut: () => { /* ... */ },
};
```

### 3. Storage Service
```typescript
// Supabase storage for all apps
export const storage = {
  uploadFile: async (path: string, file: File) => { /* ... */ },
  downloadFile: async (path: string) => { /* ... */ },
  deleteFile: async (path: string) => { /* ... */ },
};
```

---

## Database Schema (Shared)

### Core Tables
```sql
-- Users (synced with Clerk)
users (
  id UUID PRIMARY KEY,        -- Clerk user ID
  email VARCHAR(255),
  full_name VARCHAR(255),
  avatar_url TEXT,
  role VARCHAR(50),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Opportunities
opportunities (
  id UUID PRIMARY KEY,
  title VARCHAR(255),
  organization VARCHAR(255),
  description TEXT,
  requirements JSONB,
  benefits JSONB,
  location VARCHAR(255),
  type VARCHAR(50),
  category VARCHAR(100),
  deadline TIMESTAMP,
  application_url TEXT,
  image_url TEXT,
  is_featured BOOLEAN DEFAULT false,
  featured_until TIMESTAMP,
  status VARCHAR(50),
  views INTEGER DEFAULT 0,
  applications INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Goals
goals (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title VARCHAR(255),
  description TEXT,
  category VARCHAR(100),
  progress INTEGER DEFAULT 0,
  source VARCHAR(50),
  template_id UUID,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Announcements
announcements (
  id UUID PRIMARY KEY,
  title VARCHAR(255),
  content TEXT,
  is_urgent BOOLEAN DEFAULT false,
  target_audience VARCHAR(50),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP,
  expires_at TIMESTAMP
)

-- Roadmaps (Marketplace)
roadmaps (
  id UUID PRIMARY KEY,
  title VARCHAR(255),
  description TEXT,
  category VARCHAR(100),
  price DECIMAL(10,2),
  is_featured BOOLEAN DEFAULT false,
  status VARCHAR(50),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Purchases
purchases (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  roadmap_id UUID REFERENCES roadmaps(id),
  amount DECIMAL(10,2),
  status VARCHAR(50),
  created_at TIMESTAMP
)
```

---

## Connection Implementation Matrix

### Landing Page Connections
| Feature | Source | Method | Status |
|---------|--------|--------|--------|
| Auth Buttons | Web App | Redirect | ❌ Missing |
| App Download | Mobile App | Deep Link | ❌ Missing |
| Featured Stats | Admin | API Fetch | ❌ Missing |
| Featured Opps | Admin | API Fetch | ❌ Missing |
| Testimonials | Admin | API Fetch | ❌ Missing |

### Web App Connections
| Feature | Source | Method | Status |
|---------|--------|--------|--------|
| Auth | Clerk | SDK | ✅ Implemented |
| User Profile | Clerk + DB | API | ✅ Implemented |
| Opportunities | Admin | API | ✅ Partial |
| Goals | DB | API | ✅ Implemented |
| AI Chat | Admin | API | ✅ Partial |
| Notifications | Admin | Polling | ✅ Partial |

### Mobile App Connections
| Feature | Source | Method | Status |
|---------|--------|--------|--------|
| Auth | Clerk | SDK | ✅ Implemented |
| User Profile | Clerk + DB | API | ✅ Partial |
| Opportunities | Admin | API | ✅ Partial |
| Goals | DB | API | ✅ Implemented |
| Push Notifications | Admin | FCM | ❌ Missing |
| Deep Links | Web | URL Scheme | ❌ Missing |

### Admin Panel Connections
| Feature | Target | Method | Status |
|---------|--------|--------|--------|
| CRUD Opportunities | DB | API | ✅ Implemented |
| Manage Users | DB | API | ✅ Implemented |
| Analytics | DB | API | ✅ Partial |
| AI Config | DB | API | ✅ Implemented |
| Marketplace | DB | API | ✅ Implemented |

---

## Missing Connections to Implement

### 1. Landing → Web App
- [ ] Auth flow integration with Clerk
- [ ] Session persistence
- [ ] Redirect after signup
- [ ] Track landing source

### 2. Landing → Mobile App
- [ ] Deep link scheme setup (edutu://)
- [ ] Universal links (https://edutu.app/)
- [ ] App install tracking
- [ ] QR code generation

### 3. Web App ↔ Mobile App
- [ ] Cross-platform goal sync
- [ ] Notification sync
- [ ] Progress sync
- [ ] Deep linking

### 4. All Apps → Admin
- [ ] Real-time updates (WebSockets)
- [ ] Shared API caching
- [ ] Unified error handling

---

## API Endpoints by Connection

### Opportunities
```typescript
// Admin → All Apps
GET    /api/opportunities              // List all (paginated)
GET    /api/opportunities/:id          // Get single
GET    /api/opportunities/featured     // Get featured
GET    /api/opportunities/search       // Search
POST   /api/opportunities              // Create (Admin)
PUT    /api/opportunities/:id          // Update (Admin)
DELETE /api/opportunities/:id          // Delete (Admin)
POST   /api/opportunities/:id/feature  // Feature (Admin)
```

### Users
```typescript
// All Apps
GET    /api/users/me                   // Current user
PUT    /api/users/me                   // Update profile
GET    /api/users/:id                  // Get user (Admin)
GET    /api/users                      // List users (Admin)
PUT    /api/users/:id/role            // Update role (Admin)
```

### Goals
```typescript
// Web + Mobile
GET    /api/goals                      // User's goals
POST   /api/goals                      // Create goal
PUT    /api/goals/:id                  // Update goal
DELETE /api/goals/:id                  // Delete goal
PUT    /api/goals/:id/progress         // Update progress
```

### Notifications
```typescript
// All Apps
GET    /api/notifications              // User notifications
PUT    /api/notifications/:id/read     // Mark read
POST   /api/notifications/subscribe   // Subscribe (FCM/APNS)
```

### AI
```typescript
// Web + Mobile
POST   /api/ai/chat                   // Chat with AI
GET    /api/ai/recommendations        // Get recommendations
POST   /api/ai/feedback              // Feedback on recommendations

// Admin
GET    /api/ai/config                 // Get AI config
PUT    /api/ai/config                 // Update AI config
POST   /api/ai/rag                    // Add RAG data
GET    /ai/rag                        // Get RAG data
```

---

## Environment Variables Required

```env
# Shared
VITE_API_URL=https://edutu-api.onrender.com
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxx

# Landing specific
VITE_WEB_APP_URL=http://localhost:5173
VITE_MOBILE_APP_URL=edutu://
VITE_MOBILE_DEEP_LINK=https://edutu.app

# Web specific
VITE_LANDING_URL=http://localhost:5174

# Admin specific
VITE_ALLOWED_ADMIN_ROLES=admin,super_admin

# Mobile specific
VITE_DEEP_LINK_SCHEME=edutu
VITE_FCM_SENDER_ID=xxx
```

---

## Testing Cross-App Connections

### Integration Tests Required
1. **Auth Flow**: Landing → Web App → Mobile
2. **Data Sync**: Web → DB → Mobile
3. **Admin CRUD**: Admin → DB → Web/Mobile
4. **Notifications**: Admin → Web/Mobile
5. **Deep Links**: Landing → Mobile

### Test Scenarios
- [ ] New user signup from landing converts to web user
- [ ] Opportunity created in admin appears in web and mobile
- [ ] Goal progress syncs between web and mobile
- [ ] Push notification received on mobile from admin action
- [ ] Deep link from landing opens correct screen in mobile

---

*Last Updated: 2026-04-07*
*Document Version: 1.0*
