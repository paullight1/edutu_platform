import React from 'react';
import {
    Loader2, CheckCircle2, AlertCircle, Globe, Search, Database, ArrowLeft, X,
} from 'lucide-react';
import type { ScrapeProgressItem, ScrapeResult, ScrapeSourceStatus } from '../types/scraper';
import { prettifySourceName, sourceStatusLabel } from '../utils/scrapeDisplay';

interface ScrapeProgressModalProps {
    open: boolean;
    modalError: string | null;
    /** 1 = connecting, 2 = scraping, 3 = processing, 4 = complete */
    currentStep: number;
    estimatedProgress: number;
    elapsedSeconds: number;
    formatElapsed: (seconds: number) => string;
    progress: ScrapeProgressItem[];
    maxPages: number;
    scrapeResult: ScrapeResult | null;
    liveFoundCount: number;
    onMinimize: () => void;
    onStop: () => void;
}

const BLUE = '#146ef5';
const BLUE_LIGHT = '#60a5fa';

const STEPS = [
    { step: 1, label: 'Connecting to sources', icon: Globe },
    { step: 2, label: 'Scraping data', icon: Search },
    { step: 3, label: 'Processing results', icon: Database },
    { step: 4, label: 'Complete', icon: CheckCircle2 },
] as const;

// ── Small presentational pieces ───────────────────────────────────────────

const StatCard: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
    <div style={{
        padding: '12px 10px',
        borderRadius: 12,
        background: 'rgba(20, 110, 245, 0.08)',
        border: '1px solid rgba(20, 110, 245, 0.18)',
        textAlign: 'center',
    }}>
        <div style={{
            fontSize: 18,
            fontWeight: 700,
            color: accent ? BLUE_LIGHT : 'var(--text-primary)',
            lineHeight: 1.1,
        }}>
            {value}
        </div>
        <div style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            marginTop: 5,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
        }}>
            {label}
        </div>
    </div>
);

const StatusDot: React.FC<{ status: ScrapeSourceStatus }> = ({ status }) => {
    switch (status) {
        case 'scraping': return <Loader2 size={12} className="animate-spin" color={BLUE} />;
        case 'completed': return <CheckCircle2 size={12} color="#34c759" />;
        case 'failed': return <AlertCircle size={12} color="#ff3b30" />;
        case 'pending':
        default: return <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--bg-tertiary)' }} />;
    }
};

const SourceRow: React.FC<{ item: ScrapeProgressItem }> = ({ item }) => {
    const failed = item.status === 'failed';
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 0',
            fontSize: 13,
            color: 'var(--text-secondary)',
        }}>
            <StatusDot status={item.status} />
            <span style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                opacity: item.status === 'pending' ? 0.6 : 1,
            }}>
                {prettifySourceName(item.source)}
            </span>
            <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: failed ? '#ff3b30' : item.status === 'completed' ? '#34c759' : 'var(--text-tertiary)',
                flexShrink: 0,
            }}>
                {sourceStatusLabel(item.status)}
            </span>
        </div>
    );
};

// ── Main modal ─────────────────────────────────────────────────────────────

