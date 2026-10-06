import { useEffect, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { rememberPostAuthRedirect } from "../lib/auth";

/** A nonmodal Google sign-in invitation: public pages stay usable behind it. */
export default function GoogleOneTapGate() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { signInWithGoogle } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAuthPage = location.pathname === "/auth";
  const isFullAuthPage =
    isAuthPage &&
    new URLSearchParams(location.search).get("screen") === "full";

  useEffect(() => {
    if (isAuthPage) {
      setDismissed(false);
      setError(null);
    }
  }, [isAuthPage, location.key]);

  const dismiss = () => {
    setDismissed(true);
    if (isAuthPage) navigate("/", { replace: true });
  };

  useEffect(() => {
    if (dismissed || !isLoaded || isSignedIn) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDismissed(true);
        if (isAuthPage) navigate("/", { replace: true });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismissed, isLoaded, isSignedIn, isAuthPage, navigate]);

  if (!isLoaded || isSignedIn || dismissed || isFullAuthPage) return null;
  if (location.pathname !== "/" && !isAuthPage) return null;

  const signIn = async () => {
    setPending(true);
    setError(null);
    const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
    const redirect = new URLSearchParams(location.search).get("redirect");
    rememberPostAuthRedirect(from ?? (redirect ? { pathname: redirect } : { pathname: "/dashboard" }));
    try {
      await signInWithGoogle();
    } catch {
      setError("Couldn't connect to Google. Please try again.");
      setPending(false);
    }
  };

  return (
    <aside role="dialog" aria-modal="false" aria-labelledby="google-sign-in-title"
      className="fixed bottom-5 right-5 z-[80] w-[calc(100%-2.5rem)] max-w-sm rounded-2xl border border-border bg-surface p-5 text-text-primary shadow-2xl">
      <button type="button" aria-label="Dismiss sign-in" onClick={dismiss}
        className="absolute right-3 top-3 rounded-full p-2 text-text-secondary hover:bg-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
        <X size={18} />
      </button>
      <h2 id="google-sign-in-title" className="pr-8 text-lg font-semibold">Continue with Edutu</h2>
      <p className="mt-2 text-sm text-text-secondary">Sign in to save opportunities and build your plan. You can keep exploring without an account.</p>
      <button type="button" disabled={pending} onClick={() => void signIn()}
        className="mt-4 flex w-full items-center justify-center gap-3 rounded-full border border-border bg-surface-body px-4 py-3 font-medium hover:bg-surface-elevated disabled:opacity-60">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.06a10 10 0 0 0 0 9.04l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.51l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.94 5.48l3.34 2.59A5.99 5.99 0 0 1 12 5.95Z"/></svg>
        {pending ? "Connecting…" : "Continue with Google"}
      </button>
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
      <button type="button" onClick={dismiss} className="mt-3 w-full rounded-full py-2 text-sm text-text-secondary hover:text-text-primary">Keep exploring</button>
      <p className="mt-3 text-center text-xs text-text-secondary">By continuing, you agree to our <Link to="/terms" className="text-brand">Terms</Link> and <Link to="/privacy" className="text-brand">Privacy Policy</Link>.</p>
    </aside>
  );
}
