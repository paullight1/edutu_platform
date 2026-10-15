import { AlertCircle, RefreshCw, UsersRound, type LucideIcon } from "lucide-react";

export default function CommunityState({
  kind,
  title,
  body,
  actionLabel,
  onAction,
  icon: CustomIcon,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  kind: "loading" | "empty" | "error";
  title?: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: LucideIcon;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  if (kind === "loading") {
    return (
      <div role="status" aria-label="Loading community" aria-busy="true" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <span className="sr-only">Loading community content…</span>
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-40 animate-pulse motion-reduce:animate-none rounded-[22px] border border-[#f4dcc9] bg-white/70 dark:border-subtle dark:bg-surface-layer" />
        ))}
      </div>
    );
  }

  const Icon = CustomIcon ?? (kind === "error" ? AlertCircle : UsersRound);
  return (
    <div role={kind === "error" ? "alert" : "status"} className="mx-auto flex w-full max-w-lg flex-col items-center rounded-[26px] border border-[#f4dcc9] bg-[#fffaf6] px-5 py-9 text-center dark:border-subtle dark:bg-surface-layer sm:px-9 sm:py-12">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand">
        <Icon size={25} />
      </span>
      <h2 className="mt-4 font-display text-xl font-semibold tracking-[-0.02em] text-[#4a170d] dark:text-text-primary">
        {title ?? (kind === "error" ? "Community is unavailable" : "Nothing here yet")}
      </h2>
      {body ? <p className="mt-2 text-sm leading-6 text-[#796f6b] dark:text-text-secondary">{body}</p> : null}
      {((actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction)) ? (
        <div className="mt-6 flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">
          {actionLabel && onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#f45b16] px-5 text-sm font-bold text-white transition hover:bg-[#d94b0f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/40"
            >
              {kind === "error" ? <RefreshCw size={16} /> : null}
              {actionLabel}
            </button>
          ) : null}
          {secondaryActionLabel && onSecondaryAction ? (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[#e9d4c6] bg-white px-5 text-sm font-semibold text-[#4a170d] transition hover:bg-[#fff1e6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/40 dark:border-subtle dark:bg-surface-elevated dark:text-text-primary"
            >
              {secondaryActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
