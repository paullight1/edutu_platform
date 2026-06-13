# Edutu System Architecture

## Overview

```
Edutu_Folder/
├── admin/              # React Admin Panel (Vite + TypeScript)
├── backend/            # Node.js API Server (Express)
└── edutu_mobile/        # Expo Mobile App (React Native)
```

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        EDUTU PLATFORM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐ │
│  │   ADMIN      │     │   BACKEND     │     │   MOBILE     │ │
│  │   PANEL      │◄───►│   API         │◄───►│   APP        │ │
│  │              │     │               │     │              │ │
│  │  • Dashboard │     │  • Scraper    │     │  • Listings  │ │
│  │  • Users     │     │  • Auth       │     │  • Profile   │ │
│  │  • Opp's     │     │  • Database   │     │  • Apply     │ │
│  │  • Settings  │     │  • AI Engine  │     │  • Alerts    │ │
│  └──────────────┘     └───────┬────────┘     └──────────────┘ │
│                               │                                   │
│                               ▼                                   │
│                    ┌──────────────────────┐                       │
│                    │    SUPABASE         │                       │
│                    │  • PostgreSQL       │                       │
│                    │  • Auth             │                       │
│                    │  • Storage          │                       │
│                    │  • Realtime         │                       │
│                    └──────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

## Services

### 1. Admin Panel (`admin/`)
- **Tech Stack:** React + Vite + TypeScript
- **Port:** 5173
- **Purpose:** Platform management
- **Features:**
  - Dashboard with analytics
  - User management
  - Opportunity CRUD
  - Creator approval
  - Settings

### 2. Backend API (`backend/`)
- **Tech Stack:** Node.js + Express + Playwright + OpenAI
- **Port:** 3001
- **Purpose:** Core API + AI Scraping
- **Endpoints:**
  - `POST /api/scrape` - Single URL extraction
  - `POST /api/scrape/bulk` - Bulk URL processing
  - `POST /api/scrape/upload` - Excel/CSV upload
  - `GET /api/status` - API health

### 3. Mobile App (`edutu_mobile/`)
- **Tech Stack:** Expo + React Native
- **Purpose:** End-user mobile experience

### 4. Database (Supabase)
- **Services:**
  - PostgreSQL database
  - Authentication
  - File storage
  - Real-time subscriptions

## Environment Configuration

### Backend (.env)
```env
OPENAI_API_KEY=sk-xxx
PORT=3001
NODE_ENV=development
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
```

### Admin (.env)
```env
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_API_URL=https://edutu-api.onrender.com
```

### Mobile (similar to admin)
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
API_URL=https://edutu-api.onrender.com
```

## Deployment

### Development
```bash
# Terminal 1 - Backend
cd backend
npm install
npm run dev

# Terminal 2 - Admin
cd admin
npm install
npm run dev
```

### Production (Recommended)

1. **Backend** → Render / Railway / DigitalOcean
2. **Admin** → Vercel / Netlify
3. **Mobile** → EAS Build / TestFlight / Play Store

## API Communication

```
Admin/Mobile ──HTTP──► Backend ──HTTPS──► External Sites
        │              │
        │              ▼
        │       ┌──────────────┐
        │       │  Supabase    │
        │       └──────────────┘
        │
        ▼
   End Users
```

## Key Principles

1. **Single Source of Truth** - Backend serves both admin and mobile
2. **Separation of Concerns** - Each app has its own repo/folder
3. **Shared Database** - Supabase is the single data source
4. **Environment Variables** - No hardcoded configs
5. **RESTful API** - Backend exposes standard endpoints

## CORS Configuration

Backend CORS must include all client origins:
```javascript
app.use(cors({
    origin: [
        'http://localhost:5173',  // Admin dev
        'http://localhost:8081',  // Mobile dev
        'https://admin.edutu.org', // Admin prod
        'edutu://'                 // Mobile app
    ]
}));
```

## Troubleshooting

### Mobile can't reach backend
- Check API_URL in mobile .env
- Ensure backend CORS includes mobile origin
- Use ngrok for local mobile testing

### Admin can't reach backend
- Check VITE_API_URL in admin .env
- Verify backend is running on correct port
- Check CORS settings in backend

## Version Info
- Node.js: 18+
- React: 18+
- Expo: SDK 50+
- Supabase: Latest
