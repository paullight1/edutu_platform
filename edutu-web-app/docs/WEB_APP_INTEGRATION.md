# Web App Integration Documentation

## Overview
The Edutu Web App (`apps/web/`) is the main application for users to discover opportunities, manage goals, chat with AI, and access the full platform functionality. It integrates with Landing, Admin, and Mobile apps.

---

## Current Implementation Analysis

### Core Components
| Component | File | Status |
|-----------|------|--------|
| Main App | `App.tsx` | ✅ Implemented |
| Auth Screen | `AuthScreen.tsx` | ✅ Implemented |
| Dashboard | `Dashboard.tsx` | ✅ Implemented |
| App Layout | `AppLayout.tsx` | ✅ Implemented |
| Navigation | `Navigation.tsx` | ✅ Implemented |

### Feature Pages
| Feature | File | Status |
|---------|------|--------|
| All Opportunities | `AllOpportunities.tsx` | ✅ Implemented |
| Opportunity Detail | `OpportunityDetail.tsx` | ✅ Implemented |
| Opportunity Roadmap | `OpportunityRoadmap.tsx` | ✅ Implemented |
| Personalized Roadmap | `PersonalizedRoadmap.tsx` | ✅ Implemented |
| Goals | `AllGoals.tsx` | ✅ Implemented |
| Add Goal | `AddGoalScreen.tsx` | ✅ Implemented |
| Chat | `ChatInterface.tsx` | ✅ Implemented |
| Community | `CommunityMarketplace.tsx` | ✅ Implemented |
| Settings | `SettingsMenu.tsx` | ✅ Implemented |
| Profile | `Profile.tsx` | ✅ Implemented |
| Edit Profile | `EditProfileScreen.tsx` | ✅ Implemented |
| Notifications | `NotificationsScreen.tsx` | ✅ Implemented |
| CV Management | `CVManagement.tsx` | ✅ Implemented |
| Achievements | `AchievementsScreen.tsx` | ✅ Implemented |
| Quiz | `QuizPage.tsx` | ✅ Implemented |
| Flashcards | `FlashcardsScreen.tsx` | ✅ Implemented |
| Help | `HelpScreen.tsx` | ✅ Implemented |
| Privacy | `PrivacyScreen.tsx` | ✅ Implemented |

### Embedded Admin Features
| Feature | File | Status |
|---------|------|--------|
| Admin Dashboard | `admin/sections/Overview.tsx` | ✅ Partial |
| Opportunity List | `admin/opportunities/OpportunityList.tsx` | ✅ Partial |
| Analytics | `admin/analytics/AnalyticsDashboard.tsx` | ✅ Partial |

---

## Missing Features & Components

### 1. Landing Page Integration
```
MISSING: Proper Login/Auth Flow
- Landing page "Sign In" button should use Clerk
- "Get Started" should redirect to /auth with signup=true
- Session should persist across landing and web
- Analytics tracking for landing source
```

**Required Implementation:**
```typescript
// Update landing components to integrate properly
// src/components/AuthHandler.tsx (NEW)

import { useClerk, useUser } from '@clerk/clerk-react';

export const useAuthHandler = () => {
  const { openSignIn, openSignUp, signOut } = useClerk();
  const { user, isSignedIn } = useUser();
  
  const handleLogin = () => {
    openSignIn({
      redirectUrl: '/app/home?signup=true'
    });
  };
  
  const handleSignup = () => {
    openSignUp({
      redirectUrl: '/app/home?signup=true'
    });
  };
  
  return { handleLogin, handleSignup, handleLogout: signOut, user, isSignedIn };
};
```

### 2. Mobile App Deep Linking
```
MISSING: Deep Link Integration
- Handle edutu:// URLs
- Handle https://edutu.app/ URLs
- Route to correct screen based on URL
- Handle share links
```

