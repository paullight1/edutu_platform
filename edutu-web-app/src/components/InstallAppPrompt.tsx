import { useState } from "react";
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
 *   • Android / desktop Chromium → "Install app" button → native prompt()
 *   • iOS Safari (no beforeinstallprompt) → manual Share → Add to Home Screen
 *
 * The Dashboard renders its own inline card on the mobile home route, so we
 * defer to it there (shared dismissal key) to avoid a double prompt.
 */
const DISMISS_KEY = "edutu_home_screen_prompt_dismissed";
const DASHBOARD_OWNED_ROUTES = new Set(["/dashboard", "/app/home"]);

export default function InstallAppPrompt() {
  const { isInstallable, isManualInstallAvailable, isInstalled, promptInstall } =
    usePWA();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(DISMISS_KEY) === "1",
  );

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
  if (dismissed || isInstalled) return null;
  if (!isInstallable && !isManualInstallAvailable) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Edutu"
      className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] mx-auto max-w-md rounded-2xl border border-subtle bg-surface-layer p-4 shadow-elevated sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[26rem]"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-elevated hover:text-text-secondary"
      >
        <X size={16} />
      </button>

      <div className="flex items-start gap-3 pr-8">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
          <Download size={20} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">
            Add Edutu to your home screen
          </h2>
          <p className="mt-1 text-xs font-medium leading-5 text-text-muted">
            Install the app for full-screen access, offline opportunities, and
            deadline reminders — no app store needed.
          </p>
        </div>
      </div>

      {isInstallable ? (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleInstall}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-600 active:scale-[0.98]"
          >
            <Download size={16} />
            Install app
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="h-10 rounded-xl bg-surface-elevated px-4 text-sm font-semibold text-text-secondary transition hover:bg-surface-brand"
          >
            Later
          </button>
        </div>
      ) : (
        // iOS Safari: no programmatic install — walk the user through it.
        <div className="mt-4 rounded-xl bg-surface-elevated px-3 py-2.5 text-xs font-medium leading-5 text-text-secondary">
          Tap{" "}
          <Share size={14} className="mx-0.5 inline-block align-text-bottom text-brand-600" />
          <span className="font-semibold text-text-primary">Share</span>, then{" "}
          <Plus size={14} className="mx-0.5 inline-block align-text-bottom text-brand-600" />
          <span className="font-semibold text-text-primary">
            Add to Home Screen
          </span>
          .
        </div>
      )}
    </div>
  );
}
