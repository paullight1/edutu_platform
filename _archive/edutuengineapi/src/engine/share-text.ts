type OpportunityLike = {
  title?: string | null;
  organization?: string | null;
  category?: string | null;
  deadline?: string | null;
  location?: string | null;
  applicationUrl?: string | null;
  detailUrl?: string | null;
  metadata?: Record<string, unknown>;
};

function clean(value: unknown, fallback = ""): string {
  const text =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text || fallback;
}

function formatDeadline(value?: string | null): string {
  const raw = clean(value);
  if (!raw) return "Not Specified";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isExpired(value?: string | null): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() < Date.now();
}

export function buildEngineShareText(opportunity: OpportunityLike): string {
  const link =
    opportunity.applicationUrl ||
    opportunity.detailUrl ||
    "https://www.edutu.org";
  const benefit =
    clean(opportunity.metadata?.fundingType) ||
    clean(opportunity.metadata?.funding_type) ||
    "Full details available through the official opportunity page";

  return [
    `${isExpired(opportunity.deadline) ? "Deadline Passed" : "Still Active"}!`,
    "",
    clean(opportunity.title, "Edutu Opportunity"),
    "",
    `Sponsor: ${clean(opportunity.organization, "Edutu")}`,
    "",
    "Benefits:",
    `⭐${benefit}`,
    "",
    `Category: ${clean(opportunity.category, "Opportunity")}`,
    `Eligible Country: ${clean(opportunity.location, "All Countries")}`,
    `Deadline: ${formatDeadline(opportunity.deadline)}`,
    "",
    "Click the link below to apply📌",
    link,
    "",
    "Kindly share with your friends who might be interested.",
  ].join("\n");
}
