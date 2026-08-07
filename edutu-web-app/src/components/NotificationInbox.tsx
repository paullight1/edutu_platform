import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  Bell,
  BellRing,
  Calendar,
  CheckCheck,
  Loader2,
  Lock,
  PhoneCall,
  PhoneMissed,
  RefreshCcw,
  Settings,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../hooks/useNotifications";
import type { AppNotification } from "../types/notification";
import { safeInternalAppPath } from "../features/community-calls/deepLinks";

interface NotificationInboxProps {
  isOpen?: boolean;
  onClose?: () => void;
  /**
   * "modal" (default) renders the slide-over dialog used from the dashboard.
   * "page" renders the same content as a full route (used by /app/notifications).
   */
  variant?: "modal" | "page";
}

type NotificationFilter = "all" | "unread";

/**
 * Kind → icon + accent color, mirroring the mobile app's notification list
 * (edutumobile/app/(app)/notifications.tsx). Keyed as string because some
 * kinds (e.g. "opportunity-alert") arrive from push payloads beyond the
 * web NotificationKind union.
 */
const KIND_ICONS: Record<string, { Icon: LucideIcon; color: string }> = {
  "goal-reminder": { Icon: Target, color: "#6366f1" },
  "goal-weekly-digest": { Icon: Calendar, color: "#4f46e5" },
  "goal-progress": { Icon: Award, color: "#10b981" },
  "opportunity-highlight": { Icon: Users, color: "#3b82f6" },
  "opportunity-alert": { Icon: BellRing, color: "#10b981" },
  "community-call-reminder": { Icon: PhoneCall, color: "#2563eb" },
  "community-call-started": { Icon: PhoneCall, color: "#10b981" },
  "community-call-missed": { Icon: PhoneMissed, color: "#ef4444" },
  "admin-broadcast": { Icon: AlertTriangle, color: "#f59e0b" },
  system: { Icon: Lock, color: "#2563EB" },
};

function KindIcon({ kind }: { kind: AppNotification["kind"] }) {
  const mapping = KIND_ICONS[kind];
  if (!mapping) {
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-text-muted">
        <Bell size={18} />
      </span>
    );
  }
  const { Icon, color } = mapping;
  return (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      <Icon size={18} />
    </span>
  );
}

/** Compact relative timestamp: "Just now", "5m ago", "2h ago", "3d ago". */
function formatNotificationTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "Recently";

  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function ToggleSwitch({
  checked,
  disabled,
  onToggle,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? "bg-brand" : "border border-subtle bg-surface-elevated"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-soft transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
        aria-hidden="true"
      />
    </button>
  );
}

