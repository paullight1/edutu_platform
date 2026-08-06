import { z } from "zod";

/**
 * Edutu For You impact stories.
 *
 * `isComposite` defaults to TRUE on create. A story invented for illustration
 * and published without that flag is a fabricated testimonial, so the safe
 * value is the default and clearing it is a deliberate act by an admin who has
 * a real, consented story in hand.
 */

const chapterSchema = z.object({
  heading: z.string().min(1).max(160),
  body: z.array(z.string().min(1)).min(1),
});

const statSchema = z.object({
  value: z.string().min(1).max(40),
  label: z.string().min(1).max(160),
});

export const createImpactStorySchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
  name: z.string().min(1).max(120),
  age: z.number().int().min(10).max(99).nullable().optional(),
  place: z.string().min(1).max(160),
  outcome: z.string().min(1).max(120),
  portrait: z.string().url(),
  portraitAlt: z.string().min(1).max(300),
  heroImage: z.string().url(),
  heroAlt: z.string().min(1).max(300),
  quote: z.string().min(1).max(400),
  teaser: z.string().min(1).max(400),
  chapters: z.array(chapterSchema).default([]),
  stats: z.array(statSchema).max(6).default([]),
  barrier: z.string().max(400).nullable().optional(),
  isComposite: z.boolean().default(true),
  status: z.enum(["draft", "published"]).default("draft"),
  sortOrder: z.number().int().min(0).default(0),
});

export const updateImpactStorySchema = createImpactStorySchema.partial();

export type CreateImpactStoryDto = z.infer<typeof createImpactStorySchema>;
export type UpdateImpactStoryDto = z.infer<typeof updateImpactStorySchema>;
