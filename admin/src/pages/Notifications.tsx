import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
    AlertCircle,
    BellRing,
    CalendarClock,
    Loader2,
    Mail,
    MessageSquare,
    PlayCircle,
    RefreshCw,
    Send,
    Smartphone,
    X,
} from 'lucide-react';
import { backendFetchJson } from '../lib/backend';

type NotificationKind =
    | 'admin-broadcast'
    | 'system'
    | 'opportunity-alert'
    | 'goal-reminder';

type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical';

type BroadcastAudience = 'all' | 'specific' | 'creators' | 'approved_creators';

interface BroadcastChannelResult {
    sent?: number;
    skipped?: string;
    failed?: string;
    muted?: number;
    deferredForQuietHours?: number;
    provider?: string;
    [key: string]: unknown;
}

interface BroadcastResponse {
    queued: boolean;
    // Scheduled path
    id?: string;
    scheduledFor?: string | null;
    // Immediate path
    recipientCount?: number;
    insertedCount?: number;
    push?: BroadcastChannelResult;
    email?: BroadcastChannelResult;
}

interface QueueItem {
    id: string;
    payload: {
        title?: string;
        audience?: string;
        kind?: string;
        [key: string]: unknown;
    };
    scheduledFor: string | null;
    status: string;
    processedAt: string | null;
    createdAt: string | null;
    result: Record<string, unknown> | null;
}

type Banner = {
    type: 'success' | 'warning' | 'error';
    message: string;
} | null;

const kindOptions: Array<{ value: NotificationKind; label: string }> = [
    { value: 'admin-broadcast', label: 'Admin broadcast' },
    { value: 'system', label: 'System' },
    { value: 'opportunity-alert', label: 'Opportunity alert' },
    { value: 'goal-reminder', label: 'Goal reminder' },
];

const severityOptions: Array<{ value: NotificationSeverity; label: string }> = [
    { value: 'info', label: 'Info' },
    { value: 'success', label: 'Success' },
    { value: 'warning', label: 'Warning' },
    { value: 'critical', label: 'Critical' },
];

const audienceOptions: Array<{ value: BroadcastAudience; label: string }> = [
    { value: 'all', label: 'All users' },
    { value: 'specific', label: 'Specific user IDs' },
    { value: 'creators', label: 'Creators' },
    { value: 'approved_creators', label: 'Approved creators' },
];

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function statusBadgeClass(status: string): string {
    switch (status) {
        case 'completed':
            return 'badge-success';
        case 'failed':
            return 'badge-danger';
        case 'processing':
            return 'badge-warning';
        default:
            return 'badge-primary';
    }
}

function channelSummary(result: BroadcastChannelResult | undefined): string {
    if (!result) return '—';
    const parts: string[] = [`sent ${result.sent ?? 0}`];
    if (typeof result.muted === 'number') parts.push(`muted ${result.muted}`);
    if (typeof result.deferredForQuietHours === 'number') {
        parts.push(`deferred ${result.deferredForQuietHours}`);
    }
    if (result.skipped) parts.push(`skipped: ${result.skipped}`);
    if (result.failed) parts.push(`failed: ${result.failed}`);
    return parts.join(' · ');
}

