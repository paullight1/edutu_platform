import { useEffect, useState, useCallback } from 'react';
import { 
    ShieldCheck, 
    CheckCircle, 
    XCircle, 
    ExternalLink, 
    Clock, 
    User,
    Users,
    TrendingUp,
    Star,
    Mail,
    Calendar,
    FileText,
    CheckCircle2,
    Search,
    MoreVertical,
    Download,
    AlertCircle,
    Ban,
    Loader2,
    Filter,
    Eye,
    MessageSquare,
    Send
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CreatorApplication {
    user_id: string;
    full_name: string;
    email: string;
    creator_status: 'none' | 'pending' | 'approved' | 'rejected';
    avatar_url: string;
    role: string;
    created_at: string;
    updated_at: string;
    creator_metadata: {
        expertise: string;
        bio: string;
        portfolioUrl: string;
        socialLinks: string;
        appliedAt: string;
        linkedin_url?: string;
        opportunity_type?: string;
        opportunity_title?: string;
        kyc_image_url?: string;
    };
}

const ITEMS_PER_PAGE = 20;

const Creators = () => {
    const [applications, setApplications] = useState<CreatorApplication[]>([]);
    const [allCreators, setAllCreators] = useState<CreatorApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
    
    // Stats
    const [stats, setStats] = useState({
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        thisWeek: 0
    });

    // Real-time subscription
    useEffect(() => {
        // Initial fetch
        fetchData();

        // Subscribe to real-time changes
        const channel = supabase
            .channel('creators-changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'profiles',
                filter: 'creator_status=in.(pending,approved,rejected)'
            }, (payload) => {
                console.log('Creator change detected:', payload);
                fetchData(); // Refresh data on any change
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchData = async () => {
        setLoading(true);
        
        // Fetch all profiles with creator_status
        const { data: profilesData, error } = await supabase
            .from('profiles')
            .select('*')
            .in('creator_status', ['pending', 'approved', 'rejected'])
            .order('updated_at', { ascending: false });

        if (!error && profilesData) {
            const creators = profilesData as unknown as CreatorApplication[];
            setApplications(creators.filter(c => c.creator_status === 'pending'));
            setAllCreators(creators);
            
            // Calculate stats
            const now = new Date();
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            setStats({
                total: creators.length,
                pending: creators.filter(c => c.creator_status === 'pending').length,
                approved: creators.filter(c => c.creator_status === 'approved').length,
                rejected: creators.filter(c => c.creator_status === 'rejected').length,
                thisWeek: creators.filter(c => new Date(c.updated_at) >= weekAgo).length
            });
        }
        
        setLoading(false);
    };

    const handleStatus = async (userId: string, status: 'approved' | 'rejected', reason?: string) => {
        try {
            const updateData: any = {
                creator_status: status,
                role: status === 'approved' ? 'creator' : 'user',
                updated_at: new Date().toISOString()
            };
            
            if (reason) {
                updateData.creator_rejection_reason = reason;
            }

            const { error } = await supabase
                .from('profiles')
                .update(updateData)
                .eq('user_id', userId);

            if (error) {
                console.error('Error updating status:', error);
                return false;
            }

            // Send notification to user
            await supabase.from('user_notifications').insert({
                user_id: userId,
                category: 'creator',
                title: status === 'approved' ? 'Creator Application Approved!' : 'Creator Application Update',
                body: status === 'approved' 
                    ? 'Congratulations! Your creator application has been approved. You can now create and share roadmaps.'
                    : 'Your creator application was not approved at this time. You can apply again in the future.',
                data: { status }
            });

            fetchData();
            return true;
        } catch (err) {
            console.error('Status update error:', err);
            return false;
        }
    };

    const handleBulkAction = async (action: 'approve' | 'reject') => {
        const pendingIds = getCurrentItems()
            .filter(item => item.creator_status === 'pending')
            .map(item => item.user_id);

        if (pendingIds.length === 0) return;

        const confirmMsg = action === 'approve' 
            ? `Approve ${pendingIds.length} creator application(s)?` 
            : `Reject ${pendingIds.length} creator application(s)?`;

        if (!window.confirm(confirmMsg)) return;

        setLoading(true);
        for (const userId of pendingIds) {
            await handleStatus(userId, action === 'approve' ? 'approved' : 'rejected');
        }
        setLoading(false);
    };

    const getCurrentItems = useCallback(() => {
        let items = [...allCreators];
        
        // Filter by tab
        if (activeTab !== 'all') {
            items = items.filter(c => c.creator_status === activeTab);
        }

        // Filter by search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            items = items.filter(c => 
                c.full_name?.toLowerCase().includes(query) ||
                c.email?.toLowerCase().includes(query) ||
                c.creator_metadata?.expertise?.toLowerCase().includes(query)
            );
        }

        return items;
    }, [allCreators, activeTab, searchQuery]);

    const statCards = [
        { 
            label: 'Pending Review', 
            value: stats.pending, 
            icon: Clock, 
            gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
        },
        { 
            label: 'Approved Creators', 
            value: stats.approved, 
            icon: ShieldCheck, 
            gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
        },
        { 
            label: 'Total Applications', 
            value: stats.total, 
            icon: Users, 
            gradient: 'linear-gradient(135deg, #ff6600 0%, #ff4500 100%)'
        },
        { 
            label: 'Rejected', 
            value: stats.rejected, 
            icon: XCircle, 
            gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
        },
    ];

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'approved':
                return (
                    <span className="badge badge-success">
                        <CheckCircle2 size={12} style={{ marginRight: '4px' }} />
                        Verified
                    </span>
                );
            case 'rejected':
                return (
                    <span className="badge badge-danger">
                        <XCircle size={12} style={{ marginRight: '4px' }} />
                        Rejected
                    </span>
                );
            default:
                return (
                    <span className="badge" style={{ background: 'rgba(255, 102, 0, 0.15)', color: '#ff6600' }}>
                        <Clock size={12} style={{ marginRight: '4px' }} />
                        Pending Review
                    </span>
                );
        }
    };

    const currentItems = getCurrentItems();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Creator Management</h1>
                    <p style={{ color: 'var(--text-tertiary)', margin: '4px 0 0 0', fontSize: '15px' }}>
                        Review applications and manage verified creators
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-secondary">
                        <Download size={18} />
                        Export List
                    </button>
                    <button className="btn btn-primary" onClick={fetchData} disabled={loading}>
                        {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                        {loading ? 'Syncing...' : 'Sync Changes'}
                    </button>
                </div>
            </div>

            {/* Real-time Indicator */}
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                padding: '10px 16px', 
                background: 'rgba(16, 185, 129, 0.1)', 
                borderRadius: '8px',
                border: '1px solid rgba(16, 185, 129, 0.2)'
            }}>
                <div style={{ 
                    width: 8, 
                    height: 8, 
                    borderRadius: '50%', 
                    background: '#10b981',
                    animation: 'pulse 2s infinite'
                }} />
                <span style={{ color: '#10b981', fontSize: '13px', fontWeight: 500 }}>
                    Real-time updates enabled — Changes sync automatically
                </span>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-4">
                {statCards.map((stat, index) => (
                    <div 
                        key={index} 
                        className="card card-hover" 
                        style={{ 
                            padding: '20px', 
                            position: 'relative', 
                            overflow: 'hidden', 
                            background: stat.gradient, 
                            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                            cursor: 'pointer'
                        }}
                        onClick={() => {
                            if (stat.label === 'Pending Review' && stats.pending > 0) setActiveTab('pending');
                            if (stat.label === 'Approved Creators' && stats.approved > 0) setActiveTab('approved');
                            if (stat.label === 'Rejected' && stats.rejected > 0) setActiveTab('rejected');
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
                        <div style={{ fontSize: '32px', marginBottom: '4px', color: '#ffffff', fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>{stat.value}</div>
                        <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '13px' }}>{stat.label}</div>
                        
                        {/* Icon */}
                        <div style={{ position: 'absolute', top: '16px', right: '16px', opacity: 0.9 }}>
                            <stat.icon size={24} strokeWidth={1.5} style={{ color: '#ffffff' }} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Tab Filters */}
            <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input 
                            type="text"
                            className="input-field"
                            placeholder="Search by name, email, or expertise..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '40px' }}
                        />
                    </div>
                    
                    <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '10px' }}>
                        {[
                            { id: 'pending', label: 'Pending', count: stats.pending, icon: Clock },
                            { id: 'approved', label: 'Verified', count: stats.approved, icon: ShieldCheck },
                            { id: 'rejected', label: 'Rejected', count: stats.rejected, icon: XCircle },
                            { id: 'all', label: 'All', count: stats.total, icon: Users },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: activeTab === tab.id ? 'var(--apple-blue)' : 'transparent',
                                    color: activeTab === tab.id ? 'white' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    fontWeight: 500,
                                    fontSize: '13px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <tab.icon size={14} />
                                {tab.label}
                                <span style={{ 
                                    padding: '2px 6px', 
                                    background: activeTab === tab.id ? 'rgba(255,255,255,0.2)' : 'var(--bg-secondary)', 
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    fontWeight: 600
                                }}>
                                    {tab.count}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Bulk Actions */}
                    {activeTab === 'pending' && stats.pending > 0 && (
                        <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                            <button 
                                className="btn"
                                onClick={() => handleBulkAction('approve')}
                                style={{ 
                                    background: 'rgba(52, 199, 89, 0.1)', 
                                    color: 'var(--success)', 
                                    border: '1px solid var(--success)',
                                    padding: '8px 14px',
                                    fontSize: '13px'
                                }}
                            >
                                <CheckCircle size={14} />
                                Approve All
                            </button>
                            <button 
                                className="btn"
                                onClick={() => handleBulkAction('reject')}
                                style={{ 
                                    background: 'rgba(255, 59, 48, 0.1)', 
                                    color: 'var(--danger)', 
                                    border: '1px solid var(--danger)',
                                    padding: '8px 14px',
                                    fontSize: '13px'
                                }}
                            >
                                <XCircle size={14} />
                                Reject All
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Applications Table */}
            <div className="card" style={{ overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        <Loader2 size={40} className="animate-spin" style={{ margin: '0 auto 16px' }} />
                        <p>Loading creators...</p>
                    </div>
                ) : currentItems.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center' }}>
                        {activeTab === 'pending' ? (
                            <>
                                <CheckCircle2 size={48} style={{ opacity: 0.3, marginBottom: '16px', color: '#10b981' }} />
                                <p style={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: '4px' }}>All caught up!</p>
                                <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>No pending applications to review</p>
                            </>
                        ) : (
                            <>
                                <Users size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                                <p style={{ color: 'var(--text-tertiary)', marginBottom: '8px' }}>No {activeTab} creators found</p>
                                <p style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
                                    {searchQuery ? 'Try adjusting your search' : 'Changes will appear here in real-time'}
                                </p>
                            </>
                        )}
                    </div>
                ) : (
                    <>
                        <div style={{ padding: '12px 20px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
                                Showing {currentItems.length} of {stats.total} creators
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                                Click on any row to view full details
                            </span>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Applicant</th>
                                        <th>Expertise</th>
                                        <th>Achievement</th>
                                        <th>Applied</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {currentItems.map((app) => (
                                        <tr key={app.user_id} style={{ cursor: 'pointer' }}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    {app.avatar_url ? (
                                                        <img src={app.avatar_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
                                                    ) : (
                                                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--apple-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600 }}>
                                                            {app.full_name?.[0]?.toUpperCase() || '?'}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{app.full_name || 'Anonymous User'}</div>
                                                        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Mail size={12} /> {app.email || 'No email'}
                                                        </div>
                                                        {app.creator_metadata?.linkedin_url && (
                                                            <a 
                                                                href={app.creator_metadata.linkedin_url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                style={{ fontSize: '12px', color: 'var(--apple-blue)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}
                                                            >
                                                                <ExternalLink size={12} /> View LinkedIn
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge badge-primary">{app.creator_metadata?.expertise || app.creator_metadata?.opportunity_type || 'General'}</span>
                                            </td>
                                            <td>
                                                <div style={{ maxWidth: '220px' }}>
                                                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }} className="truncate">
                                                        {app.creator_metadata?.opportunity_title || app.creator_metadata?.bio?.substring(0, 50) || 'No title'}
                                                    </div>
                                                    {app.creator_metadata?.kyc_image_url && (
                                                        <a 
                                                            href={app.creator_metadata.kyc_image_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            style={{ fontSize: '12px', color: 'var(--apple-blue)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                        >
                                                            <FileText size={12} /> View Proof
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                                    {app.created_at ? new Date(app.created_at).toLocaleDateString('en-US', { 
                                                        month: 'short', 
                                                        day: 'numeric',
                                                        year: 'numeric'
                                                    }) : 'N/A'}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                                                    {app.updated_at && app.updated_at !== app.created_at 
                                                        ? `Updated: ${new Date(app.updated_at).toLocaleDateString()}`
                                                        : ''}
                                                </div>
                                            </td>
                                            <td>
                                                {getStatusBadge(app.creator_status)}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                {app.creator_status === 'pending' ? (
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                        <button
                                                            className="btn btn-primary"
                                                            onClick={() => handleStatus(app.user_id, 'approved')}
                                                            style={{ 
                                                                padding: '6px 12px', 
                                                                fontSize: '12px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <CheckCircle size={14} />
                                                            Approve
                                                        </button>
                                                        <button
                                                            className="btn"
                                                            onClick={() => {
                                                                const reason = prompt('Reason for rejection (optional):');
                                                                handleStatus(app.user_id, 'rejected', reason || undefined);
                                                            }}
                                                            style={{ 
                                                                padding: '6px 12px', 
                                                                background: 'rgba(255, 59, 48, 0.1)', 
                                                                color: 'var(--danger)', 
                                                                border: '1px solid var(--danger)',
                                                                fontSize: '12px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <XCircle size={14} />
                                                            Reject
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                        {app.creator_status === 'approved' ? (
                                                            <button
                                                                className="btn btn-secondary"
                                                                onClick={() => handleStatus(app.user_id, 'rejected')}
                                                                style={{ 
                                                                    padding: '6px 10px', 
                                                                    fontSize: '11px'
                                                                }}
                                                                title="Revoke creator access"
                                                            >
                                                                <Ban size={14} />
                                                                Revoke
                                                            </button>
                                                        ) : (
                                                            <button
                                                                className="btn btn-primary"
                                                                onClick={() => handleStatus(app.user_id, 'approved')}
                                                                style={{ 
                                                                    padding: '6px 10px', 
                                                                    fontSize: '11px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                            >
                                                                <CheckCircle size={14} />
                                                                Re-approve
                                                            </button>
                                                        )}
                                                        <button className="btn btn-secondary" style={{ padding: '6px' }}>
                                                            <MoreVertical size={16} />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {/* Help Text */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-tertiary)' }}>
                <AlertCircle size={16} />
                <span>
                    <strong>Tip:</strong> Approved creators can publish roadmaps in the mobile app. Changes here sync in real-time. 
                    Use the search to find specific creators by name, email, or expertise area.
                </span>
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </div>
    );
};

export default Creators;
