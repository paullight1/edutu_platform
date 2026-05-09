# Plan 2: Navigation & Layout Restructure

## Objective
Restructure mobile navigation to match web app's navigation structure.

## Current State
### Mobile Tabs (edutu_mobile)
```
Dashboard | Scholarships | Marketplace | Wallet
```
- Basic implementations in `app/(app)/index.tsx`, `app/(app)/opportunities/`, `app/(app)/marketplace.tsx`, `app/(app)/wallet.tsx`

### Web Navigation (web)
```
Home | AI Chat | Goals | Opportunities | Profile
```
- Full navigation in `src/components/Navigation.tsx` and `src/components/AppLayout.tsx`

## Tasks

### 2.1 Tab Bar Restructure
Current mobile tabs → New mobile tabs:
```
Home (Dashboard) | Chat (AI Tutor) | Goals | Opportunities | Profile
```

- [ ] Modify `app/(app)/_layout.tsx` tab bar configuration
- [ ] Add icons (lucide-react-native) for each tab: Home, MessageCircle, Target, Briefcase, User
- [ ] Configure tab bar styling to match web dark theme
- [ ] Ensure proper safe area handling

### 2.2 Create Missing Tab Screens
- [ ] Create `app/(app)/chat.tsx` — AI Chat interface (empty stub exists)
- [ ] Create `app/(app)/goals/index.tsx` — Goals list (empty stub exists)
- [ ] Create `app/(app)/goals/add.tsx` — Add new goal
- [ ] Create `app/(app)/profile/index.tsx` — Profile view (empty stub exists)
- [ ] Create `app/(app)/profile/settings.tsx` — Settings menu
- [ ] Create `app/(app)/profile/edit.tsx` — Edit profile

### 2.3 Create Secondary Screens
- [ ] Create `app/(app)/opportunities/index.tsx` — All opportunities list
- [ ] Create `app/(app)/opportunities/[id].tsx` — Opportunity detail
- [ ] Create `app/(app)/roadmap.tsx` — Personalized roadmap
- [ ] Create `app/(app)/achievements.tsx` — Achievements screen
- [ ] Create `app/(app)/notifications.tsx` — Notifications list
- [ ] Create `app/(app)/cv.tsx` — CV management

### 2.4 Stack Navigation for Modals
- [ ] Configure nested stacks within tabs for drill-down navigation
- [ ] Handle proper back navigation on Android/iOS
- [ ] Ensure deep linking works for all routes

## Files to Modify
- `apps/edutu_mobile/app/(app)/_layout.tsx`

## Files to Create
- All screens listed in 2.2 and 2.3 above

## Success Criteria
- Mobile navigation matches web exactly (5 main tabs)
- All screens are reachable via navigation
- Deep linking works for all routes