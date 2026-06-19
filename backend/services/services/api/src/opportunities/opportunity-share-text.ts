type OpportunityRecord = Record<string, any>;

function cleanText(value: unknown, fallback = ""): string {
  const text = value instanceof Date ? value.toISOString() : "";
  if (text) return text;

  const normalized =
    typeof value === "string" || typeof value === "number"
      ? String(value).replace(/\s+/g, " ").trim()
      : "";
  return normalized || fallback;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function toStringArray(value: unknown): string[] {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  return Array.from(
    new Set(
      source
        .flatMap((entry) => {
          if (Array.isArray(entry)) return entry;
          if (entry && typeof entry === "object") {
            return Object.values(entry as Record<string, unknown>);
          }
          return [entry];
        })
        .map((entry) => cleanText(entry))
        .filter(Boolean),
    ),
  );
}

function formatDeadline(value: unknown): string {
  const raw = cleanText(value);
  if (!raw) return "Not Specified";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return truncateText(raw, 80);
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isExpired(value: unknown): boolean {
  const raw = cleanText(value);
  if (!raw) return false;
  const date = new Date(raw);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function getEligibleCountry(opportunity: OpportunityRecord): string {
  const metadata = asRecord(opportunity.metadata);
  const eligibility = asRecord(opportunity.eligibility ?? metadata.eligibility);
  const countries = toStringArray(eligibility.countries);

  if (countries.length > 0) {
    return countries.length > 3
      ? `${countries.slice(0, 3).join(", ")} +${countries.length - 3}`
      : countries.join(", ");
  }

  return (
    cleanText(eligibility.nationality) ||
    cleanText(opportunity.target_region ?? metadata.target_region) ||
    cleanText(opportunity.location) ||
    "All Countries"
  );
}

function getBenefits(opportunity: OpportunityRecord): string[] {
  const metadata = asRecord(opportunity.metadata);
  const benefits = toStringArray(
    opportunity.benefits ??
      metadata.benefits ??
      opportunity.funding_type ??
      metadata.funding_type,
  );
  const funding = cleanText(opportunity.funding_type ?? metadata.funding_type);
  const merged = funding ? [funding, ...benefits] : benefits;

  return Array.from(new Set(merged))
    .map((benefit) => truncateText(benefit, 90))
    .filter(Boolean)
    .slice(0, 2);
}

export function buildOpportunityPublicShareUrl(
  opportunityId: string,
  baseUrl?: string | null,
): string {
  const path = `/opportunity/${encodeURIComponent(opportunityId)}`;
  const base = cleanText(baseUrl).replace(/\/$/, "");

  if (!base) return path;

  try {
    return new URL(path, base).toString();
  } catch {
    return `${base}${path}`;
  }
}

export function buildOpportunityShareText(
  opportunity: OpportunityRecord,
  shareUrl: string,
): string {
  const title = cleanText(opportunity.title, "Edutu Opportunity");
  const sponsor = cleanText(
    opportunity.organization || opportunity.source,
    "Edutu",
  );
  const category = cleanText(
    opportunity.category || opportunity.canonical_category,
    "Opportunity",
  );
  const deadlineValue = opportunity.close_date || opportunity.deadline;
  const statusLine = isExpired(deadlineValue)
    ? "Deadline Passed"
    : "Still Active";
  const benefits = getBenefits(opportunity);
  const benefitLines = (
    benefits.length > 0 ? benefits : ["Full details available on Edutu"]
  )
    .map((benefit, index) => `${index === 0 ? "⭐" : "✅"}${benefit}`)
    .join("\n");

  return [
    `${statusLine}!`,
    "",
    title,
    "",
    `Sponsor: ${sponsor}`,
    "",
    "Benefits:",
    benefitLines,
    "",
    `Category: ${category}`,
    `Eligible Country: ${getEligibleCountry(opportunity)}`,
    `Deadline: ${formatDeadline(deadlineValue)}`,
    "",
    "Click the link below to apply📌",
    shareUrl,
    "",
    "Kindly share with your friends who might be interested.",
  ].join("\n");
}
