import { config } from '@/lib/env';
import { verifyTransaction } from '@/lib/paystack';
import { grantPro, recordPayment } from '@/lib/entitlements';
import { isBillingPlan } from '@/lib/money';
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

// Plain-language copy for every reason code we can land here with. Without
// this the error screen showed a bare `Reason: init_failed`, which tells the
// user nothing and leaves them stuck on a web page with money in the balance.
// `charged: false` means we know for certain no transaction was ever created.
const REASONS: Record<string, { title: string; body: string; charged: boolean }> = {
  bad_request: {
    title: 'That checkout link was incomplete',
    body: 'The link that opened this page was missing (or had a damaged) account or plan detail, so we never started a payment. You have not been charged. Start the upgrade again from inside the Edutu app and it will build a fresh link.',
    charged: false,
  },
  init_failed: {
    title: 'We couldn’t reach our payment provider',
    body: 'Something went wrong while setting up your payment with Paystack — often a brief network or provider hiccup. Nothing was charged. Trying again usually works straight away.',
    charged: false,
  },
  missing_uid: {
    title: 'We couldn’t match this payment to your account',
    body: 'Your payment went through, but it arrived without the account tag we use to unlock Pro automatically. Your money is safe — email us the reference below and we will switch Pro on for you right away.',
    charged: true,
  },
  verify_failed: {
    title: 'We couldn’t confirm your payment yet',
    body: 'We were unable to double-check the payment with Paystack just now. If it succeeded, Pro will still activate automatically within a few minutes — Paystack notifies us separately. Reopen the app shortly to see it.',
    charged: true,
  },
};

const FALLBACK_REASON = {
  title: 'We hit a snag',
  body: 'Something unexpected interrupted this checkout. If a payment did go through, Pro will still activate automatically — otherwise you can start the upgrade again from the app.',
  charged: true,
};

