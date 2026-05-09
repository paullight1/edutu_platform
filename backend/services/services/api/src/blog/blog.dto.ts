import { z } from 'zod';

export const createBlogPostSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(200),
  excerpt: z.string().max(500).optional(),
  content: z.string().min(1),
  coverImage: z.string().url().optional(),
  authorId: z.string().uuid(),
  authorName: z.string().min(1),
  authorAvatar: z.string().url().optional(),
  category: z
    .enum(['general', 'scholarships', 'jobs', 'mentorship', 'tips', 'news'])
    .default('general'),
  tags: z.array(z.string()).optional(),
  publishedAt: z.string().datetime().optional(),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  featured: z.boolean().default(false),
});

export const updateBlogPostSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).optional(),
  excerpt: z.string().max(500).optional(),
  content: z.string().min(1).optional(),
  coverImage: z.string().url().optional(),
  authorName: z.string().min(1).optional(),
  authorAvatar: z.string().url().optional(),
  category: z
    .enum(['general', 'scholarships', 'jobs', 'mentorship', 'tips', 'news'])
    .optional(),
  tags: z.array(z.string()).optional(),
  publishedAt: z.string().datetime().optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  featured: z.boolean().optional(),
});

export const createCommentSchema = z.object({
  postId: z.string().uuid(),
  content: z.string().min(1).max(2000),
  userId: z.string().uuid(),
  userName: z.string().min(1),
  userAvatar: z.string().url().optional(),
});

export type CreateBlogPostDto = z.infer<typeof createBlogPostSchema>;
export type UpdateBlogPostDto = z.infer<typeof updateBlogPostSchema>;
export type CreateCommentDto = z.infer<typeof createCommentSchema>;
