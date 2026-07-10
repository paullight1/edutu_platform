import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { disableSubscription } from '@/lib/paystack';
import { SESSION_COOKIE, sessionConfigured, verifySession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/account/cancel { uid }
// Turns off auto-renew via Paystack and marks the subscription cancelled. Pro
// itself lapses naturally at expires_at (handled by the app's expiry check).
//
// Ownership is enforced by the signed session cookie set in /account/start
// (after a Clerk token check). If session verification isn't configured, we
// fall back to trusting the body uid so the flow still works pre-setup.
export async function POST(req: NextRequest) {
  let uid: string | undefined;
  try {
    ({ uid } = await req.json());
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }
  if (!uid) return NextResponse.json({ error: 'missing uid' }, { status: 400 });

  if (sessionConfigured()) {
    const sessionUid = verifySession(req.cookies.get(SESSION_COOKIE)?.value);
    if (!sessionUid || sessionUid !== uid) {
      return NextResponse.json({ error: 'not authorized for this account' }, { status: 403 });
    }
  }

  const db = supabaseAdmin();
  const { data: sub } = await db
    .from('billing_subscriptions')
    .select('subscription_code, email_token')
    .eq('user_id', uid)
    .eq('status', 'active')
    .maybeSingle();

  if (!sub?.subscription_code) {
    return NextResponse.json({ error: 'no active subscription' }, { status: 404 });
  }

  const ok = await disableSubscription(sub.subscription_code, sub.email_token ?? '');
  if (!ok) {
    return NextResponse.json({ error: 'paystack disable failed' }, { status: 502 });
  }

  await db
    .from('billing_subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('subscription_code', sub.subscription_code);

  return NextResponse.json({ ok: true });
}
