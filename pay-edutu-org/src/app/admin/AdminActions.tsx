'use client';

import { useState } from 'react';

// Grant free Pro / bonanzas and revoke access. The admin token is passed to the
// APIs as a Bearer header (never persisted).
export function AdminActions({ token }: { token: string }) {
  const [uid, setUid] = useState('');
  const [plan, setPlan] = useState('yearly');
  const [days, setDays] = useState('');
  const [reason, setReason] = useState('bonanza');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      setMsg(res.ok ? '✓ Done.' : `Error: ${json.error || res.status}`);
    } catch (e) {
      setMsg('Network error');
    } finally {
      setBusy(false);
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
      <input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="user_2 abc…" />

      <label>Plan</label>
      <select value={plan} onChange={(e) => setPlan(e.target.value)}>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>

      <label>Custom duration in days (optional — overrides plan)</label>
      <input value={days} onChange={(e) => setDays(e.target.value)} placeholder="e.g. 90" inputMode="numeric" />

      <label>Reason / note</label>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="bonanza, refund make-good…" />

      <div className="btn-row">
        <button
          className="btn"
          disabled={busy || !uid.trim()}
          onClick={() => call('/api/admin/grant', { uid: uid.trim(), plan, days: days.trim() || undefined, reason })}
        >
          {busy ? 'Working…' : 'Grant Pro'}
        </button>
        <button
          className="btn danger"
          disabled={busy || !uid.trim()}
          onClick={() => call('/api/admin/revoke', { uid: uid.trim() })}
        >
          Revoke Pro
        </button>
      </div>

      {msg && (
        <div className={`notice ${msg.startsWith('✓') ? 'success' : 'danger'}`} role="status">
          <span>{msg}</span>
        </div>
      )}
    </div>
  );
}
