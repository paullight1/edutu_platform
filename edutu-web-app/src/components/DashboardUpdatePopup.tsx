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
      role="dialog"
      aria-label="Edutu product updates"
      initial={reduceMotion ? undefined : { opacity: 0, y: 18, scale: 0.98 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+5.25rem)] z-[70] mx-auto max-w-[430px] overflow-hidden rounded-[20px] border border-brand/20 bg-surface-elevated/95 shadow-[0_24px_70px_-24px_rgba(15,23,42,0.55)] backdrop-blur-xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto sm:w-[410px]"
    >
      <div className="flex items-center gap-4 p-4 sm:p-5">
        <img
          src="/mascot/edutu-profile-guide.png"
          alt="Edutu mascot"
          className="h-20 w-20 shrink-0 object-contain object-bottom"
        />
        <div className="min-w-0 flex-1 pr-6">
          <p className="text-2xs font-bold uppercase tracking-[0.16em] text-brand">New in Edutu</p>
          <h2 className="mt-1 font-display text-lg font-semibold leading-tight text-text-primary">Your next step is clearer</h2>
          <p className="mt-1.5 text-sm leading-5 text-text-secondary">Meet the new My Plan workspace for tracking applications, deadlines, and preparation steps.</p>
          <Link to="/app/my-plan" onClick={dismiss} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand no-underline">
            Open My Plan <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss Edutu updates" className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-layer hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </motion.aside>
  );
}
