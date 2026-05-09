# Edutu Backend Integration Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (New Project)                  │
│                     (React/Next.js)                         │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP / WebSocket
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend API (NestJS)                      │
│         http://localhost:3001 (or your deployed URL)        │
│  - Opportunities CRUD                                       │
│  - Web Scraper Service                                      │
│  - Auth (Clerk-based)                                       │
└─────────────────────┬───────────────────────────────────────┘
                      │ Supabase Client
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Supabase (PostgreSQL)                    │
│  - Database                                                 │
│  - Auth                                                     │
│  - Realtime                                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Supabase Setup

### Environment Variables

```env
# .env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Backend
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
```

### Database Schema (Key Tables)

**opportunities**
```sql
CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  description TEXT,
  category TEXT, -- 'Scholarships', 'Internships', 'Fellowships', 'Grants', 'Programs', 'Competitions'
  organization TEXT,
  location TEXT,
  is_remote BOOLEAN DEFAULT false,
  application_url TEXT,
  close_date TIMESTAMP,
  image_url TEXT,
  is_featured BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active', -- 'active', 'closed', 'draft'
  views INTEGER DEFAULT 0,
  applications INTEGER DEFAULT 0,
  eligibility JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**profiles** (linked to Supabase Auth)
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  user_id UUID UNIQUE NOT NULL,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user', -- 'user', 'creator', 'admin'
  creator_status TEXT, -- 'pending', 'approved', 'rejected'
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 2. Backend API Endpoints

### Base URL
```env
VITE_API_URL=http://localhost:3001
```

### Opportunities API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/opportunities` | Public | List all opportunities |
| GET | `/api/opportunities?status=active` | Public | Filter by status |
| GET | `/api/opportunities?category=Scholarships` | Public | Filter by category |
| GET | `/api/opportunities/:id` | Public | Get single opportunity |
| POST | `/api/opportunities` | Admin | Create opportunity |
| PATCH | `/api/opportunities/:id` | Admin | Update opportunity |
| DELETE | `/api/opportunities/:id` | Admin | Delete opportunity |
| POST | `/api/opportunities/:id/approve` | Admin | Approve opportunity |
| POST | `/api/opportunities/:id/reject` | Admin | Reject opportunity |
| POST | `/api/opportunities/sync` | Admin | Trigger auto-sync |

### Scraper API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/scrape` | Admin | Scrape single URL |
| POST | `/api/scrape/bulk` | Admin | Bulk scrape URLs |

**Request (Single URL):**
```typescript
// POST /api/scrape
{
  "url": "https://example.com/scholarship"
}
```

**Response:**
```typescript
{
  "success": true,
  "data": {
    "title": "2024 Scholarship Name",
    "organization": "Organization Name",
    "description": "...",
    "application_url": "https://...",
    "close_date": "2024-12-31",
    "category": "Scholarships",
    "eligibility": {
      "school": "Any",
      "major": "Any",
      "min_cgpa": 3.0,
      "countries": ["US", "CA"]
    }
  },
  "confidence": 85
}
```

---

## 3. Frontend Integration

### Option A: Direct Supabase Connection (Recommended for Read Operations)

For public data like listing opportunities, connect directly to Supabase:

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Fetch opportunities directly
const { data, error } = await supabase
  .from('opportunities')
  .select('*')
  .eq('status', 'active')
  .order('created_at', { ascending: false });
```

### Option B: Backend API Connection (For Admin/Write Operations)

For authenticated operations that require admin access:

```typescript
// lib/api.ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }
  
  return response.json();
}

// Usage
const opportunities = await fetchWithAuth('/api/opportunities');
```

---

## 4. Authentication Flow

The system uses Supabase Auth. Here's the integration:

```typescript
// lib/auth.ts
import { supabase } from './supabase';

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { data, error };
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export function onAuthStateChange(callback: (event: string, session: any) => void) {
  return supabase.auth.onAuthStateChange(callback);
}
```

### Admin Check

For admin-only routes, check the user's email against `ADMIN_EMAILS` environment variable on the backend. Frontend can check via user metadata:

```typescript
// Check if user is admin
const isAdmin = user?.email === 'admin@edutu.com'; // Configure your admin emails
```

---

## 5. Webhook Integration

The system supports webhooks for external integrations:

### Setting Up Webhooks

```typescript
// In your new frontend
const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || 'https://api.edutu.com/webhooks';

// Register webhook
await fetch('/api/webhooks/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://your-app.com/webhook-endpoint',
    events: ['opportunity.created', 'opportunity.updated']
  })
});
```

### Webhook Payload Example

```json
{
  "event": "opportunity.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "id": "opp_123",
    "title": "New Scholarship",
    "organization": "Test Org",
    "status": "active"
  }
}
```

---

## 6. Complete Integration Checklist

### Step 1: Supabase Configuration
- [ ] Create Supabase project
- [ ] Set up database tables (opportunities, profiles, etc.)
- [ ] Configure RLS policies

### Step 2: Environment Variables
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:3001
```

### Step 3: Install Dependencies
```bash
npm install @supabase/supabase-js
```

### Step 4: Create API Client
```typescript
// src/lib/supabase.ts - Already exists in admin
// Reuse or adapt for new project
```

### Step 5: Connect Opportunities Data
```typescript
// Fetch opportunities
const { data: opportunities } = await supabase
  .from('opportunities')
  .select('*')
  .eq('status', 'active');
```

---

## 7. Key Files Reference

| File | Purpose |
|------|---------|
| `admin/src/lib/supabase.ts` | Supabase client setup |
| `admin/src/pages/Opportunities.tsx` | Opportunities CRUD UI |
| `backend/services/api/src/opportunities/` | Backend opportunities module |
| `backend/services/api/src/auth/` | Authentication module |

---

## 8. Testing Integration

```typescript
// Quick test - fetch opportunities
import { supabase } from './lib/supabase';

async function testConnection() {
  const { data, error } = await supabase
    .from('opportunities')
    .select('id, title, status')
    .limit(5);
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Opportunities:', data);
  }
}

testConnection();
```

---

## 9. Deployment Notes

### Backend (NestJS)
```bash
cd backend/services/api
npm run build
# Deploy to Railway, Render, or your preferred host
```

### Supabase
- Production: Use production Supabase project
- Set appropriate RLS policies
- Configure environment variables in hosting platform

### Frontend
- Set `VITE_API_URL` to your deployed backend URL
- Use production Supabase keys

---

## Troubleshooting

**CORS Issues**: Ensure backend allows your frontend origin
**Auth Errors**: Check Supabase URL and anon key are correct
**Admin Access**: Verify email is in `ADMIN_EMAILS` env variable
**Scraper Not Working**: Ensure Serper API key is configured in backend
