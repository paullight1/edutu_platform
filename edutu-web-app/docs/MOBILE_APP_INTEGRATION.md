# Mobile App Integration Documentation

## Overview
The Edutu Mobile App (`apps/edutu_mobile/`) is the React Native/Expo application for iOS and Android. It provides on-the-go access to opportunities, goals, and AI chat. Currently built with Expo Router for navigation.

---

## Current Implementation Analysis

### Configuration
| File | Status | Notes |
|------|--------|-------|
| `app.json` | ✅ Configured | Deep link scheme: "edutu" |
| `package.json` | ✅ Configured | Expo SDK 52 |
| `_layout.tsx` | ✅ Configured | Clerk + Theme Provider |

### App Structure (Expo Router)
```
app/
├── _layout.tsx                    # Root layout with Clerk
├── index.tsx                       # Entry point (redirects)
├── (app)/                          # Authenticated routes
│   ├── _layout.tsx               # App layout with tabs
│   ├── index.tsx                 # Home/Dashboard
│   ├── chat.tsx                  # AI Chat
│   ├── explore.tsx               # Explore opportunities
│   ├── notifications.tsx         # Notifications
│   ├── opportunities/
│   │   ├── index.tsx            # Opportunity list
│   │   └── [id].tsx             # Opportunity detail
│   ├── goals/
│   │   ├── index.tsx            # Goals list
│   │   └── add.tsx              # Add goal
│   ├── profile/
│   │   ├── index.tsx            # Profile
│   │   ├── edit.tsx             # Edit profile
│   │   └── settings.tsx         # Settings
│   ├── marketplace.tsx           # Marketplace
│   ├── wallet.tsx               # Wallet/Payments
│   ├── help.tsx                 # Help
│   └── privacy.tsx              # Privacy
├── (auth)/                       # Auth routes
│   ├── _layout.tsx             # Auth layout
│   ├── sign-in.tsx             # Sign in
│   ├── sign-up.tsx             # Sign up
│   └── reset-password.tsx      # Reset password
├── onboarding.tsx                # Onboarding
├── onboarding-welcome.tsx       # Welcome screen
├── creator-apply.tsx            # Creator application
└── creator-dashboard.tsx       # Creator dashboard
```

### Current Features
| Feature | Status | Notes |
|---------|--------|-------|
| Clerk Authentication | ✅ | Using @clerk/clerk-expo |
| Navigation | ✅ | Expo Router with tabs |
| Theme | ✅ | Dark/Light mode |
| Opportunities | ✅ Partial | Basic list/detail |
| Goals | ✅ Partial | Basic CRUD |
| Chat | ✅ Basic | AI chat |
| Profile | ✅ Basic | Profile management |
| Notifications | ✅ Basic | Local notifications |

---

## Missing Features & Components

### 1. Deep Linking (CRITICAL)
```
MISSING: Proper Deep Link Implementation
- Scheme: edutu://
- Universal Links: https://edutu.app/
- Handle all app routes via deep links
- Handle shared links
```

**Required Implementation:**
```typescript
// app.json - Already configured with scheme
{
  "expo": {
    "scheme": "edutu",
    "ios": {
      "associatedDomains": ["applinks:edutu.app"]
    },
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "https",
              "host": "edutu.app"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}

// Need to add inExpo Router:
// app/_app.tsx (or root layout)

import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export function useDeepLinks() {
  const router = useRouter();
  const prefix = Linking.createURL('/');

  useEffect(() => {
    // Handle initial URL
    const handleInitialURL = async () => {
      const initialURL = await Linking.getInitialURL();
      if (initialURL) {
        handleURL(initialURL);
      }
    };

    // Handle URL when app is already open
    const subscription = Linking.addEventListener('url', (event) => {
      handleURL(event.url);
    });

    handleInitialURL();

    return () => subscription.remove();
  }, []);

  const handleURL = (url: string) => {
    const parsedURL = new URL(url);
    const path = parsedURL.pathname;
    const params = parsedURL.searchParams;

    // Route mapping
    const routes: Record<string, string> = {
      '/opportunity': `/opportunities/${params.get('id')}`,
      '/opportunities': '/opportunities',
      '/goal': `/goals/${params.get('id')}`,
      '/chat': '/chat',
      '/profile': '/profile',
      '/settings': '/profile/settings',
    };

    // Match and navigate
    for (const [pattern, route] of Object.entries(routes)) {
      if (path.startsWith(pattern)) {
        router.push(route as any);
        return;
      }
    }

    // Default: home
    router.push('/');
  };
}
```

