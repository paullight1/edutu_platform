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

export const UpdateGroupSchema = CreateGroupSchema.partial()
  .omit({
    opportunityId: true,
  })
  .extend({
    coverImageResourceUrl: z.string().url().max(2048).nullable().optional(),
  });
export type UpdateGroupDto = z.infer<typeof UpdateGroupSchema>;

export const COMMUNITY_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const COMMUNITY_PDF_MIME_TYPE = "application/pdf" as const;
export const COMMUNITY_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const COMMUNITY_PDF_MAX_BYTES = 10 * 1024 * 1024;

const attachmentDisplayName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  // Display names are rendered back to every member. Reject path-shaped and
  // control-character names rather than trying to sanitize them differently
  // on each client.
  .refine((name) => {
    for (let index = 0; index < name.length; index += 1) {
      const code = name.charCodeAt(index);
      if (code <= 0x1f || code === 0x7f) {
        return false;
      }
    }

    return (
      !name.includes("/") &&
      !name.includes("\\") &&
      name !== "." &&
      name !== ".."
    );
  }, "Attachment name is not safe");

const attachmentCaption = z.string().trim().max(500).optional();
const attachmentUrl = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Attachment URL must use HTTPS");

export const CommunityImageAttachmentSchema = z
  .object({
    url: attachmentUrl,
    name: attachmentDisplayName.refine(
      (name) => /\.(?:jpe?g|png|webp)$/i.test(name),
      "Image name must end in .jpg, .jpeg, .png, or .webp",
    ),
    mime: z.enum(COMMUNITY_IMAGE_MIME_TYPES),
    size: z.number().int().positive().max(COMMUNITY_IMAGE_MAX_BYTES),
    caption: attachmentCaption,
  })
  .strict();

export const CommunityFileAttachmentSchema = z
  .object({
    url: attachmentUrl,
    name: attachmentDisplayName.refine(
      (name) => /\.pdf$/i.test(name),
      "File name must end in .pdf",
    ),
    mime: z.literal(COMMUNITY_PDF_MIME_TYPE),
    size: z.number().int().positive().max(COMMUNITY_PDF_MAX_BYTES),
    caption: attachmentCaption,
  })
  .strict();

export type CommunityAttachmentDto =
  | z.infer<typeof CommunityImageAttachmentSchema>
  | z.infer<typeof CommunityFileAttachmentSchema>;

export const CommunityAttachmentUploadSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("image"),
      name: attachmentDisplayName.refine(
        (name) => /\.(?:jpe?g|png|webp)$/i.test(name),
        "Image name must end in .jpg, .jpeg, .png, or .webp",
      ),
      mime: z.enum(COMMUNITY_IMAGE_MIME_TYPES),
      size: z.number().int().positive().max(COMMUNITY_IMAGE_MAX_BYTES),
    })
    .strict(),
  z
    .object({
      kind: z.literal("file"),
      name: attachmentDisplayName.refine(
        (name) => /\.pdf$/i.test(name),
        "File name must end in .pdf",
      ),
      mime: z.literal(COMMUNITY_PDF_MIME_TYPE),
      size: z.number().int().positive().max(COMMUNITY_PDF_MAX_BYTES),
    })
    .strict(),
]);
export type CommunityAttachmentUploadDto = z.infer<
  typeof CommunityAttachmentUploadSchema
>;

/** Group identity images use the same private bucket but can never be PDFs. */
export const CommunityGroupImageUploadSchema = z
  .object({
    kind: z.literal("image"),
    name: attachmentDisplayName.refine(
      (name) => /\.(?:jpe?g|png|webp)$/i.test(name),
      "Image name must end in .jpg, .jpeg, .png, or .webp",
    ),
    mime: z.enum(COMMUNITY_IMAGE_MIME_TYPES),
    size: z.number().int().positive().max(COMMUNITY_IMAGE_MAX_BYTES),
  })
  .strict();
export type CommunityGroupImageUploadDto = z.infer<
  typeof CommunityGroupImageUploadSchema
>;

function attachmentBody(
  schema:
    | typeof CommunityImageAttachmentSchema
    | typeof CommunityFileAttachmentSchema,
) {
  return z
    .string()
    .trim()
    .min(1)
    .max(4096)
    .transform((raw, context) => {
      let decoded: unknown;
      try {
        decoded = JSON.parse(raw);
      } catch {
        context.addIssue({
          code: "custom",
          message: "Attachment body must be valid JSON",
        });
        return z.NEVER;
      }

      const parsed = schema.safeParse(decoded);
      if (!parsed.success) {
        context.addIssue({
          code: "custom",
          message:
            parsed.error.issues[0]?.message ?? "Attachment metadata is invalid",
        });
        return z.NEVER;
      }

      const canonical = {
        url: parsed.data.url,
        name: parsed.data.name,
        mime: parsed.data.mime,
        size: parsed.data.size,
        ...(parsed.data.caption ? { caption: parsed.data.caption } : {}),
      };
      return JSON.stringify(canonical);
    });
}

const TextMessageSchema = z
  .object({
    kind: z.literal("text").optional(),
    body: z.string().trim().min(1).max(2000),
  })
  .strict();

const ImageMessageSchema = z
  .object({
    kind: z.literal("image"),
    body: attachmentBody(CommunityImageAttachmentSchema),
  })
  .strict();

const FileMessageSchema = z
  .object({
    kind: z.literal("file"),
    body: attachmentBody(CommunityFileAttachmentSchema),
  })
  .strict();

const OpportunityMessageSchema = z
  .object({
    kind: z.literal("opportunity"),
    opportunityId: z.string().uuid(),
    // A card can be shared in one click. Copy is optional and, when present,
    // is screened like any other member-authored text before it is stored.
    body: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const SendMessageSchema = z.union([
  TextMessageSchema,
  ImageMessageSchema,
  FileMessageSchema,
  OpportunityMessageSchema,
]);
export type SendMessageDto = z.infer<typeof SendMessageSchema>;

export const SendCommentSchema = z
  .object({ body: z.string().trim().min(1).max(2000) })
  .strict();
export type SendCommentDto = z.infer<typeof SendCommentSchema>;

export const PinMessageSchema = z.object({ pinned: z.boolean() }).strict();
export type PinMessageDto = z.infer<typeof PinMessageSchema>;

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
