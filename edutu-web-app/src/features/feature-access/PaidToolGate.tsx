import type { ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BellRing,
  FileText,
  FolderOpen,
  LockKeyhole,
  Loader2,
  Sparkles,
  Target,
} from "lucide-react";
import { usePaywall } from "../../hooks/usePaywall";
import { useModuleAccess } from "./useModuleAccess";
import "../workspace/workspace.css";
import "../workspace/tools.css";

const previews: Record<
  string,
  { title: string; description: string; action: string; Icon: typeof Target }
> = {
  "Saved searches and alerts": {
    title: "Find it once. Stay updated.",
    description:
      "Save your search and get notified when new opportunities match.",
    action: "Unlock alerts",
    Icon: BellRing,
  },
  "Document analysis": {
    title: "Your documents, together",
    description: "Keep CVs, transcripts and application files ready to use.",
    action: "Unlock documents",
    Icon: FolderOpen,
  },
  "Goals and preparation plans": {
    title: "Make your next step count",
    description:
      "Track personal goals and turn preparation plans into small steps.",
    action: "Unlock goals",
    Icon: Target,
  },
  "Application Copilot": {
    title: "Prepare this application",
    description:
      "Work through its checklist, essays and application strategy.",
    action: "Unlock Copilot",
    Icon: Sparkles,
  },
  "AI Coach": {
    title: "Ask Edutu",
    description:
      "Get personal guidance to find the right opportunity, strengthen your application and plan your next move.",
    action: "Unlock AI Coach for personalized guidance",
    Icon: Sparkles,
  },
  "AI opportunity preparation": {
    title: "Prepare with AI",
    description:
      "Check your fit, choose a next step, review documents and build a preparation plan.",
    action: "Unlock AI preparation",
    Icon: Sparkles,
  },
  "Personalized opportunity recommendations": {
    title: "Your next best matches",
    description:
      "Unlock profile-based opportunity rankings, fit insights and reasons behind each match.",
    action: "Unlock personalized matches",
    Icon: Target,
  },
  "CV Builder": {
    title: "Build a CV that shows your strengths",
    description: "Create and manage your CV, with premium designs available on a paid plan.",
    action: "Unlock CV Builder",
    Icon: FileText,
  },
};

interface PaidToolGateProps {
  feature: string;
  children: ReactNode;
  moduleKey?: string;
  /** Some modules use server metering instead of requiring a subscription. */
  paidByDefault?: boolean;
}

/** Keeps configured module locks aligned with plan-based page access. */
export function PaidToolGate({
  feature,
  children,
  moduleKey,
  paidByDefault = true,
}: PaidToolGateProps) {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    billing,
    billingLoading,
    billingError,
    openPaywall,
    refreshBilling,
  } = usePaywall();
  const module = useModuleAccess(moduleKey);

  if (moduleKey && module.loading) {
    return (
      <div className="feature-loading" role="status">
        <Loader2 className="animate-spin" size={20} /> Checking feature access…
      </div>
    );
  }

  if (module.access === "disabled") {
    return (
      <LockedFeature
        feature={feature}
        message="This feature is temporarily unavailable. Check back later."
      />
    );
  }

  const requiresPaidPlan = paidByDefault || module.access === "pro";
  if (!requiresPaidPlan) return <>{children}</>;

  if (!isLoaded || (isSignedIn && billingLoading && !billing)) {
    return (
      <div className="feature-loading" role="status">
        <Loader2 className="animate-spin" size={20} /> Checking your plan…
      </div>
    );
  }

  if (isSignedIn && billing?.planTier !== "none" && billing?.isPro) {
    return <>{children}</>;
  }

  if (isSignedIn && !billing) {
    return (
      <LockedFeature feature={feature}>
        <p role="alert">
          {billingError || "We couldn't confirm your plan."}
        </p>
        <button
          className="feature-button secondary"
          onClick={() => void refreshBilling()}
        >
          Check access again
        </button>
      </LockedFeature>
    );
  }

  const info = previewFor(feature);
  const handleUnlock = () => {
    // CoachSheet uses a native <dialog>, which sits above body-portalled
    // modals. Route to the full plan page so the sheet closes before checkout.
    if (feature === "AI Coach" && location.pathname === "/app/coach") {
      navigate("/upgrade");
      return;
    }

    openPaywall({
      feature,
      reason: `Unlock ${feature.toLowerCase()} with an Edutu paid plan.`,
    });
  };
  return (
    <LockedFeature feature={feature}>
      <button
        className="feature-button"
        onClick={handleUnlock}
      >
        {info.action}
      </button>
    </LockedFeature>
  );
}

