import { useCallback, useEffect, useState } from "react";
import { Calendar, Check, Loader2 } from "lucide-react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import {
  fetchCalendarConnectUrl,
  fetchCalendarStatus,
  disconnectCalendar,
} from "../services/calendar";

type State = "loading" | "connected" | "disconnected" | "hidden";

/**
 * Connects the user's Google Calendar for two-way sync. Adopted-roadmap goals
 * appear as events; moving/deleting an event flows back to the goal. Renders
 * nothing until we know the state, or when the backend has no Google config.
 */
export default function ConnectCalendarButton({
  className = "",
}: {
  className?: string;
}) {
  const { getToken } = useClerkAuth();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await getToken().catch(() => null);
        const status = await fetchCalendarStatus(token);
        if (active) setState(status.connected ? "connected" : "disconnected");
      } catch {
        if (active) setState("hidden");
      }
    })();
    return () => {
      active = false;
    };
  }, [getToken]);

  const connect = useCallback(async () => {
    setBusy(true);
    try {
      const token = await getToken().catch(() => null);
      const { url } = await fetchCalendarConnectUrl(token);
      if (url) {
        window.location.href = url; // hand off to Google's consent screen
      } else {
        setState("hidden"); // backend not configured for Google OAuth
      }
    } catch {
      setState("hidden");
    } finally {
      setBusy(false);
    }
  }, [getToken]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    try {
      const token = await getToken().catch(() => null);
      await disconnectCalendar(token);
      setState("disconnected");
    } finally {
      setBusy(false);
    }
  }, [getToken]);

  if (state === "loading" || state === "hidden") return null;

  if (state === "connected") {
    return (
      <button
        type="button"
        onClick={() => void disconnect()}
        disabled={busy}
        title="Google Calendar connected — click to disconnect"
        className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-subtle px-3 text-sm font-semibold text-emerald-600 transition hover:bg-surface-elevated disabled:opacity-60 ${className}`}
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Check size={15} />
        )}
        Calendar synced
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void connect()}
      disabled={busy}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-subtle px-3 text-sm font-semibold text-text-secondary transition hover:bg-surface-elevated disabled:opacity-60 ${className}`}
    >
      {busy ? (
        <Loader2 size={15} className="animate-spin" />
      ) : (
        <Calendar size={15} />
      )}
      Sync Google Calendar
    </button>
  );
}
