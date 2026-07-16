import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Send } from 'lucide-react';
import {
  appControlApi,
  type BroadcastPayload,
  type QueuedBroadcast,
} from '../lib/mobileControlApi';
import { SelectField, TextField, styles as mcStyles } from './MobileControl';

const pushTemplate: BroadcastPayload = {
  title: '',
  body: '',
  severity: 'info',
  audience: 'all',
  channels: { inApp: true, push: true },
};

/* One-off announcement to users' devices + in-app inbox, now or scheduled. */
export default function Notifications() {
  const [draft, setDraft] = useState<BroadcastPayload>(pushTemplate);
  const [route, setRoute] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [sending, setSending] = useState(false);
  const [queue, setQueue] = useState<QueuedBroadcast[]>([]);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    appControlApi.listQueue().then(setQueue).catch(() => setQueue([]));
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const audienceLabel =
    draft.audience === 'creators' ? 'all creators'
      : draft.audience === 'approved_creators' ? 'approved creators'
        : 'ALL users';

  async function send() {
    const when = scheduleAt ? new Date(scheduleAt) : null;
    const confirmText = when
      ? `Schedule "${draft.title}" for ${audienceLabel} at ${when.toLocaleString()}?`
      : `Send "${draft.title}" to ${audienceLabel} right now? This cannot be recalled.`;
    if (!window.confirm(confirmText)) return;

    setSending(true);
    setError(null);
    try {
      const payload: BroadcastPayload = {
        ...draft,
        title: draft.title.trim(),
        body: draft.body.trim(),
        ...(route.trim().startsWith('/') || route.trim().startsWith('http')
          ? { metadata: { url: route.trim() } }
          : {}),
        ...(when ? { scheduledFor: when.toISOString() } : {}),
      };
      const result = await appControlApi.broadcast(payload);
      if (result.queued) {
        setNotice('Notification scheduled.');
        setLastResult(`Scheduled for ${result.scheduledFor ? new Date(String(result.scheduledFor)).toLocaleString() : 'later'}.`);
      } else {
        const inApp = result.inApp?.sent;
        const push = result.push?.sent;
        const summary = [
          typeof inApp === 'number' ? `${inApp} in-app` : null,
          typeof push === 'number' ? `${push} push` : null,
        ].filter(Boolean).join(', ');
        setNotice('Notification sent.');
        setLastResult(summary ? `Delivered: ${summary}.` : 'Delivered.');
      }
      setDraft(pushTemplate);
      setRoute('');
      setScheduleAt('');
      appControlApi.listQueue().then(setQueue).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the notification');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mc-page">
      <header className="mc-header">
        <div>
          <h1>Notifications</h1>
          <p>
            Send an announcement to users’ devices and in-app inboxes — immediately or on a
            schedule. Users who turned push off still get the in-app copy.
          </p>
        </div>
      </header>

      {error && <div className="mc-alert" role="alert"><AlertTriangle size={16} /> {error}</div>}
      {notice && <div className="mc-notice" role="status"><CheckCircle2 size={16} /> {notice}</div>}

      <div className="mc-grid">
        <section className="mc-panel">
          <div className="mc-panel-head"><h2>New notification</h2></div>
          <div className="mc-form">
            <TextField label="Title" wide placeholder="e.g. 12 new scholarships close this week" value={draft.title} onChange={(title) => setDraft({ ...draft, title })} />
            <label className="mc-field mc-field-wide">
              <span>Message</span>
              <textarea rows={3} style={{ fontFamily: 'inherit', fontSize: 14 }} placeholder="What should users read?" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </label>
            <SelectField label="Audience" value={draft.audience || 'all'} options={['all', 'creators', 'approved_creators']} onChange={(audience) => setDraft({ ...draft, audience: audience as BroadcastPayload['audience'] })} />
            <SelectField label="Tone" hint="Colors the in-app notification." value={draft.severity || 'info'} options={['info', 'success', 'warning', 'critical']} onChange={(severity) => setDraft({ ...draft, severity: severity as BroadcastPayload['severity'] })} />
            <TextField label="Opens (optional)" placeholder="/opportunities or https://…" hint="Where tapping the notification takes the user." value={route} onChange={setRoute} />
            <label className="mc-field">
              <span>Schedule (optional)</span>
              <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
              <small>Leave empty to send immediately.</small>
            </label>
            <div className="mc-field mc-field-wide">
              <span>Channels</span>
              <label className="mc-check">
                <input type="checkbox" checked={draft.channels?.push !== false} onChange={(e) => setDraft({ ...draft, channels: { ...draft.channels, push: e.target.checked } })} />
                Device push notification
              </label>
              <label className="mc-check">
                <input type="checkbox" checked={draft.channels?.inApp !== false} onChange={(e) => setDraft({ ...draft, channels: { ...draft.channels, inApp: e.target.checked } })} />
                In-app inbox
              </label>
            </div>
          </div>
          <button className="mc-button" onClick={() => void send()} disabled={sending || !draft.title.trim() || !draft.body.trim()}>
            {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />} {scheduleAt ? 'Schedule notification' : `Send to ${audienceLabel}`}
          </button>
          {lastResult && <p className="mc-panel-sub" style={{ marginTop: 12 }}>{lastResult}</p>}
        </section>

        <section className="mc-panel">
          <div className="mc-panel-head"><h2>Scheduled & recent</h2></div>
          <div className="mc-list">
            {queue.length === 0 && (
              <div className="mc-empty">
                Nothing scheduled. Notifications you schedule for later appear here until they go out.
              </div>
            )}
            {queue.map((item) => (
              <article key={item.id} className="mc-row">
                <div className="mc-row-main">
                  <strong>{item.payload?.title || 'Untitled'}</strong>
                  <span>
                    {item.scheduledFor ? `for ${new Date(item.scheduledFor).toLocaleString()}` : 'immediate'}
                    {item.status ? ` · ${item.status}` : ''}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <style>{mcStyles}</style>
    </div>
  );
}
