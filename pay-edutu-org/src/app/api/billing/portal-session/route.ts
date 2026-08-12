import { NextRequest, NextResponse } from 'next/server';
import { bachsPortalUrl, isTrustedPayShellOrigin, readBackendSession } from '@/lib/auth';
import { billingApiRequest } from '@/lib/billing-api';
import { config } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isTrustedPayShellOrigin(req.headers.get('origin'))) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  }
  const session = readBackendSession(req.cookies.get(config.sessionCookieName())?.value);
  if (!session) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });

  let response: Response;
  try {
    response = await billingApiRequest('/billing/portal-session', session, { method: 'POST' });
  } catch {
    return NextResponse.json({ error: 'payments_not_ready' }, { status: 503 });
  }
  if (response.status === 404) return NextResponse.json({ error: 'no_bachs_customer' }, { status: 404 });
  if (response.status === 401 || response.status === 403) return NextResponse.json({ error: 'authentication_required' }, { status: 401 });
  if (!response.ok) return NextResponse.json({ error: 'portal_unavailable' }, { status: 502 });

  let body: { url?: unknown };
  try {
    body = await response.json();
  } catch {
    return NextResponse.json({ error: 'portal_unavailable' }, { status: 502 });
  }
  const url = bachsPortalUrl(body.url);
  if (!url) return NextResponse.json({ error: 'portal_unavailable' }, { status: 502 });
  return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } });
}
