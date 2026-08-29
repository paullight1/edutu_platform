import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, Share, Plus, X } from "lucide-react";
import usePWA from "../hooks/usePWA";

/**
 * App-wide "Add to Home Screen" prompt.
 *
 * Chrome removed the automatic install mini-infobar on Android, so a PWA has to
 * capture `beforeinstallprompt` and surface its own affordance — that's what
 * `usePWA` stashes and this banner drives. Desktop Chrome/Edge still show the
 * native omnibox install icon on top of this, so between the two every platform
 * has a one-tap install path:
 *   • Android / desktop Chromium → "Install Edutu" button → native prompt()
 *   • iOS Safari (no beforeinstallprompt) → manual Share → Add to Home Screen
 *
 * The Dashboard renders its own inline card on the mobile home route, so we
 * defer to it there (shared dismissal key) to avoid a double prompt.
 */
const DISMISS_KEY = "edutu_home_screen_prompt_dismissed";
const COOKIE_CONSENT_KEY = "edutu_cookie_consent";
const COOKIE_NOTICE_SELECTOR = '[role="dialog"][aria-label="Cookie consent"]';
const DASHBOARD_OWNED_ROUTES = new Set(["/dashboard", "/app/home"]);

function hasStoredCookieDecision() {
  if (typeof window === "undefined") return true;

  try {
    return Boolean(window.localStorage.getItem(COOKIE_CONSENT_KEY));
  } catch {
    return false;
  }
}

export default function InstallAppPrompt() {
  const { isInstallable, isManualInstallAvailable, isInstalled, promptInstall } =
    usePWA();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(DISMISS_KEY) === "1",
  );
  const [waitingForCookieNotice, setWaitingForCookieNotice] = useState(
    () => !hasStoredCookieDecision(),
  );

  useEffect(() => {
    if (!waitingForCookieNotice) return;

    let noticeWasVisible = false;
    const syncCookieNotice = () => {
      const noticeIsVisible = Boolean(
        document.querySelector(COOKIE_NOTICE_SELECTOR),
      );

      if (noticeIsVisible) {
        noticeWasVisible = true;
        return;
      }

      if (noticeWasVisible || hasStoredCookieDecision()) {
        setWaitingForCookieNotice(false);
      }
    };

    const observer = new MutationObserver(syncCookieNotice);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("storage", syncCookieNotice);
    syncCookieNotice();

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", syncCookieNotice);
    };
  }, [waitingForCookieNotice]);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode / storage disabled — dismiss for this session only */
    }
  };

  const handleInstall = async () => {
    const accepted = await promptInstall();
    if (accepted) dismiss();
  };

  // The Dashboard already owns the home-route mobile card — don't double up.
  if (DASHBOARD_OWNED_ROUTES.has(pathname)) return null;
  if (dismissed || isInstalled || waitingForCookieNotice) return null;
  if (!isInstallable && !isManualInstallAvailable) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="install-app-prompt-title"
      aria-describedby="install-app-prompt-description"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-md animate-[slideUp_280ms_cubic-bezier(0.22,1,0.36,1)] overflow-hidden rounded-[24px] border border-subtle bg-surface-layer p-4 pb-5 shadow-elevated motion-reduce:animate-none sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[26rem] sm:p-5"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="absolute right-2.5 top-2.5 flex h-11 w-11 items-center justify-center rounded-2xl text-text-muted transition duration-200 hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95"
      >
        <X size={18} aria-hidden="true" />
      </button>

      <div className="flex items-start gap-3 pr-10">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
          <Download size={22} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 pt-0.5">
          <h2
            id="install-app-prompt-title"
            className="text-base font-semibold leading-6 text-text-primary"
          >
            Add Edutu to your home screen
          </h2>
          <p
            id="install-app-prompt-description"
            className="mt-1 text-sm leading-5 text-text-muted"
          >
            Open Edutu faster, save opportunities offline, and stay on top of
            deadlines.
          </p>
        </div>
      </div>

      {isInstallable ? (
        <div className="mt-5 grid gap-1">
          <button
            type="button"
            onClick={handleInstall}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition duration-200 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-[0.98]"
          >
            <Download size={18} strokeWidth={2} aria-hidden="true" />
            Install Edutu
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="mx-auto min-h-11 rounded-xl px-4 text-sm font-medium text-text-muted transition duration-200 hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-[0.98]"
          >
            Maybe later
          </button>
        </div>
      ) : (
        // iOS Safari: no programmatic install — walk the user through it.
        <>
          <ol
            aria-label="How to add Edutu on iPhone or iPad"
            className="mt-5 grid gap-2"
          >
            <li className="flex min-h-12 items-center gap-3 rounded-2xl bg-surface-elevated px-3 py-2.5 text-sm text-text-secondary">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-layer text-xs font-semibold text-brand-600 shadow-sm"
              >
                1
              </span>
              <span className="min-w-0 flex-1">
                Tap <strong className="font-semibold text-text-primary">Share</strong>{" "}
                in Safari
              </span>
              <Share
                size={18}
                strokeWidth={1.8}
                className="shrink-0 text-brand-600"
                aria-hidden="true"
              />
            </li>
            <li className="flex min-h-12 items-center gap-3 rounded-2xl bg-surface-elevated px-3 py-2.5 text-sm text-text-secondary">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-layer text-xs font-semibold text-brand-600 shadow-sm"
              >
                2
              </span>
              <span className="min-w-0 flex-1">
                Choose{" "}
                <strong className="font-semibold text-text-primary">
                  Add to Home Screen
                </strong>
              </span>
              <Plus
                size={18}
                strokeWidth={1.8}
                className="shrink-0 text-brand-600"
                aria-hidden="true"
              />
            </li>
          </ol>
          <p className="mt-3 text-center text-xs font-medium text-text-muted">
            No App Store needed.
          </p>
        </>
      )}
    </div>
  );
}
