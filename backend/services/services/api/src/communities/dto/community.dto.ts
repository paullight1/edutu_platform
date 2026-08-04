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
//
// `options` only makes sense for `single_select`. Rather than leaving that as
// a comment downstream code has to remember (and re-check with
// `type === "single_select"` before trusting `options`), the invariant is
// encoded as a discriminated union on `type`. That gives two wins over a
// `.superRefine` on a flat object: (1) after a successful parse, TypeScript
// narrows `options` to `string[]` on the `single_select` branch — no
// `string[] | undefined` for callers to guard against — and (2) a
// `short_text`/`long_text` question that carries `options` is rejected
// outright (via `z.undefined()`) instead of the value being silently
// stripped or ignored.
const questionId = z
  .string()
  .min(1, "Question id is required")
  .max(40, "Question id must be 40 characters or fewer");

const questionLabel = z
  .string()
  .trim()
  .min(1, "Question label is required")
  .max(60, "Question label must be 60 characters or fewer");

const questionOption = z
  .string()
  .trim()
  .min(1, "Option text cannot be empty")
  .max(40, "Option text must be 40 characters or fewer");

const TextQuestionSchema = z.object({
  id: questionId,
  type: z.enum(["short_text", "long_text"]),
  label: questionLabel,
  required: z.boolean().default(false),
  options: z
    .undefined({
      error: "options is only allowed for single_select questions",
    })
    .optional(),
});

const SingleSelectQuestionSchema = z.object({
  id: questionId,
  type: z.literal("single_select"),
  label: questionLabel,
  required: z.boolean().default(false),
  options: z
    .array(questionOption)
    .min(2, "single_select needs at least 2 options")
    .max(6, "single_select allows at most 6 options"),
});

export const GroupQuestionSchema = z.discriminatedUnion("type", [
  TextQuestionSchema,
  SingleSelectQuestionSchema,
]);
export type GroupQuestionDto = z.infer<typeof GroupQuestionSchema>;

export const GroupFormSchema = z.object({
  questions: z
    .array(GroupQuestionSchema)
    .max(5, "A form allows at most 5 questions"),
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
