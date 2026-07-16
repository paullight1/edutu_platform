import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
    AlertCircle,
    BellRing,
    CalendarClock,
    ExternalLink,
    FlaskConical,
    History,
    Link2,
    Loader2,
    Mail,
    MessageSquare,
    PlayCircle,
    RefreshCw,
    Search,
    Send,
    Settings,
    Smartphone,
    Sparkles,
    Trash2,
    UserPlus,
    X,
} from 'lucide-react';
import { backendFetchJson } from '../lib/backend';
import { useAdminAuth } from '../hooks/useAdminAuth';
import type { AdminUserRecord, AdminUsersResponse } from '../lib/adminApi';

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

interface SelectedUser {
    userId: string;
    fullName: string;
    email: string;
}

type Banner = {
    type: 'success' | 'warning' | 'error';
    message: string;
} | null;

const MAX_TARGET_USERS = 1000;
const TITLE_SOFT_LIMIT = 100;
const BODY_SOFT_LIMIT = 500;

const kindOptions: Array<{ value: NotificationKind; label: string }> = [
    { value: 'admin-broadcast', label: 'Admin broadcast' },
    { value: 'system', label: 'System' },
    { value: 'opportunity-alert', label: 'Opportunity alert' },
    { value: 'goal-reminder', label: 'Goal reminder' },
];

const severityOptions: Array<{
    value: NotificationSeverity;
    label: string;
    color: string;
}> = [
    { value: 'info', label: 'Info', color: 'var(--apple-blue)' },
    { value: 'success', label: 'Success', color: 'var(--success)' },
    { value: 'warning', label: 'Warning', color: 'var(--warning)' },
    { value: 'critical', label: 'Critical', color: 'var(--danger)' },
];

const audienceOptions: Array<{ value: BroadcastAudience; label: string }> = [
    { value: 'all', label: 'All users' },
    { value: 'specific', label: 'Specific users' },
    { value: 'creators', label: 'Creators' },
    { value: 'approved_creators', label: 'Approved creators' },
];

const kindIcons: Record<NotificationKind, typeof BellRing> = {
    'admin-broadcast': BellRing,
    system: Settings,
    'opportunity-alert': Sparkles,
    'goal-reminder': CalendarClock,
};

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function formatRelative(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';

    const diff = date.getTime() - Date.now();
    const abs = Math.abs(diff);
    if (abs < 60_000) return diff <= 0 ? 'just now' : 'in <1m';

    const units: Array<[number, string]> = [
        [86_400_000, 'd'],
        [3_600_000, 'h'],
        [60_000, 'm'],
    ];
    let label = '';
    for (const [ms, suffix] of units) {
        if (abs >= ms) {
            label = `${Math.round(abs / ms)}${suffix}`;
            break;
        }
    }
    return diff < 0 ? `${label} ago` : `in ${label}`;
}