// Paystack redirects here after payment (?reference=/?trxref=). We verify the
// transaction and, on success, grant Pro immediately for instant unlock — the
// webhook is the authoritative backup. Then we deep-link back into the app.
export default async function ReturnPage({ searchParams }: { searchParams: Search }) {
  const scheme = config.appScheme();
  const explicitStatus = first(searchParams.status);
  const reference = first(searchParams.reference) || first(searchParams.trxref);

  let outcome: 'success' | 'failed' | 'error' = 'error';
  let reason = first(searchParams.reason) || '';

  // /checkout forwards these on its error redirects so we can rebuild a working
  // checkout link here; on a Paystack-side failure we recover them from the
  // transaction's own metadata instead.
  const qPlan = first(searchParams.plan);
  let retryUid = first(searchParams.uid);
  let retryPlan = isBillingPlan(qPlan) ? qPlan : undefined;
  let retryEmail = first(searchParams.email);
  // Where the buyer came from. Web buyers must NOT be handed an `edutu://`
  // deep link — on a desktop browser that button does nothing.
  let platform = first(searchParams.platform);

  if (explicitStatus !== 'error' && reference) {
    try {
      const verified = await verifyTransaction(reference);
      if (verified) {
        // Once Paystack owns the flow, the transaction's metadata is our only
        // handle on who this was for — it's what makes the retry link below
        // work on a failure screen the user reached straight from Paystack.
        const metaUid = verified.metadata?.uid as string | undefined;
        if (!retryUid && metaUid) retryUid = metaUid;
        if (!retryPlan && isBillingPlan(verified.metadata?.plan)) retryPlan = verified.metadata.plan;
        // Never pre-fill the synthetic placeholder address into a retry — that
        // would carry the "no receipt reaches this buyer" problem forward.
        if (!retryEmail && verified.email && !verified.email.endsWith('@users.edutu.org')) {
          retryEmail = verified.email;
        }
        // Paystack's own callback carries no query of ours, so the platform we
        // stamped into metadata at /checkout is the only signal on this path.
        if (!platform && typeof verified.metadata?.platform === 'string') {
          platform = verified.metadata.platform;
        }
      }
      if (verified && verified.status === 'success') {
        const uid = verified.metadata?.uid as string | undefined;
        const plan = isBillingPlan(verified.metadata?.plan) ? verified.metadata.plan : 'monthly';
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
          if (isNew) {
            await grantPro({ userId: uid, plan, source: 'paystack', reference: verified.reference, email: verified.email });
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

  // A web buyer gets an https link back into the web app; a device buyer gets
  // the `edutu://` deep link. Sending the deep link to a desktop browser is a
  // dead button at the exact moment the user has just paid us.
  const isWeb = platform === 'web';
  const returnLabel = isWeb ? 'Back to Edutu' : undefined;
  const returnTo = (status: string, extra?: string) =>
    isWeb
      ? `${config.webAppUrl()}/app/home?billing=${status}${extra ? `&${extra}` : ''}`
      : `${scheme}://paywall?status=${status}${extra ? `&${extra}` : ''}`;

  const deepLink = returnTo(outcome);

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
        <p>
          Your upgrade is active. Head back to {isWeb ? 'Edutu' : 'the app'} — your Pro features are
          unlocked.
        </p>
        <ReturnRedirect deepLink={deepLink} label={returnLabel} />
        <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
          A receipt is on its way to your email from Paystack.
        </p>
      </div>
    );
  }

  // A one-tap way back into checkout, built server-side so the button works
  // even if the app's original link is long gone from the browser history.
  // Omitted (rather than rendered broken) when we don't know the uid/plan.
  const retryHref =
    retryUid && retryPlan
      ? `/checkout?${new URLSearchParams({
          uid: retryUid,
          plan: retryPlan,
          ...(retryEmail ? { email: retryEmail } : {}),
          ref: 'return-retry',
        }).toString()}`
      : null;

  if (outcome === 'failed') {
    return (
      <div className="card center">
        <div className="mark danger" aria-hidden="true">
          <XIcon />
        </div>
        <div className="badge danger" style={{ margin: '0 auto 14px' }}>Payment not completed</div>
        <h1>Payment didn&apos;t go through</h1>
        <p>
          <strong>You weren&apos;t charged.</strong> The payment was cancelled or declined before it
          completed — often a card limit, or simply closing the page. You can pick up right where you
          left off.
        </p>
        {retryHref ? (
          <>
            <a className="btn" href={retryHref}>
              Try the payment again
              <span className="chip" aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 12h15M13 5.5 19.5 12 13 18.5" />
                </svg>
              </span>
            </a>
            <ReturnRedirect
              deepLink={returnTo('failed')}
              auto={false}
              label={isWeb ? 'Back to Edutu' : 'Back to the app'}
              className="btn secondary"
            />
          </>
        ) : (
          <ReturnRedirect deepLink={returnTo('failed')} label={returnLabel} />
        )}
      </div>
    );
  }

  // Error screen. Never a dead end: say what happened in plain words, say
  // whether money moved, then give a retry AND a way back into the app.
  const copy = REASONS[reason] || FALLBACK_REASON;

  return (
    <div className="card center">
      <div className="mark danger" aria-hidden="true">
        <AlertIcon />
      </div>
      <div className="badge danger" style={{ margin: '0 auto 14px' }}>
        {copy.charged ? 'Needs a quick check' : 'Payment not started'}
      </div>
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      {retryHref && !copy.charged ? (
        <a className="btn" href={retryHref}>
          Try again
          <span className="chip" aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 12h15M13 5.5 19.5 12 13 18.5" />
            </svg>
          </span>
        </a>
      ) : null}
      {/* No auto-bounce here — the user needs to read the copy above (and, if
          they were charged, copy the reference) before we throw them back. */}
      <ReturnRedirect
        deepLink={returnTo('error', reason ? `reason=${encodeURIComponent(reason)}` : undefined)}
        auto={false}
        label={isWeb ? 'Back to Edutu' : 'Back to the Edutu app'}
        className={retryHref && !copy.charged ? 'btn secondary' : 'btn'}
      />
      <p className="muted" style={{ marginTop: 14, marginBottom: 0 }}>
        Need a hand? Email <strong>support@edutu.org</strong>
        {reference ? (
          <>
            {' '}
            and quote reference <strong>{reference}</strong>
          </>
        ) : null}
        . If you were charged, your Pro will still activate automatically.
      </p>
    </div>
  );
}
