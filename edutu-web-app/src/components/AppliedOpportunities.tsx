import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, Tag, FileText, Trash2 } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import { useAuth } from '@clerk/clerk-react';
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
}

const AppliedOpportunities: React.FC<AppliedOpportunitiesProps> = ({ onBack }) => {
  const { isDarkMode } = useDarkMode();
  const { userId } = useAuth();
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<ApplicationStatus | 'all'>('all');
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        if (!userId) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        const data = await getApplications(userId);
        setApplications(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load applications');
      } finally {
        setLoading(false);
      }
    };

    fetchApplications();
  }, [userId]);

  const filteredApplications = useMemo(() => {
    if (activeFilter === 'all') return applications;
    return applications.filter((app) => app.status === activeFilter);
  }, [applications, activeFilter]);

  const handleRemove = async (id: string) => {
    try {
      setRemovingId(id);
      await removeApplication(id);
      setApplications((prev) => prev.filter((app) => app.id !== id));
    } catch (err) {
      console.error('Failed to remove application:', err);
    } finally {
      setRemovingId(null);
    }
  };

  const handleStatusChange = async (id: string, status: ApplicationStatus) => {
    try {
      const updated = await updateApplicationStatus(id, status);
      setApplications((prev) => prev.map((app) => (app.id === id ? updated : app)));
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-900'} font-body transition-colors duration-500`}>
      <div className="fixed inset-0 pointer-events-none opacity-20 dark:opacity-10 mesh-gradient" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-24 relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className={`p-2.5 rounded-xl ${isDarkMode ? 'bg-white/10 hover:bg-white/20' : 'bg-slate-100 hover:bg-slate-200'} transition-all`}
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-2xl font-display font-bold">Applied Opportunities</h1>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {filteredApplications.length} {filteredApplications.length === 1 ? 'application' : 'applications'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide mb-6">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap border ${
                activeFilter === tab
                  ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 border-brand-500/20'
                  : `${isDarkMode ? 'bg-white/5 text-slate-400 border-transparent hover:bg-white/10' : 'bg-white text-slate-500 border-transparent hover:bg-slate-50'}`
              }`}
            >
              {tab === 'all' ? 'All' : STATUS_LABELS[tab]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`premium-card p-6 h-32 animate-pulse border-none ${isDarkMode ? 'bg-gray-900/50' : 'bg-white/50'}`}
              />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 premium-card bg-transparent border-dashed">
            <FileText size={48} className={`mx-auto ${isDarkMode ? 'text-slate-600' : 'text-slate-300'} mb-4 opacity-50`} />
            <h3 className="text-xl font-display font-bold mb-2">Error Loading Applications</h3>
            <p className={`${isDarkMode ? 'text-slate-400' : 'text-slate-500'} font-medium`}>{error}</p>
          </div>
        ) : filteredApplications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 premium-card bg-transparent border-dashed"
          >
            <FileText size={48} className={`mx-auto ${isDarkMode ? 'text-slate-600' : 'text-slate-300'} mb-4 opacity-50`} />
            <h3 className="text-xl font-display font-bold mb-2">
              {activeFilter === 'all' ? 'No Applications Yet' : `No ${STATUS_LABELS[activeFilter].toLowerCase()} applications`}
            </h3>
            <p className={`${isDarkMode ? 'text-slate-400' : 'text-slate-500'} font-medium`}>
              {activeFilter === 'all'
                ? 'Start applying to opportunities to track them here.'
                : 'Try selecting a different filter.'}
            </p>
          </motion.div>
        ) : (
          <>
            <div className="hidden md:block">
              <div className={`rounded-2xl border ${isDarkMode ? 'border-white/10' : 'border-slate-200'} overflow-hidden`}>
                <table className="w-full">
                  <thead className={`${isDarkMode ? 'bg-white/5' : 'bg-slate-50'}`}>
                    <tr>
                      <th className="text-left px-6 py-4 text-xs font-bold tracking-widest text-slate-500">Opportunity</th>
                      <th className="text-left px-6 py-4 text-xs font-bold tracking-widest text-slate-500">Category</th>
                      <th className="text-left px-6 py-4 text-xs font-bold tracking-widest text-slate-500">Status</th>
                      <th className="text-left px-6 py-4 text-xs font-bold tracking-widest text-slate-500">Applied</th>
                      <th className="text-left px-6 py-4 text-xs font-bold tracking-widest text-slate-500">Notes</th>
                      <th className="text-right px-6 py-4 text-xs font-bold tracking-widest text-slate-500">Actions</th>
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
                          <span className="font-semibold">{app.opportunity_title}</span>
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
                  className={`premium-card p-5 border-none ${isDarkMode ? 'bg-gray-900' : 'bg-white'} shadow-sm`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-semibold text-base leading-tight flex-1">{app.opportunity_title}</h3>
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
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AppliedOpportunities;
