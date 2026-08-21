import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

const LANDING_UPDATE_SECTION_STYLE = `
  .landing-page main > section:has(a[href="/whats-new"]) {
    display: none !important;
  }
`;

export default function WhatsNewNotification() {
  const [visible, setVisible] = useState(true);
  const reduceMotion = useReducedMotion();
  const location = useLocation();

  if (location.pathname !== "/") {
    return null;
  }

  return (
    <>
      <style>{LANDING_UPDATE_SECTION_STYLE}</style>
      {visible ? (
        <motion.aside
          role="status"
          aria-label="Edutu product update"
          initial={reduceMotion ? undefined : { opacity: 0, y: 18, scale: 0.98 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+5.25rem)] z-[80] mx-auto max-w-[430px] overflow-hidden rounded-[22px] border border-brand/15 bg-surface-elevated/95 p-4 shadow-[0_24px_70px_-24px_rgba(15,23,42,0.48)] backdrop-blur-xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto sm:w-[390px] sm:p-5"
        >
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-soft">
              <Sparkles size={18} aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="pr-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">
                  Product update
                </p>
                <h2 className="mt-1 font-display text-lg font-semibold leading-tight tracking-[-0.02em] text-text-primary">
                  Edutu just got better
                </h2>
              </div>
              <p className="mt-1.5 text-sm leading-5 text-text-secondary">
                Smarter matching, clearer opportunities, and a calmer experience.
              </p>
              <Link
                to="/whats-new"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand no-underline transition hover:gap-2"
              >
                See what&apos;s new
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setVisible(false)}
              className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-layer hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              aria-label="Dismiss product update"
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        </motion.aside>
      ) : null}
    </>
  );
}
