import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
    AlertCircle,
    BarChart3,
    Calendar,
    CheckCircle2,
    Clock,
    Award,
    Copy,
    Download,
    Eye,
    Filter,
    Globe,
    Loader2,
    Mail,
    Search,
    Shield,
    UserPlus,
    Users as UsersIcon,
    X,
} from 'lucide-react';
import { backendFetchJson } from '../lib/backend';

interface AdminUserRecord {
    userId: string;
    fullName: string;
    email: string;
    role: string;
    country: string | null;
    skills: string[];
    creditsBalance: number;
    creatorStatus: string;
    creatorRejectionReason: string | null;
    createdAt: string;
    updatedAt: string;
}

interface AdminUsersStats {
    total: number;
    roleCounts: Record<string, number>;
    creatorStatusCounts: Record<string, number>;
    newThisWeek: number;
    countryCount: number;
    topCountry: string;
    totalCredits: number;
    averageCredits: number;
    profilesWithCountry: number;
    profilesWithSkills: number;
}

interface AdminCurrentUser {
    userId: string | null;
    email: string | null;
    role: string;
    canManageUsers: boolean;
}

interface AdminUsersResponse {
    success: boolean;
    source: 'database' | 'fallback';
    users: AdminUserRecord[];
    stats: AdminUsersStats;
    generatedAt: string;
    currentAdmin?: AdminCurrentUser;
    error?: string;
}

interface AdminInviteResponse {
    success: boolean;
    invitation: {
        id: string;
        emailAddress: string;
        status: string;
        url?: string;
        createdAt: string;
        updatedAt: string;
    } | null;
    assignedRole?: AssignableRole;
    updatedUser?: AdminUserRecord | null;
    error?: string;
}

interface AdminUpdateUserRoleResponse {
    success: boolean;
    user: AdminUserRecord | null;
    error?: string;
}

type Banner = {
    type: 'success' | 'warning' | 'error' | 'info';
    message: string;
} | null;

const DEFAULT_STATS: AdminUsersStats = {
    total: 0,
    roleCounts: {},
    creatorStatusCounts: {},
    newThisWeek: 0,
    countryCount: 0,
    topCountry: 'N/A',
    totalCredits: 0,
    averageCredits: 0,
    profilesWithCountry: 0,
    profilesWithSkills: 0,
};

const PRIVILEGED_ROLES = new Set([
    'admin',
    'super_admin',
    'moderator',
    'support_agent',
]);

const creatorStatusOptions = [
    { value: 'all', label: 'All Creator Statuses' },
    { value: 'none', label: 'No Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
];

const roleOptions = [
    { value: 'all', label: 'All Roles' },
    { value: 'user', label: 'Users' },
    { value: 'admin', label: 'Admins & Staff' },
];

const assignableRoleOptions = [
    { value: 'user', label: 'User' },
    { value: 'admin', label: 'Admin' },
    { value: 'moderator', label: 'Moderator' },
    { value: 'support_agent', label: 'Support Agent' },
] as const;

type AssignableRole = typeof assignableRoleOptions[number]['value'];

function isAssignableRole(role: string): role is AssignableRole {
    return assignableRoleOptions.some((option) => option.value === role);
}

function formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
}

function isPrivilegedRole(role: string): boolean {
    return PRIVILEGED_ROLES.has(role);
}

function roleBadgeClass(role: string): string {
    if (isPrivilegedRole(role)) return 'badge-primary';
    if (role === 'user') return 'badge-success';
    return 'badge-warning';
}

