'use client';

import { useCallback, useEffect, useState } from 'react';
import { billingStatus, statusCopy, type BillingStatus } from '@/lib/billing-status';

type Result = { status: BillingStatus; supportReference?: string };

export function ResultStatus() {
  const [result, setResult] = useState<Result>({ status: 'processing' });
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/billing/status', { cache: 'no-store', credentials: 'same-origin' });
      if (response.status === 401) {
        setError('Sign in through Edutu to see your payment status.');
        return;
      }
      const body = await response.json().catch(() => null);
      const status = billingStatus(body?.status);
      if (!response.ok || !status) {
        setError('We cannot reach billing status right now. Please try again shortly.');
        return;
      }
      setError(null);
      setResult({ status, ...(typeof body.supportReference === 'string' ? { supportReference: body.supportReference } : {}) });
    } catch {
      setError('We cannot reach billing status right now. Please try again shortly.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (result.status !== 'processing') return;
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [refresh, result.status]);

  const copy = statusCopy(result.status);
  return (
    <div className="card center">
      <div className={`badge ${result.status === 'active' ? 'success' : result.status === 'processing' ? '' : 'danger'}`}>
        {copy.poll ? 'Processing' : copy.title}
      </div>
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      {error ? <div className="notice danger" role="alert"><span>{error}</span></div> : null}
      {result.supportReference ? <p className="muted">Support reference: <strong>{result.supportReference}</strong></p> : null}
      <div className="btn-row">
        <button className="btn" type="button" onClick={() => void refresh()}>Check status</button>
        <a className="btn secondary" href="/account">Manage account</a>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>Need help? Contact <strong>support@edutu.org</strong>.</p>
    </div>
  );
}
