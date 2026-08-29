import { z } from "zod";
import { CreateGroupSchema } from "./community.dto";

export const CreateCommunityRequestSchema = CreateGroupSchema.strict();
export type CreateCommunityRequestDto = z.infer<
  typeof CreateCommunityRequestSchema
>;

export const UpdateCommunityRequestCoverSchema = z
  .object({
    coverImageResourceUrl: z
      .string()
      .url()
      .max(2048)
      .refine((value) => new URL(value).protocol === "https:", {
        message: "Community images must use HTTPS.",
      }),
  })
  .strict();
export type UpdateCommunityRequestCoverDto = z.infer<
  typeof UpdateCommunityRequestCoverSchema
>;

export type CommunityCreationSlotSummary = {
  used: number;
  limit: 2;
};
