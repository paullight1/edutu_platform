import type { Opportunity } from "../types/opportunity";

function normalizeTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeSourceUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_[ce]id$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    const path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
    const query = url.searchParams.toString();
    return `${host}${path}${query ? `?${query}` : ""}`;
  } catch {
    return null;
  }
}

function recordQuality(opportunity: Opportunity): number {
  const directApplication =
    !!opportunity.applyUrl &&
    normalizeSourceUrl(opportunity.applyUrl) !==
      normalizeSourceUrl(opportunity.sourceUrl);
  return (
    (opportunity.organization.trim() ? 3 : 0) +
    (directApplication ? 4 : 0) +
    Math.min(opportunity.description.length / 800, 8) +
    Math.min((opportunity.summary?.length ?? 0) / 100, 4) +
    (opportunity.deadline ? 2 : 0) +
    (opportunity.image ? 1 : 0) +
    (opportunity.trust?.verificationStatus === "verified" ? 2 : 0) -
    (opportunity.trust?.deadlineNeedsReview ? 1 : 0)
  );
}

function mergeDuplicate(
  preferred: Opportunity,
  other: Opportunity,
): Opportunity {
  const preferredDeadline = preferred.deadline?.trim() || null;
  const otherDeadline = other.deadline?.trim() || null;
  const preferredDate = preferredDeadline
    ? normalizeDeadline(preferredDeadline)
    : null;
  const otherDate = otherDeadline ? normalizeDeadline(otherDeadline) : null;
  const conflictingDeadlines =
    !!preferredDate && !!otherDate && preferredDate !== otherDate;

  if (!conflictingDeadlines) {
    const deadline = preferredDeadline ?? otherDeadline;
    if (!deadline) return preferred;
    return {
      ...preferred,
      deadline,
      trust: preferred.trust || other.trust
        ? {
            verificationStatus:
              preferred.trust?.verificationStatus ??
              other.trust?.verificationStatus ??
              "unverified",
            lastVerifiedAt:
              preferred.trust?.lastVerifiedAt ??
              other.trust?.lastVerifiedAt ??
              null,
            deadlineConfidence:
              preferred.trust?.deadlineConfidence ??
              other.trust?.deadlineConfidence ??
              null,
            deadlineNeedsReview:
              preferred.trust?.deadlineNeedsReview === true ||
              other.trust?.deadlineNeedsReview === true,
            verificationMethod:
              preferred.trust?.verificationMethod ??
              other.trust?.verificationMethod ??
              null,
            sourceDomain:
              preferred.trust?.sourceDomain ??
              other.trust?.sourceDomain ??
              null,
          }
        : preferred.trust,
    };
  }

  return {
    ...preferred,
    deadline: null,
    trust: {
      verificationStatus: preferred.trust?.verificationStatus ?? "unverified",
      lastVerifiedAt: preferred.trust?.lastVerifiedAt ?? null,
      deadlineConfidence: preferred.trust?.deadlineConfidence ?? null,
      deadlineNeedsReview: true,
      verificationMethod: preferred.trust?.verificationMethod ?? null,
      sourceDomain: preferred.trust?.sourceDomain ?? null,
    },
  };
}

function normalizeDeadline(value: string): string {
  const isoDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];
  const parsed = Date.parse(value);
  return Number.isNaN(parsed)
    ? value.toLocaleLowerCase().replace(/\s+/g, " ")
    : new Date(parsed).toISOString().slice(0, 10);
}

/**
 * Collapse only records that share both a normalized title and the same
 * canonical source article. Similar titles from different sources stay visible.
 * When duplicate imports disagree about the deadline, hide the date and surface
 * the review warning instead of choosing one silently.
 */
export function deduplicateOpportunities(
  opportunities: Opportunity[],
): Opportunity[] {
  const result: Opportunity[] = [];
  const positions = new Map<string, number>();

  for (const opportunity of opportunities) {
    const source = normalizeSourceUrl(opportunity.sourceUrl);
    const title = normalizeTitle(opportunity.title);
    if (!source || !title) {
      result.push(opportunity);
      continue;
    }

    const key = `${title}|${source}`;
    const existingPosition = positions.get(key);
    if (existingPosition === undefined) {
      positions.set(key, result.length);
      result.push(opportunity);
      continue;
    }

    const existing = result[existingPosition];
    const preferred = recordQuality(opportunity) > recordQuality(existing)
      ? opportunity
      : existing;
    const other = preferred === opportunity ? existing : opportunity;
    result[existingPosition] = mergeDuplicate(preferred, other);
  }

  return result;
}
