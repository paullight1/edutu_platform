import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/paystack';
import { grantPro, recordPayment, revokePro, upsertSubscription } from '@/lib/entitlements';
import { isBillingPlan } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
        const uid: string | undefined = meta.uid;
        const plan = isBillingPlan(meta.plan) ? meta.plan : 'monthly';
        if (!uid) break;

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

      // Subscription ended (cancelled or exhausted) — let Pro lapse at expiry.
      case 'subscription.disable':
      case 'subscription.not_renew': {
        const data = event.data ?? {};
        const uid: string | undefined = data.metadata?.uid ?? data.customer?.metadata?.uid;
        if (uid) await revokePro(uid);
        break;
      }

      default:
        // Ignore other events (invoice.create, etc.).
        break;
    }
  } catch (error) {
    console.error('webhook handler error', error);
    // Return 200 so Paystack doesn't hammer retries on a transient DB blip we've
    // already logged; real failures are visible in logs. Flip to 500 if you
    // prefer Paystack's automatic retry behaviour.
    return NextResponse.json({ received: true, handled: false }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}
