# Plan 3: Core Feature Implementation (Phase 1 - P1)

## Objective
Implement the highest priority screens matching web functionality.

## Priority: P1 (Must Have)

### 3.1 Dashboard (app/(app)/index.tsx)
Copy from: `apps/web/src/components/Dashboard.tsx`

Features to port:
- [ ] Welcome header with user avatar and name
- [ ] AI mood/tip card (personalized greeting)
- [ ] Goals progress widget (current goals summary)
- [ ] Quick action buttons (Chat, Add Goal, Browse Opportunities)
- [ ] Recent achievements preview
- [ ] Pull-to-refresh functionality

### 3.2 AI Chat (app/(app)/chat.tsx)
Copy from: `apps/web/src/components/ChatInterface.tsx`

Features to port:
- [ ] Thread list (stored conversations)
- [ ] Message bubbles (user and AI)
- [ ] Typing indicator
- [ ] Text input with send button
- [ ] Connect to Supabase chat service
- [ ] Auto-scroll to latest message

### 3.3 Goals (app/(app)/goals/)
Copy from: 
- `apps/web/src/components/AllGoals.tsx`
- `apps/web/src/components/AddGoalScreen.tsx`

Features to port:
- [ ] Goal list with filters (active/completed/all)
- [ ] Goal cards with progress bars
- [ ] Add new goal form (title, description, deadline)
- [ ] AI suggestions for goals
- [ ] Mark goal complete/incomplete
- [ ] Delete goal

### 3.4 Notifications (app/(app)/notifications.tsx)
Copy from:
- `apps/web/src/components/NotificationsScreen.tsx`
- `apps/web/src/components/NotificationInbox.tsx`

Features to port:
- [ ] Grouped notification list
- [ ] Notification types (achievement, opportunity, system)
- [ ] Mark as read/unread
- [ ] Delete notifications
- [ ] Pull-to-refresh

### 3.5 Profile (app/(app)/profile/)
Copy from:
- `apps/web/src/components/Profile.tsx`
- `apps/web/src/components/SettingsMenu.tsx`
- `apps/web/src/components/EditProfileScreen.tsx`

Features to port:
- [ ] Profile header with avatar, name, bio
- [ ] Stats display (points, streak, achievements)
- [ ] Settings menu (dark mode, language, notifications)
- [ ] Edit profile form
- [ ] Sign out functionality

## Shared Components Needed
Before implementing screens, ensure these exist:
- [ ] All UI primitives from Plan 1
- [ ] Shared hooks from Plan 4

## Implementation Order
1. Dashboard (most visible, sets the tone)
2. Chat (core value proposition)
3. Goals (user engagement)
4. Notifications (retention)
5. Profile (user ownership)

## Success Criteria
- All P1 screens match web functionality
- UI style consistent with web design
- No placeholder text or empty states (show real data or proper empty states)