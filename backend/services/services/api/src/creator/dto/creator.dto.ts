import { z } from "zod";

export const CreatorApplicationSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  bio: z.string().trim().min(20).max(4000),
  contentType: z.string().trim().min(1).max(80),
  experience: z.string().trim().min(1).max(2000),
  sampleContentUrl: z.string().url().optional(),
});

export type CreatorApplicationDto = z.infer<typeof CreatorApplicationSchema>;

export const MarketplaceListingSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().min(1).max(80),
  type: z.enum(["free", "paid", "credit", "course"]).optional(),
  price: z.number().int().min(0).max(1_000_000).optional(),
  imageUrl: z.string().url().optional(),
  previewUrl: z.string().url().optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  eventDate: z.string().datetime().optional(),
  eventEndDate: z.string().datetime().optional(),
  eventLocation: z.string().trim().max(500).optional(),
  capacity: z.number().int().positive().max(100_000).optional(),
});

export type MarketplaceListingDto = z.infer<typeof MarketplaceListingSchema>;

export const CreatorReviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  adminNote: z.string().trim().max(2000).optional(),
});

export type CreatorReviewDto = z.infer<typeof CreatorReviewSchema>;
