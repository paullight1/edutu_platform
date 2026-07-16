import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
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

  /** Active Pro = profiles.is_pro (unexpired) OR an active pro entitlement. */
  async isPro(userId: string): Promise<boolean> {
    try {
      // profiles/billing_entitlements user_id may hold the raw auth subject
      // or the derived uuid — match both (see matchUserIdRef).
      const result = await db.execute(sql`
        select 1
        from profiles p
        where ${matchUserIdRef("p.user_id", userId)}
          and p.is_pro = true
          and (p.pro_expires_at is null or p.pro_expires_at > now())
        union all
        select 1
        from billing_entitlements e
        where ${matchUserIdRef("e.user_id", userId)}
          and e.feature_key = 'pro'
          and e.status = 'active'
          and (e.expires_at is null or e.expires_at > now())
        limit 1
      `);
      return ((result as { rows?: unknown[] }).rows ?? []).length > 0;
    } catch (error) {
      // Fail CLOSED for billing purposes: treat as non-Pro so the credit path
      // (which has its own hard checks) decides.
      this.logger.warn(
        `Pro lookup failed for ${userId}: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      return false;
    }
  }

  /**
   * Enforce and charge one AI action BEFORE it runs.
   * Order: Pro fair-use cap → free-tier daily chat allowance → credit debit.
   * Throws 429 (code "limit") when a daily cap is hit and 402
   * (code "insufficient_credits") when the balance can't cover the action.
   */
  async meter(userId: string, action: AiMeteredAction): Promise<MeterCharge> {
    if (!userId) {
      throw new UnauthorizedException("Sign in to use AI features");
    }

    const pricing = await this.getPricing();
    const cost = Math.max(0, Math.round(pricing.aiCosts[action] ?? 0));
    const pro = await this.isPro(userId);
    const isChat = action === "chatMessage";

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
      return { userId, action, charged: 0, ledgerId: null };
    }

    if (isChat) {
      const usage = await this.bumpDailyUsage(userId, 1, 0);
      if (usage.chatMessages <= pricing.freeTier.dailyChatMessages) {
        return { userId, action, charged: 0, ledgerId: null };
      }
      // Past the free allowance: chat costs credits like any other action.
    }

    if (cost === 0) {
      return { userId, action, charged: 0, ledgerId: null };
    }

    const ledgerId = await this.debitCredits(userId, cost, action, isChat);
    return { userId, action, charged: cost, ledgerId };
  }

  /** Best-effort compensation when the AI call fails after a debit. */
  async refund(charge: MeterCharge): Promise<void> {
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

  private async bumpDailyUsage(
    userId: string,
    chatDelta: number,
    creditDelta: number,
  ): Promise<{ chatMessages: number; actionCredits: number }> {
    const result = await db.execute(sql`
      insert into user_ai_usage_daily (user_id, day, chat_messages, action_credits)
      values (${userId}, current_date, ${chatDelta}, ${creditDelta})
      on conflict (user_id, day) do update set
        chat_messages = user_ai_usage_daily.chat_messages + ${chatDelta},
        action_credits = user_ai_usage_daily.action_credits + ${creditDelta},
        updated_at = now()
      returning chat_messages, action_credits
    `);
    const rows =
      (
        result as unknown as {
          rows?: Array<{ chat_messages: number; action_credits: number }>;
        }
      ).rows ?? [];
    return {
      chatMessages: Number(rows[0]?.chat_messages ?? 0),
      actionCredits: Number(rows[0]?.action_credits ?? 0),
    };
  }
}

class InsufficientCreditsError extends Error {}
