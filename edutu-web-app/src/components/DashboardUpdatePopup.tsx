import { useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";

const SEEN_KEY = "edutu_dashboard_update_2026_09_seen";

export default function DashboardUpdatePopup() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SEEN_KEY) !== "1";
  });
  const reduceMotion = useReducedMotion();

  const dismiss = () => {
    window.localStorage.setItem(SEEN_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <motion.aside
      role="region"
      aria-label="Edutu update"
      initial={reduceMotion ? undefined : { opacity: 0, y: 8 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      className="relative mx-4 mb-4 max-w-[430px] overflow-hidden rounded-2xl border border-brand/20 bg-surface-elevated/95 shadow-soft sm:fixed sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto sm:mx-0 sm:w-[410px] sm:rounded-[20px] sm:shadow-[0_24px_70px_-24px_rgba(15,23,42,0.55)] sm:backdrop-blur-xl"
    >
      <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-5">
        <img
          src="/mascot/edutu-profile-guide.png"
          alt="Edutu mascot"
          className="hidden h-20 w-20 shrink-0 object-contain object-bottom sm:block"
        />
        <div className="min-w-0 flex-1 pr-7 sm:pr-6">
          <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-brand">New in Edutu</p>
          <h2 className="mt-1 font-display text-base font-semibold leading-tight text-text-primary sm:text-lg">Your next step is clearer</h2>
          <p className="mt-1 text-xs leading-4 text-text-secondary sm:mt-1.5 sm:text-sm sm:leading-5">
            <span className="sm:hidden">Track applications, deadlines, and prep in one place.</span>
            <span className="hidden sm:inline">Meet the new My Plan workspace for tracking applications, deadlines, and preparation steps.</span>
          </p>
          <Link to="/app/my-plan" onClick={dismiss} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand no-underline sm:mt-3">
            Open My Plan <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss Edutu updates" className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-layer hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 sm:right-3 sm:top-3">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </motion.aside>
  );
}
