import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { config } from '@/lib/env';
import { grantPro, recordPayment } from '@/lib/entitlements';
import { addDays, isBillingPlan, planDurationDays } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthed(req: NextRequest): boolean {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token !== '' && token === config.adminToken();
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
  if (!uid) return NextResponse.json({ error: 'missing uid' }, { status: 400 });

  const plan = isBillingPlan(body.plan) ? body.plan : 'yearly';
  const days = Number(body.days);
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
