import { useMemo } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { ScreenState } from './ScreenState';

/**
 * Per-state design tokens.
 *
 * This is the state system's answer to `components/onboarding/onboardingTokens.ts`,
 * and it borrows that file's central idea: every concept owns a hue, and the
 * whole surface — scene, wash, ring, action — is derived from it, so a screen
 * reads as one thought rather than a stack of unrelated boxes.
 *
 * HARD RULE — nothing in `components/state/` may contain a hex literal outside
 * this file. Edutu ships 9 theme packages × light/dark = 18 palettes, and the
 * primitive this system replaces (`components/ui/EmptyState.tsx`) hardcoded
 * slate hex, so it rendered correctly in exactly one of them. Every colour here
 * resolves from `useTheme()`, which makes all 18 correct by construction
 * instead of by inspection.
 */

/** Named hues. `flow` defers to the active theme accent — see `useStateTokens`. */
export type StateHue =
  | 'flow'
  | 'neutral'
  | 'danger'
  | 'offline'
  | 'locked'
  | 'denied'
  | 'success';

export interface StateTokens {
  /** The one saturated colour in the state. Drives scene, action and ring. */
  hue: string;
  /** Lighter partner, for gradient ends and secondary scene marks. */
  hueLight: string;
  /** Low-opacity hue fill behind line work and glyphs. */
  wash: string;
  /** Hairline in the hue, for rings and scene outlines. */
  ring: string;
  /** Elevated surface — cards and "paper" inside a scene. */
  surface: string;
  /** Hairline for surfaces. */
  surfaceLine: string;
  /** Placeholder bars inside a scene (a document line, a list row). */
  line: string;
  lineSoft: string;
  /** Copy. */
  title: string;
  body: string;
  /** Contrast colour for text sitting on top of `hue`. */
  onHue: string;
  isDark: boolean;
}

/**
 * Which hue each state speaks in.
 *
 * `empty:filtered` is deliberately neutral: a filter that matched nothing is
 * not a failure and must not borrow the error hue, or users read their own
 * search as something the app got wrong.
 */
export function hueForState(state: ScreenState): StateHue {
  switch (state.kind) {
    case 'empty':
      return state.reason === 'filtered' ? 'neutral' : 'flow';
    case 'error':
      return 'danger';
    case 'offline':
      return 'offline';
    case 'locked':
      return 'locked';
    case 'denied':
      return 'denied';
    case 'partial':
      return 'neutral';
    default:
      return 'flow';
  }
}

/**
 * Resolve a hue name to tokens against the live theme.
 *
 * `flow` maps to the theme accent so an empty Goals screen in the Forest pack
 * is green and the same screen in Crimson is red — the state belongs to the
 * user's chosen world, not to a palette we picked at build time.
 */
export function useStateTokens(hue: StateHue = 'flow'): StateTokens {
  const { colors, isDark } = useTheme();

  return useMemo(() => {
    const base: Record<StateHue, { hue: string; hueLight: string }> = {
      flow: { hue: colors.accent, hueLight: colors.accentLight },
      neutral: { hue: colors.mutedForeground, hueLight: colors.textSecondary },
      danger: { hue: colors.error, hueLight: colors.error },
      offline: { hue: colors.mutedForeground, hueLight: colors.textSecondary },
      locked: { hue: colors.accent, hueLight: colors.accentLight },
      denied: { hue: colors.warning, hueLight: colors.warning },
      success: { hue: colors.success, hueLight: colors.success },
    };

    const { hue: h, hueLight } = base[hue];

    // Opacity suffixes on an 8-digit hex are safe here because every input is a
    // 6-digit token from ThemeContext. rgba() would need a parse; this doesn't.
    const alpha = (hex: string, aa: string) => (hex.length === 7 ? `${hex}${aa}` : hex);

    return {
      hue: h,
      hueLight,
      wash: isDark ? 'rgba(255,255,255,0.05)' : alpha(h, '12'),
      ring: alpha(h, isDark ? '3D' : '2E'),
      surface: colors.card,
      surfaceLine: colors.border,
      line: isDark ? 'rgba(255,255,255,0.26)' : 'rgba(15,23,42,0.18)',
      lineSoft: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
      title: colors.foreground,
      body: colors.textSecondary,
      onHue: '#FFFFFF',
      isDark,
    };
  }, [colors, isDark, hue]);
}

/** Convenience: tokens for a given state in one call. */
export function useTokensForState(state: ScreenState): StateTokens {
  return useStateTokens(hueForState(state));
}

/**
 * Stage sizing. Tier 1 scenes get room to breathe; Tier 2 sits comfortably in a
 * list gap; Tier 3 is a spot mark beside a heading.
 */
export const stateStage = {
  hero: 220,
  scene: 148,
  tile: 64,
} as const;

/** Shared spacing for the copy block under any scene. */
export const stateLayout = {
  gutter: 28,
  sceneGap: 22,
  titleGap: 8,
  actionGap: 22,
  maxCopyWidth: 320,
} as const;

export const stateType = {
  title: { fontSize: 19, lineHeight: 25, fontWeight: '800' as const, letterSpacing: -0.3 },
  body: { fontSize: 14, lineHeight: 21, fontWeight: '500' as const, letterSpacing: -0.05 },
  action: { fontSize: 15, fontWeight: '700' as const, letterSpacing: -0.1 },
  quiet: { fontSize: 13, fontWeight: '600' as const, letterSpacing: -0.05 },
};
