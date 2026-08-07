import {
    ArrowLeft,
    Database,
    ExternalLink,
    Loader2,
    Save,
    Search,
    X,
    Zap,
} from 'lucide-react';
import type { ScrapeJob, ScrapedOpportunity } from '../../types/scraper';

interface ScrapeJobDetailsModalProps {
    job: ScrapeJob;
    opportunities: ScrapedOpportunity[];
    loading: boolean;
    saving: boolean;
    improving: boolean;
    onClose: () => void;
    onSaveAll: () => void;
    onImproveAll: () => void;
}

const getStatusColor = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
        completed: { bg: 'rgba(52, 199, 89, 0.1)', text: '#34c759' },
        running: { bg: 'rgba(0, 113, 227, 0.1)', text: '#0071e3' },
        failed: { bg: 'rgba(255, 59, 48, 0.1)', text: '#ff3b30' },
        partial: { bg: 'rgba(255, 102, 0, 0.1)', text: '#ff6600' },
    };
    return colors[status] || colors.running;
};

export default function ScrapeJobDetailsModal({
    job,
    opportunities,
    loading,
    saving,
    improving,
    onClose,
    onSaveAll,
    onImproveAll,
}: ScrapeJobDetailsModalProps) {
    const statusColor = getStatusColor(job.status);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px',
            animation: 'fadeIn 0.2s ease',
        }}>
            <div style={{
                background: 'var(--bg-primary)',
                width: '100%',
                maxWidth: '1000px',
                maxHeight: '90vh',
                borderRadius: '20px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                border: '1px solid var(--border-light)',
            }}>
                <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                            }}
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                                Job Details: {job.source_name || 'Manual Extraction'}
                            </h3>
                            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '4px 0 0 0' }}>
                                Scraped on {new Date(job.started_at).toLocaleString()}
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{
                            padding: '4px 12px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 600,
                            background: statusColor.bg,
                            color: statusColor.text,
                        }}>
                            {job.status}
                        </span>
                        <button
                            onClick={onClose}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
                    {loading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', gap: 16 }}>
                            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)' }} />
                            <p style={{ color: 'var(--text-secondary)' }}>Loading associated opportunities...</p>
                        </div>
                    ) : opportunities.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '64px 32px' }}>
                            <div style={{ display: 'inline-flex', padding: 16, background: 'var(--bg-tertiary)', borderRadius: '50%', marginBottom: 16 }}>
                                <Database size={32} style={{ color: 'var(--text-tertiary)' }} />
                            </div>
                            <h4 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px 0' }}>No metadata records found</h4>
                            <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: 0 }}>This job might have been run before the tracking system was updated, or it didn't find any opportunities.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                            {opportunities.map(opp => (
                                <div key={opp.id} style={{
                                    padding: '20px',
                                    borderRadius: '14px',
                                    border: '1px solid var(--border-light)',
                                    background: 'var(--bg-secondary)',
                                    position: 'relative',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                        <h4 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>{opp.title}</h4>
                                        {opp.image_url ? (
                                            <img src={opp.image_url} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} alt="" />
                                        ) : (
                                            <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <Search size={16} style={{ color: 'var(--text-tertiary)' }} />
                                            </div>
                                        )}
                                    </div>
                                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16, lineClamp: 3, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {opp.description || 'No description provided.'}
                                    </p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                                        <span style={{ fontSize: 11, padding: '2px 8px', background: 'var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-secondary)' }}>{opp.category}</span>
                                        {opp.amount && <span style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(52, 199, 89, 0.1)', borderRadius: 4, color: '#34c759' }}>${opp.amount.toLocaleString()}</span>}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: 12, marginTop: 'auto' }}>
                                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{opp.location}</span>
                                        <a href={opp.application_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            View <ExternalLink size={12} />
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{ padding: '20px 32px', background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                        {opportunities.length} opportunit{opportunities.length === 1 ? 'y' : 'ies'} in this run
                    </span>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button
                            onClick={onImproveAll}
                            disabled={improving || saving || opportunities.length === 0}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'rgba(122,61,255,0.1)', color: '#7a3dff', border: '1px solid rgba(122,61,255,0.3)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: (improving || opportunities.length === 0) ? 'not-allowed' : 'pointer', opacity: (improving || opportunities.length === 0) ? 0.6 : 1 }}
                        >
                            {improving ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                            {improving ? 'Improving…' : 'Improve with AI'}
                        </button>
                        <button
                            onClick={onSaveAll}
                            disabled={saving || improving || opportunities.length === 0}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: 'var(--apple-blue)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: (saving || opportunities.length === 0) ? 'not-allowed' : 'pointer', opacity: (saving || opportunities.length === 0) ? 0.6 : 1 }}
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {saving ? 'Saving…' : `Save all${opportunities.length ? ` (${opportunities.length})` : ''}`}
                        </button>
                        <button
                            onClick={onClose}
                            style={{ padding: '10px 20px', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-medium)', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
