// supabase/functions/revenuecat-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SECURITY_HEADERS = {
  "Content-Type": "application/json",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Fallback pass length when the admin config can't be read — mirrors the backend
// PricingSettingsSchema default (durationDays 90) so grants stay sane offline.
const SEASON_FALLBACK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

type ProviderEventStatus = "received" | "processing" | "failed" | "processed";

export function shouldProcessProviderEvent(
  status: string | null | undefined,
): boolean {
  return status !== "processed";
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function claimProviderEvent(
  client: SupabaseClientLike,
  eventId: string,
  eventType: string,
  userId: string,
  environment: "sandbox" | "live",
  rawBody: string,
): Promise<boolean> {
  const { error: insertError } = await client.from("billing_provider_events")
    .insert({
      provider: "revenuecat",
      environment,
      event_id: eventId,
      event_type: eventType,
      status: "received",
      payload_hash: await sha256(rawBody),
      raw_payload: JSON.parse(rawBody),
    });
  if (!insertError) return true;
  if (insertError.code !== "23505") {
    throw new Error(
      `Failed to persist RevenueCat event receipt: ${insertError.message}`,
    );
  }

  const { data: existing, error: readError } = await client
    .from("billing_provider_events")
    .select("status,attempt_count")
    .eq("provider", "revenuecat")
    .eq("environment", environment)
    .eq("event_id", eventId)
    .maybeSingle();
  if (readError || !existing) {
    throw new Error(
      `Failed to read RevenueCat event receipt: ${
        readError?.message ?? "missing duplicate receipt"
      }`,
    );
  }
  if (!shouldProcessProviderEvent(existing.status)) return false;

  const { error: reclaimError } = await client
    .from("billing_provider_events")
    .update({
      status: "processing",
      attempt_count: (existing.attempt_count ?? 0) + 1,
      last_error: null,
      next_retry_at: null,
    })
    .eq("provider", "revenuecat")
    .eq("environment", environment)
    .eq("event_id", eventId);
  if (reclaimError) {
    throw new Error(
      `Failed to reclaim RevenueCat event: ${reclaimError.message}`,
    );
  }
  return true;
}

async function markProviderEvent(
  client: SupabaseClientLike,
  eventId: string,
  environment: "sandbox" | "live",
  status: Extract<ProviderEventStatus, "processed" | "failed">,
  error?: unknown,
): Promise<void> {
  const update = status === "processed"
    ? {
      status,
      processed_at: new Date().toISOString(),
      last_error: null,
      next_retry_at: null,
    }
    : {
      status,
      last_error: error instanceof Error
        ? error.message.slice(0, 500)
        : "Webhook processing failed",
      next_retry_at: new Date().toISOString(),
    };
  const { error: updateError } = await client
    .from("billing_provider_events")
    .update(update)
    .eq("provider", "revenuecat")
    .eq("environment", environment)
    .eq("event_id", eventId);
  if (updateError) {
    throw new Error(
      `Failed to update RevenueCat event receipt: ${updateError.message}`,
    );
  }
}

/**
 * The season-pass duration is admin-configured (pricing.seasonPass.durationDays,
 * served on GET /mobile-control/config). Read it when an API base URL is exposed
 * to the function; otherwise fall back to 90 days.
 */
async function resolveSeasonDurationDays(): Promise<number> {
  const apiBase = Deno.env.get("EDUTU_API_URL") ||
    Deno.env.get("EDUTU_CONFIG_URL");
  if (!apiBase) {
    // TODO: set EDUTU_API_URL on this edge function to source the real duration
    // from the admin config instead of the 90-day fallback.
    return SEASON_FALLBACK_DAYS;
  }
  try {
    const res = await fetch(
      `${apiBase.replace(/\/$/, "")}/mobile-control/config`,
    );
    if (!res.ok) return SEASON_FALLBACK_DAYS;
    const json = await res.json();
    const d = json?.pricing?.seasonPass?.durationDays;
    return typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= 366
      ? d
      : SEASON_FALLBACK_DAYS;
  } catch {
    return SEASON_FALLBACK_DAYS;
  }
}

// Constant-time string comparison via HMAC digests, so the secret check
// doesn't leak match length through timing.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(a)),
    crypto.subtle.sign("HMAC", key, encoder.encode(b)),
  ]);
  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) diff |= bytesA[i] ^ bytesB[i];
  return diff === 0;
}

