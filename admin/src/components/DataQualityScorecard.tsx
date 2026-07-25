import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { backendFetchJson } from '../lib/backend';

interface Quality {
    total: number;
    active: number;
    active_missing_deadline: number;
    active_imageless: number;
    duplicates: number;
    active_stale_14d: number;
    active_unknown_confidence: number;
    pending_review: number;
    active_listing_urls: number;
    html_titles: number;
    active_thin_description: number;
    active_verified_7d: number;
    newest_verification_at: string | null;
}

type Tone = 'good' | 'warn' | 'bad';

/**
 * Catalog data-quality scorecard. Surfaces the health numbers an operator would
 * otherwise only learn from a manual DB audit: missing-deadline %, imageless %,
 * stale %, unconfirmed-deadline %, duplicates, listing-URL / HTML-title junk,
 * and verification freshness. Self-fetching so it drops into the Engine page
 * without threading state through the monolith.
 */
export default function DataQualityScorecard() {
    const [data, setData] = useState<Quality | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await backendFetchJson<Quality>('/opportunities/admin/quality'));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load quality metrics');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
    const active = data?.active ?? 0;

    // Rate thresholds → tone. Lower is better for every metric here.
    const rateTone = (rate: number, warnAt: number, badAt: number): Tone =>
        rate >= badAt ? 'bad' : rate >= warnAt ? 'warn' : 'good';
    const countTone = (n: number): Tone => (n > 0 ? 'warn' : 'good');

    const toneColor = (t: Tone) =>
        t === 'bad' ? 'var(--danger, #dc2626)' : t === 'warn' ? 'var(--warning, #d97706)' : 'var(--success, #16a34a)';

    const metrics: Array<{ label: string; value: string; sub: string; tone: Tone }> = data
        ? [
              {
                  label: 'Missing deadline',
                  value: `${pct(data.active_missing_deadline, active)}%`,
                  sub: `${data.active_missing_deadline} of ${active} active`,
                  tone: rateTone(pct(data.active_missing_deadline, active), 25, 50),
              },
              {
                  label: 'Unconfirmed deadline',
                  value: `${pct(data.active_unknown_confidence, active)}%`,
                  sub: `${data.active_unknown_confidence} active unknown`,
                  tone: rateTone(pct(data.active_unknown_confidence, active), 30, 60),
              },
              {
                  label: 'Imageless',
                  value: `${pct(data.active_imageless, active)}%`,
                  sub: `${data.active_imageless} of ${active} active`,
                  tone: rateTone(pct(data.active_imageless, active), 10, 30),
              },
              {
                  label: 'Stale (14d+)',
                  value: `${pct(data.active_stale_14d, active)}%`,
                  sub: `${data.active_stale_14d} not seen in 14d`,
                  tone: rateTone(pct(data.active_stale_14d, active), 25, 50),
              },
              {
                  label: 'Thin description',
                  value: `${pct(data.active_thin_description, active)}%`,
                  sub: `${data.active_thin_description} under 200 chars`,
                  tone: rateTone(pct(data.active_thin_description, active), 20, 40),
              },
              {
                  label: 'Verified (7d)',
                  value: `${pct(data.active_verified_7d, active)}%`,
                  sub: `${data.active_verified_7d} of ${active} active`,
                  // Higher is better here — invert the tone.
                  tone: pct(data.active_verified_7d, active) >= 80 ? 'good' : pct(data.active_verified_7d, active) >= 50 ? 'warn' : 'bad',
              },
              {
                  label: 'Duplicates',
                  value: `${data.duplicates}`,
                  sub: 'flagged duplicate_of',
                  tone: countTone(data.duplicates),
              },
              {
                  label: 'Pending review',
                  value: `${data.pending_review}`,
                  sub: 'held out of the feed',
                  tone: countTone(data.pending_review),
              },
              {
                  label: 'Listing-URL rows',
                  value: `${data.active_listing_urls}`,
                  sub: 'active /category|/tag',
                  tone: countTone(data.active_listing_urls),
              },
              {
                  label: 'HTML titles',
                  value: `${data.html_titles}`,
                  sub: 'broken markup titles',
                  tone: countTone(data.html_titles),
              },
          ]
        : [];

    return (
        <div style={{ borderRadius: 16, border: '1px solid var(--border-light)', background: 'var(--bg-secondary)', padding: 20, marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShieldCheck size={18} style={{ color: 'var(--primary)' }} />
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Data quality</h3>
                    {data?.newest_verification_at && (
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                            · last verify {new Date(data.newest_verification_at).toLocaleString()}
                        </span>
                    )}
                </div>
                <button
                    onClick={() => void load()}
                    disabled={loading}
                    title="Refresh"
                    style={{ background: 'transparent', border: '1px solid var(--border-light)', borderRadius: 8, padding: '6px 10px', cursor: loading ? 'default' : 'pointer', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} /> Refresh
                </button>
            </div>

            {error ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--danger, #dc2626)', fontSize: 14 }}>
                    <AlertTriangle size={16} /> {error}
                </div>
            ) : loading && !data ? (
                <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>Loading quality metrics…</div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                    {metrics.map((m) => (
                        <div key={m.label} style={{ padding: 14, borderRadius: 12, border: `1px solid ${toneColor(m.tone)}33`, background: `color-mix(in srgb, ${toneColor(m.tone)} 6%, transparent)` }}>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>{m.label}</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: toneColor(m.tone), lineHeight: 1.1 }}>{m.value}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{m.sub}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
