import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Shield,
  Target,
  Users
} from 'lucide-react';
import { useAnalytics } from '../hooks/useAnalytics';
import { useGoals } from '../hooks/useGoals';
import { clearOpportunitiesCache, fetchOpportunities } from '../services/opportunities';
import { supabase } from '../lib/supabaseClient';
import { MAX_CV_PER_USER } from '../services/cvService.supabase';
import type { Opportunity } from '../types/opportunity';
import { ToastProvider } from '../components/ui/ToastProvider';
import OpportunityList from '../pages/admin/opportunities/OpportunityList';

type AdminSection = 'overview' | 'goals' | 'opportunities' | 'system';

interface OpportunityState {
  data: Opportunity[];
  loading: boolean;
  error: string | null;
}

interface CvUsageEntry {
  userId: string;
  fullName: string;
  email: string;
  totalCvs: number;
  totalSize: number;
  lastUploadedAt: string | null;
  quotaPercent: number;
  quotaReached: boolean;
}

const SECTION_LABELS: Record<AdminSection, string> = {
  overview: 'Dashboard',
  goals: 'Goals',
  opportunities: 'Opportunities',
  system: 'System'
};

const formatBytes = (bytes: number) => {
  if (!bytes || Number.isNaN(bytes)) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : value >= 100 ? 0 : 1)} ${units[index]}`;
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return '—';
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const AdminApp: React.FC = () => {
  const [section, setSection] = useState<AdminSection>('overview');
  const [opportunityState, setOpportunityState] = useState<OpportunityState>({
    data: [],
    loading: true,
    error: null
  });
  const { stats, recordActivity } = useAnalytics();
  const { goals, updateGoal, deleteGoal, clearGoals } = useGoals();
  const [cvUsage, setCvUsage] = useState<CvUsageEntry[]>([]);
  const [cvUsageLoading, setCvUsageLoading] = useState(false);
  const [cvUsageError, setCvUsageError] = useState<string | null>(null);
  const [cvUsageFetched, setCvUsageFetched] = useState(false);

  useEffect(() => {
    recordActivity();
  }, [recordActivity]);

  const loadOpportunities = (force = false) => {
    setOpportunityState((prev) => ({
      ...prev,
      loading: true,
      error: force ? null : prev.error
    }));

    fetchOpportunities({ force })
      .then((payload) => {
        setOpportunityState({
          data: payload,
          loading: false,
          error: null
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unable to load opportunities.';
        setOpportunityState({
          data: [],
          loading: false,
          error: message
        });
      });
  };

  useEffect(() => {
    loadOpportunities();
  }, []);

  const loadCvUsage = useCallback(async () => {
    setCvUsageLoading(true);
    setCvUsageError(null);
    try {
      type RawCvRecord = {
        user_id: string;
        file_size: number | null;
        uploaded_at: string | null;
      };

      const { data: records, error } = await supabase
        .from('cv_records')
        .select<RawCvRecord>('user_id, file_size, uploaded_at')
        .order('uploaded_at', { ascending: false });

      if (error) {
        throw error;
      }

      const cvRecords = records ?? [];
      const userIds = Array.from(new Set(cvRecords.map((record) => record.user_id)));

      type ProfileRow = {
        user_id: string;
        full_name: string | null;
        email: string | null;
      };

      const profileMap = new Map<string, ProfileRow>();

      if (userIds.length > 0) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select<ProfileRow>('user_id, full_name, email')
          .in('user_id', userIds);

        if (profileError) {
          throw profileError;
        }

        (profiles ?? []).forEach((profile) => {
          profileMap.set(profile.user_id, profile);
        });
      }

      const aggregated: CvUsageEntry[] = userIds.map((userId) => {
        const userRecords = cvRecords.filter((record) => record.user_id === userId);
        const totalCvs = userRecords.length;
        const totalSize = userRecords.reduce((total, record) => total + (record.file_size ?? 0), 0);
        const lastUploadedAt = userRecords.reduce<string | null>((latest, record) => {
          if (!record.uploaded_at) {
            return latest;
          }
          if (!latest) {
            return record.uploaded_at;
          }
          return new Date(record.uploaded_at).getTime() > new Date(latest).getTime()
            ? record.uploaded_at
            : latest;
        }, null);

        const quotaPercent = Math.min((totalCvs / MAX_CV_PER_USER) * 100, 100);
        const profile = profileMap.get(userId);
        const email = profile?.email ?? '—';
        const fullName =
          profile?.full_name?.trim() ||
          (profile?.email ? profile.email.split('@')[0] : null) ||
          `User ${userId.slice(0, 8)}`;

        return {
          userId,
          fullName,
          email,
          totalCvs,
          totalSize,
          lastUploadedAt,
          quotaPercent,
          quotaReached: totalCvs >= MAX_CV_PER_USER
        };
      });

      aggregated.sort((a, b) => {
        if (b.quotaPercent !== a.quotaPercent) {
          return b.quotaPercent - a.quotaPercent;
        }
        const timeA = a.lastUploadedAt ? new Date(a.lastUploadedAt).getTime() : 0;
        const timeB = b.lastUploadedAt ? new Date(b.lastUploadedAt).getTime() : 0;
        return timeB - timeA;
      });

      setCvUsage(aggregated);
      setCvUsageFetched(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch CV usage.';
      setCvUsageError(message);
    } finally {
      setCvUsageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (section === 'system' && !cvUsageFetched && !cvUsageLoading) {
      loadCvUsage();
    }
  }, [section, cvUsageFetched, cvUsageLoading, loadCvUsage]);

  const totalGoals = goals.length;
  const completedGoals = useMemo(
    () => goals.filter((goal) => goal.status === 'completed').length,
    [goals]
  );
  const activeGoals = totalGoals - completedGoals;

  const opportunityByCategory = useMemo(() => {
    return opportunityState.data.reduce<Record<string, number>>((accumulator, opportunity) => {
      const key = opportunity.category || 'General';
      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    }, {});
  }, [opportunityState.data]);

  const handleMarkGoal = (id: string, status: 'active' | 'completed' | 'archived') => {
    updateGoal(id, { status });
  };

  const pathForSection = (value: AdminSection) => {
    switch (value) {
      case 'overview':
        return '/admin';
      case 'goals':
        return '/admin/goals';
      case 'opportunities':
        return '/admin/opportunities';
      case 'system':
        return '/admin/system';
      default:
        return '/admin';
    }
  };

  const sectionFromPath = (pathname: string): AdminSection => {
    const trimmed = pathname.startsWith('/admin') ? pathname.replace('/admin', '') : pathname;

    if (trimmed.startsWith('/goals')) {
      return 'goals';
    }
    if (trimmed.startsWith('/opportunities')) {
      return 'opportunities';
    }
    if (trimmed.startsWith('/system')) {
      return 'system';
    }
    return 'overview';
  };

  useEffect(() => {
    const syncFromLocation = () => {
      const nextSection = sectionFromPath(window.location.pathname);
      setSection(nextSection);
    };

    syncFromLocation();
    window.addEventListener('popstate', syncFromLocation);
    return () => window.removeEventListener('popstate', syncFromLocation);
  }, []);

  const handleNavigate = (value: AdminSection) => {
    setSection(value);
    const nextPath = pathForSection(value);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
  };

  const renderNav = () => (
    <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-gray-200 lg:bg-white">
      <div className="px-6 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3 text-primary">
          <Shield size={20} />
          <span className="text-lg font-semibold">Edutu Admin</span>
        </div>
        <p className="mt-2 text-sm text-gray-500">Operational control for opportunities, goals, and analytics.</p>
      </div>
      <nav className="flex-1 px-4 py-6 space-y-2">
        {(Object.keys(SECTION_LABELS) as AdminSection[]).map((value) => (
          <button
            key={value}
            onClick={() => handleNavigate(value)}
            className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
              section === value
                ? 'bg-primary text-white shadow'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {SECTION_LABELS[value]}
          </button>
        ))}
        <button
          onClick={() => navigate('ai-control')}
          className="w-full rounded-xl border border-transparent px-4 py-3 text-left text-sm font-medium text-primary transition hover:bg-primary/5"
        >
          AI &amp; Personalisation
        </button>
        <button
          onClick={() => navigate('users')}
          className="w-full rounded-xl border border-transparent px-4 py-3 text-left text-sm font-medium text-primary transition hover:bg-primary/5"
        >
          User &amp; Role Management
        </button>
        <button
          onClick={() => navigate('analytics')}
          className="w-full rounded-xl border border-transparent px-4 py-3 text-left text-sm font-medium text-primary transition hover:bg-primary/5"
        >
          Analytics Dashboard
        </button>
        <button
          onClick={() => navigate('community')}
          className="w-full rounded-xl border border-transparent px-4 py-3 text-left text-sm font-medium text-primary transition hover:bg-primary/5"
        >
          Community &amp; Support
        </button>
      </nav>
      <div className="px-6 py-4 border-t border-gray-100 text-xs text-gray-400">
        v1 admin preview Â· Frontend simulation
      </div>
    </aside>
  );

  const renderHeader = () => (
    <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-4 shadow-sm lg:px-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{SECTION_LABELS[section]}</h1>
        <p className="text-sm text-gray-500">Manage the learner experience and monitor engagement.</p>
      </div>
      <a
        href="/"
        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
      >
        <ArrowLeft size={16} />
        Back to learner view
      </a>
    </header>
  );

  const renderOverview = () => (
    <div className="space-y-6 p-4 lg:p-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          icon={<Users size={18} />}
          label="Active Learners (browser)"
          value={stats.daysActive.toLocaleString()}
          helper="Unique active days logged locally"
        />
        <AdminMetricCard
          icon={<Target size={18} />}
          label="Goals in Play"
          value={totalGoals.toLocaleString()}
          helper={`${activeGoals} active / ${completedGoals} completed`}
        />
        <AdminMetricCard
          icon={<BarChart3 size={18} />}
          label="Opportunities catalogued"
          value={opportunityState.data.length.toLocaleString()}
          helper={`${Object.keys(opportunityByCategory).length} categories`}
        />
        <AdminMetricCard
          icon={<Activity size={18} />}
          label="Chat Sessions"
          value={stats.chatSessions.toLocaleString()}
          helper="Tracked per browser profile"
        />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => navigate('ai-control')}
          className="flex flex-col items-start gap-3 rounded-2xl border border-gray-200 bg-white p-6 text-left transition hover:border-primary/30 hover:shadow-lg"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-600">
            AI config
          </span>
          <h2 className="text-base font-semibold text-gray-900">AI &amp; personalisation</h2>
          <p className="text-sm text-gray-500">
            Configure mentor prompts and tune recommendation weights for Groq/Llama deployments.
          </p>
        </button>
        <button
          type="button"
          onClick={() => navigate('users')}
          className="flex flex-col items-start gap-3 rounded-2xl border border-gray-200 bg-white p-6 text-left transition hover:border-primary/30 hover:shadow-lg"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            User controls
          </span>
          <h2 className="text-base font-semibold text-gray-900">Manage user roles</h2>
          <p className="text-sm text-gray-500">
            Promote moderators, update permissions, and review learner activity.
          </p>
        </button>
        <button
          type="button"
          onClick={() => navigate('analytics')}
          className="flex flex-col items-start gap-3 rounded-2xl border border-gray-200 bg-white p-6 text-left transition hover:border-primary/30 hover:shadow-lg"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-600">
            Insights
          </span>
          <h2 className="text-base font-semibold text-gray-900">Platform analytics</h2>
          <p className="text-sm text-gray-500">
            Understand growth trends, opportunity performance, and AI adoption.
          </p>
        </button>
        <button
          type="button"
          onClick={() => navigate('community')}
          className="flex flex-col items-start gap-3 rounded-2xl border border-gray-200 bg-white p-6 text-left transition hover:border-primary/30 hover:shadow-lg"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-600">
            Community
          </span>
          <h2 className="text-base font-semibold text-gray-900">Community &amp; support</h2>
          <p className="text-sm text-gray-500">
            Publish announcements, resolve tickets, and keep the marketplace safe.
          </p>
        </button>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Goal Pipeline</h2>
          <p className="mt-1 text-sm text-gray-500">
            Snapshot of learner commitments and progression.
          </p>
          <div className="mt-6 space-y-4">
            {goals.slice(0, 5).map((goal) => (
              <div
                key={goal.id}
                className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">{goal.title}</span>
                  <span className="text-xs text-gray-500">{goal.status}</span>
                </div>
                {goal.deadline && (
                  <p className="mt-1 text-xs text-gray-500">Deadline: {new Date(goal.deadline).toLocaleDateString()}</p>
                )}
              </div>
            ))}
            {goals.length === 0 && <p className="text-sm text-gray-500">No goals recorded yet.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Opportunities by Category</h2>
          <p className="mt-1 text-sm text-gray-500">Distribution of curated items currently exposed to learners.</p>
          <div className="mt-6 space-y-3">
            {Object.entries(opportunityByCategory).map(([name, count]) => (
              <div key={name} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <span className="text-sm font-medium text-gray-700">{name}</span>
                <span className="text-sm text-gray-500">{count} items</span>
              </div>
            ))}
            {Object.keys(opportunityByCategory).length === 0 && (
              <p className="text-sm text-gray-500">No opportunity data loaded.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );

  const renderGoals = () => (
    <div className="space-y-6 p-4 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Goal Directory</h2>
          <p className="text-sm text-gray-500">Audit, edit, or clear learner goals stored locally.</p>
        </div>
        <button
          onClick={() => clearGoals()}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <AlertTriangle size={16} />
          Clear all goals
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Progress</th>
              <th className="px-4 py-3">Deadline</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {goals.map((goal) => (
              <tr key={goal.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{goal.title}</div>
                  {goal.description && (
                    <div className="text-xs text-gray-500">{goal.description}</div>
                  )}
                </td>
                <td className="px-4 py-3 capitalize text-gray-700">{goal.status}</td>
                <td className="px-4 py-3 text-gray-700">{Math.round(goal.progress)}%</td>
                <td className="px-4 py-3 text-gray-500">
                  {goal.deadline ? new Date(goal.deadline).toLocaleDateString() : 'â€”'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => handleMarkGoal(goal.id, 'active')}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                    >
                      Reopen
                    </button>
                    <button
                      onClick={() => handleMarkGoal(goal.id, 'completed')}
                      className="inline-flex items-center gap-1 rounded-lg border border-green-200 px-2 py-1 text-xs text-green-600 hover:bg-green-50"
                    >
                      <CheckCircle2 size={14} />
                      Complete
                    </button>
                    <button
                      onClick={() => deleteGoal(goal.id)}
                      className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {goals.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                  No goals stored for this browser profile.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderOpportunities = () => <OpportunityList />;

  const renderSystem = () => (
    <div className="space-y-6 p-4 lg:p-8">
      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">CV Storage Monitor</h2>
            <p className="mt-1 text-sm text-gray-500">
              Track Supabase storage usage and quota status. Limit is {MAX_CV_PER_USER} CVs per account.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setCvUsageFetched(false);
              loadCvUsage();
            }}
            disabled={cvUsageLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cvUsageLoading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />}
            Refresh
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {cvUsageLoading && !cvUsageFetched ? (
            <p className="text-sm text-gray-500">Loading CV usage …</p>
          ) : cvUsageError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {cvUsageError}
            </div>
          ) : cvUsage.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
              No Supabase CV uploads yet.
            </p>
          ) : (
            cvUsage.map((entry) => (
              <div
                key={entry.userId}
                className={`grid gap-4 rounded-2xl border p-4 md:grid-cols-4 ${entry.quotaReached ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{entry.fullName}</span>
                    {entry.quotaReached ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        Quota reached
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {entry.totalCvs} / {MAX_CV_PER_USER} CVs
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {entry.email === '—' ? 'Email unavailable' : entry.email} • {entry.userId.slice(0, 8)}
                  </p>
                </div>

                <div className="md:col-span-2">
                  <div className="flex items-center justify-between text-sm font-medium text-gray-700">
                    <span>Usage</span>
                    <span className="text-xs text-gray-500">{Math.round(entry.quotaPercent)}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className={`h-2 rounded-full ${entry.quotaReached ? 'bg-red-500' : 'bg-primary'}`}
                      style={{ width: `${entry.quotaPercent}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-700">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-gray-500">Storage used</p>
                    <p>{formatBytes(entry.totalSize)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-gray-500">Last upload</p>
                    <p>{formatDateTime(entry.lastUploadedAt)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Environment Snapshot</h2>
        <p className="mt-1 text-sm text-gray-500">Quick view of configuration powering the admin preview.</p>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <dt className="text-xs font-semibold tracking-wide text-gray-500">Firebase linked?</dt>
            <dd className="mt-1 text-sm text-gray-700">Config stub only (unused)</dd>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <dt className="text-xs font-semibold tracking-wide text-gray-500">AI chat status</dt>
            <dd className="mt-1 text-sm text-gray-700">UI ready, backend proxy pending</dd>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <dt className="text-xs font-semibold tracking-wide text-gray-500">Storage layer</dt>
            <dd className="mt-1 text-sm text-gray-700">Supabase Storage (`cv-files` bucket)</dd>
          </div>
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <dt className="text-xs font-semibold tracking-wide text-gray-500">Opportunities source</dt>
            <dd className="mt-1 text-sm text-gray-700">Static JSON at /data/opportunities.json</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900">Administrative Actions</h2>
        <p className="mt-1 text-sm text-gray-500">Utilities impact only the current browser profile for this preview.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <AdminActionCard
            title="Reset goals"
            description="Clears all locally stored goals and templates."
            buttonLabel="Clear goals"
            tone="danger"
            onAction={() => clearGoals()}
          />
          <AdminActionCard
            title="Reset analytics"
            description="Clears activity streaks, opportunity explores, and chat counts."
            buttonLabel="Clear analytics"
            tone="neutral"
            onAction={() => {
              localStorage.removeItem('edutu.analytics.v1');
              location.reload();
            }}
          />
          <AdminActionCard
            title="Clear CV cache"
            description="Drops browser-cached CV data. Supabase content stays intact."
            buttonLabel="Clear CV cache"
            tone="neutral"
            onAction={() => {
              localStorage.removeItem('edutu.cv.records');
              loadCvUsage();
            }}
          />
          <AdminActionCard
            title="Purge opportunities cache"
            description="Drops memoized opportunities data. Reloads on next fetch."
            buttonLabel="Clear cache"
            tone="neutral"
            onAction={() => {
              clearOpportunitiesCache();
              loadOpportunities(true);
            }}
          />
        </div>
      </section>
    </div>
  );

  const renderSection = () => {
    switch (section) {
      case 'overview':
        return renderOverview();
      case 'goals':
        return renderGoals();
      case 'opportunities':
        return renderOpportunities();
      case 'system':
        return renderSystem();
      default:
        return null;
    }
  };

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-gray-50 text-gray-900">
        {renderNav()}
        <div className="flex-1">
          {renderHeader()}
          {renderSection()}
        </div>
      </div>
    </ToastProvider>
  );
};

interface AdminMetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
}

const AdminMetricCard: React.FC<AdminMetricCardProps> = ({ icon, label, value, helper }) => (
  <div className="rounded-2xl border border-gray-200 bg-white px-4 py-5">
    <div className="flex items-center gap-3 text-primary">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <span className="text-sm font-medium text-gray-500">{label}</span>
    </div>
    <div className="mt-3 text-2xl font-semibold text-gray-900">{value}</div>
    <p className="mt-1 text-xs text-gray-500">{helper}</p>
  </div>
);

interface AdminActionCardProps {
  title: string;
  description: string;
  buttonLabel: string;
  tone: 'danger' | 'neutral';
  onAction: () => void;
}

const AdminActionCard: React.FC<AdminActionCardProps> = ({ title, description, buttonLabel, tone, onAction }) => (
  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
    <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
    <p className="mt-2 text-sm text-gray-600">{description}</p>
    <button
      onClick={onAction}
      className={`mt-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition ${
        tone === 'danger'
          ? 'border border-red-200 text-red-600 hover:bg-red-50'
          : 'border border-gray-200 text-gray-600 hover:bg-gray-100'
      }`}
    >
      <ClipboardList size={16} />
      {buttonLabel}
    </button>
  </div>
);

export default AdminApp;

