import { useMemo } from 'react';
import { deriveState, type ScreenState, type ScreenStateInput } from '@edutu/ux-state/state';

/**
 * Derive the state union from the flags a screen already tracks.
 *
 * The precedence rules live in `@edutu/ux-state/state` so this app and the
 * mobile app cannot disagree about what a failed refresh over cached content
 * means. Only the memoisation is local — the shared package is deliberately
 * React-free, because a `react` import from outside an app root fails to
 * resolve under Vite, Vitest, Metro and Jest alike.
 */
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
