import { useSyncExternalStore } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

/**
 * Global scroll-direction state driving the bottom-nav pill's compact mode
 * (Instagram-style): scrolling down shrinks the pill to icons-only; scrolling
 * up — or landing near the top — restores the full pill with labels.
 *
 * Same tiny module-store pattern as navFabStore/voiceModeStore: screens feed
 * it from their scroll handlers, the (app) layout consumes it.
 */

let compact = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function setNavCompact(next: boolean) {
  if (compact === next) return;
  compact = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => compact;

export function useNavCompact(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Hysteresis so the pill doesn't flap on tiny finger jitters: it takes a
// deliberate downward drag to shrink, a smaller upward drag to restore, and
// the top of the list always restores.
const TOP_ALWAYS_EXPANDED = 48;
const DOWN_THRESHOLD = 18;
const UP_THRESHOLD = 10;

/**
 * Returns an onScroll handler screens attach to their main scrollable
 * (`scrollEventThrottle={16}`). Create one per screen (module-level or in a
 * ref) — it keeps its own last-offset state. Compose freely with existing
 * onScroll work.
 */
export function createNavScrollHandler() {
  let lastY = 0;
  return (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    // Ignore iOS rubber-band bounce (negative offsets) entirely.
    if (y <= 0) {
      lastY = 0;
      setNavCompact(false);
      return;
    }
    if (y < TOP_ALWAYS_EXPANDED) {
      lastY = y;
      setNavCompact(false);
      return;
    }
    const delta = y - lastY;
    if (delta > DOWN_THRESHOLD) {
      lastY = y;
      setNavCompact(true);
    } else if (delta < -UP_THRESHOLD) {
      lastY = y;
      setNavCompact(false);
    }
  };
}
