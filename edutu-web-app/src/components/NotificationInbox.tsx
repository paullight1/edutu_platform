import React, { useMemo, useState } from 'react';
import {
  X,
  Bell,
  Award,
  Calendar,
  Target,
  Users,
  CheckCircle,
  Trash2,
  MailSearch as MarkEmailRead,
  AlertTriangle,
  Zap
} from 'lucide-react';
import Button from './ui/Button';
import { useDarkMode } from '../hooks/useDarkMode';
import { useNotifications } from '../hooks/useNotifications';
import type { AppNotification } from '../types/notification';

interface NotificationInboxProps {
  isOpen: boolean;
  onClose: () => void;
}

const NotificationInbox: React.FC<NotificationInboxProps> = ({ isOpen, onClose }) => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const {
    notifications,
    unreadCount,
    loading,
    error,
    hasMore,
    fetchMore,
    markAsRead,
    markAllAsRead,
    deleteNotification
  } = useNotifications();
  const { isDarkMode } = useDarkMode();

  const filteredNotifications = useMemo(
    () =>
      notifications.filter((notification) =>
        filter === 'unread' ? !notification.readAt : true
      ),
    [filter, notifications]
  );

  const formatTimestamp = (iso: string) => {
    if (!iso) return 'Just now';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.round(diffMs / (1000 * 60));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
    return date.toLocaleString();
  };

  const iconForNotification = (kind: AppNotification['kind'], severity: AppNotification['severity']) => {
    switch (kind) {
      case 'goal-reminder':
        return <Target size={16} className="text-primary" />;
      case 'goal-weekly-digest':
        return <Calendar size={16} className="text-indigo-500" />;
      case 'goal-progress':
        return <Award size={16} className="text-emerald-500" />;
      case 'opportunity-highlight':
        return <Users size={16} className="text-purple-500" />;
      case 'admin-broadcast':
        return <AlertTriangle size={16} className="text-amber-500" />;
      default:
        return severity === 'critical'
          ? <Zap size={16} className="text-red-500" />
          : <Bell size={16} className="text-gray-600" />;
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4 md:p-6 pointer-events-none">
      <div className="absolute inset-0 bg-gray-950/20 dark:bg-black/60 backdrop-blur-[2px] pointer-events-auto" onClick={onClose} />

      <div className={`relative w-full max-w-md h-[80vh] flex flex-col rounded-[2.5rem] border shadow-2xl transition-all duration-500 transform pointer-events-auto animate-slide-in-right ${isDarkMode ? 'border-white/10 bg-gray-900/90' : 'border-slate-200/50 bg-white/90'
        } backdrop-blur-2xl`}>

        {/* Header */}
        <div className={`p-6 border-b ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-brand-500/10 flex items-center justify-center text-brand-500">
                <Bell size={22} className="animate-bounce-subtle" />
              </div>
              <div>
                <h2 className={`text-xl font-display font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Notifications</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <p className={`text-xs font-medium tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {unreadCount} Unread Message{unreadCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-xl p-2 transition-all hover:scale-110 ${isDarkMode ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-white/5">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === 'all'
                ? 'bg-white dark:bg-gray-800 text-brand-500 shadow-sm'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === 'unread'
                ? 'bg-white dark:bg-gray-800 text-brand-500 shadow-sm'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
            >
              Unread
            </button>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => void markAllAsRead()}
              className="text-[10px] font-bold text-brand-500 hover:text-brand-600 tracking-widest px-2 py-1"
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="space-y-4 py-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`notification-skeleton-${index}`}
                  className={`animate-pulse rounded-2xl p-4 border aspect-[4/1] ${isDarkMode ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50/50'}`}
                />
              ))}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-40 grayscale">
              <div className="h-16 w-16 rounded-3xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-4">
                <MarkEmailRead size={32} />
              </div>
              <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                No New Notifications
              </h3>
              <p className="text-xs font-medium text-slate-400 mt-1 tracking-tighter">
                You are all caught up for now
              </p>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {filteredNotifications.map((notification, index) => (
                <div
                  key={notification.id}
                  className={`group relative overflow-hidden rounded-2xl p-4 transition-all duration-300 transform active:scale-[0.98] cursor-pointer ${notification.readAt
                    ? `${isDarkMode ? 'bg-white/5 text-slate-400' : 'bg-slate-50 text-slate-500'}`
                    : `${isDarkMode ? 'bg-brand-500/10 border border-brand-500/20' : 'bg-brand-50 border border-brand-500/10'}`
                    } hover:shadow-xl hover:shadow-brand-500/5`}
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => void markAsRead(notification.id)}
                >
                  {/* Read Indicator Line */}
                  {!notification.readAt && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-500" />
                  )}

                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-110 ${isDarkMode ? 'bg-white/5' : 'bg-white shadow-sm'
                        }`}
                    >
                      {iconForNotification(notification.kind, notification.severity)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className={`text-sm font-bold truncate ${!notification.readAt && (isDarkMode ? 'text-white' : 'text-slate-900')}`}>
                          {notification.title}
                        </h4>
                        <span className="text-[10px] font-bold text-slate-400 tracking-tighter shrink-0 pt-0.5">
                          {formatTimestamp(notification.createdAt)}
                        </span>
                      </div>
                      <p className={`mt-1 text-xs leading-relaxed line-clamp-2 ${!notification.readAt && (isDarkMode ? 'text-slate-300' : 'text-slate-600')}`}>
                        {notification.body}
                      </p>

                      {/* Action Hooks */}
                      <div className="mt-3 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
                        {!notification.readAt && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void markAsRead(notification.id);
                            }}
                            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                          >
                            <CheckCircle size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteNotification(notification.id);
                          }}
                          className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[10px] font-bold text-rose-500 tracking-widest text-center">
            Error: {error}
          </div>
        )}

        {/* Footer */}
        <div className={`p-6 border-t ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}>
          {hasMore ? (
            <Button
              variant="secondary"
              onClick={() => void fetchMore()}
              className="w-full rounded-2xl font-bold text-xs py-3 h-auto"
            >
              Older Notifications
            </Button>
          ) : (
            <div className={`flex items-center justify-center gap-2 text-[10px] font-bold tracking-widest ${isDarkMode ? 'text-late-500' : 'text-slate-400'}`}>
              <Zap size={10} className="text-amber-500" />
              Fully Synced
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationInbox;