### 2. Push Notifications
```
MISSING: Push Notifications
- FCM for Android
- APNS for iOS
- Handle notification taps
- Rich notifications
- Notification actions
```

**Required Implementation:**
```typescript
// lib/notifications.ts (NEW)

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const setupPushNotifications = async () => {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Failed to get push notification permissions');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return await Notifications.getExpoPushTokenAsync({
    projectId: 'your-project-id',
  });
};

export const handleNotificationTap = (notification: Notifications.Notification) => {
  const { data } = notification.request.content;
  
  // Navigate based on notification type
  switch (data?.type) {
    case 'opportunity':
      router.push(`/opportunities/${data.id}`);
      break;
    case 'goal':
      router.push(`/goals/${data.id}`);
      break;
    case 'chat':
      router.push('/chat');
      break;
    default:
      router.push('/');
  }
};
```

### 3. Web App Synchronization
```
MISSING: Cross-App Data Sync
- Sync goals with web app
- Sync profile updates
- Sync learning progress
- Offline support with sync queue
```

### 4. Landing Page Download Integration
```
MISSING: Store Presence
- Link to Play Store
- Link to iOS TestFlight
- Show appropriate store badge
- Handle already installed case
```

### 5. Admin Connection
```
MISSING: Admin Notifications
- Receive admin announcements
- Receive featured opportunity alerts
- Get push notification for new opportunities
- View admin notices
```

---

## Connection Points

### Landing Page → Mobile App
```
Landing Page Actions → Mobile App

1. Click "Download Android"
   → Opens Play Store: https://play.google.com/store/apps/details?id=com.edutu.app

2. Click "Join iOS Waitlist"
   → Opens TestFlight or shows waitlist form

3. Click "Use Web App"
   → Deep link to web: https://edutu.app/auth
   → Or redirect to web app

4. Scan QR Code (desktop)
   → Opens mobile app with deep link
```

### Web App → Mobile App
```
Web App → Mobile App (Same User = Same Data)

1. Create/Update Goal (Web)
   → Save to Supabase
   → Mobile fetches on app open/refresh
   → Real-time via WebSocket (optional)

2. Update Profile (Web)
   → Save to Supabase
   → Mobile fetches on profile open

3. Complete Achievement (Web)
   → Mark in DB
   → Mobile shows next time app opens
```

### Admin Panel → Mobile App
```
Admin → Mobile App (Notifications & Data)

1. Create Announcement
   → Insert to notifications table
   → Push notification to user devices

2. Mark Opportunity as Featured
   → Update opportunity in DB
   → Push notification: "New featured opportunity!"

3. Send System Message
   → Push notification with custom payload
   → Show in-app banner
```

---

## Integration Checklist

### Phase 1: Deep Links (Priority 1)
- [ ] Configure app.json with deep link scheme
- [ ] Implement useDeepLinks hook
- [ ] Handle all route patterns
- [ ] Test on Android
- [ ] Test on iOS

### Phase 2: Push Notifications (Priority 1)
- [ ] Setup FCM for Android
- [ ] Setup APNS for iOS
- [ ] Configure notification channels
- [ ] Implement notification tap handling
- [ ] Handle notification actions

### Phase 3: Data Sync (Priority 2)
- [ ] Share Supabase client with web
- [ ] Sync goals
- [ ] Sync profile
- [ ] Add offline queue
- [ ] Sync on reconnect

