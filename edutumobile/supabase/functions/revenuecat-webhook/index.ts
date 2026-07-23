// supabase/functions/revenuecat-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Fallback pass length when the admin config can't be read — mirrors the backend
// PricingSettingsSchema default (durationDays 90) so grants stay sane offline.
const SEASON_FALLBACK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The season-pass duration is admin-configured (pricing.seasonPass.durationDays,
 * served on GET /mobile-control/config). Read it when an API base URL is exposed
 * to the function; otherwise fall back to 90 days.
 */
async function resolveSeasonDurationDays(): Promise<number> {
  const apiBase = Deno.env.get('EDUTU_API_URL') || Deno.env.get('EDUTU_CONFIG_URL');
  if (!apiBase) {
    // TODO: set EDUTU_API_URL on this edge function to source the real duration
    // from the admin config instead of the 90-day fallback.
    return SEASON_FALLBACK_DAYS;
  }
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/mobile-control/config`);
    if (!res.ok) return SEASON_FALLBACK_DAYS;
    const json = await res.json();
    const d = json?.pricing?.seasonPass?.durationDays;
    return typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 366 ? d : SEASON_FALLBACK_DAYS;
  } catch {
    return SEASON_FALLBACK_DAYS;
  }
}

// Constant-time string comparison via HMAC digests, so the secret check
// doesn't leak match length through timing.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, encoder.encode(a)),
    crypto.subtle.sign('HMAC', key, encoder.encode(b)),
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
    const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
        status: 500,
        headers: SECURITY_HEADERS,
      });
    }

    // RevenueCat authenticates webhooks with a static Authorization header
    // value configured in the RevenueCat dashboard (not an HMAC signature).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: SECURITY_HEADERS,
      });
    }

    const presented = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : authHeader;

    if (!(await timingSafeEqual(presented, webhookSecret))) {
      return new Response(JSON.stringify({ error: 'Invalid webhook credentials' }), {
        status: 401,
        headers: SECURITY_HEADERS,
      });
    }

    const rawBody = await req.text();

    const event: RevenueCatEvent = JSON.parse(rawBody);

    const { event: eventData } = event;
    const { data } = eventData;
    const userId = data.app_user_id;

    console.log('Received RevenueCat webhook event:', eventData.type, 'id:', eventData.id, 'for user:', userId);

    // Idempotency: claim this event id up front. RevenueCat retries on any
    // non-2xx response, so a redelivery must not re-run the handler (which
    // would double-grant credits and duplicate ledger rows). A duplicate
    // hits the primary key on processed_webhook_events and is skipped.
    if (eventData.id) {
      const { error: claimError } = await supabaseAdmin
        .from('processed_webhook_events')
        .insert({
          event_id: eventData.id,
          provider: 'revenuecat',
          event_type: eventData.type,
          user_id: userId,
        });
      if (claimError) {
        if (claimError.code === '23505') {
          // unique_violation → this event was already processed.
          console.log('Duplicate RevenueCat event, skipping:', eventData.id);
          return new Response(JSON.stringify({ success: true, duplicate: true }), {
            status: 200,
            headers: SECURITY_HEADERS,
          });
        }
        throw claimError;
      }
    }

    // Map RevenueCat event types to our actions
    try {
      switch (eventData.type) {
        case 'INITIAL_PURCHASE':
        case 'RENEWAL':
          await handleSubscriptionActive(userId, data, eventData.type);
          break;

        case 'CANCELLATION':
          await handleSubscriptionCancelled(userId, data);
          break;

        case 'EXPIRATION':
          await handleSubscriptionExpired(userId, data);
          break;

        case 'NON_RENEWING_PURCHASE':
          // Handle one-time purchases (e.g., credit packages)
          await handleOneTimePurchase(userId, data);
          break;

        default:
          console.log(`Unhandled event type: ${eventData.type}`);
      }
    } catch (handlerError) {
      // Release the claim so RevenueCat's retry can reprocess this event.
      if (eventData.id) {
        await supabaseAdmin
          .from('processed_webhook_events')
          .delete()
          .eq('event_id', eventData.id);
      }
      throw handlerError;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: SECURITY_HEADERS,
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: SECURITY_HEADERS,
    });
  }
});

// ─── Handlers ────────────────────────────────────────────────────────────────

// RevenueCat sends the store UPPERCASE (APP_STORE / PLAY_STORE / …), but the
// `subscriptions.store` CHECK constraint only allows lowercase
// app_store / play_store / stripe. Without this mapping every subscription row
// silently fails the constraint and never gets recorded.
const STORE_MAP: Record<string, string> = {
  APP_STORE: 'app_store',
  MAC_APP_STORE: 'app_store',
  PLAY_STORE: 'play_store',
  AMAZON: 'play_store',
  STRIPE: 'stripe',
  RC_BILLING: 'stripe',
  PROMOTIONAL: 'app_store',
};
function normalizeStore(store?: string): string {
  if (!store) return 'app_store';
  return STORE_MAP[store.toUpperCase()] ?? store.toLowerCase();
}

// `subscriptions.environment` allows only lowercase sandbox/production;
// RevenueCat sends SANDBOX/PRODUCTION. Anything else → null (column is nullable
// and NULL passes the CHECK) so an unexpected value can't block the row.
function normalizeEnvironment(env?: string): string | null {
  const e = (env || '').toLowerCase();
  return e === 'sandbox' || e === 'production' ? e : null;
}

async function handleSubscriptionActive(
  userId: string,
  data: RevenueCatEvent['event']['data'],
  type: string
) {
  const isPro = data.entitlement_ids?.includes('pro') || data.entitlement_id === 'pro';
  const expiresAt = data.expiration_at_ms ? new Date(parseInt(data.expiration_at_ms)) : null;
  const isTrial = data.is_trial_conversion || data.period_type === 'trial';

  console.log(`Subscription active for user ${userId}, isPro: ${isPro}, type: ${type}`);

  // Sync subscription status to profiles
  await supabaseAdmin.rpc('sync_subscription_status', {
    p_user_id: userId,
    p_is_pro: isPro,
    p_pro_since: new Date().toISOString(),
    p_subscription_id: data.transaction_id,
  });

  // Upsert subscription record
  const { error: subError } = await supabaseAdmin
    .from('subscriptions')
    .upsert({
      user_id: userId,
      revenuecat_id: data.transaction_id,
      product_id: data.product_id,
      store: normalizeStore(data.store),
      status: 'active',
      expires_at: expiresAt?.toISOString(),
      is_trial_period: isTrial,
      auto_renewing: type === 'RENEWAL',
      will_renew: true,
      environment: normalizeEnvironment(data.environment),
      original_transaction_id: data.transaction_id,
      latest_transaction_id: data.transaction_id,
      raw_data: data,
    }, {
      onConflict: 'revenuecat_id',
    });

  if (subError) {
    console.error('Error upserting subscription:', subError);
  }

  await supabaseAdmin.from('billing_subscriptions').upsert({
    user_id: userId,
    provider: 'revenuecat',
    provider_customer_id: userId,
    provider_subscription_id: data.transaction_id,
    plan: data.product_id?.includes('year') ? 'yearly' : 'monthly',
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: expiresAt?.toISOString(),
    metadata: data,
  }, {
    onConflict: 'provider,provider_subscription_id',
  });

  if (isPro) {
    await supabaseAdmin.from('billing_entitlements').upsert({
      user_id: userId,
      feature_key: 'pro',
      status: 'active',
      source: 'revenuecat',
      expires_at: expiresAt?.toISOString(),
      metadata: data,
    }, {
      onConflict: 'user_id,feature_key',
    });
  }

  // Log transaction. `amount` is an integer column, but RevenueCat prices are
  // decimals (e.g. 6.99) — store minor units (cents) so nothing is lost and the
  // insert stops silently failing on "invalid input syntax for type integer".
  const { error: txError } = await supabaseAdmin.from('payment_transactions').insert({
    user_id: userId,
    type: 'subscription_purchase',
    amount: Math.round((data.price || 0) * 100),
    currency: data.currency,
    transaction_id: data.transaction_id,
    product_id: data.product_id,
    store: normalizeStore(data.store),
    status: 'completed',
    description: `${isTrial ? 'Trial' : 'Subscription'} ${type === 'RENEWAL' ? 'renewal' : 'purchase'}`,
    metadata: data,
  });
  if (txError) {
    console.error('Error logging payment transaction:', txError);
  }
}

async function handleSubscriptionCancelled(
  userId: string,
  data: RevenueCatEvent['event']['data']
) {
  console.log(`Subscription cancelled for user ${userId}`);

  // Update subscription record
  await supabaseAdmin
    .from('subscriptions')
    .update({
      auto_renewing: false,
      will_renew: false,
      unsubscribe_detected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('revenuecat_id', data.transaction_id);

  // Note: Don't set is_pro to false yet - user still has access until expires_at
  await supabaseAdmin
    .from('billing_subscriptions')
    .update({
      cancel_at_period_end: true,
      metadata: data,
    })
    .eq('provider', 'revenuecat')
    .eq('provider_subscription_id', data.transaction_id);
}

async function handleSubscriptionExpired(
  userId: string,
  data: RevenueCatEvent['event']['data']
) {
  console.log(`Subscription expired for user ${userId}`);

  // Update subscription record
  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'expired',
      updated_at: new Date().toISOString(),
    })
    .eq('revenuecat_id', data.transaction_id);

  // Sync pro status to false
  await supabaseAdmin.rpc('sync_subscription_status', {
    p_user_id: userId,
    p_is_pro: false,
  });

  await supabaseAdmin
    .from('billing_subscriptions')
    .update({
      status: 'expired',
      current_period_end: new Date().toISOString(),
      metadata: data,
    })
    .eq('provider', 'revenuecat')
    .eq('provider_subscription_id', data.transaction_id);

  await supabaseAdmin
    .from('billing_entitlements')
    .update({
      status: 'expired',
      expires_at: new Date().toISOString(),
      metadata: data,
    })
    .eq('user_id', userId)
    .eq('feature_key', 'pro');
}

async function handleOneTimePurchase(
  userId: string,
  data: RevenueCatEvent['event']['data']
) {
  // One-off Season Pass → grants Pro for a fixed run of days, STACKING on any
  // remaining paid time (same semantics as the pay.edutu.org season checkout).
  if (data.product_id === 'season_pass' || data.product_id.includes('season')) {
    await handleSeasonPass(userId, data);
    return;
  }

  // Check if this is a credit purchase
  const isCreditPurchase = data.product_id.includes('credit');

  if (isCreditPurchase) {
    // Extract credit amount from product ID
    const creditAmounts: Record<string, number> = {
      'credits_small': 50,
      'credits_medium': 200,
      'credits_large': 500,
      'credits_xlarge': 1000,
    };

    const credits = creditAmounts[data.product_id] || 0;
    if (credits <= 0) {
      console.warn(`Unknown credit product, granting nothing: ${data.product_id}`);
      return;
    }

    // Record the purchase FIRST. credit_purchases.transaction_id is uniquely
    // indexed (migration 018), so a duplicate transaction — even one arriving
    // under a different event id — fails here BEFORE any credits are granted.
    const { error: purchaseError } = await supabaseAdmin.from('credit_purchases').insert({
      user_id: userId,
      credits_purchased: credits,
      credits_granted: credits,
      amount_paid: data.price * 100, // Convert to cents
      currency: data.currency,
      product_id: data.product_id,
      store: data.store,
      transaction_id: data.transaction_id,
      status: 'completed',
      granted_at: new Date().toISOString(),
    });

    if (purchaseError) {
      if (purchaseError.code === '23505') {
        // This transaction was already fulfilled — do not grant again.
        console.log(`Credit purchase already recorded, skipping grant: ${data.transaction_id}`);
        return;
      }
      throw new Error(`Failed to record credit purchase for ${userId}: ${purchaseError.message}`);
    }

    // Now grant the credits (service-role only, idempotency guarded above).
    const { error: creditError } = await supabaseAdmin.rpc('admin_add_credits', {
      p_user_id: userId,
      p_amount: credits,
      p_reason: `Credit purchase: ${data.product_id}`,
    });

    if (creditError) {
      console.error('Failed to grant purchased credits:', creditError);
      throw new Error(`Credit grant failed for ${userId}: ${creditError.message}`);
    }

    await supabaseAdmin.from('billing_transactions').upsert({
      user_id: userId,
      provider: 'revenuecat',
      provider_reference: data.transaction_id,
      type: 'credit_purchase',
      amount: data.price * 100,
      currency: data.currency,
      status: 'completed',
      metadata: {
        ...data,
        credits,
      },
    }, {
      onConflict: 'provider,provider_reference',
    });

    console.log(`Added ${credits} credits to user ${userId}`);
  }
}

async function handleSeasonPass(
  userId: string,
  data: RevenueCatEvent['event']['data']
) {
  const durationDays = await resolveSeasonDurationDays();

  // Record the purchase FIRST for transaction-level idempotency. The outer
  // handler already dedupes by event id, but a retry that fails AFTER the
  // stacking grant (below) would double-extend the expiry on redelivery. The
  // unique (provider, provider_reference) index makes a duplicate transaction
  // fail here BEFORE any grant runs — mirrors the credit-purchase guard above.
  const { error: ledgerError } = await supabaseAdmin.from('billing_transactions').insert({
    user_id: userId,
    provider: 'revenuecat',
    provider_reference: data.transaction_id,
    type: 'season_pass_purchase',
    amount: data.price * 100, // minor units
    currency: data.currency,
    status: 'completed',
    metadata: { ...data, durationDays },
  });

  if (ledgerError) {
    if (ledgerError.code === '23505') {
      console.log(`Season pass already recorded, skipping grant: ${data.transaction_id}`);
      return;
    }
    throw new Error(`Failed to record season pass for ${userId}: ${ledgerError.message}`);
  }

  // Extend from whatever paid time is still left — never from "now" — so buying
  // a pass mid-period never burns remaining days.
  const now = new Date();
  const { data: existing } = await supabaseAdmin
    .from('billing_entitlements')
    .select('status, expires_at')
    .eq('user_id', userId)
    .eq('feature_key', 'pro')
    .maybeSingle();
  const currentExpiry =
    existing?.status === 'active' && existing.expires_at ? new Date(existing.expires_at) : null;
  const base = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  const expiresAt = new Date(base.getTime() + durationDays * DAY_MS);

  // Authoritative entitlement the app reads.
  const { error: entError } = await supabaseAdmin.from('billing_entitlements').upsert({
    user_id: userId,
    feature_key: 'pro',
    status: 'active',
    source: 'revenuecat',
    expires_at: expiresAt.toISOString(),
    metadata: { ...data, durationDays, kind: 'season_pass' },
  }, {
    onConflict: 'user_id,feature_key',
  });
  if (entError) {
    throw new Error(`Failed to grant season-pass entitlement for ${userId}: ${entError.message}`);
  }

  // Best-effort profiles mirror (billing_entitlements is authoritative). Call
  // the sync RPC for is_pro, then set the exact expiry ourselves so the stacked
  // date wins.
  await supabaseAdmin.rpc('sync_subscription_status', {
    p_user_id: userId,
    p_is_pro: true,
    p_pro_since: now.toISOString(),
    p_subscription_id: data.transaction_id,
  });
  await supabaseAdmin
    .from('profiles')
    .update({ is_pro: true, pro_expires_at: expiresAt.toISOString() })
    .eq('user_id', userId);

  // Ledger row for the admin dashboard.
  await supabaseAdmin.from('payment_transactions').insert({
    user_id: userId,
    type: 'season_pass_purchase',
    amount: data.price,
    currency: data.currency,
    transaction_id: data.transaction_id,
    product_id: data.product_id,
    store: data.store,
    status: 'completed',
    description: `Season pass (${durationDays} days)`,
    metadata: { ...data, durationDays },
  });

  console.log(`Season pass granted to ${userId}: +${durationDays} days, expires ${expiresAt.toISOString()}`);
}
