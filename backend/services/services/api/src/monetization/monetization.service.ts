import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { matchUserIdRef } from "../common/user-id";
import { SettingsService } from "../settings/settings.service";
import {
  DEFAULT_ADMIN_SETTINGS,
  type PricingSettings,
} from "../settings/settings.dto";
import type { AiMeteredAction } from "./ai-metered.decorator";

export interface MeterCharge {
  userId: string;
  action: AiMeteredAction;
  // Credits actually debited (0 for Pro users and free-tier allowance).
  charged: number;
  ledgerId: string | null;
  /**
   * True when this action incremented today's chat-message counter, so a
   * failed turn can hand it back. It cannot ride the credit refund: an
   * in-allowance chat has charged: 0 / ledgerId: null and refund() returns
   * early for those.
   */
  chatCounted: boolean;
  /**
   * Action credits this action added to today's Pro fair-use counter, so a
   * failed turn can hand them back the same way `chatCounted` hands back a
   * chat message. Only the Pro path bumps `action_credits` (a non-Pro user
   * pays with real credits instead, compensated by the ledger refund below),
   * so this is 0 everywhere else. Without it a Pro user whose cvAi/copilotKit
   * turn failed kept the bump forever and walked into the daily cap early.
   */
  actionCredited?: number;
  /**
   * Started voice minutes reserved in the Pro daily voice counter. Voice is
   * tracked separately from generic action credits so one request cannot
   * spend both buckets, and the reservation can be released exactly once if
   * the provider call fails.
   */
  voiceMinutesCredited?: number;
  /**
   * Chat messages left in today's allowance (free tier or Pro fair use) after
   * this one, or null when the action isn't counted against a daily allowance
   * (non-chat actions, or chat already paid for with credits). Surfaced to
   * clients so they can warn at "1 left" instead of being cut off at 0.
   *
   * SEMANTICS CLIENTS MUST NOT GET WRONG: `remaining: 0` means "no FREE
   * allowance left", NOT "this user cannot chat". A free user past the
   * allowance who paid for this turn with credits also reports 0, and can keep
   * going for as long as their credit balance holds. Treat 0 as "show the
   * upgrade/top-up nudge", never as a hard client-side block — the server is
   * the only thing allowed to refuse a turn (402/429).
   */
  remaining: number | null;
  /**
   * The usage day (YYYY-MM-DD) the counter was incremented on, carried so a
   * rollback hits the row it actually bumped. A turn that starts at 23:59:58
   * and fails at 00:00:01 would otherwise decrement the NEW day's counter,
   * gifting the user a message. Null/absent when nothing was counted, or when
   * the driver did not return it — the rollback then falls back to current_date
   * exactly as it behaved before.
   */
  day?: string | null;
}

// A flat credit fee taken for a non-AI feature (e.g. the opportunity
// submission fee). Keep the value returned by chargeCredits so the caller can
// refundCredits if the feature fails after the debit.
export interface CreditCharge {
  userId: string;
  // e.g. "opportunity_submission_fee" — recorded as the ledger related_type.
  reason: string;
  charged: number;
  ledgerId: string | null;
}

const PRICING_CACHE_MS = 60_000;

// New users get their first N days of AI chat unmetered so the habit forms
// before the meter bites. Env-tunable (ops can flip without a redeploy);
// `0` disables the grace entirely; malformed → the 7-day default.
const DEFAULT_FREE_CHAT_GRACE_DAYS = 7;
// Voice is metered separately for STT and TTS, so a "5 minute" user turn can
// consume two provider-minute reservations. Keep the default deliberately
// conservative until production cost telemetry is available. Operators can
// lower or raise it per deployment with PRO_VOICE_DAILY_MINUTES, but the
// existing Pro action-credit ceiling remains a second hard upper bound.
const DEFAULT_PRO_VOICE_DAILY_MINUTES = 5;

function freeChatGraceDays(): number {
  const raw = process.env.FREE_CHAT_GRACE_DAYS;
  if (raw === undefined || raw === "") return DEFAULT_FREE_CHAT_GRACE_DAYS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : DEFAULT_FREE_CHAT_GRACE_DAYS;
}

