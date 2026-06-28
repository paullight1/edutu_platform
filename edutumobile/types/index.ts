/**
 * TypeScript Type Definitions
 * Shared types for the EduTu mobile app
 */

// ============================================================================
// User Types
// ============================================================================

export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  imageUrl?: string;
  phone?: string;
  country?: string;
  countryCode?: string;
  isGraduate?: boolean;
  schoolType?: string;
  schoolName?: string;
  gradeLevel?: string;
  interests: string[];
  ambitions: string[];
  onboardingComplete: boolean;
}

export interface OnboardingData {
  fullName: string;
  country: string;
  countryCode: string;
  phone: string;
  isGraduate: boolean | null;
  schoolType: string | null;
  schoolName: string;
  gradeLevel: string | null;
  interests: string[];
  ambitions: string[];
}

// ============================================================================
// Opportunity Types
// ============================================================================

export type OpportunityCategory = 
  | 'Scholarship'
  | 'Internship'
  | 'Fellowship'
  | 'Bootcamp'
  | 'Competition'
  | 'Mentorship'
  | 'Course'
  | 'Certification'
  | 'Job'
  | 'Training & Conference'
  | 'Other';

export type OpportunityDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  description: string;
  category: OpportunityCategory;
  difficulty?: OpportunityDifficulty;
  location: string;
  deadline?: string;
  applyUrl?: string;
  image?: string;
  featured: boolean;
  requirements?: string[];
  benefits?: string[];
  applicants?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityFilters {
  category?: OpportunityCategory;
  difficulty?: OpportunityDifficulty;
  location?: string;
  search?: string;
  featured?: boolean;
}

// ============================================================================
// Goal Types
// ============================================================================

export type GoalStatus = 'active' | 'completed' | 'archived';
export type GoalPriority = 'low' | 'medium' | 'high';

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  category?: string;
  status: GoalStatus;
  priority?: GoalPriority;
  progress: number;
  deadline?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  category?: string;
  priority?: GoalPriority;
  deadline?: string;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  category?: string;
  status?: GoalStatus;
  priority?: GoalPriority;
  progress?: number;
  deadline?: string;
}

// ============================================================================
// Chat Types
// ============================================================================

export interface ChatThread {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatInput {
  text: string;
  topic?: string;
}

// ============================================================================
// Notification Types
// ============================================================================

export type NotificationKind = 
  | 'goal-reminder'
  | 'goal-weekly-digest'
  | 'goal-progress'
  | 'opportunity-highlight'
  | 'admin-broadcast'
  | 'system';

export type NotificationSeverity = 'info' | 'warning' | 'error' | 'success';

export interface AppNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
  data?: Record<string, unknown>;
}

// ============================================================================
// Marketplace Types
// ============================================================================

export type StoryType = 'roadmap' | 'marketplace';

export interface RoadmapStage {
  id: string;
  title: string;
  description?: string;
  duration?: string;
}

export interface CommunityStory {
  id: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  type: StoryType;
  price: string;
  difficulty: string;
  image?: string;
  creator: {
    id: string;
    name: string;
    imageUrl?: string;
  };
  stats?: {
    rating: number;
    users: number;
  };
  successRate?: number;
  roadmap?: RoadmapStage[];
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Wallet Types
// ============================================================================

export type TransactionType = 
  | 'creator_earning'
  | 'marketplace_purchase'
  | 'payout'
  | 'reward'
  | 'credit'
  | 'payment';

export interface WalletTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  description: string;
  createdAt: string;
}

export interface WalletData {
  balance: number;
  transactions: WalletTransaction[];
}

// ============================================================================
// Creator Types
// ============================================================================

export interface CreatorListing {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  price: number;
  status: 'pending' | 'active' | 'rejected';
  enrollmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatorDashboardData {
  totalEarnings: number;
  totalEnrollments: number;
  totalListings: number;
  listings: CreatorListing[];
  recentEarnings: WalletTransaction[];
}

export interface CreatorApplication {
  expertise: string;
  portfolioUrl: string;
  bio: string;
  socialLinks: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Form Types
// ============================================================================

export interface FormFieldError {
  field: string;
  message: string;
}

export interface FormState<T> {
  data: T;
  errors: FormFieldError[];
  isSubmitting: boolean;
  isValid: boolean;
}

// ============================================================================
// Loading States
// ============================================================================

export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}