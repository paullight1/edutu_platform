import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Plus } from "lucide-react";

export default function PlanExploreButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(!reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setExpanded(false);
      return;
    }
    const timer = window.setTimeout(() => setExpanded(false), 2200);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      whileTap={reducedMotion ? undefined : { scale: 0.94 }}
      className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-20 inline-flex h-14 max-w-[calc(100vw-2rem)] items-center justify-center overflow-hidden rounded-full border border-brand/20 bg-brand px-4 text-sm font-semibold text-white shadow-lg shadow-brand/20 transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-body sm:hidden"
    >
      <Plus size={24} className="shrink-0" aria-hidden="true" />
      <motion.span
        aria-hidden="true"
        initial={false}
        animate={{ width: expanded ? "auto" : 0, opacity: expanded ? 1 : 0, marginLeft: expanded ? 8 : 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden whitespace-nowrap"
      >
        {label}
      </motion.span>
    </motion.button>
  );
}
