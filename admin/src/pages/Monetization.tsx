import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  Bot,
  CheckCircle2,
  Coins,
  CreditCard,
  Crown,
  Download,
  Gauge,
  Gift,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
  Zap,
  Mic,
  Volume2,
} from 'lucide-react';
import {
  monetizationApi,
  mergePricing,
  type AdminSettings,
  type BillingOverview,
  type BillingTransaction,
  type CreditPack,
  type PricingSettings,
  type VoiceUsageSummary,
} from '../lib/monetizationApi';

const PAGE_SIZE = 20;
const MAX_CREDIT_PACKS = 8;

const AI_COST_LABELS: Array<{ key: keyof PricingSettings['aiCosts']; label: string }> = [
  { key: 'chatMessage', label: 'Chat message' },
  { key: 'roadmapGeneration', label: 'Roadmap generation' },
  { key: 'copilotKit', label: 'Co-pilot kit' },
  { key: 'copilotAssist', label: 'Co-pilot assist' },
  { key: 'cvAi', label: 'CV AI' },
  { key: 'voicePerMinute', label: 'Voice (per minute)' },
];

const PLAN_COLORS: Record<string, string> = {
  weekly: '#0071e3',
  monthly: '#af52de',
  yearly: '#ff6600',
};

function formatMoney(amount: number | null | undefined, currency: string): string {
  const value = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency || 'NGN',
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currency || 'NGN'} ${value.toLocaleString()}`;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function shortId(value: string): string {
  return value.length > 14 ? `${value.slice(0, 14)}…` : value;
}

// Paystack NGN fee: 1.5% (+₦100 when charge ≥ ₦2,500), capped at ₦2,000.
function paystackFee(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const fee = amount * 0.015 + (amount >= 2500 ? 100 : 0);
  return Math.min(fee, 2000);
}

function statusBadgeClass(status: string): string {
  const s = (status || '').toLowerCase();
  if (['success', 'completed', 'paid'].includes(s)) return 'badge-success';
  if (s === 'pending') return 'badge-warning';
  if (['failed', 'refunded', 'cancelled', 'canceled'].includes(s)) return 'badge-danger';
  return 'badge-secondary';
}

export default function Monetization() {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [voiceUsage, setVoiceUsage] = useState<VoiceUsageSummary | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [pricing, setPricing] = useState<PricingSettings | null>(null);
  const [savedPricing, setSavedPricing] = useState<PricingSettings | null>(null);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [page, setPage] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [txStatusFilter, setTxStatusFilter] = useState('all');
  const [txTypeFilter, setTxTypeFilter] = useState('all');
  const [txSearch, setTxSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const currency = pricing?.currency || 'NGN';
  const dirty = useMemo(
    () => JSON.stringify(pricing) !== JSON.stringify(savedPricing),
    [pricing, savedPricing],
  );

  const showToast = useCallback((kind: 'success' | 'error', message: string) => {
    setToast({ kind, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const loadTransactions = useCallback(async (nextPage: number) => {
    setTxLoading(true);
    try {
      const data = await monetizationApi.getTransactions(PAGE_SIZE, nextPage * PAGE_SIZE);
      setTransactions(data.transactions || []);
      setPage(nextPage);
    } catch (err) {
      setToast({ kind: 'error', message: err instanceof Error ? err.message : 'Could not load transactions' });
    } finally {
      setTxLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, settingsData, txData, voiceData] = await Promise.all([
        monetizationApi.getOverview(),
        monetizationApi.getSettings(),
        monetizationApi.getTransactions(PAGE_SIZE, 0),
        // Voice usage is additive — a failure must not blank the whole page.
        monetizationApi.getVoiceUsage(30).catch(() => null),
      ]);
      setOverview(overviewData);
      setVoiceUsage(voiceData);
      setSettings(settingsData.settings || {});
      const merged = mergePricing(settingsData.settings?.pricing);
      setPricing(merged);
      setSavedPricing(merged);
      setTransactions(txData.transactions || []);
      setPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load monetization data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePricing() {
    if (!pricing) return;
    setSaving(true);
    try {
      const payload: AdminSettings = { ...(settings || {}), pricing };
      const result = await monetizationApi.saveSettings(payload);
      setSettings(result.settings || payload);
      const merged = mergePricing((result.settings || payload).pricing);
      setPricing(merged);
      setSavedPricing(merged);
      showToast('success', 'Pricing settings saved — live for all apps.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not save pricing settings');
    } finally {
      setSaving(false);
    }
  }

  function updatePricing(patch: Partial<PricingSettings>) {
    setPricing((current) => (current ? { ...current, ...patch } : current));
  }

  function updatePack(index: number, patch: Partial<CreditPack>) {
    if (!pricing) return;
    const creditPacks = pricing.creditPacks.map((pack, i) => (i === index ? { ...pack, ...patch } : pack));
    updatePricing({ creditPacks });
  }

  // Memoised so the empty-array fallback keeps a stable identity — otherwise
  // it is a fresh [] on every render and the hooks below never memoise.
  const subs = useMemo(() => overview?.activeSubscriptions || [], [overview]);
  const subsTotal = useMemo(() => subs.reduce((sum, item) => sum + Number(item.count || 0), 0), [subs]);

  const subCount = useCallback(
    (plan: string) => Number(subs.find((s) => s.plan === plan)?.count || 0),
    [subs],
  );

  // Estimated monthly recurring revenue from active subs at current prices.
  const estimatedMrr = useMemo(() => {
    if (!pricing) return 0;
    return (
      subCount('weekly') * pricing.weeklyPrice * 4.33 +
      subCount('monthly') * pricing.monthlyPrice +
      subCount('yearly') * (pricing.yearlyPrice / 12)
    );
  }, [pricing, subCount]);

  const avgTransaction = useMemo(() => {
    const count = Number(overview?.revenue?.last_30d_count || 0);
    const rev = Number(overview?.revenue?.last_30d_revenue || 0);
    return count > 0 ? rev / count : 0;
  }, [overview]);

  const netCreditFlow = useMemo(() => {
    const c = overview?.credits30d;
    return Number(c?.purchased || 0) + Number(c?.granted || 0) - Number(c?.spent || 0);
  }, [overview]);

  const txTypes = useMemo(
    () => Array.from(new Set(transactions.map((tx) => tx.type).filter(Boolean))).sort(),
    [transactions],
  );

  const filteredTx = useMemo(() => {
    const query = txSearch.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (txStatusFilter !== 'all' && (tx.status || '').toLowerCase() !== txStatusFilter) return false;
      if (txTypeFilter !== 'all' && tx.type !== txTypeFilter) return false;
      if (query && !`${tx.user_id} ${tx.provider_reference || ''} ${tx.type}`.toLowerCase().includes(query))
        return false;
      return true;
    });
  }, [transactions, txStatusFilter, txTypeFilter, txSearch]);

  const exportTransactionsCsv = useCallback(() => {
    const rows = [
      ['date', 'user_id', 'type', 'amount', 'currency', 'provider', 'reference', 'status'],
      ...filteredTx.map((tx) => [
        tx.created_at,
        tx.user_id,
        tx.type,
        String(tx.amount),
        tx.currency || currency,
        tx.provider,
        tx.provider_reference || '',
        tx.status,
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `edutu-transactions-page${page + 1}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredTx, currency, page]);

  const mainStats = overview
    ? [
        {
          icon: Banknote,
          label: 'Revenue this month',
          value: formatMoney(overview.revenue?.month_revenue, currency),
          sub: `${formatMoney(overview.revenue?.total_revenue, currency)} all time`,
          gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        },
        {
          icon: TrendingUp,
          label: 'Est. monthly recurring',
          value: formatMoney(estimatedMrr, currency),
          sub: `from ${subsTotal} active sub${subsTotal === 1 ? '' : 's'} at current prices`,
          gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
        },
        {
          icon: Crown,
          label: 'Active subscriptions',
          value: subsTotal.toLocaleString(),
          sub: subs.map((s) => `${s.plan}: ${s.count}`).join(' · ') || 'No subscribers yet',
          gradient: 'linear-gradient(135deg, #af52de 0%, #8e44ad 100%)',
        },
        {
          icon: Coins,
          label: 'Credits (30d)',
          value: `${Number(overview.credits30d?.purchased ?? 0).toLocaleString()} bought`,
          sub: `${Number(overview.credits30d?.spent ?? 0).toLocaleString()} spent · ${Number(
            overview.credits30d?.granted ?? 0,
          ).toLocaleString()} granted`,
          gradient: 'linear-gradient(135deg, #ff6600 0%, #ff4500 100%)',
        },
        {
          icon: Bot,
          label: 'AI usage today',
          value: `${Number(overview.aiUsageToday?.chat_messages_today ?? 0).toLocaleString()} chats`,
          sub: `${Number(overview.aiUsageToday?.action_credits_today ?? 0).toLocaleString()} action credits · ${Number(
            overview.aiUsageToday?.active_ai_users_today ?? 0,
          ).toLocaleString()} users`,
          gradient: 'linear-gradient(135deg, #06b6d4 0%, #0284c7 100%)',
        },
      ]
    : [];

  const insightCards = overview
    ? [
        {
          icon: Wallet,
          color: '#10b981',
          label: 'Avg transaction (30d)',
          value: formatMoney(avgTransaction, currency),
          sub: `${Number(overview.revenue?.last_30d_count || 0)} payments · ${formatMoney(
            overview.revenue?.last_30d_revenue,
            currency,
          )} in 30d`,
        },
        {
          icon: Gauge,
          color: netCreditFlow >= 0 ? '#0071e3' : '#ef4444',
          label: 'Net credit flow (30d)',
          value: `${netCreditFlow >= 0 ? '+' : ''}${netCreditFlow.toLocaleString()} cr`,
          sub: netCreditFlow >= 0 ? 'More credits entering than burned' : 'Users burning more than they buy — watch AI costs',
        },
        {
          icon: Zap,
          color: '#af52de',
          label: 'Est. AI cost today',
          value: formatMoney(
            Number(overview.aiUsageToday?.chat_messages_today ?? 0) * 3 +
              Number(overview.aiUsageToday?.action_credits_today ?? 0) * 2,
            currency,
          ),
          sub: 'rough DeepSeek estimate (₦3/chat + ₦2/action-credit)',
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="mz-page">
        <div className="mz-loading">
          <Loader2 className="mz-spin" size={20} /> Loading monetization data...
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="mz-page">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 className="page-title">Monetization</h1>
            <span className="badge badge-success" style={{ fontSize: 12 }}>
              <Banknote size={12} style={{ marginRight: 4 }} />
              Revenue
            </span>
            {dirty && (
              <span className="badge badge-warning" style={{ fontSize: 12 }}>
                Unsaved changes
              </span>
            )}
          </div>
          <p style={{ color: 'var(--text-tertiary)', margin: '4px 0 0 0', fontSize: 15 }}>
            Control subscription prices, credit packs, AI costs — and oversee every purchase.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} />
            <span className="btn-label">Refresh</span>
          </button>
          <button className="btn btn-primary" onClick={() => void savePricing()} disabled={saving || !dirty}>
            {saving ? <Loader2 className="mz-spin" size={16} /> : <Save size={16} />}
            <span className="btn-label">Save pricing</span>
          </button>
        </div>
      </div>

      {error && <div className="mz-alert">{error}</div>}

      {overview && (
        <>
          <div className="mz-hero-grid">
            {mainStats.map((stat, index) => (
              <div
                key={index}
                className="card card-hover"
                style={{
                  padding: 22,
                  position: 'relative',
                  overflow: 'hidden',
                  background: stat.gradient,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: '#fff',
                    marginBottom: 4,
                    textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stat.value}
                </div>
                <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{stat.label}</div>
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 }}>{stat.sub}</div>
                <div style={{ position: 'absolute', top: 18, right: 18, opacity: 0.9 }}>
                  <stat.icon size={26} strokeWidth={1.5} color="#fff" />
                </div>
              </div>
            ))}
          </div>

          <div className="mz-insights">
            {insightCards.map((card, index) => (
              <div key={index} className="card" style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: `${card.color}1f`,
                    color: card.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <card.icon size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600 }}>{card.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, margin: '2px 0' }}>{card.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{card.sub}</div>
                </div>
              </div>
            ))}

            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 10 }}>
                Subscriptions by plan
              </div>
              {subsTotal === 0 && (
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No active subscribers yet.</div>
              )}
              {(['weekly', 'monthly', 'yearly'] as const).map((plan) => {
                const count = subCount(plan);
                const pct = subsTotal > 0 ? Math.round((count / subsTotal) * 100) : 0;
                return (
                  <div key={plan} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{plan}</span>
                      <span style={{ color: 'var(--text-tertiary)' }}>
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="mz-bar-track">
                      <div className="mz-bar-fill" style={{ width: `${pct}%`, background: PLAN_COLORS[plan] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Usage: global voice AI minutes + estimated provider cost ── */}
          <section className="card mz-section" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16 }}>Usage — Voice AI</h2>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Last {voiceUsage?.days ?? 30} days · speech synthesis (TTS) and transcription (STT), recorded per request
                </div>
              </div>
            </div>
            {!voiceUsage || !voiceUsage.success ? (
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                No voice usage data yet{voiceUsage?.error ? ` (${voiceUsage.error})` : ''}. Data appears once users start speaking with Edutu.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
                  {[
                    {
                      icon: Volume2,
                      label: 'Spoken by Edutu (TTS)',
                      value: `${(voiceUsage.totals.ttsSeconds / 60).toFixed(1)} min`,
                      sub: `${voiceUsage.totals.ttsRequests.toLocaleString()} requests`,
                      color: '#8B5CF6',
                    },
                    {
                      icon: Mic,
                      label: 'Heard from users (STT)',
                      value: `${(voiceUsage.totals.sttSeconds / 60).toFixed(1)} min`,
                      sub: `${voiceUsage.totals.sttRequests.toLocaleString()} requests`,
                      color: '#0EA5E9',
                    },
                    {
                      icon: Volume2,
                      label: 'Est. provider cost',
                      value: `$${voiceUsage.totals.estimatedCostUsd.toFixed(2)}`,
                      sub: `TTS $${voiceUsage.pricing.ttsPerMinuteUsd}/min · STT $${voiceUsage.pricing.sttPerMinuteUsd}/min`,
                      color: '#F59E0B',
                    },
                    {
                      icon: Mic,
                      label: 'Voice users',
                      value: voiceUsage.totals.activeUsers.toLocaleString(),
                      sub: 'unique users in period',
                      color: '#10B981',
                    },
                  ].map((card, index) => (
                    <div key={index} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${card.color}1f`, color: card.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <card.icon size={18} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>{card.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, margin: '2px 0' }}>{card.value}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{card.sub}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {voiceUsage.perDay.length > 0 && (() => {
                  const days = voiceUsage.perDay.slice(-14);
                  const maxSeconds = Math.max(...days.map((d) => d.ttsSeconds + d.sttSeconds), 1);
                  return (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: 6 }}>
                        Daily minutes (TTS purple · STT blue)
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 72 }}>
                        {days.map((d) => {
                          const total = d.ttsSeconds + d.sttSeconds;
                          const h = Math.max(3, Math.round((total / maxSeconds) * 68));
                          const ttsShare = total > 0 ? d.ttsSeconds / total : 0;
                          return (
                            <div key={d.day} title={`${d.day}: ${(total / 60).toFixed(1)} min · $${d.estimatedCostUsd.toFixed(2)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                              <div style={{ height: h, borderRadius: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <div style={{ flexGrow: ttsShare, background: '#8B5CF6' }} />
                                <div style={{ flexGrow: 1 - ttsShare, background: '#0EA5E9' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {voiceUsage.perVoice.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Popular voices:{' '}
                    {voiceUsage.perVoice.slice(0, 5).map((v) => `${v.voice} (${(v.ttsSeconds / 60).toFixed(1)}m)`).join(' · ')}
                  </div>
                )}
              </>
            )}
          </section>

          <div className="mz-columns">
            <section className="card mz-section">
              <div className="mz-section-head">
                <h2>
                  <span className="mz-chip" style={{ background: '#0071e31f', color: '#0071e3' }}>
                    <CreditCard size={16} />
                  </span>
                  Recent transactions
                </h2>
                <button className="btn btn-secondary" onClick={exportTransactionsCsv} disabled={filteredTx.length === 0}>
                  <Download size={15} />
                  <span className="btn-label">CSV</span>
                </button>
              </div>

              <div className="mz-filters">
                <div className="mz-search">
                  <Search size={15} />
                  <input
                    className="input-field"
                    placeholder="Search user, reference, type…"
                    value={txSearch}
                    onChange={(e) => setTxSearch(e.target.value)}
                  />
                </div>
                <select className="input-field" value={txStatusFilter} onChange={(e) => setTxStatusFilter(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                  <option value="refunded">Refunded</option>
                </select>
                <select className="input-field" value={txTypeFilter} onChange={(e) => setTxTypeFilter(e.target.value)}>
                  <option value="all">All types</option>
                  {txTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div className="table-container" style={{ boxShadow: 'none' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>User</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Provider</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTx.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 24 }}>
                          {transactions.length === 0 ? 'No transactions yet.' : 'No transactions match your filters.'}
                        </td>
                      </tr>
                    )}
                    {filteredTx.map((tx) => (
                      <tr key={tx.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(tx.created_at)}</td>
                        <td title={tx.user_id}>{shortId(tx.user_id || '')}</td>
                        <td>{tx.type}</td>
                        <td style={{ fontWeight: 600 }}>{formatMoney(Number(tx.amount), tx.currency || currency)}</td>
                        <td title={tx.provider_reference || ''}>{tx.provider}</td>
                        <td>
                          <span className={`badge ${statusBadgeClass(tx.status)}`}>{tx.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mz-pagination">
                <button
                  className="btn btn-secondary"
                  disabled={txLoading || page === 0}
                  onClick={() => void loadTransactions(page - 1)}
                >
                  Previous
                </button>
                <span>Page {page + 1}</span>
                <button
                  className="btn btn-secondary"
                  disabled={txLoading || transactions.length < PAGE_SIZE}
                  onClick={() => void loadTransactions(page + 1)}
                >
                  Next
                </button>
                {txLoading && <Loader2 className="mz-spin" size={16} />}
              </div>
            </section>

            <section className="card mz-section">
              <div className="mz-section-head">
                <h2>
                  <span className="mz-chip" style={{ background: '#af52de1f', color: '#af52de' }}>
                    <Sparkles size={16} />
                  </span>
                  Top credit spenders (30d)
                </h2>
              </div>
              <div className="table-container" style={{ boxShadow: 'none' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>User</th>
                      <th>Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.topCreditSpenders30d || []).length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 24 }}>
                          No credit spend yet.
                        </td>
                      </tr>
                    )}
                    {(overview.topCreditSpenders30d || []).map((row, index) => (
                      <tr key={row.user_id}>
                        <td>
                          <span
                            className="mz-rank"
                            style={{
                              background: index === 0 ? '#f59e0b' : index === 1 ? '#94a3b8' : index === 2 ? '#b45309' : 'var(--bg-tertiary, #e5e5ea)',
                              color: index < 3 ? '#fff' : 'var(--text-secondary)',
                            }}
                          >
                            {index + 1}
                          </span>
                        </td>
                        <td title={row.user_id}>{shortId(row.user_id || '')}</td>
                        <td style={{ fontWeight: 600 }}>{Number(row.credits_spent || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}

      {pricing && (
        <>
          <div className="mz-section-head" style={{ margin: '26px 0 14px' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 19, margin: 0 }}>
              <span className="mz-chip" style={{ background: '#10b9811f', color: '#10b981' }}>
                <Banknote size={16} />
              </span>
              Pricing editor
            </h2>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-secondary"
                disabled={!dirty || saving}
                onClick={() => setPricing(savedPricing)}
                title="Discard unsaved changes"
              >
                <RotateCcw size={15} />
                <span className="btn-label">Reset</span>
              </button>
              <button className="btn btn-primary" onClick={() => void savePricing()} disabled={saving || !dirty}>
                {saving ? <Loader2 className="mz-spin" size={16} /> : <Save size={16} />}
                <span className="btn-label">Save pricing</span>
              </button>
            </div>
          </div>

          {/* Plan preview cards: what users pay, promo, Paystack fee, your net */}
          <div className="mz-plan-grid">
            {(
              [
                { plan: 'weekly', label: 'Weekly', price: pricing.weeklyPrice, promo: pricing.promo.weeklyPrice },
                { plan: 'monthly', label: 'Monthly', price: pricing.monthlyPrice, promo: pricing.promo.monthlyPrice },
                { plan: 'yearly', label: 'Yearly', price: pricing.yearlyPrice, promo: pricing.promo.yearlyPrice },
              ] as const
            ).map(({ plan, label, price, promo }) => {
              const effective = pricing.promo.active && promo != null ? promo : price;
              const fee = paystackFee(effective);
              return (
                <div key={plan} className="card mz-plan-card" style={{ borderTop: `3px solid ${PLAN_COLORS[plan]}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, color: PLAN_COLORS[plan] }}>{label}</span>
                    {pricing.promo.active && promo != null && <span className="badge badge-warning">PROMO</span>}
                  </div>
                  <div style={{ margin: '8px 0 2px' }}>
                    <span style={{ fontSize: 24, fontWeight: 700 }}>{formatMoney(effective, currency)}</span>
                    {pricing.promo.active && promo != null && (
                      <span style={{ marginLeft: 8, textDecoration: 'line-through', color: 'var(--text-tertiary)', fontSize: 14 }}>
                        {formatMoney(price, currency)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Paystack fee ≈ {formatMoney(fee, currency)} · you net{' '}
                    <strong style={{ color: '#10b981' }}>{formatMoney(effective - fee, currency)}</strong>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mz-editor-grid">
            <EditorCard icon={<Crown size={16} />} color="#0071e3" title="Subscription plans">
              <div className="mz-form">
                <Field label="Currency (ISO code)">
                  <input
                    className="input-field"
                    value={pricing.currency}
                    onChange={(e) => updatePricing({ currency: e.target.value.toUpperCase().slice(0, 3) })}
                  />
                </Field>
                <NumField label="Weekly price" value={pricing.weeklyPrice} onChange={(weeklyPrice) => updatePricing({ weeklyPrice })} />
                <NumField label="Monthly price" value={pricing.monthlyPrice} onChange={(monthlyPrice) => updatePricing({ monthlyPrice })} />
                <NumField label="Yearly price" value={pricing.yearlyPrice} onChange={(yearlyPrice) => updatePricing({ yearlyPrice })} />
              </div>
              {pricing.monthlyPrice > 0 && pricing.yearlyPrice > 0 && (
                <p className="mz-hint">
                  Yearly = {formatMoney(pricing.yearlyPrice / 12, currency)}/mo effective (
                  {Math.max(0, Math.round((1 - pricing.yearlyPrice / (pricing.monthlyPrice * 12)) * 100))}% off monthly).
                </p>
              )}
            </EditorCard>

            <EditorCard
              icon={<Megaphone size={16} />}
              color="#f59e0b"
              title="Promo"
              action={
                <label className="mz-switch">
                  <input
                    type="checkbox"
                    checked={pricing.promo.active}
                    onChange={(e) => updatePricing({ promo: { ...pricing.promo, active: e.target.checked } })}
                  />
                  <span>{pricing.promo.active ? 'Active' : 'Off'}</span>
                </label>
              }
            >
              <div className="mz-form">
                <Field label="Promo label">
                  <input
                    className="input-field"
                    value={pricing.promo.label}
                    onChange={(e) => updatePricing({ promo: { ...pricing.promo, label: e.target.value } })}
                    placeholder="e.g. Launch sale"
                  />
                </Field>
                <OptNumField label="Promo weekly" value={pricing.promo.weeklyPrice} onChange={(weeklyPrice) => updatePricing({ promo: { ...pricing.promo, weeklyPrice } })} />
                <OptNumField label="Promo monthly" value={pricing.promo.monthlyPrice} onChange={(monthlyPrice) => updatePricing({ promo: { ...pricing.promo, monthlyPrice } })} />
                <OptNumField label="Promo yearly" value={pricing.promo.yearlyPrice} onChange={(yearlyPrice) => updatePricing({ promo: { ...pricing.promo, yearlyPrice } })} />
              </div>
              <p className="mz-hint">Leave a promo price empty to keep that plan at full price during the promo.</p>
            </EditorCard>

            <EditorCard
              icon={<Coins size={16} />}
              color="#ff6600"
              title={`Credit packs (${pricing.creditPacks.length}/${MAX_CREDIT_PACKS})`}
              action={
                <button
                  className="btn btn-secondary"
                  disabled={pricing.creditPacks.length >= MAX_CREDIT_PACKS}
                  onClick={() => updatePricing({ creditPacks: [...pricing.creditPacks, { credits: 100, price: 0, label: '' }] })}
                >
                  <Plus size={15} />
                  <span className="btn-label">Add</span>
                </button>
              }
              wide
            >
              <div className="mz-pack-grid">
                {pricing.creditPacks.length === 0 && (
                  <p className="mz-hint">No packs yet — users can only subscribe. Add at least one top-up pack.</p>
                )}
                {pricing.creditPacks.map((pack, index) => {
                  const perCredit = pack.credits > 0 ? pack.price / pack.credits : 0;
                  return (
                    <div className="mz-pack-card" key={index}>
                      <div className="mz-pack-head">
                        <span className="badge badge-primary">{pack.credits.toLocaleString()} cr</span>
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                          {perCredit > 0 ? `${formatMoney(perCredit, currency)}/credit` : '—'}
                        </span>
                        <button
                          className="mz-icon-btn"
                          title="Remove pack"
                          onClick={() => updatePricing({ creditPacks: pricing.creditPacks.filter((_, i) => i !== index) })}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="mz-form mz-form-tight">
                        <Field label="Label">
                          <input className="input-field" value={pack.label} onChange={(e) => updatePack(index, { label: e.target.value })} placeholder="e.g. Starter" />
                        </Field>
                        <NumField label="Credits" value={pack.credits} onChange={(credits) => updatePack(index, { credits })} />
                        <NumField label={`Price (${currency})`} value={pack.price} onChange={(price) => updatePack(index, { price })} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </EditorCard>

            <EditorCard icon={<Bot size={16} />} color="#af52de" title="AI action costs (credits)">
              <div className="mz-form">
                {AI_COST_LABELS.map(({ key, label }) => (
                  <NumField key={key} label={label} value={pricing.aiCosts[key]} onChange={(value) => updatePricing({ aiCosts: { ...pricing.aiCosts, [key]: value } })} />
                ))}
              </div>
              <p className="mz-hint">Charged per action to non-Pro users; Pro users consume fair-use allowance instead.</p>
            </EditorCard>

            <EditorCard icon={<Gift size={16} />} color="#10b981" title="Free tier & fair use">
              <div className="mz-form">
                <NumField label="Free: daily chat msgs" value={pricing.freeTier.dailyChatMessages} onChange={(dailyChatMessages) => updatePricing({ freeTier: { ...pricing.freeTier, dailyChatMessages } })} />
                <NumField label="Free: signup credits" value={pricing.freeTier.signupCredits} onChange={(signupCredits) => updatePricing({ freeTier: { ...pricing.freeTier, signupCredits } })} />
                <NumField label="Pro: daily chat msgs" value={pricing.proFairUse.dailyChatMessages} onChange={(dailyChatMessages) => updatePricing({ proFairUse: { ...pricing.proFairUse, dailyChatMessages } })} />
                <NumField label="Pro: daily action credits" value={pricing.proFairUse.dailyActionCredits} onChange={(dailyActionCredits) => updatePricing({ proFairUse: { ...pricing.proFairUse, dailyActionCredits } })} />
              </div>
            </EditorCard>

            <EditorCard icon={<Users size={16} />} color="#06b6d4" title="Checkout links">
              <div className="mz-form mz-form-single">
                <Field label="Checkout base URL">
                  <input className="input-field" value={pricing.checkoutBaseUrl} onChange={(e) => updatePricing({ checkoutBaseUrl: e.target.value })} placeholder="https://pay.edutu.org" />
                </Field>
                <Field label="Manage subscription URL">
                  <input className="input-field" value={pricing.manageUrl} onChange={(e) => updatePricing({ manageUrl: e.target.value })} placeholder="https://pay.edutu.org/manage" />
                </Field>
              </div>
            </EditorCard>
          </div>

          {dirty && (
            <div className="mz-savebar">
              <span>You have unsaved pricing changes.</span>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setPricing(savedPricing)} disabled={saving}>
                  Discard
                </button>
                <button className="btn btn-primary" onClick={() => void savePricing()} disabled={saving}>
                  {saving ? <Loader2 className="mz-spin" size={16} /> : <Save size={16} />} Save pricing
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {toast && (
        <div className={`mz-toast mz-toast-${toast.kind}`}>
          {toast.kind === 'success' ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {toast.message}
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
}

function EditorCard({
  icon,
  color,
  title,
  action,
  wide,
  children,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  action?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`card mz-section ${wide ? 'mz-wide' : ''}`}>
      <div className="mz-section-head">
        <h2>
          <span className="mz-chip" style={{ background: `${color}1f`, color }}>
            {icon}
          </span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mz-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <input
        className="input-field"
        type="number"
        min={0}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </Field>
  );
}

function OptNumField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return (
    <Field label={label}>
      <input
        className="input-field"
        type="number"
        min={0}
        value={value ?? ''}
        placeholder="unset"
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value) || 0)}
      />
    </Field>
  );
}

const styles = `
.mz-page{display:flex;flex-direction:column;gap:18px}
.mz-hero-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}
.mz-insights{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.mz-columns{display:grid;grid-template-columns:2fr 1fr;gap:14px}
.mz-section{padding:20px}
.mz-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.mz-section-head h2{margin:0;font-size:16px;font-weight:700;display:flex;align-items:center;gap:10px}
.mz-chip{width:30px;height:30px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.mz-bar-track{height:7px;border-radius:99px;background:var(--bg-tertiary,rgba(120,120,128,.16));overflow:hidden}
.mz-bar-fill{height:100%;border-radius:99px;transition:width .3s ease}
.mz-rank{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:99px;font-size:12px;font-weight:700}
.mz-filters{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-bottom:12px}
.mz-filters .input-field{width:100%}
.mz-search{position:relative}
.mz-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-tertiary);pointer-events:none}
.mz-search .input-field{padding-left:34px}
.mz-pagination{display:flex;align-items:center;gap:12px;margin-top:12px;color:var(--text-tertiary);font-size:13px}
.mz-plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.mz-plan-card{padding:18px}
.mz-editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.mz-wide{grid-column:1/-1}
.mz-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.mz-form-tight{grid-template-columns:2fr 1fr 1fr}
.mz-form-single{grid-template-columns:1fr}
.mz-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.mz-field>span{color:var(--text-tertiary);font-size:12px;font-weight:700}
.mz-field .input-field{width:100%}
.mz-hint{margin:10px 0 0;font-size:12px;color:var(--text-tertiary)}
.mz-switch{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;cursor:pointer}
.mz-switch input{width:18px;height:18px;accent-color:#f59e0b;cursor:pointer}
.mz-pack-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.mz-pack-card{border:1px solid var(--border-color,rgba(120,120,128,.2));border-radius:12px;padding:14px;background:var(--bg-secondary,transparent)}
.mz-pack-head{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.mz-pack-head .mz-icon-btn{margin-left:auto}
.mz-icon-btn{border:0;background:rgba(239,68,68,.12);color:#ef4444;border-radius:8px;padding:7px;cursor:pointer;display:inline-flex}
.mz-icon-btn:hover{background:rgba(239,68,68,.2)}
.mz-savebar{position:sticky;bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 18px;border-radius:14px;background:var(--bg-primary,#1c1c1e);border:1px solid var(--border-color,rgba(120,120,128,.25));box-shadow:0 10px 30px rgba(0,0,0,.25);font-size:14px;font-weight:600;z-index:20}
.mz-loading{display:flex;align-items:center;gap:8px;color:var(--text-tertiary);padding:18px}
.mz-alert{display:flex;align-items:center;gap:8px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35);border-radius:10px;color:#ef4444;padding:14px 16px}
.mz-toast{position:fixed;bottom:24px;right:24px;display:flex;align-items:center;gap:8px;border-radius:10px;padding:12px 16px;font-weight:600;z-index:100;box-shadow:0 8px 24px rgba(0,0,0,.35)}
.mz-toast-success{background:#0f3a1f;color:#34d399;border:1px solid rgba(52,211,153,.4)}
.mz-toast-error{background:#3a1414;color:#f87171;border:1px solid rgba(248,113,113,.4)}
.mz-spin{animation:mz-spin 1s linear infinite}@keyframes mz-spin{to{transform:rotate(360deg)}}
@media(max-width:1400px){.mz-hero-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.mz-insights{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:1100px){.mz-columns{grid-template-columns:1fr}.mz-editor-grid{grid-template-columns:1fr}.mz-pack-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.mz-hero-grid,.mz-insights,.mz-plan-grid,.mz-pack-grid,.mz-filters{grid-template-columns:1fr}.mz-form,.mz-form-tight{grid-template-columns:1fr}}
`;
