import { useTheme } from '../../context/ThemeContext';

/**
 * Shared palette for the SVG illustration set.
 *
 * Illustrations are drawn in code rather than shipped as PNGs so they inherit
 * the active theme pack, stay crisp at any size, cost nothing in bundle
 * weight, and read correctly in both light and dark mode. Every illustration
 * takes its colours from here so the set looks like one family.
 */
export interface IllustrationPalette {
  /** Primary accent — the one saturated colour in the drawing. */
  accent: string;
  accentLight: string;
  /** Accent at low opacity, for fills behind the line work. */
  accentWash: string;
  /** "Paper" fill. Stays near-white in light mode, elevated slate in dark. */
  paper: string;
  /** Outline colour for paper edges. */
  paperLine: string;
  /** Placeholder text lines inside a document. */
  line: string;
  lineSoft: string;
  /** Background blobs behind the subject. */
  blob: string;
  isDark: boolean;
}

export function useIllustrationPalette(accentOverride?: string): IllustrationPalette {
  const { colors, isDark } = useTheme();
  const accent = accentOverride || colors.primary;

  return {
    accent,
    accentLight: colors.accentLight || accent,
    accentWash: isDark ? 'rgba(255,255,255,0.06)' : `${accent}14`,
    paper: isDark ? '#1E293B' : '#FFFFFF',
    paperLine: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.10)',
    line: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.20)',
    lineSoft: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.09)',
    blob: isDark ? 'rgba(99,102,241,0.14)' : `${accent}12`,
    isDark,
  };
}

export interface IllustrationProps {
  /** Rendered width; height follows the illustration's own aspect ratio. */
  size?: number;
  /** Override the accent, e.g. to match a template's colour. */
  accent?: string;
}
