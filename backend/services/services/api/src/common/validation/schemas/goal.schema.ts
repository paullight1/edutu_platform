import { z } from "zod";

export const createGoalSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(150),
  description: z.string().max(1000).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  deadline: z.string().datetime().nullable().optional(),
  targetDate: z.string().datetime().nullable().optional(),
  category: z.string().max(80).optional(),
  progress: z.number().min(0).max(100).default(0),
  status: z.enum(["active", "completed", "archived"]).optional(),
  source: z.enum(["template", "custom", "imported"]).optional(),
  templateId: z.string().max(160).nullable().optional(),
});

export const updateGoalSchema = createGoalSchema.partial();

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
