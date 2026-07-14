import { supabaseAdmin } from './supabaseAdmin';
import { addDays, planDurationDays, type BillingPlan } from './money';

export interface GrantInput {
  userId: string;
  plan: BillingPlan;
  source: 'paystack' | 'admin_grant';
  reference?: string;
  email?: string | null;
  /** Explicit expiry (else derived from plan duration). */
  expiresAt?: Date;
}

/**
 * Grant / extend Pro. Writes the authoritative row the mobile app reads
 * (billing_entitlements, keyed by the raw Clerk user id) and best-effort mirrors
 * onto profiles. Idempotent per (user_id, feature_key) via upsert.
 */
export async function grantPro(input: GrantInput): Promise<void> {
  const db = supabaseAdmin();
  const now = new Date();

  let expiresAt = input.expiresAt;
  if (!expiresAt) {
    // Extend from whatever time is still left, not from "now" — a user who
    // renews (or buys again) mid-period must never lose paid days.
    const { data: existing } = await db
      .from('billing_entitlements')
      .select('status, expires_at')
      .eq('user_id', input.userId)
      .eq('feature_key', 'pro')
      .maybeSingle();
    const currentExpiry = existing?.status === 'active' && existing.expires_at
      ? new Date(existing.expires_at)
      : null;
    const base = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
    expiresAt = addDays(base, planDurationDays(input.plan));
  }

  const { error } = await db
    .from('billing_entitlements')
    .upsert(
      {
        user_id: input.userId,
        feature_key: 'pro',
        status: 'active',
        source: input.source,
        reference: input.reference ?? null,
        expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: 'user_id,feature_key' },
    );

  if (error) {
    throw new Error(`Failed to write entitlement: ${error.message}`);
  }

  // Best-effort mirror onto profiles (the app treats billing_entitlements as
  // authoritative, so a failure here is non-fatal).
  try {
    await db
      .from('profiles')
      .update({
        is_pro: true,
        pro_since: now.toISOString(),
        pro_expires_at: expiresAt.toISOString(),
      })
      .eq('user_id', input.userId);
  } catch {
    // ignore
  }
}

export async function revokePro(userId: string): Promise<void> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  // 'revoked' is the value the billing_entitlements CHECK constraint allows
  // (active|revoked|expired) — 'canceled' is rejected (23514) and would make
  // this a silent no-op. Also lapse expires_at now so isPro()'s expiry clause
  // independently denies even if a reader ignores status.
  const { error } = await db
    .from('billing_entitlements')
    .update({ status: 'revoked', expires_at: now, updated_at: now })
    .eq('user_id', userId)
    .eq('feature_key', 'pro');
  if (error) {
    throw new Error(`Failed to revoke entitlement: ${error.message}`);
  }
  try {
    await db
      .from('profiles')
      .update({ is_pro: false, pro_expires_at: now })
      .eq('user_id', userId);
  } catch {
    // ignore — billing_entitlements is authoritative
  }
}

export interface RecordPaymentInput {
  userId: string;
  email?: string | null;
  plan?: string;
  amountMajor?: number;
  currency?: string;
  reference: string;
  status?: string;
  raw?: unknown;
}

/**
 * Insert a payment ledger row. Returns false when the reference already exists
 * (duplicate webhook delivery) so callers can treat the event as already done.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<boolean> {
  const db = supabaseAdmin();
  const { error } = await db.from('payments').insert({
    user_id: input.userId,
    email: input.email ?? null,
    plan: input.plan ?? null,
    amount: input.amountMajor ?? null,
    currency: input.currency ?? null,
    provider: 'paystack',
    reference: input.reference,
    status: input.status ?? 'success',
    raw: input.raw ?? null,
  });
  if (error) {
    // Unique violation on (provider, reference) → already recorded.
    if ((error as any).code === '23505') return false;
    throw new Error(`Failed to record payment: ${error.message}`);
  }
  return true;
}

export async function upsertSubscription(input: {
  userId: string;
  email?: string | null;
  plan?: string | null;
  subscriptionCode: string;
  emailToken?: string | null;
}): Promise<void> {
  const db = supabaseAdmin();
  await db.from('billing_subscriptions').upsert(
    {
      user_id: input.userId,
      email: input.email ?? null,
      plan: input.plan ?? null,
      subscription_code: input.subscriptionCode,
      email_token: input.emailToken ?? null,
      status: 'active',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'subscription_code' },
  );
}

/** Mark a subscription as no longer renewing (entitlement lapses at expiry). */
export async function markSubscriptionCanceled(subscriptionCode: string): Promise<void> {
  const db = supabaseAdmin();
  await db
    .from('billing_subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('subscription_code', subscriptionCode);
}

/**
 * Resolve the Edutu uid for a Paystack event that arrived WITHOUT metadata —
 * Paystack renewal charges don't echo the original transaction's metadata, so
 * we fall back to the subscription code, then the customer email, in our
 * billing_subscriptions ledger. Returns null when no confident match exists.
 */
export async function findUidForRenewal(params: {
  subscriptionCode?: string | null;
  email?: string | null;
}): Promise<string | null> {
  const db = supabaseAdmin();

  if (params.subscriptionCode) {
    const { data } = await db
      .from('billing_subscriptions')
      .select('user_id')
      .eq('subscription_code', params.subscriptionCode)
      .maybeSingle();
    if (data?.user_id) return data.user_id;
  }

  if (params.email) {
    const { data } = await db
      .from('billing_subscriptions')
      .select('user_id')
      .eq('email', params.email)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(2);
    // Only trust an email match when it's unambiguous.
    if (data && data.length === 1 && data[0].user_id) return data[0].user_id;
  }

  return null;
}

export interface EntitlementStatus {
  isPro: boolean;
  expiresAt: string | null;
  status: string | null;
}

export async function getEntitlementStatus(userId: string): Promise<EntitlementStatus> {
  const db = supabaseAdmin();
  const { data } = await db
    .from('billing_entitlements')
    .select('status, expires_at')
    .eq('user_id', userId)
    .eq('feature_key', 'pro')
    .maybeSingle();

  if (!data) return { isPro: false, expiresAt: null, status: null };
  const notExpired = !data.expires_at || new Date(data.expires_at).getTime() > Date.now();
  return {
    isPro: data.status === 'active' && notExpired,
    expiresAt: data.expires_at ?? null,
    status: data.status ?? null,
  };
}
