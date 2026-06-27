import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  numeric,
  date,
} from "drizzle-orm/pg-core";

// Users table (mirrors Supabase auth.users mostly, but owned by us for app profiles)
export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey(), // Foreign key to auth.users in concept
  fullName: text("full_name"),
  email: text("email"),
  role: text("role").default("user"), // 'user', 'admin', 'moderator'
  age: integer("age"),
  country: text("country"),
  school: text("school"),
  major: text("major"),
  degree: text("degree"),
  cgpa: numeric("cgpa"),
  gradYear: integer("grad_year"),
  dateOfBirth: date("date_of_birth"),
  interestedCountries: text("interested_countries").array(),
  interests: text("interests").array(),
  skills: text("skills").array(), // PostgreSQL array of text
  preferences: jsonb("preferences")
    .$type<Record<string, unknown>>()
    .default({}),
  creditsBalance: integer("credits_balance").default(0), // In-app credits currency
  creatorStatus: text("creator_status").default("none"), // 'none', 'pending', 'approved', 'rejected'
  creatorMetadata: jsonb("creator_metadata")
    .$type<Record<string, unknown>>()
    .default({}),
  settings: jsonb("settings").$type<Record<string, unknown>>().default({}),
  creatorRejectionReason: text("creator_rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    kind: text("kind").notNull().default("system"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    severity: text("severity").notNull().default("info"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    dedupeKey: text("dedupe_key"),
    channelStatus: jsonb("channel_status")
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: timestamp("created_at").defaultNow(),
    readAt: timestamp("read_at"),
  },
  (table) => [
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id").primaryKey(),
  pushNotifications: boolean("push_notifications").default(true).notNull(),
  emailNotifications: boolean("email_notifications").default(false).notNull(),
  opportunityAlerts: boolean("opportunity_alerts").default(true).notNull(),
  deadlineReminders: boolean("deadline_reminders").default(true).notNull(),
  goalReminders: boolean("goal_reminders").default(true).notNull(),
  achievementCelebrations: boolean("achievement_celebrations")
    .default(true)
    .notNull(),
  weeklyDigest: boolean("weekly_digest").default(false).notNull(),
  marketingEmails: boolean("marketing_emails").default(false).notNull(),
  quietHours: jsonb("quiet_hours")
    .$type<{ start: string; end: string }>()
    .default({ start: "22:00", end: "08:00" })
    .notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notificationPushTokens = pgTable(
  "notification_push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    provider: text("provider").notNull().default("expo"),
    token: text("token").notNull(),
    device: jsonb("device").$type<Record<string, unknown>>().default({}),
    lastSeenAt: timestamp("last_seen_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("notification_push_tokens_user_idx").on(table.userId),
    index("notification_push_tokens_provider_user_idx").on(
      table.provider,
      table.userId,
    ),
    uniqueIndex("notification_push_tokens_user_token_idx").on(
      table.userId,
      table.token,
    ),
  ],
);

export const notificationQueue = pgTable(
  "notification_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    scheduledFor: timestamp("scheduled_for").notNull(),
    status: text("status").notNull().default("pending"),
    processedAt: timestamp("processed_at"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("notification_queue_status_idx").on(table.status, table.scheduledFor),
  ],
);

// Goals table
export const goals = pgTable(
  "goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(), // We'll manually enforce this link to profiles.userId
    title: text("title").notNull(),
    description: text("description"),
    category: text("category"),
    progress: integer("progress").default(0),
    status: text("status").default("active"), // 'active', 'completed', 'archived'
    deadline: date("deadline"),
    targetDate: timestamp("target_date"),
    priority: text("priority"),
    source: text("source").default("custom"),
    templateId: text("template_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("idx_goals_user_id").on(table.userId),
    index("idx_goals_status").on(table.status),
    index("idx_goals_target_date").on(table.userId, table.targetDate),
  ],
);

// Goal Milestones (sub-tasks)
export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  goalId: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  completed: boolean("completed").default(false),
  order: integer("order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Opportunities management
export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    summary: text("summary"),
    providerId: uuid("provider_id"),
    category: text("category"),
    canonicalCategory: text("canonical_category").default("other"),
    type: text("type").default("scholarship"), // 'scholarship', 'mentorship', 'program', 'job', 'competition'
    description: text("description"),
    organization: text("organization"),
    location: text("location"),
    eligibilityCriteria: text("eligibility_criteria"),
    eligibility: jsonb("eligibility").$type<Record<string, unknown>>(),
    fundingType: text("funding_type"),
    targetRegion: text("target_region"),
    deadline: timestamp("deadline"),
    openDate: date("open_date"),
    closeDate: date("close_date"),
    stipend: numeric("stipend"),
    currency: text("currency"),
    sourceUrl: text("source_url").unique(),
    canonicalUrl: text("canonical_url"),
    contentFingerprint: text("content_fingerprint"),
    applyUrl: text("apply_url"),
    applicationUrl: text("application_url"),
    imageUrl: text("image_url"),
    tags: text("tags").array().default([]),
    source: text("source"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    isRemote: boolean("is_remote").default(true),
    isFeatured: boolean("is_featured").default(false),
    qualityScore: integer("quality_score"),
    validationStatus: text("validation_status").default("pending"),
    duplicateOf: uuid("duplicate_of"),
    firstSeenAt: timestamp("first_seen_at").defaultNow(),
    lastSeenAt: timestamp("last_seen_at").defaultNow(),
    lastVerifiedAt: timestamp("last_verified_at"),
    verificationStatus: text("verification_status").default("unverified"),
    verificationAttempts: integer("verification_attempts").notNull().default(0),
    verificationError: text("verification_error"),
    verificationNextCheckAt: timestamp("verification_next_check_at"),
    lastHttpStatus: integer("last_http_status"),
    brokenLinkCount: integer("broken_link_count").notNull().default(0),
    status: text("status").default("pending"), // 'pending', 'active', 'draft', 'expired', 'rejected'
    createdBy: uuid("created_by"),
    originalJson: text("original_json"), // Store the raw LLM output
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_opportunities_status").on(table.status),
    index("idx_opportunities_category").on(table.category),
    index("idx_opportunities_canonical_category").on(table.canonicalCategory),
    index("idx_opportunities_type").on(table.type),
    index("idx_opportunities_deadline").on(table.deadline),
    index("idx_opportunities_created_at").on(table.createdAt),
    index("idx_opportunities_updated_at").on(table.updatedAt),
    index("idx_opportunities_verification_due").on(
      table.verificationStatus,
      table.verificationNextCheckAt,
    ),
    index("idx_opportunities_last_verified").on(table.lastVerifiedAt),
  ],
);

export const opportunityVerificationRuns = pgTable(
  "opportunity_verification_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runType: text("run_type").notNull().default("manual"),
    status: text("status").notNull().default("running"),
    requestedLimit: integer("requested_limit").notNull().default(100),
    checkedCount: integer("checked_count").notNull().default(0),
    verifiedCount: integer("verified_count").notNull().default(0),
    staleCount: integer("stale_count").notNull().default(0),
    expiredCount: integer("expired_count").notNull().default(0),
    brokenCount: integer("broken_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    errors: jsonb("errors").$type<Array<Record<string, unknown>>>().default([]),
    startedAt: timestamp("started_at").defaultNow(),
    completedAt: timestamp("completed_at"),
    createdBy: text("created_by"),
  },
  (table) => [
    index("idx_opportunity_verification_runs_started").on(table.startedAt),
    index("idx_opportunity_verification_runs_status").on(table.status),
  ],
);

export const userOpportunityPreferences = pgTable(
  "user_opportunity_preferences",
  {
    userId: uuid("user_id").primaryKey(),
    preferredCategories: text("preferred_categories").array(),
    preferredRegions: text("preferred_regions").array(),
    preferredFundingTypes: text("preferred_funding_types").array(),
    preferredOpportunityTypes: text("preferred_opportunity_types").array(),
    preferredSkills: text("preferred_skills").array(),
    excludedCategories: text("excluded_categories").array(),
    remoteOnly: boolean("remote_only").default(false),
    maxDeadlineDays: integer("max_deadline_days"),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
);

export const userOpportunitySignals = pgTable(
  "user_opportunity_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    signalType: text("signal_type").notNull(),
    signalValue: integer("signal_value").default(1),
    source: text("source").default("app"),
    context: text("context"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_user_signals_user_id").on(table.userId),
    index("idx_user_signals_opportunity_id").on(table.opportunityId),
    index("idx_user_signals_type").on(table.signalType),
  ],
);

export const apiConsumers = pgTable(
  "api_consumers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id"),
    name: text("name").notNull(),
    contactEmail: text("contact_email"),
    keyPrefix: text("key_prefix"),
    apiKeyHash: text("api_key_hash").notNull().unique(),
    status: text("status").notNull().default("active"),
    plan: text("plan").notNull().default("starter"),
    environment: text("environment").notNull().default("live"),
    allowedScopes: text("allowed_scopes")
      .array()
      .notNull()
      .default(["opportunities:read", "recommendations:read", "events:write"]),
    monthlyQuota: integer("monthly_quota").default(1000),
    rateLimitPerMinute: integer("rate_limit_per_minute").default(60),
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    expiresAt: timestamp("expires_at"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_api_consumers_owner").on(table.ownerUserId),
    index("idx_api_consumers_status").on(table.status),
    index("idx_api_consumers_key_hash").on(table.apiKeyHash),
    uniqueIndex("idx_api_consumers_key_prefix_unique").on(table.keyPrefix),
  ],
);

export const apiUsageEvents = pgTable(
  "api_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    consumerId: uuid("consumer_id")
      .notNull()
      .references(() => apiConsumers.id, { onDelete: "cascade" }),
    requestId: text("request_id"),
    method: text("method").notNull(),
    endpoint: text("endpoint").notNull(),
    statusCode: integer("status_code").default(200),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_api_usage_consumer_created").on(
      table.consumerId,
      table.createdAt,
    ),
  ],
);

