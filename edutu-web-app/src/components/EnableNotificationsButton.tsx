import { Bell, Loader2 } from "lucide-react";
import { useWebPush } from "../hooks/useWebPush";

/**
 * One-tap opt-in for browser push reminders. Renders only when web push is
 * supported, configured (VAPID key present), not blocked, and not already
 * subscribed — so it quietly disappears once enabled or where push can't work.
 *
 * Subscription itself lives in `useWebPush` → `src/lib/webPush.ts`; this is
 * only a trigger surface, invoked from a real click (browsers require a user
 * gesture for the permission prompt).
 */
export default function EnableNotificationsButton({
  className = "",
}: {
  className?: string;
}) {
  const { state, busy, enable } = useWebPush();

  if (
    state === null ||
    state === "unsupported" ||
    state === "unconfigured" ||
    state === "denied" ||
    state === "subscribed"
  ) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => void enable()}
      disabled={busy}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-subtle px-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated disabled:opacity-60 ${className}`}
    >
      {busy ? (
        <Loader2 size={15} className="animate-spin" />
      ) : (
        <Bell size={15} />
      )}
      Enable reminders
    </button>
  );
}
