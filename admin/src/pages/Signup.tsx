import type { FC } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldAlert, Mail } from 'lucide-react';

const Signup: FC = () => {
    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--bg-secondary)',
            padding: '20px'
        }}>
            <div style={{ width: '100%', maxWidth: 460 }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <img
                        src="/logo.png"
                        alt="Edutu"
                        style={{
                            height: 64,
                            marginBottom: 16,
                            borderRadius: '16px'
                        }}
                    />
                    <h1 style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        marginBottom: '8px'
                    }}>
                        Invite-Only Access
                    </h1>
                    <p style={{ color: 'var(--text-tertiary)', fontSize: '15px' }}>
                        Admin accounts are provisioned by the platform team. Public self-signup is disabled.
                    </p>
                </div>

                <div style={{
                    background: 'var(--bg-secondary)',
                    borderRadius: '16px',
                    border: '1px solid var(--border-light)',
                    padding: '32px',
                    display: 'grid',
                    gap: '20px'
                }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        padding: '16px',
                        borderRadius: '12px',
                        background: 'rgba(255, 102, 0, 0.08)',
                        border: '1px solid rgba(255, 102, 0, 0.18)'
                    }}>
                        <div style={{
                            width: 44,
                            height: 44,
                            borderRadius: '50%',
                            background: 'rgba(255, 102, 0, 0.14)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <ShieldAlert size={22} color="var(--warning)" />
                        </div>
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                Why this is locked
                            </div>
                            <div style={{ fontSize: '14px', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                                Admin access is sensitive. Accounts must be created by an existing super admin so we can enforce review and audit trails.
                            </div>
                        </div>
                    </div>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '16px',
                        borderRadius: '12px',
                        background: 'var(--bg-tertiary)'
                    }}>
                        <Mail size={18} color="var(--apple-blue)" />
                        <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            Need access? Ask the platform owner or an existing admin to invite you, then sign in from the login page.
                        </div>
                    </div>

                    <Link to="/login" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '14px',
                        borderRadius: '10px',
                        border: 'none',
                        background: 'var(--apple-blue)',
                        color: 'white',
                        fontSize: '15px',
                        fontWeight: 500,
                        textDecoration: 'none'
                    }}>
                        <ArrowLeft size={16} />
                        Back to Login
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default Signup;
