import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Plus, X } from "lucide-react";
import usePWA from "../hooks/usePWA";
import { Capacitor } from "@capacitor/core";
import "./installAppPrompt.css";

/** Native install invitation; never presents a nonfunctional install action. */
const DISMISS_KEY = "edutu_home_screen_prompt_dismissed";
const COOKIE_CONSENT_KEY = "edutu_cookie_consent";
const COOKIE_NOTICE_SELECTOR = '[role="dialog"][aria-label="Cookie consent"]';

function hasStoredCookieDecision() {
  if (typeof window === "undefined") return true;

  try {
    return Boolean(window.localStorage.getItem(COOKIE_CONSENT_KEY));
  } catch {
    return false;
  }
}

function hasDismissedPrompt() {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export default function InstallAppPrompt() {
  const { isInstallable, isInstalled, promptInstall } =
    usePWA();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && hasDismissedPrompt(),
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

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = isInstallable && !dismissed && !isInstalled &&
    !waitingForCookieNotice && !Capacitor.isNativePlatform() &&
    (pathname === "/dashboard" || pathname === "/app/home");

  useEffect(() => {
    if (!visible) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal?.();
    return () => {
      dialog?.close?.();
      previousFocus?.focus();
    };
  }, [visible]);

  const handleInstall = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (await promptInstall()) dismiss();
    } catch {
      setError("Installation couldn't start. Please try again.");
    } finally {
      setPending(false);
    }
  };

  if (!visible) return null;
  return (
    <dialog
      ref={dialogRef}
      open={typeof HTMLDialogElement.prototype.showModal !== "function"}
      className="install-app-modal"
      aria-modal="true"
      aria-labelledby="install-app-prompt-title"
      aria-describedby="install-app-prompt-description"
      onCancel={(event) => { event.preventDefault(); if (!pending) dismiss(); }}
    >
      <button type="button" onClick={dismiss} disabled={pending}
        aria-label="Dismiss install prompt" className="install-app-modal-close">
        <X size={20} aria-hidden="true" />
      </button>
      <img src="/edutu-logo-mark.png" alt="" className="install-app-modal-logo" />
      <h2 id="install-app-prompt-title">Add Edutu to your home screen</h2>
      <p id="install-app-prompt-description">Your opportunities, plans and deadlines. One tap away.</p>
      {error ? <p role="alert" className="text-danger">{error}</p> : null}
      <button type="button" onClick={() => void handleInstall()} disabled={pending}
        className="install-app-modal-add">
        <Plus size={20} aria-hidden="true" /> {pending ? "Adding…" : "Add"}
      </button>
    </dialog>
  );
}
