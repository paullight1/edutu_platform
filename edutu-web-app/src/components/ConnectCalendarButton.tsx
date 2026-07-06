import { useCallback, useEffect, useState } from "react";
import { Calendar, Check, Copy, Loader2, X } from "lucide-react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import {
  fetchCalendarStatus,
  fetchConnectUrl,
  ensureFeedUrl,
  connectCaldav,
  disconnectProvider,
  type CalendarStatus,
} from "../services/calendar";

/**
 * Calendar sync panel: connect Google/Outlook (two-way OAuth), subscribe Apple
 * via the auto-updating webcal feed, or opt into two-way iCloud via CalDAV.
 * Renders nothing until we know status; hides if no provider is usable.
 */
export default function ConnectCalendarButton({
  className = "",
}: {
  className?: string;
}) {
  const { getToken } = useClerkAuth();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [open, setOpen] = useState(false);

  const token = useCallback(() => getToken().catch(() => null), [getToken]);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchCalendarStatus(await token()));
    } catch {
      setStatus(null);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Apple webcal is always available, so the panel is always useful once loaded.
  if (!status) return null;

  const connectedCount =
    Number(status.google) + Number(status.outlook) + Number(status.apple_caldav);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-subtle px-3 text-sm font-semibold transition hover:bg-surface-elevated ${connectedCount > 0 ? "text-emerald-600" : "text-text-secondary"} ${className}`}
      >
        {connectedCount > 0 ? <Check size={15} /> : <Calendar size={15} />}
        {connectedCount > 0 ? "Calendar synced" : "Sync calendar"}
      </button>
      {open && (
        <CalendarSyncModal
          status={status}
          token={token}
          onChanged={refresh}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function CalendarSyncModal({
  status,
  token,
  onChanged,
  onClose,
}: {
  status: CalendarStatus;
  token: () => Promise<string | null>;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [feedUrl, setFeedUrl] = useState<string | null>(status.feedUrl);
  const [copied, setCopied] = useState(false);
  const [caldav, setCaldav] = useState({ username: "", appPassword: "" });
  const [showCaldav, setShowCaldav] = useState(false);

  useEffect(() => {
    if (!feedUrl) {
      void (async () => {
        const res = await ensureFeedUrl(await token()).catch(() => ({ url: null }));
        setFeedUrl(res.url);
      })();
    }
  }, [feedUrl, token]);

  const connectOAuth = useCallback(
    async (provider: "google" | "outlook") => {
      setBusy(provider);
      try {
        const { url } = await fetchConnectUrl(provider, await token());
        if (url) window.location.href = url;
      } finally {
        setBusy(null);
      }
    },
    [token],
  );

  const disconnect = useCallback(
    async (provider: "google" | "outlook" | "apple_caldav") => {
      setBusy(provider);
      try {
        await disconnectProvider(provider, await token());
        await onChanged();
      } finally {
        setBusy(null);
      }
    },
    [onChanged, token],
  );

  const submitCaldav = useCallback(async () => {
    if (!caldav.username || !caldav.appPassword) return;
    setBusy("apple_caldav");
    try {
      await connectCaldav(caldav, await token());
      setShowCaldav(false);
      setCaldav({ username: "", appPassword: "" });
      await onChanged();
    } finally {
      setBusy(null);
    }
  }, [caldav, onChanged, token]);

  const webcal = feedUrl ? feedUrl.replace(/^https?:\/\//, "webcal://") : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-[24px] border border-subtle bg-surface-layer p-5 shadow-soft sm:rounded-[24px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-semibold tracking-tight">
            Sync your calendar
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-text-muted transition hover:bg-surface-elevated"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm text-text-muted">
          Your goal deadlines and roadmap milestones, kept in sync.
        </p>

        <div className="mt-4 space-y-2.5">
          <ProviderRow
            label="Google Calendar"
            connected={status.google}
            available={status.configured.google}
            busy={busy === "google"}
            onConnect={() => void connectOAuth("google")}
            onDisconnect={() => void disconnect("google")}
          />
          <ProviderRow
            label="Outlook / Microsoft 365"
            connected={status.outlook}
            available={status.configured.outlook}
            busy={busy === "outlook"}
            onConnect={() => void connectOAuth("outlook")}
            onDisconnect={() => void disconnect("outlook")}
          />

          {/* Apple: webcal subscription (default) */}
          <div className="rounded-xl border border-subtle p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Apple Calendar</span>
              <span className="text-xs text-text-muted">auto-updating</span>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Subscribe once — Apple Calendar keeps itself up to date. Works in
              Google &amp; Outlook too.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {webcal && (
                <a
                  href={webcal}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-white transition hover:bg-brand-700"
                >
                  <Calendar size={13} />
                  Subscribe
                </a>
              )}
              {feedUrl && (
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(feedUrl);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-subtle px-3 text-xs font-semibold text-text-secondary transition hover:bg-surface-elevated"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Copied" : "Copy link"}
                </button>
              )}
            </div>

            {/* Apple: CalDAV opt-in (true two-way) */}
            {status.apple_caldav ? (
              <div className="mt-3 flex items-center justify-between border-t border-subtle pt-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                  <Check size={13} /> iCloud two-way connected
                </span>
                <button
                  type="button"
                  onClick={() => void disconnect("apple_caldav")}
                  disabled={busy === "apple_caldav"}
                  className="text-xs font-semibold text-text-muted hover:text-red-600"
                >
                  Disconnect
                </button>
              </div>
            ) : showCaldav ? (
              <div className="mt-3 space-y-2 border-t border-subtle pt-3">
                <input
                  value={caldav.username}
                  onChange={(e) => setCaldav((p) => ({ ...p, username: e.target.value }))}
                  placeholder="Apple ID email"
                  className="w-full rounded-lg border border-subtle bg-surface-body px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <input
                  type="password"
                  value={caldav.appPassword}
                  onChange={(e) => setCaldav((p) => ({ ...p, appPassword: e.target.value }))}
                  placeholder="App-specific password"
                  className="w-full rounded-lg border border-subtle bg-surface-body px-3 py-2 text-sm outline-none focus:border-brand"
                />
                <p className="text-[11px] text-text-muted">
                  Create one at appleid.apple.com → Sign-In &amp; Security →
                  App-Specific Passwords.
                </p>
                <button
                  type="button"
                  onClick={() => void submitCaldav()}
                  disabled={busy === "apple_caldav"}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-white disabled:opacity-60"
                >
                  {busy === "apple_caldav" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : null}
                  Connect two-way
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCaldav(true)}
                className="mt-3 border-t border-subtle pt-3 text-xs font-semibold text-brand"
              >
                Want two-way iCloud sync? Connect with an app password →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProviderRow({
  label,
  connected,
  available,
  busy,
  onConnect,
  onDisconnect,
}: {
  label: string;
  connected: boolean;
  available: boolean;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-subtle p-3">
      <span className="text-sm font-semibold">{label}</span>
      {!available ? (
        <span className="text-xs text-text-muted">Not available</span>
      ) : connected ? (
        <button
          type="button"
          onClick={onDisconnect}
          disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-red-600"
        >
          <Check size={13} /> Connected
        </button>
      ) : (
        <button
          type="button"
          onClick={onConnect}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : null}
          Connect
        </button>
      )}
    </div>
  );
}
