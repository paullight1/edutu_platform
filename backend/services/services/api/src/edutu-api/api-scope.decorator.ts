import { SetMetadata } from "@nestjs/common";

export const EDUTU_API_SCOPE_KEY = "edutuApiScope";
export const ApiScope = (scope: string) =>
  SetMetadata(EDUTU_API_SCOPE_KEY, scope);
