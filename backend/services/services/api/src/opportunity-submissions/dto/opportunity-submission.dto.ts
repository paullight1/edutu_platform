import { z } from "zod";

const MAX_EXTRA_KEYS = 20;

export function isSafeHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const protocol = new URL(value).protocol.toLowerCase();
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const SafeHttpUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine(isSafeHttpUrl, "URL must use http or https");

const SubmissionExtraSchema = z
  .record(
    z.string().trim().min(1).max(64),
    z.union([
      z.string().trim().max(500),
      z.number().refine(Number.isFinite, "Value must be finite"),
      z.boolean(),
      z.null(),
    ]),
  )
  .refine(
    (value) => Object.keys(value).length <= MAX_EXTRA_KEYS,
    `Extra metadata cannot contain more than ${MAX_EXTRA_KEYS} keys`,
  );

// A user proposing an opportunity for the Edutu catalog. Only `title` is truly
// required — the more they fill in, the less likely a "needs more info" query.
export const SubmitOpportunitySchema = z.object({
  title: z.string().trim().min(3).max(200),
  organization: z.string().trim().max(200).optional(),
  category: z.string().trim().max(80).optional(),
  type: z.string().trim().max(80).optional(),
  summary: z.string().trim().max(500).optional(),
  description: z.string().trim().max(6000).optional(),
  location: z.string().trim().max(200).optional(),
  isRemote: z.boolean().optional(),
  eligibility: z.string().trim().max(3000).optional(),
  benefits: z.string().trim().max(3000).optional(),
  deadline: z.string().datetime().optional(),
  applyUrl: SafeHttpUrlSchema.optional(),
  sourceUrl: SafeHttpUrlSchema.optional(),
  imageUrl: SafeHttpUrlSchema.optional(),
  extra: SubmissionExtraSchema.optional(),
}).strict();

export type SubmitOpportunityDto = z.infer<typeof SubmitOpportunitySchema>;

// User replying to a "needs more info" query from an admin.
export const RespondSubmissionSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  // Optionally patch fields at the same time (e.g. add the apply link they forgot).
  patch: SubmitOpportunitySchema.partial().optional(),
});

export type RespondSubmissionDto = z.infer<typeof RespondSubmissionSchema>;

// Admin decision on a submission.
export const ReviewSubmissionSchema = z.object({
  decision: z.enum(["approved", "rejected", "needs_info"]),
  adminNote: z.string().trim().max(4000).optional(),
});

export type ReviewSubmissionDto = z.infer<typeof ReviewSubmissionSchema>;
