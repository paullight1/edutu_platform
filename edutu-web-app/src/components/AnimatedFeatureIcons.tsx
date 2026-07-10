import { motion, useReducedMotion } from "framer-motion";

/**
 * Big, illustration-style animated feature icons for the landing "Built for
 * the Ambitious" grid. Each draws with `currentColor`, so the parent's accent
 * text-colour drives the stroke/fill. Motion loops gently and is fully
 * disabled when the user prefers reduced motion.
 */

interface IconProps {
  size?: number;
  className?: string;
}

const loop = (extra: Record<string, unknown> = {}) => ({
  repeat: Infinity,
  ease: "easeInOut" as const,
  ...extra,
});

/** Opportunity Matching — a bold sparkle that breathes, with twinkling stars. */
export function OpportunityMatchIcon({ size = 40, className }: IconProps) {
  const reduce = useReducedMotion();
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-hidden
    >
      <motion.path
        d="M24 4 C25.5 18 30 22.5 44 24 C30 25.5 25.5 30 24 44 C22.5 30 18 25.5 4 24 C18 22.5 22.5 18 24 4 Z"
        fill="currentColor"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        animate={reduce ? undefined : { scale: [1, 1.09, 1], rotate: [0, 6, 0] }}
        transition={loop({ duration: 3.2 })}
      />
      <motion.path
        d="M11 8 C11.5 11 12.5 12 15.5 12.5 C12.5 13 11.5 14 11 17 C10.5 14 9.5 13 6.5 12.5 C9.5 12 10.5 11 11 8 Z"
        fill="currentColor"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        animate={reduce ? undefined : { scale: [0.6, 1, 0.6], opacity: [0.4, 1, 0.4] }}
        transition={loop({ duration: 2.4 })}
      />
      <motion.path
        d="M39 30 C39.4 32.2 40.1 32.9 42.3 33.3 C40.1 33.7 39.4 34.4 39 36.6 C38.6 34.4 37.9 33.7 35.7 33.3 C37.9 32.9 38.6 32.2 39 30 Z"
        fill="currentColor"
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        animate={reduce ? undefined : { scale: [1, 0.5, 1], opacity: [1, 0.4, 1] }}
        transition={loop({ duration: 2.4, delay: 0.6 })}
      />
    </svg>
  );
}

/** Deadline Awareness — a calendar with a pulsing "closing soon" marker. */
export function DeadlineIcon({ size = 40, className }: IconProps) {
  const reduce = useReducedMotion();
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="7" y="10" width="34" height="31" rx="5" />
      <line x1="7" y1="19" x2="41" y2="19" />
      <line x1="16" y1="6" x2="16" y2="13" />
      <line x1="32" y1="6" x2="32" y2="13" />
      <circle cx="24" cy="30" r="3" fill="currentColor" stroke="none" />
      {!reduce && (
        <motion.circle
          cx="24"
          cy="30"
          r="3"
          fill="none"
          strokeWidth={2}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          animate={{ scale: [1, 3], opacity: [0.7, 0] }}
          transition={loop({ duration: 1.8 })}
        />
      )}
    </svg>
  );
}

/** Global Network — a wire globe with nodes orbiting its edge. */
export function GlobalNetworkIcon({ size = 40, className }: IconProps) {
  const reduce = useReducedMotion();
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="24" cy="24" r="15" />
      <ellipse cx="24" cy="24" rx="6.5" ry="15" />
      <line x1="9" y1="24" x2="39" y2="24" />
      <path d="M11 16 C16 19 32 19 37 16" />
      <path d="M11 32 C16 29 32 29 37 32" />
      <motion.g
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
        animate={reduce ? undefined : { rotate: 360 }}
        transition={loop({ duration: 14, ease: "linear" })}
      >
        <circle cx="42" cy="24" r="3" fill="currentColor" stroke="none" />
        <circle cx="6" cy="24" r="2.4" fill="currentColor" stroke="none" />
        <circle cx="24" cy="7" r="2.2" fill="currentColor" stroke="none" opacity="0.7" />
      </motion.g>
    </svg>
  );
}

/** Application Tracking — equalizer bars rising like live progress. */
export function TrackingIcon({ size = 40, className }: IconProps) {
  const reduce = useReducedMotion();
  const bars = [
    { x: 10, delay: 0 },
    { x: 21, delay: 0.25 },
    { x: 32, delay: 0.5 },
  ];
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 8 L8 40 L40 40" />
      {bars.map((bar) => (
        <motion.rect
          key={bar.x}
          x={bar.x}
          y="18"
          width="6"
          height="18"
          rx="2"
          fill="currentColor"
          stroke="none"
          style={{ transformBox: "fill-box", transformOrigin: "bottom" }}
          animate={reduce ? undefined : { scaleY: [0.35, 1, 0.55, 0.9, 0.35] }}
          transition={loop({ duration: 2.6, delay: bar.delay })}
        />
      ))}
    </svg>
  );
}
