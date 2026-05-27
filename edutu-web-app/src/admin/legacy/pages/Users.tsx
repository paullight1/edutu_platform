import { useEffect, useState } from 'react';
import { 
    Users as UsersIcon, 
    Mail, 
    Calendar, 
    Search,
    Filter,
    MoreVertical,
    Shield,
    Download,
    UserPlus,
    TrendingUp,
    MapPin,
    GraduationCap,
    Globe,
    BarChart3,
    Award,
    Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface User {
    user_id: string;
    full_name: string;
    email: string;
    avatar_url: string;
    role: string;
    created_at: string;
    school?: string;
    major?: string;
    location?: string;
    country?: string;
    age?: number;
    pursuit?: string; // BSc, MSc, PhD, etc.
}

const Users = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

    // Stats
    const [userStats, setUserStats] = useState({
        total: 0,
        students: 0,
        creators: 0,
        newThisWeek: 0,
        avgAge: 0,
        countryCount: 0,
        topCountry: 'N/A',
        bsc: 0,
        msc: 0,
        phd: 0,
        other: 0
    });

    useEffect(() => {
        fetchUsers();
    }, []);

    useEffect(() => {
        filterUsers();
    }, [users, searchQuery, roleFilter]);

    async function fetchUsers() {
        setLoading(true);
        const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        const userData = data || [];
        setUsers(userData);

        // Calculate comprehensive stats
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        // Calculate average age
        const usersWithAge = userData.filter(u => u.age && u.age > 0);
        const avgAge = usersWithAge.length > 0 
            ? Math.round(usersWithAge.reduce((sum, u) => sum + (u.age || 0), 0) / usersWithAge.length)
            : 0;

        // Country distribution
        const countryMap = new Map<string, number>();
        userData.forEach(u => {
            const country = u.country || 'Unknown';
            countryMap.set(country, (countryMap.get(country) || 0) + 1);
        });
        
        // Find top country
        let topCountry = 'N/A';
        let maxCount = 0;
        countryMap.forEach((count, country) => {
            if (count > maxCount) {
                maxCount = count;
                topCountry = country;
            }
        });

        // Degree pursuit breakdown
        const bsc = userData.filter(u => u.pursuit?.toLowerCase() === 'bsc' || u.pursuit?.toLowerCase() === 'bachelor').length;
        const msc = userData.filter(u => u.pursuit?.toLowerCase() === 'msc' || u.pursuit?.toLowerCase() === 'master').length;
        const phd = userData.filter(u => u.pursuit?.toLowerCase() === 'phd' || u.pursuit?.toLowerCase() === 'doctoral').length;
        const other = userData.filter(u => u.pursuit && !['bsc', 'msc', 'phd', 'bachelor', 'master', 'doctoral'].includes(u.pursuit.toLowerCase())).length;

        // New this week
        const newThisWeek = userData.filter(u => new Date(u.created_at) >= weekAgo).length;

        setUserStats({
            total: userData.length,
            students: userData.filter(u => u.role === 'student').length,
            creators: userData.filter(u => u.role === 'creator').length,
            newThisWeek,
            avgAge,
            countryCount: countryMap.size,
            topCountry,
            bsc,
            msc,
            phd,
            other
        });

        setLoading(false);
    }

    function filterUsers() {
        let filtered = [...users];
        
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(u => 
                u.full_name?.toLowerCase().includes(query) ||
                u.email?.toLowerCase().includes(query) ||
                u.school?.toLowerCase().includes(query) ||
                u.country?.toLowerCase().includes(query)
            );
        }
        
        if (roleFilter !== 'all') {
            filtered = filtered.filter(u => u.role === roleFilter);
        }
        
        setFilteredUsers(filtered);
    }

    const stats = [
        { label: 'Total Users', value: userStats.total, icon: UsersIcon, gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', iconColor: '#ffffff' },
        { label: 'Students', value: userStats.students, icon: GraduationCap, gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', iconColor: '#ffffff' },
        { label: 'Creators', value: userStats.creators, icon: Shield, gradient: 'linear-gradient(135deg, #ff6600 0%, #ff4500 100%)', iconColor: '#ffffff' },
        { label: 'New This Week', value: userStats.newThisWeek, icon: Clock, gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', iconColor: '#ffffff' },
    ];

    // Additional stats cards
    const detailedStats = [
        { label: 'Average Age', value: userStats.avgAge ? `${userStats.avgAge} years` : 'N/A', icon: Award, color: '#0071e3' },
        { label: 'Countries', value: userStats.countryCount, icon: Globe, color: '#34c759' },
        { label: 'Top Country', value: userStats.topCountry, icon: MapPin, color: '#ff6600' },
    ];

    // Degree pursuit breakdown
    const pursuitData = [
        { label: 'BSc/Bachelor', value: userStats.bsc, color: '#0071e3' },
        { label: 'MSc/Master', value: userStats.msc, color: '#34c759' },
        { label: 'PhD/Doctoral', value: userStats.phd, color: '#af52de' },
        { label: 'Other', value: userStats.other, color: '#ff6600' },
    ];

    const roles = [
        { value: 'all', label: 'All Roles' },
        { value: 'student', label: 'Students' },
        { value: 'creator', label: 'Creators' },
        { value: 'admin', label: 'Admins' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">User Management</h1>
                    <p style={{ color: 'var(--text-tertiary)', margin: '4px 0 0 0', fontSize: '15px' }}>
                        Manage and oversee all platform users
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-secondary">
                        <Download size={18} />
                        Export
                    </button>
                    <button className="btn btn-primary">
                        <UserPlus size={18} />
                        Add User
                    </button>
                </div>
            </div>

            {/* Main Stats */}
            <div className="grid grid-cols-4">
                {stats.map((stat, index) => (
                    <div key={index} className="card card-hover" style={{ padding: '24px', position: 'relative', overflow: 'hidden', background: stat.gradient, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
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
                        <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '14px' }}>{stat.label}</div>
                        
                        {/* Icon - Top Right Corner */}
                        <div style={{ position: 'absolute', top: '20px', right: '20px', opacity: 0.95 }}>
                            <stat.icon size={28} strokeWidth={1.5} style={{ color: stat.iconColor }} />
                        </div>
                    </div>
                ))}
            </div>

            {/* Detailed Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
                {/* Country & Age Stats - Vertical Stack */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {detailedStats.map((stat, index) => (
                        <div key={index} className="card card-hover" style={{ padding: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: 36, height: 36, borderRadius: '8px', background: `${stat.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: stat.color }}>
                                    <stat.icon size={18} strokeWidth={1.5} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginBottom: '2px' }}>{stat.label}</div>
                                    <div style={{ fontSize: '20px', fontWeight: 600 }}>{stat.value}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Degree Pursuit Breakdown */}
                <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                        <BarChart3 size={20} color="var(--apple-blue)" />
                        <span style={{ fontWeight: 600 }}>Degree Pursuit</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {pursuitData.map((item, idx) => (
                            <div key={idx}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{item.label}</span>
                                    <span style={{ fontSize: '14px', fontWeight: 600, color: item.color }}>{item.value}</span>
                                </div>
                                <div style={{ height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div 
                                        style={{ 
                                            height: '100%', 
                                            width: userStats.total > 0 ? `${(item.value / userStats.total) * 100}%` : '0%',
                                            background: item.color,
                                            borderRadius: '3px',
                                            transition: 'width 0.3s ease'
                                        }} 
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                        <input 
                            type="text"
                            className="input-field"
                            placeholder="Search users by name, email, school, or country..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: '40px' }}
                        />
                    </div>
                    <select className="input-field" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={{ width: '150px' }}>
                        {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Filter size={18} />
                        Filter
                    </button>
                </div>
            </div>

            {/* Users Table */}
            <div className="card" style={{ overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                        Loading users...
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center' }}>
                        <UsersIcon size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                        <p style={{ color: 'var(--text-tertiary)' }}>No users found</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}>
                                        <input type="checkbox" style={{ cursor: 'pointer' }} />
                                    </th>
                                    <th>User</th>
                                    <th>Role</th>
                                    <th>Country</th>
                                    <th>Pursuit</th>
                                    <th>School/Major</th>
                                    <th>Location</th>
                                    <th>Joined</th>
                                    <th style={{ textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map((user) => (
                                    <tr key={user.user_id}>
                                        <td>
                                            <input 
                                                type="checkbox" 
                                                checked={selectedUsers.has(user.user_id)}
                                                onChange={() => {
                                                    const newSet = new Set(selectedUsers);
                                                    if (newSet.has(user.user_id)) newSet.delete(user.user_id);
                                                    else newSet.add(user.user_id);
                                                    setSelectedUsers(newSet);
                                                }}
                                                style={{ cursor: 'pointer' }}
                                            />
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                {user.avatar_url ? (
                                                    <img src={user.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                                                ) : (
                                                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--apple-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600 }}>
                                                        {user.full_name?.charAt(0) || 'U'}
                                                    </div>
                                                )}
                                                <div>
                                                    <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{user.full_name || 'Anonymous User'}</div>
                                                    <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Mail size={12} /> {user.email || 'No email'}
                                                    </div>
                                                    {user.age && (
                                                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{user.age} years old</div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`badge ${user.role === 'admin' ? 'badge-primary' : user.role === 'creator' ? 'badge-warning' : 'badge-success'}`}>
                                                {user.role || 'User'}
                                            </span>
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
                                            {user.pursuit ? (
                                                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                                    {user.pursuit}
                                                </span>
                                            ) : (
                                                <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>Not set</span>
                                            )}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <GraduationCap size={14} style={{ color: 'var(--text-tertiary)' }} />
                                                <span style={{ color: 'var(--text-secondary)' }}>{user.school || user.major || 'Not specified'}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <MapPin size={14} style={{ color: 'var(--text-tertiary)' }} />
                                                <span style={{ color: 'var(--text-secondary)' }}>{user.location || 'Unknown'}</span>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-tertiary)', fontSize: '14px' }}>
                                                <Calendar size={14} />
                                                {new Date(user.created_at).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button className="btn btn-secondary" style={{ padding: '6px 10px' }}>
                                                    <Shield size={16} />
                                                </button>
                                                <button className="btn btn-secondary" style={{ padding: '6px 10px' }}>
                                                    <MoreVertical size={16} />
                                                </button>
                                            </div>
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

export default Users;