function LockedFeature({
  feature,
  message,
  children,
}: {
  feature: string;
  message?: string;
  children?: ReactNode;
}) {
  const info = previewFor(feature);
  const { Icon } = info;

  if (feature === "AI opportunity preparation") {
    return (
      <section className="tool-page rounded-2xl border border-subtle bg-surface-layer p-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
            <Sparkles size={19} aria-hidden="true" />
          </span>
          <h2 className="text-base font-semibold text-text-primary">{info.title}</h2>
        </div>
        <p className="mb-4 mt-2 text-sm leading-5 text-text-muted">
          {message || "Check your fit and build a clear application plan."}
        </p>
        <div className="flex flex-col gap-2 [&>.feature-button]:w-full [&>.feature-button]:justify-center">
          {children}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <LockKeyhole size={12} aria-hidden="true" />
            {message ? "Check back later" : "Included with a paid plan"}
          </span>
          {!message && <Link className="font-medium text-text-link" to="/app/wallet">View my plan</Link>}
        </div>
      </section>
    );
  }

  return (
    <section className="feature-workspace tool-page">
      <div
        className={`tool-locked${feature === "AI opportunity preparation" ? " tool-locked--compact" : ""}${feature === "AI Coach" ? " tool-locked--coach" : ""}`}
      >
        <span className="tool-icon paid-tool-icon">
          {feature === "AI Coach" ? (
            <img className="coach-mascot" src="/illustrations/ai-coach-mascot.svg" alt="" />
          ) : (
            <>
              <PaidFeatureIllustration />
              <span className="paid-tool-icon-symbol"><Icon size={24} strokeWidth={1.9} /></span>
            </>
          )}
        </span>
        <h2>{info.title}</h2>
        <p>{message || info.description}</p>
        {children}
        <small>
          <LockKeyhole size={12} />
          {message ? "Check back later" : "Included with a paid plan"}
        </small>
        {!message && (
          <Link className="tool-locked-link" to="/app/wallet">
            View my plan
          </Link>
        )}
      </div>
    </section>
  );
}

/** Small, original vector scene for a locked tool: clear at phone scale and
 * crisp at any density, without shipping a bitmap or a stock icon tile. */
function PaidFeatureIllustration({ coach = false }: { coach?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`paid-feature-illustration${coach ? " paid-feature-illustration--coach" : ""}`}
      viewBox="0 0 96 96"
      fill="none"
    >
      <defs>
        <linearGradient id="paid-feature-glow" x1="17" y1="15" x2="79" y2="84" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity={coach ? ".36" : ".2"} />
          <stop offset="1" stopColor="currentColor" stopOpacity={coach ? ".12" : ".04"} />
        </linearGradient>
      </defs>
      <path d="M48 4 56 10 66 9 70 18 80 22 80 32 88 39 84 49 88 59 80 66 80 76 70 80 66 89 56 88 48 94 40 88 30 89 26 80 16 76 16 66 8 59 12 49 8 39 16 32 16 22 26 18 30 9 40 10 48 4Z" fill="url(#paid-feature-glow)" />
      <circle cx="48" cy="48" r="27" stroke="currentColor" strokeOpacity={coach ? ".62" : ".22"} strokeWidth={coach ? "3" : "1.5"} />
      <circle cx="48" cy="48" r="20" stroke="currentColor" strokeOpacity={coach ? ".48" : ".28"} strokeWidth={coach ? "2.5" : "1.5"} strokeDasharray="3 4" />
      <rect x="27" y="27" width="42" height="42" rx="14" fill="currentColor" fillOpacity={coach ? ".2" : ".12"} />
      {coach && <path d="m48 33 4.3 10.7L63 48l-10.7 4.3L48 63l-4.3-10.7L33 48l10.7-4.3L48 33Z" fill="currentColor" />}
      <circle cx="73" cy="26" r="7" fill="currentColor" fillOpacity={coach ? ".34" : ".18"} />
      <path d="m70 26 2 2 4-5" stroke="currentColor" strokeWidth={coach ? "2.4" : "1.6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function previewFor(feature: string) {
  return (
    previews[feature] || {
      title: feature,
      description: "Keep your preparation in one place.",
      action: "View plans",
      Icon: Sparkles,
    }
  );
}
