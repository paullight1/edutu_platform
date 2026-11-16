import { useSyncExternalStore } from 'react';

/**
 * Tiny external store that flags when the first-run WelcomeModal is on screen.
 *
 * The home surface has three "first launch" overlays that must not stack:
 * the WelcomeModal (this greeting), the WelcomeHintSystem (nav coach-marks)
 * and the LoginOfferModal (Pro promo). The greeting wins; the other two read
 * this flag and hold until it clears, so a brand-new user sees one thing at a
 * time instead of three overlapping sheets.
 */
let active = false;
const listeners = new Set<() => void>();

export function setWelcomeModalActive(next: boolean) {
  if (active === next) return;
  active = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return active;
}

/** React hook: `true` while the WelcomeModal greeting is visible. */
export function useWelcomeModalActive(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
