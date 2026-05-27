import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User, Mail, Shield, Calendar, Edit2, Save, X } from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  role: string;
  created_at: string;
}

const Profile = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ full_name: '', avatar_url: '' });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileData) {
        setProfile({
          id: profileData.id,
          email: user.email || '',
          full_name: profileData.full_name || user.user_metadata?.full_name || 'Admin',
          avatar_url: profileData.avatar_url || user.user_metadata?.avatar_url || '',
          role: profileData.role || 'admin',
          created_at: profileData.created_at
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('admin_users')
        .update({
          full_name: editData.full_name,
          avatar_url: editData.avatar_url,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;

      setProfile(prev => prev ? { ...prev, ...editData } : null);
      setEditing(false);
    } catch (error: any) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid var(--border-light)', borderTopColor: 'var(--apple-blue)', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
            <p style={{ color: 'var(--text-tertiary)' }}>Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <h1 className="page-title">My Profile</h1>
        <p style={{ color: 'var(--text-tertiary)', marginTop: '4px' }}>Manage your account settings and preferences</p>
      </div>

      <div style={{ maxWidth: '800px' }}>
        {/* Profile Card */}
        <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              {profile?.avatar_url ? (
                <img 
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '4px solid var(--border-light)'
                  }}
                />
              ) : (
                <div 
                  style={{ 
                    width: 100, 
                    height: 100, 
                    borderRadius: '50%', 
                    background: 'var(--apple-blue)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontWeight: 700,
                    fontSize: '36px',
                    color: 'white',
                    flexShrink: 0
                  }}
                >
                  {profile?.full_name?.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {profile?.full_name}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-tertiary)', fontSize: '14px' }}>
                  <Shield size={14} />
                  <span style={{ textTransform: 'capitalize' }}>{profile?.role}</span>
                </div>
              </div>
            </div>

            {!editing ? (
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  setEditData({ 
                    full_name: profile?.full_name || '', 
                    avatar_url: profile?.avatar_url || '' 
                  });
                  setEditing(true);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Edit2 size={16} />
                Edit Profile
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-primary"
                  onClick={handleSave}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <Save size={16} />
                  Save
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={() => setEditing(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <X size={16} />
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Profile Fields */}
          <div style={{ display: 'grid', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Full Name
              </label>
              {editing ? (
                <input
                  type="text"
                  className="input-field"
                  value={editData.full_name}
                  onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                  style={{ width: '100%' }}
                />
              ) : (
                <div style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: '10px', color: 'var(--text-primary)' }}>
                  {profile?.full_name}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Email Address
              </label>
              <div style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: '10px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Mail size={16} style={{ color: 'var(--text-tertiary)' }} />
                {profile?.email}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Avatar URL
              </label>
              {editing ? (
                <input
                  type="url"
                  className="input-field"
                  value={editData.avatar_url}
                  onChange={(e) => setEditData({ ...editData, avatar_url: e.target.value })}
                  placeholder="https://example.com/avatar.jpg"
                  style={{ width: '100%' }}
                />
              ) : (
                <div style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: '10px', color: profile?.avatar_url ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                  {profile?.avatar_url || 'No avatar set'}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Member Since
              </label>
              <div style={{ padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: '10px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Calendar size={16} style={{ color: 'var(--text-tertiary)' }} />
                {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                }) : 'N/A'}
              </div>
            </div>
          </div>
        </div>

        {/* Account Stats */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px' }}>
            Account Information
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>User ID</div>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {profile?.id?.substring(0, 8)}...
              </div>
            </div>
            <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>Role</div>
              <div style={{ fontSize: '14px', color: 'var(--text-primary)', textTransform: 'capitalize', fontWeight: 600 }}>
                {profile?.role}
              </div>
            </div>
            <div style={{ padding: '16px', background: 'var(--bg-tertiary)', borderRadius: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>Account Status</div>
              <div style={{ fontSize: '14px', color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }}></div>
                Active
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Profile;
