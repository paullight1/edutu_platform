import type {
  OpportunityPreferenceDto,
  RecommendationQueryDto,
} from "../../opportunities/dto/personalization.dto";
import { RecommendationQuerySchema } from "../../opportunities/dto/personalization.dto";
import { z } from "zod";

const emptyStringToUndefined = z.literal("").transform(() => undefined);
const optionalString = z
  .string()
  .trim()
  .min(1)
  .or(emptyStringToUndefined)
  .optional();
const optionalBooleanString = z.enum(["true", "false"]).optional();
const optionalDateString = z
  .string()
  .datetime()
  .or(z.string().date())
  .or(emptyStringToUndefined)
  .optional();

export const ListOpportunitiesQuerySchema = z.object({
  q: optionalString,
  category: optionalString,
  type: optionalString,
  fundingType: optionalString,
  targetRegion: optionalString,
  remote: optionalBooleanString,
  deadlineFrom: optionalDateString,
  deadlineTo: optionalDateString,
  updatedSince: optionalDateString,
  includeExpired: optionalBooleanString,
  includeTotal: optionalBooleanString,
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  sort: z
    .enum([
      "updated_desc",
      "updated_asc",
      "created_desc",
      "created_asc",
      "deadline_asc",
      "deadline_desc",
    ])
    .optional(),
});

export interface ListOpportunitiesQuery {
  q?: string;
  category?: string;
  type?: string;
  fundingType?: string;
  targetRegion?: string;
  remote?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  updatedSince?: string;
  includeExpired?: string;
  includeTotal?: string;
  limit?: string | number;
  offset?: string | number;
  sort?: string;
}

export const ThirdPartyRecommendationRequestSchema =
  RecommendationQuerySchema.extend({
    limit: z.number().int().min(1).max(50).optional(),
  });

export interface ThirdPartyRecommendationRequest extends Omit<
  RecommendationQueryDto,
  "preferences"
> {
  preferences?: OpportunityPreferenceDto | null;
}

export const PartnerEventSchema = z.object({
  eventType: z.enum([
    "impression",
    "view",
    "click",
    "save",
    "apply",
    "dismiss",
    "recommendation_shown",
  ]),
  opportunityId: z.string().uuid().optional(),
  externalUserId: z.string().trim().min(1).max(200).optional(),
  sessionId: z.string().trim().min(1).max(200).optional(),
  source: z.string().trim().min(1).max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type PartnerEventDto = z.infer<typeof PartnerEventSchema>;
