import { config } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const checkoutEnabled = config.bachsCheckoutEnabled();
  return (
    <div className="card center">
      <div className="eyebrow">Edutu payments</div>
      <h1>{checkoutEnabled ? 'Manage your Edutu payment' : 'Payments are not ready yet'}</h1>
      <p>
        {checkoutEnabled
          ? 'Start a purchase in Edutu and complete payment on Bachs. This page keeps account access and payment status available.'
          : 'New payments are temporarily unavailable while we finish secure billing setup. Existing payment status and account management remain available.'}
      </p>
      <div className="btn-row">
        <a className="btn" href="/account" aria-label="Manage account">Account</a>
        <a className="btn secondary" href="/result" aria-label="Check payment status">Payment status</a>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>Choose your plan in Edutu. Payment details are entered on Bachs&apos; hosted checkout.</p>
    </div>
  );
}
