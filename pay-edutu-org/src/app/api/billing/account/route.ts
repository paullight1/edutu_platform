import { NextRequest, NextResponse } from 'next/server';
import { readBackendSession } from '@/lib/auth';
import { billingApiRequest } from '@/lib/billing-api';
import { config } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AccountItem = {
  provider: 'bachs' | 'app_store' | 'play_store' | 'one_time_pass' | 'credits';
  status: 'active' | 'past_due' | 'cancelled' | 'expired';
  paidThrough?: string;
  renewalMode?: 'recurring' | 'one_time';
  supportReference?: string;
};

function accountItem(value: unknown): AccountItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const provider = item.provider;
  const status = item.status;
  if (!['bachs', 'app_store', 'play_store', 'one_time_pass', 'credits'].includes(String(provider))) return null;
  if (!['active', 'past_due', 'cancelled', 'expired'].includes(String(status))) return null;
  const paidThrough = typeof item.paidThrough === 'string' && !Number.isNaN(Date.parse(item.paidThrough)) ? item.paidThrough : undefined;
  const renewalMode = item.renewalMode === 'recurring' || item.renewalMode === 'one_time' ? item.renewalMode : undefined;
  const supportReference = typeof item.supportReference === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(item.supportReference)
    ? item.supportReference
    : undefined;
  return { provider: provider as AccountItem['provider'], status: status as AccountItem['status'], ...(paidThrough ? { paidThrough } : {}), ...(renewalMode ? { renewalMode } : {}), ...(supportReference ? { supportReference } : {}) };
}

export async function GET(req: NextRequest) {
  const session = readBackendSession(req.cookies.get(config.sessionCookieName())?.value);
  if (!session) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  let response: Response;
  try {
    response = await billingApiRequest('/billing/account', session);
  } catch {
    return NextResponse.json({ error: 'payments_not_ready' }, { status: 503 });
  }
  if (response.status === 401 || response.status === 403) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  if (!response.ok) return NextResponse.json({ error: 'account_unavailable' }, { status: 502 });

  let body: { items?: unknown };
  try {
    body = await response.json();
  } catch {
    return NextResponse.json({ error: 'account_unavailable' }, { status: 502 });
  }
  const items = Array.isArray(body.items) ? body.items.map(accountItem).filter((item): item is AccountItem => item !== null) : null;
  if (!items) return NextResponse.json({ error: 'account_unavailable' }, { status: 502 });
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
}
