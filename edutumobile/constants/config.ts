/**
 * App Configuration
 * Global constants and configuration values
 */

export const APP_CONFIG = {
  name: 'Edutu',
  version: '1.0.0',
  
  // API Configuration
  api: {
    timeout: 15000,
    retries: 3,
    retryDelay: 500,
  },

  // Pagination
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },

  // Limits
  limits: {
    maxNameLength: 100,
    maxBioLength: 500,
    maxDescriptionLength: 2000,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    maxInterests: 10,
    maxGoals: 50,
  },

  // Feature Flags
  features: {
    enableAIChat: true,
    enableCreatorMode: true,
    enableNotifications: true,
    enableWallet: true,
    enableGoals: true,
    enableOnboarding: true,
  },

  // Cache Keys
  cacheKeys: {
    theme: 'edutu_theme',
    onboardingComplete: 'onboarding_complete',
    lastSync: 'last_sync',
  },

  // Storage Keys
  storageKeys: {
    authToken: 'auth_token',
    refreshToken: 'refresh_token',
    userId: 'user_id',
  },
} as const;

// Opportunity Categories
export const OPPORTUNITY_CATEGORIES = [
  'Scholarship',
  'Internship',
  'Fellowship',
  'Bootcamp',
  'Competition',
  'Mentorship',
  'Course',
  'Certification',
  'Job',
  'Training & Conference',
  'Other',
] as const;

// Goal Priorities
export const GOAL_PRIORITIES = ['low', 'medium', 'high'] as const;

// Goal Statuses
export const GOAL_STATUSES = ['active', 'completed', 'archived'] as const;

// Notification Types
export const NOTIFICATION_TYPES = [
  'goal-reminder',
  'goal-weekly-digest',
  'goal-progress',
  'opportunity-highlight',
  'admin-broadcast',
  'system',
] as const;

// Category Colors
export const CATEGORY_COLORS: Record<string, string> = {
  Scholarship: '#3b82f6',
  Internship: '#6366F1',
  Bootcamp: '#84CC16',
  Fellowship: '#F97316',
  Competition: '#EF4444',
  Mentorship: '#3b82f6',
  Course: '#3B82F6',
  Certification: '#22C55E',
  Job: '#0EA5E9',
  'Training & Conference': '#8B5CF6',
  default: '#94A3B8',
};

// Marketplace Category Filters
export const MARKETPLACE_FILTERS = [
  'All',
  'Education',
  'Programming',
  'Business',
  'Career',
  'Community',
] as const;

export default APP_CONFIG;