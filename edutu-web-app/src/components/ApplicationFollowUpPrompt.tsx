import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  getApplicationPage,
  getApplication,
  recordApplicationEvent,
  updateApplicationStatus,
  type ApplicationRecord,
} from "../services/applications";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/Dialog";

const DAY = 24 * 60 * 60 * 1000;

/** Ask once on return, or on a later visit for an older draft. The external
 * provider is the authority on submission; Edutu only records explicit consent. */
export default function ApplicationFollowUpPrompt() {
  const { userId, getToken } = useAuth();
  const tokenGetter = useRef(getToken);
  tokenGetter.current = getToken;
  const [candidate, setCandidate] = useState<ApplicationRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trackedId = useRef<string | null>(null);
  const busy = useRef(false);
  const snoozed = useRef<Record<string, number>>({});

  useEffect(() => {
    setCandidate(null);
    setError(null);
    trackedId.current = null;
    snoozed.current = {};
    if (!userId) return;
    const key = `edutu:application-follow-up:${userId}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      snoozed.current =
        saved && typeof saved === "object" && !Array.isArray(saved)
          ? saved
          : {};
    } catch {
      /* Storage can be blocked. */
    }
    let disposed = false;
    let checking = false;
    let recheckOnReturn = false;
    let lastCheck = 0;
    const check = async (returned = false) => {
      if (checking) {
        recheckOnReturn ||= returned;
        return;
      }
      if (
        disposed ||
        busy.current ||
        document.visibilityState === "hidden" ||
        !navigator.onLine
      )
        return;
      if (returned && !trackedId.current && Date.now() - lastCheck < 30_000)
        return;
      checking = true;
      lastCheck = Date.now();
      try {
        const token = await tokenGetter.current();
        if (!token || disposed) return;
        const rows =
          returned && trackedId.current
            ? [await getApplication(trackedId.current, userId, token)]
            : (
                await getApplicationPage(userId, token, {
                  status: "draft",
                  confirmationDue: true,
                })
              ).items;
        if (disposed || busy.current) return;
        const next = rows.find(
          (row) =>
            row.status === "draft" &&
            !(snoozed.current.__nextPromptAt > Date.now()) &&
            !(snoozed.current[row.id] > Date.now()) &&
            ((returned && trackedId.current === row.id) ||
              Date.now() -
                new Date(
                  row.application_opened_at || row.applied_at,
                ).getTime() >=
                DAY),
        );
        setCandidate(next ?? null);
      } catch {
        /* Optional prompt must never interrupt browsing on API failure. */
      } finally {
        checking = false;
        if (recheckOnReturn && !disposed) {
          recheckOnReturn = false;
          void check(true);
        }
      }
    };
    const onReturn = () => {
      void check(true);
    };
    const onChanged = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          userId?: string;
          application?: ApplicationRecord;
        }>
      ).detail;
      if (detail?.userId !== userId) return;
      if (detail.application?.status === "draft") {
        trackedId.current = detail.application.id;
        void check(true);
      } else {
        trackedId.current = null;
        setCandidate(null);
      }
    };
    void check();
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("edutu:applications-changed", onChanged);
    return () => {
      disposed = true;
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("edutu:applications-changed", onChanged);
    };
  }, [userId]);

  const dismiss = () => {
    if (busy.current || !candidate || !userId) return;
    const dismissedId = candidate.id;
    void tokenGetter
      .current()
      .then((token) =>
        token
          ? recordApplicationEvent(
              dismissedId,
              "application_prompt_snoozed",
              token,
            )
          : undefined,
      )
      .catch(() => {});
    // Store only bounded, user-scoped snooze timestamps, never application copy.
    snoozed.current = Object.fromEntries(
      Object.entries(snoozed.current).filter(([, until]) => until > Date.now()),
    );
    snoozed.current[candidate.id] = Date.now() + DAY;
    snoozed.current.__nextPromptAt = Date.now() + DAY;
    try {
      localStorage.setItem(
        `edutu:application-follow-up:${userId}`,
        JSON.stringify(snoozed.current),
      );
    } catch {
      /* In-memory snooze still works. */
    }
    trackedId.current = null;
    setCandidate(null);
    setError(null);
  };

  const confirm = async () => {
    if (!candidate || busy.current || !userId) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const token = await tokenGetter.current();
      if (!token)
        throw new Error("Sign in again to save your application status.");
      const updated = await updateApplicationStatus(
        candidate.id,
        "submitted",
        token,
        candidate.version,
      );
      setCandidate(null);
      trackedId.current = null;
      window.dispatchEvent(
        new CustomEvent("edutu:applications-changed", {
          detail: { userId, application: updated },
        }),
      );
    } catch (caught) {
      const failedId = candidate.id;
      void tokenGetter
        .current()
        .then((token) =>
          token
            ? recordApplicationEvent(failedId, "application_save_failed", token)
            : undefined,
        )
        .catch(() => {});
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save. Please try again.",
      );
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={Boolean(candidate)}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent
        className="max-w-sm"
        ariaLabel="Confirm your application"
        aria-describedby="application-follow-up-description"
        preventCloseOnBackdropClick={saving}
      >
        <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <CheckCircle2 size={23} />
        </span>
        <DialogTitle>Did you submit your application?</DialogTitle>
        <p className="mt-2 font-semibold text-text-primary">
          {candidate?.opportunity_title}
        </p>
        <DialogDescription
          id="application-follow-up-description"
          className="mt-2 leading-6"
        >
          Opening the provider’s form starts a draft. Confirm only after you
          have submitted it, and we’ll keep your tracker up to date.
        </DialogDescription>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={saving}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="motion-safe:animate-spin" />
                Saving…
              </>
            ) : (
              "Yes, I submitted it"
            )}
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={saving}
            className="min-h-11 rounded-xl border border-subtle px-4 text-sm font-semibold text-text-secondary disabled:opacity-60"
          >
            Not yet
          </button>
          {!saving ? (
            <Link
              to="/app/applications"
              onClick={dismiss}
              className="py-2 text-center text-sm font-semibold text-brand"
            >
              Review my applications
            </Link>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
