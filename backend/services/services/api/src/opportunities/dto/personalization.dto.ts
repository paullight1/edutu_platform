import { z } from "zod";

export const OpportunityPreferenceSchema = z.object({
  preferredCategories: z.array(z.string().min(1)).optional(),
  preferredRegions: z.array(z.string().min(1)).optional(),
  preferredFundingTypes: z.array(z.string().min(1)).optional(),
  preferredOpportunityTypes: z.array(z.string().min(1)).optional(),
  preferredSkills: z.array(z.string().min(1)).optional(),
  excludedCategories: z.array(z.string().min(1)).optional(),
  remoteOnly: z.boolean().optional(),
  maxDeadlineDays: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type OpportunityPreferenceDto = z.infer<
  typeof OpportunityPreferenceSchema
>;

// Typed dismiss reasons route to different subsystems: wrong_field is a taste
// signal (excludes the category), not_eligible is a profile/eligibility fact,
// already_applied and deadline_too_soon only hide the item — neither should
// poison the user's category affinity.
export const DISMISS_REASONS = [
  "not_eligible",
  "wrong_field",
  "already_applied",
  "deadline_too_soon",
] as const;

export type DismissReason = (typeof DISMISS_REASONS)[number];

// Signal types with no opportunity attached (query text / category browse).
export const NON_ITEM_SIGNAL_TYPES = ["search", "category_view"] as const;

export const OpportunitySignalSchema = z
  .object({
    // Optional only for non-item signals (search/category_view) — enforced in
    // the superRefine below so every item signal still carries its id.
    opportunityId: z.string().uuid().optional(),
    signalType: z.enum([
      "view",
      "click",
      "share",
      "save",
      "dismiss",
      "apply",
      "chat_like",
      "chat_dislike",
      "recommended_in_chat",
      // Real application outcomes, recorded when the user resolves an
      // application — the only signals that teach the engine what they WIN.
      "outcome_offer",
      "outcome_rejected",
      "outcome_withdrawn",
      // Served-but-not-clicked exposure (with {surface, position} in details).
      // Weight 0 in scoring; powers impression-fatigue and, later, CTR eval.
      "impression",
      // Time actually spent reading a detail screen ({seconds} in details).
      "dwell",
      // Non-item browse intent: search ({query}) and category tile taps
      // ({category}) — feed category affinity, not per-item scores.
      "search",
      "category_view",
    ]),
    signalValue: z.number().int().min(-10).max(10).optional(),
    reason: z.enum(DISMISS_REASONS).optional(),
    source: z.string().max(100).optional(),
    context: z.string().max(500).optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    const isNonItem = (NON_ITEM_SIGNAL_TYPES as readonly string[]).includes(
      value.signalType,
    );
    if (!isNonItem && !value.opportunityId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["opportunityId"],
        message: `opportunityId is required for '${value.signalType}' signals`,
      });
    }
  });

export type OpportunitySignalDto = z.infer<typeof OpportunitySignalSchema>;

// Impression beacons arrive in bursts (one per rendered card) — accept them
// in one request instead of a request per card.
export const OpportunitySignalBatchSchema = z.object({
  signals: z.array(OpportunitySignalSchema).min(1).max(100),
});

export type OpportunitySignalBatchDto = z.infer<
  typeof OpportunitySignalBatchSchema
>;

export const RecommendationQuerySchema = z.object({
  profile: z
    .object({
      country: z.string().nullable().optional(),
      skills: z.array(z.string()).nullable().optional(),
      interests: z.array(z.string()).nullable().optional(),
      fieldOfStudy: z.string().nullable().optional(),
      field_of_study: z.string().nullable().optional(),
      courseOfStudy: z.string().nullable().optional(),
      major: z.string().nullable().optional(),
      school: z.string().nullable().optional(),
      degree: z.string().nullable().optional(),
      cgpa: z.union([z.number(), z.string()]).nullable().optional(),
      age: z.number().int().nullable().optional(),
      dateOfBirth: z.string().nullable().optional(),
      date_of_birth: z.string().nullable().optional(),
      interestedCountries: z.array(z.string()).nullable().optional(),
      interested_countries: z.array(z.string()).nullable().optional(),
    })
    .nullable()
    .optional(),
  preferences: OpportunityPreferenceSchema.nullable().optional(),
  goals: z
    .array(
      z.object({
        title: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  message: z.string().max(4000).nullable().optional(),
  // Clamp instead of reject: mobile historically sent limit=1000, and a hard
  // .max() turned every such request into a silent 400 + client fallback.
  limit: z
    .number()
    .int()
    .min(1)
    .transform((value) => Math.min(value, 1000))
    .optional(),
  minMatchScore: z.number().min(0).max(100).optional(),
  excludeOpportunityIds: z.array(z.string().uuid()).max(200).optional(),
  // Opt-in LLM re-rank refinement. Off by default so the heuristic ranking
  // serves the hot path; only honored for authenticated callers (see service).
  aiRerank: z.boolean().optional(),
});

export type RecommendationQueryDto = z.infer<typeof RecommendationQuerySchema>;

export const UserRecommendationRequestSchema = RecommendationQuerySchema.pick({
  message: true,
  limit: true,
  minMatchScore: true,
  excludeOpportunityIds: true,
  aiRerank: true,
});

export type UserRecommendationRequestDto = z.infer<
  typeof UserRecommendationRequestSchema
>;
