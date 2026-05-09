import { z } from 'zod';

export const CreateOpportunitySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  type: z.string().optional().default('scholarship'),
  eligibilityCriteria: z.string().optional().nullable(),
  fundingType: z.string().optional().nullable(),
  targetRegion: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  sourceUrl: z.string().optional().nullable(),
  applyUrl: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  isRemote: z.boolean().optional().default(true),
  status: z.string().optional().default('pending'),
});

export type CreateOpportunityDto = z.infer<typeof CreateOpportunitySchema>;

export const UpdateOpportunitySchema = CreateOpportunitySchema.partial();

export type UpdateOpportunityDto = z.infer<typeof UpdateOpportunitySchema>;
