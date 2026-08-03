import { useMemo } from 'react';
import { deriveState, type ScreenState, type ScreenStateInput } from '@edutu/ux-state/state';

/**
 * The state contract now lives in `@edutu/ux-state/state` so the web app renders
 * the same union rather than a hand-copied duplicate that drifts.
 *
 * This file stays because every existing screen import and the existing test
 * suite address the contract by this path. The shared package is deliberately
 * React-free — a `react` import from outside the app root fails to resolve under
 * Metro, Jest, Vite and Vitest alike — so the memoised hook lives here and the
 * precedence rules, which are the part worth sharing, live in the package.
 */
export {
  classifyError,
  deriveState,
  showsContent,
  type ErrorCause,
  type ScreenState,
  type ScreenStateInput,
  type StateKind,
} from '@edutu/ux-state/state';

export function useScreenState(input: ScreenStateInput): ScreenState {
  const {
    data,
    loading = false,
    refreshing = false,
    error,
    offline = false,
    filtersActive = false,
    locked = null,
    denied = null,
    staleAt = null,
  } = input;

  return useMemo(
    () =>
      deriveState({
        data,
        loading,
        refreshing,
        error,
        offline,
        filtersActive,
        locked,
        denied,
        staleAt,
      }),
    [data, loading, refreshing, error, offline, filtersActive, locked, denied, staleAt],
  );
}