// RevenueCat webhook event types
type RevenueCatEvent = {
  api_version: string;
  event: {
    type: string;
    id: string;
    created_at: string;
    data: {
      app_user_id: string;
      product_id: string;
      transaction_id: string;
      store: string;
      purchase_token?: string;
      price: number;
      currency: string;
      period_type: string;
      is_trial_conversion: boolean;
      expiration_at_ms: string;
      environment: string;
      entitlement_id?: string;
      entitlement_ids?: string[];
      presented_offering_id?: string;
    };
  };
};

serve(async (req) => {
  try {
    const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        {
          status: 500,
          headers: SECURITY_HEADERS,
        },
      );
    }

    // RevenueCat authenticates webhooks with a static Authorization header
    // value configured in the RevenueCat dashboard (not an HMAC signature).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        {
          status: 401,
          headers: SECURITY_HEADERS,
        },
      );
    }

    const presented = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : authHeader;

    if (!(await timingSafeEqual(presented, webhookSecret))) {
      return new Response(
        JSON.stringify({ error: "Invalid webhook credentials" }),
        {
          status: 401,
          headers: SECURITY_HEADERS,
        },
      );
    }

    const rawBody = await req.text();

    const event: RevenueCatEvent = JSON.parse(rawBody);

    const { event: eventData } = event;
    const { data } = eventData;
    const eventEnvironment = normalizeEnvironment(data.environment);
    const expectedEnvironment =
      (Deno.env.get("REVENUECAT_EXPECTED_ENVIRONMENT") || "production")
        .toLowerCase();
    const allowSandbox = Deno.env.get("REVENUECAT_ALLOW_SANDBOX") === "true";
    if (
      !eventEnvironment ||
      (eventEnvironment !== expectedEnvironment &&
        !(allowSandbox && eventEnvironment === "sandbox"))
    ) {
      return new Response(
        JSON.stringify({
          error: "RevenueCat event environment is not accepted",
        }),
        {
          status: 400,
          headers: SECURITY_HEADERS,
        },
      );
    }
    const userId = data.app_user_id;
    if (!eventData.id || !userId) {
      return new Response(
        JSON.stringify({
          error: "RevenueCat event id and app user id are required",
        }),
        {
          status: 400,
          headers: SECURITY_HEADERS,
        },
      );
    }

    console.log(
      "Received RevenueCat webhook event:",
      eventData.type,
      "id:",
      eventData.id,
      "for user:",
      userId,
    );

    // The durable inbox marks an event terminal only after its handler returns.
    // Retries reclaim non-terminal receipts, while resource-level idempotency
    // in the fulfillment RPCs protects effects after a partial failure.
    const billingEnvironment = normalizeBillingEnvironment(data.environment);
    const shouldProcess = await claimProviderEvent(
      supabaseAdmin,
      eventData.id,
      eventData.type,
      userId,
      billingEnvironment,
      rawBody,
    );
    if (!shouldProcess) {
      console.log(
        "Duplicate processed RevenueCat event, skipping:",
        eventData.id,
      );
      return new Response(JSON.stringify({ success: true, duplicate: true }), {
        status: 200,
        headers: SECURITY_HEADERS,
      });
    }

    // Map RevenueCat event types to our actions
    try {
      switch (eventData.type) {
        case "INITIAL_PURCHASE":
        case "RENEWAL":
          await handleSubscriptionActive(userId, data, eventData.type);
          break;

        case "CANCELLATION":
          await handleSubscriptionCancelled(userId, data);
          break;

        case "EXPIRATION":
          await handleSubscriptionExpired(userId, data);
          break;

        case "NON_RENEWING_PURCHASE":
          // Handle one-time purchases (e.g., credit packages)
          await handleOneTimePurchase(
            supabaseAdmin,
            userId,
            data,
            Number.isNaN(Date.parse(eventData.created_at))
              ? new Date().toISOString()
              : new Date(eventData.created_at).toISOString(),
          );
          break;

        default:
          console.log(`Unhandled event type: ${eventData.type}`);
      }
    } catch (handlerError) {
      // Receipt failures must never make the next delivery look terminal.
      try {
        await markProviderEvent(
          supabaseAdmin,
          eventData.id,
          billingEnvironment,
          "failed",
          handlerError,
        );
      } catch (receiptError) {
        console.error(
          "Failed to mark RevenueCat event as retryable:",
          receiptError,
        );
      }
      throw handlerError;
    }

    await markProviderEvent(
      supabaseAdmin,
      eventData.id,
      billingEnvironment,
      "processed",
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: SECURITY_HEADERS,
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error
          ? error.message
          : "Webhook processing failed",
      }),
      {
        status: 500,
        headers: SECURITY_HEADERS,
      },
    );
  }
});

