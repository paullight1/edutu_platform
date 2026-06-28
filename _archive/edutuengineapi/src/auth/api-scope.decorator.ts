import { SetMetadata } from "@nestjs/common";

export const EDUTU_ENGINE_API_SCOPE_KEY = "edutuEngineApiScope";

export function ApiScope(scope: string) {
  return SetMetadata(EDUTU_ENGINE_API_SCOPE_KEY, scope);
}

