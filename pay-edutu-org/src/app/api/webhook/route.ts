import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/paystack';
import { findUidForRenewal, grantPro, markSubscriptionCanceled, recordPayment, upsertSubscription } from '@/lib/entitlements';
import { isBillingPlan, type BillingPlan } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Best-effort plan inference for renewal charges that carry no metadata.
 *
 * This drives planDurationDays(), so a wrong guess is a direct revenue leak:
 * a weekly renewal inferred as 'monthly' grants 31 days of Pro for a 7-day
 * payment. Read the structured interval FIRST — Paystack's own enum (daily |
 * weekly | monthly | quarterly | biannually | annually) is exact, whereas the
 * plan name is free text a human typed into the Paystack dashboard.
 */
function planFromPaystack(data: any): BillingPlan {
  const interval = String(data?.plan?.interval ?? '').trim().toLowerCase();
  if (interval === 'weekly') return 'weekly';
  if (interval === 'annually') return 'yearly';
  // daily/quarterly/biannually are not plans we sell; fall through to the
  // monthly default rather than inventing a duration for them.
  if (interval === 'monthly') return 'monthly';

  // `data.plan` is sometimes a bare plan code string ("PLN_xxx") instead of an
  // object, which yields no usable signal and lands on the monthly default.
  const name = String(data?.plan?.name ?? data?.plan ?? '').toLowerCase();
  // Order matters. 'week' is tested before both the year test and the monthly
  // catch-all: plan names are free text, and something like "Weekly (4 charges
  // per month)" or "Weekly — 52 per year" would otherwise be shadowed by a
  // substring match on 'month'/'year' and over-grant.
  if (name.includes('week')) return 'weekly';
  if (name.includes('year') || name.includes('annual')) return 'yearly';
  return 'monthly';
}

// Paystack webhook. Verifies the HMAC signature over the raw body, then grants
// or revokes entitlements. This is the AUTHORITATIVE grant path (the /return
// page also grants for instant UX, but this guarantees delivery server-to-server).
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get('x-paystack-signature');

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  try {
    switch (event.event) {
      case 'charge.success': {
        const data = event.data ?? {};
        const meta = data.metadata ?? {};
        let uid: string | undefined = meta.uid;
        let plan = isBillingPlan(meta.plan) ? meta.plan : planFromPaystack(data);

        // Subscription RENEWAL charges don't echo the original metadata —
        // recover the uid from our subscription ledger before giving up.
        if (!uid) {
          const recovered = await findUidForRenewal({
            subscriptionCode: data.subscription?.subscription_code ?? data.subscription_code ?? null,
            email: data.customer?.email ?? null,
          });
          if (recovered) uid = recovered;
        }
        if (!uid) {
          console.error('charge.success with unresolvable uid', { reference: data.reference, email: data.customer?.email });
          break;
        }

        // Idempotency: first writer of this reference wins; duplicates no-op.
        const isNew = await recordPayment({
          userId: uid,
          email: data.customer?.email ?? null,
          plan,
          amountMajor: typeof data.amount === 'number' ? data.amount / 100 : undefined,
          currency: data.currency,
          reference: data.reference,
          status: 'success',
          raw: data,
        });
        if (isNew) {
          await grantPro({ userId: uid, plan, source: 'paystack', reference: data.reference, email: data.customer?.email });
        }
        break;
      }

      // Failed charges are recorded (not acted on) so the admin dashboard
      // shows renewals that need attention instead of silently losing them.
      // NOTHING is granted here — a failed charge must never touch
      // billing_entitlements, only the payments ledger.
      case 'charge.failed':
      case 'invoice.payment_failed': {
        const data = event.data ?? {};
        const uid: string | null =
          data.metadata?.uid ??
          (await findUidForRenewal({
            // Same two shapes charge.success sees: nested on the charge for
            // renewals, flat on the payload for invoice-level failures.
            subscriptionCode: data.subscription?.subscription_code ?? data.subscription_code ?? null,
            email: data.customer?.email ?? null,
          }));
        if (uid && data.reference) {
          // Same idempotency as the success path — the payments unique index on
          // (provider, reference) makes a redelivered failure a no-op.
          await recordPayment({
            userId: uid,
            email: data.customer?.email ?? null,
            plan: planFromPaystack(data),
            amountMajor: typeof data.amount === 'number' ? data.amount / 100 : undefined,
            currency: data.currency,
            reference: data.reference,
            status: 'failed',
            raw: data,
          });
        } else {
          // Unattributable failure: log loudly rather than dropping it, since
          // there is no ledger row for anyone to notice afterwards.
          console.error('payment failure with unresolvable uid', {
            event: event.event,
            reference: data.reference,
            email: data.customer?.email,
          });
        }
        break;
      }

      case 'subscription.create': {
        const data = event.data ?? {};
        const uid: string | undefined = data.metadata?.uid ?? data.customer?.metadata?.uid;
        if (uid && data.subscription_code) {
          await upsertSubscription({
            userId: uid,
            email: data.customer?.email ?? null,
            plan: data.plan?.name ?? null,
            subscriptionCode: data.subscription_code,
            emailToken: data.email_token ?? null,
          });
        }
        break;
      }

      // Auto-renew turned off (user cancel or exhausted retries). Do NOT revoke
      // the entitlement here — the user keeps Pro until expires_at (that's the
      // promise on the /account page); we only stop the subscription renewing.
      // The paid-through date lapses naturally via the expiry check in
      // getEntitlementStatus/useProStatus.
      case 'subscription.disable':
      case 'subscription.not_renew': {
        const data = event.data ?? {};
        const code: string | null = data.subscription_code ?? null;
        if (code) {
          await markSubscriptionCanceled(code);
        }
        break;
      }

      default:
        // Ignore other events (invoice.create, etc.).
        break;
    }
  } catch (error) {
    console.error('webhook handler error', error);
    // 500 → Paystack retries the delivery. Every handler above is idempotent
    // (payments dedup by reference, entitlements/subscriptions upsert), so a
    // retry after a transient DB blip completes the grant instead of losing it.
    return NextResponse.json({ received: true, handled: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