// ─── Handlers ────────────────────────────────────────────────────────────────

// RevenueCat sends the store UPPERCASE (APP_STORE / PLAY_STORE / …), but the
// `subscriptions.store` CHECK constraint only allows lowercase
// app_store / play_store / stripe. Without this mapping every subscription row
// silently fails the constraint and never gets recorded.
const STORE_MAP: Readonly<
  Record<string, "app_store" | "play_store" | "stripe">
> = {
  APP_STORE: "app_store",
  MAC_APP_STORE: "app_store",
  PLAY_STORE: "play_store",
  AMAZON: "play_store",
  STRIPE: "stripe",
  RC_BILLING: "stripe",
  PROMOTIONAL: "app_store",
};
export function normalizeStore(
  store?: string,
): "app_store" | "play_store" | "stripe" | null {
  if (!store) return null;
  return STORE_MAP[store.toUpperCase()] ?? null;
}

// `subscriptions.environment` allows only lowercase sandbox/production;
// RevenueCat sends SANDBOX/PRODUCTION. Anything else → null (column is nullable
// and NULL passes the CHECK) so an unexpected value can't block the row.
function normalizeEnvironment(env?: string): string | null {
  const e = (env || "").toLowerCase();
  return e === "sandbox" || e === "production" ? e : null;
}

type SupabaseClientLike = {
  from: (table: string) => any;
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: any }>;
};

type OneTimePurchaseData = {
  product_id: string;
  transaction_id: string;
  price: number;
  currency: string;
  environment?: string;
};

const CANONICAL_CREDIT_PACKS = new Set([
  "credits_100",
  "credits_250",
  "credits_700",
]);
const LEGACY_CREDIT_AMOUNTS: Record<string, number> = {
  credits_small: 50,
  credits_medium: 200,
  credits_large: 500,
  credits_xlarge: 1000,
};

function normalizeBillingEnvironment(environment?: string): "sandbox" | "live" {
  return normalizeEnvironment(environment) === "sandbox" ? "sandbox" : "live";
}

function amountInMinorUnits(price: number): number {
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("RevenueCat price must be a non-negative finite number");
  }
  return Math.round(price * 100);
}

function normalizeCurrency(currency?: string): string {
  const normalized = currency?.trim().toUpperCase();
  if (!normalized || !/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("RevenueCat currency must be a three-letter ISO code");
  }
  return normalized;
}

