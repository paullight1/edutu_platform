import { SetMetadata } from "@nestjs/common";

export const EDUTU_API_PUBLIC_KEY = "edutuApiPublic";

export const EdutuApiPublic = () => SetMetadata(EDUTU_API_PUBLIC_KEY, true);
