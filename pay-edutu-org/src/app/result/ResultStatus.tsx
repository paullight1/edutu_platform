'use client';

import { useCallback, useEffect, useState } from 'react';
import { billingStatus, statusCopy, type BillingStatus } from '@/lib/billing-status';

type Result = { status: BillingStatus; supportReference?: string };

export function ResultStatus() {
  const [result, setResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState(true);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/billing/status', { cache: 'no-store', credentials: 'same-origin' });
      if (response.status === 401) {
        setNeedsSignIn(true);
        setResult(null);
        setError(null);
        return;
      }
      const body = await response.json().catch(() => null);
      const status = billingStatus(body?.status);
      if (!response.ok || !status) {
        setError('We cannot reach billing status right now. Please try again shortly.');
        return;
      }
      setNeedsSignIn(false);
      setError(null);
      setResult({ status, ...(typeof body.supportReference === 'string' ? { supportReference: body.supportReference } : {}) });
    } catch {
      setError('We cannot reach billing status right now. Please try again shortly.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (result?.status !== 'processing' || needsSignIn) return;
    const timer = window.setInterval(() => void refresh(), 3_000);
    return () => window.clearInterval(timer);
  }, [needsSignIn, refresh, result?.status]);

  const copy = result
    ? statusCopy(result.status)
    : needsSignIn
      ? {
          title: 'Sign in to view your payment status',
          body: 'Open payment status from Edutu so we can securely confirm your purchase.',
          poll: false,
        }
      : checking
        ? {
            title: 'Checking payment status',
            body: 'We are securely checking with Edutu’s billing service.',
            poll: false,
          }
        : {
            title: 'Payment status unavailable',
            body: 'We could not confirm your payment status. Please try again.',
            poll: false,
          };
  const processing = result?.status === 'processing' || (checking && !result);
  return (
    <div className="card center">
      <div className={`badge ${result?.status === 'active' ? 'success' : processing ? '' : 'danger'}`}>
        {processing ? 'Processing' : copy.title}
      </div>
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      {error ? <div className="notice danger" role="alert"><span>{error}</span></div> : null}
      {result?.supportReference ? <p className="muted">Support reference: <strong>{result.supportReference}</strong></p> : null}
      <div className="btn-row">
        <button className="btn" type="button" onClick={() => void refresh()}>Check status</button>
        <a className="btn secondary" href="/account">Manage account</a>
        <a className="btn secondary" href="https://app.edutu.org/app/wallet">Return to Edutu wallet</a>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>Need help? Contact <strong>support@edutu.org</strong>.</p>
    </div>
  );
}
