import {
  extractDeadlineText,
  hasConflictingDeadlines,
  parseDeadlineDetailed,
} from "./deadline.util";

const DEADLINE_CLAIM =
  /\b(?:deadline|closing date|closing deadline|applications?\s+(?:close|closes|closing)|nominations?\s+(?:close|closes|closing)|submissions?\s+(?:close|closes|closing)|apply\s+(?:before|by)|submit\s+(?:before|by))\b/i;

function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const isoDate = value.trim().match(/^(20\d{2}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];
  return parseDeadlineDetailed(value.trim()).date;
}

/**
 * Remove deadline-bearing prose that contradicts the structured deadline.
 * This presentation safeguard leaves stored data untouched and keeps the
 * rest of the opportunity description intact.
 */
export function removeContradictoryDeadlineClaims(
  text: unknown,
  canonicalDeadline: unknown,
): unknown {
  if (typeof text !== "string" || !text.trim()) return text;

  const canonicalDate = toIsoDate(canonicalDeadline);
  if (!canonicalDate) return text;

  const sentences = text.match(/[^.!?]+(?:[.!?]+|$)/g);
  if (!sentences?.length) return text;

  const cleaned = sentences.filter((sentence) => {
    if (!DEADLINE_CLAIM.test(sentence)) return true;

    const evidence = extractDeadlineText(sentence);
    if (!evidence) {
      const isBareClosingClaim =
        /^\s*applications?\s+(?:close|closes|closing)\s*[.!?]*\s*$/i.test(
          sentence,
        );
      return !isBareClosingClaim && !hasConflictingDeadlines(sentence);
    }

    const sentenceDate = toIsoDate(evidence);
    // Keep malformed or implausible dates out of learner-facing copy when a
    // canonical deadline exists. In particular, "December 2, 2926" used to
    // evade the conflict check because the parser only recognized 20xx years.
    if (!sentenceDate && /\b\d{4}\b/.test(evidence)) return false;
    return !sentenceDate || sentenceDate === canonicalDate;
  });

  return cleaned
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * A verified deadline refresh is stronger than an older review flag. When the
 * refresh found a dated deadline or confirmed a rolling deadline, clear that
 * stale flag in learner-facing trust signals; keep prose conflicts visible.
 */
export function deadlineNeedsReview(
  metadata: unknown,
  description: unknown,
  summary: unknown,
  canonicalDeadline: unknown,
): boolean {
  const details =
    typeof metadata === "object" && metadata !== null
      ? (metadata as Record<string, unknown>)
      : null;
  const confidence = details?.deadline_confidence;
  const hasReverification =
    typeof details?.deadline_reverified_at === "string" &&
    details.deadline_reverified_at.trim().length > 0;
  const parsedDeadline = toIsoDate(canonicalDeadline);
  const sourceConfirmedCurrentValue =
    hasReverification &&
    ((!!parsedDeadline &&
      (confidence === "explicit" || confidence === "inferred")) ||
      (!parsedDeadline && confidence === "rolling"));
  const hasContradictoryText = [description, summary].some(
    (text) =>
      typeof text === "string" &&
      removeContradictoryDeadlineClaims(text, canonicalDeadline) !== text,
  );

  return (
    hasContradictoryText ||
    (details?.deadline_needs_review === true && !sourceConfirmedCurrentValue)
  );
}

export function sanitizeOpportunityDeadlineCopy(
  description: string,
  summary: string,
  canonicalDeadline: unknown,
) {
  const safeDescription = removeContradictoryDeadlineClaims(
    description,
    canonicalDeadline,
  ) as string;
  const safeSummary = removeContradictoryDeadlineClaims(
    summary,
    canonicalDeadline,
  ) as string;

  return {
    description: safeDescription,
    summary: safeSummary,
    needsReview: safeDescription !== description || safeSummary !== summary,
  };
}

export function normalizeAndSanitizeOpportunityCopy(
  descriptionText: string,
  summaryText: string,
  title: string,
  canonicalDeadline: unknown,
  normalizeDescription: (text: string) => string,
  normalizeSummary: (
    summary: string,
    description: string,
    title: string,
  ) => string,
) {
  const description = normalizeDescription(descriptionText);
  const summary = normalizeSummary(summaryText, description, title);
  return sanitizeOpportunityDeadlineCopy(
    description,
    summary,
    canonicalDeadline,
  );
}
