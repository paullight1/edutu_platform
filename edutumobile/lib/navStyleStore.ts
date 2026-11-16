import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * Persisted shape + material of the bottom navigation bar.
 *
 * 'glass'  — the floating translucent pill with the detached morphing circle.
 *            Apple Liquid Glass on iOS 26+, blur fallback elsewhere.
 * 'fab'    — a conventional full-width opaque bar; the contextual action keeps
 *            its circle, floating above the bar's right edge.
 * 'tabs'   — a conventional full-width opaque bar; the contextual action is a
 *            plain item inside the bar, so nothing floats.
 * 'center' — a conventional full-width opaque bar with the contextual action
 *            raised over its centre, tabs split around it.
 *
 * The three bar styles differ only in where the contextual action lives; all
 * of them keep every action reachable.
 *
 * Module store (same pattern as voiceSettingsStore) so the layout can read it
 * synchronously without a provider.
 */
export type NavBarStyle = 'glass' | 'fab' | 'tabs' | 'center';

export const NAV_BAR_STYLES: NavBarStyle[] = ['glass', 'fab', 'tabs', 'center'];

/** True for every style that renders the conventional full-width bar. */
export function isBarStyle(style: NavBarStyle): boolean {
  return style !== 'glass';
}

export const DEFAULT_NAV_BAR_STYLE: NavBarStyle = 'glass';

export interface NavStyleSettings {
  style: NavBarStyle;
  hydrated: boolean;
}

const STORAGE_KEY = '@edutu/navBarStyle';

let state: NavStyleSettings = { style: DEFAULT_NAV_BAR_STYLE, hydrated: false };
const listeners = new Set<() => void>();
// Set once the user picks a style. An in-flight hydrate must not overwrite a
// fresher choice with the value it read before the tap.
let userChose = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ style: state.style })).catch(() => {});
}

let hydrating: Promise<void> | null = null;
/**
 * Read the saved style. Idempotent. `subscribe` calls this on first mount;
 * call it at app start to restore a solid bar before the nav's first paint.
 */
export function hydrateNavBarStyle(): Promise<void> {
  if (state.hydrated) return Promise.resolve();
  if (hydrating) return hydrating;
  hydrating = AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      const saved = raw ? JSON.parse(raw) : null;
      state = {
        style:
          userChose
            ? state.style
            : NAV_BAR_STYLES.includes(saved?.style)
              ? saved.style
              : DEFAULT_NAV_BAR_STYLE,
        hydrated: true,
      };
      emit();
    })
    .catch(() => {
      state = { ...state, hydrated: true };
      emit();
    });
  return hydrating;
}

export function setNavBarStyle(style: NavBarStyle) {
  userChose = true;
  if (state.style === style) return;
  state = { ...state, style };
  persist();
  emit();
}

export function getNavStyleSettings(): NavStyleSettings {
  return state;
}

function subscribe(listener: () => void) {
  void hydrateNavBarStyle();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNavStyleSettings(): NavStyleSettings {
  return useSyncExternalStore(subscribe, getNavStyleSettings, getNavStyleSettings);
}
