import { Loader2, Plus, Send, ShieldAlert } from "lucide-react";

export default function CommunityComposer({
  mode,
  draft,
  setDraft,
  error,
  sending,
  onSubmit,
  safetyAccepted = true,
  onAcceptSafety,
  onShareOpportunity,
}: {
  mode: "post" | "comment";
  draft: string;
  setDraft: (value: string) => void;
  error: string | null;
  sending: boolean;
  onSubmit: () => void;
  safetyAccepted?: boolean;
  onAcceptSafety?: () => void;
  onShareOpportunity?: () => void;
}) {
  const label =
    mode === "post"
      ? "Community message composer"
      : "Community comment composer";
  const noun = mode === "post" ? "post" : "comment";

  return (
    <form
      aria-label={label}
      data-keyboard-avoid
      data-keyboard-scope
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="fixed inset-x-0 bottom-0 z-40 bg-white/95 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_38px_-30px_rgba(23,18,15,.52)] backdrop-blur-xl dark:bg-surface-layer dark:shadow-[0_-18px_40px_-28px_rgba(0,0,0,.92)]"
    >
      <div className="mx-auto w-full max-w-3xl px-3 sm:px-5">
        {mode === "post" && !safetyAccepted ? (
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-amber-200/70 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-300/15 dark:bg-amber-400/10 dark:text-amber-100">
            <ShieldAlert
              size={18}
              className="shrink-0 text-amber-700 dark:text-amber-300"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold">Post safely</p>
              <p className="mt-0.5 text-[11px] leading-4">
                Never share payments, passwords or verification codes.
              </p>
            </div>
            <button
              type="button"
              onClick={onAcceptSafety}
              className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100 active:scale-[0.98] dark:text-amber-200 dark:hover:bg-amber-300/10"
            >
              Got it
            </button>
          </div>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mb-2 text-xs font-semibold leading-5 text-red-600 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}
        <div className="flex items-end gap-2 rounded-[24px] bg-[#f3f1ef] p-1.5 ring-1 ring-black/[0.035] transition focus-within:bg-white focus-within:ring-2 focus-within:ring-[#f45b16]/20 dark:bg-surface-elevated dark:ring-white/[0.05] dark:focus-within:bg-surface-elevated dark:focus-within:ring-brand/25">
          {mode === "post" && onShareOpportunity ? (
            <button
              type="button"
              disabled={!safetyAccepted || sending}
              aria-label="Share an opportunity"
              onClick={onShareOpportunity}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#5f5752] transition hover:bg-white hover:text-[#f45b16] disabled:opacity-35 dark:text-text-secondary dark:hover:bg-surface-layer dark:hover:text-brand"
            >
              <Plus size={20} />
            </button>
          ) : null}
          <textarea
            value={draft}
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            enterKeyHint="send"
            autoCapitalize="sentences"
            placeholder={
              mode === "post" ? "Write a useful post…" : "Write a comment…"
            }
            rows={2}
            className="min-h-11 max-h-36 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-base leading-6 text-[#17120f] outline-none placeholder:text-[#817a76] dark:text-text-primary dark:placeholder:text-text-muted"
          />
          <button
            type="submit"
            disabled={!safetyAccepted || !draft.trim() || sending}
            aria-label={`Send ${noun}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#17120f] text-white shadow-sm transition hover:bg-[#f45b16] active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 dark:bg-brand dark:text-white dark:hover:bg-brand-500"
          >
            {sending ? (
              <Loader2 size={19} className="animate-spin" />
            ) : (
              <Send size={19} />
            )}
          </button>
        </div>
        {draft.length > 0 ? (
          <p className="mt-1.5 pe-2 text-end text-[11px] tabular-nums text-[#a18c83] dark:text-text-muted">
            {draft.length.toLocaleString()} / 2,000
          </p>
        ) : null}
      </div>
    </form>
  );
}