function statusBadgeClass(status: string): string {
    switch (status) {
        case 'completed':
        case 'sent':
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

/** Compact "In-app 1,204 · Push 890 · Email 340" line from a delivery result. */
function deliveryLine(result: Record<string, unknown> | null | undefined): string {
    if (!result) return '—';
    if (typeof result.error === 'string') return `Error: ${result.error}`;

    const push = result.push as BroadcastChannelResult | undefined;
    const email = result.email as BroadcastChannelResult | undefined;
    const inApp =
        typeof result.insertedCount === 'number' ? result.insertedCount : 0;

    if (
        result.insertedCount === undefined &&
        push === undefined &&
        email === undefined
    ) {
        return '—';
    }

    return [
        `In-app ${inApp.toLocaleString()}`,
        `Push ${(push?.sent ?? 0).toLocaleString()}`,
        `Email ${(email?.sent ?? 0).toLocaleString()}`,
    ].join(' · ');
}

function isValidLink(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return true;
    return trimmed.startsWith('/') || /^https:\/\/.+/.test(trimmed);
}

const Notifications = () => {
    const { user: adminUser } = useAdminAuth();

    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [kind, setKind] = useState<NotificationKind>('admin-broadcast');
    const [severity, setSeverity] = useState<NotificationSeverity>('info');
    const [audience, setAudience] = useState<BroadcastAudience>('all');
    const [link, setLink] = useState('');
    const [channelInApp, setChannelInApp] = useState(true);
    const [channelPush, setChannelPush] = useState(false);
    const [channelEmail, setChannelEmail] = useState(false);
    const [scheduledFor, setScheduledFor] = useState('');

    const [selectedUsers, setSelectedUsers] = useState<SelectedUser[]>([]);
    const [userSearch, setUserSearch] = useState('');
    const [searchResults, setSearchResults] = useState<AdminUserRecord[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    const [sending, setSending] = useState(false);
    const [testing, setTesting] = useState(false);
    const [lastResult, setLastResult] = useState<BroadcastResponse | null>(null);
    const [lastResultLabel, setLastResultLabel] = useState<string | null>(null);
    const [banner, setBanner] = useState<Banner>(null);

    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [queueLoading, setQueueLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [cancellingId, setCancellingId] = useState<string | null>(null);

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

    // Debounced user directory search for the "Specific users" audience.
    useEffect(() => {
        if (audience !== 'specific') return undefined;
        const term = userSearch.trim();
        if (term.length < 2) {
            setSearchResults([]);
            setSearchLoading(false);
            return undefined;
        }

        let cancelled = false;
        setSearchLoading(true);
        const handle = setTimeout(async () => {
            try {
                const response = await backendFetchJson<AdminUsersResponse>(
                    `/admin/users?search=${encodeURIComponent(term)}`,
                );
                if (!cancelled) {
                    setSearchResults((response.users || []).slice(0, 8));
                }
            } catch {
                if (!cancelled) setSearchResults([]);
            } finally {
                if (!cancelled) setSearchLoading(false);
            }
        }, 350);

        return () => {
            cancelled = true;
            clearTimeout(handle);
        };
    }, [userSearch, audience]);

    const scheduledItems = useMemo(
        () =>
            queue.filter(
                (item) => item.status === 'pending' || item.status === 'processing',
            ),
        [queue],
    );
    const historyItems = useMemo(
        () =>
            queue.filter(
                (item) => item.status !== 'pending' && item.status !== 'processing',
            ),
        [queue],
    );

    const linkValid = isValidLink(link);
    const titleReady = title.trim().length > 0;
    const bodyReady = body.trim().length > 0;
    const targetsReady =
        audience !== 'specific' ||
        (selectedUsers.length > 0 && selectedUsers.length <= MAX_TARGET_USERS);
    const canSend =
        titleReady && bodyReady && linkValid && targetsReady && !sending && !testing;

    const buildPayload = (overrides?: {
        audience?: BroadcastAudience;
        targetUserIds?: string[];
        skipSchedule?: boolean;
    }) => {
        const effectiveAudience = overrides?.audience ?? audience;
        const targetUserIds =
            overrides?.targetUserIds ??
            (effectiveAudience === 'specific'
                ? selectedUsers.map((selected) => selected.userId)
                : undefined);
        const trimmedLink = link.trim();

        return {
            title: title.trim(),
            body: body.trim(),
            kind,
            severity,
            audience: effectiveAudience,
            ...(targetUserIds ? { targetUserIds } : {}),
            ...(trimmedLink ? { metadata: { url: trimmedLink } } : {}),
            channels: {
                inApp: channelInApp,
                push: channelPush,
                email: channelEmail,
            },
        };
    };

    const addUser = (record: AdminUserRecord) => {
        setSelectedUsers((current) => {
            if (current.some((selected) => selected.userId === record.userId)) {
                return current;
            }
            if (current.length >= MAX_TARGET_USERS) return current;
            return [
                ...current,
                {
                    userId: record.userId,
                    fullName: record.fullName || 'Unnamed user',
                    email: record.email || '',
                },
            ];
        });
    };

    const removeUser = (userId: string) => {
        setSelectedUsers((current) =>
            current.filter((selected) => selected.userId !== userId),
        );
    };

    const handleSend = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!canSend) return;

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
            !window.confirm('This will notify ALL users — continue?')
        ) {
            return;
        }

        setSending(true);
        setBanner(null);
        setLastResult(null);
        setLastResultLabel(null);
        try {
            const response = await backendFetchJson<BroadcastResponse>(
                '/notifications/admin/broadcast',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...buildPayload(),
                        ...(scheduledForIso ? { scheduledFor: scheduledForIso } : {}),
                    }),
                },
            );

            setLastResult(response);
            setLastResultLabel('Last broadcast result');
            if (response.queued) {
                setBanner({
                    type: 'success',
                    message: `Notification scheduled for ${formatDateTime(response.scheduledFor)}.`,
                });
            } else {
                setBanner({
                    type: 'success',
                    message: `Broadcast delivered — ${deliveryLine(
                        response as unknown as Record<string, unknown>,
                    )} (${response.recipientCount ?? 0} recipient${(response.recipientCount ?? 0) === 1 ? '' : 's'}).`,
                });
            }

            // Reset the draft but keep audience + channels for the next send.
            setTitle('');
            setBody('');
            setLink('');
            setScheduledFor('');
            setSelectedUsers([]);
            setUserSearch('');
            setKind('admin-broadcast');
            setSeverity('info');

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

    const handleSendTest = async () => {
        if (!titleReady || !bodyReady) {
            setBanner({
                type: 'warning',
                message: 'Add a title and body before sending a test.',
            });
            return;
        }
        if (!linkValid) {
            setBanner({
                type: 'warning',
                message: 'Fix the action link before sending a test.',
            });
            return;
        }

        const adminEmail = adminUser?.email?.trim();
        if (!adminEmail) {
            setBanner({
                type: 'error',
                message: 'Your admin session has no email — cannot resolve your user.',
            });
            return;
        }

        setTesting(true);
        setBanner(null);
        try {
            const directory = await backendFetchJson<AdminUsersResponse>(
                `/admin/users?search=${encodeURIComponent(adminEmail)}`,
            );
            const me = (directory.users || []).find(
                (record) => record.email?.toLowerCase() === adminEmail.toLowerCase(),
            );
            if (!me) {
                throw new Error(
                    `No user with email ${adminEmail} was found in the directory, so the test could not be sent.`,
                );
            }

            const response = await backendFetchJson<BroadcastResponse>(
                '/notifications/admin/broadcast',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(
                        buildPayload({
                            audience: 'specific',
                            targetUserIds: [me.userId],
                        }),
                    ),
                },
            );

            setLastResult(response);
            setLastResultLabel('Test sent to you only');
            setBanner({
                type: 'success',
                message: `Test sent to you only (${adminEmail}) — check your inbox and devices. The draft was kept.`,
            });
            void fetchQueue();
        } catch (error) {
            setBanner({
                type: 'error',
                message: error instanceof Error ? error.message : 'Test send failed.',
            });
        } finally {
            setTesting(false);
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

    const handleCancelScheduled = async (item: QueueItem) => {
        if (
            !window.confirm(
                `Cancel the scheduled notification "${item.payload?.title || 'Untitled'}"?`,
            )
        ) {
            return;
        }

        setCancellingId(item.id);
        try {
            await backendFetchJson(`/notifications/admin/queue/${item.id}`, {
                method: 'DELETE',
            });
            setBanner({ type: 'success', message: 'Scheduled notification cancelled.' });
            void fetchQueue();
        } catch (error) {
            setBanner({
                type: 'error',
                message:
                    error instanceof Error
                        ? error.message
                        : 'Unable to cancel the scheduled notification.',
            });
        } finally {
            setCancellingId(null);
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

    const severityColor =
        severityOptions.find((option) => option.value === severity)?.color ||
        'var(--apple-blue)';
    const PreviewIcon = kindIcons[kind] || BellRing;

    const selectedIds = new Set(selectedUsers.map((selected) => selected.userId));

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
                    <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
                        <div style={{ flex: '2 1 440px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div className="form-group" style={{ margin: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <label className="form-label">Title *</label>
                                    <span
                                        style={{
                                            fontSize: '12px',
                                            color: title.length > TITLE_SOFT_LIMIT ? 'var(--warning)' : 'var(--text-tertiary)',
                                        }}
                                    >
                                        {title.length}/{TITLE_SOFT_LIMIT}
                                    </span>
                                </div>
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <label className="form-label">Body *</label>
                                    <span
                                        style={{
                                            fontSize: '12px',
                                            color: body.length > BODY_SOFT_LIMIT ? 'var(--warning)' : 'var(--text-tertiary)',
                                        }}
                                    >
                                        {body.length}/{BODY_SOFT_LIMIT}
                                    </span>
                                </div>
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

                            <div className="form-group" style={{ margin: 0 }}>
                                <label className="form-label">
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                        <Link2 size={14} />
                                        Opens when tapped (optional)
                                    </span>
                                </label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={link}
                                    onChange={(event) => setLink(event.target.value)}
                                    placeholder="/opportunities"
                                    style={!linkValid ? { borderColor: 'var(--danger)' } : undefined}
                                />
                                <p
                                    style={{
                                        fontSize: '12px',
                                        color: linkValid ? 'var(--text-tertiary)' : 'var(--danger)',
                                        margin: '6px 0 0 0',
                                    }}
                                >
                                    {linkValid
                                        ? 'In-app route (e.g. /opportunities, /app/deadlines) or an https:// URL. Tapping the notification opens it.'
                                        : 'Must start with "/" (in-app route) or "https://".'}
                                </p>
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

                            <div>
                                <label className="form-label">Severity</label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {severityOptions.map((option) => {
                                        const selected = severity === option.value;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setSeverity(option.value)}
                                                style={{
                                                    padding: '7px 16px',
                                                    borderRadius: '999px',
                                                    fontSize: '13px',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    border: `1px solid ${option.color}`,
                                                    background: selected ? option.color : 'transparent',
                                                    color: selected ? '#fff' : option.color,
                                                    transition: 'all 0.15s ease',
                                                }}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {audience === 'specific' && (
                                <div className="form-group" style={{ margin: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                        <label className="form-label">Target users</label>
                                        <span
                                            style={{
                                                fontSize: '12px',
                                                color:
                                                    selectedUsers.length >= MAX_TARGET_USERS
                                                        ? 'var(--warning)'
                                                        : 'var(--text-tertiary)',
                                            }}
                                        >
                                            {selectedUsers.length}/{MAX_TARGET_USERS} selected
                                        </span>
                                    </div>

                                    {selectedUsers.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                                            {selectedUsers.map((selected) => (
                                                <span
                                                    key={selected.userId}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        padding: '5px 6px 5px 12px',
                                                        background: 'var(--bg-tertiary)',
                                                        borderRadius: '999px',
                                                        fontSize: '13px',
                                                    }}
                                                >
                                                    <span style={{ fontWeight: 500 }}>{selected.fullName}</span>
                                                    {selected.email && (
                                                        <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
                                                            {selected.email}
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeUser(selected.userId)}
                                                        aria-label={`Remove ${selected.fullName}`}
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            width: '20px',
                                                            height: '20px',
                                                            borderRadius: '50%',
                                                            border: 'none',
                                                            background: 'var(--bg-secondary)',
                                                            color: 'var(--text-tertiary)',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    <div style={{ position: 'relative' }}>
                                        <Search
                                            size={16}
                                            style={{
                                                position: 'absolute',
                                                left: '12px',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                color: 'var(--text-tertiary)',
                                            }}
                                        />
                                        <input
                                            type="text"
                                            className="input-field"
                                            value={userSearch}
                                            onChange={(event) => setUserSearch(event.target.value)}
                                            placeholder="Search users by name or email..."
                                            style={{ paddingLeft: '36px' }}
                                        />
                                    </div>

                                    {userSearch.trim().length >= 2 && (
                                        <div
                                            style={{
                                                marginTop: '8px',
                                                border: '1px solid var(--border-light)',
                                                borderRadius: '10px',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {searchLoading ? (
                                                <div
                                                    style={{
                                                        padding: '14px',
                                                        textAlign: 'center',
                                                        color: 'var(--text-tertiary)',
                                                        fontSize: '13px',
                                                    }}
                                                >
                                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', verticalAlign: 'middle', marginRight: '8px' }} />
                                                    Searching users...
                                                </div>
                                            ) : searchResults.length === 0 ? (
                                                <div
                                                    style={{
                                                        padding: '14px',
                                                        textAlign: 'center',
                                                        color: 'var(--text-tertiary)',
                                                        fontSize: '13px',
                                                    }}
                                                >
                                                    No users match “{userSearch.trim()}”.
                                                </div>
                                            ) : (
                                                searchResults.map((record) => {
                                                    const alreadySelected = selectedIds.has(record.userId);
                                                    const atCap = selectedUsers.length >= MAX_TARGET_USERS;
                                                    return (
                                                        <div
                                                            key={record.userId}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                gap: '12px',
                                                                padding: '10px 14px',
                                                                borderBottom: '1px solid var(--border-light)',
                                                            }}
                                                        >
                                                            <div style={{ minWidth: 0 }}>
                                                                <div style={{ fontWeight: 500, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {record.fullName || 'Unnamed user'}
                                                                </div>
                                                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {record.email || record.userId}
                                                                    {record.role && record.role !== 'user' ? ` · ${record.role}` : ''}
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary"
                                                                style={{ padding: '6px 12px', flexShrink: 0 }}
                                                                disabled={alreadySelected || atCap}
                                                                onClick={() => addUser(record)}
                                                            >
                                                                <UserPlus size={14} />
                                                                {alreadySelected ? 'Added' : 'Add'}
                                                            </button>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    )}
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
                        </div>

                        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                            <label className="form-label">In-app preview</label>
                            <div
                                className="card"
                                style={{
                                    padding: '16px',
                                    background: 'var(--bg-tertiary)',
                                    display: 'flex',
                                    gap: '12px',
                                    alignItems: 'flex-start',
                                }}
                            >
                                <div
                                    style={{
                                        width: '38px',
                                        height: '38px',
                                        borderRadius: '10px',
                                        background: severityColor,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                    }}
                                >
                                    <PreviewIcon size={19} color="#fff" />
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div
                                        style={{
                                            fontWeight: 600,
                                            fontSize: '14px',
                                            color: title.trim() ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                            overflowWrap: 'break-word',
                                        }}
                                    >
                                        {title.trim() || 'Notification title'}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '13px',
                                            color: body.trim() ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                                            marginTop: '4px',
                                            whiteSpace: 'pre-wrap',
                                            overflowWrap: 'break-word',
                                        }}
                                    >
                                        {body.trim() || 'The notification body will appear here.'}
                                    </div>
                                    {link.trim() && linkValid && (
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                marginTop: '8px',
                                                fontSize: '12px',
                                                color: 'var(--apple-blue)',
                                                overflowWrap: 'anywhere',
                                            }}
                                        >
                                            <ExternalLink size={12} style={{ flexShrink: 0 }} />
                                            {link.trim()}
                                        </div>
                                    )}
                                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                                        Edutu · just now
                                    </div>
                                </div>
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '10px 0 0 0' }}>
                                How the notification renders in the in-app inbox. Push and email use the same title and body.
                            </p>
                        </div>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            gap: '12px',
                            marginTop: '24px',
                            flexWrap: 'wrap',
                        }}
                    >
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => void handleSendTest()}
                            disabled={!titleReady || !bodyReady || !linkValid || sending || testing}
                            title="Sends this draft only to your own account"
                        >
                            {testing ? (
                                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                            ) : (
                                <FlaskConical size={18} />
                            )}
                            {testing ? 'Sending test...' : 'Send test to me'}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={!canSend}>
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
                </form>
            </div>

            {lastResult && (
                <div className="card" style={{ padding: '24px' }}>
                    <h3 style={{ margin: '0 0 6px 0', fontSize: '17px', fontWeight: 600 }}>
                        {lastResultLabel || 'Last broadcast result'}
                    </h3>
                    {!lastResult.queued && (
                        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                            {deliveryLine(lastResult as unknown as Record<string, unknown>)}
                        </p>
                    )}
                    {lastResult.queued ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)', marginTop: '10px' }}>
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
                                <div style={{ fontWeight: 600 }}>{(lastResult.recipientCount ?? 0).toLocaleString()}</div>
                            </div>
                            <div className="card" style={{ padding: '14px', background: 'var(--bg-tertiary)' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>In-app inserted</div>
                                <div style={{ fontWeight: 600 }}>{(lastResult.insertedCount ?? 0).toLocaleString()}</div>
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
                        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>Scheduled</h3>
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
                ) : scheduledItems.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center' }}>
                        <CalendarClock size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                        <p style={{ color: 'var(--text-tertiary)', margin: 0 }}>Nothing is scheduled.</p>
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
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {scheduledItems.map((item) => (
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
                                            <div>{formatDateTime(item.scheduledFor)}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                                {formatRelative(item.scheduledFor)}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${statusBadgeClass(item.status)}`}>{item.status}</span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            {item.status === 'pending' && (
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ padding: '6px 12px', color: 'var(--danger)' }}
                                                    disabled={cancellingId === item.id}
                                                    onClick={() => void handleCancelScheduled(item)}
                                                >
                                                    {cancellingId === item.id ? (
                                                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                                    ) : (
                                                        <Trash2 size={14} />
                                                    )}
                                                    Cancel
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '20px 24px',
                        borderBottom: '1px solid var(--border-light)',
                    }}
                >
                    <History size={18} style={{ color: 'var(--text-tertiary)' }} />
                    <div>
                        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>History</h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                            Delivered and processed broadcasts with their per-channel results.
                        </p>
                    </div>
                </div>

                {queueLoading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        <Loader2 size={24} style={{ marginBottom: '12px', animation: 'spin 1s linear infinite' }} />
                        <div>Loading history...</div>
                    </div>
                ) : historyItems.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center' }}>
                        <History size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                        <p style={{ color: 'var(--text-tertiary)', margin: 0 }}>No broadcasts have been sent yet.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Audience</th>
                                    <th>Sent</th>
                                    <th>Status</th>
                                    <th>Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historyItems.map((item) => (
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
                                            <div>{formatRelative(item.processedAt || item.createdAt)}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                                {formatDateTime(item.processedAt || item.createdAt)}
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${statusBadgeClass(item.status)}`}>{item.status}</span>
                                        </td>
                                        <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                                            {deliveryLine(item.result)}
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
