import { z } from "zod";

export const CreateOpportunitySchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  organization: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  type: z.string().optional().default("scholarship"),
  eligibilityCriteria: z.string().optional().nullable(),
  fundingType: z.string().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  applicationUrl: z.string().optional().nullable(),
  application_url: z.string().optional().nullable(),
  apply_url: z.string().optional().nullable(),
  link: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  eligibility: z.record(z.string(), z.unknown()).optional(),
  isFeatured: z.boolean().optional().default(false),
  isRemote: z.boolean().optional().default(true),
  status: z.string().optional().default("pending_review"),
});

export type CreateOpportunityDto = z.infer<typeof CreateOpportunitySchema>;

export const UpdateOpportunitySchema = CreateOpportunitySchema.partial();

export type UpdateOpportunityDto = z.infer<typeof UpdateOpportunitySchema>;

export const BulkImportOpportunitySchema = CreateOpportunitySchema.extend({
  sourceUrl: z.string().min(1),
  tags: z.array(z.string()).optional(),
}).passthrough();

export const BulkImportSchema = z.object({
  apiKey: z.string().optional(),
  items: z.array(BulkImportOpportunitySchema).min(1).max(100),
});

export type BulkImportDto = z.infer<typeof BulkImportSchema>;

// Admin bulk actions: ids are opportunity UUIDs, capped to keep updates bounded.
const BulkIdsField = z.array(z.string().uuid()).min(1).max(200);

export const BulkStatusSchema = z.object({
  ids: BulkIdsField,
  status: z.string().min(1),
});

export type BulkStatusDto = z.infer<typeof BulkStatusSchema>;

export const BulkCategorySchema = z.object({
  ids: BulkIdsField,
  category: z.string().min(1),
});

export type BulkCategoryDto = z.infer<typeof BulkCategorySchema>;

export const BulkIdsSchema = z.object({
  ids: BulkIdsField,
});

export type BulkIdsDto = z.infer<typeof BulkIdsSchema>;

// AI completion is synchronous and can include source-page retrieval plus
// provider retries. Keep each HTTP request short and reject duplicates so a
// client cannot spend twice on the same row within one batch.
const BulkEnhanceIdsField = z
  .array(z.string().uuid())
  .min(1)
  .max(3)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Opportunity IDs must be unique",
  });

export const BulkEnhanceSchema = z.object({
  ids: BulkEnhanceIdsField,
});

export type BulkEnhanceDto = z.infer<typeof BulkEnhanceSchema>;

export const BulkVerifySchema = z.object({
  ids: BulkIdsField,
  dryRun: z.boolean().optional(),
});

export type BulkVerifyDto = z.infer<typeof BulkVerifySchema>;