export async function fulfillOneTimePurchase(
  client: SupabaseClientLike,
  userId: string,
  data: OneTimePurchaseData,
  occurredAt: string,
): Promise<{ fulfilled: boolean; duplicate: boolean; rail: "canonical" }> {
  if (!data.transaction_id) {
    throw new Error("RevenueCat one-time purchase is missing a transaction id");
  }
  const rpcName = data.product_id === "season_pass"
    ? "billing_fulfill_one_time_purchase"
    : CANONICAL_CREDIT_PACKS.has(data.product_id)
    ? "billing_fulfill_credit_pack"
    : null;
  if (!rpcName) {
    throw new Error(
      `RevenueCat product is not compatible with canonical one-time fulfillment: ${data.product_id}`,
    );
  }

  const { data: fulfillment, error } = await client.rpc(rpcName, {
    p_provider: "revenuecat",
    p_environment: normalizeBillingEnvironment(data.environment),
    p_provider_resource_id: data.transaction_id,
    p_user_id: userId,
    p_product_key: data.product_id,
    p_amount_minor: amountInMinorUnits(data.price),
    p_currency: normalizeCurrency(data.currency),
    p_occurred_at: occurredAt,
  });
  if (error) {
    throw new Error(
      `Canonical credit fulfillment failed: ${error.message ?? String(error)}`,
    );
  }

  return {
    fulfilled: !(fulfillment as { duplicate?: boolean } | null)?.duplicate,
    duplicate: Boolean(
      (fulfillment as { duplicate?: boolean } | null)?.duplicate,
    ),
    rail: "canonical",
  };
}

type LegacyCreditPurchaseData = OneTimePurchaseData & { store?: string };

function legacyCreditLedgerDescription(transactionId: string): string {
  return `RevenueCat credit purchase ${transactionId}`;
}

export async function fulfillLegacyCreditPurchase(
  client: SupabaseClientLike,
  userId: string,
  data: LegacyCreditPurchaseData,
): Promise<
  {
    fulfilled: boolean;
    duplicate: boolean;
    rail: "legacy" | "legacy-recovered";
  }
> {
  if (!data.transaction_id) {
    throw new Error("RevenueCat credit purchase is missing a transaction id");
  }
  const credits = LEGACY_CREDIT_AMOUNTS[data.product_id] ?? 0;
  if (credits <= 0) {
    throw new Error(`Unknown RevenueCat credit product: ${data.product_id}`);
  }

  const transactionId = data.transaction_id;
  const description = legacyCreditLedgerDescription(transactionId);
  const purchase = {
    user_id: userId,
    credits_purchased: credits,
    credits_granted: 0,
    amount_paid: amountInMinorUnits(data.price),
    currency: normalizeCurrency(data.currency),
    product_id: data.product_id,
    store: normalizeStore(data.store),
    transaction_id: transactionId,
    status: "pending",
    granted_at: null,
  };
  const { error: insertError } = await client.from("credit_purchases").insert(
    purchase,
  );

  if (insertError) {
    if (insertError.code !== "23505") {
      throw new Error(
        `Failed to record credit purchase for ${userId}: ${insertError.message}`,
      );
    }

    const { data: existingPurchase, error: existingError } = await client
      .from("credit_purchases")
      .select("user_id,status,credits_granted")
      .eq("transaction_id", transactionId)
      .maybeSingle();
    if (existingError) {
      throw new Error(
        `Failed to read existing credit purchase: ${existingError.message}`,
      );
    }
    if (!existingPurchase || existingPurchase.user_id !== userId) {
      throw new Error(
        "RevenueCat transaction is already bound to another user",
      );
    }
    if (existingPurchase.status === "completed") {
      return { fulfilled: false, duplicate: true, rail: "legacy" };
    }

    const { data: ledgerRow, error: ledgerError } = await client
      .from("credit_transactions")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "purchase")
      .eq("description", description)
      .maybeSingle();
    if (ledgerError) {
      throw new Error(
        `Failed to verify legacy credit ledger: ${ledgerError.message}`,
      );
    }
    if (ledgerRow) {
      const { error: completionError } = await client
        .from("credit_purchases")
        .update({
          credits_granted: credits,
          status: "completed",
          granted_at: new Date().toISOString(),
        })
        .eq("transaction_id", transactionId);
      if (completionError) {
        throw new Error(
          `Failed to finalize recovered credit purchase: ${completionError.message}`,
        );
      }
      return { fulfilled: true, duplicate: false, rail: "legacy-recovered" };
    }
  }

  const { error: creditError } = await client.rpc("admin_add_credits", {
    p_user_id: userId,
    p_amount: credits,
    p_reason: description,
  });
  if (creditError) {
    throw new Error(
      `Credit grant failed for ${userId}: ${creditError.message}`,
    );
  }

  const { error: completionError } = await client
    .from("credit_purchases")
    .update({
      credits_granted: credits,
      status: "completed",
      granted_at: new Date().toISOString(),
    })
    .eq("transaction_id", transactionId);
  if (completionError) {
    throw new Error(
      `Failed to finalize credit purchase: ${completionError.message}`,
    );
  }

  return { fulfilled: true, duplicate: false, rail: "legacy" };
}