**Required Implementation:**
```typescript
// src/lib/deepLinks.ts (NEW)

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const useDeepLinks = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleDeepLink = (event: CustomEvent<{ url: string }>) => {
      const url = event.detail.url;
      parseAndNavigate(url);
    };

    // Listen for deep links
    window.addEventListener('deep-link', handleDeepLink);

    // Check initial URL
    const initialUrl = new URLSearchParams(window.location.search).get('redirect');
    if (initialUrl) {
      parseAndNavigate(initialUrl);
    }

    return () => window.removeEventListener('deep-link', handleDeepLink);
  }, []);

  const parseAndNavigate = (url: string) => {
    // Parse edutu://opportunity/123
    // Parse https://edutu.app/opportunity/123
    
    const parsed = new URL(url);
    const path = parsed.pathname;
    const params = parsed.searchParams;

    const routes: Record<string, (params: URLSearchParams) => void> = {
      '/opportunity/:id': (p) => navigate(`/app/opportunity/${p.get('id')}`),
      '/goal/:id': (p) => navigate(`/app/goal/${p.get('id')}/roadmap`),
      '/chat': () => navigate('/app/chat'),
      '/settings': () => navigate('/app/settings'),
      '/profile': () => navigate('/app/profile-edit'),
    };

    // Match and navigate
    Object.entries(routes).forEach(([route, handler]) => {
      if (matchPath(route, path)) {
        handler(params);
      }
    });
  };

  return { parseAndNavigate };
};
```

### 3. Real-time Notifications
```
MISSING: Real-time Updates
- WebSocket connection for live notifications
- Toast notifications for new opportunities
- Real-time chat messages
- Live goal progress updates
```

**Required Implementation:**
```typescript
// src/hooks/useRealtimeNotifications.ts (NEW)

import { useEffect, useState, useCallback } from 'react';

interface RealtimeNotification {
  id: string;
  type: 'opportunity' | 'goal' | 'chat' | 'system';
  title: string;
  message: string;
  data?: any;
  timestamp: Date;
}

export const useRealtimeNotifications = () => {
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    // Connect to WebSocket
    const socket = new WebSocket(`${import.meta.env.VITE_WS_URL}/notifications`);
    
    socket.onopen = () => {
      console.log('Connected to notifications');
      // Authenticate
      socket.send(JSON.stringify({ type: 'auth', token: getClerkToken() }));
    };

    socket.onmessage = (event) => {
      const notification = JSON.parse(event.data);
      setNotifications(prev => [notification, ...prev]);
      showToast(notification);
    };

    setWs(socket);

    return () => socket.close();
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    await api.put(`/notifications/${id}/read`);
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
  }, []);

  return { notifications, markAsRead, ws };
};
```

### 4. Offline Support
```
MISSING: PWA Enhancements
- Service worker for offline pages
- Cache opportunities for offline viewing
- Queue actions when offline
- Sync when back online
```

### 5. Admin Panel Integration
```
MISSING: Admin Features in Web
- View admin dashboard from web app
- Quick admin actions for super users
- Toggle between user/admin views
```

---

## Connection Points

### Landing → Web App
```
Landing Page Actions → Web App Routes

1. Click "Sign In" / "Get Started"
   → Open Clerk modal
   → On success: redirect to /app/home

2. Click "Explore Opportunities" (if logged in)
   → Navigate directly to /app/opportunities

3. Click "View Pricing"
   → Navigate to /app/pricing (NEW)

4. Click "Download App"
   → If mobile: open store
   → If desktop: show QR modal
```

### Admin → Web App
```
Admin Panel → Web App Data Flow

1. Create/Update Opportunity
   → API updates DB
   → Web app fetches via polling/WebSocket
   → Shows in "AllOpportunities"

2. Create Announcement
   → API inserts into notifications
   → Web app receives via polling/WebSocket
   → Shows in "NotificationInbox"

3. Feature Opportunity
   → API sets is_featured = true
   → Web app shows in dashboard "Featured"
```

### Web App → Mobile (Data Sync)
```
Web App → Mobile App

1. Create/Update Goal
   → Save to Supabase
   → Mobile fetches via same API
   → Goals stay in sync

2. Update Profile
   → Save to Supabase
   → Mobile shows updated data

3. Complete Learning Path
   → Mark as complete in DB
   → Achievements sync
```

---

## Integration Checklist

