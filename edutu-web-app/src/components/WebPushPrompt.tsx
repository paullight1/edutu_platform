import { useEffect, useState } from "react";
import { Bell, Loader2, X } from "lucide-react";
import { useWebPush } from "../hooks/useWebPush";
import {
  dismissWebPushPrompt,
  isWebPushPromptDismissed,
} from "../lib/webPushPrompt";

/**
 * Contextual opt-in card, shown at the moments where a reminder is obviously
 * worth something (saved opportunities, upcoming deadlines).
 *
 * It renders nothing at all when push is unsupported, unconfigured (no VAPID
 * key), blocked by the browser, already subscribed, or previously dismissed —
 * no dead UI in any of those states. Subscription runs through `useWebPush`,
 * from the button's click handler, never from an effect.
 */
export default function WebPushPrompt({
  promptId,
  title,
  body,
  className = "",
}: {
  /** Stable id used to remember dismissal for this surface. */
  promptId: string;
  title: string;
  body: string;
  className?: string;
}) {
  const { state, busy, enable } = useWebPush();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(isWebPushPromptDismissed(promptId));
  }, [promptId]);

  const hidden =
    dismissed ||
    state === null ||
    state === "unsupported" ||
    state === "unconfigured" ||
    state === "denied" ||
    state === "subscribed";

  if (hidden) return null;

  const handleDismiss = () => {
    dismissWebPushPrompt(promptId);
    setDismissed(true);
  };

  return (
    <section
      className={`relative rounded-2xl border border-subtle bg-surface-layer p-4 shadow-soft ${className}`}
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss reminder prompt"
        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-elevated hover:text-text-secondary"
      >
        <X size={15} />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Bell size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">{title}</p>
          <p className="mt-0.5 text-xs text-text-muted">{body}</p>

          <button
            type="button"
            onClick={() => void enable()}
            disabled={busy}
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl bg-brand px-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Bell size={15} />
            )}
            Turn on reminders
          </button>
        </div>
      </div>
    </section>
  );
}
