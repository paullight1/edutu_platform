import { cookies } from 'next/headers';
import { getEntitlementStatus } from '@/lib/entitlements';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { SESSION_COOKIE, sessionConfigured, verifySession } from '@/lib/auth';
import { AccountCancel } from './AccountCancel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Search = { [key: string]: string | string[] | undefined };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function BadgeCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 12.5l5 5L19.5 6.5" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="2.75" width="10" height="18.5" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  );
}

export default async function AccountPage({ searchParams }: { searchParams: Search }) {
  const uid = first(searchParams.uid)?.trim();

  if (!uid) {
    return (
      <div className="card center">
        <div className="mark neutral" aria-hidden="true">
          <PhoneIcon />
        </div>
        <h1>Manage subscription</h1>
        <p>Open this page from the Edutu app so we can find your subscription.</p>
      </div>
    );
  }

  // Ownership: the /account/start handler set a signed cookie after verifying a
  // Clerk token. If session verification isn't configured yet, allow management
  // (uid-trusting fallback) so the flow still works pre-setup.
  const sessionUid = verifySession(cookies().get(SESSION_COOKIE)?.value);
  const canManage = sessionConfigured() ? sessionUid === uid : true;

  const status = await getEntitlementStatus(uid);
  const { data: sub } = await supabaseAdmin()
    .from('billing_subscriptions')
    .select('status, plan')
    .eq('user_id', uid)
    .eq('status', 'active')
    .maybeSingle();

  return (
    <div className="card">
      <div className="eyebrow">Your account</div>
      <h1>Your subscription</h1>

      {status.isPro ? (
        <>
          <div className="badge success">
            <BadgeCheck /> Pro active
          </div>
          <p>Your Edutu Pro access is active until <strong>{formatDate(status.expiresAt)}</strong>.</p>
          <div className="fact">
            <span className="k">Plan</span>
            <span className="v" style={{ textTransform: 'capitalize' }}>{sub?.plan ? sub.plan : 'Edutu Pro'}</span>
          </div>
          <div className="fact">
            <span className="k">Active until</span>
            <span className="v">{formatDate(status.expiresAt)}</span>
          </div>
          <div className="hr" />
          {sub ? (
            <>
              <h2>Auto-renew</h2>
              <p>Your plan renews automatically. Turn it off any time — you keep Pro until the end of the paid period.</p>
              {canManage ? (
                <AccountCancel uid={uid} />
              ) : (
                <p className="muted">Open this page from inside the Edutu app to cancel — we couldn&apos;t verify this session.</p>
              )}
            </>
          ) : (
            <p className="muted">This was a one-time purchase — it will not auto-renew. Buy again from the app to extend.</p>
          )}
        </>
      ) : (
        <>
          <div className="badge danger">No active Pro</div>
          <p>You don&apos;t have an active Edutu Pro subscription. Upgrade from the Edutu app to unlock Pro features.</p>
        </>
      )}
    </div>
  );
}
