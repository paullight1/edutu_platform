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
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="New match notifications"
      disabled={busy}
      onClick={handleToggle}
      className="flex min-h-11 w-full items-center gap-4 border-b border-subtle px-4 py-3 text-left transition hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text-primary">New matches</span>
        <span className="mt-0.5 block truncate text-xs text-text-muted">
          {on ? "On · alerts for opportunities that fit" : "Alerts for opportunities that fit"}
        </span>
      </span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
          on ? "border-brand bg-brand" : "border-subtle bg-surface-elevated"
        }`}
        aria-hidden="true"
      >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-[#ffffff] shadow-sm transition ${
              on ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
      </span>
    </button>
  );
}
