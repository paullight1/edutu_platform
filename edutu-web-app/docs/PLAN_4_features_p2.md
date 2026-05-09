# Plan 4: Secondary Feature Implementation (Phase 2 - P2)

## Objective
Implement secondary priority screens that enhance the app experience.

## Priority: P2 (Should Have)

### 3.6 Opportunities (app/(app)/opportunities/)
Copy from:
- `apps/web/src/components/AllOpportunities.tsx`
- `apps/web/src/components/OpportunityDetail.tsx`

Features to port:
- [ ] Opportunity list with search/filter
- [ ] Filter by type (scholarship, job, course, mentorship)
- [ ] Filter by deadline, location, requirements
- [ ] Opportunity cards with key info
- [ ] Detail view with full description
- [ ] Save/bookmark opportunity
- [ ] Apply link (external browser)
- [ ] Share opportunity

### 3.7 Roadmap (app/(app)/roadmap.tsx)
Copy from:
- `apps/web/src/components/OpportunityRoadmap.tsx`
- `apps/web/src/components/PersonalizedRoadmap.tsx`

Features to port:
- [ ] Visual roadmap/timeline view
- [ ] Personalized recommendations based on profile
- [ ] Milestones and checkpoints
- [ ] Progress tracking
- [ ] AI-generated path suggestions

### 3.8 Achievements (app/(app)/achievements.tsx)
Copy from: `apps/web/src/components/AchievementsScreen.tsx`

Features to port:
- [ ] Achievement badges grid
- [ ] Achievement progress tracking
- [ ] Categories (learning, engagement, milestones)
- [ ] Recently unlocked achievements
- [ ] Points/XP display

### 3.9 CV Management (app/(app)/cv.tsx)
Copy from: `apps/web/src/components/CVManagement.tsx`

Features to port:
- [ ] CV builder/editor
- [ ] Multiple CV versions
- [ ] Template selection
- [ ] Export/share CV
- [ ] Education, experience, skills sections

### 3.10 Marketplace (app/(app)/marketplace.tsx)
Copy from: `apps/web/src/components/CommunityMarketplace.tsx`

Features to port:
- [ ] Browse community resources
- [ ] Search and filter
- [ ] Resource cards (courses, materials)
- [ ] Creator profiles
- [ ] Ratings/reviews

## Success Criteria
- All P2 screens match web functionality
- Deep linking works for opportunity details
- Search/filter performance acceptable on mobile