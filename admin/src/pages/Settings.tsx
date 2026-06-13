import { useCallback, useEffect, useState } from 'react';
import { 
    Globe, 
    Mail, 
    Shield, 
    Save,
    Check,
    AlertTriangle,
    Webhook,
    Users,
    FileText,
    Download,
    Trash2
} from 'lucide-react';
import { backendFetchJson } from '../lib/backend';

interface AdminSettings {
    platform: {
        siteName: string;
        supportEmail: string;
        maintenanceMode: boolean;
        allowRegistrations: boolean;
        requireApproval: boolean;
    };
    content: {
        autoModerate: boolean;
        requireCreatorApproval: boolean;
        maxUploadSize: number;
        allowedFileTypes: string[];
    };
    notifications: {
        adminEmail: string;
        notifyNewUsers: boolean;
        notifyNewOpportunities: boolean;
        notifyReports: boolean;
        dailyDigest: boolean;
    };
    security: {
        maxLoginAttempts: number;
        passwordMinLength: number;
        requireStrongPassword: boolean;
        sessionDuration: number;
    };
    api: {
        apiKey: string;
        webhookUrl: string;
        rateLimitPerMinute: number;
    };
}

interface AdminSettingsResponse {
    success: boolean;
    source: 'database' | 'fallback';
    settings: AdminSettings;
    error?: string;
}

const defaultSettings: AdminSettings = {
    platform: {
        siteName: 'Edutu',
        supportEmail: 'support@edutu.org',
        maintenanceMode: false,
        allowRegistrations: true,
        requireApproval: false,
    },
    content: {
        autoModerate: true,
        requireCreatorApproval: true,
        maxUploadSize: 10,
        allowedFileTypes: ['jpg', 'jpeg', 'png', 'pdf'],
    },
    notifications: {
        adminEmail: 'admin@edutu.org',
        notifyNewUsers: true,
        notifyNewOpportunities: false,
        notifyReports: true,
        dailyDigest: true,
    },
    security: {
        maxLoginAttempts: 5,
        passwordMinLength: 8,
        requireStrongPassword: true,
        sessionDuration: 24,
    },
    api: {
        apiKey: 'Managed on the server',
        webhookUrl: import.meta.env.VITE_WEBHOOK_URL || 'https://api.edutu.org/webhooks',
        rateLimitPerMinute: 100,
    },
};

function mergeSettings(value: Partial<AdminSettings> | null | undefined): AdminSettings {
    return {
        ...defaultSettings,
        ...value,
        platform: {
            ...defaultSettings.platform,
            ...(value?.platform ?? {}),
        },
        content: {
            ...defaultSettings.content,
            ...(value?.content ?? {}),
        },
        notifications: {
            ...defaultSettings.notifications,
            ...(value?.notifications ?? {}),
        },
        security: {
            ...defaultSettings.security,
            ...(value?.security ?? {}),
        },
        api: {
            ...defaultSettings.api,
            ...(value?.api ?? {}),
        },
    };
}