function roleLabel(role: string): string {
    if (role === 'admin') return 'Admin';
    if (role === 'super_admin') return 'Super Admin';
    if (role === 'support_agent') return 'Support Agent';
    if (role === 'moderator') return 'Moderator';
    if (role === 'user') return 'User';
    return role
        ? role
            .split(/[_\s-]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ')
        : 'User';
}

function creatorBadgeClass(status: string): string {
    switch (status) {
        case 'approved':
            return 'badge-success';
        case 'pending':
            return 'badge-warning';
        case 'rejected':
            return 'badge-danger';
        default:
            return 'badge-primary';
    }
}

function creatorLabel(status: string): string {
    if (!status || status === 'none') return 'No Status';
    return status.charAt(0).toUpperCase() + status.slice(1);
}

function escapeCsv(value: unknown): string {
    const text = value == null ? '' : String(value);
    if (/[,"\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

const Users = () => {
    const [users, setUsers] = useState<AdminUserRecord[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<AdminUserRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'admin'>('all');
    const [creatorFilter, setCreatorFilter] = useState<'all' | 'none' | 'pending' | 'approved' | 'rejected'>('all');
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
    const [selectedUser, setSelectedUser] = useState<AdminUserRecord | null>(null);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<AssignableRole>('user');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [roleUpdatingUserId, setRoleUpdatingUserId] = useState<string | null>(null);
    const [banner, setBanner] = useState<Banner>(null);
    const [canManageUsers, setCanManageUsers] = useState(false);

    const [stats, setStats] = useState<AdminUsersStats>(DEFAULT_STATS);

    const fetchUsers = useCallback(async (options: { preserveBanner?: boolean } = {}) => {
        setLoading(true);
        try {
            const response = await backendFetchJson<AdminUsersResponse>('/admin/users?limit=500');
            setUsers(response.users);
            setStats(response.stats);
            setCanManageUsers(Boolean(response.currentAdmin?.canManageUsers));

            if (!response.success) {
                setBanner({
                    type: 'warning',
                    message: response.error
                        ? `Loaded with fallback data: ${response.error}`
                        : 'Loaded with fallback data.',
                });
            } else if (!options.preserveBanner) {
                setBanner(null);
            }
        } catch (error) {
            setUsers([]);
            setStats(DEFAULT_STATS);
            setCanManageUsers(false);
            setBanner({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unable to load users.',
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        const query = searchQuery.trim().toLowerCase();

        const filtered = users.filter((user) => {
            const haystack = [
                user.fullName,
                user.email,
                user.country || '',
                user.role,
                user.creatorStatus,
                user.skills.join(' '),
                user.creditsBalance.toString(),
            ]
                .join(' ')
                .toLowerCase();

            const matchesSearch = !query || haystack.includes(query);
            const matchesRole =
                roleFilter === 'all'
                    ? true
                    : roleFilter === 'admin'
                        ? isPrivilegedRole(user.role)
                        : user.role === 'user';
            const matchesCreator =
                creatorFilter === 'all' ? true : user.creatorStatus === creatorFilter;

            return matchesSearch && matchesRole && matchesCreator;
        });

        setFilteredUsers(filtered);
    }, [users, searchQuery, roleFilter, creatorFilter]);

    const adminsCount =
        (stats.roleCounts.admin || 0) +
        (stats.roleCounts.super_admin || 0) +
        (stats.roleCounts.moderator || 0) +
        (stats.roleCounts.support_agent || 0);

    const approvedCreators = stats.creatorStatusCounts.approved || 0;
    const pendingCreators = stats.creatorStatusCounts.pending || 0;
    const rejectedCreators = stats.creatorStatusCounts.rejected || 0;
    const noStatusCreators = stats.creatorStatusCounts.none || 0;

    const topStats = [
        {
            label: 'Total Users',
            value: stats.total,
            icon: UsersIcon,
            gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
        },
        {
            label: 'Admins & Staff',
            value: adminsCount,
            icon: Shield,
            gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        },
        {
            label: 'Approved Creators',
            value: approvedCreators,
            icon: CheckCircle2,
            gradient: 'linear-gradient(135deg, #ff6600 0%, #ff4500 100%)',
        },
        {
            label: 'New This Week',
            value: stats.newThisWeek,
            icon: Clock,
            gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        },
    ];

    const detailedStats = [
        {
            label: 'Average Credits',
            value: stats.averageCredits ? stats.averageCredits.toLocaleString() : '0',
            icon: Award,
            color: '#0071e3',
            description: 'Average balance per profile',
        },
        {
            label: 'Countries',
            value: stats.countryCount,
            icon: Globe,
            color: '#34c759',
            description: 'Unique countries represented',
        },
        {
            label: 'Top Country',
            value: stats.topCountry,
            icon: BarChart3,
            color: '#ff6600',
            description: 'Largest user concentration',
        },
        {
            label: 'Profiles With Skills',
            value: stats.profilesWithSkills,
            icon: CheckCircle2,
            color: '#af52de',
            description: 'Profiles with at least one skill',
        },
    ];

    const creatorBreakdown = [
        { label: 'Approved', value: approvedCreators, color: '#34c759' },
        { label: 'Pending', value: pendingCreators, color: '#ff9500' },
        { label: 'Rejected', value: rejectedCreators, color: '#ff3b30' },
        { label: 'No Status', value: noStatusCreators, color: '#0071e3' },
    ];

    const allVisibleSelected =
        filteredUsers.length > 0 &&
        filteredUsers.every((user) => selectedUsers.has(user.userId));

    const copyToClipboard = useCallback(async (text: string, successMessage: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setBanner({ type: 'success', message: successMessage });
        } catch {
            setBanner({ type: 'warning', message: 'Copying to clipboard is not available in this browser.' });
        }
    }, []);

    const handleExport = useCallback(() => {
        const exportRows =
            selectedUsers.size > 0
                ? users.filter((user) => selectedUsers.has(user.userId))
                : filteredUsers;

        if (exportRows.length === 0) {
            setBanner({ type: 'warning', message: 'There are no users to export.' });
            return;
        }

        const headers = [
            'User ID',
            'Full Name',
            'Email',
            'Role',
            'Creator Status',
            'Country',
            'Skills',
            'Credits Balance',
            'Joined',
            'Updated',
        ];

        const csv = [
            headers.map(escapeCsv).join(','),
            ...exportRows.map((user) =>
                [
                    user.userId,
                    user.fullName,
                    user.email,
                    user.role,
                    user.creatorStatus,
                    user.country || '',
                    user.skills.join(' | '),
                    user.creditsBalance,
                    user.createdAt,
                    user.updatedAt,
                ]
                    .map(escapeCsv)
                    .join(','),
            ),
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `edutu-users-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);

        setBanner({
            type: 'success',
            message: `Exported ${exportRows.length} user${exportRows.length === 1 ? '' : 's'}.`,
        });
    }, [filteredUsers, selectedUsers, users]);

    const handleResetFilters = useCallback(() => {
        setSearchQuery('');
        setRoleFilter('all');
        setCreatorFilter('all');
        setSelectedUsers(new Set());
    }, []);

    const openInviteModal = useCallback(() => {
        if (!canManageUsers) {
            setBanner({
                type: 'warning',
                message: 'Only super admins can invite users or assign staff roles.',
            });
            return;
        }

        setInviteEmail('');
        setInviteRole('user');
        setShowInviteModal(true);
    }, [canManageUsers]);

    const closeInviteModal = useCallback(() => {
        setInviteEmail('');
        setInviteRole('user');
        setShowInviteModal(false);
    }, []);

    const handleInviteUser = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!canManageUsers) {
            setBanner({
                type: 'warning',
                message: 'Only super admins can invite users or assign staff roles.',
            });
            return;
        }

        const email = inviteEmail.trim();
        if (!email) {
            setBanner({ type: 'warning', message: 'Please enter an email address.' });
            return;
        }

        setInviteLoading(true);
        try {
            const response = await backendFetchJson<AdminInviteResponse>('/admin/users/invite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email,
                    role: inviteRole,
                    redirectUrl: `${window.location.origin}/login`,
                    notify: true,
                }),
            });

            if (!response.success || !response.invitation) {
                setBanner({
                    type: 'warning',
                    message: response.error || 'The invite could not be created.',
                });
                return;
            }

            if (response.invitation.url) {
                await copyToClipboard(
                    response.invitation.url,
                    `Invitation created for ${roleLabel(response.assignedRole || inviteRole)} and the invite link was copied to your clipboard.`,
                );
            } else {
                setBanner({
                    type: 'success',
                    message: `Invitation sent to ${email} as ${roleLabel(response.assignedRole || inviteRole)}.`,
                });
            }

            if (response.updatedUser) {
                setUsers((current) => current.map((user) => (
                    user.userId === response.updatedUser?.userId ? response.updatedUser : user
                )));
                setSelectedUser((current) => (
                    current?.userId === response.updatedUser?.userId ? response.updatedUser || current : current
                ));
            }

            void fetchUsers({ preserveBanner: true });
            closeInviteModal();
        } catch (error) {
            setBanner({
                type: 'error',
                message: error instanceof Error ? error.message : 'Invitation failed.',
            });
        } finally {
            setInviteLoading(false);
        }
    };

    const handleChangeUserRole = async (user: AdminUserRecord, role: AssignableRole) => {
        if (!canManageUsers) {
            setBanner({
                type: 'warning',
                message: 'Only super admins can change user roles.',
            });
            return;
        }

        if (user.role === role) {
            return;
        }

        setRoleUpdatingUserId(user.userId);
        try {
            const response = await backendFetchJson<AdminUpdateUserRoleResponse>(
                `/admin/users/${encodeURIComponent(user.userId)}/role`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ role }),
                },
            );

            if (!response.success || !response.user) {
                setBanner({
                    type: 'warning',
                    message: response.error || 'The role could not be updated.',
                });
                return;
            }

            setUsers((current) => current.map((item) => (
                item.userId === response.user?.userId ? response.user : item
            )));
            setSelectedUser((current) => (
                current?.userId === response.user?.userId ? response.user || current : current
            ));
            setBanner({
                type: 'success',
                message: `${response.user.fullName} is now ${roleLabel(response.user.role)}.`,
            });
            void fetchUsers({ preserveBanner: true });
        } catch (error) {
            setBanner({
                type: 'error',
                message: error instanceof Error ? error.message : 'Unable to update role.',
            });
        } finally {
            setRoleUpdatingUserId(null);
        }
    };

    const handleBulkToggle = useCallback(() => {
        setSelectedUsers((current) => {
            if (allVisibleSelected) {
                const next = new Set(current);
                filteredUsers.forEach((user) => next.delete(user.userId));
                return next;
            }

            return new Set([
                ...current,
                ...filteredUsers.map((user) => user.userId),
            ]);
        });
    }, [allVisibleSelected, filteredUsers]);

    const handleUserCopy = useCallback(
        async (user: AdminUserRecord) => {
            const text = user.email && !user.email.toLowerCase().includes('no email')
                ? user.email
                : user.userId;
            await copyToClipboard(
                text,
                user.email && !user.email.toLowerCase().includes('no email')
                    ? 'Email copied to clipboard.'
                    : 'User ID copied to clipboard.',
            );
        },
        [copyToClipboard],
    );

    return (
        <div className="users-page" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="page-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <h1 className="page-title">User Management</h1>
                        <span className="badge badge-primary" style={{ fontSize: '12px' }}>
                            Live Profiles
                        </span>
                    </div>
                    <p style={{ color: 'var(--text-tertiary)', margin: '4px 0 0 0', fontSize: '15px' }}>
                        Manage platform users, approval states, and Clerk invitations from one place.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" onClick={handleExport}>
                        <Download size={18} />
                        Export
                    </button>
                    <button
                        className="btn btn-primary"
                        disabled={!canManageUsers}
                        onClick={openInviteModal}
                        title={canManageUsers ? 'Invite a user or staff member' : 'Only super admins can invite users'}
                    >
                        <UserPlus size={18} />
                        Invite User/Admin
                    </button>
                </div>
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
                                    : banner.type === 'error'
                                        ? 'var(--danger)'
                                        : 'var(--apple-blue)'
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
                                        : banner.type === 'error'
                                            ? 'var(--danger)'
                                            : 'var(--apple-blue)'
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

            {!canManageUsers && (
                <div
                    className="card"
                    style={{
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        color: 'var(--text-secondary)',
                    }}
                >
                    <Shield size={18} />
                    <span>Viewing mode: only super admins can invite users or change platform roles.</span>
                </div>
            )}

            <div className="grid grid-cols-4">
                {topStats.map((stat, index) => (
                    <div
                        key={index}
                        className="card card-hover"
                        style={{
                            padding: '24px',
                            position: 'relative',
                            overflow: 'hidden',
                            background: stat.gradient,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                        }}
                    >
                        <div
                            style={{
                                fontSize: '32px',
                                marginBottom: '4px',
                                color: '#ffffff',
                                fontWeight: 700,
                                textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                            }}
                        >
                            {loading ? '—' : stat.value}
                        </div>
                        <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '14px' }}>
                            {stat.label}
                        </div>
                        <div style={{ position: 'absolute', top: '20px', right: '20px', opacity: 0.95 }}>
                            <stat.icon size={28} strokeWidth={1.5} style={{ color: '#ffffff' }} />
                        </div>
                    </div>
                ))}
            </div>

            <div className="users-summary-grid">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                    {detailedStats.map((stat, index) => (
                        <div key={index} className="card card-hover" style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div
                                    style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: '10px',
                                        background: `${stat.color}15`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: stat.color,
                                    }}
                                >
                                    <stat.icon size={18} strokeWidth={1.5} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>
                                        {stat.label}
                                    </div>
                                    <div style={{ fontSize: '20px', fontWeight: 600 }}>{stat.value}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                        {stat.description}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <BarChart3 size={20} color="var(--apple-blue)" />
                        <span style={{ fontWeight: 600 }}>Creator Status Breakdown</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {creatorBreakdown.map((item) => (
                            <div key={item.label}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{item.label}</span>
                                    <span style={{ fontSize: '14px', fontWeight: 600, color: item.color }}>{item.value}</span>
                                </div>
                                <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div
                                        style={{
                                            height: '100%',
                                            width: stats.total > 0 ? `${(item.value / stats.total) * 100}%` : '0%',
                                            background: item.color,
                                            borderRadius: '3px',
                                            transition: 'width 0.3s ease',
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: '18px', paddingTop: '18px', borderTop: '1px solid var(--border-light)', color: 'var(--text-tertiary)', fontSize: '13px', lineHeight: 1.5 }}>
                        Use the filters below to isolate specific account roles or creator application states.
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: '16px 20px' }}>
                <div className="users-toolbar-grid">
                    <div style={{ position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input
                            type="text"
                            className="input-field"
                            placeholder="Search by name, email, country, or skill..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            style={{ paddingLeft: '40px' }}
                        />
                    </div>
                    <select
                        className="input-field"
                        value={roleFilter}
                        onChange={(event) => setRoleFilter(event.target.value as 'all' | 'user' | 'admin')}
                    >
                        {roleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <select
                        className="input-field"
                        value={creatorFilter}
                        onChange={(event) => setCreatorFilter(event.target.value as 'all' | 'none' | 'pending' | 'approved' | 'rejected')}
                    >
                        {creatorStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <button
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        onClick={handleResetFilters}
                    >
                        <Filter size={18} />
                        Reset Filters
                    </button>
                </div>
            </div>

            {selectedUsers.size > 0 && (
                <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <CheckCircle2 size={18} color="var(--success)" />
                        <span style={{ fontWeight: 600 }}>
                            {selectedUsers.size} user{selectedUsers.size === 1 ? '' : 's'} selected
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary" onClick={() => setSelectedUsers(new Set())}>
                            Clear Selection
                        </button>
                        <button className="btn btn-primary" onClick={handleExport}>
                            Export Selected
                        </button>
                    </div>
                </div>
            )}

            <div className="card" style={{ overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        <Loader2 size={24} style={{ marginBottom: '12px', animation: 'spin 1s linear infinite' }} />
                        <div>Loading users...</div>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center' }}>
                        <UsersIcon size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                        <p style={{ color: 'var(--text-tertiary)' }}>No users matched the current filters.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="table users-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}>
                                        <input
                                            type="checkbox"
                                            checked={allVisibleSelected}
                                            onChange={handleBulkToggle}
                                            style={{ cursor: 'pointer' }}
                                        />
                                    </th>
                                    <th>User</th>
                                    <th>Role</th>
                                    <th>Creator Status</th>
                                    <th>Country</th>
                                    <th>Skills</th>
                                    <th>Joined</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map((user) => {
                                    const initials = user.fullName?.trim().charAt(0) || user.email?.trim().charAt(0) || 'U';
                                    const isSelected = selectedUsers.has(user.userId);
                                    const isRoleUpdating = roleUpdatingUserId === user.userId;
                                    const canChangeRole = canManageUsers && user.role !== 'super_admin';

                                    return (
                                        <tr key={user.userId} style={isSelected ? { background: 'rgba(0, 113, 227, 0.04)' } : undefined}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => {
                                                        setSelectedUsers((current) => {
                                                            const next = new Set(current);
                                                            if (next.has(user.userId)) next.delete(user.userId);
                                                            else next.add(user.userId);
                                                            return next;
                                                        });
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--apple-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, flexShrink: 0 }}>
                                                        {initials.toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{user.fullName}</div>
                                                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Mail size={12} /> {user.email}
                                                        </div>
                                                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                                                            Credits: {user.creditsBalance.toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`badge ${roleBadgeClass(user.role)}`}>{roleLabel(user.role)}</span>
                                            </td>
                                            <td>
                                                <span className={`badge ${creatorBadgeClass(user.creatorStatus)}`}>{creatorLabel(user.creatorStatus)}</span>
                                            </td>
                                            <td>
                                                {user.country ? (
                                                    <span className="badge badge-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}>
                                                        <Globe size={12} />
                                                        {user.country}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>Not set</span>
                                                )}
                                            </td>
                                            <td>
                                                {user.skills.length > 0 ? (
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {user.skills.slice(0, 3).map((skill) => (
                                                            <span key={skill} className="badge badge-primary" style={{ fontSize: '11px' }}>
                                                                {skill}
                                                            </span>
                                                        ))}
                                                        {user.skills.length > 3 && (
                                                            <span style={{ color: 'var(--text-tertiary)', fontSize: '12px', alignSelf: 'center' }}>
                                                                +{user.skills.length - 3} more
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>No skills listed</span>
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-tertiary)', fontSize: '14px' }}>
                                                    <Calendar size={14} />
                                                    {formatDate(user.createdAt)}
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div className="users-role-actions">
                                                    {canChangeRole && (
                                                        isPrivilegedRole(user.role) ? (
                                                            <button
                                                                className="btn btn-secondary"
                                                                style={{ padding: '6px 10px' }}
                                                                title="Remove staff access"
                                                                disabled={isRoleUpdating}
                                                                onClick={() => void handleChangeUserRole(user, 'user')}
                                                            >
                                                                {isRoleUpdating ? (
                                                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                                                ) : (
                                                                    <Shield size={16} />
                                                                )}
                                                                <span>Remove Staff</span>
                                                            </button>
                                                        ) : (
                                                            <button
                                                                className="btn btn-primary"
                                                                style={{ padding: '6px 10px' }}
                                                                title="Promote to admin"
                                                                disabled={isRoleUpdating}
                                                                onClick={() => void handleChangeUserRole(user, 'admin')}
                                                            >
                                                                {isRoleUpdating ? (
                                                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                                                ) : (
                                                                    <Shield size={16} />
                                                                )}
                                                                <span>Make Admin</span>
                                                            </button>
                                                        )
                                                    )}
                                                    <button
                                                        className="btn btn-secondary"
                                                        style={{ padding: '6px 10px' }}
                                                        title="View user details"
                                                        onClick={() => setSelectedUser(user)}
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                    <button
                                                        className="btn btn-secondary"
                                                        style={{ padding: '6px 10px' }}
                                                        title="Copy email or user ID"
                                                        onClick={() => void handleUserCopy(user)}
                                                    >
                                                        <Copy size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {selectedUser && (
                <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
                    <div
                        className="modal-content"
                        style={{ maxWidth: '640px' }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '24px' }}>{selectedUser.fullName}</h2>
                                <p style={{ margin: '6px 0 0 0', color: 'var(--text-tertiary)' }}>
                                    {selectedUser.email}
                                </p>
                            </div>
                            <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => setSelectedUser(null)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px', marginBottom: '20px' }}>
                            <div className="card" style={{ padding: '14px' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Role</div>
                                <div style={{ fontWeight: 600, marginBottom: selectedUser.role === 'super_admin' ? 0 : '10px' }}>
                                    {roleLabel(selectedUser.role)}
                                </div>
                                {selectedUser.role !== 'super_admin' && (
                                    <select
                                        className="input-field users-role-select"
                                        value={isAssignableRole(selectedUser.role) ? selectedUser.role : 'user'}
                                        disabled={!canManageUsers || roleUpdatingUserId === selectedUser.userId}
                                        onChange={(event) => {
                                            void handleChangeUserRole(
                                                selectedUser,
                                                event.target.value as AssignableRole,
                                            );
                                        }}
                                    >
                                        {assignableRoleOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <div className="card" style={{ padding: '14px' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Creator Status</div>
                                <div style={{ fontWeight: 600 }}>{creatorLabel(selectedUser.creatorStatus)}</div>
                            </div>
                            <div className="card" style={{ padding: '14px' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Country</div>
                                <div style={{ fontWeight: 600 }}>{selectedUser.country || 'Not set'}</div>
                            </div>
                            <div className="card" style={{ padding: '14px' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '4px' }}>Credits Balance</div>
                                <div style={{ fontWeight: 600 }}>{selectedUser.creditsBalance.toLocaleString()}</div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>Skills</div>
                            {selectedUser.skills.length > 0 ? (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {selectedUser.skills.map((skill) => (
                                        <span key={skill} className="badge badge-primary">
                                            {skill}
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ color: 'var(--text-tertiary)' }}>No skills listed.</div>
                            )}
                        </div>

                        {selectedUser.creatorStatus === 'rejected' && selectedUser.creatorRejectionReason && (
                            <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>Rejection Reason</div>
                                <div style={{ color: 'var(--text-secondary)' }}>{selectedUser.creatorRejectionReason}</div>
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => void handleUserCopy(selectedUser)}
                                >
                                    <Copy size={16} />
                                    Copy Contact
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => void copyToClipboard(selectedUser.userId, 'User ID copied to clipboard.')}
                                >
                                    <Copy size={16} />
                                    Copy ID
                                </button>
                            </div>
                            <button className="btn btn-primary" onClick={() => setSelectedUser(null)}>
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showInviteModal && (
                <div
                    className="modal-overlay"
                    onClick={closeInviteModal}
                >
                    <div
                        className="modal-content"
                        style={{ maxWidth: '560px' }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '24px' }}>Invite User/Admin</h2>
                                <p style={{ margin: '6px 0 0 0', color: 'var(--text-tertiary)' }}>
                                    Send a Clerk invitation and assign the platform role.
                                </p>
                            </div>
                            <button
                                className="btn btn-secondary"
                                style={{ padding: '6px 10px' }}
                                onClick={closeInviteModal}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={(event) => void handleInviteUser(event)}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Email address</span>
                                    <input
                                        className="input-field"
                                        type="email"
                                        value={inviteEmail}
                                        onChange={(event) => setInviteEmail(event.target.value)}
                                        placeholder="name@example.com"
                                        autoFocus
                                    />
                                </label>

                                <label style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Platform role</span>
                                    <select
                                        className="input-field"
                                        value={inviteRole}
                                        onChange={(event) => setInviteRole(event.target.value as AssignableRole)}
                                    >
                                        {assignableRoleOptions.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <div className="card" style={{ padding: '14px', background: 'var(--bg-tertiary)' }}>
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        Admin and staff roles receive dashboard access after accepting the invite.
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={closeInviteModal}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={inviteLoading}
                                    >
                                        {inviteLoading ? 'Sending...' : 'Send Invite'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Users;
