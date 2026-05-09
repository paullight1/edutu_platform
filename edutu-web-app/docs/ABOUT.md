# Edutu - Your AI Opportunity Coach

## Overview

Edutu is a comprehensive AI-powered career guidance and opportunity discovery platform designed to help learners identify and pursue educational and professional opportunities. The platform combines personalized goal tracking, opportunity exploration, career roadmap guidance, and CV optimization tools into a single, mobile-first experience.

## Technology Stack

- **Frontend Framework**: React 18 + TypeScript
- **Styling**: Tailwind CSS with custom design tokens
- **Build Tooling**: Vite
- **Database**: Supabase (PostgreSQL) for data persistence
- **Authentication**: Supabase Auth
- **Icons**: Lucide React
- **Charts/Data Visualization**: Recharts
- **Animation**: Framer Motion
- **Fonts**: Inter and Outfit
- **Routing**: React Router DOM

## Key Features

### 🎯 Opportunity Discovery
- Browse curated opportunities with detailed information
- Filter and search capabilities for finding relevant opportunities
- Difficulty ratings (Easy, Medium, Hard) for each opportunity
- Application process tracking and guidance

### 📊 Goal Management & Roadmapping
- Create and track personalized learning goals
- Progress visualization and completion tracking
- Template-based goal creation for common career paths
- Personalized roadmaps connecting opportunities to goals

### 📈 Analytics & Insights
- Track opportunities explored and goals achieved
- Monitor active days and engagement metrics
- Chat session analytics for AI mentorship interactions
- Comprehensive user activity tracking

### 💼 CV Management & Optimization
- Upload and manage CV documents
- ATS (Applicant Tracking System) compatibility analysis
- AI-powered optimization suggestions
- Job-targeted CV customization
- Readability and keyword matching analysis
- Automated CV generation from user inputs

### 🌙 Dark Mode Support
- Full dark/light mode toggle with system preference detection
- Custom theme variables for consistent styling across the application

### 📱 Mobile-First Design
- Responsive design optimized for mobile devices
- Touch-friendly interfaces and navigation
- Progressive Web App (PWA) capabilities

### 👤 User Management
- Supabase-powered authentication system
- Profile management and personalization
- Onboarding flow for new users
- Settings and privacy controls

### 💬 AI Integration
- Chat interface for career guidance
- AI-assisted opportunity recommendations
- Intelligent CV optimization suggestions
- Aspirational AI mentorship features

### 🏢 Community & Marketplace
- Community-driven roadmap sharing
- Marketplace for career resources
- Notification system for updates
- Support ticket management

## Architecture

### Data Management
- **Goals**: Managed through Supabase with real-time synchronization
- **Analytics**: Comprehensive tracking of user interactions and achievements
- **CV Documents**: Local storage with simulated backend behavior
- **Opportunities**: Static JSON dataset with caching layer

### State Management
- React Context API for global state management
- Custom hooks for goals, analytics, and notifications
- Local storage for data persistence
- Supabase for server-side data synchronization

### Authentication
- Supabase Auth integration
- Session management with automatic restoration
- Role-based access control
- Secure data isolation per user

## Development Workflow

### Getting Started
1. Clone the repository
2. Install dependencies: `npm install`
3. Run development server: `npm run dev`
4. Build for production: `npm run build`
5. Preview production build: `npm run preview`

### Environment Configuration
- Supabase integration for database and authentication
- Environment variables for API endpoints
- Configurable opportunities data source

## Project Structure

```
edutu app/
├── public/
│   └── data/                # Static JSON datasets (opportunities catalog)
├── src/
│   ├── components/          # Learner screens and UI modules
│   ├── design-system/       # Theme tokens and shared UI primitives
│   ├── firebase/            # Firebase config stub (unused)
│   ├── hooks/               # Local storage and analytics hooks
│   ├── lib/                 # Supabase client and authentication logic
│   ├── pages/api/           # Edge handler prototype for chat proxy
│   ├── services/            # Helpers over localStorage and static JSON
│   ├── types/               # Shared TypeScript models
│   ├── admin/               # Administrative interface components
│   ├── App.tsx              # Learner screen state machine
│   └── main.tsx             # Entry point (providers + renderer)
├── package.json
├── tailwind.config.js
└── vite.config.ts
```

## Current Status & Roadmap

### Production Ready Features
- ✅ Goal and roadmap management
- ✅ Opportunity explorer with static data
- ✅ CV upload and analysis tools
- ✅ User authentication and profile management
- ✅ Analytics and progress tracking
- ✅ Dark mode and responsive design

### Aspirational Features (Not Yet Production Ready)
- 🔜 Full AI chat mentorship integration
- 🔜 Real-time collaboration features
- 🔜 Advanced recommendation algorithms
- 🔜 Enterprise integration capabilities
- 🔜 Offline-first capabilities

## Contributing

Edutu is built as a polished frontend sandbox ready for real backend services. The modular architecture allows for easy integration of additional features and services. The project follows modern React best practices with TypeScript type safety and comprehensive state management.

## License

This project is available as open source under the terms of the MIT License.