# Plan 6: Implementation Order & Verification

## Implementation Roadmap

### Phase 0: Foundation (Week 1)
| Task | Files | Priority |
|------|-------|----------|
| Design system alignment | Plan 1 | Required |
| UI component library | Plan 1 | Required |

### Phase 1: Navigation (Week 1-2)
| Task | Files | Priority |
|------|-------|----------|
| Tab bar restructure | Plan 2 | P1 |
| Create screen stubs | Plan 2 | P1 |

### Phase 2: Core Features (Week 2-4)
| Task | Files | Priority |
|------|-------|----------|
| Dashboard | Plan 3 | P1 |
| AI Chat | Plan 3 | P1 |
| Goals | Plan 3 | P1 |
| Notifications | Plan 3 | P1 |
| Profile | Plan 3 | P1 |

### Phase 3: Secondary Features (Week 4-6)
| Task | Files | Priority |
|------|-------|----------|
| Opportunities | Plan 4 | P2 |
| Roadmap | Plan 4 | P2 |
| Achievements | Plan 4 | P2 |
| CV Management | Plan 4 | P2 |
| Marketplace | Plan 4 | P2 |

### Phase 4: Advanced & Sharing (Week 6-8)
| Task | Files | Priority |
|------|-------|----------|
| Flashcards | Plan 5 | P3 |
| Quiz | Plan 5 | P3 |
| Packages | Plan 5 | P3 |
| Personalization | Plan 5 | P3 |
| Shared code refactor | Plan 5 | Required |

---

## Verification Checklist

### Build & Type Check
```bash
cd apps/edutu_mobile
npx tsc --noEmit
npx expo export
```

### Manual Testing (Expo Go)
- [ ] All 5 tabs render without crash
- [ ] Auth flow: sign-in → onboarding → dashboard
- [ ] Navigation between all screens works
- [ ] Deep links resolve correctly
- [ ] Dark mode displays correctly

### Feature Verification Per Phase
**Phase 2 (P1)**:
- [ ] Dashboard shows personalized greeting
- [ ] Chat sends/receives messages
- [ ] Goals CRUD works
- [ ] Notifications display and can be dismissed
- [ ] Profile shows user data

**Phase 3 (P2)**:
- [ ] Opportunities search/filter works
- [ ] Roadmap displays personalized path
- [ ] Achievements show badges
- [ ] CV can be created/edited
- [ ] Marketplace loads resources

### Performance
- [ ] Initial load < 3 seconds
- [ ] Screen transitions smooth
- [ ] No memory leaks on navigation
- [ ] Images lazy loaded

---

## Running the Project

```bash
# Start mobile development
cd apps/edutu_mobile
npm run dev

# Or start all apps
npm run dev
```

---

## Dependencies Summary

Already installed:
- expo, react-native, expo-router
- nativewind, tailwindcss
- @clerk/clerk-expo
- @supabase/supabase-js
- react-native-reanimated, react-native-gesture-handler
- lucide-react-native

To add:
- expo-image (for better image handling)
- @gorhom/bottom-sheet (for drawers/modals)