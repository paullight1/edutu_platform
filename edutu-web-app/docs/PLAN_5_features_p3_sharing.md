# Plan 5: Advanced Features & Shared Code (Phase 3 - P3)

## Objective
Implement advanced features and ensure code sharing between web and mobile.

## Priority: P3 (Nice to Have)

### 3.11 Flashcards (app/(app)/flashcards.tsx)
Copy from: `apps/web/src/components/FlashcardsScreen.tsx`

Features to port:
- [ ] Flashcard decks
- [ ] Card flip animation (react-native-reanimated)
- [ ] Spaced repetition
- [ ] Create custom cards
- [ ] Browse shared decks

### 3.12 Quiz (app/(app)/quiz.tsx)
Copy from: `apps/web/src/components/QuizPage.tsx`

Features to port:
- [ ] Quiz interface
- [ ] Multiple choice questions
- [ ] Timer
- [ ] Results/score display
- [ ] Quiz categories

### 3.13 Packages (app/(app)/packages.tsx)
Copy from: `apps/web/src/components/PackageDetail.tsx`

Features to port:
- [ ] Package display
- [ ] Subscription tiers
- [ ] Purchase flow (mock for MVP)

### 3.14 Personalization (app/(app)/personalization.tsx)
Copy from: `apps/web/src/components/PersonalizationProfileScreen.tsx`

Features to port:
- [ ] User preferences form
- [ ] Interests selection
- [ ] Career goals
- [ ] Learning style

---

## Shared Code Architecture

### packages/core Expansion
The `packages/core` package should contain all shared non-UI code.

### 4.1 Shared Hooks
Move from web to `packages/core/src/hooks/`:
- [ ] `useAuth.ts` — authentication logic
- [ ] `useGoals.ts` — goal CRUD operations
- [ ] `useNotifications.ts` — notification management
- [ ] `useOpportunities.ts` — opportunity fetching
- [ ] `useChat.ts` — AI chat thread management
- [ ] `useUserStats.ts` — user statistics
- [ ] `usePersonalizedOpportunities.ts` — AI recommendations

### 4.2 Shared Types
Move from web to `packages/core/src/types/`:
- [ ] `user.ts` — User interface
- [ ] `opportunity.ts` — Opportunity interface
- [ ] `notification.ts` — Notification interface
- [ ] `chat.ts` — Chat message interface
- [ ] `goal.ts` — Goal interface

### 4.3 Shared Services
Move from web to `packages/core/src/services/`:
- [ ] `supabase.ts` — Supabase client
- [ ] `profile.ts` — Profile operations
- [ ] `support.ts` — Support ticket operations

### 4.4 Current mobile packages/core state
Already exists but needs expansion:
- `packages/core/src/hooks/useNotifications.ts`
- `packages/core/src/hooks/useGoals.ts`
- `packages/core/src/hooks/useOpportunities.ts`
- `packages/core/src/hooks/useChat.ts`
- `packages/core/src/services/supabase.ts`
- `packages/core/src/services/opportunities.ts`
- `packages/core/src/services/chat.ts`
- `packages/core/src/types/` (chat, notification, opportunity, user)

## Success Criteria
- All P3 features functional
- Web and mobile share same hooks/types/services
- No duplicate code between platforms