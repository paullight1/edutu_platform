import React, { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, AlertCircle, Bookmark, Send, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDarkMode } from '../hooks/useDarkMode';
import { getDeadlines, type Deadline, type DeadlineGroup, type GroupedDeadlines, type DeadlinesSummary } from '../services/deadlines';
import LoadingFallback from './ui/LoadingFallback';

interface DeadlinesScreenProps {
  userId: string;
  onBack: () => void;
  onSelectDeadline: (deadline: Deadline) => void;
}

const urgencyConfig = {
  critical: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-200 dark:border-red-800',
    badge: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400',
    text: 'text-red-600 dark:text-red-400',
    icon: 'text-red-500'
  },
  soon: {
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-800',
    badge: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400',
    text: 'text-amber-600 dark:text-amber-400',
    icon: 'text-amber-500'
  },
  upcoming: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-200 dark:border-blue-800',
    badge: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400',
    text: 'text-blue-600 dark:text-blue-400',
    icon: 'text-blue-500'
  },
  later: {
    bg: 'bg-gray-50 dark:bg-gray-800/50',
    border: 'border-gray-200 dark:border-gray-700',
    badge: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    text: 'text-gray-600 dark:text-gray-400',
    icon: 'text-gray-500'
  }
};

const typeIcons = {
  bookmark: Bookmark,
  application: Send,
  goal: Target
};

const typeLabels = {
  bookmark: 'Bookmark',
  application: 'Application',
  goal: 'Goal'
};

const DeadlinesScreen: React.FC<DeadlinesScreenProps> = ({ userId, onBack, onSelectDeadline }) => {
  const { isDarkMode } = useDarkMode();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<GroupedDeadlines[]>([]);
  const [summary, setSummary] = useState<DeadlinesSummary | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<DeadlineGroup>>(new Set());

  useEffect(() => {
    const loadDeadlines = async () => {
      try {
        const data = await getDeadlines(userId);
        setGroups(data.groups);
        setSummary(data.summary);
      } catch (error) {
        console.error('Failed to load deadlines:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDeadlines();
  }, [userId]);

  const toggleGroup = (group: DeadlineGroup) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDaysText = (days: number) => {
    if (days < 0) return 'Passed';
    if (days === 0) return 'Today';
    if (days === 1) return '1 day';
    return `${days} days`;
  };

  if (loading) {
    return <LoadingFallback message="Loading deadlines..." fullScreen={false} />;
  }

  if (!summary || summary.total === 0) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-950">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
            Back
          </button>
        </div>
        <div className="flex flex-col items-center justify-center py-32 px-6">
          <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-6">
            <Calendar size={32} className="text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No deadlines yet</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
            Bookmark opportunities or set goals to track important deadlines here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Deadlines</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{summary.total} total deadlines</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{summary.total}</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-950/30 rounded-xl p-3">
            <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">This Week</p>
            <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{summary.thisWeek}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-3">
            <p className="text-xs text-red-600 dark:text-red-400 mb-1">Critical</p>
            <p className="text-xl font-bold text-red-700 dark:text-red-300">{summary.critical}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {groups.map((groupData, index) => {
          if (groupData.deadlines.length === 0) return null;

          const isCollapsed = collapsedGroups.has(groupData.group);
          const config = urgencyConfig[
            groupData.deadlines[0].urgency === 'critical' ? 'critical' :
            groupData.group === 'This Week' ? 'soon' :
            groupData.group === 'Next Week' ? 'upcoming' : 'later'
          ];

          return (
            <motion.div
              key={groupData.group}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <button
                onClick={() => toggleGroup(groupData.group)}
                className="w-full flex items-center justify-between mb-3"
              >
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">{groupData.group}</h2>
                  <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
                    {groupData.deadlines.length}
                  </span>
                </div>
                {isCollapsed ? (
                  <ChevronDown size={20} className="text-gray-400" />
                ) : (
                  <ChevronUp size={20} className="text-gray-400" />
                )}
              </button>

              <AnimatePresence>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3 overflow-hidden"
                  >
                    {groupData.deadlines.map((deadline) => {
                      const urgencyStyle = urgencyConfig[deadline.urgency];
                      const TypeIcon = typeIcons[deadline.type];

                      return (
                        <motion.div
                          key={deadline.id}
                          layout
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => onSelectDeadline(deadline)}
                          className={`${urgencyStyle.bg} ${urgencyStyle.border} border rounded-xl p-4 cursor-pointer transition-all hover:shadow-md`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-lg ${urgencyStyle.badge} mt-1`}>
                              <TypeIcon size={16} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="font-medium text-gray-900 dark:text-white truncate">
                                {deadline.title}
                              </h3>
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className={`px-2 py-0.5 text-xs font-medium rounded ${urgencyStyle.badge}`}>
                                  {typeLabels[deadline.type]}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {deadline.category}
                                </span>
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className={`text-sm font-semibold ${urgencyStyle.text}`}>
                                {getDaysText(deadline.daysUntil)}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {formatDate(deadline.deadline)}
                              </div>
                              {deadline.urgency === 'critical' && (
                                <AlertCircle size={14} className="text-red-500 mt-1 ml-auto" />
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default DeadlinesScreen;
