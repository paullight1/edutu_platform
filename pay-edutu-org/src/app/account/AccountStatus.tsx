'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type AccountItem = {
  provider: 'bachs' | 'app_store' | 'play_store' | 'one_time_pass' | 'credits';
  status: 'active' | 'past_due' | 'cancelled' | 'expired';
  paidThrough?: string;
  renewalMode?: 'recurring' | 'one_time';
  supportReference?: string;
};

const PROVIDER_LABEL: Record<AccountItem['provider'], string> = {
  bachs: 'Bachs web purchase',
  app_store: 'Apple App Store',
  play_store: 'Google Play',
  one_time_pass: 'One-time access pass',
  credits: 'Credit pack',
};

function formatDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function AccountStatus() {
  const [items, setItems] = useState<AccountItem[] | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch('/api/billing/account', { cache: 'no-store', credentials: 'same-origin' });
    if (response.status === 401) {
      setNeedsSignIn(true);
      return;
    }
    const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body?.items)) {
      setMessage('Your billing account is not available right now. Please try again later.');
      return;
    }
    setNeedsSignIn(false);
    setItems(body.items);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function exchangeCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/auth/exchange', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        setMessage('That one-time code could not be used. Request a new code from Edutu and try again.');
        return;
      }
      setCode('');
      await load();
    } catch {
      setMessage('We could not sign you in right now. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function manageBachs() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/billing/portal-session', { method: 'POST', credentials: 'same-origin' });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.url !== 'string') {
        setMessage(response.status === 404 ? 'No Bachs subscription is available to manage.' : 'The Bachs portal is not available right now. Please try again.');
        return;
      }
      const url = new URL(body.url);
      if (url.protocol !== 'https:' || url.hostname !== 'portal.bachs.io') {
        setMessage('The portal response was not valid. Please contact support.');
        return;
      }
      window.location.assign(url.toString());
    } catch {
      setMessage('The Bachs portal is not available right now. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (needsSignIn) {
    return (
      <div className="card center">
        <div className="eyebrow">Account access</div>
        <h1>Sign in from Edutu</h1>
        <p>Request a one-time account code in Edutu, then enter it here. The code is exchanged by this site over a secure POST request and is never placed in a link.</p>
        <form onSubmit={exchangeCode}>
          <label htmlFor="one-time-code">One-time code</label>
          <input id="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" required />
          <button className="btn" type="submit" disabled={busy || code.length < 32}>{busy ? 'Signing in…' : 'Continue'}</button>
        </form>
        {message ? <div className="notice danger" role="alert"><span>{message}</span></div> : null}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="eyebrow">Billing account</div>
      <h1>Manage your Edutu access</h1>
      <p>Your access is confirmed by Edutu&apos;s billing service. Each purchase channel is managed by its owner.</p>
      {message ? <div className="notice danger" role="alert"><span>{message}</span></div> : null}
      {!items ? <p className="muted">Loading account details…</p> : null}
      {items?.length === 0 ? <p className="muted">No active or recent billing records were found for this account.</p> : null}
      <div className="list">
        {items?.map((item, index) => {
          const date = formatDate(item.paidThrough);
          return <div className="row" key={`${item.provider}-${index}`}>
            <span>
              <strong>{PROVIDER_LABEL[item.provider]}</strong><br />
              <span className="muted">{item.status.replace('_', ' ')}{date ? ` · access until ${date}` : ''}{item.renewalMode === 'recurring' ? ' · renews automatically' : item.renewalMode === 'one_time' ? ' · renew manually' : ''}</span>
              {item.supportReference ? <><br /><span className="muted">Support reference: {item.supportReference}</span></> : null}
            </span>
            {item.provider === 'bachs' ? <button className="btn secondary" type="button" disabled={busy} onClick={() => void manageBachs()}>Manage Bachs subscription</button> : null}
            {item.provider === 'app_store' ? <span className="muted">Manage this purchase in your Apple App Store subscriptions.</span> : null}
            {item.provider === 'play_store' ? <span className="muted">Manage this purchase in your Google Play subscriptions.</span> : null}
          </div>;
        })}
      </div>
    </div>
  );
}
