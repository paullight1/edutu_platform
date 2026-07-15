import { z } from "zod";

const criteriaFields = {
  query: z.string().trim().max(200).optional(),
  category: z.string().trim().max(60).optional(),
  fundingType: z.string().trim().max(60).optional(),
  targetRegion: z.string().trim().max(80).optional(),
  remoteOnly: z.boolean().optional(),
};

const hasAnyCriterion = (dto: {
  query?: string;
  category?: string;
  fundingType?: string;
  targetRegion?: string;
  remoteOnly?: boolean;
}) =>
  Boolean(
    dto.query?.trim() ||
    dto.category?.trim() ||
    dto.fundingType?.trim() ||
    dto.targetRegion?.trim() ||
    dto.remoteOnly,
  );

export const CreateSavedSearchDtoSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    notifyEnabled: z.boolean().optional(),
    ...criteriaFields,
  })
  .refine(hasAnyCriterion, {
    message: "A saved search needs at least one criterion",
  });
export type CreateSavedSearchDto = z.infer<typeof CreateSavedSearchDtoSchema>;

export const UpdateSavedSearchDtoSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  notifyEnabled: z.boolean().optional(),
  ...criteriaFields,
});
export type UpdateSavedSearchDto = z.infer<typeof UpdateSavedSearchDtoSchema>;
