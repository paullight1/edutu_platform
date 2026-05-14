import { z } from 'zod';

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
  category: z.enum(['scholarship', 'career', 'education', 'skills', 'business', 'tech', 'personal', 'general']).default('general'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  estimatedDuration: z.string().optional(),
  targetAudience: z.string().optional(),
  prerequisites: z.string().optional(),
  outcomes: z.string().optional(),
  coverImage: z.string().url().optional().or(z.literal('')),
  opportunityId: z.string().optional(),
  creatorProof: z.record(z.string(), z.unknown()).optional(),
  deadlineStrategy: z.string().optional(),
  communityId: z.string().optional(),
  version: z.number().int().positive().optional().default(1),
  calendarSyncEnabled: z.boolean().optional().default(false),
  isFeatured: z.boolean().optional().default(false),
  steps: z.array(RoadmapStepDtoSchema).min(1, 'At least one step is required'),
  resources: z.array(z.object({
    id: z.string().optional(),
    title: z.string().min(1),
    url: z.string().url().optional().or(z.literal('')),
    type: z.enum(['link', 'document', 'video', 'tool', 'other']).default('link'),
  })).optional().default([]),
  relatedOpportunities: z.array(z.string()).optional().default([]),
});

export const UpdateRoadmapDtoSchema = CreateRoadmapDtoSchema.partial().extend({
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

export const RoadmapIntentDtoSchema = z.object({
  goals: z.array(z.string()).optional(),
  currentLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  targetCategory: z.string().optional(),
  timeCommitment: z.enum(['under_1_month', '1_to_3_months', '3_to_6_months', '6_plus_months']).optional(),
  learningStyle: z.enum(['self_paced', 'structured', 'hands_on', 'visual']).optional(),
  preferredFormat: z.enum(['step_by_step', 'checklist', 'guide', 'interactive']).optional(),
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
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  additionalContext: z.string().optional(),
});

export const AdoptRoadmapDtoSchema = z.object({
  opportunityId: z.string().optional(),
  targetOpportunityId: z.string().optional(),
  targetDeadline: z.string().optional(),
  calendarSyncEnabled: z.boolean().optional(),
});

export type RoadmapStepDto = z.infer<typeof RoadmapStepDtoSchema>;
export type CreateRoadmapDto = z.infer<typeof CreateRoadmapDtoSchema>;
export type UpdateRoadmapDto = z.infer<typeof UpdateRoadmapDtoSchema>;
export type RoadmapIntentDto = z.infer<typeof RoadmapIntentDtoSchema>;
export type RoadmapFeedbackDto = z.infer<typeof RoadmapFeedbackDtoSchema>;
export type AIAssistDto = z.infer<typeof AIAssistDtoSchema>;
export type AdoptRoadmapDto = z.infer<typeof AdoptRoadmapDtoSchema>;
