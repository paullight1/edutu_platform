function cleanText(value: unknown, maxChars: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, maxChars);
}

function cleanOptionalText(
  value: unknown,
  maxChars: number,
): string | undefined {
  const cleaned = cleanText(value, maxChars);
  if (
    !cleaned ||
    /^(n\/a|na|none|null|unknown(?:\s+.*)?|not available|not provided|not stated|not specified|unspecified|tbd|tba)$/i.test(
      cleaned,
    )
  ) {
    return undefined;
  }
  return cleaned;
}

function firstSentence(text: string): string {
  if (!text) return "";
  const sentenceMatch = text.match(/^(.{40,240}?[.!?])(?:\s|$)/);
  return sentenceMatch?.[1]?.trim() || text.substring(0, 220).trim();
}

export function normalizeOpportunitySummary(
  summary: string | null | undefined,
  description: string | null | undefined,
  title: string,
): string {
  const cleanedSummary = cleanOptionalText(summary, 420);
  const cleanedDescription = cleanText(description, 1200);
  const candidate =
    cleanedSummary ||
    firstSentence(cleanedDescription) ||
    cleanText(title, 220);
  if (!candidate) return "";
  const words = candidate.split(/\s+/).filter(Boolean);
  const limited = words.length > 45 ? words.slice(0, 45).join(" ") : candidate;
  return /[.!?]$/.test(limited) ? limited : `${limited}.`;
}

export function normalizeOpportunityDescription(
  description: string | null | undefined,
): string {
  return cleanOptionalText(description, 1800) || "";
}
