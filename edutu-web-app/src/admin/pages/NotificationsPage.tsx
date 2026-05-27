import React, { useState } from 'react';
import { Bell, CalendarClock, Loader2, Send, ShieldCheck } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { getApiBaseUrl } from '../../lib/apiBaseUrl';
import { getLocalDevAuthHeaders } from '../../lib/localDevAuthHeaders';

const audiences = [
  { value: 'all', label: 'All users' },
  { value: 'approved_creators', label: 'Approved creators' },
  { value: 'creators', label: 'All creator applicants' },
  { value: 'specific', label: 'Specific user IDs' },
];

const NotificationsPage: React.FC = () => {
  const { getToken } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState('info');
  const [audience, setAudience] = useState('all');
  const [targetUserIds, setTargetUserIds] = useState('');
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);
    setError(null);

    try {
      const token = await getToken();
      const apiBaseUrl = getApiBaseUrl('Notifications API');
      const response = await fetch(`${apiBaseUrl}/notifications/admin/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...getLocalDevAuthHeaders(),
        },
        body: JSON.stringify({
          title,
          body,
          severity,
          kind: 'admin-broadcast',
          audience,
          targetUserIds:
            audience === 'specific'
              ? targetUserIds
                  .split(/\n|,/)
                  .map((item) => item.trim())
                  .filter(Boolean)
              : undefined,
          channels: {
            inApp: true,
            push,
            email,
          },
          scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || data?.error || 'Failed to send notification');
      }

      setResult(
        data.queued
          ? `Scheduled for ${new Date(data.scheduledFor).toLocaleString()}`
          : `Sent to ${data.recipientCount ?? 0} users. In-app rows: ${data.insertedCount ?? 0}. Push sent: ${data.push?.sent ?? 0}. Email sent: ${data.email?.sent ?? 0}.`,
      );
      if (!data.queued) {
        setTitle('');
        setBody('');
        setTargetUserIds('');
        setScheduledFor('');
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to send notification');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Broadcast announcements across in-app inbox, mobile push, desktop alerts, and email.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100 dark:border-gray-700">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <Bell size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Broadcast Palette</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Create one consistent message for every channel.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Title</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={120}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Application deadline alert"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Message</label>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
              rows={5}
              maxLength={1000}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              placeholder="Tell learners exactly what they need to do next."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Audience</label>
              <select
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                className="w-full px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
              >
                {audiences.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Severity</label>
              <select
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
                className="w-full px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
              >
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Schedule</label>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
                className="w-full px-3 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
              />
            </div>
          </div>

          {audience === 'specific' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Target user IDs</label>
              <textarea
                value={targetUserIds}
                onChange={(event) => setTargetUserIds(event.target.value)}
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white outline-none resize-none"
                placeholder="One Clerk or Supabase user ID per line"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked disabled />
              In-app inbox
            </label>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={push} onChange={(event) => setPush(event.target.checked)} />
              Mobile push
            </label>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={email} onChange={(event) => setEmail(event.target.checked)} />
              Email webhook
            </label>
          </div>

          {error && <div className="rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-3 text-sm">{error}</div>}
          {result && <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-4 py-3 text-sm">{result}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : scheduledFor ? <CalendarClock size={18} /> : <Send size={18} />}
            {scheduledFor ? 'Schedule broadcast' : 'Send broadcast'}
          </button>
        </form>

        <aside className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 h-fit">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck size={20} className="text-emerald-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Launch Notes</h2>
          </div>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <p>In-app notifications are stored immediately and show in each user notification screen.</p>
            <p>Mobile push uses saved Expo push tokens. Users must grant notification permission in the app.</p>
            <p>Email sending requires `NOTIFICATION_EMAIL_WEBHOOK_URL` on the backend; without it, email is safely skipped and reported.</p>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default NotificationsPage;
