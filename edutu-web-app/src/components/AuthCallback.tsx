import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClerk } from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";
import { consumePostAuthRedirect } from "../lib/auth";
import PublicEditorialShell from "./PublicEditorialShell";

const AuthCallback: React.FC = () => {
  const { handleRedirectCallback } = useClerk();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (attempted) return;
    setAttempted(true);

    const redirectTarget = consumePostAuthRedirect("/dashboard");
    const signUpRedirect =
      redirectTarget === "/opportunities"
        ? "/opportunities?signup=true"
        : redirectTarget.startsWith("/opportunities?") &&
            !redirectTarget.includes("signup=true")
          ? `${redirectTarget}&signup=true`
          : redirectTarget;

    handleRedirectCallback({
      signInForceRedirectUrl: redirectTarget,
      signUpForceRedirectUrl: signUpRedirect,
    }).catch((err: unknown) => {
      console.error("Auth callback error:", err);
      setError("Authentication failed. Please try signing in again.");
    });
  }, [handleRedirectCallback, attempted]);

  if (error) {
    return (
      <PublicEditorialShell mainClassName="max-w-3xl py-8">
        <div className="flex min-h-[calc(100dvh-220px)] items-center justify-center text-center">
          <div className="p-8">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={() => navigate("/auth")}
              className="rounded-md bg-slate-950 px-6 py-3 font-medium text-white dark:bg-white dark:text-slate-950"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </PublicEditorialShell>
    );
  }

  return (
    <PublicEditorialShell mainClassName="max-w-3xl py-8">
      <div className="flex min-h-[calc(100dvh-220px)] items-center justify-center text-center">
        <div>
          <Loader2
            size={40}
            className="mx-auto mb-4 animate-spin text-brand-600"
          />
          <p className="text-slate-500 dark:text-slate-300">
            Completing sign in...
          </p>
        </div>
      </div>
    </PublicEditorialShell>
  );
};

export default AuthCallback;
