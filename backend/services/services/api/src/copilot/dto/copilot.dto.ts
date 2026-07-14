import { z } from "zod";

// ---------------------------------------------------------------------------
// Request DTOs (validated with ZodValidationPipe at the controller boundary)
// ---------------------------------------------------------------------------

export const GenerateKitDtoSchema = z.object({
  refresh: z.boolean().optional(),
});
export type GenerateKitDto = z.infer<typeof GenerateKitDtoSchema>;

export const GenerateOutlineDtoSchema = z.object({
  promptId: z.string().min(1),
  prompt: z.string().max(2000).optional(),
  angle: z.string().max(500).optional(),
});
export type GenerateOutlineDto = z.infer<typeof GenerateOutlineDtoSchema>;

export const EssayFeedbackDtoSchema = z.object({
  promptId: z.string().min(1),
  prompt: z.string().max(2000).optional(),
  draft: z
    .string()
    .min(40, "Draft is too short for useful feedback")
    .max(20000),
});
export type EssayFeedbackDto = z.infer<typeof EssayFeedbackDtoSchema>;

export const SaveEssayDraftDtoSchema = z.object({
  promptId: z.string().min(1),
  prompt: z.string().max(2000).optional(),
  draft: z.string().max(20000),
});
export type SaveEssayDraftDto = z.infer<typeof SaveEssayDraftDtoSchema>;

export const UpdateChecklistDtoSchema = z.object({
  itemId: z.string().min(1),
  done: z.boolean(),
});
export type UpdateChecklistDto = z.infer<typeof UpdateChecklistDtoSchema>;

// ---------------------------------------------------------------------------
// AI output schemas. LLMs regularly emit null for unknown fields, so callers
// stripNulls() before parsing (same convention as CvService).
// ---------------------------------------------------------------------------

export const ChecklistItemSchema = z.object({
  id: z.string().default(""),
  label: z.string(),
  detail: z.string().optional(),
  category: z
    .enum(["documents", "eligibility", "preparation", "submission"])
    .catch("preparation"),
});

export const EssayPromptSchema = z.object({
  id: z.string().default(""),
  prompt: z.string(),
  guidance: z.string().optional(),
  suggestedAngle: z.string().optional(),
});

export const KitContentSchema = z.object({
  fitNote: z.string().default(""),
  strategy: z.array(z.string()).default([]),
  checklist: z.array(ChecklistItemSchema).default([]),
  essayPrompts: z.array(EssayPromptSchema).default([]),
});
export type KitContent = z.infer<typeof KitContentSchema>;

export const OutlineSchema = z.object({
  thesis: z.string().default(""),
  hook: z.string().optional(),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        points: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  closing: z.string().optional(),
  avoid: z.array(z.string()).default([]),
});
export type EssayOutline = z.infer<typeof OutlineSchema>;

export const FeedbackSchema = z.object({
  overallScore: z.coerce.number().min(0).max(100).default(60),
  scores: z
    .object({
      clarity: z.coerce.number().min(0).max(10).default(6),
      relevance: z.coerce.number().min(0).max(10).default(6),
      impact: z.coerce.number().min(0).max(10).default(6),
      authenticity: z.coerce.number().min(0).max(10).default(6),
    })
    .default({ clarity: 6, relevance: 6, impact: 6, authenticity: 6 }),
  verdict: z.string().default(""),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  lineEdits: z
    .array(
      z.object({
        original: z.string(),
        suggestion: z.string(),
        reason: z.string().optional(),
      }),
    )
    .default([]),
  revisedOpening: z.string().optional(),
});
export type EssayFeedback = z.infer<typeof FeedbackSchema>;

// The user's working state for one essay prompt, stored in application_kits.essays.
export interface EssayWorkspaceEntry {
  promptId: string;
  prompt: string;
  outline?: EssayOutline;
  draft?: string;
  feedback?: EssayFeedback;
  updatedAt: string;
}
