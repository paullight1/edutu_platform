import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { config } from '@/lib/env';
import { fetchPricing, effectivePrice } from '@/lib/pricing';
import { initTransaction } from '@/lib/paystack';
import { isBillingPlan, toMinorUnits } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

// GET /checkout?uid=..&email=..&plan=monthly|yearly&ref=..&platform=..
// Validates the price server-side (never trusts the query `amount`), creates a
// Paystack transaction, and 303-redirects the browser to the hosted card page.
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

  try {
    const pricing = await fetchPricing();

    // Resolve the server-authoritative amount, reference, and plan code. A
    // season pass is a ONE-OFF charge: no Paystack plan code (so `initTransaction`
    // runs a single charge, not a subscription) and promos never apply to it.
    let amountMajor: number;
    let reference: string;
    let planCode: string | undefined;
    if (plan === 'season') {
      // Never mint a charge for a pass the admin hasn't turned on.
      if (!pricing.seasonPass.enabled) {
        return NextResponse.redirect(`${config.baseUrl()}/return?status=error&reason=bad_request`, 303);
      }
      amountMajor = pricing.seasonPass.price;
      reference = `edutu_season_${crypto.randomUUID()}`;
      planCode = undefined;
    } else {
      amountMajor = effectivePrice(pricing, plan);
      reference = `edutu_${plan}_${crypto.randomUUID()}`;
      planCode = (plan === 'monthly' ? config.planMonthly() : config.planYearly()) || undefined;
    }
    const amountMinor = toMinorUnits(amountMajor);

    // Paystack requires an email; synthesise a stable placeholder if the app
    // couldn't supply one (still tied to the user via metadata.uid).
    const payerEmail = email && /.+@.+\..+/.test(email) ? email : `${uid}@users.edutu.org`;

    // Recurring subscriptions can only auto-charge cards, so Paystack forces
    // card-only when a plan is attached. For one-time charges (the default for
    // our market — including the season pass) offer the channels our users
    // actually have: mobile money in GHS/KES, bank transfer + USSD in NGN,
    // cards everywhere.
    const channels = planCode
      ? undefined
      : channelsForCurrency(pricing.currency);


    const init = await initTransaction({
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
        // Shown on the Paystack receipt / dashboard.
        custom_fields: [
          { display_name: 'Edutu User', variable_name: 'edutu_uid', value: uid },
          { display_name: 'Plan', variable_name: 'plan', value: plan },
        ],
      },
      planCode,
    });

    return NextResponse.redirect(init.authorizationUrl, 303);
  } catch (error) {
    console.error('checkout init failed', error);
    return NextResponse.redirect(`${config.baseUrl()}/return?status=error&reason=init_failed`, 303);
  }
}
