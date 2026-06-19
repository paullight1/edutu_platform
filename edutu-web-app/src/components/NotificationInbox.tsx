import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellRing,
  Check,
  CheckCheck,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCcw,
  Settings,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useNotifications } from "../hooks/useNotifications";
import type {
  AppNotification,
  NotificationSeverity,
} from "../types/notification";

interface NotificationInboxProps {
  isOpen: boolean;
  onClose: () => void;
}

const severityClasses: Record<NotificationSeverity, string> = {
  info: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  critical: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
};

function SeverityIcon({ severity }: { severity: NotificationSeverity }) {
  if (severity === "success") return <CheckCircle2 size={17} />;
  if (severity === "warning") return <AlertTriangle size={17} />;
  if (severity === "critical") return <XCircle size={17} />;
  return <Info size={17} />;
}

function formatNotificationTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recently";

  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatKind(kind: AppNotification["kind"]) {
  return kind
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function NotificationInbox({
  isOpen,
  onClose,
}: NotificationInboxProps) {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    hasMore,
    refresh,
    fetchMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    preferences,
    savePreferences,
  } = useNotifications();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);

  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [notifications],
  );

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyAction(key);
    setPreferenceError(null);
    try {
      await action();
    } catch (actionError) {
      setPreferenceError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update notifications right now.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const updatePreference = (
    key: "deadlineReminders" | "goalReminders" | "opportunityAlerts",
  ) => {
    if (!preferences) return;
    void runAction(`preference-${key}`, () =>
      savePreferences({
        [key]: !preferences[key],
      }),
    );
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close notifications"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-inbox-title"
        className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-950"
      >
        <div className="border-b border-slate-200 px-4 py-4 dark:border-white/10">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                  <BellRing size={17} />
                </span>
                <div>
                  <h2
                    id="notification-inbox-title"
                    className="text-base font-black text-slate-950 dark:text-white"
                  >
                    Notifications
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {unreadCount > 0
                      ? `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"}`
                      : "You are all caught up"}
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="Close notifications"
            >
              <X size={17} />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runAction("refresh", refresh)}
              disabled={busyAction === "refresh"}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
            >
              {busyAction === "refresh" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCcw size={14} />
              )}
              Refresh
            </button>
            <button
              type="button"
              onClick={() => runAction("mark-all", markAllAsRead)}
              disabled={unreadCount === 0 || busyAction === "mark-all"}
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand-500 px-3 text-xs font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === "mark-all" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CheckCheck size={14} />
              )}
              Mark all read
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <section className="border-b border-slate-200 p-4 dark:border-white/10">
            <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-950 dark:text-white">
              <Settings size={16} />
              Reminder settings
            </div>
            <div className="grid gap-2">
              {(
                [
                  ["deadlineReminders", "Deadline reminders"],
                  ["goalReminders", "Goal reminders"],
                  ["opportunityAlerts", "Opportunity alerts"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(preferences?.[key])}
                    disabled={
                      !preferences || busyAction === `preference-${key}`
                    }
                    onChange={() => updatePreference(key)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-500 focus:ring-brand-500"
                  />
                </label>
              ))}
            </div>
            {preferenceError ? (
              <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-300">
                {preferenceError}
              </p>
            ) : null}
          </section>

          {loading && sortedNotifications.length === 0 ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="animate-pulse rounded-2xl border border-slate-200 p-4 dark:border-white/10"
                >
                  <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-white/10" />
                  <div className="mt-3 h-3 w-5/6 rounded bg-slate-200 dark:bg-white/10" />
                  <div className="mt-2 h-3 w-2/3 rounded bg-slate-200 dark:bg-white/10" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                <p className="font-black">Could not load notifications</p>
                <p className="mt-1 leading-6">{error}</p>
                <button
                  type="button"
                  onClick={() => runAction("refresh-error", refresh)}
                  className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white transition hover:bg-rose-700"
                >
                  <RefreshCcw size={14} />
                  Try again
                </button>
              </div>
            </div>
          ) : sortedNotifications.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300">
                <Bell size={22} />
              </div>
              <h3 className="mt-4 text-sm font-black text-slate-950 dark:text-white">
                No notifications yet
              </h3>
              <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500 dark:text-slate-400">
                Deadline reminders, goal nudges, and opportunity alerts will
                appear here when they are available.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-white/10">
              {sortedNotifications.map((notification) => {
                const isUnread = !notification.readAt;
                return (
                  <article
                    key={notification.id}
                    className={`p-4 ${isUnread ? "bg-brand-500/[0.04]" : ""}`}
                  >
                    <div className="flex gap-3">
                      <div
                        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${severityClasses[notification.severity]}`}
                      >
                        <SeverityIcon severity={notification.severity} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                              {formatKind(notification.kind)}
                            </p>
                            <h3 className="mt-1 text-sm font-black leading-5 text-slate-950 dark:text-white">
                              {notification.title}
                            </h3>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-slate-400">
                            {formatNotificationTime(notification.createdAt)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                          {notification.body}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {isUnread ? (
                            <button
                              type="button"
                              onClick={() =>
                                runAction(`read-${notification.id}`, () =>
                                  markAsRead(notification.id),
                                )
                              }
                              disabled={
                                busyAction === `read-${notification.id}`
                              }
                              className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
                            >
                              <Check size={13} />
                              Mark read
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() =>
                              runAction(`delete-${notification.id}`, () =>
                                deleteNotification(notification.id),
                              )
                            }
                            disabled={
                              busyAction === `delete-${notification.id}`
                            }
                            className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 px-2.5 text-xs font-bold text-slate-500 transition hover:bg-slate-50 hover:text-rose-600 disabled:opacity-60 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-rose-300"
                          >
                            <Trash2 size={13} />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {hasMore && !error ? (
            <div className="p-4">
              <button
                type="button"
                onClick={() => runAction("fetch-more", fetchMore)}
                disabled={busyAction === "fetch-more"}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
              >
                {busyAction === "fetch-more" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : null}
                Load more
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
