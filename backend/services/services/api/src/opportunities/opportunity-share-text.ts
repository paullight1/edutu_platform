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
  if (!raw) return "Not specified";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return truncateText(raw, 80);
  }

  // Day-month-year (e.g. "31 July 2026") — the format Edutu's audience reads.
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getSummary(opportunity: OpportunityRecord): string {
  const metadata = asRecord(opportunity.metadata);
  const raw = cleanText(
    opportunity.aiSummary ||
      opportunity.ai_summary ||
      opportunity.refined_summary ||
      opportunity.summary ||
      metadata.summary ||
      opportunity.description,
  );
  return truncateText(raw, 320);
}

function getOpportunityType(opportunity: OpportunityRecord): string {
  const metadata = asRecord(opportunity.metadata);
  return cleanText(
    opportunity.opportunity_type ||
      opportunity.type ||
      metadata.opportunity_type ||
      metadata.type ||
      opportunity.category ||
      opportunity.canonical_category ||
      opportunity.funding_type ||
      metadata.funding_type,
  );
}

function getDuration(opportunity: OpportunityRecord): string {
  const metadata = asRecord(opportunity.metadata);
  return cleanText(
    opportunity.duration ||
      opportunity.program_duration ||
      metadata.duration ||
      metadata.program_duration ||
      metadata.length,
  );
}

function getTargetAudience(opportunity: OpportunityRecord): string {
  const metadata = asRecord(opportunity.metadata);
  const eligibility = asRecord(opportunity.eligibility ?? metadata.eligibility);
  return truncateText(
    cleanText(
      opportunity.target_audience ||
        opportunity.audience ||
        metadata.target_audience ||
        metadata.audience ||
        eligibility.audience ||
        eligibility.target_audience,
    ),
    160,
  );
}

function getGains(opportunity: OpportunityRecord): string[] {
  const metadata = asRecord(opportunity.metadata);
  const benefits = toStringArray(opportunity.benefits ?? metadata.benefits);
  const funding = cleanText(opportunity.funding_type ?? metadata.funding_type);
  const merged = benefits.length > 0 ? benefits : funding ? [funding] : [];

  return Array.from(new Set(merged))
    .map((benefit) => truncateText(benefit, 120))
    .filter(Boolean)
    .slice(0, 5);
}

function getEligibility(opportunity: OpportunityRecord): string[] {
  const metadata = asRecord(opportunity.metadata);

  // 1. An explicit bullet list (real or AI-filled) wins.
  const listed = toStringArray(
    opportunity.eligibility_bullets ??
      metadata.eligibility_bullets ??
      (Array.isArray(opportunity.eligibility)
        ? opportunity.eligibility
        : Array.isArray(metadata.eligibility)
          ? metadata.eligibility
          : undefined),
  );
  if (listed.length > 0) {
    return listed.map((item) => truncateText(item, 120)).slice(0, 3);
  }

  // 2. Structured eligibility object → a single concise line.
  const eligibility = asRecord(opportunity.eligibility ?? metadata.eligibility);
  const countries = eligibility.countries;
  if (Array.isArray(countries) && countries.length > 0) {
    const shown = countries
      .slice(0, 4)
      .map((c) => cleanText(c))
      .filter(Boolean);
    const suffix = countries.length > 4 ? ` +${countries.length - 4} more` : "";
    if (shown.length)
      return [`Open to applicants from ${shown.join(", ")}${suffix}`];
  }
  const audience = getTargetAudience(opportunity);
  return audience ? [truncateText(audience, 120)] : [];
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

/**
 * WhatsApp-native share caption. Uses WhatsApp markdown (*bold*, _italic_,
 * "- " bullets) so the message renders as a clean, scannable card in chat.
 *
 * Every optional field is conditional — a line only appears when the
 * opportunity actually carries that data, so we never ship an empty
 * "Duration:" row or a hollow "What You'll Gain:" heading.
 */
export function buildOpportunityShareText(
  opportunity: OpportunityRecord,
  shareUrl: string,
): string {
  const title = cleanText(opportunity.title, "Edutu Opportunity");
  const summary = getSummary(opportunity);
  const type = getOpportunityType(opportunity);
  const duration = getDuration(opportunity);
  const audience = getTargetAudience(opportunity);
  const rawDeadline = cleanText(opportunity.close_date || opportunity.deadline);
  const gains = getGains(opportunity);
  const eligibility = getEligibility(opportunity);

  const lines: string[] = [`*${title}*`];

  if (summary) {
    lines.push("", `_${summary}_`);
  }

  const facts: string[] = [];
  if (type) facts.push(`- *Type:* ${type}`);
  if (duration) facts.push(`- *Duration:* ${duration}`);
  if (audience) facts.push(`- *Target Audience:* ${audience}`);
  // Deadlines are never fabricated — only shown when the opportunity carries one.
  if (rawDeadline) facts.push(`- *Deadline:* ${formatDeadline(rawDeadline)}`);
  lines.push("", ...facts);

  if (eligibility.length > 0) {
    lines.push(
      "",
      "*Who Can Apply:*",
      "",
      ...eligibility.map((item) => `- ${item}`),
    );
  }

  if (gains.length > 0) {
    lines.push(
      "",
      "*What You'll Gain:*",
      "",
      ...gains.map((gain) => `- ${gain}`),
    );
  }

  lines.push("", "*Apply here:*", "", shareUrl);

  return lines.join("\n");
}
