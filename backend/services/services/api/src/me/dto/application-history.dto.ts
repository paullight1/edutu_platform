import { z } from "zod";

export const AddApplicationReflectionSchema = z
  .object({
    reflection: z.string().trim().min(1).max(2000),
  })
  .strict();

export type AddApplicationReflectionDto = z.infer<
  typeof AddApplicationReflectionSchema
>;
