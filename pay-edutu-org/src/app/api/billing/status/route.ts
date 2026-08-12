import { NextRequest, NextResponse } from 'next/server';
import { readBackendSession } from '@/lib/auth';
import { billingApiRequest } from '@/lib/billing-api';
import { billingStatus } from '@/lib/billing-status';
import { config } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = readBackendSession(req.cookies.get(config.sessionCookieName())?.value);
  if (!session) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });

  let response: Response;
  try {
    response = await billingApiRequest('/billing/intent-status', session);
  } catch {
    return NextResponse.json({ error: 'payments_not_ready' }, { status: 503 });
  }
  if (response.status === 401 || response.status === 403) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  if (!response.ok) return NextResponse.json({ error: 'status_unavailable' }, { status: 502 });

  let body: { status?: unknown; supportReference?: unknown };
  try {
    body = await response.json();
  } catch {
    return NextResponse.json({ error: 'status_unavailable' }, { status: 502 });
  }
  const status = billingStatus(body.status);
  if (!status) return NextResponse.json({ error: 'status_unavailable' }, { status: 502 });
  const supportReference = typeof body.supportReference === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body.supportReference)
    ? body.supportReference
    : undefined;
  return NextResponse.json({ status, ...(supportReference ? { supportReference } : {}) }, { headers: { 'Cache-Control': 'no-store' } });
}
