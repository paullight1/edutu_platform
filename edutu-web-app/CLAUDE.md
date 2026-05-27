# Edutu - AI Opportunity Coach

React 18 + TypeScript SPA with Supabase auth, deployed as PWA + Android (Capacitor).

## Quick Start

```bash
npm install
npm run dev          # Vite dev server
npm run build        # Production build → dist/
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run android      # Build + open Android Studio
```

## Architecture

```
edutu_app/
├── src/                    # Application source
│   ├── main.tsx            # Entry point + providers
│   ├── App.tsx             # Router + screen orchestration
│   ├── components/         # Screen components (20+ routes)
│   ├── admin/              # Admin panel
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Supabase client, auth, utilities
│   ├── services/           # Business logic
│   ├── types/              # TypeScript definitions
│   ├── design-system/      # Theme tokens
│   └── i18n/               # Internationalization (6 languages)
├── public/                 # Static assets + data
├── android/                # Capacitor Android native project
├── supabase/               # Database schema + migrations
├── docs/                   # Project documentation
└── [configs]               # vite, tsconfig, tailwind, eslint
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite 5
- **Routing**: React Router DOM v6
- **Styling**: Tailwind CSS 3 + Framer Motion
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Mobile**: Capacitor 6 (Android)
- **PWA**: vite-plugin-pwa
- **Analytics**: Sentry

## Key Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | LandingPageV3 | Landing page |
| `/auth` | AuthScreen | Login/signup |
| `/app/home` | Dashboard | Main dashboard with quick actions |
| `/app/opportunities` | AllOpportunities | Browse opportunities |
| `/app/chat` | ChatInterface | AI chat |
| `/app/profile` | Profile | User profile |
| `/app/goals` | AllGoals | Goal management |
| `/app/community` | CommunityMarketplace | Shared roadmaps |
| `/app/cv` | CVManagement | CV tools |
| `/app/saved` | SavedOpportunities | Saved/bookmarked opportunities |
| `/app/applied` | AppliedOpportunities | Track application statuses |
| `/app/deadlines` | DeadlinesScreen | Upcoming deadlines tracker |
| `/app/wallet` | Wallet | Credits balance and transactions |
| `/app/creator/apply` | CreatorApply | Apply to become a creator |
| `/app/creator/dashboard` | CreatorDashboard | Creator analytics |
| `/app/creator/create` | CreatorRoadmapWizard | Create roadmaps |
| `/app/settings` | SettingsMenu | User settings |
| `/app/achievements` | AchievementsScreen | User achievements |
| `/app/personalization` | PersonalizationProfileScreen | Onboarding profile |
| `/admin/*` | AdminRoot | Admin panel |

## Deployment

- **Web**: Netlify (see `netlify.toml`)
- **Android**: Capacitor → Android Studio → Play Store
- **PWA**: Auto-generated service worker

## Features

- **Dashboard**: Personalized greeting, analytics grid, featured opportunities carousel, goals tracker, quick actions sidebar
- **Opportunities**: Browse, search, filter, save, and apply to opportunities
- **AI Coach**: Chat-based AI assistance for career guidance
- **Goal Management**: Create, track, and complete goals with personalized roadmaps
- **AI Roadmap Wizard**: Auto-generate roadmaps from opportunities using AI
- **Community Marketplace**: Discover and share community roadmaps
- **Saved Opportunities**: Bookmark and organize opportunities by urgency
- **Application Tracker**: Track application statuses (submitted, under review, accepted, rejected)
- **Deadlines Tracker**: View upcoming deadlines grouped by timeframe
- **Wallet & Credits**: Buy credits, view balance, transaction history
- **Creator Program**: Apply to create roadmaps, creator dashboard with analytics
- **Profile & Settings**: Edit profile, notifications, privacy, language (6 languages)
- **Internationalization**: English, Spanish, French, German, Chinese, Arabic
- **Dark Mode**: Full dark mode support with system preference detection
- **PWA**: Installable progressive web app with offline support
- **Capacitor Native**: Android native build with deep linking and back button handling
