import { BadRequestException, Body, Controller, Post } from "@nestjs/common";
import { CurrentUser } from "../auth";
import type { AiMeteredAction } from "./ai-metered.decorator";
import { MonetizationService } from "./monetization.service";

const METERED_ACTIONS: readonly AiMeteredAction[] = [
  "chatMessage",
  "roadmapGeneration",
  "copilotKit",
  "copilotAssist",
  "cvAi",
  "voicePerMinute",
];

@Controller("monetization")
export class MonetizationController {
  constructor(private readonly monetization: MonetizationService) {}

  /**
   * Enforce + charge one AI action for the authenticated user, mirroring the
   * global @AiMetered interceptor. This is the enforcement hook for callers that
   * run OUTSIDE the Nest request pipeline — specifically the Supabase chat-proxy
   * edge function, whose voice (STT/TTS) and chat-fallback paths would otherwise
   * serve unmetered AI. Reuses meter() so pricing/free-tier/Pro-cap logic stays
   * single-sourced. Throws 402 (insufficient_credits) / 429 (limit) /
   * 503 (billing_unavailable) exactly like the interceptor.
   */
  @Post("meter")
  async meter(
    @CurrentUser("id") userId: string,
    @Body() body: { action?: AiMeteredAction },
  ) {
    const action = body?.action;
    if (!action || !METERED_ACTIONS.includes(action)) {
      throw new BadRequestException("Unknown metered action");
    }
    const charge = await this.monetization.meter(userId, action);
    return { ok: true, charged: charge.charged };
  }
}
