/**
 * One visual system for every Edutu home-screen widget (iOS side; the Android
 * layouts mirror these values in res/values + res/values-night colour
 * resources — keep both in sync when tuning).
 *
 * Adaptive navy: deep brand navy surfaces when the phone is in dark mode,
 * clean white when it's light. Branding is the logo mark only — never the
 * word "Edutu" as a label. All text colours hit >= 4.5:1 on their surface.
 */

export type WidgetColorScheme = 'light' | 'dark';

export interface WidgetTheme {
  /** Card surface. */
  bg: string;
  /** Secondary surface: date rails, faux input pills, inset rows. */
  bgInset: string;
  /** Primary text. */
  ink: string;
  /** Secondary text (organizations, metadata). */
  sub: string;
  /** Tertiary text (hints, footers) — still >= 4.5:1. */
  faint: string;
  /** Brand accent for rank numbers / icons on this surface. */
  accent: string;
  /** Match-percentage pill. */
  pillBg: string;
  pillInk: string;
  /** Urgency text colours (not chips) tuned per surface. */
  urgency: { red: string; amber: string; green: string; slate: string };
}

export const WIDGET_THEMES: Record<WidgetColorScheme, WidgetTheme> = {
  light: {
    bg: '#FFFFFF',
    bgInset: '#EEF2FF',
    ink: '#101828',
    sub: '#475467',
    faint: '#667085',
    accent: '#3563E9',
    pillBg: '#E2EAFF',
    pillInk: '#173B8F',
    urgency: { red: '#DC2626', amber: '#B45309', green: '#047857', slate: '#64748B' },
  },
  dark: {
    bg: '#171A4F',
    bgInset: '#232866',
    ink: '#FFFFFF',
    sub: '#C3CBEE',
    faint: '#8A90C0',
    accent: '#9DB4FF',
    pillBg: '#3563E9',
    pillInk: '#FFFFFF',
    urgency: { red: '#F87171', amber: '#FBBF24', green: '#34D399', slate: '#94A3B8' },
  },
};

/**
 * Deadline chips are filled pills with white text; the fills are identical in
 * both themes (they're their own surface) and every one keeps white text at
 * >= 4.5:1.
 */
export const CHIP_COLORS = {
  red: '#E5484D',
  amber: '#B45309',
  green: '#047857',
  slate: '#475569',
} as const;

export type ChipTone = keyof typeof CHIP_COLORS;

export function getWidgetTheme(colorScheme?: string): WidgetTheme {
  return WIDGET_THEMES[colorScheme === 'dark' ? 'dark' : 'light'];
}
