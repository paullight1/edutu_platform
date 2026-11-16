import type { ThemeColors } from '../components/context/ThemeContext';

/**
 * A COMPLETE `ThemeColors` palette for suites that mock ThemeContext.
 *
 * Hand-written partial palettes used to be fine — screens only read a handful
 * of tokens. The shared illustrated-state system (`components/state`) changed
 * that: `useStateTokens` maps a state's hue onto `accent` / `accentLight` /
 * `mutedForeground` / `textSecondary` / `success` / `warning` / `error`, then
 * does string maths on the result. A missing token surfaces as
 * "Cannot read properties of undefined (reading 'length')" from stateTokens,
 * which reads like a product bug but is only an incomplete mock.
 *
 * Spread this instead of inlining a palette:
 *   colors: { ...require('../test-utils/themeColors').TEST_THEME_COLORS }
 *
 * Values are the light `default` pack, so snapshots stay stable.
 */
export const TEST_THEME_COLORS: ThemeColors = {
  background: '#FFFFFF',
  foreground: '#0F172A',
  card: '#F8FAFC',
  border: '#E2E8F0',
  accent: '#4F46E5',
  primary: '#4F46E5',
  accentLight: '#6366F1',
  muted: '#F1F5F9',
  mutedForeground: '#64748B',
  textSecondary: '#64748B',
  success: '#059669',
  warning: '#D97706',
  error: '#DC2626',
};
