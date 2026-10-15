'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { billingStatus, statusCopy, type BillingStatus } from '@/lib/billing-status';

type Result = { status: BillingStatus; supportReference?: string };

export function ResultStatus() {
  const [result, setResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState(true);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollPaused, setPollPaused] = useState(false);
  const requestInFlight = useRef(false);
  const pollingStartedAt = useRef(Date.now());

  const refresh = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setChecking(true);
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
      requestInFlight.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (result?.status !== 'processing' || needsSignIn || pollPaused) return;
    const timer = window.setInterval(() => {
      // Avoid burning network/data while the user is away. Keep manual refresh available.
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - pollingStartedAt.current > 120_000) {
        setPollPaused(true);
        return;
      }
      void refresh();
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [needsSignIn, pollPaused, refresh, result?.status]);

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
  const active = result?.status === 'active';
  const needsAttention = !!result && !active && result.status !== 'processing';
  return (
    <div className="card center">
      <div className={`badge ${active ? 'success' : needsAttention ? 'danger' : ''}`} role="status" aria-live="polite">
        {processing ? 'Confirmation pending' : copy.title}
      </div>
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      {result && (
        <ol className="payment-status-steps" aria-label="Payment progress">
          <li className="is-complete"><span aria-hidden="true">1</span><strong>Checkout initiated</strong></li>
          <li className={active ? 'is-complete' : processing ? 'is-current' : 'is-attention'}><span aria-hidden="true">2</span><strong>Payment confirmation</strong></li>
          <li className={active ? 'is-complete' : ''}><span aria-hidden="true">3</span><strong>Edutu access enabled</strong></li>
        </ol>
      )}
      {processing && result ? (
        <div className="notice" role="status">
          <span>{pollPaused ? 'Confirmation is taking longer than usual. You can check again below without starting a new payment.' : 'Please do not pay again while confirmation is pending. We will update this page when Edutu confirms the result.'}</span>
        </div>
      ) : null}
      {error ? <div className="notice danger" role="alert"><span>{error}</span></div> : null}
      {result?.supportReference ? <p className="muted">Support reference: <strong>{result.supportReference}</strong></p> : null}
      <div className="btn-row">
        <button className={active ? 'btn secondary' : 'btn'} type="button" onClick={() => void refresh()} disabled={checking} aria-busy={checking}>
          {checking ? 'Checking…' : 'Check again'}
        </button>
        <a className={active ? 'btn' : 'btn secondary'} href="https://app.edutu.org/app/wallet">{active ? 'Continue to Edutu' : 'Return to Edutu wallet'}</a>
        <a className="btn secondary" href="/account">Manage account</a>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>Need help? Contact <strong>support@edutu.org</strong>.</p>
    </div>
  );
}
