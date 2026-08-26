import { z } from "zod";

const OpportunityTextListSchema = z.array(z.string().max(1_000)).max(50);

export const CreateOpportunitySchema = z.object({
  title: z.string().min(1),
  summary: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  organization: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  type: z.string().optional().default("scholarship"),
  eligibilityCriteria: z.string().optional().nullable(),
  eligibility_criteria: z.string().optional().nullable(),
  fundingType: z.string().optional().nullable(),
  funding_type: z.string().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  target_region: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  source_url: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  applicationUrl: z.string().optional().nullable(),
  application_url: z.string().optional().nullable(),
  apply_url: z.string().optional().nullable(),
  link: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  image_url: z.string().optional().nullable(),
  eligibility: z.record(z.string(), z.unknown()).optional().nullable(),
  requirements: OpportunityTextListSchema.optional(),
  benefits: OpportunityTextListSchema.optional(),
  applicationProcess: OpportunityTextListSchema.optional(),
  application_process: OpportunityTextListSchema.optional(),
  skills: OpportunityTextListSchema.optional(),
  tags: OpportunityTextListSchema.optional(),
  isFeatured: z.boolean().optional().default(false),
  is_featured: z.boolean().optional(),
  isRemote: z.boolean().optional().default(true),
  is_remote: z.boolean().optional(),
  status: z.string().optional().default("pending_review"),
  qualityScore: z.number().min(0).max(100).optional().nullable(),
  quality_score: z.number().min(0).max(100).optional().nullable(),
  validationStatus: z.string().optional().nullable(),
  validation_status: z.string().optional().nullable(),
});

export type CreateOpportunityDto = z.infer<typeof CreateOpportunitySchema>;

export const UpdateOpportunitySchema = CreateOpportunitySchema.partial();

export type UpdateOpportunityDto = z.infer<typeof UpdateOpportunitySchema>;

export const BulkImportOpportunitySchema = CreateOpportunitySchema.extend({
  sourceUrl: z.string().min(1),
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

export const BulkVerifySchema = z.object({
  ids: BulkIdsField,
  dryRun: z.boolean().optional(),
});

export type BulkVerifyDto = z.infer<typeof BulkVerifySchema>;
