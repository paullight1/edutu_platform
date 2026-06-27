import { GoogleOneTap, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useLocation } from "react-router-dom";

/**
 * Renders Clerk's *native* Google One Tap prompt for unauthenticated visitors.
 *
 * Clerk owns the Google credential → session exchange here, so this surfaces
 * Google's own One Tap UI (no custom in-app button/notification) and creates a
 * real Clerk session on success. Requires "Google" + One Tap enabled in the
 * Clerk Dashboard; until then this component renders nothing.
 */
export default function GoogleOneTapGate() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const location = useLocation();

  if (import.meta.env.VITE_GOOGLE_ONE_TAP === "false") return null;
  if (!isLoaded || isSignedIn) return null;

  // Don't compete with the OAuth redirect callback while it's processing.
  if (location.pathname.startsWith("/auth/callback")) return null;

  return (
    <GoogleOneTap
      cancelOnTapOutside={false}
      itpSupport
      fedCmSupport
      signInForceRedirectUrl="/dashboard"
      signUpForceRedirectUrl="/dashboard"
    />
  );
}
