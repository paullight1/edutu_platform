import { NextRequest, NextResponse } from 'next/server';
import { revokePro } from '@/lib/entitlements';
import { ADMIN_COOKIE, isValidAdminToken, verifyAdminSession } from '@/lib/auth';
import { clientIp, rateLimited } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UID_RE = /^[A-Za-z0-9_-]{5,64}$/;

function isAuthed(req: NextRequest): boolean {
  if (verifyAdminSession(req.cookies.get(ADMIN_COOKIE)?.value)) return true;
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return isValidAdminToken(token);
}

// POST /api/admin/revoke { uid }
export async function POST(req: NextRequest) {
  if (rateLimited(`admin-revoke:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const uid = String(body.uid || '').trim();
  if (!UID_RE.test(uid)) return NextResponse.json({ error: 'invalid uid' }, { status: 400 });

  try {
    await revokePro(uid);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'revoke failed' }, { status: 500 });
  }
}
