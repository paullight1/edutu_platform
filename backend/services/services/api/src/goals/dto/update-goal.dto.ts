import { z } from "zod";
import { CreateGoalSchema } from "./create-goal.dto";

export const UpdateGoalSchema = CreateGoalSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one field must be provided" },
);

export type UpdateGoalDto = z.infer<typeof UpdateGoalSchema>;
