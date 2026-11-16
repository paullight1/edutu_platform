import { Easing } from 'react-native-reanimated';

/**
 * Shared motion language.
 *
 * Two problems this solves. First, every animated surface in the app picked its
 * own durations and springs, so nothing felt like it came from one product.
 * Second — and this is the important one — `reducedMotion` has lived in
 * ThemeContext for months but only a minority of animated files ever read it,
 * which made every new animation an accessibility regression by default.
 *
 * Here, honoring the preference is the default: call `useMotion()` and the
 * durations you get back are already zero when the user asked for less motion.
 * You have to go out of your way to build something that ignores it.
 *
 * Import `useMotion` in components. The raw constants below are exported for
 * static contexts (Reanimated layout animations declared outside a component).
 */

export const DURATION = {
  /** Micro-feedback: a press, a tick. */
  instant: 120,
  /** Standard element entry/exit. */
  quick: 200,
  /** Surfaces: sheets, dialogs, state swaps. */
  base: 280,
  /** Deliberate, attention-carrying moves. */
  slow: 420,
  /** Scene-scale storytelling beats. */
  scene: 620,
} as const;

export const EASING = {
  /** Entering the screen — decelerate into place. */
  enter: Easing.out(Easing.cubic),
  /** Leaving — accelerate away. */
  exit: Easing.in(Easing.cubic),
  /** Moving between two on-screen positions. */
  move: Easing.inOut(Easing.cubic),
  /** Ambient loops: no hard stops at either end. */
  loop: Easing.inOut(Easing.sin),
} as const;

export const SPRING = {
  /** Default surface spring — settles without visible wobble. */
  gentle: { damping: 16, stiffness: 170 },
  /** Something that should feel like it *landed*. */
  land: { damping: 13, stiffness: 190 },
  /** Snappy, for controls that follow a finger. */
  snap: { damping: 20, stiffness: 260 },
} as const;

/**
 * Entry choreography. A list whose rows all appear at once reads as a flash;
 * a small per-item offset makes it read as arriving.
 */
export const STAGGER_MS = 40;
/** Cap so a long list's last row is not left waiting behind the first nine. */
export const STAGGER_MAX_INDEX = 9;

export function staggerDelay(index: number, step: number = STAGGER_MS): number {
  return Math.min(index, STAGGER_MAX_INDEX) * step;
}

export interface Motion {
  /** True when the user (or the OS) asked for reduced motion. */
  reduced: boolean;
  /** Durations — all 0 when reduced, so `withTiming` resolves instantly. */
  duration: typeof DURATION;
  easing: typeof EASING;
  /** Springs degrade to a critically-damped settle when reduced. */
  spring: typeof SPRING;
  /** 0 when reduced, so staggered lists appear at once instead of crawling. */
  stagger: (index: number, step?: number) => number;
  /**
   * Guard for ambient loops. Returns false when reduced — a permanently
   * breathing scene is the single worst offender for motion sensitivity, and
   * every Tier 1 scene must gate its loop on this.
   */
  allowLoop: boolean;
}

const ZERO_DURATION = {
  instant: 0,
  quick: 0,
  base: 0,
  slow: 0,
  scene: 0,
} as const;

const STILL_SPRING = {
  gentle: { damping: 100, stiffness: 300 },
  land: { damping: 100, stiffness: 300 },
  snap: { damping: 100, stiffness: 300 },
} as const;

/**
 * Build the motion set for a given preference.
 *
 * Kept separate from the hook so tests can assert the reduced set without
 * standing up a ThemeProvider.
 */
export function getMotion(reduced: boolean): Motion {
  return {
    reduced,
    duration: reduced ? (ZERO_DURATION as unknown as typeof DURATION) : DURATION,
    easing: EASING,
    spring: reduced ? (STILL_SPRING as unknown as typeof SPRING) : SPRING,
    stagger: reduced ? () => 0 : staggerDelay,
    allowLoop: !reduced,
  };
}
