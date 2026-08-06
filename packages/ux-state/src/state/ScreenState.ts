/**
 * The one state contract every data-bearing screen renders through.
 *
 * Before this existed, 50 of the app's 56 screens hand-rolled their own
 * loading/empty/error handling, which is why the same condition looked
 * different on every screen and why whole classes of state (filtered-empty,
 * stale data, permission denied) existed nowhere at all.
 *
 * CONTRACT: a screen *declares* a state. It never *composes* one. Which scene,
 * which hue, which copy and which actions appear are decisions that live in
 * `StateView`, so they can be changed once for the whole app.
 */
export type ScreenState =
  | { kind: 'loading' }
  | { kind: 'refreshing' }
  /**
   * `firstRun` — the user has genuinely nothing here yet; this is an
   * onboarding moment and gets a hero scene.
   * `filtered` — there is data, but the current filters/search exclude it.
   * A completely different problem with a completely different fix, and the
   * app previously rendered both with the same words.
   */
  | { kind: 'empty'; reason: 'firstRun' | 'filtered' }
  /**
   * Cached content is showing but the refresh failed. `staleAt` is null when
   * the screen did not record when it cached — the copy degrades to "saved
   * copy" rather than inventing a time.
   */
  | { kind: 'partial'; staleAt: number | null }
  | { kind: 'error'; cause: ErrorCause }
  | { kind: 'offline' }
  | { kind: 'locked'; reason: 'pro' | 'guest' | 'module' }
  | { kind: 'denied'; permission: 'notifications' | 'camera' | 'calendar' | 'photos' }
  | { kind: 'ready' };

export type ErrorCause = 'network' | 'auth' | 'notFound' | 'server' | 'timeout';

export type StateKind = ScreenState['kind'];

/**
 * Map a thrown/returned error onto the taxonomy.
 *
 * The app currently renders 401, 404, timeout and 500 identically, which means
 * "sign in again", "this was removed" and "our fault, try again" all read as
 * the same dead end. Recovery copy and actions can only differ if the cause
 * does.
 */
export function classifyError(error: unknown): ErrorCause {
  if (!error) return 'server';

  const status =
    typeof error === 'object' && error !== null
      ? (error as { status?: number; statusCode?: number; response?: { status?: number } }).status ??
        (error as { statusCode?: number }).statusCode ??
        (error as { response?: { status?: number } }).response?.status
      : undefined;

  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'notFound';
  if (typeof status === 'number' && status >= 500) return 'server';

  const message = (
    error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  ).toLowerCase();

  if (message.includes('abort') || message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }
  if (
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('connection')
  ) {
    return 'network';
  }

  return 'server';
}

export interface ScreenStateInput {
  /** The fetched collection or record. Emptiness is derived from it. */
  data?: unknown;
  loading?: boolean;
  refreshing?: boolean;
  error?: unknown;
  /** Device connectivity, normally from `useOffline()`. */
  offline?: boolean;
  /**
   * True when a search term or any filter is applied. This is the *only* way
   * `empty:firstRun` and `empty:filtered` can be told apart, so screens with
   * filters must pass it.
   */
  filtersActive?: boolean;
  /** Gate results, if the screen is behind one. */
  locked?: 'pro' | 'guest' | 'module' | null;
  denied?: 'notifications' | 'camera' | 'calendar' | 'photos' | null;
  /** When cached content is being shown, the time it was fetched. */
  staleAt?: number | null;
}

function isEmpty(data: unknown): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object') return Object.keys(data as object).length === 0;
  return false;
}

/**
 * Derive the state union from the flags screens already track.
 *
 * Pure and React-free on purpose: this package must resolve identically from
 * Metro, Vite, Jest and Vitest, and a `react` import from outside either app's
 * root drags in a resolution problem in all four. Each app wraps this in its
 * own three-line `useScreenState` hook instead.
 *
 * Deliberately an adapter, not a data layer: adopting the state system must not
 * require rewriting how a screen fetches. Precedence is ordered by what the
 * user can act on — a gate outranks an error, because retrying a request you
 * are not allowed to make is not a recovery path; and cached-content-plus-error
 * outranks a bare error, because showing something beats showing nothing.
 */
export function deriveState(input: ScreenStateInput): ScreenState {
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

  if (locked) return { kind: 'locked', reason: locked };
  if (denied) return { kind: 'denied', permission: denied };

  const empty = isEmpty(data);

  // Cached content + a failed refresh: keep the content, flag the staleness.
  // No `Date.now()` fallback here — this runs during render, and a clock read
  // during render is a fresh value on every re-render, which would make the
  // "updated 3m ago" label drift on unrelated state changes.
  if (error && !empty) return { kind: 'partial', staleAt: staleAt ?? null };

  if (error) {
    const cause = classifyError(error);
    // Offline is its own state with its own recovery, not a network error.
    if (offline || cause === 'network') return { kind: 'offline' };
    return { kind: 'error', cause };
  }

  if (offline && empty && !loading) return { kind: 'offline' };

  // Refreshing with content already on screen is a ready screen with a
  // spinner — it must never blank out what the user is reading.
  if (refreshing && !empty) return { kind: 'refreshing' };
  if (loading && empty) return { kind: 'loading' };

  if (empty) return { kind: 'empty', reason: filtersActive ? 'filtered' : 'firstRun' };

  return { kind: 'ready' };
}

/** True when the screen should render its own content rather than a StateView. */
export function showsContent(state: ScreenState): boolean {
  return state.kind === 'ready' || state.kind === 'refreshing' || state.kind === 'partial';
}
