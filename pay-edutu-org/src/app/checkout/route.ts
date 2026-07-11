import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { config } from '@/lib/env';
import { fetchPricing, effectivePrice } from '@/lib/pricing';
import { initTransaction } from '@/lib/paystack';
import { isBillingPlan, toMinorUnits } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const amountMajor = effectivePrice(pricing, plan);
    const amountMinor = toMinorUnits(amountMajor);

    // Paystack requires an email; synthesise a stable placeholder if the app
    // couldn't supply one (still tied to the user via metadata.uid).
    const payerEmail = email && /.+@.+\..+/.test(email) ? email : `${uid}@users.edutu.org`;

    const reference = `edutu_${plan}_${crypto.randomUUID()}`;
    const planCode = plan === 'monthly' ? config.planMonthly() : config.planYearly();

    const init = await initTransaction({
      email: payerEmail,
      amountMinor,
      currency: pricing.currency,
      reference,
      callbackUrl: `${config.baseUrl()}/return`,
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
      planCode: planCode || undefined,
    });

    return NextResponse.redirect(init.authorizationUrl, 303);
  } catch (error) {
    console.error('checkout init failed', error);
    return NextResponse.redirect(`${config.baseUrl()}/return?status=error&reason=init_failed`, 303);
  }
}
