import { BellRing } from "lucide-react";
import { useWebPush } from "../hooks/useWebPush";

/**
 * The durable notification control: a persistent two-way toggle in Settings
 * that reflects the real subscription state (probed from the browser's
 * PushManager), not a one-way "enable" button.
 *
 * Renders nothing when push is unsupported, unconfigured (no VAPID public key
 * built into the app), or blocked in the browser — in those states the toggle
 * could not do anything, and the browser will not re-prompt.
 */
export default function WebPushSettings() {
  const { state, busy, enable, disable } = useWebPush();

  if (
    state === null ||
    state === "unsupported" ||
    state === "unconfigured" ||
    state === "denied"
  ) {
    return null;
  }

  const on = state === "subscribed";

  const handleToggle = () => {
    if (busy) return;
    void (on ? disable() : enable());
  };

  return (
    <section className="mb-6 rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
        Push notifications
      </h2>

      <div className="mt-4 flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <BellRing size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">
            Browser notifications
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {on
              ? "On — deadline nudges and new matches reach you even when Edutu is closed"
              : "Get deadline nudges and new matches even when Edutu is closed"}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Browser notifications"
          disabled={busy}
          onClick={handleToggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
            on ? "bg-brand" : "bg-surface-elevated"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-[#ffffff] shadow-sm transition ${
              on ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </section>
  );
}
