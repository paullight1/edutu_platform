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
          className="fixed inset-x-0 bottom-0 z-[70] w-full border-t border-white/15 bg-[#0f1a2d] text-white shadow-[0_-18px_50px_-30px_rgba(2,6,23,.9)]"
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 sm:px-6 lg:flex-row lg:items-center lg:gap-6 lg:px-8 lg:py-5">
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand-300">
                <Cookie size={20} aria-hidden="true" />
              </span>
              <p className="min-w-0 text-sm leading-6 text-slate-200">
                We use essential cookies for secure sign-in and site operation.
                Optional analytics help us improve Edutu. Read our{" "}
                <Link
                  to="/privacy"
                  className="font-semibold text-white underline decoration-white/45 underline-offset-4 transition hover:decoration-white"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
            <div className="flex w-full shrink-0 items-center gap-2 lg:w-auto">
              <button
                type="button"
                onClick={() => record("declined")}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-xl border border-white/20 bg-white px-5 text-sm font-semibold text-[#0f1a2d] transition hover:bg-slate-100 active:scale-[0.98] lg:flex-none"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => record("accepted")}
                className="inline-flex h-12 flex-1 items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.98] lg:flex-none"
              >
                Accept
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
