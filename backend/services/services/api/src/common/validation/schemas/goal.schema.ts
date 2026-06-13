import { z } from 'zod';

export const createGoalSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(150),
  description: z.string().max(1000).optional(),
  priority: z.enum(['High', 'Medium', 'Low']).default('Medium'),
  deadline: z.string().datetime().optional(),
  category: z.enum([
    'Scholarship',
    'Career',
    'Skill',
    'Education',
    'Personal',
    'Fellowship',
    'Internship',
  ]).optional(),
  progress: z.number().min(0).max(100).default(0),
  subtasks: z.array(z.object({
    text: z.string().min(1),
    completed: z.boolean().default(false),
  })).optional(),
  notes: z.array(z.object({
    text: z.string().min(1),
    timestamp: z.string().datetime(),
  })).optional(),
});

export const updateGoalSchema = createGoalSchema.partial();

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
