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
  MailSearch,
  AlertTriangle,
  Sparkles
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
    () => notifications.filter((notification) => filter === 'unread' ? !notification.readAt : true),
    [filter, notifications]
  );

  const formatTimestamp = (iso: string) => {
    if (!iso) return 'Now';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Now';
    const minutes = Math.round((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return 'Now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  };

  const iconForNotification = (kind: AppNotification['kind'], severity: AppNotification['severity']) => {
    const className = severity === 'critical' ? 'text-rose-500' : 'text-brand-500';
    switch (kind) {
      case 'goal-reminder':
        return <Target size={17} className={className} />;
      case 'goal-weekly-digest':
        return <Calendar size={17} className={className} />;
      case 'goal-progress':
        return <Award size={17} className="text-emerald-500" />;
      case 'opportunity-highlight':
        return <Users size={17} className="text-sky-500" />;
      case 'admin-broadcast':
        return <AlertTriangle size={17} className="text-amber-500" />;
      default:
        return <Bell size={17} className={className} />;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 px-3 pb-3 pt-12 backdrop-blur-sm sm:items-start sm:justify-end sm:p-5">
      <button type="button" aria-label="Close notifications" className="absolute inset-0 cursor-default" onClick={onClose} />

      <section
        className={`relative flex h-[82vh] w-full max-w-md flex-col overflow-hidden rounded-[20px] shadow-2xl ${
          isDarkMode ? 'bg-gray-950 text-white' : 'bg-slate-50 text-slate-950'
        }`}
      >
        <header className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[18px] bg-brand-500 text-white shadow-lg shadow-brand-500/20">
              <Bell size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Notifications</h2>
              <p className={`text-xs font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {unreadCount > 0 ? `${unreadCount} unread` : 'You are up to date'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              isDarkMode ? 'bg-white/8 text-slate-300 hover:bg-white/12' : 'bg-white text-slate-500 hover:bg-slate-100'
            }`}
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex items-center justify-between gap-3 px-5 pb-3">
          <div className={`flex rounded-full p-1 ${isDarkMode ? 'bg-white/8' : 'bg-white shadow-sm'}`}>
            {(['all', 'unread'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={`rounded-full px-4 py-2 text-xs font-bold capitalize transition ${
                  filter === item
                    ? 'bg-brand-500 text-white shadow-sm'
                    : isDarkMode
                      ? 'text-slate-400 hover:text-white'
                      : 'text-slate-500 hover:text-slate-950'
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              className="text-xs font-bold text-brand-500"
            >
              Mark all read
            </button>
          )}
        </div>

        {error && (
          <div className="mx-5 mb-3 rounded-[18px] bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-600 dark:text-amber-300">
            We could not refresh notifications. Try again in a moment.
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className={`h-20 animate-pulse rounded-[20px] ${isDarkMode ? 'bg-white/8' : 'bg-white'}`}
                />
              ))}
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center">
              <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] ${isDarkMode ? 'bg-white/8' : 'bg-white'}`}>
                <MailSearch size={30} className="text-brand-500" />
              </div>
              <h3 className="text-base font-black">No notifications yet</h3>
              <p className={`mt-1 max-w-56 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Updates about opportunities, goals, and reminders will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notification) => (
                <article
                  key={notification.id}
                  className={`rounded-[20px] p-4 ${
                    notification.readAt
                      ? isDarkMode ? 'bg-white/6' : 'bg-white'
                      : isDarkMode ? 'bg-brand-500/12' : 'bg-brand-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void markAsRead(notification.id)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[16px] ${isDarkMode ? 'bg-white/8' : 'bg-white'}`}>
                      {iconForNotification(notification.kind, notification.severity)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="line-clamp-1 text-sm font-black">{notification.title}</h4>
                        <span className={`shrink-0 text-xs font-bold ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {formatTimestamp(notification.createdAt)}
                        </span>
                      </div>
                      <p className={`mt-1 line-clamp-2 text-sm leading-5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {notification.body}
                      </p>
                    </div>
                  </button>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    {!notification.readAt && (
                      <button
                        type="button"
                        onClick={() => void markAsRead(notification.id)}
                        className="flex h-8 items-center gap-1 rounded-full bg-emerald-500/10 px-3 text-xs font-bold text-emerald-500"
                      >
                        <CheckCircle size={13} />
                        Read
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void deleteNotification(notification.id)}
                      className="flex h-8 items-center gap-1 rounded-full bg-rose-500/10 px-3 text-xs font-bold text-rose-500"
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {hasMore && (
          <footer className="px-5 pb-5">
            <Button variant="secondary" onClick={() => void fetchMore()} className="h-11 w-full rounded-[18px]">
              <Sparkles size={15} className="mr-2" />
              Load more
            </Button>
          </footer>
        )}
      </section>
    </div>
  );
};

export default NotificationInbox;
