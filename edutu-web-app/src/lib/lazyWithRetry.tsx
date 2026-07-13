import { lazy, type ComponentType } from "react";

const RELOAD_FLAG = "edutu:chunk-reloaded";

/**
 * `React.lazy` hardened against dynamic-import (chunk) failures — the most
 * common cause of a blank "we could not load this page" appearing at random
 * when navigating a code-split SPA.
 *
 * A route chunk can fail to load either:
 *  - transiently — a dev-server dependency re-optimization mid-session, or a
 *    momentary network blip; or
 *  - permanently — a stale build: after a deploy the previous hashed chunk no
 *    longer exists for a client still running the old index.html.
 *
 * Strategy: retry the import once after a short delay (clears transient
 * failures without a visible reload); if it still fails, force a single full
 * reload to fetch the fresh index.html + chunk manifest (clears stale chunks).
 * A sessionStorage flag prevents a reload loop, and any successful load clears
 * it so a later genuine failure can still trigger one recovery reload.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirror React.lazy's own generic so components with specific props stay assignable
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        const mod = await factory();
        sessionStorage.removeItem(RELOAD_FLAG);
        return mod;
      } catch (retryError) {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, "1");
          window.location.reload();
          // Never resolves — the reload replaces this document.
          return new Promise<{ default: T }>(() => {});
        }
        throw retryError;
      }
    }
  });
}