export default function NotificationInbox({
  isOpen = true,
  onClose,
  variant = "modal",
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
  const navigate = useNavigate();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [notifications],
  );

  const visibleNotifications = useMemo(
    () =>
      filter === "unread"
        ? sortedNotifications.filter((notification) => !notification.readAt)
        : sortedNotifications,
    [filter, sortedNotifications],
  );

  const runAction = async (key: string, action: () => Promise<void>) => {
    setBusyAction(key);
    setActionError(null);
    try {
      await action();
    } catch (caughtError) {
      setActionError(
        caughtError instanceof Error
          ? caughtError.message
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

  const openNotification = (notification: AppNotification) => {
    if (!notification.readAt) {
      void runAction(`read-${notification.id}`, () =>
        markAsRead(notification.id),
      );
    }
    // Alert-style notifications deep-link to their target via metadata.url —
    // same contract as the mobile app and push payloads.
    const rawUrl = notification.metadata?.url;
    const url = safeInternalAppPath(rawUrl, "");
    if (url) {
      if (variant === "modal") {
        onClose?.();
      }
      navigate(url);
    }
  };

  if (variant === "modal" && !isOpen) {
    return null;
  }

  const body = (
    <>
      <div className="border-b border-subtle px-4 pb-4 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <BellRing size={17} />
            </span>
            <div className="min-w-0">
              <h2
                id="notification-inbox-title"
                className="text-base font-semibold text-text-primary"
              >
                Notifications
              </h2>
              <p className="text-sm text-text-muted">
                {unreadCount > 0
                  ? `${unreadCount} unread alert${unreadCount === 1 ? "" : "s"}`
                  : "You are all caught up"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-expanded={settingsOpen}
              aria-controls="notification-reminder-settings"
              aria-label="Reminder settings"
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition hover:bg-surface-elevated hover:text-text-primary ${
                settingsOpen
                  ? "bg-brand/10 text-brand"
                  : "text-text-muted"
              }`}
            >
              <Settings size={17} />
            </button>
            {variant === "modal" ? (
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition hover:bg-surface-elevated hover:text-text-primary"
                aria-label="Close notifications"
              >
                <X size={17} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => runAction("refresh", refresh)}
            disabled={busyAction === "refresh"}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-subtle px-2.5 text-xs font-semibold text-text-secondary transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === "refresh" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCcw size={13} />
            )}
            Refresh
          </button>
          <button
            type="button"
            onClick={() => runAction("mark-all", markAllAsRead)}
            disabled={unreadCount === 0 || busyAction === "mark-all"}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-subtle px-2.5 text-xs font-semibold text-text-secondary transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busyAction === "mark-all" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <CheckCheck size={13} />
            )}
            Mark all read
          </button>
        </div>

        <div className="mt-3 flex rounded-xl bg-surface-elevated p-1">
          {(
            [
              ["all", "All"],
              ["unread", `Unread (${unreadCount})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${
                filter === key
                  ? "bg-surface-layer text-text-primary shadow-soft"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {actionError ? (
          <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs font-semibold text-danger">
            {actionError}
          </p>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        {settingsOpen ? (
          <section
            id="notification-reminder-settings"
            className="border-b border-subtle p-4"
          >
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text-primary">
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
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-subtle bg-surface-elevated px-3 py-2.5 text-sm font-semibold text-text-secondary"
                >
                  <span>{label}</span>
                  <ToggleSwitch
                    checked={Boolean(preferences?.[key])}
                    disabled={!preferences || busyAction === `preference-${key}`}
                    onToggle={() => updatePreference(key)}
                    label={label}
                  />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {loading && sortedNotifications.length === 0 ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="animate-pulse rounded-2xl border border-subtle p-4"
              >
                <div className="h-3 w-1/3 rounded bg-surface-elevated" />
                <div className="mt-3 h-3 w-5/6 rounded bg-surface-elevated" />
                <div className="mt-2 h-3 w-2/3 rounded bg-surface-elevated" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-4">
            <div className="rounded-2xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              <p className="font-semibold">Could not load notifications</p>
              <p className="mt-1 leading-6">{error}</p>
              <button
                type="button"
                onClick={() => runAction("refresh-error", refresh)}
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl bg-danger px-3 text-xs font-semibold text-white transition hover:bg-danger/90"
              >
                <RefreshCcw size={14} />
                Try again
              </button>
            </div>
          </div>
        ) : visibleNotifications.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-brand">
              <Bell size={26} />
            </div>
            <h3 className="mt-4 text-base font-bold text-text-primary">
              {filter === "unread"
                ? "No unread notifications"
                : "No notifications yet"}
            </h3>
            <p className="mt-2 max-w-xs text-sm leading-6 text-text-muted">
              {filter === "unread"
                ? "You are all caught up."
                : "Deadline reminders and opportunity alerts will appear here."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {visibleNotifications.map((notification) => {
              const isUnread = !notification.readAt;
              return (
                <article
                  key={notification.id}
                  className={`group relative ${isUnread ? "bg-brand/5" : ""}`}
                >
                  {isUnread ? (
                    <span
                      className="absolute bottom-4 left-0 top-4 w-[3px] rounded-r-full bg-brand"
                      aria-hidden="true"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className="flex w-full gap-3 p-4 pr-12 text-left transition hover:bg-surface-elevated/60"
                  >
                    <KindIcon kind={notification.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h3
                          className={`line-clamp-1 min-w-0 flex-1 text-sm font-bold leading-5 ${
                            isUnread
                              ? "text-text-primary"
                              : "text-text-secondary"
                          }`}
                        >
                          {notification.title}
                        </h3>
                        <span className="shrink-0 text-2xs font-semibold text-text-muted">
                          {formatNotificationTime(notification.createdAt)}
                        </span>
                      </div>
                      <p
                        className={`mt-1 line-clamp-2 text-sm leading-5 ${
                          isUnread ? "text-text-secondary" : "text-text-muted"
                        }`}
                      >
                        {notification.body}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      runAction(`delete-${notification.id}`, () =>
                        deleteNotification(notification.id),
                      )
                    }
                    disabled={busyAction === `delete-${notification.id}`}
                    aria-label="Delete notification"
                    className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-danger transition hover:bg-danger/10 disabled:opacity-60 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                  >
                    {busyAction === `delete-${notification.id}` ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
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
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-subtle text-sm font-bold text-text-secondary transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === "fetch-more" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : null}
              Load more
            </button>
          </div>
        ) : null}
      </div>
    </>
  );

  if (variant === "page") {
    return (
      <div className="min-h-[100dvh] bg-surface-body">
        <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-2xl flex-col px-4 py-5 sm:px-6">
          <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-soft">
            {body}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 px-4 py-6">
      <button
        type="button"
        className="absolute inset-0 bg-surface-overlay backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close notifications"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-inbox-title"
        className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border border-subtle bg-surface-layer shadow-elevated"
      >
        {body}
      </aside>
    </div>
  );
}