async function handleSubscriptionActive(
  userId: string,
  data: RevenueCatEvent["event"]["data"],
  type: string,
) {
  const isPro = data.entitlement_ids?.includes("pro") ||
    data.entitlement_id === "pro";
  const expiresAt = data.expiration_at_ms
    ? new Date(parseInt(data.expiration_at_ms))
    : null;
  const isTrial = data.is_trial_conversion || data.period_type === "trial";

  console.log(
    `Subscription active for user ${userId}, isPro: ${isPro}, type: ${type}`,
  );

  // Sync subscription status to profiles
  await supabaseAdmin.rpc("sync_subscription_status", {
    p_user_id: userId,
    p_is_pro: isPro,
    p_pro_since: new Date().toISOString(),
    p_subscription_id: data.transaction_id,
  });

  // Upsert subscription record
  const { error: subError } = await supabaseAdmin
    .from("subscriptions")
    .upsert({
      user_id: userId,
      revenuecat_id: data.transaction_id,
      product_id: data.product_id,
      store: normalizeStore(data.store),
      status: "active",
      expires_at: expiresAt?.toISOString(),
      is_trial_period: isTrial,
      auto_renewing: type === "RENEWAL",
      will_renew: true,
      environment: normalizeEnvironment(data.environment),
      original_transaction_id: data.transaction_id,
      latest_transaction_id: data.transaction_id,
      raw_data: data,
    }, {
      onConflict: "revenuecat_id",
    });

  if (subError) {
    console.error("Error upserting subscription:", subError);
  }

  await supabaseAdmin.from("billing_subscriptions").upsert({
    user_id: userId,
    provider: "revenuecat",
    provider_customer_id: userId,
    provider_subscription_id: data.transaction_id,
    plan: data.product_id?.includes("year") ? "yearly" : "monthly",
    status: "active",
    current_period_start: new Date().toISOString(),
    current_period_end: expiresAt?.toISOString(),
    metadata: data,
  }, {
    onConflict: "provider,provider_subscription_id",
  });

  if (isPro) {
    await supabaseAdmin.from("billing_entitlements").upsert({
      user_id: userId,
      feature_key: "pro",
      status: "active",
      source: "revenuecat",
      expires_at: expiresAt?.toISOString(),
      metadata: data,
    }, {
      onConflict: "user_id,feature_key",
    });
  }

  // Log transaction. `amount` is an integer column, but RevenueCat prices are
  // decimals (e.g. 6.99) — store minor units (cents) so nothing is lost and the
  // insert stops silently failing on "invalid input syntax for type integer".
  const { error: txError } = await supabaseAdmin.from("payment_transactions")
    .insert({
      user_id: userId,
      type: "subscription_purchase",
      amount: Math.round((data.price || 0) * 100),
      currency: data.currency,
      transaction_id: data.transaction_id,
      product_id: data.product_id,
      store: normalizeStore(data.store),
      status: "completed",
      description: `${isTrial ? "Trial" : "Subscription"} ${
        type === "RENEWAL" ? "renewal" : "purchase"
      }`,
      metadata: data,
    });
  if (txError) {
    console.error("Error logging payment transaction:", txError);
  }
}

