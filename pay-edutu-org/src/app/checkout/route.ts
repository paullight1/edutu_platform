import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { config } from '@/lib/env';
import { fetchPricing, effectivePrice } from '@/lib/pricing';
import { initTransaction, verifyTransaction } from '@/lib/paystack';
import { isBillingPlan, toMinorUnits, type BillingPlan } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// How long one checkout attempt keeps the SAME Paystack reference.
//
// A random reference per GET meant a double-tap, a pull-to-refresh or the
// browser back button minted a second LIVE transaction for the same purchase —
// and Paystack will happily collect on both, charging the user twice. Bucketing
// time and deriving the reference from (uid, plan, bucket) makes a repeat
// request reuse the transaction that already exists.
//
// 30 minutes is the sweet spot: it is far longer than any real checkout takes
// (Paystack's hosted page/access code goes stale well inside an hour), so every
// accidental repeat inside a single session collapses onto one transaction —
// while still being short enough that a *deliberate* second purchase later in
// the day (a renewal, or a retry after the bank declined) gets a fresh
// reference instead of colliding with a spent one.
const REFERENCE_WINDOW_MS = 30 * 60 * 1000;

// Deterministic, unguessable reference for one (uid, plan, time-bucket).
// Keyed HMAC rather than a bare hash so nobody who merely knows a uid can
// pre-compute (and therefore squat on) another user's reference. 32 hex chars
// = 128 bits of the digest, which is collision-safe at any volume we will ever
// see, and the `edutu_` prefix is preserved for dashboard/webhook filtering.
function checkoutReference(uid: string, plan: BillingPlan, now: number = Date.now()): string {
  const bucket = Math.floor(now / REFERENCE_WINDOW_MS);
  const digest = crypto
    .createHmac('sha256', config.paystackSecret())
    .update(`${uid}|${plan}|${bucket}`)
    .digest('hex')
    .slice(0, 32);
  return `edutu_${plan}_${digest}`;
}

// Payment channels to offer per currency, for markets where we want to
// GUARANTEE the local non-card methods surface (mobile money, transfer, USSD).
// Paystack's `channels` param is a WHITELIST — it restricts, not expands — so
// we only send it for currencies we've explicitly curated. For any other
// currency we return undefined, letting Paystack show every method enabled on
// the account for that currency (the pre-existing default behaviour).
function channelsForCurrency(currency: string): string[] | undefined {
  switch ((currency || '').toUpperCase()) {
    case 'NGN':
      return ['card', 'bank_transfer', 'ussd', 'bank', 'qr'];
    case 'GHS':
    case 'KES':
      return ['card', 'mobile_money', 'bank_transfer'];
    default:
      return undefined;
  }
}

