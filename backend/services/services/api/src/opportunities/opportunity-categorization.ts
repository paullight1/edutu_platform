export type OpportunityCanonicalCategory =
  | "scholarships"
  | "careers"
  | "leadership"
  | "global_programs"
  | "other";

const CATEGORY_KEYWORDS: Record<Exclude<OpportunityCanonicalCategory, "other">, string[]> = {
  scholarships: [
    "scholarship",
    "scholarships",
    "scholar",
    "scholars",
    "grant",
    "bursary",
    "tuition",
    "financial aid",
    "fully funded",
    "funding",
    "stipend",
    "award",
  ],
  careers: [
    "career",
    "internship",
    "internships",
    "intern",
    "job",
    "jobs",
    "employment",
    "vacancy",
    "role",
    "graduate trainee",
    "trainee",
    "apprenticeship",
  ],
  leadership: [
    "leadership",
    "leader",
    "fellowship",
    "fellow",
    "mentorship",
    "mentor",
    "ambassador",
    "volunteer",
    "community",
    "changemaker",
    "civic",
    "social impact",
  ],
  global_programs: [
    "global",
    "international",
    "worldwide",
    "abroad",
    "exchange",
    "conference",
    "summit",
    "bootcamp",
    "accelerator",
    "program",
    "programme",
    "remote",
  ],
};

function normalizeText(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(" ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(normalizeText).filter(Boolean).join(" ");
  return String(value).toLowerCase();
}

export function categorizeOpportunity(input: Record<string, unknown>): OpportunityCanonicalCategory {
  const stored = normalizeText(input.canonicalCategory || input.canonical_category).replace(/-/g, "_");
  if (stored === "scholarships" || stored === "careers" || stored === "leadership" || stored === "global_programs") {
    return stored;
  }

  const text = [
    input.category,
    input.type,
    input.title,
    input.organization,
    input.location,
    input.description,
    input.summary,
    input.eligibilityCriteria,
    input.eligibility_criteria,
    input.fundingType,
    input.funding_type,
    input.targetRegion,
    input.target_region,
    input.tags,
    input.aiTags,
    input.ai_tags,
    input.requirements,
    input.benefits,
    input.metadata,
  ].map(normalizeText).filter(Boolean).join(" ");

  const priority: OpportunityCanonicalCategory[] = ["scholarships", "careers", "leadership", "global_programs", "other"];
  const scores = Object.entries(CATEGORY_KEYWORDS)
    .map(([id, keywords]) => ({
      id: id as Exclude<OpportunityCanonicalCategory, "other">,
      score: keywords.reduce((score, keyword) => {
        if (!text.includes(keyword)) return score;
        return score + (keyword.includes(" ") ? 2 : 1);
      }, 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || priority.indexOf(a.id) - priority.indexOf(b.id));

  return scores[0]?.id ?? "other";
}
