import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { grantPro, recordPayment } from '@/lib/entitlements';
import { addDays, isBillingPlan, planDurationDays } from '@/lib/money';
import { ADMIN_COOKIE, isValidAdminToken, verifyAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_GRANT_DAYS = 3650;
// Clerk ids look like `user_2abc…`; keep the check loose enough for legacy
// UUID-keyed rows while rejecting junk/injection attempts.
const UID_RE = /^[A-Za-z0-9_-]{5,64}$/;

function isAuthed(req: NextRequest): boolean {
  if (verifyAdminSession(req.cookies.get(ADMIN_COOKIE)?.value)) return true;
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return isValidAdminToken(token);
}

// POST /api/admin/grant { uid, plan?, days?, reason? } — award free Pro / bonanza.
export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const uid = String(body.uid || '').trim();
  if (!UID_RE.test(uid)) return NextResponse.json({ error: 'invalid uid' }, { status: 400 });

  const plan = isBillingPlan(body.plan) ? body.plan : 'yearly';
  const days = Number(body.days);
  if (body.days !== undefined && (!Number.isInteger(days) || days < 1 || days > MAX_GRANT_DAYS)) {
    return NextResponse.json({ error: `days must be 1–${MAX_GRANT_DAYS}` }, { status: 400 });
  }
  const expiresAt = Number.isFinite(days) && days > 0 ? addDays(new Date(), days) : addDays(new Date(), planDurationDays(plan));
  const reference = `admin_${crypto.randomUUID()}`;

  try {
    await grantPro({ userId: uid, plan, source: 'admin_grant', reference, expiresAt });
    await recordPayment({
      userId: uid,
      plan,
      amountMajor: 0,
      currency: 'GRANT',
      reference,
      status: `admin_grant:${String(body.reason || 'grant').slice(0, 40)}`,
    });
    return NextResponse.json({ ok: true, expiresAt: expiresAt.toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'grant failed' }, { status: 500 });
  }
}
