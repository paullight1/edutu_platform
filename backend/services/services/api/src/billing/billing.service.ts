import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "../db";
import type {
  BillingInterval,
  BillingTransactionSummary,
  BillingStatus,
  CreateCheckoutDto,
} from "./dto/billing.dto";
import { SettingsService } from "../settings/settings.service";
import {
  CREDIT_PACK_LEDGER_RELATED_TYPE,
  recordCreditPurchaseInTransaction,
} from "./billing-credit-ledger.sql";
import {
  DEFAULT_ADMIN_SETTINGS,
  type PricingSettings,
} from "../settings/settings.dto";

const PRO_FEATURES = [
  "ai_roadmap",
  "ai_chat",
  "cv_builder",
  "premium_templates",
  "marketplace_premium",
  "creator_tools",
] as const;

// Fallback USD→NGN display rate if admin settings can't be read. The live value
// comes from admin_settings.pricing.usdToNgnRate (editable in the admin
// dashboard) — a reporting constant for folding USD mobile-store revenue into
// the NGN figures, NOT a live FX quote. $1 → ₦1000 (so $6.99 ≈ ₦6,990).
const DEFAULT_USD_TO_NGN = 1000;

// Revenue lives in two tables with DIFFERENT unit conventions:
//   • billing_transactions.amount  → MAJOR units (₦6,500 stored as 6500)
//   • payment_transactions.amount  → MINOR units ($6.99 stored as 699 cents)
// Both CTEs below emit NGN MAJOR units so sums and formatMoney line up, and both
// drop test money: Paystack test-mode rows (metadata.domain = 'test') and
// RevenueCat sandbox rows (metadata.environment = 'SANDBOX'). A normalised
// `env` column is exposed so callers can filter or label without re-deriving it.
// `rate` is the admin-configured USD→NGN factor, passed in per call.
const normalisedRevenueCte = (rate: number) => sql`
  normalised_tx as (
    -- Web / Paystack — amount already in major NGN units.
    select
      id, user_id, provider, provider_reference, type,
      round(
        amount * (case when upper(coalesce(currency, 'NGN')) = 'USD' then ${rate} else 1 end)
      )::bigint as amount,
      'NGN' as currency, status, metadata, created_at,
      lower(coalesce(metadata->>'domain', 'live')) as env
    from billing_transactions
    where lower(coalesce(metadata->>'domain', 'live')) <> 'test'
    union all
    -- Mobile / RevenueCat — amount in minor units (cents); /100 to major, then FX.
    select
      id, user_id, store as provider, transaction_id as provider_reference, type,
      round(
        amount / 100.0 * (case when upper(coalesce(currency, 'USD')) = 'USD' then ${rate} else 1 end)
      )::bigint as amount,
      'NGN' as currency, status, metadata, created_at,
      lower(coalesce(metadata->>'environment', 'production')) as env
    from payment_transactions
    where upper(coalesce(metadata->>'environment', 'PRODUCTION')) <> 'SANDBOX'
  )
`;

// Static per-plan metadata only. AMOUNTS come from admin_settings.pricing
// (single source of truth, editable in the admin monetization screen) so
// what the paywall shows is exactly what Paystack charges.
//
// periodDays MUST stay in lockstep with pay-edutu-org/src/lib/money.ts
// planDurationDays() — that service is the canonical entitlement writer, and a
// user can be granted Pro by either path. The grants are deliberately generous
// (31 / 366, not 30 / 365) so a renewal that lands a few hours late never
// leaves a paying user briefly locked out.
const PLAN_META: Record<
  BillingInterval,
  { label: string; envPlanCode: string; periodDays: number }
> = {
  weekly: {
    label: "Edutu Pro Weekly",
    envPlanCode: "PAYSTACK_PLAN_WEEKLY",
    periodDays: 7,
  },
  monthly: {
    label: "Edutu Pro Monthly",
    envPlanCode: "PAYSTACK_PLAN_MONTHLY",
    periodDays: 31,
  },
  yearly: {
    label: "Edutu Pro Yearly",
    envPlanCode: "PAYSTACK_PLAN_YEARLY",
    periodDays: 366,
  },
};

