'use client';

import { useState } from 'react';

export function AccountCancel({ uid }: { uid: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const cancel = async () => {
    setState('loading');
    try {
      const res = await fetch('/api/account/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      });
      setState(res.ok ? 'done' : 'error');
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

  return (
    <>
      <button className="btn danger" onClick={cancel} disabled={state === 'loading'}>
        {state === 'loading' ? 'Cancelling…' : 'Cancel auto-renew'}
      </button>
      {state === 'error' && (
        <div className="notice danger">
          <span>Couldn&apos;t cancel automatically. Contact support@edutu.org.</span>
        </div>
      )}
    </>
  );
}
