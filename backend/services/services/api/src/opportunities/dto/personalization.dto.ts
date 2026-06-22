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

export const OpportunitySignalSchema = z.object({
  opportunityId: z.string().uuid(),
  signalType: z.enum([
    "view",
    "click",
    "save",
    "dismiss",
    "apply",
    "chat_like",
    "chat_dislike",
    "recommended_in_chat",
  ]),
  signalValue: z.number().int().min(-10).max(10).optional(),
  source: z.string().max(100).optional(),
  context: z.string().max(500).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type OpportunitySignalDto = z.infer<typeof OpportunitySignalSchema>;

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
  limit: z.number().int().min(1).max(50).optional(),
  minMatchScore: z.number().min(0).max(100).optional(),
  excludeOpportunityIds: z.array(z.string().uuid()).max(200).optional(),
});

export type RecommendationQueryDto = z.infer<typeof RecommendationQuerySchema>;

export const UserRecommendationRequestSchema = RecommendationQuerySchema.pick({
  message: true,
  limit: true,
  minMatchScore: true,
  excludeOpportunityIds: true,
});

export type UserRecommendationRequestDto = z.infer<
  typeof UserRecommendationRequestSchema
>;
