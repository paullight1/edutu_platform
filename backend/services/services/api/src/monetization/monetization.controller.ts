import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth";
import { isUuid } from "../common/user-id";
import type { AiMeteredAction } from "./ai-metered.decorator";
import { AI_REMAINING_HEADER } from "./ai-metering.interceptor";
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
   * 503 (billing_unavailable) exactly like the interceptor, and — as of the
   * header contract — reports the remaining free allowance the same way, both
   * on X-Edutu-Ai-Remaining and (for callers that find headers awkward to read
   * through their HTTP client) as `remaining` in the body.
   *
   * Returns the charge's `ledgerId` (null when nothing was debited) so a caller
   * whose own work fails afterwards can compensate via POST meter/refund —
   * the interceptor path already refunds that identical failure, and voice
   * costs 5 credits a minute, so the asymmetry was user-visible money. The
   * handle is not a bearer token: refunding it requires owning it (see
   * MonetizationService.refundMeterCharge). Callers should still meter as LATE
   * as possible — immediately before the provider call.
   */
  @Post("meter")
  async meter(
    @CurrentUser("id") userId: string,
    @Body() body: { action?: AiMeteredAction; units?: number },
    @Res({ passthrough: true }) res?: Response,
  ) {
    const action = body?.action;
    if (!action || !METERED_ACTIONS.includes(action)) {
      throw new BadRequestException("Unknown metered action");
    }
    const charge = await this.monetization.meter(userId, action, body?.units);
    if (charge.remaining !== null) {
      res?.setHeader?.(AI_REMAINING_HEADER, String(charge.remaining));
    }
    // Additive only: the header and `remaining`/`charged` fields are unchanged.
    return {
      ok: true,
      charged: charge.charged,
      remaining: charge.remaining,
      ledgerId: charge.ledgerId,
    };
  }

  /**
   * Authorize server-side premium voice work. The authenticated identity is
   * the sole principal; `kind` selects a supported provider capability but
   * never changes which user is checked.
   */
  @Post("voice/authorize")
  async authorizeVoice(
    @CurrentUser("id") userId: string,
    @Body() body: { kind?: "stt" | "tts" | "realtime" },
  ) {
    const kind = body?.kind;
    if (kind !== "stt" && kind !== "tts" && kind !== "realtime") {
      throw new BadRequestException("Unknown premium voice kind");
    }
    await this.monetization.authorizeVoicePremium(userId);
    return { ok: true, kind };
  }

  /**
   * Hand back a charge taken by POST meter whose work then failed — the same
   * compensation the @AiMetered interceptor performs automatically for
   * in-pipeline routes.
   *
   * Safe to expose because the `ledgerId` is a lookup key, not a bearer token:
   * the service refunds only a ledger row OWNED by the authenticated caller,
   * and only once (unique `${ledgerId}:refund` row). A guessed uuid belongs to
   * nobody or to someone else and 404s. Replays return `refunded: false`
   * rather than an error, so a flaky client never retry-storms.
   */
  @Post("meter/refund")
  async refundMeter(
    @CurrentUser("id") userId: string,
    @Body() body: { ledgerId?: string },
  ) {
    const ledgerId =
      typeof body?.ledgerId === "string" ? body.ledgerId.trim() : "";
    if (!isUuid(ledgerId)) {
      throw new BadRequestException("Unknown charge");
    }
    const result = await this.monetization.refundMeterCharge(userId, ledgerId);
    return { ok: true, ...result };
  }
}
