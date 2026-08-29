import { z } from "zod";
import { OPPORTUNITY_ENHANCEMENT_FIELD_NAMES } from "./opportunity-enhancement-review";

export const OpportunityEnhancementFieldSchema = z.enum(
  OPPORTUNITY_ENHANCEMENT_FIELD_NAMES,
);

export const ApplyOpportunityEnhancementSchema = z.object({
  previewToken: z.string().min(20).max(200_000),
  selectedFields: z
    .array(OpportunityEnhancementFieldSchema)
    .min(1)
    .max(OPPORTUNITY_ENHANCEMENT_FIELD_NAMES.length),
  edits: z.record(z.string(), z.unknown()).optional(),
});

export type ApplyOpportunityEnhancementDto = z.infer<
  typeof ApplyOpportunityEnhancementSchema
>;
