import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/env';
import { revokePro } from '@/lib/entitlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthed(req: NextRequest): boolean {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token !== '' && token === config.adminToken();
}

// POST /api/admin/revoke { uid }
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

  try {
    await revokePro(uid);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'revoke failed' }, { status: 500 });
  }
}
