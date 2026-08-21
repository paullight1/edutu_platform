import { AlertCircle, RefreshCw, UsersRound } from "lucide-react";

export default function CommunityState({
  kind,
  title,
  body,
  actionLabel,
  onAction,
}: {
  kind: "loading" | "empty" | "error";
  title?: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  if (kind === "loading") {
    return (
      <div aria-label="Loading community" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-40 animate-pulse rounded-[22px] border border-[#f4dcc9] bg-white/70 dark:border-subtle dark:bg-surface-layer" />
        ))}
      </div>
    );
  }

  const Icon = kind === "error" ? AlertCircle : UsersRound;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-[26px] border border-[#f4dcc9] bg-white px-6 py-10 text-center shadow-sm dark:border-subtle dark:bg-surface-layer">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fcead5] text-[#f45b16] dark:bg-brand/10 dark:text-brand">
        <Icon size={25} />
      </span>
      <h2 className="mt-4 font-display text-xl font-semibold tracking-[-0.02em] text-[#4a170d] dark:text-text-primary">
        {title ?? (kind === "error" ? "Community is unavailable" : "Nothing here yet")}
      </h2>
      {body ? <p className="mt-2 text-sm leading-6 text-[#796f6b] dark:text-text-secondary">{body}</p> : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#f45b16] px-4 text-sm font-bold text-white transition hover:bg-[#d94b0f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f45b16]/40"
        >
          {kind === "error" ? <RefreshCw size={16} /> : null}
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
