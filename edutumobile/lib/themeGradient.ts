/**
 * Theme-derived gradients.
 *
 * Every committed surface on the opportunity pages used to paint
 * `[colors.accent, '#4331C9']` — the theme's accent smeared into a hardcoded
 * indigo-violet. In the default theme that reads as generic "AI product"
 * chrome, and in the other eight theme packs it is simply wrong: an emerald,
 * orange or crimson accent bleeding into violet has no relationship to the
 * palette the user picked.
 *
 * These helpers derive the second (and third) stop FROM the accent instead, so
 * a CTA is always a ramp of the user's own theme. The hue barely moves; what
 * changes is depth. That keeps the gradient legible as "one colour with
 * dimension" rather than two colours fighting.
 *
 * NOT for the AI brand mark. `AiOrbBadge` / `AiOrbIcon` are fixed identity
 * artwork and must look the same in every theme — see the note in
 * `components/ui/AiOrbBadge.tsx`.
 */

type Hsl = { h: number; s: number; l: number };

function hexToHsl(hex: string): Hsl | null {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (full.length !== 6 || /[^0-9a-fA-F]/.test(full)) return null;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return { h: h * 360, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];

  const toHex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v + m)) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * How far the deep stop rotates away from the accent hue. Cool accents drift
 * *up* the wheel (blue → indigo → violet) and warm ones drift *down* (orange →
 * red, rose → magenta), because those are the directions in which a colour
 * gets richer as it darkens. Greens sit between the two and stay put — rotating
 * an emerald in either direction turns it olive or teal, both of which read as
 * a different colour rather than a shadow of the same one.
 */
function shadowRotation(hue: number): number {
  if (hue >= 180 && hue <= 300) return 9; // cyan → blue → violet
  if (hue < 55 || hue > 320) return -9; // red/orange/rose
  return 0; // yellow-green → teal
}

/**
 * A two-stop ramp of the theme accent, for filled primary surfaces (CTAs, the
 * fit panel). `depth` scales how far the end stop falls — the default suits a
 * button; lower values suit a large panel where a steep ramp would band.
 */
export function accentGradient(
  accent: string,
  depth = 1,
): [string, string] {
  const hsl = hexToHsl(accent);
  // Unparseable accent (named colour, rgba…): a flat two-stop of itself is
  // never wrong, and beats throwing inside a render path.
  if (!hsl) return [accent, accent];

  const end: Hsl = {
    h: hsl.h + shadowRotation(hsl.h) * depth,
    // Slightly richer as it deepens, so the dark end doesn't go muddy — but
    // never on a near-neutral accent (graphite), where added saturation would
    // introduce a colour cast that isn't in the palette.
    s: hsl.s < 0.12 ? hsl.s : Math.min(0.96, hsl.s * (1 + 0.08 * depth)),
    l: Math.max(0.16, hsl.l * (1 - 0.32 * depth)),
  };

  return [accent, hslToHex(end)];
}

/**
 * Three stops for tall surfaces. The midpoint is the plain accent, so the top
 * lifts and the bottom sinks around the colour the user actually chose.
 */
export function accentGradientDeep(accent: string): [string, string, string] {
  const hsl = hexToHsl(accent);
  if (!hsl) return [accent, accent, accent];

  const start = hslToHex({
    h: hsl.h,
    s: hsl.s,
    l: Math.min(0.72, hsl.l * 1.1),
  });
  const [, end] = accentGradient(accent, 0.85);
  return [start, accent, end];
}
