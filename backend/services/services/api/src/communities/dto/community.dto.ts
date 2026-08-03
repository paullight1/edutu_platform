import { z } from "zod";

export const CreateGroupSchema = z.object({
  name: z.string().trim().min(3).max(60),
  description: z.string().trim().max(280).optional(),
  opportunityId: z.string().uuid().optional(),
  visibility: z.enum(["public", "private"]).default("public"),
  joinPolicy: z.enum(["open", "request"]).default("open"),
  coverEmoji: z.string().min(1).max(8).default("💬"),
});
export type CreateGroupDto = z.infer<typeof CreateGroupSchema>;

export const UpdateGroupSchema = CreateGroupSchema.partial().omit({
  opportunityId: true,
});
export type UpdateGroupDto = z.infer<typeof UpdateGroupSchema>;

export const SendMessageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  opportunityId: z.string().uuid().optional(),
});
export type SendMessageDto = z.infer<typeof SendMessageSchema>;

// The constrained question set. Max 5, fixed types — a form builder, not a
// form engine, so the builder / renderer / viewer each stay testable.
export const GroupQuestionSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(["short_text", "long_text", "single_select"]),
  label: z.string().trim().min(1).max(60),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(40)).max(6).optional(),
});
export const GroupFormSchema = z.object({
  questions: z.array(GroupQuestionSchema).max(5),
});
export type GroupFormDto = z.infer<typeof GroupFormSchema>;

export const JoinRequestSchema = z.object({
  answers: z
    .array(z.object({ id: z.string(), value: z.string().trim().max(500) }))
    .max(5)
    .default([]),
});
export type JoinRequestDto = z.infer<typeof JoinRequestSchema>;

export const ReportSchema = z.object({
  targetType: z.enum(["message", "group"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(3).max(280),
});
export type ReportDto = z.infer<typeof ReportSchema>;
