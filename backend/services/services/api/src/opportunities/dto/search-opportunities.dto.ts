import { z } from "zod";

/**
 * Query DTO for the public GET /opportunities/search endpoint.
 * Query-string values arrive as strings, so limit/offset are coerced.
 */
export const SearchOpportunitiesSchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, "Search term must be at least 2 characters")
    .max(200, "Search term must be at most 200 characters"),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  offset: z.coerce.number().int().min(0).max(480).optional(),
  category: z.string().trim().min(1).max(100).optional(),
});

export type SearchOpportunitiesDto = z.infer<typeof SearchOpportunitiesSchema>;
