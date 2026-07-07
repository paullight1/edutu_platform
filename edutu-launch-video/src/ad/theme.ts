import { Easing, interpolate } from "remotion";
import { loadFont } from "@remotion/google-fonts/Outfit";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "600", "700", "800", "900"],
  subsets: ["latin"],
});

export const FONT = fontFamily;

export const NAVY = "#050914";
export const NAVY2 = "#0C0F1A";
export const BLUE = "#2563EB";
export const BLUE_BRIGHT = "#3B82F6";
export const BLUE_LIGHT = "#60A5FA";
export const GOLD = "#F6B64A";
export const GOLD_DEEP = "#D98F1F";
export const GREEN = "#22C55E";
export const RED = "#EF4444";
export const AMBER = "#F59E0B";
export const TEXT = "#F8FAFC";
export const MUTED = "#A9C3F8";
export const CARD = "rgba(255,255,255,0.06)";
export const CARD_SOLID = "#131A2C";
export const BORDER = "rgba(255,255,255,0.14)";

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN = Easing.bezier(0.7, 0, 0.84, 0);
export const EASE_SOFT = Easing.bezier(0.45, 0, 0.55, 1);

export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

/** 0→1 ease-out progress starting at `start`, lasting `dur` frames. */
export const prog = (frame: number, start: number, dur: number) =>
  interpolate(frame, [start, start + dur], [0, 1], {
    ...clamp,
    easing: EASE_OUT,
  });

/** Scene-level fade: in over `inLen`, out over `outLen` before `total`. */
export const sceneFade = (
  frame: number,
  total: number,
  inLen = 12,
  outLen = 14,
) => {
  const enter = interpolate(frame, [0, inLen], [0, 1], {
    ...clamp,
    easing: EASE_OUT,
  });
  const exit = interpolate(frame, [total - outLen, total], [1, 0], {
    ...clamp,
    easing: EASE_IN,
  });
  return Math.min(enter, exit);
};

/** Standard rise-in: opacity + translateY, ease-out. */
export const rise = (
  frame: number,
  start: number,
  dur = 22,
  dist = 46,
): { opacity: number; transform: string } => {
  const p = prog(frame, start, dur);
  return {
    opacity: p,
    transform: `translateY(${(1 - p) * dist}px)`,
  };
};
