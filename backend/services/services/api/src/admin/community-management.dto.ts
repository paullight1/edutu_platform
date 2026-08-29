import { z } from "zod";
import {
  CreateGroupSchema,
  UpdateGroupSchema,
} from "../communities/dto/community.dto";

export const AdminCreateCommunitySchema = CreateGroupSchema.extend({
  opportunityId: z.string().uuid().optional(),
}).strict();
export type AdminCreateCommunityDto = z.infer<
  typeof AdminCreateCommunitySchema
>;

export const AdminUpdateCommunitySchema = UpdateGroupSchema.strict();
export type AdminUpdateCommunityDto = z.infer<
  typeof AdminUpdateCommunitySchema
>;

export const RejectCommunityCreationRequestSchema = z
  .object({
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
export type RejectCommunityCreationRequestDto = z.infer<
  typeof RejectCommunityCreationRequestSchema
>;

export const ReplaceTrendingCommunitiesSchema = z
  .object({
    groupIds: z.array(z.string().uuid()),
  })
  .strict()
  .superRefine(({ groupIds }, context) => {
    if (new Set(groupIds).size !== groupIds.length) {
      context.addIssue({
        code: "custom",
        path: ["groupIds"],
        message: "A community can appear in Trending only once.",
      });
    }
  });
export type ReplaceTrendingCommunitiesDto = z.infer<
  typeof ReplaceTrendingCommunitiesSchema
>;
