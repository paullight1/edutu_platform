import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { formatMoney } from '@/lib/money';
import { ADMIN_COOKIE, verifyAdminSession } from '@/lib/auth';
import { AdminActions } from './AdminActions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Search = { [key: string]: string | string[] | undefined };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function KeyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="14.5" r="4.25" />
      <path d="M11.2 11.3 20 2.5M15.5 7l3 3M12.8 9.7l2.4 2.4" />
    </svg>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<Search> }) {
  // Session-cookie auth only — the token itself must never live in a URL
  // (history, logs and referrer headers all leak query strings).
  const authed = verifyAdminSession((await cookies()).get(ADMIN_COOKIE)?.value);
  const loginError = first((await searchParams).error) === 'bad_token';

  if (!authed) {
    return (
      <div className="card">
        <div className="mark neutral" style={{ margin: '4px 0 20px' }} aria-hidden="true">
          <KeyIcon />
        </div>
        <div className="eyebrow">Restricted area</div>
        <h1>Admin access</h1>
        <p>Enter your admin token to view payments and award Pro. Your session lasts 2 hours.</p>
        {loginError && (
          <div className="notice danger" role="alert">
            <span>That token wasn&apos;t recognised. Check ADMIN_DASHBOARD_TOKEN and try again.</span>
          </div>
        )}
        <form method="POST" action="/api/admin/login">
          <label>Admin token</label>
          <input name="token" type="password" placeholder="ADMIN_DASHBOARD_TOKEN" autoComplete="off" />
          <button className="btn" type="submit">
            Continue
            <span className="chip" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4.5 12h15M13 5.5 19.5 12 13 18.5" />
              </svg>
            </span>
          </button>
        </form>
      </div>
    );
  }

  const db = supabaseAdmin();
  const [{ data: payments }, { count: activeCount }] = await Promise.all([
    db.from('payments').select('user_id, email, plan, amount, currency, status, created_at').order('created_at', { ascending: false }).limit(50),
    db.from('billing_entitlements').select('*', { count: 'exact', head: true }).eq('feature_key', 'pro').eq('status', 'active'),
  ]);

  const rows = payments ?? [];
  const revenueByCurrency = rows
    .filter((r) => r.status === 'success' && typeof r.amount === 'number' && Number(r.amount) > 0)
    .reduce<Record<string, number>>((acc, r) => {
      const cur = r.currency || 'USD';
      acc[cur] = (acc[cur] ?? 0) + Number(r.amount);
      return acc;
    }, {});

  const revenueEntries = Object.entries(revenueByCurrency);

  return (
    <div className="wide">
      <div className="card">
        <div className="eyebrow">Admin console</div>
        <h1>Overview</h1>
        <p className="muted" style={{ marginBottom: 0 }}>Live snapshot from the last 50 transactions.</p>

        <div className="stats">
          <div className="stat green">
            <div className="k">Active Pro users</div>
            <div className="v">{activeCount ?? 0}</div>
          </div>
          {revenueEntries.length ? (
            revenueEntries.map(([cur, amt]) => (
              <div className="stat" key={cur}>
                <div className="k">Revenue · {cur}</div>
                <div className="v">{formatMoney(amt, cur)}<small>last 50</small></div>
              </div>
            ))
          ) : (
            <div className="stat">
              <div className="k">Revenue</div>
              <div className="v">—<small>last 50</small></div>
            </div>
          )}
        </div>

        <h2>Recent payments</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>When</th><th>User</th><th>Plan</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={5} className="muted">No payments yet.</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                  <td className="strong" title={r.user_id}>{r.email || `${String(r.user_id).slice(0, 10)}…`}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.plan || '—'}</td>
                  <td className="strong">{typeof r.amount === 'number' ? formatMoney(Number(r.amount), r.currency || 'USD') : '—'}</td>
                  <td>
                    <span className={`pill ${r.status === 'success' ? 'success' : r.status === 'failed' ? 'danger' : ''}`}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AdminActions />
    </div>
  );
}
