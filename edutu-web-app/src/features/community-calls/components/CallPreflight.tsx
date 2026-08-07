import { Check, Headphones, Loader2, Mic, ShieldCheck } from "lucide-react";

interface CallPreflightProps {
  microphoneReady: boolean;
  microphoneLabel: string | null;
  error: string | null;
  busyAction: string | null;
  onCheckMicrophone: () => void;
  onJoin: () => void;
}

export function CallPreflight({
  microphoneReady,
  microphoneLabel,
  error,
  busyAction,
  onCheckMicrophone,
  onJoin,
}: CallPreflightProps) {
  return (
    <section
      className="mx-auto w-full max-w-2xl rounded-[2rem] border border-subtle bg-surface-layer p-5 shadow-elevated sm:p-8"
      aria-labelledby="preflight-title"
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-brand/10 text-brand">
          <Headphones className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-brand">
            Before you join
          </p>
          <h2
            id="preflight-title"
            className="mt-2 font-display text-2xl font-semibold tracking-tight text-text-primary"
          >
            Check your microphone
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Edutu requests audio only. Your camera stays off, and this call is
            not recorded.
          </p>

          <div className="mt-5 rounded-2xl border border-subtle bg-surface-elevated p-4">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${microphoneReady ? "bg-success/10 text-success" : "bg-surface-layer text-text-muted"}`}
              >
                {microphoneReady ? (
                  <Check className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Mic className="h-5 w-5" aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">
                  {microphoneReady
                    ? "Microphone ready"
                    : "Microphone not checked"}
                </p>
                <p className="truncate text-xs text-text-muted">
                  {microphoneLabel ?? "You will stay muted when you enter."}
                </p>
              </div>
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-2xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onCheckMicrophone}
              disabled={busyAction !== null}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-default bg-surface-layer px-5 text-sm font-semibold text-text-primary transition hover:bg-surface-elevated focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-60"
            >
              {busyAction === "microphone" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Mic className="h-4 w-4" aria-hidden="true" />
              )}
              {microphoneReady ? "Check again" : "Check microphone"}
            </button>
            <button
              type="button"
              onClick={onJoin}
              disabled={!microphoneReady || busyAction !== null}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand px-6 text-sm font-semibold text-white shadow-soft transition hover:bg-brand-700 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyAction === "join" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              Join muted
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
