import { useMemo } from 'react';
import { useReducedMotion as useSystemReducedMotion } from 'react-native-reanimated';
import { useTheme } from '../components/context/ThemeContext';
import { getMotion, type Motion } from '../lib/motion';

/**
 * The motion set for the current user.
 *
 * Reduced motion is honored when EITHER source asks for it:
 *  - the in-app Settings toggle (`ThemeContext.reducedMotion`), and
 *  - the OS-level accessibility setting, via Reanimated's `useReducedMotion`.
 *
 * The app previously read only the first, so a user who had set "Reduce Motion"
 * in iOS Settings and never opened Edutu's own settings screen still got every
 * loop and spring. Checking both is the whole point of routing motion through
 * one hook.
 */
export function useMotion(): Motion {
  const { reducedMotion } = useTheme();
  const systemReduced = useSystemReducedMotion();
  const reduced = reducedMotion || systemReduced;

  return useMemo(() => getMotion(reduced), [reduced]);
}
