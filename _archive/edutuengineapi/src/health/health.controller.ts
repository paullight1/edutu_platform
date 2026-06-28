import { Controller, Get } from "@nestjs/common";
import { getConfiguredEngineApiKeys } from "../auth/api-key.guard.js";
import { Public } from "../auth/public.decorator.js";

@Controller(["health", "v1/health"])
export class HealthController {
  @Public()
  @Get()
  health() {
    return {
      status: "ok",
      service: "edutuengineapi",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      checks: {
        apiKeysConfigured: getConfiguredEngineApiKeys().length > 0,
        deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
        supabaseConfigured: Boolean(
          process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
        ),
      },
    };
  }
}
