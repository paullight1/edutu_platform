import { z } from 'zod';

export const createOpportunitySchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(200),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  summary: z.string().max(500).optional(),
  organization: z.string().min(2).max(200),
  category: z.string().min(1),
  canonical_category: z.enum([
    'scholarships',
    'internships',
    'programs',
    'fellowships',
    'grants',
    'jobs',
    'competitions',
    'careers',
    'leadership',
    'global_programs',
    'other',
  ]).optional(),
  location: z.string().max(200).optional(),
  remote: z.boolean().optional(),
  close_date: z.string().datetime().optional(),
  application_url: z.string().url('Must be a valid URL').optional(),
  image_url: z.string().url().optional(),
  eligibility: z.string().optional(),
  requirements: z.string().optional(),
  benefits: z.string().optional(),
  award_amount: z.string().max(100).optional(),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']).optional(),
  status: z.enum(['active', 'draft', 'closed', 'needs_review']).optional(),
  featured: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const updateOpportunitySchema = createOpportunitySchema.partial();

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
