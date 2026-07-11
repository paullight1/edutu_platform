'use client';

import { useState } from 'react';

// Grant free Pro / bonanzas and revoke access. Authenticated by the httpOnly
// admin session cookie (set at login) — no token in JS, markup or URLs.
export function AdminActions() {
  const [uid, setUid] = useState('');
  const [plan, setPlan] = useState('yearly');
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('bonanza');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const daysNum = days.trim() === '' ? null : Number(days);
  const daysInvalid = daysNum !== null && (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 3650);

  const call = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setMsg('Error: session expired — refresh the page and sign in again.');
      } else {
        setMsg(res.ok ? `✓ Done.${json.expiresAt ? ` Pro until ${new Date(json.expiresAt).toLocaleDateString()}.` : ''}` : `Error: ${json.error || res.status}`);
      }
    } catch (e) {
      setMsg('Network error — check your connection and try again.');
    } finally {
      setBusy(false);
      setConfirmRevoke(false);
    }
  };

  return (
    <div className="card d2" style={{ marginTop: 26 }}>
      <div className="eyebrow">Manual controls</div>
      <h2 style={{ marginTop: 0 }}>Award / revoke Pro</h2>
      <p className="muted" style={{ marginBottom: 0 }}>
        Grant complimentary Pro (bonanzas, refunds, make-goods) or revoke access. Actions apply instantly.
      </p>

      <label>Edutu user id (uid)</label>
      <input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="user_2abc…" />

      <label>Plan</label>
      <select value={plan} onChange={(e) => setPlan(e.target.value)}>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>

      <label>Custom duration in days (optional — overrides plan, max 3650)</label>
      <input value={days} onChange={(e) => setDays(e.target.value)} placeholder="e.g. 90" inputMode="numeric" />
      {daysInvalid && (
        <div className="notice danger" role="alert">
          <span>Duration must be a whole number between 1 and 3650 days.</span>
        </div>
      )}

      <label>Reason / note</label>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="bonanza, refund make-good…" />

      <div className="btn-row">
        <button
          className="btn"
          disabled={busy || !uid.trim() || daysInvalid}
          onClick={() => call('/api/admin/grant', { uid: uid.trim(), plan, days: days.trim() || undefined, reason })}
        >
          {busy ? 'Working…' : 'Grant Pro'}
        </button>
        {confirmRevoke ? (
          <>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => call('/api/admin/revoke', { uid: uid.trim() })}
            >
              {busy ? 'Working…' : `Really revoke ${uid.trim().slice(0, 14)}…?`}
            </button>
            <button className="btn" disabled={busy} onClick={() => setConfirmRevoke(false)}>
              Keep Pro
            </button>
          </>
        ) : (
          <button
            className="btn danger"
            disabled={busy || !uid.trim()}
            onClick={() => setConfirmRevoke(true)}
          >
            Revoke Pro
          </button>
        )}
      </div>

      {msg && (
        <div className={`notice ${msg.startsWith('✓') ? 'success' : 'danger'}`} role="status">
          <span>{msg}</span>
        </div>
      )}
    </div>
  );
}
