'use client';

import { useState } from 'react';

export function AccountCancel({ uid }: { uid: string }) {
  const [state, setState] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cancel = async () => {
    setState('loading');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/account/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ uid }),
      });
      if (res.ok) {
        setState('done');
      } else {
        const json = await res.json().catch(() => ({} as { error?: string }));
        setErrorMsg(json.error === 'no active subscription'
          ? 'We couldn’t find an active subscription to cancel — it may already be off.'
          : null);
        setState('error');
      }
    } catch {
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <div className="notice success">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', marginTop: 2 }}>
          <path d="M4.5 12.5l5 5L19.5 6.5" />
        </svg>
        <span>Auto-renew has been turned off. Pro stays active until your current period ends.</span>
      </div>
    );
  }

  if (state === 'confirm' || state === 'loading') {
    return (
      <>
        <p className="muted" style={{ marginTop: 0 }}>
          Turn off auto-renew? You keep every Pro feature until the end of your paid period — no refund is issued, and you can resubscribe anytime.
        </p>
        <div className="btn-row">
          <button className="btn danger" onClick={cancel} disabled={state === 'loading'}>
            {state === 'loading' ? 'Cancelling…' : 'Yes, turn off auto-renew'}
          </button>
          <button className="btn" onClick={() => setState('idle')} disabled={state === 'loading'}>
            Keep my plan
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <button className="btn danger" onClick={() => setState('confirm')}>
        Cancel auto-renew
      </button>
      {state === 'error' && (
        <div className="notice danger">
          <span>{errorMsg || 'Couldn’t cancel automatically. Contact support@edutu.org and we’ll sort it out.'}</span>
        </div>
      )}
    </>
  );
}