type BillingTransactionRow = {
  id: string;
  provider: string | null;
  provider_reference: string | null;
  type: string | null;
  amount: number | string | null;
  currency: string | null;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: Date | string | null;
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private supabase: SupabaseClient | null = null;

  constructor(private readonly settingsService: SettingsService) {}

  // Admin-controlled pricing (currency, plan amounts, credit packs, promo).
  private async getPricing(): Promise<PricingSettings> {
    const { settings } = await this.settingsService.getSettings();
    return settings.pricing ?? DEFAULT_ADMIN_SETTINGS.pricing;
  }

  // Admin-configured USD→NGN display rate, guarded to a sane positive number so
  // a bad stored value can never blow up (or zero out) the revenue conversion.
  private usdToNgnRate(pricing: PricingSettings): number {
    const rate = Number((pricing as { usdToNgnRate?: number }).usdToNgnRate);
    return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_USD_TO_NGN;
  }

  private planAmount(pricing: PricingSettings, plan: BillingInterval): number {
    const base =
      plan === "weekly"
        ? pricing.weeklyPrice
        : plan === "yearly"
          ? pricing.yearlyPrice
          : pricing.monthlyPrice;
    if (!pricing.promo?.active) return base;
    const promo =
      plan === "weekly"
        ? pricing.promo.weeklyPrice
        : plan === "yearly"
          ? pricing.promo.yearlyPrice
          : pricing.promo.monthlyPrice;
    return promo != null && promo > 0 ? promo : base;
  }

  async getStatus(userId: string): Promise<BillingStatus> {
    if (!userId) {
      throw new BadRequestException("Missing user id");
    }

    const supabase = this.getSupabase();
    let profile: any = null;
    let creditProfile: { credits?: number | null } | null = null;
    let activeEntitlements: any[] = [];
    let activeSubscription: any = null;
    let recentTransactions: BillingTransactionSummary[] = [];

    if (supabase) {
      // These four reads are independent — fetch them concurrently instead of
      // serially (was 4 sequential round-trips on a hot status endpoint).
      const [
        profileResult,
        entitlementResult,
        subscriptionResult,
        transactionResult,
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("is_pro, pro_since, pro_expires_at, credits")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("billing_entitlements")
          .select("feature_key, expires_at, status")
          .eq("user_id", userId)
          .eq("status", "active"),
        supabase
          .from("billing_subscriptions")
          .select("status, current_period_end")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("billing_transactions")
          .select(
            "id, provider, provider_reference, type, amount, currency, status, metadata, created_at",
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (profileResult.error) {
        this.logger.warn(
          `Unable to load billing profile for ${userId}: ${profileResult.error.message}`,
        );
      } else {
        profile = profileResult.data;
      }

      if (!entitlementResult.error) {
        const now = Date.now();
        activeEntitlements = (entitlementResult.data ?? []).filter((item) => {
          return !item.expires_at || new Date(item.expires_at).getTime() > now;
        });
      }

      if (!subscriptionResult.error) {
        activeSubscription = subscriptionResult.data;
      }

      if (!transactionResult.error) {
        recentTransactions = this.mapBillingTransactionRows(
          (transactionResult.data ?? []) as BillingTransactionRow[],
        );
      }
    }

    try {
      // Fallback read of the real balance column (profiles.credits) in case the
      // Supabase profile load above failed.
      const result = await db.execute(
        sql`select credits from profiles where user_id = ${userId} limit 1`,
      );
      const rows =
        (result as { rows?: Array<{ credits?: number | null }> }).rows ?? [];
      creditProfile = rows[0] ?? null;
    } catch (error) {
      this.logger.warn(
        `Unable to load API credits for ${userId}: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }

    const proExpiresAt =
      profile?.pro_expires_at ?? activeSubscription?.current_period_end ?? null;
    const profileProActive =
      Boolean(profile?.is_pro) &&
      (!proExpiresAt || new Date(proExpiresAt).getTime() > Date.now());
    const entitlementProActive = activeEntitlements.some(
      (item) => item.feature_key === "pro",
    );
    const isPro = profileProActive || entitlementProActive;
    const entitlements = new Set(
      activeEntitlements.map((item) => item.feature_key),
    );
    if (isPro) entitlements.add("pro");

    const featureAccess: Record<string, boolean> = {};
    for (const feature of PRO_FEATURES) {
      featureAccess[feature] = isPro || entitlements.has(feature);
    }

    return {
      isPro,
      proSince: profile?.pro_since ?? null,
      proExpiresAt,
      credits: Number(profile?.credits ?? creditProfile?.credits ?? 0),
      subscriptionStatus:
        activeSubscription?.status ?? (isPro ? "active" : null),
      entitlements: Array.from(entitlements),
      featureAccess,
      transactions: recentTransactions,
    };
  }

  /**
   * @deprecated SUPERSEDED BY pay.edutu.org.
   *
   * pay.edutu.org (the `pay-edutu-org` app) is now the canonical web checkout
   * and the reference implementation for every Paystack + entitlement write.
   * New paywall surfaces MUST link there — do not add callers to this method.
   *
   * It is kept alive (not deleted, route unchanged) only because live Paystack
   * transactions initialized through this endpoint may still be in flight, and
   * their `charge.success` webhooks land on handlePaystackWebhook below. Once
   * no legacy references remain outstanding this can be retired.
   */
  async createCheckout(
    userId: string,
    email: string | undefined,
    dto: CreateCheckoutDto,
  ) {
    if (!userId) throw new BadRequestException("Missing user id");
    if (!email) throw new BadRequestException("A billing email is required");

    const isApiCredits = dto.feature === "api_credits";
    const isCreditPack = dto.feature === "credits";
    const plan: BillingInterval =
      dto.plan === "yearly" || dto.plan === "weekly" ? dto.plan : "monthly";
    const meta = PLAN_META[plan];
    const pricing = await this.getPricing();
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const publicUrl =
      process.env.BILLING_PUBLIC_URL ||
      process.env.FRONTEND_URL ||
      process.env.ADMIN_URL ||
      "http://localhost:5173";

    if (!secretKey) {
      return {
        provider: "paystack",
        configured: false,
        message: "PAYSTACK_SECRET_KEY is not configured on the API server.",
      };
    }

    const reference = `edutu_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const callbackUrl = new URL("/billing/success", publicUrl);
    callbackUrl.searchParams.set("reference", reference);
    if (dto.returnTo) callbackUrl.searchParams.set("returnTo", dto.returnTo);

    // Amounts are resolved SERVER-SIDE from admin pricing — clients only name
    // a plan or a pack; they can never set the price they pay.
    let creditCount: number | null = null;
    let chargeAmount: number;
    if (isCreditPack) {
      const requested = Number(dto.credits ?? 0);
      const pack = (pricing.creditPacks ?? []).find(
        (p) => p.credits === requested,
      );
      if (!pack) {
        throw new BadRequestException(
          "Unknown credit pack. Pick one of the packs on the pricing page.",
        );
      }
      creditCount = pack.credits;
      chargeAmount = pack.price;
    } else if (isApiCredits) {
      // Legacy developer API top-up: ₦1 per credit.
      creditCount = Math.max(Number(dto.credits ?? 1000) || 1000, 1);
      chargeAmount = creditCount;
    } else {
      chargeAmount = this.planAmount(pricing, plan);
    }
    const amount = Math.round(chargeAmount * 100);

    const body: Record<string, unknown> = {
      email,
      amount,
      currency: pricing.currency || "NGN",
      reference,
      callback_url: callbackUrl.toString(),
      metadata: {
        user_id: userId,
        plan,
        feature: dto.feature ?? "pro",
        credits: creditCount,
        return_to: dto.returnTo ?? null,
      },
    };

    if (!isApiCredits && !isCreditPack) {
      const planCode = process.env[meta.envPlanCode];
      if (planCode) {
        body.plan = planCode;
      }
    }

    const response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    const result: any = await response.json().catch(() => null);
    if (!response.ok || !result?.status || !result?.data?.authorization_url) {
      this.logger.error(`Paystack checkout failed: ${JSON.stringify(result)}`);
      throw new InternalServerErrorException(
        "Unable to initialize payment checkout",
      );
    }

    await this.insertTransaction({
      user_id: userId,
      provider: "paystack",
      provider_reference: reference,
      type: isApiCredits || isCreditPack ? "credit_topup" : "subscription",
      amount: chargeAmount,
      currency: pricing.currency || "NGN",
      status: "pending",
      metadata: body.metadata,
    });

    return {
      provider: "paystack",
      configured: true,
      reference,
      authorizationUrl: result.data.authorization_url,
      accessCode: result.data.access_code,
    };
  }

  /**
   * @deprecated SUPERSEDED BY pay.edutu.org.
   *
   * The canonical Paystack webhook handler now lives in `pay-edutu-org`
   * (src/lib/entitlements.ts grantPro/recordPayment). This duplicate is kept —
   * endpoint and route intentionally unchanged — because a live Paystack
   * webhook may still be pointed at POST /billing/webhooks/paystack, and any
   * charge initialized by the deprecated createCheckout above will report here.
   * It therefore has to stay correct, not just present.
   *
   * Any change to entitlement maths here must be mirrored from grantPro() in
   * pay-edutu-org — that file is the source of truth, this is the follower.
   */
  async handlePaystackWebhook(
    rawBody: Buffer,
    payload: any,
    signature?: string,
  ) {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      throw new BadRequestException("Paystack is not configured");
    }

    if (
      !signature ||
      !this.verifyPaystackSignature(rawBody, signature, secretKey)
    ) {
      throw new BadRequestException("Invalid Paystack signature");
    }

    if (payload?.event !== "charge.success") {
      return { received: true, ignored: true };
    }

    const data = payload.data ?? {};
    const userId = data.metadata?.user_id;
    const plan: BillingInterval =
      data.metadata?.plan === "yearly" || data.metadata?.plan === "weekly"
        ? data.metadata.plan
        : "monthly";
    const reference = data.reference;
    const feature = data.metadata?.feature ?? "pro";

    if (!userId || !reference) {
      throw new BadRequestException("Webhook missing metadata");
    }

    if (feature === "api_credits" || feature === "credits") {
      const credits = Math.max(
        Number(
          data.metadata?.credits ?? Math.round(Number(data.amount ?? 0) / 100),
        ) || 0,
        1,
      );
      await this.recordCreditsPurchase({
        userId,
        credits,
        reference,
        payload: data,
        source:
          feature === "credits"
            ? CREDIT_PACK_LEDGER_RELATED_TYPE
            : "api_credit_purchase",
      });
      return { received: true };
    }

    const supabase = this.getSupabase();
    if (!supabase) {
      throw new InternalServerErrorException("Supabase is not configured");
    }

    // MONEY-CRITICAL: extend from whatever paid time is still left, never from
    // "now". This used to be `new Date()` + periodDays, which silently BURNED
    // paid time — a user with 300 days remaining who renewed (or re-bought)
    // was reset to 31. Mirrors grantPro() in pay-edutu-org/src/lib/entitlements.
    const periodStart = new Date();
    const periodEnd = this.addDays(
      await this.currentEntitlementFloor(supabase, userId, periodStart),
      PLAN_META[plan].periodDays,
    );

    await supabase.from("billing_transactions").upsert(
      {
        user_id: userId,
        provider: "paystack",
        provider_reference: reference,
        type: "subscription",
        amount: Math.round(Number(data.amount ?? 0) / 100),
        currency: data.currency ?? "NGN",
        status: "completed",
        metadata: data,
      },
      { onConflict: "provider,provider_reference" },
    );

    await supabase.from("billing_subscriptions").upsert(
      {
        user_id: userId,
        provider: "paystack",
        provider_customer_id: data.customer?.customer_code ?? null,
        provider_subscription_id:
          data.subscription?.subscription_code ?? reference,
        plan,
        status: "active",
        current_period_start: periodStart.toISOString(),
        // Same extended expiry as the entitlement below — all three writes
        // (subscription, entitlement, profile mirror) must agree or the status
        // endpoint's `pro_expires_at ?? current_period_end` fallback disagrees
        // with the row the mobile app actually reads.
        current_period_end: periodEnd.toISOString(),
        metadata: data,
      },
      { onConflict: "provider,provider_subscription_id" },
    );

    await supabase.from("billing_entitlements").upsert(
      {
        user_id: userId,
        feature_key: "pro",
        status: "active",
        source: "paystack",
        expires_at: periodEnd.toISOString(),
      },
      { onConflict: "user_id,feature_key" },
    );

    await supabase
      .from("profiles")
      .update({
        is_pro: true,
        pro_since: periodStart.toISOString(),
        pro_expires_at: periodEnd.toISOString(),
      })
      .eq("user_id", userId);

    return { received: true };
  }

  /**
   * Bachs webhook ingress. Bachs signs the exact raw body as
   * `${timestamp}.${rawBody}` with HMAC-SHA256. Keep this endpoint small and
   * authenticated at the boundary; event fulfillment is added once Bachs
   * product IDs and the production webhook secret are configured.
   */
  async handleBachsWebhook(
    rawBody: Buffer,
    payload: any,
    timestamp?: string,
    signature?: string,
  ) {
    const secret = process.env.BACHS_WEBHOOK_SECRET;
    if (!secret) {
      throw new BadRequestException("Bachs webhook is not configured");
    }

    if (
      !timestamp ||
      !signature ||
      !this.verifyBachsSignature(rawBody, timestamp, signature, secret)
    ) {
      throw new BadRequestException("Invalid Bachs webhook signature");
    }

    if (!payload?.id || !payload?.type) {
      throw new BadRequestException("Bachs webhook is missing event metadata");
    }

    this.logger.log(`Received Bachs webhook ${payload.type} (${payload.id})`);
    return { received: true, ignored: true };
  }

  // ─── Admin oversight: revenue, subscribers, credit flow, AI cost ────────
  async getAdminOverview() {
    // Fetch pricing up front — the USD→NGN rate it carries feeds the revenue
    // CTE, and it's returned to the client too (so only one settings read).
    const pricing = await this.getPricing();
    const revenueCte = normalisedRevenueCte(this.usdToNgnRate(pricing));

    const [revenue, subs, credits, topSpenders, aiUsage, recent] =
      await Promise.all([
        db.execute(sql`
          with ${revenueCte}
          select
            coalesce(sum(amount) filter (where created_at >= date_trunc('month', now())), 0) as month_revenue,
            coalesce(sum(amount) filter (where created_at >= now() - interval '30 days'), 0) as last_30d_revenue,
            coalesce(sum(amount), 0) as total_revenue,
            count(*) filter (where created_at >= now() - interval '30 days') as last_30d_count
          from normalised_tx
          where status = 'completed'
        `),
        db.execute(sql`
          select plan, count(*)::int as count
          from billing_subscriptions
          where status = 'active'
            and (current_period_end is null or current_period_end > now())
          group by plan
        `),
        db.execute(sql`
          select
            coalesce(sum(amount) filter (where type = 'purchase'), 0) as purchased,
            coalesce(sum(-amount) filter (where type = 'spend'), 0) as spent,
            coalesce(sum(amount) filter (where type in ('reward', 'admin_grant')), 0) as granted
          from credit_transactions
          where created_at >= now() - interval '30 days'
        `),
        db.execute(sql`
          select user_id, coalesce(sum(-amount), 0)::int as credits_spent
          from credit_transactions
          where type = 'spend' and created_at >= now() - interval '30 days'
          group by user_id
          order by credits_spent desc
          limit 10
        `),
        db.execute(sql`
          select
            coalesce(sum(chat_messages), 0)::int as chat_messages_today,
            coalesce(sum(action_credits), 0)::int as action_credits_today,
            count(distinct user_id)::int as active_ai_users_today
          from user_ai_usage_daily
          where day = current_date
        `),
        db.execute(sql`
          with ${revenueCte}
          select id, user_id, provider, provider_reference, type, amount,
                 currency, status, metadata, created_at
          from normalised_tx
          order by created_at desc
          limit 20
        `),
      ]);

    const rows = (r: unknown) => (r as { rows?: any[] }).rows ?? [];
    return {
      pricing,
      revenue: rows(revenue)[0] ?? {},
      activeSubscriptions: rows(subs),
      credits30d: rows(credits)[0] ?? {},
      topCreditSpenders30d: rows(topSpenders),
      aiUsageToday: rows(aiUsage)[0] ?? {},
      recentTransactions: rows(recent),
    };
  }

  async listAdminTransactions(limit = 50, offset = 0) {
    const capped = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = Math.max(Number(offset) || 0, 0);
    const revenueCte = normalisedRevenueCte(
      this.usdToNgnRate(await this.getPricing()),
    );
    const result = await db.execute(sql`
      with ${revenueCte}
      select id, user_id, provider, provider_reference, type, amount,
             currency, status, metadata, created_at
      from normalised_tx
      order by created_at desc
      limit ${capped} offset ${skip}
    `);
    return { transactions: (result as { rows?: any[] }).rows ?? [] };
  }

  // UTC-safe day arithmetic. setUTCDate (not setDate) so a renewal processed
  // either side of a DST boundary still grants exactly N days — matches
  // addDays() in pay-edutu-org/src/lib/money.ts.
  private addDays(from: Date, days: number): Date {
    const next = new Date(from);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  /**
   * The date a new billing period should be measured FROM: the user's existing
   * unexpired Pro expiry when they still have paid time left, otherwise `now`.
   *
   * Only an `active` entitlement whose expires_at is in the future counts —
   * a revoked/expired row must not resurrect dead time. A failed read falls
   * back to `now`: granting from today is the safe direction (worst case the
   * user is short-changed and support can top up) versus inventing time.
   */
  private async currentEntitlementFloor(
    supabase: SupabaseClient,
    userId: string,
    now: Date,
  ): Promise<Date> {
    try {
      const { data, error } = await supabase
        .from("billing_entitlements")
        .select("status, expires_at")
        .eq("user_id", userId)
        .eq("feature_key", "pro")
        .maybeSingle();

      if (error) {
        this.logger.warn(
          `Unable to read existing entitlement for ${userId}; extending from now: ${error.message}`,
        );
        return now;
      }

      if (data?.status !== "active" || !data?.expires_at) return now;
      const currentExpiry = new Date(data.expires_at);
      if (Number.isNaN(currentExpiry.getTime())) return now;
      return currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
    } catch (err) {
      this.logger.warn(
        `Entitlement lookup failed for ${userId}; extending from now: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
      return now;
    }
  }

  private getSupabase(): SupabaseClient | null {
    if (this.supabase) return this.supabase;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;

    this.supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.supabase;
  }

  private async insertTransaction(record: Record<string, unknown>) {
    const supabase = this.getSupabase();
    if (!supabase) return;

    const { error } = await supabase
      .from("billing_transactions")
      .upsert(record, {
        onConflict: "provider,provider_reference",
      });
    if (error) {
      this.logger.warn(
        `Unable to record billing transaction: ${error.message}`,
      );
    }
  }

  private async recordCreditsPurchase(input: {
    userId: string;
    credits: number;
    reference: string;
    payload: any;
    source: typeof CREDIT_PACK_LEDGER_RELATED_TYPE | "api_credit_purchase";
  }) {
    const supabase = this.getSupabase();
    if (!supabase) {
      throw new InternalServerErrorException("Supabase is not configured");
    }

    await supabase.from("billing_transactions").upsert(
      {
        user_id: input.userId,
        provider: "paystack",
        provider_reference: input.reference,
        type: "credit_topup",
        amount: input.credits,
        currency: input.payload.currency ?? "NGN",
        status: "completed",
        metadata: input.payload,
      },
      { onConflict: "provider,provider_reference" },
    );

    // Paystack retries webhooks, so the credit grant must be idempotent. Insert
    // the ledger row into credit_transactions (the real ledger) keyed by
    // (related_type, related_id) first; only credit profiles.credits when this
    // delivery actually inserted the row. Both writes share one transaction, and
    // set the app.credit_op guard flag so the profile trigger allows the update.
    await db.transaction(async (tx) => {
      const description =
        input.source === CREDIT_PACK_LEDGER_RELATED_TYPE
          ? `Credit pack purchase: +${input.credits}`
          : `API credit top-up: +${input.credits}`;
      await recordCreditPurchaseInTransaction(tx, {
        userId: input.userId,
        credits: input.credits,
        description,
        reference: input.reference,
        relatedType: input.source,
      });
    });
  }

  private mapBillingTransactionRows(
    rows: BillingTransactionRow[],
  ): BillingTransactionSummary[] {
    return rows.map((row) => {
      const amount = Number(row.amount ?? 0);
      return {
        id: row.id,
        provider: row.provider ?? "paystack",
        providerReference: row.provider_reference ?? null,
        type: row.type ?? "subscription",
        amount: Number.isFinite(amount) ? amount : 0,
        currency: row.currency ?? "NGN",
        status: row.status ?? "pending",
        description: this.describeBillingTransaction(row),
        createdAt: this.toIso(row.created_at),
      };
    });
  }

  private describeBillingTransaction(row: BillingTransactionRow) {
    const type = row.type ?? "subscription";
    if (type === "credit_topup") {
      const credits = Number(row.metadata?.credits ?? row.amount ?? 0);
      return Number.isFinite(credits) && credits > 0
        ? `Credit top-up for ${credits.toLocaleString()} credits`
        : "Credit top-up";
    }

    const metadataFeature = row.metadata?.feature;
    if (metadataFeature === "api_credits") {
      return "API credit checkout";
    }

    return "Subscription payment";
  }

  private toIso(value: Date | string | null | undefined) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  private verifyPaystackSignature(
    rawBody: Buffer,
    signature: string,
    secretKey: string,
  ): boolean {
    const digest = createHmac("sha512", secretKey)
      .update(rawBody)
      .digest("hex");
    const received = Buffer.from(signature, "hex");
    const expected = Buffer.from(digest, "hex");
    if (received.length !== expected.length) return false;
    return timingSafeEqual(received, expected);
  }

  private verifyBachsSignature(
    rawBody: Buffer,
    timestamp: string,
    signature: string,
    secret: string,
  ): boolean {
    const sentAt = Number(timestamp);
    if (!Number.isInteger(sentAt)) return false;
    if (Math.abs(Date.now() / 1000 - sentAt) > 300) return false;

    const digest = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody.toString("utf8")}`)
      .digest("hex");
    const received = Buffer.from(signature, "hex");
    const expected = Buffer.from(digest, "hex");
    if (received.length !== expected.length) return false;
    return timingSafeEqual(received, expected);
  }
}
