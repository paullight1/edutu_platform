import { z } from "zod";

const optionalText = (maxLength: number) =>
  z.string().trim().max(maxLength).nullable().optional();

const optionalIsoDate = z.string().datetime().nullable().optional();

export const CreateGoalSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    description: optionalText(1000),
    category: optionalText(80),
    deadline: optionalIsoDate,
    targetDate: optionalIsoDate,
    progress: z.coerce.number().min(0).max(100).optional(),
    status: z.enum(["active", "completed", "archived"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    source: z.enum(["template", "custom", "imported"]).optional(),
    templateId: optionalText(160),
    template_id: optionalText(160),
  })
  .strict();

export type CreateGoalDto = z.infer<typeof CreateGoalSchema>;