### Phase 4: Store Presence (Priority 2)
- [ ] Update Play Store listing
- [ ] Create TestFlight build
- [ ] Add store badges
- [ ] Handle "already installed"

### Phase 5: Admin Integration (Priority 3)
- [ ] Receive announcements
- [ ] Receive featured alerts
- [ ] Show admin notices
- [ ] Quick actions from notifications

---

## File Structure to Create

```
edutu_mobile/
├── lib/
│   ├── deepLinks.ts              # NEW - Deep link handling
│   ├── notifications.ts          # NEW - Push notifications
│   ├── sync.ts                   # NEW - Web sync
│   └── storeLinks.ts             # NEW - Store URLs
├── hooks/
│   ├── useDeepLinks.ts           # NEW - Deep link hook
│   ├── usePushNotifications.ts  # NEW - Push notification hook
│   └── useSync.ts               # NEW - Sync hook
├── components/
│   ├── notifications/
│   │   ├── NotificationBanner.tsx  # NEW
│   │   └── NotificationList.tsx    # NEW
│   └── deepLink/
│       └── DeepLinkHandler.tsx     # NEW
└── app/
    └── (app)/
        ├── index.tsx             # UPDATE - Add deep link handler
        └── notifications.tsx    # UPDATE - Add push notif handling
```

---

## Deep Link Routes

| URL | Path | Screen |
|-----|------|--------|
| `edutu://` | `/` | Home |
| `edutu://opportunities` | `/opportunities` | Opportunity List |
| `edutu://opportunities/123` | `/opportunities/123` | Opportunity Detail |
| `edutu://goals` | `/goals` | Goals List |
| `edutu://goals/add` | `/goals/add` | Add Goal |
| `edutu://chat` | `/chat` | AI Chat |
| `edutu://profile` | `/profile` | Profile |
| `edutu://settings` | `/profile/settings` | Settings |
| `https://edutu.app/opportunity/123` | `/opportunities/123` | Opportunity Detail |
| `https://edutu.app/chat` | `/chat` | Chat |

---

## API Endpoints Required

### Notifications
```typescript
POST /api/notifications/register-device
// Body: { token: string, platform: 'ios' | 'android' }

GET /api/notifications
// Query: ?limit=20&offset=0

PUT /api/notifications/:id/read
```

### Sync
```typescript
GET /api/sync/goals?since=timestamp
// Returns goals updated since timestamp

POST /api/sync/goals
// Body: { goals: Goal[] }

GET /api/sync/profile?since=timestamp
```

### Deep Links
```typescript
GET /api/links/verify?code=xxx
// Verify shared link is valid

POST /api/links/create
// Create shareable link
// Body: { type: 'opportunity' | 'goal', id: string }
```

---

## Environment Variables

```env
# .env
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxx
EXPO_PUBLIC_DEEP_LINK_SCHEME=edutu

# Push Notifications
EXPO_PUBLIC_FCM_SENDER_ID=xxx

# Store URLs
EXPO_PUBLIC_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.edutu.app
EXPO_PUBLIC_IOS_STORE_URL=https://testflight.apple.com/join/xxx
```

---

## Testing Requirements

### Deep Link Tests
- [ ] Open edutu:// from browser
- [ ] Open https://edutu.app/ from browser
- [ ] Click share link from another app
- [ ] Handle invalid links gracefully

### Push Notification Tests
- [ ] Receive notification on Android
- [ ] Receive notification on iOS
- [ ] Tap notification navigates correctly
- [ ] Notification actions work
- [ ] Background notification handling

### Sync Tests
- [ ] Create goal on web, appears on mobile
- [ ] Update profile on web, shows on mobile
- [ ] Offline: queue actions
- [ ] Online: sync pending changes

### Store Tests
- [ ] Play Store link opens correctly
- [ ] TestFlight link opens correctly
- [ ] "Already installed" handling works

---

*Last Updated: 2026-04-07*
*Document Version: 1.0*