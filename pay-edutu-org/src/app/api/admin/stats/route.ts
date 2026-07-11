import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { ADMIN_COOKIE, isValidAdminToken, verifyAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAuthed(req: NextRequest): boolean {
  if (verifyAdminSession(req.cookies.get(ADMIN_COOKIE)?.value)) return true;
  const header = req.headers.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  // ?token= is kept for the Edutu admin app's server-to-server calls; prefer
  // the Bearer header in new integrations (query strings end up in logs).
  const query = new URL(req.url).searchParams.get('token') || '';
  return isValidAdminToken(bearer) || isValidAdminToken(query);
}

// GET /api/admin/stats  (Bearer ADMIN_DASHBOARD_TOKEN, or ?token=)
// Machine-readable revenue + subscriber snapshot for the Edutu admin app.
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = supabaseAdmin();
  const [{ count: activePro }, { data: payments }] = await Promise.all([
    db.from('billing_entitlements').select('*', { count: 'exact', head: true }).eq('feature_key', 'pro').eq('status', 'active'),
    db.from('payments').select('amount, currency, status, plan, created_at').order('created_at', { ascending: false }).limit(1000),
  ]);

  const paid = (payments ?? []).filter((p) => p.status === 'success' && typeof p.amount === 'number');
  const now = Date.now();
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  const sumBy = (rows: typeof paid) =>
    rows.reduce<Record<string, number>>((acc, r) => {
      const cur = r.currency || 'USD';
      acc[cur] = (acc[cur] ?? 0) + Number(r.amount);
      return acc;
    }, {});

  const last30 = paid.filter((p) => p.created_at && new Date(p.created_at).getTime() >= monthAgo);

  return NextResponse.json({
    activePro: activePro ?? 0,
    payments: { total: paid.length, last30Days: last30.length },
    revenue: { allTime: sumBy(paid), last30Days: sumBy(last30) },
    generatedAt: new Date().toISOString(),
  });
}
