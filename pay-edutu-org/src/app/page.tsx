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
          ? 'Edutu starts checkout securely through its billing service. Bachs hosts payment collection and account management.'
          : 'New payments are temporarily unavailable while we finish secure billing setup. Existing payment status and account management remain available.'}
      </p>
      <div className="btn-row">
        <a className="btn" href="/account">Manage account</a>
        <a className="btn secondary" href="/result">Check payment status</a>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>To start a new purchase, return to Edutu. Payment details are handled on Bachs&apos; hosted pages.</p>
    </div>
  );
}