### Phase 1: Core Integration (Week 1)
- [ ] Connect landing page auth buttons
- [ ] Fix Clerk integration flow
- [ ] Add deep link handling
- [ ] Implement URL routing

### Phase 2: Real-time Features (Week 2)
- [ ] Add WebSocket for notifications
- [ ] Implement toast system
- [ ] Add chat real-time updates
- [ ] Live goal sync

### Phase 3: Offline & PWA (Week 3)
- [ ] Enhance service worker
- [ ] Add offline support
- [ ] Queue actions when offline
- [ ] Sync on reconnect

### Phase 4: Admin Features (Week 4)
- [ ] Add admin toggle
- [ ] Embed admin components
- [ ] Role-based view switching
- [ ] Quick admin actions

---

## File Structure Changes

### New Files to Create
```
src/
├── components/
│   ├── AuthHandler.tsx           # NEW
│   ├── DeepLinkHandler.tsx       # NEW
│   ├── RealTimeNotifications.tsx # NEW
│   ├── OfflineIndicator.tsx      # NEW
│   └── AdminToggle.tsx           # NEW
├── hooks/
│   ├── useDeepLinks.ts           # NEW
│   ├── useRealtimeNotifications.ts # NEW
│   ├── useOfflineMode.ts         # NEW
│   └── useAdminMode.ts          # NEW
├── lib/
│   ├── deepLinks.ts              # NEW
│   ├── realtime.ts              # NEW
│   └── offline.ts               # NEW
└── pages/
    ├── Pricing.tsx               # NEW
    └── AdminWrapper.tsx          # NEW
```

### Files to Update
```
src/
├── App.tsx                       # UPDATE - Add deep links, real-time
├── main.tsx                      # UPDATE - Add service worker
├── components/
│   ├── Dashboard.tsx            # UPDATE - Add featured from admin
│   ├── NotificationInbox.tsx     # UPDATE - Add real-time
│   └── AppLayout.tsx            # UPDATE - Add offline indicator
└── hooks/
    └── useNotifications.ts      # UPDATE - Add WebSocket support
```

---

## API Integration Points

### Existing Endpoints Used
```typescript
// Auth
POST /api/auth/clerk-callback
GET  /api/auth/me

// Opportunities
GET  /api/opportunities
GET  /api/opportunities/:id
GET  /api/opportunities/featured
POST /api/opportunities/:id/apply

// Goals
GET  /api/goals
POST /api/goals
PUT  /api/goals/:id
DELETE /api/goals/:id

// Profile
GET  /api/users/me
PUT  /api/users/me
POST /api/users/me/avatar

// Notifications
GET  /api/notifications
PUT  /api/notifications/:id/read
POST /api/notifications/subscribe

// Chat
POST /api/ai/chat
GET  /api/ai/history

// Community
GET  /api/roadmaps
GET  /api/marketplace
POST /api/purchases
```

### Missing Endpoints to Create
```typescript
// Deep Links
GET  /api/links/verify  // Verify deep link is valid

// Real-time
WS   /ws/notifications   // WebSocket for live notifications

// Offline
POST /api/sync/queue   // Queue actions for sync
GET  /api/sync/status  // Get sync status

// Admin
GET  /api/admin/quick-stats
POST /api/admin/quick-action
```

---

## Environment Variables

```env
# .env
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
VITE_LANDING_URL=http://localhost:5174
VITE_MOBILE_DEEP_LINK=https://edutu.app
VITE_DEEP_LINK_SCHEME=edutu

# Firebase (for notifications)
VITE_FCM_VAPID_KEY=xxx

# PWA
VITE_PWA_ENABLED=true
VITE_PWA_CACHE_VERSION=1.0.0
```

---

## Testing Requirements

### Integration Tests
1. Login flow from landing to web
2. Deep link from mobile to web
3. Real-time notification delivery
4. Offline action queue and sync
5. Admin toggle functionality

### E2E Tests
1. Complete user journey: landing → signup → dashboard → opportunity
2. Create goal from web, verify appears in mobile
3. Receive push notification from admin action
4. Offline mode: create goal → go online → sync

---

*Last Updated: 2026-04-07*
*Document Version: 1.0*