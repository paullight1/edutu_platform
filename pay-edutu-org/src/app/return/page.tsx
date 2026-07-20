import { config } from '@/lib/env';
import { verifyTransaction } from '@/lib/paystack';
import { grantPro, recordPayment } from '@/lib/entitlements';
import { addDays, isBillingPlan } from '@/lib/money';
import { fetchPricing } from '@/lib/pricing';
import { ReturnRedirect } from './ReturnRedirect';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Search = { [key: string]: string | string[] | undefined };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function CheckIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="draw" d="M5 12.8l4.4 4.4L19 7.4" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 7.5v6" />
      <circle cx="12" cy="17" r="0.4" fill="currentColor" />
    </svg>
  );
}

function BadgeCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 12.5l5 5L19.5 6.5" />
    </svg>
  );
}

// Paystack redirects here after payment (?reference=/?trxref=). We verify the
// transaction and, on success, grant Pro immediately for instant unlock — the
// webhook is the authoritative backup. Then we deep-link back into the app.
export default async function ReturnPage({ searchParams }: { searchParams: Search }) {
  const scheme = config.appScheme();
  const explicitStatus = first(searchParams.status);
  const reference = first(searchParams.reference) || first(searchParams.trxref);

  let outcome: 'success' | 'failed' | 'error' = 'error';
  let reason = first(searchParams.reason) || '';

  if (explicitStatus !== 'error' && reference) {
    try {
      const verified = await verifyTransaction(reference);
      if (verified && verified.status === 'success') {
        const uid = verified.metadata?.uid as string | undefined;
        const isSeason = verified.reference.startsWith('edutu_season_');
        const plan = isBillingPlan(verified.metadata?.plan) ? verified.metadata.plan : isSeason ? 'season' : 'monthly';
        if (uid) {
          const isNew = await recordPayment({
            userId: uid,
            email: verified.email,
            plan,
            amountMajor: verified.amountMinor / 100,
            currency: verified.currency,
            reference: verified.reference,
            status: 'success',
            raw: verified,
          });
          // recordPayment dedupes by reference, so only the FIRST of the
          // /return-page and webhook races runs grantPro — no double grant.
          if (isNew) {
            if (isSeason) {
              // One-off pass → fixed expiry now + admin-configured duration
              // (identical to the webhook path; fallback 90 if config unavailable).
              const durationDays = (await fetchPricing()).seasonPass.durationDays;
              await grantPro({
                userId: uid,
                plan: 'season',
                source: 'season_pass',
                reference: verified.reference,
                email: verified.email,
                expiresAt: addDays(new Date(), durationDays),
              });
            } else {
              await grantPro({ userId: uid, plan, source: 'paystack', reference: verified.reference, email: verified.email });
            }
          }
          outcome = 'success';
        } else {
          outcome = 'error';
          reason = 'missing_uid';
        }
      } else {
        outcome = 'failed';
      }
    } catch (e) {
      console.error('return verify failed', e);
      outcome = 'error';
      reason = 'verify_failed';
    }
  }

  const deepLink = `${scheme}://paywall?status=${outcome}`;

  if (outcome === 'success') {
    return (
      <div className="card center">
        <div className="mark success" aria-hidden="true">
          <CheckIcon />
        </div>
        <div className="badge success" style={{ margin: '0 auto 14px' }}>
          <BadgeCheck /> Payment confirmed
        </div>
        <h1>You&apos;re Edutu Pro 🎉</h1>
        <p>Your upgrade is active. Head back to the app — your Pro features are unlocked.</p>
        <ReturnRedirect deepLink={deepLink} />
        <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
          A receipt is on its way to your email from Paystack.
        </p>
      </div>
    );
  }

  if (outcome === 'failed') {
    return (
      <div className="card center">
        <div className="mark danger" aria-hidden="true">
          <XIcon />
        </div>
        <div className="badge danger" style={{ margin: '0 auto 14px' }}>Payment not completed</div>
        <h1>Payment didn&apos;t go through</h1>
        <p>
          <strong>You weren&apos;t charged.</strong> You can try again from the Edutu app anytime.
        </p>
        <ReturnRedirect deepLink={`${scheme}://paywall?status=failed`} />
      </div>
    );
  }

  return (
    <div className="card center">
      <div className="mark danger" aria-hidden="true">
        <AlertIcon />
      </div>
      <div className="badge danger" style={{ margin: '0 auto 14px' }}>Something went wrong</div>
      <h1>We hit a snag</h1>
      <p>{reason ? `Reason: ${reason}. ` : ''}Please return to the app and try again.</p>
      <ReturnRedirect deepLink={`${scheme}://paywall?status=error`} />
      <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
        If you were charged, your Pro will still activate automatically — or reach us at support@edutu.org.
      </p>
    </div>
  );
}