const ScrapeProgressModal: React.FC<ScrapeProgressModalProps> = ({
    open,
    modalError,
    currentStep,
    estimatedProgress,
    elapsedSeconds,
    formatElapsed,
    progress,
    maxPages,
    scrapeResult,
    liveFoundCount,
    onMinimize,
    onStop,
}) => {
    if (!open) return null;

    const total = progress.length;
    const active = progress.filter(p => p.status === 'scraping').length;
    const completed = progress.filter(p => p.status === 'completed').length;
    const failed = progress.filter(p => p.status === 'failed').length;
    const processed = completed + failed;
    const isComplete = currentStep === 4;
    const liveOpps = scrapeResult?.opportunities ?? [];

    // One honest line describing where the scrape stands.
    const sourceSummary = active > 0
        ? `${active} scraping · ${processed}/${total} done`
        : total > 0
            ? `${processed}/${total} sources done`
            : 'Preparing sources…';

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease',
        }}>
            <div style={{
                background: 'var(--bg-primary)',
                borderRadius: 20,
                padding: '40px',
                width: '90%',
                maxWidth: 600,
                maxHeight: '90vh',
                overflowY: 'auto',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                animation: 'slideUp 0.3s ease',
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: modalError ? 16 : 32 }}>
                    <div style={{
                        width: 64,
                        height: 64,
                        borderRadius: 16,
                        background: modalError
                            ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                            : `linear-gradient(135deg, ${BLUE} 0%, ${BLUE_LIGHT} 100%)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                        animation: currentStep < 4 && !modalError ? 'pulse 2s ease-in-out infinite' : 'none',
                    }}>
                        {modalError ? (
                            <AlertCircle size={32} color="white" />
                        ) : isComplete ? (
                            <CheckCircle2 size={32} color="white" />
                        ) : (
                            <Loader2 size={32} color="white" className="animate-spin" />
                        )}
                    </div>
                    <h2 style={{
                        fontSize: 24,
                        fontWeight: 600,
                        color: modalError ? '#ff3b30' : 'var(--text-primary)',
                        margin: 0,
                    }}>
                        {modalError ? 'Scraping Failed' : isComplete ? 'Scraping Complete!' : 'Scraping in Progress…'}
                    </h2>
                    <p style={{ color: 'var(--text-tertiary)', marginTop: 8, fontSize: 14 }}>
                        {modalError
                            ? 'An error occurred — see details below.'
                            : isComplete
                                ? `Found ${scrapeResult?.totalResults ?? liveFoundCount} opportunities from ${scrapeResult?.sourcesScraped ?? total} sources`
                                : 'Please wait while we gather scholarship opportunities'}
                    </p>
                </div>

                {/* Stat cards */}
                {!modalError && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 10,
                        marginBottom: 24,
                    }}>
                        <StatCard label="Progress" value={`${estimatedProgress}%`} accent />
                        <StatCard label="Elapsed" value={formatElapsed(elapsedSeconds)} />
                        <StatCard label="Sources" value={total ? `${processed}/${total}` : '0/0'} />
                        <StatCard label={failed > 0 ? 'Failed' : 'Pages'} value={failed > 0 ? String(failed) : `${maxPages} max`} />
                    </div>
                )}

                {/* Error panel */}
                {modalError && (
                    <div style={{
                        padding: '14px 16px',
                        borderRadius: 12,
                        background: 'rgba(255, 59, 48, 0.08)',
                        border: '1px solid rgba(255, 59, 48, 0.3)',
                        marginBottom: 24,
                        fontSize: 13,
                        color: '#ff3b30',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        lineHeight: 1.6,
                    }}>
                        <strong>Error:</strong> {modalError}
                    </div>
                )}

                {/* Steps */}
                {!modalError && (
                    <div style={{ marginBottom: 32 }}>
                        {STEPS.map(({ step, label, icon: Icon }) => {
                            const isActive = currentStep === step;
                            const isStepDone = currentStep > step;
                            const isPending = currentStep < step;

                            return (
                                <div
                                    key={step}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 16,
                                        padding: '16px',
                                        borderRadius: 12,
                                        marginBottom: 8,
                                        background: isActive ? 'rgba(20, 110, 245, 0.1)' : 'transparent',
                                        border: `1px solid ${isActive ? 'rgba(20, 110, 245, 0.3)' : 'transparent'}`,
                                        transition: 'all 0.3s ease',
                                        opacity: isPending ? 0.5 : 1,
                                    }}
                                >
                                    <div style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: 10,
                                        flexShrink: 0,
                                        background: isStepDone ? '#34c759' : isActive ? BLUE : 'var(--bg-tertiary)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                    }}>
                                        {isStepDone ? <CheckCircle2 size={20} /> : <Icon size={20} />}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            fontWeight: 500,
                                            color: isActive ? BLUE : 'var(--text-primary)',
                                            fontSize: 15,
                                            minHeight: 40,
                                        }}>
                                            <span style={{ flex: 1 }}>{label}</span>
                                            {isActive && step < 4 && (
                                                <Loader2 size={18} color={BLUE} className="animate-spin" />
                                            )}
                                        </div>

                                        {/* Live per-source list under the active "Scraping data" step */}
                                        {isActive && step === 2 && total > 0 && (
                                            <div style={{ marginTop: 8 }}>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    marginBottom: 8,
                                                    fontSize: 12,
                                                    color: 'var(--text-tertiary)',
                                                }}>
                                                    <span>{sourceSummary}</span>
                                                    <span>{estimatedProgress}% • {formatElapsed(elapsedSeconds)}</span>
                                                </div>
                                                <div style={{
                                                    maxHeight: 168,
                                                    overflowY: 'auto',
                                                    paddingRight: 4,
                                                }}>
                                                    {progress.map((item, idx) => (
                                                        <SourceRow key={`${item.source}-${idx}`} item={item} />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Progress bar */}
                {!modalError && (
                    <div style={{
                        height: 4,
                        background: 'var(--bg-tertiary)',
                        borderRadius: 2,
                        overflow: 'hidden',
                        marginBottom: 24,
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${estimatedProgress}%`,
                            background: `linear-gradient(90deg, ${BLUE} 0%, ${BLUE_LIGHT} 100%)`,
                            borderRadius: 2,
                            transition: 'width 0.5s ease',
                        }} />
                    </div>
                )}

                {/* Live opportunity count + streaming cards */}
                {!modalError && (
                    <div style={{ marginBottom: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                {isComplete ? 'Opportunities found' : 'Opportunities incoming'}
                            </span>
                            <span style={{ fontSize: 15, fontWeight: 700, color: BLUE, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {isComplete
                                    ? liveFoundCount
                                    : <><Loader2 size={13} className="animate-spin" /> scanning…</>}
                            </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {liveOpps.slice(0, 4).map((opp, i) => (
                                <div key={`opp-${i}`} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', animation: 'fadeIn 0.3s ease' }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.title}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {opp.organization || prettifySourceName(opp.source)}
                                    </div>
                                </div>
                            ))}
                            {!isComplete && Array.from({ length: Math.max(0, 4 - Math.min(4, liveOpps.length)) }).map((_, i) => (
                                <div key={`sk-${i}`} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
                                    <div style={{ height: 10, width: '80%', borderRadius: 4, background: 'var(--bg-tertiary)', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.15}s` }} />
                                    <div style={{ height: 8, width: '55%', borderRadius: 4, background: 'var(--bg-tertiary)', marginTop: 8, animation: 'pulse 1.5s ease-in-out infinite', animationDelay: `${i * 0.15 + 0.2}s` }} />
                                </div>
                            ))}
                        </div>
                        {isComplete && liveFoundCount > 4 && (
                            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
                                + {liveFoundCount - 4} more — click the run in Recent Scrapes to view all
                            </div>
                        )}
                    </div>
                )}

                {/* Footer actions */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
                    {modalError || isComplete ? (
                        <button
                            onClick={onStop}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '10px 28px', background: 'var(--apple-blue)',
                                border: '1px solid transparent', borderRadius: 10,
                                color: 'white', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                                transition: 'opacity 0.2s ease',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                        >
                            <CheckCircle2 size={16} /> Dismiss
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={onMinimize}
                                title="Keep the scrape running and close this window"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '10px 24px', background: 'var(--apple-blue)',
                                    border: '1px solid transparent', borderRadius: 10,
                                    color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                    transition: 'opacity 0.2s ease',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                            >
                                <ArrowLeft size={16} /> Run in background
                            </button>
                            <button
                                onClick={onStop}
                                title="Abort this scrape"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '10px 24px', background: 'rgba(255, 59, 48, 0.1)',
                                    border: '1px solid rgba(255, 59, 48, 0.3)', borderRadius: 10,
                                    color: '#ff3b30', fontSize: 14, fontWeight: 500, cursor: 'pointer',
                                    transition: 'opacity 0.2s ease',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                            >
                                <X size={16} /> Cancel
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ScrapeProgressModal;
