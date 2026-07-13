import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Guest ("browse without login") mode.
 *
 * A visitor can tap "Continue without login" on the welcome screen to preview
 * Edutu without an account. Only the home screen and opportunity detail are
 * reachable — every other route and the Apply/Save actions raise the auth wall.
 *
 * Clerk has no session for a guest, so `isSignedIn` is false; this local flag
 * is what distinguishes a deliberate guest from someone who simply hasn't
 * signed in yet. It lives in a tiny module store (same pattern as
 * navFabStore / voiceModeStore) so the splash and the (app) layout can both
 * read it synchronously once hydrated, without threading a provider through
 * every routing decision.
 */

const STORAGE_KEY = 'edutu.guestMode.v1';

export interface GuestModeState {
  /** True once the persisted flag has been read back from disk. */
  hydrated: boolean;
  /** True when the visitor chose to browse without logging in. */
  isGuest: boolean;
}

let state: GuestModeState = { hydrated: false, isGuest: false };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setState(next: Partial<GuestModeState>) {
  const merged = { ...state, ...next };
  if (merged.hydrated === state.hydrated && merged.isGuest === state.isGuest) {
    return;
  }
  state = merged;
  emit();
}

// Hydrate exactly once, kicked off at module import so the very first routing
// decision (splash → app) already has the real value instead of flashing the
// welcome screen at a returning guest.
let hydrating: Promise<void> | null = null;
export function hydrateGuestMode(): Promise<void> {
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      setState({ hydrated: true, isGuest: raw === 'true' });
    } catch {
      // Storage unavailable — treat as "not a guest" but mark hydrated so the
      // app doesn't hang on the splash forever.
      setState({ hydrated: true });
    }
  })();
  return hydrating;
}

void hydrateGuestMode();

/** Enter guest mode (persisted) — called by "Continue without login". */
export function enterGuestMode() {
  setState({ isGuest: true, hydrated: true });
  void AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => {});
}

/**
 * Leave guest mode. Called when a guest signs in/up (they become a real user)
 * or signs out. No-ops when already not a guest so we never emit needlessly.
 */
export function exitGuestMode() {
  if (!state.isGuest) return;
  setState({ isGuest: false });
  void AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): GuestModeState {
  return state;
}

export function getGuestModeState(): GuestModeState {
  return state;
}

export function useGuestMode(): GuestModeState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ─── Route access ────────────────────────────────────────────────────────────

// Sibling routes under /opportunities that are LISTS, not a single opportunity
// — guests may open a specific opportunity but not these browse pages.
const OPPORTUNITY_NON_DETAIL = new Set(['featured', 'submissions', 'submit']);

/**
 * Which routes a guest may view. Only the home screen and a single opportunity's
 * detail page. Everything else raises the auth wall.
 */
export function isGuestAllowedPath(pathname: string | null | undefined): boolean {
  const p = (pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  if (p === '/') return true; // home
  const detail = p.match(/^\/opportunities\/([^/]+)$/);
  if (detail && !OPPORTUNITY_NON_DETAIL.has(detail[1])) return true;
  return false;
}
