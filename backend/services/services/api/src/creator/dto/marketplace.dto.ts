import { z } from "zod";

const catalogLimit = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return 20;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return Math.min(Math.max(Math.trunc(parsed), 1), 50);
}, z.number().int().min(1).max(50));

export const MarketplaceCatalogQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(160).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    type: z.enum(["free", "paid", "credit", "course"]).optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: catalogLimit.optional(),
  })
  .strict();

export type MarketplaceCatalogQueryDto = z.infer<
  typeof MarketplaceCatalogQuerySchema
>;

export const MarketplaceReviewSchema = z
  .object({
    decision: z.enum(["approve", "reject"]),
    note: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export type MarketplaceReviewDto = z.infer<typeof MarketplaceReviewSchema>;
