import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, ChevronRight, FileText, RefreshCw, Send, Tag, Trash2 } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '@clerk/clerk-react';
import Button from './ui/Button';
import Card from './ui/Card';
import { useToast } from './ui/ToastProvider';
import {
  getApplications,
  removeApplication,
  updateApplicationStatus,
  type ApplicationRecord,
  type ApplicationStatus,
} from '../services/applications';

const STATUS_COLORS: Record<ApplicationStatus, { bg: string; text: string; darkBg: string; darkText: string }> = {
  draft: {
    bg: 'bg-gray-100',
    text: 'text-gray-700',
    darkBg: 'dark:bg-gray-800',
    darkText: 'dark:text-gray-300',
  },
  submitted: {
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    darkBg: 'dark:bg-blue-900/30',
    darkText: 'dark:text-blue-400',
  },
  under_review: {
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    darkBg: 'dark:bg-purple-900/30',
    darkText: 'dark:text-purple-400',
  },
  accepted: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    darkBg: 'dark:bg-green-900/30',
    darkText: 'dark:text-green-400',
  },
  rejected: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    darkBg: 'dark:bg-red-900/30',
    darkText: 'dark:text-red-400',
  },
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under Review',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

const FILTER_TABS: (ApplicationStatus | 'all')[] = ['all', 'submitted', 'under_review', 'accepted', 'rejected'];

interface AppliedOpportunitiesProps {
  onBack: () => void;
  onExplore?: () => void;
}