// GET /checkout?uid=..&email=..&plan=weekly|monthly|yearly&ref=..&platform=..
// Validates the price server-side (never trusts the query `amount`), creates a
// Paystack transaction (idempotently — see REFERENCE_WINDOW_MS), and
// 303-redirects the browser to the hosted card page.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const uid = url.searchParams.get('uid')?.trim();
  const plan = url.searchParams.get('plan')?.trim();
  const email = url.searchParams.get('email')?.trim();
  const ref = url.searchParams.get('ref')?.trim() || 'edutu-mobile';
  const platform = url.searchParams.get('platform')?.trim() || 'unknown';

  // Clerk ids are `user_…`; legacy rows may be UUIDs. Reject anything else
  // before we mint a Paystack transaction for it.
  const UID_RE = /^[A-Za-z0-9_-]{5,64}$/;
  if (!uid || !UID_RE.test(uid) || !isBillingPlan(plan)) {
    return NextResponse.redirect(`${config.baseUrl()}/return?status=error&reason=bad_request`, 303);
  }

  // Carried onto the error page so a failure is recoverable in one tap
  // ("Try again") instead of dead-ending the user on a bare reason code.
  const retryQuery = new URLSearchParams({ uid, plan, ref, platform });
  if (email) retryQuery.set('email', email);
  const errorUrl = (reason: string) =>
    `${config.baseUrl()}/return?status=error&reason=${reason}&${retryQuery.toString()}`;

  try {
    const pricing = await fetchPricing();
    const amountMajor = effectivePrice(pricing, plan);
    const amountMinor = toMinorUnits(amountMajor);

    // Paystack REQUIRES an email, so we always send one — but the real address
    // is strongly preferred and the app should send it on every checkout link.
    //
    // TRADEOFF of the `${uid}@users.edutu.org` fallback: that mailbox does not
    // exist, so (a) the buyer never receives Paystack's receipt, and (b) the
    // webhook's email-based renewal recovery — the path that re-links a later
    // Paystack charge to an Edutu account when metadata.uid is missing — can
    // never match this user. We accept it only as a last resort because the
    // alternative is refusing the sale outright; the uid in metadata still
    // carries the entitlement grant.
    const hasRealEmail = !!email && /.+@.+\..+/.test(email);
    const payerEmail = hasRealEmail ? (email as string) : `${uid}@users.edutu.org`;

    const reference = checkoutReference(uid, plan);
    // Recurring plan codes only exist for monthly/yearly. Weekly is always a
    // one-time charge — it must NOT fall through to the yearly plan code, which
    // would silently subscribe the user at the yearly amount.
    const planCode =
      plan === 'monthly' ? config.planMonthly() : plan === 'yearly' ? config.planYearly() : '';

    // Recurring subscriptions can only auto-charge cards, so Paystack forces
    // card-only when a plan is attached. For one-time charges (the default for
    // our market) offer the channels our users actually have: mobile money in
    // GHS/KES, bank transfer + USSD in NGN, cards everywhere.
    const channels = planCode
      ? undefined
      : channelsForCurrency(pricing.currency);

    const init = (reference: string) =>
      initTransaction({
        email: payerEmail,
        amountMinor,
        currency: pricing.currency,
        reference,
        callbackUrl: `${config.baseUrl()}/return`,
        channels,
        metadata: {
          uid,
          plan,
          ref,
          platform,
          priceMajor: amountMajor,
          // Flags the placeholder address above so downstream (webhook, admin,
          // support) knows no receipt could have reached this buyer.
          syntheticEmail: !hasRealEmail,
          // Shown on the Paystack receipt / dashboard.
          custom_fields: [
            { display_name: 'Edutu User', variable_name: 'edutu_uid', value: uid },
            { display_name: 'Plan', variable_name: 'plan', value: plan },
          ],
        },
        planCode: planCode || undefined,
      });

    try {
      // Re-initialising a reference whose transaction is still PENDING returns
      // that same hosted page, which is exactly the idempotency we want: the
      // double-tap lands back on the one transaction instead of a second one.
      const created = await init(reference);
      return NextResponse.redirect(created.authorizationUrl, 303);
    } catch (error) {
      // Paystack rejects a reference that has already been PAID. That means the
      // user is back here after completing this exact purchase — send them to
      // the return page for that reference so it verifies and unlocks Pro,
      // rather than opening a second chargeable transaction.
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate/i.test(message)) throw error;

      const existing = await verifyTransaction(reference);
      if (existing && existing.status === 'success') {
        return NextResponse.redirect(
          `${config.baseUrl()}/return?reference=${encodeURIComponent(reference)}`,
          303,
        );
      }

      // Reference is spent but the charge did not succeed (abandoned/failed).
      // Fall back to a unique reference so the user can still pay — nothing is
      // collectable on the dead one, so there is no double-charge risk.
      console.warn('checkout reference reuse rejected, retrying fresh', { reference, message });
      const retried = await init(`edutu_${plan}_${crypto.randomUUID()}`);
      return NextResponse.redirect(retried.authorizationUrl, 303);
    }
  } catch (error) {
    console.error('checkout init failed', error);
    return NextResponse.redirect(errorUrl('init_failed'), 303);
  }
}