const Notifications = () => {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [kind, setKind] = useState<NotificationKind>('admin-broadcast');
    const [severity, setSeverity] = useState<NotificationSeverity>('info');
    const [audience, setAudience] = useState<BroadcastAudience>('all');
    const [targetUserIdsText, setTargetUserIdsText] = useState('');
    const [channelInApp, setChannelInApp] = useState(true);
    const [channelPush, setChannelPush] = useState(false);
    const [channelEmail, setChannelEmail] = useState(false);
    const [scheduledFor, setScheduledFor] = useState('');

    const [sending, setSending] = useState(false);
    const [lastResult, setLastResult] = useState<BroadcastResponse | null>(null);
    const [banner, setBanner] = useState<Banner>(null);

    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [queueLoading, setQueueLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    const fetchQueue = useCallback(async () => {
        setQueueLoading(true);
        try {
            const items = await backendFetchJson<QueueItem[]>(
                '/notifications/admin/queue?limit=100',
            );
            setQueue(Array.isArray(items) ? items : []);
        } catch (error) {
            setBanner({
                type: 'error',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unable to load the notification queue.',
            });
        } finally {
            setQueueLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchQueue();
    }, [fetchQueue]);

    const parseTargetUserIds = (): string[] =>
        Array.from(
            new Set(
                targetUserIdsText
                    .split(/[\s,;]+/)
                    .map((value) => value.trim())
                    .filter(Boolean),
            ),
        );

    const handleSend = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!title.trim() || !body.trim()) {
            setBanner({ type: 'warning', message: 'Title and body are both required.' });
            return;
        }

        const targetUserIds = audience === 'specific' ? parseTargetUserIds() : undefined;
        if (audience === 'specific') {
            if (!targetUserIds || targetUserIds.length === 0) {
                setBanner({ type: 'warning', message: 'Enter at least one target user ID.' });
                return;
            }
            if (targetUserIds.length > 1000) {
                setBanner({ type: 'warning', message: 'A broadcast supports at most 1000 target user IDs.' });
                return;
            }
        }

        let scheduledForIso: string | undefined;
        if (scheduledFor) {
            const date = new Date(scheduledFor);
            if (Number.isNaN(date.getTime())) {
                setBanner({ type: 'warning', message: 'The schedule date is invalid.' });
                return;
            }
            scheduledForIso = date.toISOString();
        }

        if (
            audience === 'all' &&
            !scheduledForIso &&
            !window.confirm('Send this notification to ALL users right now?')
        ) {
            return;
        }

        setSending(true);
        setBanner(null);
        setLastResult(null);
        try {
            const response = await backendFetchJson<BroadcastResponse>(
                '/notifications/admin/broadcast',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: title.trim(),
                        body: body.trim(),
                        kind,
                        severity,
                        audience,
                        ...(targetUserIds ? { targetUserIds } : {}),
                        channels: {
                            inApp: channelInApp,
                            push: channelPush,
                            email: channelEmail,
                        },
                        ...(scheduledForIso ? { scheduledFor: scheduledForIso } : {}),
                    }),
                },
            );

            setLastResult(response);
            if (response.queued) {
                setBanner({
                    type: 'success',
                    message: `Notification scheduled for ${formatDateTime(response.scheduledFor)}.`,
                });
            } else {
                setBanner({
                    type: 'success',
                    message: `Broadcast delivered to ${response.recipientCount ?? 0} recipient${(response.recipientCount ?? 0) === 1 ? '' : 's'}.`,
                });
            }
            void fetchQueue();
        } catch (error) {
            setBanner({
                type: 'error',
                message: error instanceof Error ? error.message : 'Broadcast failed.',
            });
        } finally {
            setSending(false);
        }
    };

    const handleProcessDue = async () => {
        setProcessing(true);
        try {
            const result = await backendFetchJson<{ processed?: number } | null>(
                '/notifications/admin/process-due',
                { method: 'POST' },
            );
            setBanner({
                type: 'success',
                message: `Queue drained: ${result?.processed ?? 0} due item${(result?.processed ?? 0) === 1 ? '' : 's'} processed.`,
            });
            void fetchQueue();
        } catch (error) {
            setBanner({
                type: 'error',
                message:
                    error instanceof Error ? error.message : 'Unable to process the queue.',
            });
        } finally {
            setProcessing(false);
        }
    };

    const channelToggles = [
        {
            key: 'inApp',
            label: 'In-app',
            description: 'Inbox entry inside the app',
            icon: MessageSquare,
            checked: channelInApp,
            onChange: setChannelInApp,
        },
        {
            key: 'push',
            label: 'Push',
            description: 'Expo mobile + web push',
            icon: Smartphone,
            checked: channelPush,
            onChange: setChannelPush,
        },
        {
            key: 'email',
            label: 'Email',
            description: 'Brevo transactional email',
            icon: Mail,
            checked: channelEmail,
            onChange: setChannelEmail,
        },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Notifications</h1>
                    <p style={{ color: 'var(--text-tertiary)', margin: '4px 0 0 0', fontSize: '15px' }}>
                        Compose broadcasts to users across in-app, push, and email channels.
                    </p>
                </div>
                <button
                    className="btn btn-secondary"
                    onClick={() => void fetchQueue()}
                    disabled={queueLoading}
                >
                    <RefreshCw size={18} />
                    Refresh
                </button>
            </div>

            {banner && (
                <div
                    className="card"
                    style={{
                        padding: '16px 20px',
                        borderLeft: `4px solid ${
                            banner.type === 'success'
                                ? 'var(--success)'
                                : banner.type === 'warning'
                                    ? 'var(--warning)'
                                    : 'var(--danger)'
                        }`,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <AlertCircle
                            size={18}
                            color={
                                banner.type === 'success'
                                    ? 'var(--success)'
                                    : banner.type === 'warning'
                                        ? 'var(--warning)'
                                        : 'var(--danger)'
                            }
                            style={{ flexShrink: 0, marginTop: '2px' }}
                        />
                        <div style={{ flex: 1, fontSize: '14px', color: 'var(--text-secondary)' }}>
                            {banner.message}
                        </div>
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '6px 10px' }}
                            onClick={() => setBanner(null)}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            <div className="card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <BellRing size={20} style={{ color: 'var(--apple-blue)' }} />
                    <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 600 }}>Compose broadcast</h3>
                </div>

                <form onSubmit={(event) => void handleSend(event)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Title *</label>
                            <input
                                type="text"
                                className="input-field"
                                value={title}
                                maxLength={160}
                                onChange={(event) => setTitle(event.target.value)}
                                placeholder="New scholarships this week"
                            />
                        </div>

                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Body *</label>
                            <textarea
                                className="input-field"
                                value={body}
                                maxLength={4000}
                                onChange={(event) => setBody(event.target.value)}
                                placeholder="Write the notification message..."
                                rows={5}
                                style={{ resize: 'vertical', minHeight: '110px' }}
                            />
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                gap: '16px',
                            }}
                        >
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Kind</label>
                                <select
                                    className="input-field"
                                    value={kind}
                                    onChange={(event) => setKind(event.target.value as NotificationKind)}
                                >
                                    {kindOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Severity</label>
                                <select
                                    className="input-field"
                                    value={severity}
                                    onChange={(event) => setSeverity(event.target.value as NotificationSeverity)}
                                >
                                    {severityOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Audience</label>
                                <select
                                    className="input-field"
                                    value={audience}
                                    onChange={(event) => setAudience(event.target.value as BroadcastAudience)}
                                >
                                    {audienceOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Schedule (optional)</label>
                                <input
                                    type="datetime-local"
                                    className="input-field"
                                    value={scheduledFor}
                                    onChange={(event) => setScheduledFor(event.target.value)}
                                />
                            </div>
                        </div>

                        {audience === 'specific' && (
                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">Target user IDs (max 1000)</label>
                                <textarea
                                    className="input-field"
                                    value={targetUserIdsText}
                                    onChange={(event) => setTargetUserIdsText(event.target.value)}
                                    placeholder="One user ID per line (or comma-separated)"
                                    rows={4}
                                    style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '13px' }}
                                />
                                <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: '8px 0 0 0' }}>
                                    {parseTargetUserIds().length} unique ID
                                    {parseTargetUserIds().length === 1 ? '' : 's'} entered.
                                </p>
                            </div>
                        )}

                        <div>
                            <label className="form-label">Channels</label>
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                    gap: '12px',
                                }}
                            >
                                {channelToggles.map((channel) => (
                                    <label
                                        key={channel.key}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '14px 16px',
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            border: channel.checked
                                                ? '1px solid var(--apple-blue)'
                                                : '1px solid transparent',
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={channel.checked}
                                            onChange={(event) => channel.onChange(event.target.checked)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <channel.icon size={18} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                                        <div>
                                            <div style={{ fontWeight: 500, fontSize: '14px' }}>{channel.label}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                                {channel.description}
                                            </div>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button type="submit" className="btn btn-primary" disabled={sending}>
                                {sending ? (
                                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                ) : (
                                    <Send size={18} />
                                )}
                                {sending
                                    ? 'Sending...'
                                    : scheduledFor
                                        ? 'Schedule notification'
                                        : 'Send now'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {lastResult && (
                <div className="card" style={{ padding: '24px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', fontWeight: 600 }}>
                        Last broadcast result
                    </h3>
                    {lastResult.queued ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)' }}>
                            <CalendarClock size={18} style={{ color: 'var(--warning)' }} />
                            Queued (id {lastResult.id}) — runs at {formatDateTime(lastResult.scheduledFor)}.
                        </div>
                    ) : (
                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                gap: '12px',
                            }}
                        >
                            <div className="card" style={{ padding: '14px', background: 'var(--bg-tertiary)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Recipients</div>
                                <div style={{ fontWeight: 600 }}>{lastResult.recipientCount ?? 0}</div>
                            </div>
                            <div className="card" style={{ padding: '14px', background: 'var(--bg-tertiary)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>In-app inserted</div>
                                <div style={{ fontWeight: 600 }}>{lastResult.insertedCount ?? 0}</div>
                            </div>
                            <div className="card" style={{ padding: '14px', background: 'var(--bg-tertiary)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Push</div>
                                <div style={{ fontWeight: 600, fontSize: '13px' }}>{channelSummary(lastResult.push)}</div>
                            </div>
                            <div className="card" style={{ padding: '14px', background: 'var(--bg-tertiary)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Email</div>
                                <div style={{ fontWeight: 600, fontSize: '13px' }}>{channelSummary(lastResult.email)}</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="card" style={{ overflow: 'hidden' }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        padding: '20px 24px',
                        borderBottom: '1px solid var(--border-light)',
                        flexWrap: 'wrap',
                    }}
                >
                    <div>
                        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>Scheduled queue</h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                            Pending items are delivered automatically every minute; use the button to drain due items immediately.
                        </p>
                    </div>
                    <button
                        className="btn btn-secondary"
                        onClick={() => void handleProcessDue()}
                        disabled={processing}
                    >
                        {processing ? (
                            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                            <PlayCircle size={18} />
                        )}
                        {processing ? 'Processing...' : 'Process due now'}
                    </button>
                </div>

                {queueLoading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        <Loader2 size={24} style={{ marginBottom: '12px', animation: 'spin 1s linear infinite' }} />
                        <div>Loading queue...</div>
                    </div>
                ) : queue.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center' }}>
                        <CalendarClock size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                        <p style={{ color: 'var(--text-tertiary)', margin: 0 }}>The notification queue is empty.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Audience</th>
                                    <th>Scheduled for</th>
                                    <th>Status</th>
                                    <th>Processed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {queue.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                                                {item.payload?.title || 'Untitled'}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                                {item.payload?.kind || 'admin-broadcast'}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge badge-primary">
                                                {item.payload?.audience || 'all'}
                                            </span>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                                            {formatDateTime(item.scheduledFor)}
                                        </td>
                                        <td>
                                            <span className={`badge ${statusBadgeClass(item.status)}`}>{item.status}</span>
                                        </td>
                                        <td style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>
                                            {formatDateTime(item.processedAt)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Notifications;
