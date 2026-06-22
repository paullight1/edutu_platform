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
  status: z.string().optional().default("pending"),
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