export const apiUsageBuckets = pgTable(
  "api_usage_buckets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    consumerId: uuid("consumer_id")
      .notNull()
      .references(() => apiConsumers.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    monthlyQuota: integer("monthly_quota"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_api_usage_buckets_consumer_period").on(
      table.consumerId,
      table.periodStart,
    ),
  ],
);

export const apiPartnerEvents = pgTable(
  "api_partner_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    consumerId: uuid("consumer_id")
      .notNull()
      .references(() => apiConsumers.id, { onDelete: "cascade" }),
    requestId: text("request_id"),
    eventType: text("event_type").notNull(),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    externalUserId: text("external_user_id"),
    sessionId: text("session_id"),
    source: text("source").notNull().default("partner"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_api_partner_events_consumer_created").on(
      table.consumerId,
      table.createdAt,
    ),
    index("idx_api_partner_events_opportunity").on(table.opportunityId),
    index("idx_api_partner_events_type").on(table.eventType),
  ],
);

// Creator / Seller Applications — Users apply to become marketplace creators
export const creatorApplications = pgTable("creator_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), // FK to profiles.user_id
  displayName: text("display_name").notNull(),
  bio: text("bio").notNull(),
  contentType: text("content_type").notNull(), // 'course', 'event', 'mentorship', 'template', 'resource'
  experience: text("experience").notNull(), // Years of experience / portfolio
  sampleContentUrl: text("sample_content_url"), // Optional link to their work
  status: text("status").default("pending"), // 'pending', 'approved', 'rejected'
  adminNote: text("admin_note"), // Reason for rejection or note from admin
  reviewedBy: uuid("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Marketplace Listings (real courses / services / roadmaps for sale or free)
export const marketplaceListings = pgTable("marketplace_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sellerId: uuid("seller_id").notNull(), // FK to profiles.user_id
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(), // 'course', 'event', 'mentorship', 'template', 'resource'
  type: text("type").default("course"), // 'free', 'paid', 'credit'
  price: integer("price").default(0), // Price in Credits (0 = free)
  imageUrl: text("image_url"),
  previewUrl: text("preview_url"),
  // Event-specific fields
  eventDate: timestamp("event_date"),
  eventEndDate: timestamp("event_end_date"),
  eventLocation: text("event_location"), // 'online' or a physical address
  capacity: integer("capacity"), // Max attendees (null = unlimited)
  tags: text("tags").array(),
  rating: integer("rating").default(0), // Aggregated 0-50 fixed-point (e.g. 48 = 4.8)
  reviewCount: integer("review_count").default(0),
  enrollmentCount: integer("enrollment_count").default(0),
  isFeatured: boolean("is_featured").default(false),
  status: text("status").default("pending"), // 'pending', 'active', 'paused', 'rejected'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User enrollments / purchases in the marketplace
export const marketplaceEnrollments = pgTable("marketplace_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  listingId: uuid("listing_id")
    .notNull()
    .references(() => marketplaceListings.id, { onDelete: "cascade" }),
  status: text("status").default("active"), // 'active', 'completed', 'refunded'
  creditsSpent: integer("credits_spent").default(0),
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Marketplace Regulation & Packages
export const marketplacePackages = pgTable("marketplace_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: text("category"),
  capacityLimit: integer("capacity_limit").default(100),
  currentEnrollment: integer("current_enrollment").default(0),
  status: text("status").default("optimal"), // 'optimal', 'high-demand', 'over-capacity', 'locked'
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Support Tickets (Priority Hub)
export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  subject: text("subject").notNull(),
  description: text("description"),
  priority: text("priority").default("medium"), // 'low', 'medium', 'high', 'urgent'
  status: text("status").default("open"), // 'open', 'in-progress', 'resolved', 'closed'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Financial Ledger
export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  amount: integer("amount").notNull(), // Amount in smallest unit (e.g. cents)
  type: text("type").notNull(), // 'payout', 'reward', 'credit', 'payment'
  status: text("status").default("pending"), // 'pending', 'completed', 'failed', 'refunded'
  referenceId: text("reference_id"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// AI-Generated Quizzes
export const quizzes = pgTable("quizzes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  topic: text("topic").notNull(),
  difficulty: text("difficulty").default("medium"), // 'easy', 'medium', 'hard'
  questionCount: integer("question_count").default(5),
  status: text("status").default("generated"), // 'generated', 'in_progress', 'completed'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Quiz Questions
export const quizQuestions = pgTable("quiz_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  quizId: uuid("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  options: text("options").array().notNull(), // Array of answer options
  correctIndex: integer("correct_index").notNull(), // Index of correct answer in options array
  explanation: text("explanation"), // AI-generated explanation for the correct answer
  order: integer("order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Quiz Attempts / Results
export const quizAttempts = pgTable("quiz_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  quizId: uuid("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  answers: text("answers").array(), // Array of selected answer indices
  score: integer("score").default(0),
  totalQuestions: integer("total_questions").default(0),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Flashcard Decks
export const flashcardDecks = pgTable("flashcard_decks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  tags: text("tags").array(),
  isPublic: boolean("is_public").default(false),
  cardCount: integer("card_count").default(0),
  difficulty: text("difficulty").default("medium"), // 'easy', 'medium', 'hard'
  sourceType: text("source_type").default("manual"), // 'manual', 'ai_generated', 'imported'
  sourceId: text("source_id"), // Reference to original content (e.g., goal, opportunity)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Flashcards
export const flashcards = pgTable("flashcards", {
  id: uuid("id").primaryKey().defaultRandom(),
  deckId: uuid("deck_id")
    .notNull()
    .references(() => flashcardDecks.id, { onDelete: "cascade" }),
  front: text("front").notNull(), // Question/term side
  back: text("back").notNull(), // Answer/definition side
  hint: text("hint"),
  order: integer("order").default(0),
  difficulty: text("difficulty").default("medium"), // 'easy', 'medium', 'hard'
  tags: text("tags").array(),
  mediaUrl: text("media_url"), // Optional image/video URL
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Flashcard Study Sessions
export const flashcardStudySessions = pgTable("flashcard_study_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  deckId: uuid("deck_id")
    .notNull()
    .references(() => flashcardDecks.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  cardsReviewed: integer("cards_reviewed").default(0),
  correctCount: integer("correct_count").default(0),
  incorrectCount: integer("incorrect_count").default(0),
  durationSeconds: integer("duration_seconds").default(0),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Flashcard Reviews (Spaced Repetition)
export const flashcardReviews = pgTable(
  "flashcard_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => flashcards.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    easeFactor: integer("ease_factor").default(250), // SM-2 algorithm ease factor (250 = 2.5)
    interval: integer("interval").default(0), // Days until next review
    repetitions: integer("repetitions").default(0), // Number of correct reviews in a row
    nextReviewAt: timestamp("next_review_at"),
    lastReviewAt: timestamp("last_review_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_flashcard_reviews_user_id").on(table.userId),
    index("idx_flashcard_reviews_card_id").on(table.cardId),
    index("idx_flashcard_reviews_next_review").on(table.nextReviewAt),
  ],
);

// AI provider keys are write-only from the app perspective: the raw key is
// encrypted before storage and never returned by admin APIs.
export const aiProviderKeys = pgTable(
  "ai_provider_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(), // 'deepseek', 'gemini', 'openrouter', 'openai', 'groq', etc.
    label: text("label").notNull(),
    encryptedKey: text("encrypted_key").notNull(),
    keyPreview: text("key_preview").notNull(),
    isActive: boolean("is_active").default(true),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_ai_provider_keys_provider").on(table.provider),
    index("idx_ai_provider_keys_active").on(table.isActive),
  ],
);

export const aiRoutes = pgTable(
  "ai_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feature: text("feature").notNull().unique(), // e.g. 'chat.coach', 'cv.tailor', 'scraper.extract'
    provider: text("provider").notNull().default("deepseek"),
    model: text("model").notNull().default("deepseek-chat"),
    providerKeyId: uuid("provider_key_id").references(() => aiProviderKeys.id, {
      onDelete: "set null",
    }),
    systemPrompt: text("system_prompt"),
    temperature: integer("temperature").default(20), // stored as basis points: 20 => 0.2
    maxOutputTokens: integer("max_output_tokens"),
    responseMimeType: text("response_mime_type"),
    fallbackProvider: text("fallback_provider"),
    fallbackModel: text("fallback_model"),
    isEnabled: boolean("is_enabled").default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    updatedBy: uuid("updated_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_ai_routes_feature").on(table.feature),
    index("idx_ai_routes_provider").on(table.provider),
  ],
);

export const aiPrompts = pgTable(
  "ai_prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feature: text("feature").notNull(),
    name: text("name").notNull(),
    content: text("content").notNull(),
    version: integer("version").default(1),
    isActive: boolean("is_active").default(false),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_ai_prompts_feature").on(table.feature),
    index("idx_ai_prompts_active").on(table.isActive),
  ],
);

export const aiUsageLogs = pgTable(
  "ai_usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feature: text("feature").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull().default("success"),
    latencyMs: integer("latency_ms"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    errorMessage: text("error_message"),
    requestMetadata: jsonb("request_metadata")
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_ai_usage_logs_feature").on(table.feature),
    index("idx_ai_usage_logs_created_at").on(table.createdAt),
  ],
);

export type AiProviderKey = typeof aiProviderKeys.$inferSelect;
export type NewAiProviderKey = typeof aiProviderKeys.$inferInsert;
export type AiRoute = typeof aiRoutes.$inferSelect;
export type NewAiRoute = typeof aiRoutes.$inferInsert;
export type AiPrompt = typeof aiPrompts.$inferSelect;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;

// Blog Posts
export const blogPosts = pgTable("blog_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  coverImage: text("cover_image"),
  authorId: uuid("author_id").notNull(),
  authorName: text("author_name").notNull(),
  authorAvatar: text("author_avatar"),
  category: text("category").default("general"), // 'general', 'scholarships', 'jobs', 'mentorship', 'tips', 'news'
  tags: text("tags").array(),
  publishedAt: timestamp("published_at"),
  status: text("status").default("draft"), // 'draft', 'published', 'archived'
  featured: boolean("featured").default(false),
  views: integer("views").default(0),
  likes: integer("likes").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type BlogPost = typeof blogPosts.$inferSelect;
export type NewBlogPost = typeof blogPosts.$inferInsert;

// Events announced by admins and shown publicly when published
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    summary: text("summary"),
    description: text("description"),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at"),
    timezone: text("timezone").default("UTC"),
    location: text("location"),
    isOnline: boolean("is_online").default(true),
    ctaLabel: text("cta_label").default("Join event"),
    ctaUrl: text("cta_url"),
    imageUrl: text("image_url"),
    status: text("status").default("draft"), // 'draft', 'published', 'cancelled', 'archived'
    audience: text("audience").default("public"),
    capacity: integer("capacity"),
    createdBy: text("created_by"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_events_status").on(table.status),
    index("idx_events_starts_at").on(table.startsAt),
    index("idx_events_updated_at").on(table.updatedAt),
    uniqueIndex("idx_events_slug_unique").on(table.slug),
  ],
);

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    name: text("name"),
    email: text("email"),
    status: text("status").default("registered"),
    source: text("source").default("web"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_event_registrations_event_id").on(table.eventId),
    index("idx_event_registrations_user_id").on(table.userId),
    index("idx_event_registrations_email").on(table.email),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type NewEventRegistration = typeof eventRegistrations.$inferInsert;

// Blog Comments
export const blogComments = pgTable("blog_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id")
    .notNull()
    .references(() => blogPosts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull(),
  userName: text("user_name").notNull(),
  userAvatar: text("user_avatar"),
  content: text("content").notNull(),
  status: text("status").default("pending"), // 'pending', 'approved', 'rejected'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type BlogComment = typeof blogComments.$inferSelect;
export type NewBlogComment = typeof blogComments.$inferInsert;

// Roadmaps
export const roadmaps = pgTable(
  "roadmaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull(),
    category: text("category").notNull().default("general"),
    difficulty: text("difficulty").notNull().default("beginner"),
    estimatedDuration: text("estimated_duration"),
    targetAudience: text("target_audience"),
    prerequisites: text("prerequisites"),
    outcomes: text("outcomes"),
    coverImage: text("cover_image"),
    opportunityId: text("opportunity_id"),
    creatorProof: jsonb("creator_proof").$type<Record<string, unknown>>(),
    deadlineStrategy: text("deadline_strategy"),
    communityId: text("community_id"),
    version: integer("version").default(1),
    calendarSyncEnabled: boolean("calendar_sync_enabled").default(false),
    status: text("status").notNull().default("draft"),
    createdBy: uuid("created_by").notNull(),
    creatorName: text("creator_name").notNull().default("Edutu Admin"),
    isFeatured: boolean("is_featured").default(false),
    enrollmentCount: integer("enrollment_count").default(0),
    ratingAvg: numeric("rating_avg", { precision: 3, scale: 2 }).default("0"),
    ratingCount: integer("rating_count").default(0),
    steps: jsonb("steps")
      .$type<
        Array<{
          id: string;
          title: string;
          description: string;
          duration?: string;
          resources?: string[];
          relativeDueDays?: number;
          phase?: string;
          taskType?: string;
          calendarSyncEnabled?: boolean;
        }>
      >()
      .default([]),
    resources: jsonb("resources")
      .$type<Array<{ id: string; title: string; url: string; type: string }>>()
      .default([]),
    relatedOpportunities: text("related_opportunities").array().default([]),
    aiIntentTags: text("ai_intent_tags").array().default([]),
    aiGeneratedSummary: text("ai_generated_summary"),
    satisfactionScore: numeric("satisfaction_score", {
      precision: 3,
      scale: 2,
    }).default("0"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
    publishedAt: timestamp("published_at"),
  },
  (table) => [
    index("idx_roadmaps_status").on(table.status),
    index("idx_roadmaps_category").on(table.category),
    index("idx_roadmaps_difficulty").on(table.difficulty),
    index("idx_roadmaps_featured").on(table.isFeatured),
    index("idx_roadmaps_created_by").on(table.createdBy),
  ],
);

export const roadmapEnrollments = pgTable(
  "roadmap_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    roadmapId: uuid("roadmap_id")
      .notNull()
      .references(() => roadmaps.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("enrolled"),
    progress: integer("progress").default(0),
    currentStep: integer("current_step").default(0),
    completedSteps: jsonb("completed_steps").$type<string[]>().default([]),
    targetOpportunityId: text("target_opportunity_id"),
    targetDeadline: timestamp("target_deadline"),
    calendarSyncEnabled: boolean("calendar_sync_enabled").default(false),
    adoptedPlan: jsonb("adopted_plan")
      .$type<Record<string, unknown>>()
      .default({}),
    enrolledAt: timestamp("enrolled_at").defaultNow(),
    completedAt: timestamp("completed_at"),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_enrollments_user_id").on(table.userId),
    index("idx_enrollments_roadmap_id").on(table.roadmapId),
    uniqueIndex("idx_enrollments_user_roadmap_unique").on(
      table.userId,
      table.roadmapId,
    ),
    index("idx_enrollments_target_opportunity_id").on(
      table.targetOpportunityId,
    ),
    index("idx_enrollments_target_deadline").on(table.targetDeadline),
  ],
);

export const userRoadmapIntents = pgTable(
  "user_roadmap_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    goals: text("goals").array(),
    currentLevel: text("current_level"),
    targetCategory: text("target_category"),
    timeCommitment: text("time_commitment"),
    learningStyle: text("learning_style"),
    preferredFormat: text("preferred_format"),
    additionalContext: text("additional_context"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_user_intents_user_id").on(table.userId),
    uniqueIndex("idx_user_intents_user_unique").on(table.userId),
  ],
);

export const roadmapFeedback = pgTable(
  "roadmap_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    roadmapId: uuid("roadmap_id")
      .notNull()
      .references(() => roadmaps.id, { onDelete: "cascade" }),
    satisfactionScore: integer("satisfaction_score").notNull(),
    metExpectations: boolean("met_expectations"),
    whatWorked: text("what_worked"),
    whatImproved: text("what_improved"),
    wouldRecommend: boolean("would_recommend"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_feedback_roadmap_id").on(table.roadmapId),
    index("idx_feedback_user_id").on(table.userId),
  ],
);

export const mobileAppCampaigns = pgTable(
  "mobile_app_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    title: text("title").notNull(),
    body: text("body"),
    campaignType: text("campaign_type").notNull().default("popup"),
    placement: text("placement").notNull().default("global"),
    status: text("status").notNull().default("draft"),
    priority: integer("priority").notNull().default(0),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    audience: jsonb("audience").$type<Record<string, unknown>>().default({}),
    creative: jsonb("creative").$type<Record<string, unknown>>().default({}),
    frequency: jsonb("frequency").$type<Record<string, unknown>>().default({}),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_mobile_campaigns_status").on(table.status),
    index("idx_mobile_campaigns_placement").on(table.placement),
    index("idx_mobile_campaigns_priority").on(table.priority),
  ],
);

export const mobileFeatureFlags = pgTable(
  "mobile_feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    label: text("label").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(false),
    defaultValue: jsonb("default_value").$type<unknown>().default(false),
    rollout: jsonb("rollout").$type<Record<string, unknown>>().default({}),
    requiresPro: boolean("requires_pro").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_mobile_feature_flags_enabled").on(table.enabled),
    index("idx_mobile_feature_flags_sort_order").on(table.sortOrder),
  ],
);

export const widgetFeeds = pgTable(
  "widget_feeds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull().unique(),
    title: text("title").notNull(),
    feedType: text("feed_type").notNull().default("opportunities"),
    placement: text("placement").notNull().default("home"),
    status: text("status").notNull().default("draft"),
    items: jsonb("items").$type<Array<Record<string, unknown>>>().default([]),
    audience: jsonb("audience").$type<Record<string, unknown>>().default({}),
    priority: integer("priority").notNull().default(0),
    startsAt: timestamp("starts_at"),
    endsAt: timestamp("ends_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_widget_feeds_status").on(table.status),
    index("idx_widget_feeds_placement").on(table.placement),
    index("idx_widget_feeds_priority").on(table.priority),
  ],
);

export const mobileCampaignEvents = pgTable(
  "mobile_campaign_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").references(() => mobileAppCampaigns.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").notNull(),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_mobile_campaign_events_campaign_id").on(table.campaignId),
    index("idx_mobile_campaign_events_user_id").on(table.userId),
  ],
);

export const adminSettings = pgTable("admin_settings", {
  key: text("key").primaryKey().default("global"),
  settings: jsonb("settings")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  updatedBy: text("updated_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Roadmap = typeof roadmaps.$inferSelect;
export type NewRoadmap = typeof roadmaps.$inferInsert;
export type RoadmapEnrollment = typeof roadmapEnrollments.$inferSelect;
export type UserRoadmapIntent = typeof userRoadmapIntents.$inferSelect;
export type RoadmapFeedback = typeof roadmapFeedback.$inferSelect;
export type MobileAppCampaign = typeof mobileAppCampaigns.$inferSelect;
export type MobileFeatureFlag = typeof mobileFeatureFlags.$inferSelect;
export type WidgetFeed = typeof widgetFeeds.$inferSelect;
