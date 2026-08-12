import { NextRequest, NextResponse } from 'next/server';
import { isTrustedPayShellOrigin, readBackendSession } from '@/lib/auth';
import { billingApiRequest } from '@/lib/billing-api';
import { config } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ONE_TIME_CODE = /^[A-Za-z0-9._~-]{32,2048}$/;

export async function POST(req: NextRequest) {
  if (!isTrustedPayShellOrigin(req.headers.get('origin'))) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  }

  let code: string;
  try {
    const body = await req.json();
    code = typeof body?.code === 'string' ? body.code : '';
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (!ONE_TIME_CODE.test(code)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  let response: Response;
  try {
    response = await billingApiRequest('/billing/pay-shell/exchange', code, { method: 'POST' });
  } catch {
    return NextResponse.json({ error: 'payments_not_ready' }, { status: 503 });
  }
  if (!response.ok) return NextResponse.json({ error: 'authentication_failed' }, { status: 401 });

  let body: { session?: unknown; expiresAt?: unknown };
  try {
    body = await response.json();
  } catch {
    return NextResponse.json({ error: 'authentication_failed' }, { status: 401 });
  }
  const session = readBackendSession(body.session as string | undefined);
  if (!session) return NextResponse.json({ error: 'authentication_failed' }, { status: 401 });

  const result = new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  result.cookies.set(config.sessionCookieName(), session, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 900,
  });
  return result;
}