const AppliedOpportunities: React.FC<AppliedOpportunitiesProps> = ({ onBack, onExplore }) => {
  const { isDarkMode } = useDarkMode();
  const { userId, getToken } = useAuth();
  const { success, error: showError } = useToast();
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<ApplicationStatus | 'all'>('all');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadApplications = async () => {
    if (!userId) {
      setApplications([]);
      return;
    }

    const token = await getToken().catch(() => null);
    const data = await getApplications(userId, token);
    setApplications(data);
  };

  useEffect(() => {
    let active = true;

    const init = async () => {
      setLoading(true);
      await loadApplications();
      if (active) setLoading(false);
    };

    void init();

    return () => {
      active = false;
    };
  }, [userId, getToken]);

  const filteredApplications = useMemo(() => {
    if (activeFilter === 'all') return applications;
    return applications.filter((app) => app.status === activeFilter);
  }, [applications, activeFilter]);

  const handleRemove = async (id: string) => {
    try {
      setRemovingId(id);
      const token = await getToken().catch(() => null);
      await removeApplication(id, token);
      setApplications((prev) => prev.filter((app) => app.id !== id));
      success('Application removed');
    } catch (err) {
      console.error('Failed to remove application:', err);
      showError('Unable to remove application');
    } finally {
      setRemovingId(null);
    }
  };

  const handleStatusChange = async (id: string, status: ApplicationStatus) => {
    try {
      const token = await getToken().catch(() => null);
      const updated = await updateApplicationStatus(id, status, token);
      setApplications((prev) => prev.map((app) => (app.id === id ? { ...app, ...updated } : app)));
      success('Application status updated');
    } catch (err) {
      console.error('Failed to update status:', err);
      showError('Unable to update application status');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadApplications();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className={`min-h-screen pb-24 ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-950'}`}>
      <header className="sticky top-0 z-10 bg-slate-50/95 px-4 py-3 backdrop-blur dark:bg-gray-950/95">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Button
            variant="secondary"
            onClick={onBack}
            className="h-11 w-11 rounded-full border-0 bg-white p-0 shadow-sm dark:bg-white/10"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black tracking-tight">Applied Opportunities</h1>
            <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {applications.length} tracked {applications.length === 1 ? 'application' : 'applications'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className={`flex h-11 w-11 items-center justify-center rounded-full shadow-sm transition ${
              isDarkMode ? 'bg-white/10 text-slate-300' : 'bg-white text-slate-600'
            } disabled:opacity-60`}
            aria-label="Refresh applications"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-4">
        <section className={`rounded-[20px] p-4 shadow-sm ${isDarkMode ? 'bg-white/6' : 'bg-white'}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-brand-500 text-white shadow-lg shadow-brand-500/20">
              <Send size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-black">Application tracker</h2>
              <p className={`mt-0.5 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Opportunities you open through Apply Now are tracked here.
              </p>
            </div>
          </div>
        </section>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveFilter(tab)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition whitespace-nowrap ${
                activeFilter === tab
                  ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                  : isDarkMode
                    ? 'bg-white/6 text-slate-400 hover:text-white'
                    : 'bg-white text-slate-500 shadow-sm hover:text-slate-950'
              }`}
            >
              {tab === 'all' ? 'All' : STATUS_LABELS[tab]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className={`h-36 animate-pulse rounded-[20px] ${isDarkMode ? 'bg-white/6' : 'bg-white'}`}
              />
            ))}
          </div>
        ) : filteredApplications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-[20px] px-6 py-16 text-center shadow-sm ${isDarkMode ? 'bg-white/6' : 'bg-white'}`}
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-brand-500/10 text-brand-500">
              <FileText size={30} />
            </div>
            <h3 className="mt-5 text-lg font-black">
              {activeFilter === 'all' ? 'No applications yet' : `No ${STATUS_LABELS[activeFilter].toLowerCase()} applications`}
            </h3>
            <p className={`mx-auto mt-2 max-w-sm text-sm leading-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {activeFilter === 'all'
                ? 'Click Apply Now on an opportunity to track your submission status here.'
                : 'Try selecting a different filter.'}
            </p>
            <Button onClick={onExplore ?? onBack} className="mt-6 rounded-full px-5">
              Explore opportunities
            </Button>
          </motion.div>
        ) : (
          <>
            <div className="hidden md:block">
              <div className={`overflow-hidden rounded-[20px] shadow-sm ${isDarkMode ? 'bg-white/6' : 'bg-white'}`}>
                <table className="w-full">
                  <thead className={`${isDarkMode ? 'bg-white/5' : 'bg-slate-50'}`}>
                    <tr>
                      <th className="text-left px-6 py-4 text-xs font-black tracking-widest text-slate-500">Opportunity</th>
                      <th className="text-left px-6 py-4 text-xs font-black tracking-widest text-slate-500">Category</th>
                      <th className="text-left px-6 py-4 text-xs font-black tracking-widest text-slate-500">Status</th>
                      <th className="text-left px-6 py-4 text-xs font-black tracking-widest text-slate-500">Applied</th>
                      <th className="text-left px-6 py-4 text-xs font-black tracking-widest text-slate-500">Notes</th>
                      <th className="text-right px-6 py-4 text-xs font-black tracking-widest text-slate-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDarkMode ? 'divide-white/5' : 'divide-slate-100'}`}>
                    {filteredApplications.map((app, index) => (
                      <motion.tr
                        key={app.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'} transition-colors`}
                      >
                        <td className="px-6 py-4">
                          <span className="font-black">{app.opportunity_title}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <Tag size={14} className="text-slate-400" />
                            <span className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{app.opportunity_category}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={app.status}
                            onChange={(e) => handleStatusChange(app.id, e.target.value as ApplicationStatus)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${STATUS_COLORS[app.status].bg} ${STATUS_COLORS[app.status].text} ${STATUS_COLORS[app.status].darkBg} ${STATUS_COLORS[app.status].darkText} ${isDarkMode ? 'border-white/10' : 'border-transparent'} cursor-pointer`}
                          >
                            {(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((status) => (
                              <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={14} className="text-slate-400" />
                            <span className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{formatDate(app.applied_at)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-400'} line-clamp-1`}>
                            {app.notes || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleRemove(app.id)}
                            disabled={removingId === app.id}
                            className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-red-900/30 text-slate-500 hover:text-red-400' : 'hover:bg-red-50 text-slate-400 hover:text-red-600'} transition-colors disabled:opacity-50`}
                            title="Remove application"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="md:hidden space-y-3">
              {filteredApplications.map((app, index) => (
                <motion.div
                  key={app.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="border-0 bg-white p-4 shadow-sm dark:bg-white/6">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-black text-base leading-tight flex-1">{app.opportunity_title}</h3>
                    <button
                      onClick={() => handleRemove(app.id)}
                      disabled={removingId === app.id}
                      className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-red-900/30 text-slate-600 hover:text-red-400' : 'hover:bg-red-50 text-slate-400 hover:text-red-600'} transition-colors disabled:opacity-50 shrink-0`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <div className="flex items-center gap-1.5">
                      <Tag size={12} className="text-slate-400" />
                      <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{app.opportunity_category}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-slate-400" />
                      <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{formatDate(app.applied_at)}</span>
                    </div>
                  </div>

                  <select
                    value={app.status}
                    onChange={(e) => handleStatusChange(app.id, e.target.value as ApplicationStatus)}
                    className={`w-full px-3 py-2 rounded-lg text-xs font-bold border ${STATUS_COLORS[app.status].bg} ${STATUS_COLORS[app.status].text} ${STATUS_COLORS[app.status].darkBg} ${STATUS_COLORS[app.status].darkText} ${isDarkMode ? 'border-white/10' : 'border-transparent'} cursor-pointer`}
                  >
                    {(Object.keys(STATUS_LABELS) as ApplicationStatus[]).map((status) => (
                      <option key={status} value={status}>{STATUS_LABELS[status]}</option>
                    ))}
                  </select>

                  {app.notes && (
                    <p className={`mt-3 text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'} line-clamp-2`}>
                      {app.notes}
                    </p>
                  )}
                  </Card>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default AppliedOpportunities;
