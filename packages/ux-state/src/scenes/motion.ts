import type { AnimId } from './types';

/**
 * A single keyframe.
 *
 * Deliberately tiny: translation, rotation, scale, opacity and a stroke-dash
 * fraction. Everything the eight motions need, and nothing that would force one
 * platform's animation model onto the other.
 *
 * `x`/`y` are in viewBox units. `dash` is a 0–1 fraction of the path length,
 * used only by `drawOn`.
 */
export interface Frame {
  x?: number;
  y?: number;
  rotate?: number;
  scale?: number;
  opacity?: number;
  dash?: number;
}

export interface AnimSpec {
  loop: boolean;
  durationMs: number;
  delayMs: number;
  /** Interpolated evenly across `durationMs`. Looping specs must end where they start. */
  frames: Frame[];
  /**
   * The pose to hold under reduced motion. This is the whole reason a scene can
   * be static without looking half-finished: `flyIn` rests just above its slot,
   * which still reads as "about to be saved" rather than as a broken animation.
   */
  rest: Frame;
}

/** Identity. Renderers use this for any layer with no `anim`. */
export const REST: Frame = { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1, dash: 0 };

export const ANIMS: Record<AnimId, AnimSpec> = {
  /** Ambient lift. The default for anything that should feel weightless. */
  float: {
    loop: true,
    durationMs: 4000,
    delayMs: 0,
    frames: [{ y: 0 }, { y: -5 }, { y: 0 }],
    rest: { y: 0 },
  },

  /** A card travelling into a slot — the gesture the user is about to learn. */
  flyIn: {
    loop: true,
    durationMs: 3400,
    delayMs: 400,
    frames: [
      { y: -14, rotate: -7 },
      { y: 6, rotate: -1 },
      { y: 2, rotate: -2 },
      { y: 2, rotate: -2 },
      { y: -14, rotate: -7 },
    ],
    rest: { y: -14, rotate: -7 },
  },

  /** A small marker asking for attention without moving. */
  blip: {
    loop: true,
    durationMs: 2200,
    delayMs: 0,
    frames: [{ opacity: 0.4 }, { opacity: 1 }, { opacity: 0.4 }],
    rest: { opacity: 1 },
  },

  /** Something that has come loose. Reserved for offline and hard failures. */
  shiver: {
    loop: true,
    durationMs: 4000,
    delayMs: 0,
    frames: [{ x: 0 }, { x: -2 }, { x: 0 }, { x: 2 }, { x: 0 }],
    rest: { x: 0 },
  },

  /** A stroke drawing itself on. `dash` runs 1 → 0 as the line completes. */
  drawOn: {
    loop: false,
    durationMs: 900,
    delayMs: 120,
    frames: [
      { dash: 1, opacity: 1 },
      { dash: 0, opacity: 1 },
    ],
    rest: { dash: 0, opacity: 1 },
  },

  /** An expanding ring. Used for radar, focus and "we are looking". */
  pulse: {
    loop: true,
    durationMs: 2600,
    delayMs: 0,
    frames: [
      { scale: 0.86, opacity: 0.55 },
      { scale: 1.1, opacity: 0 },
      { scale: 0.86, opacity: 0.55 },
    ],
    rest: { scale: 1, opacity: 0.45 },
  },

  /** Continuous rotation, for anything that reads as a mechanism. */
  orbit: {
    loop: true,
    durationMs: 5200,
    delayMs: 0,
    frames: [{ rotate: 0 }, { rotate: 180 }, { rotate: 360 }],
    rest: { rotate: 0 },
  },

  /** A sweep across a surface. The loading scene's shimmer. */
  scan: {
    loop: true,
    durationMs: 1800,
    delayMs: 0,
    frames: [
      { x: -60, opacity: 0 },
      { x: 0, opacity: 0.35 },
      { x: 60, opacity: 0 },
      { x: -60, opacity: 0 },
    ],
    rest: { x: 0, opacity: 0.18 },
  },
};