async function handleSubscriptionCancelled(
  userId: string,
  data: RevenueCatEvent["event"]["data"],
) {
  console.log(`Subscription cancelled for user ${userId}`);

  // Update subscription record
  await supabaseAdmin
    .from("subscriptions")
    .update({
      auto_renewing: false,
      will_renew: false,
      unsubscribe_detected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("revenuecat_id", data.transaction_id);

  // Note: Don't set is_pro to false yet - user still has access until expires_at
  await supabaseAdmin
    .from("billing_subscriptions")
    .update({
      cancel_at_period_end: true,
      metadata: data,
    })
    .eq("provider", "revenuecat")
    .eq("provider_subscription_id", data.transaction_id);
}

async function handleSubscriptionExpired(
  userId: string,
  data: RevenueCatEvent["event"]["data"],
) {
  console.log(`Subscription expired for user ${userId}`);

  // RevenueCat can deliver an old expiration after a renewal. Do not revoke
  // the user's aggregate entitlement while another provider subscription or
  // a newer entitlement is still active.
  const now = new Date();
  const [{ data: otherActive }, { data: currentEntitlement }] = await Promise
    .all([
      supabaseAdmin
        .from("billing_subscriptions")
        .select("provider_subscription_id,current_period_end,status")
        .eq("user_id", userId)
        .eq("provider", "revenuecat")
        .eq("status", "active")
        .neq("provider_subscription_id", data.transaction_id),
      supabaseAdmin
        .from("billing_entitlements")
        .select("status,expires_at")
        .eq("user_id", userId)
        .eq("feature_key", "pro")
        .maybeSingle(),
    ]);
  const hasOtherActiveSubscription = (otherActive ?? []).some((row) =>
    row.current_period_end &&
    new Date(row.current_period_end).getTime() > now.getTime()
  );
  const entitlementStillActive = currentEntitlement?.status === "active" &&
    currentEntitlement.expires_at &&
    new Date(currentEntitlement.expires_at).getTime() > now.getTime();

  // Update subscription record
  await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("revenuecat_id", data.transaction_id);

  if (hasOtherActiveSubscription || entitlementStillActive) {
    console.log(
      `Ignoring aggregate Pro revocation for superseded expiration ${data.transaction_id}`,
    );
    return;
  }

  await supabaseAdmin.rpc("sync_subscription_status", {
    p_user_id: userId,
    p_is_pro: false,
  });

  await supabaseAdmin
    .from("billing_subscriptions")
    .update({
      status: "expired",
      current_period_end: new Date().toISOString(),
      metadata: data,
    })
    .eq("provider", "revenuecat")
    .eq("provider_subscription_id", data.transaction_id);

  await supabaseAdmin
    .from("billing_entitlements")
    .update({
      status: "expired",
      expires_at: new Date().toISOString(),
      metadata: data,
    })
    .eq("user_id", userId)
    .eq("feature_key", "pro");
}

export async function handleOneTimePurchase(
  client: SupabaseClientLike,
  userId: string,
  data: LegacyCreditPurchaseData,
  occurredAt: string,
) {
  if (
    data.product_id === "season_pass" ||
    CANONICAL_CREDIT_PACKS.has(data.product_id)
  ) {
    return fulfillOneTimePurchase(client, userId, data, occurredAt);
  }

  // Keep the legacy catalog operational while making its pending-row recovery
  // deterministic. New catalog products use the canonical atomic RPC above.
  if (LEGACY_CREDIT_AMOUNTS[data.product_id]) {
    const result = await fulfillLegacyCreditPurchase(client, userId, data);
    const { error: transactionError } = await client.from(
      "billing_transactions",
    ).upsert({
      user_id: userId,
      provider: "revenuecat",
      provider_reference: data.transaction_id,
      type: "credit_purchase",
      amount: amountInMinorUnits(data.price),
      currency: normalizeCurrency(data.currency),
      status: "completed",
      metadata: { ...data, credits: LEGACY_CREDIT_AMOUNTS[data.product_id] },
    }, {
      onConflict: "provider,provider_reference",
    });
    if (transactionError) {
      throw new Error(
        `Failed to record legacy credit transaction: ${transactionError.message}`,
      );
    }
    return result;
  }

  if (data.product_id.includes("season")) {
    await handleSeasonPass(userId, data as RevenueCatEvent["event"]["data"]);
    return { fulfilled: true, duplicate: false, rail: "legacy" as const };
  }

  console.warn(
    `Unknown one-time RevenueCat product, granting nothing: ${data.product_id}`,
  );
  return { fulfilled: false, duplicate: false, rail: "legacy" as const };
}

async function handleSeasonPass(
  userId: string,
  data: RevenueCatEvent["event"]["data"],
) {
  const durationDays = await resolveSeasonDurationDays();

  // Record the purchase FIRST for transaction-level idempotency. The outer
  // handler already dedupes by event id, but a retry that fails AFTER the
  // stacking grant (below) would double-extend the expiry on redelivery. The
  // unique (provider, provider_reference) index makes a duplicate transaction
  // fail here BEFORE any grant runs — mirrors the credit-purchase guard above.
  const { error: ledgerError } = await supabaseAdmin.from(
    "billing_transactions",
  ).insert({
    user_id: userId,
    provider: "revenuecat",
    provider_reference: data.transaction_id,
    type: "season_pass_purchase",
    amount: data.price * 100, // minor units
    currency: data.currency,
    status: "completed",
    metadata: { ...data, durationDays },
  });

  if (ledgerError) {
    if (ledgerError.code === "23505") {
      console.log(
        `Season pass already recorded, skipping grant: ${data.transaction_id}`,
      );
      return;
    }
    throw new Error(
      `Failed to record season pass for ${userId}: ${ledgerError.message}`,
    );
  }

  // Extend from whatever paid time is still left — never from "now" — so buying
  // a pass mid-period never burns remaining days.
  const now = new Date();
  const { data: existing } = await supabaseAdmin
    .from("billing_entitlements")
    .select("status, expires_at")
    .eq("user_id", userId)
    .eq("feature_key", "pro")
    .maybeSingle();
  const currentExpiry = existing?.status === "active" && existing.expires_at
    ? new Date(existing.expires_at)
    : null;
  const base = currentExpiry && currentExpiry.getTime() > now.getTime()
    ? currentExpiry
    : now;
  const expiresAt = new Date(base.getTime() + durationDays * DAY_MS);

  // Authoritative entitlement the app reads.
  const { error: entError } = await supabaseAdmin.from("billing_entitlements")
    .upsert({
      user_id: userId,
      feature_key: "pro",
      status: "active",
      source: "revenuecat",
      expires_at: expiresAt.toISOString(),
      metadata: { ...data, durationDays, kind: "season_pass" },
    }, {
      onConflict: "user_id,feature_key",
    });
  if (entError) {
    throw new Error(
      `Failed to grant season-pass entitlement for ${userId}: ${entError.message}`,
    );
  }

  // Best-effort profiles mirror (billing_entitlements is authoritative). Call
  // the sync RPC for is_pro, then set the exact expiry ourselves so the stacked
  // date wins.
  await supabaseAdmin.rpc("sync_subscription_status", {
    p_user_id: userId,
    p_is_pro: true,
    p_pro_since: now.toISOString(),
    p_subscription_id: data.transaction_id,
  });
  await supabaseAdmin
    .from("profiles")
    .update({ is_pro: true, pro_expires_at: expiresAt.toISOString() })
    .eq("user_id", userId);

  // Ledger row for the admin dashboard.
  await supabaseAdmin.from("payment_transactions").insert({
    user_id: userId,
    type: "season_pass_purchase",
    amount: data.price,
    currency: data.currency,
    transaction_id: data.transaction_id,
    product_id: data.product_id,
    store: data.store,
    status: "completed",
    description: `Season pass (${durationDays} days)`,
    metadata: { ...data, durationDays },
  });

  console.log(
    `Season pass granted to ${userId}: +${durationDays} days, expires ${expiresAt.toISOString()}`,
  );
}
