import { useEffect, useState } from 'react';

/**
 * Pure progression model for a staggered reveal: how many items should be visible
 * after `elapsedMs`. The first item shows immediately, then one more every `stepMs`.
 */
export function computeRevealCount(
  elapsedMs: number,
  total: number,
  stepMs: number,
): number {
  if (total <= 0 || elapsedMs < 0) return 0;
  if (stepMs <= 0) return total;
  return Math.min(total, 1 + Math.floor(elapsedMs / stepMs));
}

export interface StaggeredRevealOptions {
  stepMs?: number;
  /** When false, all items are shown at once (e.g. after generation finishes). */
  enabled?: boolean;
}

/**
 * Reveals items one-by-one so a freshly generated plan assembles visibly instead
 * of appearing all at once. Returns the number of items currently visible.
 */
export function useStaggeredReveal(
  total: number,
  options: StaggeredRevealOptions = {},
): number {
  const { stepMs = 220, enabled = true } = options;
  const [count, setCount] = useState(() =>
    enabled ? Math.min(total, 1) : total,
  );

  // Restart the progression whenever the inputs change — adjust-during-render
  // (React's documented alternative to a state-resetting effect). The effect
  // below then only schedules the interval; sets inside timer callbacks are
  // fine.
  const revealKey = `${total}|${stepMs}|${enabled}`;
  const [prevRevealKey, setPrevRevealKey] = useState(revealKey);
  if (prevRevealKey !== revealKey) {
    setPrevRevealKey(revealKey);
    setCount(!enabled || total <= 1 ? total : 1);
  }

  useEffect(() => {
    if (!enabled || total <= 1) return;

    let current = 1;
    const timer = setInterval(() => {
      current += 1;
      setCount(current);
      if (current >= total) clearInterval(timer);
    }, stepMs);

    return () => clearInterval(timer);
  }, [total, stepMs, enabled]);

  return count;
}
