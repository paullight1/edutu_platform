# Edutu - Your AI Opportunity Coach

## Project Snapshot
Edutu delivers a high fidelity, mobile first learner experience with React and TypeScript. The current build showcases the product vision around opportunity discovery, personal goal tracking, roadmap guidance, and CV tooling. The project has migrated from Firebase to Supabase for authentication and database services, and now uses React Router for navigation. References to AI mentorship remain aspirational; no production backend is wired in yet.

## Technology Stack
- **Frontend**: React 18 + TypeScript
- **Routing**: React Router DOM
- **Backend**: Supabase for auth and database
- **Styling**: Tailwind CSS with custom design tokens
- **Build Tooling**: Vite
- **Icons**: Lucide React
- **Fonts**: Inter and Outfit
- **Animations**: Framer Motion
- **Charts**: Recharts

## Project Structure
```
edutu app/
  public/
    data/                # Static JSON datasets (opportunities catalog)
  src/
    admin/               # Admin interface components
    components/          # Learner screens and UI modules
    design-system/       # Theme tokens and shared UI primitives
    firebase/            # Firebase config stub (unused)
    hooks/               # Local storage, analytics, theme, and auth hooks
    lib/                 # Supabase client and auth utilities
    pages/               # Page components
    services/            # Helpers over localStorage and static JSON
    types/               # Shared TypeScript models including Supabase types
    App.tsx              # Main application with routing
    index.css            # Global styles
    main.tsx             # Entry point with providers
    vite-env.d.ts        # Vite environment type definitions
  package.json
  tailwind.config.js
  vite.config.ts
  tsconfig.json          # TypeScript configuration
```

## Implemented Features
- **React Router Navigation**: The app now uses React Router for navigation, supporting routes like `/`, `/auth`, `/app/home`, `/app/opportunities`, `/app/chat`, etc.
- **Supabase Authentication**: Replaced Firebase with Supabase for user authentication, including Google OAuth sign-in.
- **Enhanced Onboarding**: Interactive introduction popup for new users to collect profile information with improved onboarding state tracking.
- **Admin Interface**: Added an admin section with `/admin/*` routes for administrative tasks.
- **Updated Bottom Navigation**: The mobile bottom navigation features Home, followed by Explore, Edutu AI, Community, and More. The More section contains access to Profile and Settings. The Edutu AI item receives special visual emphasis with gradient styling.
- **Opportunity Explorer**: Static data from `public/data/opportunities.json` feeds featured cards, list filters, and detail views with roadmap hand offs.
- **Goal and Roadmap Management**: `GoalsProvider` persists goals in Supabase database, offers templates, and renders progress visualizations.
- **Analytics Tracking**: `AnalyticsProvider` tracks opportunities explored, chat sessions, days active, and goals completed with backend persistence in Supabase.
- **CV Toolkit**: `CVManagement` component with upload, ATS analysis, optimization, and AI-assisted generation flows stored in Supabase.
- **Enhanced User Profile**: Full profile management with onboarding, edit functionality, and preferences.
- **Dark Mode**: `useDarkMode` toggles CSS variables that Tailwind utilities consume for themed UI.
- **Accessibility & UX**: Toast notifications, swipe gestures for navigation, and improved responsive design.

## Not Yet Production Ready
- **AI Chat**: `ChatInterface.tsx` throws until a backend proxy handles OpenRouter calls. A prototype exists at `src/pages/api/chat.js`.
- **Server Persistence for Some Features**: While core auth and goals are in Supabase, some services still rely on localStorage.
- **Community and Support Integrations**: Marketplace data, support responses, and announcements are still static fixtures.
- **n8n Integration**: Basic webhook service exists (`src/services/n8nIntegration.ts`) but requires backend endpoint implementation for production.

## Data Model Overview
- `usePersistentState` wraps localStorage for reusable statefulness where needed.
- `GoalsProvider` supplies CRUD helpers and computed metadata to goal-aware components, with Supabase backend for persistence.
- `AnalyticsProvider` watches user actions and exposes derived stats to dashboards and profile cards, with Supabase backend for persistence.
- `services/opportunities.ts` normalises the static opportunities payload and caches results per session.
- `cvService.ts` has been enhanced to work with Supabase storage and database for CV records.
- `lib/auth.ts` provides authentication state management and profile handling with Supabase.

## Developer Workflow
1. Install dependencies: `npm install`
2. Set up environment variables: Copy `.env.example` to `.env` and configure Supabase credentials
3. Run the dev server: `npm run dev`
4. Build for production: `npm run build`

## Architecture Notes
- The app uses React Router for navigation instead of a screen state machine.
- Providers (`GoalsProvider`, `AnalyticsProvider`, `ThemeProvider`, `NotificationsProvider`, `AuthProvider`) wrap `<App />` in `main.tsx`, guaranteeing access to shared state.
- Supabase is used for authentication and database, with a well-defined type system in `types/supabase.ts`.
- Firebase integration has been completely replaced with Supabase.
- The admin interface provides a separate route space for administrative functionality.
