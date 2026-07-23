import { z } from "zod";

export const BookmarkPrioritySchema = z.enum(["low", "medium", "high"]);

export const SaveBookmarkSchema = z
  .object({
    priority: BookmarkPrioritySchema.nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .default({});

export type SaveBookmarkDto = z.infer<typeof SaveBookmarkSchema>;

export const ApplicationStatusSchema = z.enum([
  "draft",
  "submitted",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  // Terminal: the org never replied and the user is closing the loop on their
  // own terms. Records an `outcome_ghosted` signal, never celebrated.
  "no_response",
]);

const applicationMetadataSchema = z.record(z.string(), z.unknown());

export const CreateApplicationSchema = z
  .object({
    opportunityId: z.string().uuid(),
    status: ApplicationStatusSchema.optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    metadata: applicationMetadataSchema.optional(),
  })
  .strict();

export type CreateApplicationDto = z.infer<typeof CreateApplicationSchema>;

export const UpdateApplicationSchema = z
  .object({
    status: ApplicationStatusSchema.optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    metadata: applicationMetadataSchema.optional(),
    // Free-text takeaway the user writes when resolving an application
    // (e.g. after a rejection). Rides along on the outcome signal so the
    // engine sees it — it is not stored on the application row.
    reflection: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one application field is required",
  });

export type UpdateApplicationDto = z.infer<typeof UpdateApplicationSchema>;
