import {
  Award,
  BookOpen,
  Briefcase,
  GraduationCap,
  Globe2,
  Heart,
  MapPin,
  Sparkles,
  Target,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import type {
  MatchReason,
  MatchReasonKind,
} from "../../services/personalizedRecommendations";

/**
 * Shared visual language for AI match scoring across the feed cards and the
 * opportunity detail page. Keeping the score tiers + reason chips in one place
 * means the fit label (e.g. "Excellent fit") reads the same everywhere. We show
 * fit tiers, never a raw percentage, so users don't misread a score as their
 * odds of winning.
 */

export type MatchTier = "excellent" | "strong" | "good" | "fair";

export function getMatchTier(score: number): MatchTier {
  if (score >= 80) return "excellent";
  if (score >= 60) return "strong";
  if (score >= 40) return "good";
  return "fair";
}

export function getMatchLabel(score: number): string {
  switch (getMatchTier(score)) {
    case "excellent":
      return "Excellent fit";
    case "strong":
      return "Strong fit";
    case "good":
      return "Good fit";
    default:
      return "Worth a look";
  }
}

const tierClasses: Record<MatchTier, string> = {
  excellent: "border-success/30 bg-success/10 text-success",
  strong: "border-success/25 bg-success/10 text-success",
  good: "border-brand/30 bg-brand/10 text-brand",
  fair: "border-subtle bg-surface-elevated text-text-muted",
};

const reasonIcon: Record<MatchReasonKind, typeof Sparkles> = {
  field: BookOpen,
  interest: Heart,
  category: Award,
  location: MapPin,
  remote: Globe2,
  experience: Briefcase,
  goal: Target,
  education: GraduationCap,
};

/**
 * The fit-tier pill (e.g. "Excellent fit"). Colour and label scale with the
 * score tier; the raw score is never shown to the user.
 * `minScore` hides the badge below a threshold (feed cards pass 40).
 */
export function MatchScoreBadge({
  score,
  minScore = 0,
  showLabel = false,
  className = "",
}: {
  score: number | null | undefined;
  minScore?: number;
  showLabel?: boolean;
  className?: string;
}) {
  if (typeof score !== "number" || Number.isNaN(score) || score < minScore) {
    return null;
  }
  const tier = getMatchTier(score);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${tierClasses[tier]} ${className}`}
      title="How well this fits your profile and interests — not your odds of winning."
    >
      <Sparkles size={12} />
      {showLabel ? (
        <span className="font-medium">{getMatchLabel(score)}</span>
      ) : (
        getMatchLabel(score)
      )}
    </span>
  );
}

/**
 * A single top reason rendered inline on a feed card — keeps cards scannable
 * without opening the detail page.
 */
export function TopMatchReason({ reason }: { reason: MatchReason | undefined }) {
  if (!reason) return null;
  const Icon = reasonIcon[reason.kind] ?? Sparkles;
  return (
    <p className="mt-2 inline-flex items-start gap-1.5 text-xs leading-5 text-success">
      <Icon size={13} className="mt-0.5 shrink-0" />
      <span className="line-clamp-1">{reason.label}</span>
    </p>
  );
}

/**
 * The full "Why this matches you" panel for the detail page: a score header,
 * ranked reason rows, and any risks to be aware of.
 */
export function WhyThisMatches({
  score,
  reasons,
  risks,
  className = "",
}: {
  score: number;
  reasons: MatchReason[];
  risks?: string[];
  className?: string;
}) {
  if (reasons.length === 0 && (!risks || risks.length === 0)) return null;
  const tier = getMatchTier(score);

  return (
    <section
      className={`rounded-2xl border border-subtle bg-surface-layer p-5 shadow-soft ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-success" />
          <h2 className="text-base font-display font-semibold tracking-tight text-text-primary">
            Why this matches you
          </h2>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${tierClasses[tier]}`}
        >
          {getMatchLabel(score)}
        </span>
      </div>

      {reasons.length > 0 ? (
        <ul className="mt-4 space-y-2.5">
          {reasons.map((reason, index) => {
            const Icon = reasonIcon[reason.kind] ?? Sparkles;
            return (
              <li
                key={`${reason.kind}-${index}`}
                className="flex items-start gap-2.5 text-sm text-text-secondary"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                  <Icon size={14} />
                </span>
                <span className="leading-6">{reason.label}</span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {risks && risks.length > 0 ? (
        <div className="mt-4 border-t border-subtle pt-4">
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-warning">
            <AlertTriangle size={13} />
            Worth checking
          </p>
          <ul className="space-y-1.5">
            {risks.map((risk, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm text-text-secondary"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                <span className="leading-6">{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-text-muted">
        <TrendingUp size={12} />
        Based on your field, interests, goals and region.
      </p>
    </section>
  );
}
