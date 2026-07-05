import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useAuth as useAppAuth } from "../hooks/useAuth";
import {
  getWebPushState,
  subscribeToWebPush,
  type WebPushState,
} from "../lib/webPush";

/**
 * One-tap opt-in for browser push reminders. Renders only when web push is
 * supported, configured (VAPID key present), and not already subscribed — so it
 * quietly disappears once enabled or where push can't work.
 */
export default function EnableNotificationsButton({
  className = "",
}: {
  className?: string;
}) {
  const { getToken } = useClerkAuth();
  const { user } = useAppAuth();
  const [state, setState] = useState<WebPushState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getWebPushState().then(setState);
  }, []);

  const enable = useCallback(async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const token = await getToken().catch(() => null);
      const next = await subscribeToWebPush(user.id, token);
      setState(next);
      if (next === "denied") {
        window.alert(
          "Notifications are blocked in your browser settings. Turn them on there to receive reminders.",
        );
      }
    } catch (error) {
      console.error("Failed to enable web push", error);
    } finally {
      setBusy(false);
    }
  }, [getToken, user?.id]);

  if (
    !state ||
    state === "unsupported" ||
    state === "unconfigured" ||
    state === "subscribed"
  ) {
    return null;
  }

  const blocked = state === "denied";

  return (
    <button
      type="button"
      onClick={() => void enable()}
      disabled={busy}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-subtle px-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated disabled:opacity-60 ${className}`}
    >
      {busy ? (
        <Loader2 size={15} className="animate-spin" />
      ) : blocked ? (
        <BellOff size={15} />
      ) : (
        <Bell size={15} />
      )}
      {blocked ? "Notifications blocked" : "Enable reminders"}
    </button>
  );
}
