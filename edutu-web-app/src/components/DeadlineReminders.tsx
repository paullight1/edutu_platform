import { useEffect } from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useAuth as useAppAuth } from "../hooks/useAuth";
import { getProductApiToken } from "../lib/clerkToken";
import { getDeadlines, type Deadline } from "../services/deadlines";
import {
  areRemindersEnabled,
  getNotificationPermission,
  showLocalNotification,
  REMINDERS_CHANGED_EVENT,
} from "../lib/webNotifications";

const LEDGER_PREFIX = "edutu.reminders.shown.";
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly while the app is open
const LEDGER_TTL_MS = 30 * 24 * 60 * 60 * 1000; // prune entries after 30 days

type Ledger = Record<string, number>;

function readLedger(userId: string): Ledger {
  try {
    const raw = window.localStorage.getItem(`${LEDGER_PREFIX}${userId}`);
    return raw ? (JSON.parse(raw) as Ledger) : {};
  } catch {
    return {};
  }
}

function writeLedger(userId: string, ledger: Ledger): void {
  try {
    const now = Date.now();
    const pruned: Ledger = {};
    for (const [key, at] of Object.entries(ledger)) {
      if (now - at < LEDGER_TTL_MS) pruned[key] = at;
    }
    window.localStorage.setItem(
      `${LEDGER_PREFIX}${userId}`,
      JSON.stringify(pruned),
    );
  } catch {
    // storage unavailable — reminders may repeat, which is acceptable
  }
}

/** Which reminder threshold a deadline currently falls into (one fire each). */
function reminderBucket(daysUntil: number): string | null {
  if (daysUntil < 0) return null;
  if (daysUntil === 0) return "due";
  if (daysUntil <= 1) return "1d";
  if (daysUntil <= 3) return "3d";
  if (daysUntil <= 7) return "7d";
  return null;
}

function reminderTitle(deadline: Deadline): string {
  if (deadline.daysUntil <= 0) return "Deadline is today";
  if (deadline.daysUntil === 1) return "Deadline tomorrow";
  return `Deadline in ${deadline.daysUntil} days`;
}

/**
 * Headless engine that fires on-device reminders for upcoming deadlines.
 * Runs only while signed in, reminders are enabled in Settings, and OS
 * permission is granted. De-dupes via a per-user localStorage ledger so each
 * deadline notifies at most once per threshold (7d / 3d / 1d / due).
 */
export default function DeadlineReminders() {
  const { user } = useAppAuth();
  const { getToken } = useClerkAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      if (!areRemindersEnabled() || getNotificationPermission() !== "granted") {
        return;
      }

      const token = await getProductApiToken(getToken).catch(() => null);
      if (!token || cancelled) return;

      let response;
      try {
        response = await getDeadlines(userId, token);
      } catch {
        return;
      }
      if (cancelled) return;

      const ledger = readLedger(userId);
      const deadlines = response.groups.flatMap((group) => group.deadlines);
      let changed = false;

      for (const deadline of deadlines) {
        const bucket = reminderBucket(deadline.daysUntil);
        if (!bucket) continue;
        const key = `${deadline.id}:${bucket}`;
        if (ledger[key]) continue;

        const shown = await showLocalNotification({
          title: reminderTitle(deadline),
          body: deadline.title,
          url: "/app/deadlines",
          tag: `deadline-${deadline.id}`,
        });
        if (shown) {
          ledger[key] = Date.now();
          changed = true;
        }
      }

      if (changed) writeLedger(userId, ledger);
    };

    void run();
    const intervalId = window.setInterval(run, CHECK_INTERVAL_MS);
    const onFocus = () => void run();
    window.addEventListener("focus", onFocus);
    window.addEventListener(REMINDERS_CHANGED_EVENT, onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(REMINDERS_CHANGED_EVENT, onFocus);
    };
  }, [userId, getToken]);

  return null;
}
