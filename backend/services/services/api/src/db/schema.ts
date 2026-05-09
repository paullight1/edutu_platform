import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

// Users table (mirrors Supabase auth.users mostly, but owned by us for app profiles)
export const profiles = pgTable('profiles', {
  userId: uuid('user_id').primaryKey(), // Foreign key to auth.users in concept
  fullName: text('full_name'),
  email: text('email'),
  role: text('role').default('user'), // 'user', 'admin', 'moderator'
  country: text('country'),
  skills: text('skills').array(), // PostgreSQL array of text
  creditsBalance: integer('credits_balance').default(0), // In-app credits currency
  creatorStatus: text('creator_status').default('none'), // 'none', 'pending', 'approved', 'rejected'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Goals table
export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(), // We'll manually enforce this link to profiles.userId
  title: text('title').notNull(),
  description: text('description'),
  category: text('category'),
  progress: integer('progress').default(0),
  status: text('status').default('active'), // 'active', 'completed', 'archived'
  targetDate: timestamp('target_date'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_goals_user_id').on(table.userId),
  index('idx_goals_status').on(table.status),
]);

// Goal Milestones (sub-tasks)
export const milestones = pgTable('milestones', {
  id: uuid('id').primaryKey().defaultRandom(),
  goalId: uuid('goal_id')
    .notNull()
    .references(() => goals.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  completed: boolean('completed').default(false),
  order: integer('order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// Opportunities management
export const opportunities = pgTable('opportunities', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  providerId: uuid('provider_id'),
  category: text('category'),
  type: text('type').default('scholarship'), // 'scholarship', 'mentorship', 'program', 'job', 'competition'
  description: text('description'),
  eligibilityCriteria: text('eligibility_criteria'),
  fundingType: text('funding_type'),
  targetRegion: text('target_region'),
  deadline: timestamp('deadline'),
  sourceUrl: text('source_url').unique(),
  applyUrl: text('apply_url'),
  imageUrl: text('image_url'),
  isRemote: boolean('is_remote').default(true),
  status: text('status').default('pending'), // 'pending', 'active', 'draft', 'expired', 'rejected'
  originalJson: text('original_json'), // Store the raw LLM output
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_opportunities_status').on(table.status),
  index('idx_opportunities_category').on(table.category),
  index('idx_opportunities_type').on(table.type),
  index('idx_opportunities_deadline').on(table.deadline),
  index('idx_opportunities_created_at').on(table.createdAt),
]);

export const userOpportunityPreferences = pgTable(
  'user_opportunity_preferences',
  {
    userId: uuid('user_id').primaryKey(),
    preferredCategories: text('preferred_categories').array(),
    preferredRegions: text('preferred_regions').array(),
    preferredFundingTypes: text('preferred_funding_types').array(),
    preferredOpportunityTypes: text('preferred_opportunity_types').array(),
    preferredSkills: text('preferred_skills').array(),
    excludedCategories: text('excluded_categories').array(),
    remoteOnly: boolean('remote_only').default(false),
    maxDeadlineDays: integer('max_deadline_days'),
    notes: text('notes'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
);

export const userOpportunitySignals = pgTable('user_opportunity_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  opportunityId: uuid('opportunity_id')
    .notNull()
    .references(() => opportunities.id, { onDelete: 'cascade' }),
  signalType: text('signal_type').notNull(),
  signalValue: integer('signal_value').default(1),
  source: text('source').default('app'),
  context: text('context'),
  details: jsonb('details').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_user_signals_user_id').on(table.userId),
  index('idx_user_signals_opportunity_id').on(table.opportunityId),
  index('idx_user_signals_type').on(table.signalType),
]);

// Creator / Seller Applications — Users apply to become marketplace creators
export const creatorApplications = pgTable('creator_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(), // FK to profiles.user_id
  displayName: text('display_name').notNull(),
  bio: text('bio').notNull(),
  contentType: text('content_type').notNull(), // 'course', 'event', 'mentorship', 'template', 'resource'
  experience: text('experience').notNull(), // Years of experience / portfolio
  sampleContentUrl: text('sample_content_url'), // Optional link to their work
  status: text('status').default('pending'), // 'pending', 'approved', 'rejected'
  adminNote: text('admin_note'), // Reason for rejection or note from admin
  reviewedBy: uuid('reviewed_by'),
  reviewedAt: timestamp('reviewed_at'),
  submittedAt: timestamp('submitted_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Marketplace Listings (real courses / services / roadmaps for sale or free)
export const marketplaceListings = pgTable('marketplace_listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  sellerId: uuid('seller_id').notNull(), // FK to profiles.user_id
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull(), // 'course', 'event', 'mentorship', 'template', 'resource'
  type: text('type').default('course'), // 'free', 'paid', 'credit'
  price: integer('price').default(0), // Price in Credits (0 = free)
  imageUrl: text('image_url'),
  previewUrl: text('preview_url'),
  // Event-specific fields
  eventDate: timestamp('event_date'),
  eventEndDate: timestamp('event_end_date'),
  eventLocation: text('event_location'), // 'online' or a physical address
  capacity: integer('capacity'), // Max attendees (null = unlimited)
  tags: text('tags').array(),
  rating: integer('rating').default(0), // Aggregated 0-50 fixed-point (e.g. 48 = 4.8)
  reviewCount: integer('review_count').default(0),
  enrollmentCount: integer('enrollment_count').default(0),
  isFeatured: boolean('is_featured').default(false),
  status: text('status').default('pending'), // 'pending', 'active', 'paused', 'rejected'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// User enrollments / purchases in the marketplace
export const marketplaceEnrollments = pgTable('marketplace_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  listingId: uuid('listing_id')
    .notNull()
    .references(() => marketplaceListings.id, { onDelete: 'cascade' }),
  status: text('status').default('active'), // 'active', 'completed', 'refunded'
  creditsSpent: integer('credits_spent').default(0),
  enrolledAt: timestamp('enrolled_at').defaultNow(),
  completedAt: timestamp('completed_at'),
});

// Marketplace Regulation & Packages
export const marketplacePackages = pgTable('marketplace_packages', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  category: text('category'),
  capacityLimit: integer('capacity_limit').default(100),
  currentEnrollment: integer('current_enrollment').default(0),
  status: text('status').default('optimal'), // 'optimal', 'high-demand', 'over-capacity', 'locked'
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Support Tickets (Priority Hub)
export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  subject: text('subject').notNull(),
  description: text('description'),
  priority: text('priority').default('medium'), // 'low', 'medium', 'high', 'urgent'
  status: text('status').default('open'), // 'open', 'in-progress', 'resolved', 'closed'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Financial Ledger
export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  amount: integer('amount').notNull(), // Amount in smallest unit (e.g. cents)
  type: text('type').notNull(), // 'payout', 'reward', 'credit', 'payment'
  status: text('status').default('pending'), // 'pending', 'completed', 'failed', 'refunded'
  referenceId: text('reference_id'),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
});

// AI-Generated Quizzes
export const quizzes = pgTable('quizzes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  topic: text('topic').notNull(),
  difficulty: text('difficulty').default('medium'), // 'easy', 'medium', 'hard'
  questionCount: integer('question_count').default(5),
  status: text('status').default('generated'), // 'generated', 'in_progress', 'completed'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Quiz Questions
export const quizQuestions = pgTable('quiz_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  quizId: uuid('quiz_id')
    .notNull()
    .references(() => quizzes.id, { onDelete: 'cascade' }),
  questionText: text('question_text').notNull(),
  options: text('options').array().notNull(), // Array of answer options
  correctIndex: integer('correct_index').notNull(), // Index of correct answer in options array
  explanation: text('explanation'), // AI-generated explanation for the correct answer
  order: integer('order').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// Quiz Attempts / Results
export const quizAttempts = pgTable('quiz_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  quizId: uuid('quiz_id')
    .notNull()
    .references(() => quizzes.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  answers: text('answers').array(), // Array of selected answer indices
  score: integer('score').default(0),
  totalQuestions: integer('total_questions').default(0),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Flashcard Decks
export const flashcardDecks = pgTable('flashcard_decks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category'),
  tags: text('tags').array(),
  isPublic: boolean('is_public').default(false),
  cardCount: integer('card_count').default(0),
  difficulty: text('difficulty').default('medium'), // 'easy', 'medium', 'hard'
  sourceType: text('source_type').default('manual'), // 'manual', 'ai_generated', 'imported'
  sourceId: text('source_id'), // Reference to original content (e.g., goal, opportunity)
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Flashcards
export const flashcards = pgTable('flashcards', {
  id: uuid('id').primaryKey().defaultRandom(),
  deckId: uuid('deck_id')
    .notNull()
    .references(() => flashcardDecks.id, { onDelete: 'cascade' }),
  front: text('front').notNull(), // Question/term side
  back: text('back').notNull(), // Answer/definition side
  hint: text('hint'),
  order: integer('order').default(0),
  difficulty: text('difficulty').default('medium'), // 'easy', 'medium', 'hard'
  tags: text('tags').array(),
  mediaUrl: text('media_url'), // Optional image/video URL
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Flashcard Study Sessions
export const flashcardStudySessions = pgTable('flashcard_study_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  deckId: uuid('deck_id')
    .notNull()
    .references(() => flashcardDecks.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  cardsReviewed: integer('cards_reviewed').default(0),
  correctCount: integer('correct_count').default(0),
  incorrectCount: integer('incorrect_count').default(0),
  durationSeconds: integer('duration_seconds').default(0),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Flashcard Reviews (Spaced Repetition)
export const flashcardReviews = pgTable('flashcard_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id')
    .notNull()
    .references(() => flashcards.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  easeFactor: integer('ease_factor').default(250), // SM-2 algorithm ease factor (250 = 2.5)
  interval: integer('interval').default(0), // Days until next review
  repetitions: integer('repetitions').default(0), // Number of correct reviews in a row
  nextReviewAt: timestamp('next_review_at'),
  lastReviewAt: timestamp('last_review_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_flashcard_reviews_user_id').on(table.userId),
  index('idx_flashcard_reviews_card_id').on(table.cardId),
  index('idx_flashcard_reviews_next_review').on(table.nextReviewAt),
]);

// Blog Posts
export const blogPosts = pgTable('blog_posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  excerpt: text('excerpt'),
  content: text('content').notNull(),
  coverImage: text('cover_image'),
  authorId: uuid('author_id').notNull(),
  authorName: text('author_name').notNull(),
  authorAvatar: text('author_avatar'),
  category: text('category').default('general'), // 'general', 'scholarships', 'jobs', 'mentorship', 'tips', 'news'
  tags: text('tags').array(),
  publishedAt: timestamp('published_at'),
  status: text('status').default('draft'), // 'draft', 'published', 'archived'
  featured: boolean('featured').default(false),
  views: integer('views').default(0),
  likes: integer('likes').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type BlogPost = typeof blogPosts.$inferSelect;
export type NewBlogPost = typeof blogPosts.$inferInsert;

// Blog Comments
export const blogComments = pgTable('blog_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  postId: uuid('post_id')
    .notNull()
    .references(() => blogPosts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull(),
  userName: text('user_name').notNull(),
  userAvatar: text('user_avatar'),
  content: text('content').notNull(),
  status: text('status').default('pending'), // 'pending', 'approved', 'rejected'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type BlogComment = typeof blogComments.$inferSelect;
export type NewBlogComment = typeof blogComments.$inferInsert;

// Roadmaps
export const roadmaps = pgTable('roadmaps', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull(),
  category: text('category').notNull().default('general'),
  difficulty: text('difficulty').notNull().default('beginner'),
  estimatedDuration: text('estimated_duration'),
  targetAudience: text('target_audience'),
  prerequisites: text('prerequisites'),
  outcomes: text('outcomes'),
  coverImage: text('cover_image'),
  status: text('status').notNull().default('draft'),
  createdBy: uuid('created_by').notNull(),
  creatorName: text('creator_name').notNull().default('Edutu Admin'),
  isFeatured: boolean('is_featured').default(false),
  enrollmentCount: integer('enrollment_count').default(0),
  ratingAvg: integer('rating_avg').default(0),
  ratingCount: integer('rating_count').default(0),
  steps: jsonb('steps').$type<Array<{ id: string; title: string; description: string; duration?: string; resources?: string[] }>>().default([]),
  resources: jsonb('resources').$type<Array<{ id: string; title: string; url: string; type: string }>>().default([]),
  relatedOpportunities: text('related_opportunities').array().default([]),
  aiIntentTags: text('ai_intent_tags').array().default([]),
  aiGeneratedSummary: text('ai_generated_summary'),
  satisfactionScore: integer('satisfaction_score').default(0),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  publishedAt: timestamp('published_at'),
}, (table) => [
  index('idx_roadmaps_status').on(table.status),
  index('idx_roadmaps_category').on(table.category),
  index('idx_roadmaps_difficulty').on(table.difficulty),
  index('idx_roadmaps_featured').on(table.isFeatured),
  index('idx_roadmaps_created_by').on(table.createdBy),
]);

export const roadmapEnrollments = pgTable('roadmap_enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  roadmapId: uuid('roadmap_id').notNull().references(() => roadmaps.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('enrolled'),
  progress: integer('progress').default(0),
  currentStep: integer('current_step').default(0),
  completedSteps: jsonb('completed_steps').$type<string[]>().default([]),
  enrolledAt: timestamp('enrolled_at').defaultNow(),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('idx_enrollments_user_id').on(table.userId),
  index('idx_enrollments_roadmap_id').on(table.roadmapId),
]);

export const userRoadmapIntents = pgTable('user_roadmap_intents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  goals: text('goals').array(),
  currentLevel: text('current_level'),
  targetCategory: text('target_category'),
  timeCommitment: text('time_commitment'),
  learningStyle: text('learning_style'),
  preferredFormat: text('preferred_format'),
  additionalContext: text('additional_context'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => [
  index('idx_user_intents_user_id').on(table.userId),
]);

export const roadmapFeedback = pgTable('roadmap_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  roadmapId: uuid('roadmap_id').notNull().references(() => roadmaps.id, { onDelete: 'cascade' }),
  satisfactionScore: integer('satisfaction_score').notNull(),
  metExpectations: boolean('met_expectations'),
  whatWorked: text('what_worked'),
  whatImproved: text('what_improved'),
  wouldRecommend: boolean('would_recommend'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  index('idx_feedback_roadmap_id').on(table.roadmapId),
  index('idx_feedback_user_id').on(table.userId),
]);

export type Roadmap = typeof roadmaps.$inferSelect;
export type NewRoadmap = typeof roadmaps.$inferInsert;
export type RoadmapEnrollment = typeof roadmapEnrollments.$inferSelect;
export type UserRoadmapIntent = typeof userRoadmapIntents.$inferSelect;
export type RoadmapFeedback = typeof roadmapFeedback.$inferSelect;
