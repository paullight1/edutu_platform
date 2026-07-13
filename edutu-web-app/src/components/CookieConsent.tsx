import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { Cookie } from "lucide-react";

/**
 * First-visit cookie notice. Once the visitor accepts or declines we persist
 * the choice in localStorage and never show it again. Non-blocking: it sits in
 * the corner and lets the page stay fully usable underneath.
 */
const CONSENT_KEY = "edutu_cookie_consent";

function hasStoredConsent(): boolean {
  try {
    return Boolean(window.localStorage.getItem(CONSENT_KEY));
  } catch {
    // Private mode / storage disabled — treat as not-yet-decided but the
    // choice simply won't persist across sessions.
    return false;
  }
}

export default function CookieConsent() {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (hasStoredConsent()) return;
    // Slide in shortly after first paint so it doesn't compete with the
    // initial route render.
    const timer = window.setTimeout(() => setVisible(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  const record = (choice: "accepted" | "declined") => {
    try {
      window.localStorage.setItem(CONSENT_KEY, choice);
    } catch {
      /* respect the choice for this session even if it can't persist */
    }
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="dialog"
          aria-label="Cookie consent"
          aria-live="polite"
          initial={reduceMotion ? undefined : { opacity: 0, y: 24 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 24 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-xl rounded-2xl border border-subtle bg-surface-layer p-4 shadow-elevated sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[30rem] sm:p-5"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Cookie size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-text-primary">
                We use cookies
              </h2>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                We use cookies to keep you signed in, remember your preferences,
                and understand how Edutu is used. Read more in our{" "}
                <Link
                  to="/privacy"
                  className="font-semibold text-brand hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => record("accepted")}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.98]"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => record("declined")}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-surface-elevated px-4 text-sm font-semibold text-text-secondary transition hover:text-text-primary"
            >
              Decline
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
