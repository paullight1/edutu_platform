interface OpportunityDescriptionInput {
  summary?: string | null;
  description?: string | null;
}

const SOURCE_NAVIGATION_RE = /\bskip\s+to\s+content\b/i;

function normaliseLongForm(value?: string | null): string {
  if (typeof value !== "string") return "";

  return value
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(SOURCE_NAVIGATION_RE, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeNavigationDump(value?: string | null): boolean {
  if (!value) return false;

  if (SOURCE_NAVIGATION_RE.test(value)) {
    const years = value.match(/\b20\d{2}\b/g)?.length ?? 0;
    const fundingLabels = value.match(/\b(?:fully|partially?)\s+funded\b/gi)?.length ?? 0;

    // A normal article can contain "skip to content" once because of a bad
    // scrape. Repeated years/funding labels alongside it are a stronger signal
    // that the scraper captured a category/navigation list rather than the
    // opportunity body.
    return years >= 2 || fundingLabels >= 2 || /\bcategory\s*:/i.test(value);
  }

  return false;
}

/**
 * Formats only source-provided copy. It never invents missing details: when a
 * long scraped body looks like navigation noise, a real summary is preferred;
 * otherwise the cleaned long-form text is kept with its paragraph structure.
 */
export function prepareOpportunityDescription({
  summary,
  description,
}: OpportunityDescriptionInput): string[] {
  const cleanSummary = normaliseLongForm(summary);
  const descriptionIsNavigation = looksLikeNavigationDump(description);
  const cleanDescription = normaliseLongForm(description);

  const selected = descriptionIsNavigation
    ? cleanSummary
    : cleanDescription || cleanSummary;

  if (!selected) return [];

  return selected
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}
