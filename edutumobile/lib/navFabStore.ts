import { useSyncExternalStore } from 'react';

/**
 * Global visibility state for the contextual bottom-nav action circle.
 *
 * The circle is rendered by the (app) layout, but some screens need to
 * drive it — e.g. the profile screen hides the Edit action once the
 * profile header scrolls out of view. A tiny module store (same pattern
 * as voiceModeStore) beats threading callbacks through the navigator.
 */
export interface NavFabState {
  /** True while the profile screen has scrolled past its header. */
  profileFabHidden: boolean;
}

let state: NavFabState = { profileFabHidden: false };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function setProfileFabHidden(hidden: boolean) {
  if (state.profileFabHidden === hidden) return;
  state = { ...state, profileFabHidden: hidden };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNavFabState(): NavFabState {
  return state;
}

export function useNavFabState(): NavFabState {
  return useSyncExternalStore(subscribe, getNavFabState, getNavFabState);
}
