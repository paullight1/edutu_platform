import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

interface CountUpOptions {
  /** Animation length in ms. */
  duration?: number;
  /** Only run once, the first time the element scrolls into view. */
  once?: boolean;
}

/**
 * Animates a number from 0 → `target` when its element scrolls into view.
 * Respects `prefers-reduced-motion` (jumps straight to the final value) and
 * cleans up its animation frame on unmount.
 *
 * Reusable across the Impact page stat cards and the home Impact band.
 *
 *   const { ref, value } = useCountUp<HTMLDivElement>(67000);
 *   <div ref={ref}>{Math.round(value).toLocaleString()}</div>
 */
export function useCountUp<T extends HTMLElement = HTMLDivElement>(
  target: number,
  { duration = 1800, once = true }: CountUpOptions = {},
) {
  const ref = useRef<T>(null);
  const inView = useInView(ref, { once, margin: "-60px" });
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;

    if (reduceMotion) {
      setValue(target);
      return;
    }

    let frame = 0;
    let startTime: number | null = null;
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (timestamp: number) => {
      if (startTime === null) startTime = timestamp;
      const progress = Math.min(1, (timestamp - startTime) / duration);
      setValue(target * easeOutCubic(progress));

      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        setValue(target);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [inView, reduceMotion, target, duration]);

  return { ref, value, inView };
}