const Settings = () => {
    const [activeSection, setActiveSection] = useState<'platform' | 'content' | 'notifications' | 'security' | 'api'>('platform');
    const [savedMessage, setSavedMessage] = useState('');
    const [hasChanges, setHasChanges] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    const [settings, setSettings] = useState<AdminSettings>(defaultSettings);

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await backendFetchJson<AdminSettingsResponse>('/admin/settings');
            setSettings(mergeSettings(data.settings));
            setHasChanges(false);
            if (!data.success || data.source === 'fallback') {
                setError(data.error || 'Settings loaded from fallback defaults because the database is unavailable');
            }
        } catch (err) {
            console.error('Failed to load admin settings:', err);
            setSettings(defaultSettings);
            setError(err instanceof Error ? err.message : 'Unable to load server settings');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchSettings();
    }, [fetchSettings]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);

        try {
            const saved = await backendFetchJson<AdminSettingsResponse>('/admin/settings', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(settings),
            });

            setSettings(mergeSettings(saved.settings));
            if (saved.success && saved.source === 'database') {
                setSavedMessage('Settings saved successfully');
                setHasChanges(false);
                setTimeout(() => setSavedMessage(''), 3000);
            } else {
                setError(saved.error || 'Settings could not be persisted because the database is unavailable');
            }
        } catch (err) {
            console.error('Failed to save admin settings:', err);
            setError(err instanceof Error ? err.message : 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleResetAllSettings = () => {
        if (!window.confirm('Reset all settings to their default values? You will still need to save to persist the reset.')) {
            return;
        }

        setSettings(defaultSettings);
        setHasChanges(true);
        setError(null);
        setSavedMessage('Settings reset to defaults. Save Changes to apply.');
        setTimeout(() => setSavedMessage(''), 3000);
    };

    const handleExportConfiguration = () => {
        const payload = {
            exportedAt: new Date().toISOString(),
            settings,
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `edutu-admin-settings-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setSavedMessage('Configuration exported');
        setTimeout(() => setSavedMessage(''), 3000);
    };

    const updateSetting = <S extends keyof AdminSettings>(
        section: S,
        key: string,
        value: unknown,
    ) => {
        setSettings((prev) => ({
            ...prev,
            [section]: {
                ...(prev[section] as Record<string, unknown>),
                [key]: value,
            } as AdminSettings[S],
        }));
        setHasChanges(true);
    };

    const menuItems = [
        { id: 'platform', label: 'Platform', icon: Globe, description: 'Site configuration & access' },
        { id: 'content', label: 'Content', icon: FileText, description: 'Moderation & uploads' },
        { id: 'notifications', label: 'Notifications', icon: Mail, description: 'Admin alerts & emails' },
        { id: 'security', label: 'Security', icon: Shield, description: 'Login & password policy' },
        { id: 'api', label: 'API & Integrations', icon: Webhook, description: 'Keys & webhooks' },
    ] as const;

    const renderPlatformSection = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '19px', fontWeight: 600 }}>Platform Configuration</h3>
                
                <div style={{ display: 'grid', gap: '20px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Site Name</label>
                        <input 
                            type="text" 
                            className="input-field"
                            value={settings.platform.siteName}
                            onChange={(e) => updateSetting('platform', 'siteName', e.target.value)}
                        />
                    </div>
                    
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Support Email</label>
                        <input 
                            type="email" 
                            className="input-field"
                            value={settings.platform.supportEmail}
                            onChange={(e) => updateSetting('platform', 'supportEmail', e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '19px', fontWeight: 600 }}>Access Control</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {[
                        { 
                            key: 'allowRegistrations', 
                            label: 'Allow New Registrations', 
                            description: 'Enable or disable new user signups'
                        },
                        { 
                            key: 'requireApproval', 
                            label: 'Require Admin Approval', 
                            description: 'New users must be approved before accessing the platform'
                        },
                    ].map((item) => (
                        <div 
                            key={item.key}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                padding: '16px',
                                background: 'var(--bg-tertiary)',
                                borderRadius: '8px'
                            }}
                        >
                            <div>
                                <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.label}</div>
                                <div style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>{item.description}</div>
                            </div>
                            <div 
                                className={`toggle ${settings.platform[item.key as keyof typeof settings.platform] ? 'active' : ''}`}
                                onClick={() => updateSetting('platform', item.key, !settings.platform[item.key as keyof typeof settings.platform])}
                            >
                                <div className="toggle-knob" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="card" style={{ 
                padding: '24px', 
                border: '1px solid var(--warning)', 
                background: settings.platform.maintenanceMode ? 'rgba(255, 102, 0, 0.1)' : 'var(--bg-secondary)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <AlertTriangle size={20} color="var(--warning)" />
                    <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 600 }}>Maintenance Mode</h3>
                </div>
                <p style={{ color: 'var(--text-tertiary)', margin: '0 0 16px 0', fontSize: '15px' }}>
                    When enabled, only admins can access the platform. All other users will see a maintenance page.
                </p>
                <div 
                    className={`toggle ${settings.platform.maintenanceMode ? 'active' : ''}`}
                    style={{ background: settings.platform.maintenanceMode ? 'var(--warning)' : undefined }}
                    onClick={() => updateSetting('platform', 'maintenanceMode', !settings.platform.maintenanceMode)}
                >
                    <div className="toggle-knob" />
                </div>
            </div>
        </div>
    );

    const renderContentSection = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '19px', fontWeight: 600 }}>Content Moderation</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {[
                        { 
                            key: 'autoModerate', 
                            label: 'Auto-Moderation', 
                            description: 'Automatically flag potentially inappropriate content'
                        },
                        { 
                            key: 'requireCreatorApproval', 
                            label: 'Require Creator Verification', 
                            description: 'Creator applications must be approved before posting'
                        },
                    ].map((item) => (
                        <div 
                            key={item.key}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                padding: '16px',
                                background: 'var(--bg-tertiary)',
                                borderRadius: '8px'
                            }}
                        >
                            <div>
                                <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.label}</div>
                                <div style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>{item.description}</div>
                            </div>
                            <div 
                                className={`toggle ${settings.content[item.key as keyof typeof settings.content] ? 'active' : ''}`}
                                onClick={() => updateSetting('content', item.key, !settings.content[item.key as keyof typeof settings.content])}
                            >
                                <div className="toggle-knob" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '19px', fontWeight: 600 }}>Upload Settings</h3>
                
                <div className="form-group">
                    <label className="form-label">Maximum Upload Size (MB)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <input 
                            type="range"
                            min="1"
                            max="50"
                            value={settings.content.maxUploadSize}
                            onChange={(e) => updateSetting('content', 'maxUploadSize', parseInt(e.target.value))}
                            style={{ flex: 1 }}
                        />
                        <span style={{ 
                            minWidth: '60px', 
                            textAlign: 'center',
                            padding: '8px 16px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '8px',
                            fontWeight: 500
                        }}>
                            {settings.content.maxUploadSize} MB
                        </span>
                    </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Allowed File Types</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx'].map((type) => (
                            <button
                                key={type}
                                onClick={() => {
                                    const current = settings.content.allowedFileTypes;
                                    const updated = current.includes(type)
                                        ? current.filter(t => t !== type)
                                        : [...current, type];
                                    updateSetting('content', 'allowedFileTypes', updated);
                                }}
                                className={`btn ${settings.content.allowedFileTypes.includes(type) ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ 
                                    padding: '6px 12px', 
                                    fontSize: '13px',
                                    textTransform: 'uppercase'
                                }}
                            >
                                {type}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );

    const renderNotificationsSection = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '19px', fontWeight: 600 }}>Admin Alert Settings</h3>
                
                <div className="form-group">
                    <label className="form-label">Admin Notification Email</label>
                    <input 
                        type="email" 
                        className="input-field"
                        value={settings.notifications.adminEmail}
                        onChange={(e) => updateSetting('notifications', 'adminEmail', e.target.value)}
                        placeholder="admin@edutu.org"
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
                    {[
                        { key: 'notifyNewUsers', label: 'New User Registrations', icon: Users },
                        { key: 'notifyNewOpportunities', label: 'New Opportunities Posted', icon: FileText },
                        { key: 'notifyReports', label: 'Content Reports', icon: AlertTriangle },
                        { key: 'dailyDigest', label: 'Daily Activity Digest', icon: Mail },
                    ].map((item) => (
                        <div 
                            key={item.key}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                padding: '12px 16px',
                                background: 'var(--bg-tertiary)',
                                borderRadius: '8px'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <item.icon size={18} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)' }} />
                                <span style={{ fontWeight: 500 }}>{item.label}</span>
                            </div>
                            <div 
                                className={`toggle ${settings.notifications[item.key as keyof typeof settings.notifications] ? 'active' : ''}`}
                                onClick={() => updateSetting('notifications', item.key, !settings.notifications[item.key as keyof typeof settings.notifications])}
                            >
                                <div className="toggle-knob" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderSecuritySection = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '19px', fontWeight: 600 }}>Authentication Policy</h3>
                
                <div className="form-group">
                    <label className="form-label">Max Login Attempts</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <input 
                            type="range"
                            min="3"
                            max="10"
                            value={settings.security.maxLoginAttempts}
                            onChange={(e) => updateSetting('security', 'maxLoginAttempts', parseInt(e.target.value))}
                            style={{ flex: 1 }}
                        />
                        <span style={{ 
                            minWidth: '60px', 
                            textAlign: 'center',
                            padding: '8px 16px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '8px',
                            fontWeight: 500
                        }}>
                            {settings.security.maxLoginAttempts}
                        </span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                        Account will be temporarily locked after this many failed attempts
                    </p>
                </div>

                <div className="form-group">
                    <label className="form-label">Session Duration (hours)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <input 
                            type="range"
                            min="1"
                            max="72"
                            value={settings.security.sessionDuration}
                            onChange={(e) => updateSetting('security', 'sessionDuration', parseInt(e.target.value))}
                            style={{ flex: 1 }}
                        />
                        <span style={{ 
                            minWidth: '60px', 
                            textAlign: 'center',
                            padding: '8px 16px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '8px',
                            fontWeight: 500
                        }}>
                            {settings.security.sessionDuration}h
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
                    {[
                        { 
                            key: 'requireStrongPassword', 
                            label: 'Require Strong Passwords',
                            description: 'Require uppercase, lowercase, number, and special character'
                        },
                    ].map((item) => (
                        <div 
                            key={item.key}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                padding: '16px',
                                background: 'var(--bg-tertiary)',
                                borderRadius: '8px'
                            }}
                        >
                            <div>
                                <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{item.label}</div>
                                <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{item.description}</div>
                            </div>
                            <div 
                                className={`toggle ${settings.security[item.key as keyof typeof settings.security] ? 'active' : ''}`}
                                onClick={() => updateSetting('security', item.key, !settings.security[item.key as keyof typeof settings.security])}
                            >
                                <div className="toggle-knob" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderApiSection = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '19px', fontWeight: 600 }}>API Configuration</h3>

                <div
                    style={{
                        padding: '16px',
                        borderRadius: '12px',
                        background: 'rgba(255, 102, 0, 0.08)',
                        border: '1px solid rgba(255, 102, 0, 0.18)',
                        marginBottom: '20px'
                    }}
                >
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                        Server-managed secrets
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: '14px', lineHeight: 1.6 }}>
                        API keys are kept in backend environment variables and are not editable from the browser.
                        Use the backend deploy or secret manager to rotate them safely.
                    </p>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Webhook URL</label>
                    <input 
                        type="url" 
                        className="input-field"
                        value={settings.api.webhookUrl}
                        onChange={(e) => updateSetting('api', 'webhookUrl', e.target.value)}
                        placeholder="https://your-domain.com/webhook"
                    />
                </div>
            </div>

            <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '19px', fontWeight: 600 }}>Rate Limiting</h3>
                
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Requests Per Minute</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <input 
                            type="range"
                            min="10"
                            max="1000"
                            step="10"
                            value={settings.api.rateLimitPerMinute}
                            onChange={(e) => updateSetting('api', 'rateLimitPerMinute', parseInt(e.target.value))}
                            style={{ flex: 1 }}
                        />
                        <span style={{ 
                            minWidth: '80px', 
                            textAlign: 'center',
                            padding: '8px 16px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '8px',
                            fontWeight: 500
                        }}>
                            {settings.api.rateLimitPerMinute}
                        </span>
                    </div>
                </div>
            </div>

            <div className="card" style={{ 
                padding: '24px', 
                border: '1px solid var(--danger)', 
                background: 'rgba(255, 59, 48, 0.05)'
            }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '19px', fontWeight: 600, color: 'var(--danger)' }}>
                    Danger Zone
                </h3>
                <p style={{ color: 'var(--text-tertiary)', margin: '0 0 16px 0', fontSize: '15px' }}>
                    These actions are irreversible. Proceed with caution.
                </p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button className="btn btn-danger" onClick={handleResetAllSettings}>
                        <Trash2 size={16} />
                        Reset All Settings
                    </button>
                    <button className="btn btn-secondary" onClick={handleExportConfiguration}>
                        <Download size={16} />
                        Export Configuration
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Page Header */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Platform Settings</h1>
                    <p style={{ color: 'var(--text-tertiary)', margin: '4px 0 0 0', fontSize: '15px' }}>
                        Manage your admin panel and platform configuration
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {loading && (
                        <div className="badge" style={{ background: 'rgba(255, 102, 0, 0.12)', color: '#ff6600' }}>
                            Syncing with server
                        </div>
                    )}
                    {savedMessage && (
                        <div className="badge badge-success" style={{ animation: 'fadeIn 0.3s ease' }}>
                            <Check size={14} style={{ marginRight: '6px' }} />
                            {savedMessage}
                        </div>
                    )}
                    {hasChanges && !savedMessage && (
                        <div className="badge badge-warning">
                            Unsaved changes
                        </div>
                    )}
                    <button 
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={!hasChanges || loading || saving}
                        style={{ opacity: hasChanges && !loading && !saving ? 1 : 0.5 }}
                    >
                        <Save size={18} />
                        {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="card" style={{
                    padding: '16px 20px',
                    border: '1px solid rgba(255, 59, 48, 0.24)',
                    background: 'rgba(255, 59, 48, 0.08)',
                }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                        Settings sync problem
                    </div>
                    <div style={{ color: 'var(--text-tertiary)', fontSize: '14px', lineHeight: 1.6 }}>
                        {error}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: '24px' }}>
                {/* Sidebar Menu */}
                <div style={{ width: '280px', flexShrink: 0 }}>
                    <div className="card" style={{ padding: '8px' }}>
                        {menuItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => setActiveSection(item.id)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: activeSection === item.id ? 'var(--apple-blue)' : 'transparent',
                                    color: activeSection === item.id ? 'white' : 'var(--text-primary)',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    marginBottom: '4px',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <item.icon size={20} strokeWidth={1.5} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 500, fontSize: '15px' }}>{item.label}</div>
                                    {activeSection === item.id && (
                                        <div style={{ fontSize: '12px', opacity: 0.8 }}>{item.description}</div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content Area */}
                <div style={{ flex: 1 }}>
                    {activeSection === 'platform' && renderPlatformSection()}
                    {activeSection === 'content' && renderContentSection()}
                    {activeSection === 'notifications' && renderNotificationsSection()}
                    {activeSection === 'security' && renderSecuritySection()}
                    {activeSection === 'api' && renderApiSection()}
                </div>
            </div>
        </div>
    );
};

export default Settings;
