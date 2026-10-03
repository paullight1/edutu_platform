import type { ReactNode } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
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
    description: "Get help choosing and preparing for your next opportunity.",
    action: "Unlock AI Coach",
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
  return (
    <LockedFeature feature={feature}>
      <button
        className="feature-button"
        onClick={() =>
          openPaywall({
            feature,
            reason: `Unlock ${feature.toLowerCase()} with an Edutu paid plan.`,
          })
        }
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

  return (
    <section className="feature-workspace tool-page">
      <div className="tool-locked">
        <span className="tool-icon">
          <Icon size={26} />
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
