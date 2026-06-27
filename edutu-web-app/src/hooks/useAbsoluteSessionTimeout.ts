import { useEffect } from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";

const SESSION_STARTED_KEY = "edutu_session_started_at";
const CHECK_INTERVAL_MS = 30_000;

function getAbsoluteHours(): number {
  const raw = import.meta.env.VITE_SESSION_ABSOLUTE_HOURS;
  const parsed = typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 24;
  return parsed;
}

/**
 * Enforces an *absolute* login lifetime: once a user has been signed in for
 * longer than `VITE_SESSION_ABSOLUTE_HOURS` (default 24h), they are signed out
 * and sent back to the sign-in screen, regardless of activity.
 *
 * NOTE: This is a UX-level guard. The authoritative session/token lifetime is
 * configured in the Clerk Dashboard (Sessions → Token lifetime). Keep that
 * value aligned with `VITE_SESSION_ABSOLUTE_HOURS` for true enforcement.
 */
export function useAbsoluteSessionTimeout(
  signOut: () => Promise<void> | void,
): void {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const absoluteMs = getAbsoluteHours() * 60 * 60 * 1000;

  // Stamp the moment a session becomes active (only once per session).
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    if (typeof window === "undefined") return;

    const stored = window.localStorage.getItem(SESSION_STARTED_KEY);
    if (!stored || Number.isNaN(Number(stored))) {
      window.localStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
    }
  }, [isLoaded, isSignedIn]);

  // Clear the stamp whenever there is no active session.
  useEffect(() => {
    if (isLoaded && !isSignedIn && typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_STARTED_KEY);
    }
  }, [isLoaded, isSignedIn]);

  // Periodically check whether the absolute window has elapsed.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let expired = false;

    const check = () => {
      if (expired) return;
      const stored =
        typeof window !== "undefined"
          ? window.localStorage.getItem(SESSION_STARTED_KEY)
          : null;
      const startedAt = stored ? Number(stored) : NaN;
      if (!Number.isNaN(startedAt) && Date.now() - startedAt >= absoluteMs) {
        expired = true;
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(SESSION_STARTED_KEY);
        }
        Promise.resolve(signOut()).finally(() => {
          window.location.assign("/auth?mode=sign-in");
        });
      }
    };

    check();
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);

    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_STARTED_KEY) check();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", onStorage);
    };
  }, [isLoaded, isSignedIn, absoluteMs, signOut]);
}
