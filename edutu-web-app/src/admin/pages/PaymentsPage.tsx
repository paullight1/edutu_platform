/**
 * Admin Payments Page
 * View all transactions, filter by user/type, see revenue stats
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import {
  DollarSign, TrendingUp, CreditCard, Search, Filter, ChevronLeft, ChevronRight,
  ArrowUpRight, ArrowDownLeft, RefreshCw, Receipt, WalletCards
} from 'lucide-react';
import { getTransactions, getPaymentsStats, type CreditTransaction } from '../../services/admin/paymentsAdmin';

const TYPE_LABELS: Record<string, string> = {
  purchase: 'Purchase',
  spend: 'Spent',
  reward: 'Reward',
  refund: 'Refund',
  admin_grant: 'Admin Grant',
  creator_earning: 'Creator Earning',
};

const TYPE_COLORS: Record<string, string> = {
  purchase: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400',
  spend: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400',
  reward: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400',
  refund: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400',
  admin_grant: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400',
  creator_earning: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400',
};

type PaymentStats = Awaited<ReturnType<typeof getPaymentsStats>>;

const PaymentsPage: React.FC = () => {
  const { userId } = useAuth();
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<PaymentStats>({
    totalRevenue: 0,
    totalCreditsSpent: 0,
    totalTransactions: 0,
    purchaseTransactions: 0,
    topSpenders: []
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, statsRes] = await Promise.all([
        getTransactions({
          type: typeFilter || undefined,
          limit: pageSize,
          offset: page * pageSize,
        }),
        getPaymentsStats(),
      ]);
      setTransactions(txRes.data);
      setTotalCount(txRes.count);
      setStats(statsRes);
    } catch (err) {
      console.error('Failed to load payments data:', err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, page]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(totalCount / pageSize);
  const visibleTransactions = transactions.filter((tx) => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    return [
      TYPE_LABELS[tx.type] || tx.type,
      tx.description,
      tx.user_id,
      tx.amount.toString(),
      tx.created_at,
    ].some((value) => String(value || '').toLowerCase().includes(query));
  });

  const statCards = [
    {
      label: 'Total Revenue',
      helper: 'Credits purchased',
      value: stats.totalRevenue.toLocaleString(),
      icon: DollarSign,
      gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
    },
    {
      label: 'Credits Spent',
      helper: 'Used across products',
      value: stats.totalCreditsSpent.toLocaleString(),
      icon: TrendingUp,
      gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    },
    {
      label: 'Transactions',
      helper: 'All credit movements',
      value: stats.totalTransactions.toLocaleString(),
      icon: CreditCard,
      gradient: 'linear-gradient(135deg, #ff6600 0%, #ff4500 100%)',
    },
    {
      label: 'Purchases',
      helper: 'Credit purchase events',
      value: stats.purchaseTransactions.toLocaleString(),
      icon: ArrowUpRight,
      gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: '6px' }}>
            Monitor credit purchases, spending, refunds, and creator earnings.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => void fetchData()} disabled={loading}>
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="stats-grid">
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="stat-card card-hover"
              style={{
                background: item.gradient,
                color: '#ffffff',
                minHeight: '124px',
                justifyContent: 'space-between',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                <div>
                  <div className="stat-value" style={{ color: '#ffffff', marginBottom: '8px' }}>{item.value}</div>
                  <div className="stat-label" style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 700 }}>{item.label}</div>
                  <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: '12px', marginTop: '4px' }}>{item.helper}</div>
                </div>
                <Icon size={30} style={{ color: 'rgba(255,255,255,0.86)' }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 280px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by user, type, description, amount..."
              className="input-field"
              style={{ paddingLeft: '40px' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
              className="input-field"
              style={{ width: '170px' }}
            >
              <option value="">All Types</option>
              {Object.entries(TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <button className="btn btn-secondary">
              <Filter size={18} />
              Filter
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Transaction History</h2>
            <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              {totalCount} total transactions
            </p>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            <Receipt size={22} />
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <RefreshCw size={36} className="animate-spin" style={{ marginBottom: '12px', color: 'var(--primary)' }} />
            <p>Loading transactions...</p>
          </div>
        ) : visibleTransactions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <WalletCards size={54} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
              No transactions found
            </h3>
            <p style={{ maxWidth: '360px' }}>
              Credit purchases, refunds, grants, and spending events will appear here once users start transacting.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Description</th>
                  <th>User ID</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${TYPE_COLORS[tx.type] || 'text-gray-600 bg-gray-100'}`}>
                        {TYPE_LABELS[tx.type] || tx.type}
                      </span>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: tx.amount > 0 ? '#10b981' : '#ef4444' }}>
                        {tx.amount > 0 ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
                        {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()} credits
                      </span>
                    </td>
                    <td style={{ maxWidth: '260px', color: 'var(--text-secondary)' }}>
                      {tx.description || '—'}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        {tx.user_id.slice(0, 8)}...
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--text-tertiary)' }}>
                      {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <p style={{ fontSize: '14px', color: 'var(--text-tertiary)' }}>
              Page {page + 1} of {totalPages}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn btn-secondary"
                style={{ padding: '8px 10px', opacity: page === 0 ? 0.45 : 1 }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn btn-secondary"
                style={{ padding: '8px 10px', opacity: page >= totalPages - 1 ? 0.45 : 1 }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentsPage;
