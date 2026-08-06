import type { HueRole, HueTokens } from '@edutu/ux-state/scenes';

/**
 * Resolve a scene hue to real colours from the app's CSS custom properties.
 *
 * Every value is an `rgb(var(--token))` expression rather than a literal, so a
 * scene follows the active theme pack and the light/dark class on <html>
 * without this file knowing which pack is on. That is the whole reason the
 * shared geometry package refuses to carry colour.
 */
const v = (token: string): string => `rgb(var(${token}))`;

const HUE_TOKEN: Record<HueRole, string> = {
  // `flow` defers to the brand ramp, which every theme pack overrides — so an
  // empty Goals screen is violet in the Violet pack without any extra wiring.
  flow: '--color-brand-600',
  neutral: '--color-neutral-500',
  danger: '--color-danger-500',
  offline: '--color-neutral-500',
  locked: '--color-brand-600',
  denied: '--color-warning-500',
  success: '--color-success-500',
};

export function hueTokens(hue: HueRole): HueTokens {
  return {
    hue: v(HUE_TOKEN[hue]),
    soft: v('--color-scene-soft'),
    plate: v('--color-scene-plate'),
    ink: v('--text-primary'),
    inkSoft: v('--text-secondary'),
    surface: v('--surface-layer'),
    surfaceLine: v('--color-neutral-200'),
  };
}
