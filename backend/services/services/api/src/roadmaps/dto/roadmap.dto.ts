import { z } from "zod";

const RoadmapStepDtoSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(3),
  description: z.string().min(10),
  duration: z.string().optional(),
  resources: z.array(z.string()).optional(),
  relativeDueDays: z.number().int().optional(),
  phase: z.string().optional(),
  taskType: z.string().optional(),
  calendarSyncEnabled: z.boolean().optional(),
});

export const CreateRoadmapDtoSchema = z.object({
  title: z.string().min(3).max(200),
  slug: z.string().min(3).max(200).optional(),
  description: z.string().min(20).max(5000),
  category: z
    .enum([
      "scholarship",
      "career",
      "education",
      "skills",
      "business",
      "tech",
      "personal",
      "general",
    ])
    .default("general"),
  difficulty: z
    .enum(["beginner", "intermediate", "advanced"])
    .default("beginner"),
  estimatedDuration: z.string().optional(),
  targetAudience: z.string().optional(),
  prerequisites: z.string().optional(),
  outcomes: z.string().optional(),
  coverImage: z.string().url().optional().or(z.literal("")),
  opportunityId: z.string().optional(),
  creatorProof: z.record(z.string(), z.unknown()).optional(),
  deadlineStrategy: z.string().optional(),
  communityId: z.string().optional(),
  version: z.number().int().positive().optional().default(1),
  calendarSyncEnabled: z.boolean().optional().default(false),
  isFeatured: z.boolean().optional().default(false),
  steps: z.array(RoadmapStepDtoSchema).min(1, "At least one step is required"),
  resources: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().min(1),
        url: z.string().url().optional().or(z.literal("")),
        type: z
          .enum(["link", "document", "video", "tool", "other"])
          .default("link"),
      }),
    )
    .optional()
    .default([]),
  relatedOpportunities: z.array(z.string()).optional().default([]),
});

export const UpdateRoadmapDtoSchema = CreateRoadmapDtoSchema.partial().extend({
  status: z.enum(["draft", "published", "archived"]).optional(),
});

export const RoadmapIntentDtoSchema = z.object({
  goals: z.array(z.string()).optional(),
  currentLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  targetCategory: z.string().optional(),
  timeCommitment: z
    .enum(["under_1_month", "1_to_3_months", "3_to_6_months", "6_plus_months"])
    .optional(),
  learningStyle: z
    .enum(["self_paced", "structured", "hands_on", "visual"])
    .optional(),
  preferredFormat: z
    .enum(["step_by_step", "checklist", "guide", "interactive"])
    .optional(),
  additionalContext: z.string().optional(),
});

export const RoadmapFeedbackDtoSchema = z.object({
  roadmapId: z.string().uuid(),
  satisfactionScore: z.number().min(1).max(5),
  metExpectations: z.boolean().optional(),
  whatWorked: z.string().max(2000).optional(),
  whatImproved: z.string().max(2000).optional(),
  wouldRecommend: z.boolean().optional(),
});

export const AIAssistDtoSchema = z.object({
  topic: z.string().min(3),
  category: z.string().optional(),
  targetAudience: z.string().optional(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  additionalContext: z.string().optional(),
});

export const OpportunityPlanDtoSchema = z.object({
  // When set, the server loads the verified opportunity row and uses ITS
  // title/deadline/requirements — client-sent fields become a fallback only.
  // Plans must never be built on unverified client-supplied opportunity data.
  opportunityId: z.string().uuid().optional(),
  title: z.string().min(3).optional(),
  organization: z.string().optional(),
  category: z.string().optional(),
  deadline: z.string().optional(),
  description: z.string().max(4000).optional(),
  hoursPerWeek: z.number().int().positive().max(168).optional(),
  currentLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  milestones: z
    .array(z.object({ id: z.string(), title: z.string().min(1) }))
    .max(12)
    .optional(),
  // Verbatim requirement lines from the listing — the plan maps each one to a
  // concrete action so the applicant can prove they satisfy it.
  requirements: z.array(z.string().max(500)).max(30).optional(),
  // Applicant snapshot used to personalize the plan and surface profile gaps.
  profile: z
    .object({
      country: z.string().max(120).optional(),
      pursuit: z.string().max(200).optional(),
      gradeLevel: z.string().max(120).optional(),
      schoolName: z.string().max(200).optional(),
      isGraduate: z.boolean().optional(),
      interests: z.array(z.string().max(120)).max(20).optional(),
      ambitions: z.array(z.string().max(200)).max(20).optional(),
    })
    .optional(),
}).refine((dto) => Boolean(dto.opportunityId || dto.title), {
  message: "Provide opportunityId or title",
});

export const AdoptRoadmapDtoSchema = z.object({
  opportunityId: z.string().optional(),
  targetOpportunityId: z.string().optional(),
  targetDeadline: z.string().optional(),
  calendarSyncEnabled: z.boolean().optional(),
});

export const UpdateRoadmapProgressSchema = z.object({
  stepId: z.string().min(1),
  completed: z.boolean(),
});

export const RoadmapCommentDtoSchema = z.object({
  body: z.string().trim().min(2).max(1000),
  rating: z.number().int().min(1).max(5).optional(),
});

// UGC moderation (Apple Guideline 1.2): report an abusive comment.
export const ReportCommentDtoSchema = z.object({
  reason: z
    .enum(["offensive", "spam", "harassment", "other"])
    .optional()
    .default("other"),
});

// UGC moderation (Apple Guideline 1.2): block another user so their comments
// are hidden. `blockedUserId` is the comment's `author_id` (derived uuid).
export const BlockUserDtoSchema = z.object({
  blockedUserId: z.string().uuid(),
});

export type RoadmapStepDto = z.infer<typeof RoadmapStepDtoSchema>;
export type CreateRoadmapDto = z.infer<typeof CreateRoadmapDtoSchema>;
export type UpdateRoadmapDto = z.infer<typeof UpdateRoadmapDtoSchema>;
export type RoadmapIntentDto = z.infer<typeof RoadmapIntentDtoSchema>;
export type RoadmapFeedbackDto = z.infer<typeof RoadmapFeedbackDtoSchema>;
export type AIAssistDto = z.infer<typeof AIAssistDtoSchema>;
export type OpportunityPlanDto = z.infer<typeof OpportunityPlanDtoSchema>;
export type AdoptRoadmapDto = z.infer<typeof AdoptRoadmapDtoSchema>;
export type UpdateRoadmapProgressDto = z.infer<
  typeof UpdateRoadmapProgressSchema
>;
export type RoadmapCommentDto = z.infer<typeof RoadmapCommentDtoSchema>;
export type ReportCommentDto = z.infer<typeof ReportCommentDtoSchema>;
export type BlockUserDto = z.infer<typeof BlockUserDtoSchema>;
