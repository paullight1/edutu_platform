import { useEffect, useState } from 'react';
import {
    Users,
    Target,
    Activity,
    TrendingUp,
    ArrowRight,
    UserPlus,
    Plus,
    Shield,
    BarChart3,
    Zap,
    Award,
    CheckCircle2,
    Download,
    Send
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface Activity {
    id: string;
    type: string;
    action: string;
    detail: string;
    time: string;
    icon: any;
    timestamp: string;
}

const Dashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        users: 0,
        opportunities: 0,
        applications: 0,
        creators: 0
    });
    const [loading, setLoading] = useState(true);
    const [recentActivity, setRecentActivity] = useState<Activity[]>([]);

    useEffect(() => {
        async function fetchStats() {
            // Fetch counts
            const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
            const { count: oppsCount } = await supabase.from('opportunities').select('*', { count: 'exact', head: true }).eq('status', 'active');
            const { count: appsCount } = await supabase.from('opportunity_applications').select('*', { count: 'exact', head: true });
            const { count: creatorsCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'creator');

            setStats({
                users: usersCount || 0,
                opportunities: oppsCount || 0,
                applications: appsCount || 0,
                creators: creatorsCount || 0
            });

            // Fetch real recent activities from multiple tables
            await fetchRecentActivities();

            setLoading(false);
        }
        fetchStats();
    }, []);

    async function fetchRecentActivities() {
        const activities: Activity[] = [];

        // Get recent users (last 5)
        const { data: recentUsers } = await supabase
            .from('profiles')
            .select('user_id, full_name, email, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

        if (recentUsers) {
            recentUsers.forEach(user => {
                activities.push({
                    id: `user-${user.user_id}`,
                    type: 'user',
                    action: 'New user registered',
                    detail: user.email || user.full_name || 'Anonymous',
                    time: formatTimeAgo(user.created_at),
                    timestamp: user.created_at,
                    icon: UserPlus
                });
            });
        }

        // Get recent opportunities (last 3)
        const { data: recentOpps } = await supabase
            .from('opportunities')
            .select('id, title, created_at')
            .order('created_at', { ascending: false })
            .limit(3);

        if (recentOpps) {
            recentOpps.forEach(opp => {
                activities.push({
                    id: `opp-${opp.id}`,
                    type: 'opportunity',
                    action: 'New opportunity posted',
                    detail: opp.title,
                    time: formatTimeAgo(opp.created_at),
                    timestamp: opp.created_at,
                    icon: Plus
                });
            });
        }

        // Get recent applications (last 5)
        const { data: recentApps } = await supabase
            .from('opportunity_applications')
            .select('id, user_id, opportunity_id, created_at')
            .order('created_at', { ascending: false })
            .limit(5);

        if (recentApps) {
            // Get opportunity titles for context
            const oppIds = [...new Set(recentApps.map(a => a.opportunity_id))];
            const { data: opps } = await supabase
                .from('opportunities')
                .select('id, title')
                .in('id', oppIds);

            const oppMap = new Map(opps?.map(o => [o.id, o.title]) || []);

            recentApps.forEach(app => {
                activities.push({
                    id: `app-${app.id}`,
                    type: 'application',
                    action: 'New application submitted',
                    detail: oppMap.get(app.opportunity_id) || 'Opportunity',
                    time: formatTimeAgo(app.created_at),
                    timestamp: app.created_at,
                    icon: Send
                });
            });
        }

        // Get recent creator approvals
        const { data: recentCreators } = await supabase
            .from('profiles')
            .select('user_id, full_name, creator_status, updated_at')
            .eq('creator_status', 'approved')
            .order('updated_at', { ascending: false })
            .limit(3);

        if (recentCreators) {
            recentCreators.forEach(creator => {
                activities.push({
                    id: `creator-${creator.user_id}`,
                    type: 'creator',
                    action: 'Creator approved',
                    detail: creator.full_name || 'New Creator',
                    time: formatTimeAgo(creator.updated_at),
                    timestamp: creator.updated_at,
                    icon: CheckCircle2
                });
            });
        }

        // Sort by timestamp (most recent first) and take top 10
        activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setRecentActivity(activities.slice(0, 10));
    }

    function formatTimeAgo(dateString: string): string {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }

    const mainStats = [
        {
            icon: Users,
            label: 'Total Users',
            value: stats.users,
            gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            iconColor: '#ffffff'
        },
        {
            icon: Target,
            label: 'Active Opportunities',
            value: stats.opportunities,
            gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            iconColor: '#ffffff'
        },
        {
            icon: Activity,
            label: 'Total Applications',
            value: stats.applications,
            gradient: 'linear-gradient(135deg, #ff6600 0%, #ff4500 100%)',
            iconColor: '#ffffff'
        },
        {
            icon: Shield,
            label: 'Verified Creators',
            value: stats.creators,
            gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            iconColor: '#ffffff'
        },
    ];

    const quickActions = [
        {
            label: 'Add User',
            desc: 'Create new account',
            icon: UserPlus,
            color: '#0071e3',
            bgPattern: 'radial-gradient(circle at top right, rgba(0,113,227,0.1) 0%, transparent 50%)',
            action: () => navigate('/admin/users')
        },
        {
            label: 'New Opportunity',
            desc: 'Post opportunity',
            icon: Plus,
            color: '#34c759',
            bgPattern: 'radial-gradient(circle at top right, rgba(52,199,89,0.1) 0%, transparent 50%)',
            action: () => navigate('/admin/opportunities')
        },
        {
            label: 'Manage Roles',
            desc: 'Update permissions',
            icon: Shield,
            color: '#ff6600',
            bgPattern: 'radial-gradient(circle at top right, rgba(255,102,0,0.1) 0%, transparent 50%)',
            action: () => navigate('/admin/users')
        },
        {
            label: 'View Analytics',
            desc: 'See insights',
            icon: BarChart3,
            color: '#af52de',
            bgPattern: 'radial-gradient(circle at top right, rgba(175,82,222,0.1) 0%, transparent 50%)',
            action: () => navigate('/admin/roadmaps')
        },
    ];

    return (
        <div className="dashboard-container">
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h1 className="page-title">Dashboard</h1>
                        <span className="badge badge-primary" style={{ fontSize: '12px' }}>
                            <Zap size={12} style={{ marginRight: '4px' }} />
                            Live
                        </span>
                    </div>
                    <p style={{ color: 'var(--text-tertiary)', margin: '4px 0 0 0', fontSize: '15px' }}>
                        Welcome back! Here's what's happening with your platform.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary">
                        <Download size={18} />
                        <span className="btn-label">Export</span>
                    </button>
                    <button className="btn btn-primary">
                        <span className="btn-label">View Reports</span>
                        <ArrowRight size={16} />
                    </button>
                </div>
            </div>

            {/* Main Stats Cards */}
            <div className="stats-grid">
                {mainStats.map((stat, index) => (
                    <div
                        key={index}
                        className="card card-hover tooltip"
                        title={stat.label}
                        style={{
                            padding: '24px',
                            position: 'relative',
                            overflow: 'hidden',
                            background: stat.gradient,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-4px)';
                            e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
                        }}
                    >
                        <div className="stat-value" style={{ fontSize: '32px', marginBottom: '4px', color: '#ffffff', fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>
                            {loading ? '-' : stat.value.toLocaleString()}
                        </div>
                        <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: '2px', fontSize: '15px' }}>
                            {stat.label}
                        </div>

                        {/* Icon - Top Right Corner */}
                        <div style={{
                            position: 'absolute',
                            top: '20px',
                            right: '20px',
                            opacity: 0.95,
                        }}>
                            <stat.icon size={28} strokeWidth={1.5} style={{ color: stat.iconColor }} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Quick Actions Section */}
            <div>
                <h3 style={{ marginBottom: '16px', fontSize: '19px', fontWeight: 600 }}>Quick Actions</h3>
                <div className="grid grid-cols-4">
                    {quickActions.map((action, index) => (
                        <div
                            key={index}
                            className="card card-hover tooltip"
                            title={action.label}
                            onClick={action.action}
                            style={{
                                padding: '24px',
                                cursor: 'pointer',
                                position: 'relative',
                                overflow: 'hidden',
                                background: action.bgPattern
                            }}
                        >
                            <div
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: '12px',
                                    background: action.color,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    marginBottom: '16px',
                                    boxShadow: `0 4px 16px ${action.color}40`
                                }}
                            >
                                <action.icon size={22} strokeWidth={1.5} />
                            </div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', fontSize: '16px' }}>
                                {action.label}
                            </div>
                            <div style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
                                {action.desc}
                            </div>
                            <ArrowRight
                                size={18}
                                style={{
                                    position: 'absolute',
                                    bottom: '24px',
                                    right: '24px',
                                    color: 'var(--text-tertiary)',
                                    opacity: 0.5
                                }}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* Recent Activity & Performance */}
            <div className="grid grid-cols-2">
                {/* Recent Activity */}
                <div className="card" style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>Recent Activity</h3>
                        <button className="btn btn-pill" style={{ fontSize: '13px' }}>View All</button>
                    </div>
                    <div style={{ padding: '16px' }}>
                        {recentActivity.map((activity, idx) => (
                            <div
                                key={activity.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '12px 0',
                                    borderBottom: idx < recentActivity.length - 1 ? '1px solid var(--border-light)' : 'none'
                                }}
                            >
                                <div
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: '10px',
                                        background: 'var(--bg-tertiary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'var(--apple-blue)'
                                    }}
                                >
                                    <activity.icon size={18} strokeWidth={1.5} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 500, fontSize: '14px', marginBottom: '2px' }}>
                                        {activity.action}
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
                                        {activity.detail}
                                    </div>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                    {activity.time}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Performance Metrics */}
                <div className="card" style={{ padding: '24px' }}>
                    <h3 style={{ margin: '0 0 20px 0', fontSize: '17px', fontWeight: 600 }}>Platform Health</h3>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {[
                            { label: 'System Uptime', value: 99.9, color: '#34c759', icon: CheckCircle2 },
                            { label: 'API Response Time', value: 85, color: '#0071e3', icon: Zap },
                            { label: 'Storage Usage', value: 62, color: '#ff6600', icon: Award },
                        ].map((metric, idx) => (
                            <div key={idx}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                    <div
                                        style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: '8px',
                                            background: `${metric.color}15`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: metric.color
                                        }}
                                    >
                                        <metric.icon size={16} strokeWidth={1.5} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: 500, fontSize: '14px' }}>{metric.label}</span>
                                            <span style={{ fontWeight: 600, color: metric.color }}>{metric.value}%</span>
                                        </div>
                                        <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div
                                                style={{
                                                    height: '100%',
                                                    width: `${metric.value}%`,
                                                    background: metric.color,
                                                    borderRadius: '3px',
                                                    transition: 'width 0.3s ease'
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <style>{`
                /* Tooltip for cards */
                .tooltip {
                    position: relative;
                }

                .tooltip:hover::after {
                    content: attr(title);
                    position: absolute;
                    bottom: 100%;
                    left: 50%;
                    transform: translateX(-50%) translateY(-8px);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    padding: 8px 14px;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    white-space: nowrap;
                    opacity: 1;
                    pointer-events: none;
                    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
                    border: 1px solid var(--border-light);
                    z-index: 100;
                    transition: all 0.2s;
                }

                @media (max-width: 768px) {
                    .tooltip:hover::after {
                        display: none;
                    }
                }
                .dashboard-container {
                    display: flex;
                    flex-direction: column;
                    gap: 28px;
                }

                @media (max-width: 768px) {
                    .dashboard-container {
                        gap: 20px;
                    }

                    .page-header {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 16px;
                    }

                    .page-header .btn-label {
                        display: none;
                    }

                    .page-header .btn {
                        padding: 8px;
                    }
                }
            `}</style>
        </div>
    );
};

export default Dashboard;
