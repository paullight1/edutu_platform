import { useEffect, useState } from "react";
import {
  areRemindersEnabled,
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
  setRemindersEnabled,
  showLocalNotification,
  type NotificationPermissionState,
} from "../lib/webNotifications";

export default function ReminderSettings() {
  const [permission, setPermission] =
    useState<NotificationPermissionState>("default");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPermission(getNotificationPermission());
    setEnabled(areRemindersEnabled());
  }, []);

  const supported = isNotificationSupported();
  const on = enabled && permission === "granted";

  const handleToggle = async () => {
    if (busy) return;

    if (on) {
      setRemindersEnabled(false);
      setEnabled(false);
      return;
    }

    setBusy(true);
    try {
      let current = getNotificationPermission();
      if (current === "default") {
        current = await requestNotificationPermission();
        setPermission(current);
      }

      if (current === "granted") {
        setRemindersEnabled(true);
        setEnabled(true);
        void showLocalNotification({
          title: "Reminders on",
          body: "We'll nudge you before your deadlines.",
          url: "/app/deadlines",
          tag: "reminders-enabled",
        });
      } else {
        setRemindersEnabled(false);
        setEnabled(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const statusLine = !supported
    ? "Not supported on this device"
    : permission === "denied"
      ? "Blocked — enable notifications for Edutu in your browser settings"
      : on
        ? "On — you'll be notified 7, 3 and 1 days before each deadline"
        : "Get a heads-up before your saved deadlines";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Deadline reminders"
      disabled={busy || !supported || permission === "denied"}
      onClick={handleToggle}
      className="flex min-h-11 w-full items-center gap-4 px-4 py-3 text-left transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text-primary">Deadline reminders</span>
        <span className="mt-0.5 block truncate text-xs text-text-muted">{statusLine}</span>
      </span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
          on ? "border-brand bg-brand" : "border-subtle bg-surface-elevated"
        }`}
        aria-hidden="true"
      >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
              on ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
      </span>
    </button>
  );
}