function proVoiceDailyMinutes(): number {
  const raw = process.env.PRO_VOICE_DAILY_MINUTES;
  if (raw === undefined || raw === "") return DEFAULT_PRO_VOICE_DAILY_MINUTES;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 120
    ? parsed
    : DEFAULT_PRO_VOICE_DAILY_MINUTES;
}

@Injectable()
export class MonetizationService {
  private readonly logger = new Logger(MonetizationService.name);
  private pricingCache: { value: PricingSettings; at: number } | null = null;

  constructor(private readonly settingsService: SettingsService) {}

  async getPricing(): Promise<PricingSettings> {
    const now = Date.now();
    if (this.pricingCache && now - this.pricingCache.at < PRICING_CACHE_MS) {
      return this.pricingCache.value;
    }
    const { settings } = await this.settingsService.getSettings();
    const pricing = settings.pricing ?? DEFAULT_ADMIN_SETTINGS.pricing;
    this.pricingCache = { value: pricing, at: now };
    return pricing;
  }

  /** Active Pro is derived only from a current canonical billing entitlement. */
  async isPro(userId: string): Promise<boolean> {
    return (await this.loadBilling(userId)).isPro;
  }

  /**
   * Guard premium provider audio. This deliberately has a separate public
   * entry point from `isPro()`: callers that are about to mint premium TTS or
   * Realtime work must distinguish a valid non-Pro account (403) from a
   * failed billing lookup (503), and must never fall back to profile flags.
   */
  async authorizeVoicePremium(userId: string): Promise<void> {
    if (!userId) {
      throw new UnauthorizedException("Sign in to use premium voice");
    }

    const billing = await this.loadBilling(userId);
    if (!billing.available) {
      throw new HttpException(
        {
          code: "billing_unavailable",
          message: "Billing is temporarily unavailable. Please try again.",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!billing.isPro) {
      throw new ForbiddenException("Premium voice requires an active Pro plan");
    }
  }

  /**
   * Single profile+canonical-entitlement read backing metering decisions:
   * whether the user is Pro, plus the earliest profile `created_at` (for the
   * new-user chat grace). A split-profile user takes the OLDEST created_at
   * (min) so grace cannot be revived by a fresh duplicate row. `profiles` is
   * never an entitlement authority: its legacy `is_pro` flag is intentionally
   * absent from this query.
   *
   * Fails CLOSED on DB error: metering receives non-Pro and no grace, while
   * premium provider authorization receives an explicit 503.
   */
  private async loadBilling(
    userId: string,
  ): Promise<{ isPro: boolean; createdAt: Date | null; available: boolean }> {
    try {
      // profiles/billing_entitlements user_id may hold the raw auth subject
      // or the derived uuid — match both (see matchUserIdRef).
      const result = await db.execute(sql`
        select
          exists (
            select 1
            from billing_entitlements e
            where ${matchUserIdRef("e.user_id", userId)}
              and e.feature_key = 'pro'
              and e.status = 'active'
              and (e.expires_at is null or e.expires_at > now())
          ) as is_pro,
          min(p.created_at) as created_at
        from profiles p
        where ${matchUserIdRef("p.user_id", userId)}
      `);
      const rows =
        (
          result as unknown as {
            rows?: Array<{
              is_pro: boolean | null;
              created_at: string | Date | null;
            }>;
          }
        ).rows ?? [];
      const row = rows[0];
      const createdRaw = row?.created_at ?? null;
      const createdAt = createdRaw ? new Date(createdRaw) : null;
      return {
        isPro: row?.is_pro === true,
        createdAt:
          createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
        available: true,
      };
    } catch (error) {
      // Fail CLOSED for billing purposes: treat as non-Pro (the credit path has
      // its own hard checks) AND no grace (missing created_at ⇒ metering).
      this.logger.warn(
        `Billing lookup failed for ${userId}: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      return { isPro: false, createdAt: null, available: false };
    }
  }

  /**
   * True when a free user's first-N-days chat grace is still open. Guards
   * against a missing/null created_at (no grace) and clock skew (a future
   * created_at never grants grace), both consistent with failing toward the
   * meter.
   */
  private withinChatGrace(createdAt: Date | null): boolean {
    const days = freeChatGraceDays();
    if (days <= 0 || !createdAt) return false;
    const ageMs = Date.now() - createdAt.getTime();
    if (ageMs < 0) return false;
    return ageMs <= days * 24 * 60 * 60 * 1000;
  }

  /**
   * Enforce and charge one AI action BEFORE it runs.
   * Order: Pro fair-use cap → free-tier daily chat allowance → credit debit.
   * Throws 429 (code "limit") when a daily cap is hit and 402
   * (code "insufficient_credits") when the balance can't cover the action.
   */
  async meter(
    userId: string,
    action: AiMeteredAction,
    units?: number,
  ): Promise<MeterCharge> {
    if (!userId) {
      throw new UnauthorizedException("Sign in to use AI features");
    }

    const unitCount = this.validateMeterUnits(action, units);
    const pricing = await this.getPricing();
    const cost = Math.max(
      0,
      Math.round(pricing.aiCosts[action] ?? 0) * unitCount,
    );
    const billing = await this.loadBilling(userId);
    const { isPro: pro, createdAt } = billing;
    const isChat = action === "chatMessage";

    // Voice is a Pro-only provider capability. Keep this check in the
    // canonical backend meter as well as the edge function: a caller must not
    // be able to post directly to /monetization/meter and buy voice with
    // credits. Billing outages fail closed instead of accidentally opening a
    // paid provider path.
    if (action === "voicePerMinute") {
      if (!billing.available) {
        throw new HttpException(
          {
            code: "billing_unavailable",
            message: "Billing is temporarily unavailable. Please try again.",
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      if (!pro) {
        throw new ForbiddenException(
          "Premium voice requires an active Pro plan",
        );
      }

      const voiceUsage = await this.reserveVoiceMinutes(
        userId,
        unitCount,
        this.dailyVoiceMinuteLimit(pricing),
      );
      if (!voiceUsage) {
        throw new HttpException(
          {
            code: "limit",
            error: "voice_fair_use_exceeded",
            message:
              "You've reached today's voice limit. It resets at midnight.",
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      return {
        userId,
        action,
        charged: 0,
        ledgerId: null,
        chatCounted: false,
        actionCredited: 0,
        voiceMinutesCredited: unitCount,
        remaining: null,
        day: voiceUsage.day,
      };
    }

    if (pro) {
      const usage = await this.bumpDailyUsage(
        userId,
        isChat ? 1 : 0,
        isChat ? 0 : cost,
      );
      const overChat =
        isChat && usage.chatMessages > pricing.proFairUse.dailyChatMessages;
      const overActions =
        !isChat && usage.actionCredits > pricing.proFairUse.dailyActionCredits;
      if (overChat || overActions) {
        // The bump above already landed, and this request is being REFUSED —
        // leaving it would let rejected traffic inflate the counter further
        // past the cap, so a user who hits the wall stays walled for the rest
        // of the day even as earlier turns expire. Release what we just took.
        await this.releaseDailyUsage(
          userId,
          usage.day,
          isChat ? 1 : 0,
          isChat ? 0 : cost,
        );
        throw new HttpException(
          {
            code: "limit",
            error: "fair_use_exceeded",
            message:
              "You've reached today's fair-use limit. It resets at midnight.",
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return {
        userId,
        action,
        charged: 0,
        ledgerId: null,
        chatCounted: isChat,
        actionCredited: isChat ? 0 : cost,
        remaining: isChat
          ? Math.max(
              0,
              pricing.proFairUse.dailyChatMessages - usage.chatMessages,
            )
          : null,
        day: usage.day,
      };
    }

    // A chat message consumed from the daily allowance is counted up front, so
    // remember it: if the turn then fails, refund() hands the message back
    // instead of burning one of a free user's handful.
    let chatCounted = false;
    let chatDay: string | null = null;
    if (isChat) {
      const usage = await this.bumpDailyUsage(userId, 1, 0);
      chatCounted = true;
      chatDay = usage.day;
      // New-user grace: unmetered chat for the first N days so the habit forms
      // before the meter. Usage is still recorded above (observable) — we just
      // charge nothing, even past the daily free allowance. chatCounted/day
      // still travel so a failed graced turn refunds the counter like any other.
      if (this.withinChatGrace(createdAt)) {
        return {
          userId,
          action,
          charged: 0,
          ledgerId: null,
          chatCounted,
          remaining: Math.max(
            0,
            pricing.freeTier.dailyChatMessages - usage.chatMessages,
          ),
          day: chatDay,
        };
      }
      if (usage.chatMessages <= pricing.freeTier.dailyChatMessages) {
        return {
          userId,
          action,
          charged: 0,
          ledgerId: null,
          chatCounted,
          remaining: Math.max(
            0,
            pricing.freeTier.dailyChatMessages - usage.chatMessages,
          ),
          day: chatDay,
        };
      }
      // Past the free allowance: chat costs credits like any other action.
    }

    if (cost === 0) {
      return {
        userId,
        action,
        charged: 0,
        ledgerId: null,
        chatCounted,
        remaining: chatCounted ? 0 : null,
        day: chatDay,
      };
    }

    let ledgerId: string;
    try {
      ledgerId = await this.debitCredits(userId, cost, action, isChat);
    } catch (error) {
      // The counter was bumped before we knew the user could pay. A REFUSED
      // request must not consume allowance, so hand it back — but ONLY for a
      // refusal (402/429). A 503 billing outage is deliberately left alone:
      // fail-closed means an outage stays visible as an outage, and a silent
      // rollback there could mask a billing failure.
      if (chatCounted && isRefusal(error)) {
        await this.releaseDailyUsage(userId, chatDay, 1, 0);
      }
      throw error;
    }
    return {
      userId,
      action,
      charged: cost,
      ledgerId,
      chatCounted,
      remaining: chatCounted ? 0 : null,
      day: chatDay,
    };
  }

  /** Only voice uses variable, positive started-minute units. */
  private validateMeterUnits(action: AiMeteredAction, units?: number): number {
    if (units === undefined) {
      if (action === "voicePerMinute") {
        throw new BadRequestException(
          "Voice metering requires server-derived started-minute units",
        );
      }
      return 1;
    }
    if (
      action !== "voicePerMinute" ||
      typeof units !== "number" ||
      !Number.isInteger(units) ||
      units < 1 ||
      units > 120
    ) {
      throw new BadRequestException(
        "Units are only allowed for voicePerMinute and must be an integer from 1 to 120",
      );
    }
    return units;
  }

  /** Best-effort compensation when the AI call fails after a debit. */
  async refund(charge: MeterCharge): Promise<void> {
    // Independent of the credit refund below: a free-tier turn charges no
    // credits at all, and a Pro turn charges none either — the daily counter
    // IS the currency for both, so this is the only compensation they get.
    // `chatCounted` covers a chat message; `actionCredited` covers the Pro
    // action-credit bump (cvAi/copilotKit/…), which previously stuck forever.
    const chatDelta = charge.chatCounted ? 1 : 0;
    const creditDelta = Math.max(0, Math.round(charge.actionCredited ?? 0));
    const voiceDelta = Math.max(
      0,
      Math.round(charge.voiceMinutesCredited ?? 0),
    );
    if (chatDelta > 0 || creditDelta > 0 || voiceDelta > 0) {
      // Exactly-once: clear the markers SYNCHRONOUSLY (before any await) so a
      // second refund() of the same charge — retries, or two callers racing on
      // one failure — cannot release the same bump twice. A successful action
      // never reaches refund() at all.
      charge.chatCounted = false;
      charge.actionCredited = 0;
      charge.voiceMinutesCredited = 0;
      await this.releaseDailyUsage(
        charge.userId,
        charge.day ?? null,
        chatDelta,
        creditDelta,
        voiceDelta,
      );
    }
    if (!charge.charged || !charge.ledgerId) return;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.credit_op', 'on', true)`);
        await tx.execute(sql`
          insert into credit_transactions
            (user_id, amount, type, description, related_id, related_type)
          values
            (${charge.userId}, ${charge.charged}, 'refund',
             ${`Refund: ${charge.action} failed`},
             ${`${charge.ledgerId}:refund`}, 'ai_action_refund')
        `);
        await tx.execute(sql`
          update profiles
          set credits = credits + ${charge.charged}, updated_at = now()
          where ctid = (
            select ctid from profiles
            where ${matchUserIdRef("user_id", charge.userId)}
            order by coalesce(credits, 0) desc
            limit 1
          )
        `);
      });
    } catch (error) {
      this.logger.error(
        `Failed to refund ${charge.charged} credits to ${charge.userId}: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
    }
  }

  /**
   * Compensate an out-of-pipeline charge (POST /monetization/meter) whose work
   * failed after the debit, addressed by the `ledgerId` that charge returned.
   *
   * NOT forgeable, and not a token subsystem: the handle is only a lookup key.
   * Two checks stand between it and a credit:
   *   1. OWNERSHIP — the `ai_action` spend row must exist AND its `user_id`
   *      must match the authenticated caller (dual-keyed like every other
   *      profile read). A randomUUID belonging to someone else, or to nobody,
   *      finds no row and 404s; guessing one is a 122-bit search that only
   *      ever yields *your own* already-refunded charge.
   *   2. UNIQUENESS — the compensation is written as `${ledgerId}:refund`,
   *      which the `credit_transactions_ai_action_idem` unique index makes
   *      insertable exactly once. The profile credit only moves when that
   *      insert actually inserts, so replaying the same handle is a no-op
   *      rather than an income stream.
   *
   * Idempotent by design: a repeat returns `{ refunded: false }` with 200
   * instead of an error, so a client retrying a flaky network call does not
   * fall into a retry storm against an endpoint that already did its job.
   */
  async refundMeterCharge(
    userId: string,
    ledgerId: string,
  ): Promise<{ refunded: boolean; credits: number }> {
    if (!userId) {
      throw new UnauthorizedException("Sign in to continue");
    }

    let charged = 0;
    try {
      const result = await db.execute(sql`
        select amount
        from credit_transactions
        where related_id = ${ledgerId}
          and related_type = 'ai_action'
          and ${matchUserIdRef("user_id", userId)}
        limit 1
      `);
      const rows =
        (result as unknown as { rows?: Array<{ amount: number | string }> })
          .rows ?? [];
      if (rows.length === 0) {
        throw new UnknownChargeError();
      }
      charged = Math.abs(Math.round(Number(rows[0]?.amount ?? 0)));
    } catch (error) {
      if (error instanceof UnknownChargeError) {
        // Same answer for "no such charge" and "not yours": never confirm that
        // another user's ledger id exists.
        throw new NotFoundException("Unknown charge");
      }
      this.logger.error(
        `Refund lookup failed for ${userId}/${ledgerId}: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      throw new HttpException(
        {
          code: "billing_unavailable",
          message: "Billing is temporarily unavailable. Please try again.",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (charged <= 0) {
      // A free-tier / in-allowance charge cost nothing; nothing to hand back.
      return { refunded: false, credits: 0 };
    }

    try {
      let inserted = false;
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.credit_op', 'on', true)`);
        const written = await tx.execute(sql`
          insert into credit_transactions
            (user_id, amount, type, description, related_id, related_type)
          values
            (${userId}, ${charged}, 'refund',
             ${"Refund: metered action failed"},
             ${`${ledgerId}:refund`}, 'ai_action_refund')
          on conflict do nothing
          returning id
        `);
        inserted = ((written as { rows?: unknown[] }).rows ?? []).length > 0;
        // Only move credits when the ledger row was actually written — the
        // unique index is what makes a replayed handle a no-op.
        if (!inserted) return;
        await tx.execute(sql`
          update profiles
          set credits = credits + ${charged}, updated_at = now()
          where ctid = (
            select ctid from profiles
            where ${matchUserIdRef("user_id", userId)}
            order by coalesce(credits, 0) desc
            limit 1
          )
        `);
      });
      return { refunded: inserted, credits: inserted ? charged : 0 };
    } catch (error) {
      this.logger.error(
        `Failed to refund ${charged} credits for ${userId}/${ledgerId}: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      // Surface the failure so the caller can retry — the retry is safe.
      throw new HttpException(
        {
          code: "billing_unavailable",
          message: "Billing is temporarily unavailable. Please try again.",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** Highest credit balance across the user's (possibly split) profile rows. */
  async getCreditBalance(userId: string): Promise<number> {
    try {
      const result = await db.execute(sql`
        select coalesce(max(coalesce(credits, 0)), 0) as balance
        from profiles
        where ${matchUserIdRef("user_id", userId)}
      `);
      const rows =
        (result as unknown as { rows?: Array<{ balance: number | string }> })
          .rows ?? [];
      return Number(rows[0]?.balance ?? 0);
    } catch {
      return 0;
    }
  }

  /**
   * Charge a flat, admin-controlled credit fee for a non-AI feature. Same
   * ledger (credit_transactions) + profile debit as AI metering — NOT a
   * parallel accounting path. cost <= 0 is a free no-op. Throws 402 with a
   * machine-readable { error: "insufficient_credits", required, balance }
   * body when the balance can't cover the fee, 503 on billing outage (fail
   * closed).
   */
  async chargeCredits(
    userId: string,
    cost: number,
    reason: string,
    description: string,
  ): Promise<CreditCharge> {
    if (!userId) {
      throw new UnauthorizedException("Sign in to continue");
    }
    const amount = Math.max(0, Math.round(cost));
    if (amount === 0) {
      return { userId, reason, charged: 0, ledgerId: null };
    }

    const ledgerId = randomUUID();
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.credit_op', 'on', true)`);

        // Same one-row ctid debit as debitCredits: a user can have a raw- and
        // a derived-keyed profile row, and an unbounded UPDATE would drain
        // both pools.
        const updated = await tx.execute(sql`
          update profiles
          set credits = credits - ${amount}, updated_at = now()
          where ctid = (
            select ctid from profiles
            where ${matchUserIdRef("user_id", userId)}
              and coalesce(credits, 0) >= ${amount}
            order by coalesce(credits, 0) desc
            limit 1
          )
          returning credits
        `);
        const rows = (updated as { rows?: unknown[] }).rows ?? [];
        if (rows.length === 0) {
          throw new InsufficientCreditsError();
        }

        await tx.execute(sql`
          insert into credit_transactions
            (user_id, amount, type, description, related_id, related_type)
          values
            (${userId}, ${-amount}, 'spend', ${description},
             ${ledgerId}, ${reason})
        `);
      });
      return { userId, reason, charged: amount, ledgerId };
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        const balance = await this.getCreditBalance(userId);
        throw new HttpException(
          {
            code: "insufficient_credits",
            error: "insufficient_credits",
            required: amount,
            balance,
            message: `You need ${amount} credits for this (your balance is ${balance}). Buy a credit pack to continue.`,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      this.logger.error(
        `Credit charge failed for ${userId}/${reason}: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      // Fail CLOSED: a billing outage must not make paid features free.
      throw new HttpException(
        {
          code: "billing_unavailable",
          message: "Billing is temporarily unavailable. Please try again.",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** Best-effort compensation when the feature fails after the fee was taken. */
  async refundCredits(charge: CreditCharge): Promise<void> {
    if (!charge.charged || !charge.ledgerId) return;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.credit_op', 'on', true)`);
        await tx.execute(sql`
          insert into credit_transactions
            (user_id, amount, type, description, related_id, related_type)
          values
            (${charge.userId}, ${charge.charged}, 'refund',
             ${`Refund: ${charge.reason} failed`},
             ${`${charge.ledgerId}:refund`}, ${`${charge.reason}_refund`})
        `);
        await tx.execute(sql`
          update profiles
          set credits = credits + ${charge.charged}, updated_at = now()
          where ctid = (
            select ctid from profiles
            where ${matchUserIdRef("user_id", charge.userId)}
            order by coalesce(credits, 0) desc
            limit 1
          )
        `);
      });
    } catch (error) {
      this.logger.error(
        `Failed to refund ${charge.charged} credits (${charge.reason}) to ${charge.userId}: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
    }
  }

  private async debitCredits(
    userId: string,
    cost: number,
    action: AiMeteredAction,
    isChat: boolean,
  ): Promise<string> {
    const ledgerId = randomUUID();
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.credit_op', 'on', true)`);

        // Dual-key the lookup, but debit exactly one row: a user can have a
        // raw-keyed and a derived-keyed profile row (split-profile legacy),
        // and an unbounded UPDATE would drain both pools.
        const updated = await tx.execute(sql`
          update profiles
          set credits = credits - ${cost}, updated_at = now()
          where ctid = (
            select ctid from profiles
            where ${matchUserIdRef("user_id", userId)}
              and coalesce(credits, 0) >= ${cost}
            order by coalesce(credits, 0) desc
            limit 1
          )
          returning credits
        `);
        const rows = (updated as { rows?: unknown[] }).rows ?? [];
        if (rows.length === 0) {
          throw new InsufficientCreditsError();
        }

        await tx.execute(sql`
          insert into credit_transactions
            (user_id, amount, type, description, related_id, related_type)
          values
            (${userId}, ${-cost}, 'spend',
             ${`AI: ${action} (${cost} credits)`},
             ${ledgerId}, 'ai_action')
        `);
      });
      return ledgerId;
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        // Chat clients render 429 code "limit" as the upgrade banner; other
        // features expect 402 payment-required semantics.
        throw new HttpException(
          {
            code: isChat ? "limit" : "insufficient_credits",
            error: "insufficient_credits",
            required: cost,
            message:
              "Not enough credits. Buy a credit pack or upgrade to Pro to continue.",
          },
          isChat ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.PAYMENT_REQUIRED,
        );
      }
      this.logger.error(
        `Credit debit failed for ${userId}/${action}: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      // Fail CLOSED: a metering outage must not become free unlimited AI.
      throw new HttpException(
        {
          code: "billing_unavailable",
          message: "Billing is temporarily unavailable. Please try again.",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Hands back a daily-usage increment after a failed or REFUSED action.
   * Best-effort (never throws): a lost rollback costs the user one message,
   * while a throw here would mask the real error. Never inserts a row and
   * never goes below zero. Targets the day the bump landed on (`day`) rather
   * than current_date, so a turn spanning midnight cannot credit the new day.
   */
  private async releaseDailyUsage(
    userId: string,
    day: string | null,
    chatDelta: number,
    creditDelta: number,
    voiceDelta = 0,
  ): Promise<void> {
    if (chatDelta <= 0 && creditDelta <= 0 && voiceDelta <= 0) return;
    try {
      const dayRef = day ? sql`${day}::date` : sql`current_date`;
      await db.execute(sql`
        update user_ai_usage_daily
        set chat_messages = greatest(chat_messages - ${chatDelta}, 0),
            action_credits = greatest(action_credits - ${creditDelta}, 0),
            voice_minutes = greatest(voice_minutes - ${voiceDelta}, 0),
            updated_at = now()
        where user_id = ${userId} and day = ${dayRef}
      `);
    } catch (error) {
      this.logger.warn(
        `Failed to release daily usage for ${userId}: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
    }
  }

  private async bumpDailyUsage(
    userId: string,
    chatDelta: number,
    creditDelta: number,
  ): Promise<{
    chatMessages: number;
    actionCredits: number;
    day: string | null;
  }> {
    const result = await db.execute(sql`
      insert into user_ai_usage_daily (user_id, day, chat_messages, action_credits)
      values (${userId}, current_date, ${chatDelta}, ${creditDelta})
      on conflict (user_id, day) do update set
        chat_messages = user_ai_usage_daily.chat_messages + ${chatDelta},
        action_credits = user_ai_usage_daily.action_credits + ${creditDelta},
        updated_at = now()
      returning day, chat_messages, action_credits
    `);
    const rows =
      (
        result as unknown as {
          rows?: Array<{
            day?: unknown;
            chat_messages: number;
            action_credits: number;
          }>;
        }
      ).rows ?? [];
    return {
      chatMessages: Number(rows[0]?.chat_messages ?? 0),
      actionCredits: Number(rows[0]?.action_credits ?? 0),
      day: normalizeUsageDay(rows[0]?.day),
    };
  }

  /**
   * Atomically reserve started voice minutes for a Pro user. The conditional
   * `on conflict ... where` is important: separate read-then-write checks can
   * overspend the daily cap when two audio turns start together. A zero-row
   * result means the reservation was refused and no rollback is necessary.
   */
  private async reserveVoiceMinutes(
    userId: string,
    minutes: number,
    dailyLimit: number,
  ): Promise<{ day: string | null } | null> {
    // The conflict predicate protects an existing row; this guard protects
    // the first insert, for which PostgreSQL has no conflict branch to run.
    if (minutes > dailyLimit) return null;
    const result = await db.execute(sql`
      insert into user_ai_usage_daily
        (user_id, day, chat_messages, action_credits, voice_minutes)
      values (${userId}, current_date, 0, 0, ${minutes})
      on conflict (user_id, day) do update set
        voice_minutes = user_ai_usage_daily.voice_minutes + ${minutes},
        updated_at = now()
      where user_ai_usage_daily.voice_minutes + ${minutes} <= ${dailyLimit}
      returning day
    `);
    const rows =
      (result as unknown as { rows?: Array<{ day?: unknown }> }).rows ?? [];
    if (rows.length === 0) return null;
    return { day: normalizeUsageDay(rows[0]?.day) };
  }

  /**
   * The daily reservation is deliberately conservative: 5 provider minutes
   * per day by default (roughly 35/week, 150/30-day month, or 1,825/year
   * before a user changes plans). STT and TTS each reserve their own started
   * minutes, so a complete turn normally consumes two units. Operators can
   * lower the cap with PRO_VOICE_DAILY_MINUTES; pricing action credits remain
   * a second hard upper bound. The cap is minute-based and never trusts a
   * client-reported duration.
   */
  private dailyVoiceMinuteLimit(pricing: PricingSettings): number {
    const fairUseCredits = Math.max(
      0,
      Math.floor(pricing.proFairUse.dailyActionCredits),
    );
    const perMinuteCost = Math.max(
      0,
      Math.round(pricing.aiCosts.voicePerMinute),
    );
    const actionCreditLimit = perMinuteCost > 0
      ? Math.floor(fairUseCredits / perMinuteCost)
      : fairUseCredits;
    return Math.min(proVoiceDailyMinutes(), actionCreditLimit);
  }
}

class InsufficientCreditsError extends Error {}
/** No `ai_action` ledger row with that id belongs to the caller. */
class UnknownChargeError extends Error {}

/** `day` comes back as a Date or a "YYYY-MM-DD" string depending on the driver. */
function normalizeUsageDay(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" && value) return value.slice(0, 10);
  return null;
}

/**
 * True when the error is the metering path REFUSING the request (402/429) as
 * opposed to a billing outage (503). Only a refusal earns a counter rollback:
 * fail-closed requires an outage to stay an outage.
 */
function isRefusal(error: unknown): boolean {
  if (!(error instanceof HttpException)) return false;
  const status = error.getStatus();
  return (
    status === (HttpStatus.PAYMENT_REQUIRED as number) ||
    status === (HttpStatus.TOO_MANY_REQUESTS as number)
  );
}
