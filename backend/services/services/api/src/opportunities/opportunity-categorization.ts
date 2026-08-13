export const OPPORTUNITY_CATEGORIES = [
  "scholarships",
  "internships",
  "programs",
  "fellowships",
  "grants",
  "graduate_programs",
  "bootcamps",
  "events",
] as const;

export type OpportunityCanonicalCategory =
  | (typeof OPPORTUNITY_CATEGORIES)[number]
  | "other";

export type OpportunityClassificationSource =
  | "stored"
  | "source"
  | "rules"
  | "fallback";

export interface OpportunityClassificationResult {
  canonicalCategory: OpportunityCanonicalCategory;
  confidence: number;
  reason: string;
  source: OpportunityClassificationSource;
  matchedSignals: string[];
  needsReview: boolean;
}

type CategoryRule = {
  category: Exclude<OpportunityCanonicalCategory, "other">;
  label: string;
  fields: Array<"title" | "category" | "description" | "metadata">;
  weight: number;
  pattern: RegExp;
};

// These aliases keep old scraped/admin values readable while making the
// persisted taxonomy match the eight discovery categories shown in the apps.
const CATEGORY_ALIASES: Record<string, OpportunityCanonicalCategory> = {
  scholarship: "scholarships",
  scholarships: "scholarships",
  scholar: "scholarships",
  scholars: "scholarships",
  bursary: "scholarships",
  bursaries: "scholarships",
  studentship: "scholarships",
  internship: "internships",
  internships: "internships",
  intern: "internships",
  career: "internships",
  careers: "internships",
  job: "internships",
  jobs: "internships",
  trainee: "internships",
  trainees: "internships",
  apprenticeship: "internships",
  apprenticeships: "internships",
  fellowship: "fellowships",
  fellowships: "fellowships",
  leadership: "fellowships",
  residency: "fellowships",
  residencies: "fellowships",
  program: "programs",
  programs: "programs",
  programme: "programs",
  programmes: "programs",
  global_program: "programs",
  global_programs: "programs",
  leadership_program: "programs",
  leadership_programs: "programs",
  grant: "grants",
  grants: "grants",
  microgrant: "grants",
  microgrants: "grants",
  graduate_program: "graduate_programs",
  graduate_programs: "graduate_programs",
  graduate_programme: "graduate_programs",
  graduate_programmes: "graduate_programs",
  masters: "graduate_programs",
  master: "graduate_programs",
  msc: "graduate_programs",
  mba: "graduate_programs",
  phd: "graduate_programs",
  doctoral: "graduate_programs",
  doctorate: "graduate_programs",
  postgraduate: "graduate_programs",
  bootcamp: "bootcamps",
  bootcamps: "bootcamps",
  accelerator: "bootcamps",
  accelerators: "bootcamps",
  incubator: "bootcamps",
  incubators: "bootcamps",
  event: "events",
  events: "events",
  conference: "events",
  conferences: "events",
  summit: "events",
  summits: "events",
  workshop: "events",
  workshops: "events",
  webinar: "events",
  webinars: "events",
  forum: "events",
  forums: "events",
  expo: "events",
  expos: "events",
  training_conference: "events",
  training_conferences: "events",
  competition: "programs",
  competitions: "programs",
  challenge: "programs",
  challenges: "programs",
  contest: "programs",
  contests: "programs",
  other: "other",
  general: "other",
};

// Rules are field-aware on purpose. A word in a title is a much stronger
// signal than the same word in a long description, and generic words such as
// "program" must never beat a precise title such as "PhD Scholarship".
const RULES: CategoryRule[] = [
  {
    category: "scholarships",
    label: "scholarship/bursary/studentship funding",
    fields: ["title"],
    weight: 96,
    pattern:
      /\b(scholarship|scholars?|bursar(?:y|ies)|studentship|tuition waiver|financial aid)\b/i,
  },
  {
    category: "scholarships",
    label: "tuition or student funding",
    fields: ["description", "metadata", "category"],
    weight: 22,
    pattern:
      /\b(tuition|financial aid|study support|fully funded|partially funded|education funding|student funding)\b/i,
  },
  {
    category: "grants",
    label: "direct grant/project funding",
    fields: ["title"],
    weight: 94,
    pattern:
      /\b(grant|grants|seed funding|microgrant|innovation fund|research funding)\b/i,
  },
  {
    category: "grants",
    label: "project or business funding",
    fields: ["description", "metadata", "category"],
    weight: 24,
    pattern:
      /\b(project funding|research grant|business grant|startup funding|seed capital|innovation funding|award funding)\b/i,
  },
  {
    category: "internships",
    label: "internship/trainee/apprenticeship role",
    fields: ["title"],
    weight: 94,
    pattern:
      /\b(internship|intern|trainee|apprentice|apprenticeship|industrial attachment|work placement)\b/i,
  },
  {
    category: "internships",
    label: "early-career work experience",
    fields: ["description", "metadata", "category"],
    weight: 24,
    pattern:
      /\b(entry[- ]level|early career|graduate trainee|paid placement|work experience|vacancy|employment role)\b/i,
  },
  {
    category: "fellowships",
    label: "fellowship/residency",
    fields: ["title"],
    weight: 94,
    pattern: /\b(fellowship|fellow|residency|resident fellow)\b/i,
  },
  {
    category: "fellowships",
    label: "leadership or mentorship fellowship",
    fields: ["description", "metadata", "category"],
    weight: 23,
    pattern:
      /\b(leadership fellowship|leadership cohort|mentorship cohort|ambassador program|changemaker)\b/i,
  },
  {
    category: "graduate_programs",
    label: "masters/PhD/postgraduate study",
    fields: ["title"],
    weight: 95,
    pattern:
      /\b(master'?s|msc|m\.sc|mba|phd|ph\.d|doctoral|doctorate|postgraduate|graduate school|graduate studies)\b/i,
  },
  {
    category: "graduate_programs",
    label: "graduate degree admission",
    fields: ["description", "metadata", "category"],
    weight: 25,
    pattern:
      /\b(graduate degree|degree program|higher degree|post[- ]graduate study|admission for graduates)\b/i,
  },
  {
    category: "bootcamps",
    label: "bootcamp/accelerator/incubator",
    fields: ["title"],
    weight: 95,
    pattern: /\b(bootcamp|coding bootcamp|accelerator|incubator)\b/i,
  },
  {
    category: "bootcamps",
    label: "intensive skills training",
    fields: ["description", "metadata", "category"],
    weight: 24,
    pattern:
      /\b(intensive training|cohort[- ]based training|skills intensive|career accelerator|startup accelerator)\b/i,
  },
  {
    category: "events",
    label: "conference/summit/workshop event",
    fields: ["title"],
    weight: 98,
    pattern:
      /\b(event|conference|summit|workshop|webinar|forum|expo|hackathon|career fair)\b/i,
  },
  {
    category: "events",
    label: "attend or apply as a delegate",
    fields: ["description", "metadata", "category"],
    weight: 26,
    pattern:
      /\b(delegate|delegates|attendee|speaker application|youth ambassador|registration|call for abstracts)\b/i,
  },
  {
    category: "programs",
    label: "leadership/exchange/mentorship program",
    fields: ["title"],
    weight: 72,
    pattern:
      /\b(leadership|exchange|mentorship|training|global|professional development)\s+(program|programme|track|cohort)\b/i,
  },
  {
    category: "programs",
    label: "general structured program",
    fields: ["title", "description", "metadata", "category"],
    weight: 16,
    pattern:
      /\b(program|programme|fellowship track|learning track|initiative|cohort)\b/i,
  },
];

const CATEGORY_PRIORITY: OpportunityCanonicalCategory[] = [
  "scholarships",
  "grants",
  "graduate_programs",
  "internships",
  "fellowships",
  "bootcamps",
  "events",
  "programs",
  "other",
];

function normalizeText(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(normalizeText)
      .filter(Boolean)
      .join(" ");
  }
  return String(value).toLowerCase();
}

function normalizeKey(value: unknown): string {
  return normalizeText(value)
    .trim()
    .replace(/[&/]+/g, " ")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function normalizeCategory(
  value: unknown,
): OpportunityCanonicalCategory | null {
  return CATEGORY_ALIASES[normalizeKey(value)] ?? null;
}

function buildFields(input: Record<string, unknown>) {
  const metadata =
    input.metadata && typeof input.metadata === "object"
      ? (input.metadata as Record<string, unknown>)
      : {};

  return {
    title: normalizeText(input.title),
    category: normalizeText(input.category),
    description: normalizeText([
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
      input.skills,
      input.location,
      input.organization,
    ]),
    metadata: normalizeText(metadata),
  };
}

function isLocked(input: Record<string, unknown>): boolean {
  if (
    input.classification_locked === true ||
    input.classificationLocked === true
  ) {
    return true;
  }
  const metadata = input.metadata;
  return Boolean(
    metadata &&
    typeof metadata === "object" &&
    (metadata as Record<string, unknown>).classification_locked === true,
  );
}

/**
 * Classifies an opportunity into the same eight categories used by mobile,
 * admin and the public API. The classifier is deterministic and explainable:
 * explicit source hints are strong, title evidence beats body evidence, and
 * uncertain results are marked for review instead of silently looking valid.
 */
export function classifyOpportunity(
  input: Record<string, unknown>,
): OpportunityClassificationResult {
  const stored = normalizeCategory(
    input.canonicalCategory ?? input.canonical_category,
  );

  if (stored && stored !== "other" && isLocked(input)) {
    return {
      canonicalCategory: stored,
      confidence: 0.99,
      reason: `Locked canonical category preserved: ${stored}.`,
      source: "stored",
      matchedSignals: ["locked_canonical_category"],
      needsReview: false,
    };
  }

  const fields = buildFields(input);
  const scores = new Map<OpportunityCanonicalCategory, number>();
  const signals = new Map<OpportunityCanonicalCategory, string[]>();

  const addEvidence = (
    category: OpportunityCanonicalCategory,
    score: number,
    signal: string,
  ) => {
    scores.set(category, (scores.get(category) ?? 0) + score);
    signals.set(category, [...(signals.get(category) ?? []), signal]);
  };

  // `category` is a source-provided label and is stronger than body text, but
  // a precise title is allowed to correct stale source labels. The generic
  // default type of "scholarship" is intentionally ignored.
  const sourceCategory = normalizeCategory(input.category);
  if (sourceCategory && sourceCategory !== "other") {
    addEvidence(sourceCategory, 88, `source category: ${sourceCategory}`);
  }
  const rawType = normalizeKey(input.type);
  const typeCategory =
    rawType !== "scholarship" ? normalizeCategory(input.type) : null;
  if (typeCategory && typeCategory !== "other") {
    addEvidence(typeCategory, 54, `source type: ${typeCategory}`);
  }

  for (const rule of RULES) {
    const matchedField = rule.fields.find((field) =>
      rule.pattern.test(fields[field]),
    );
    if (!matchedField) continue;
    const fieldWeight = matchedField === "title" ? 1 : 1;
    addEvidence(
      rule.category,
      rule.weight * fieldWeight,
      `${matchedField}: ${rule.label}`,
    );
  }

  // A precise funding phrase should win over a generic program mention. This
  // is the common "Scholarship Program" / "Grant Program" source pattern.
  const title = fields.title;
  if (/\b(scholarship|scholars?|bursar(?:y|ies)|studentship)\b/i.test(title)) {
    addEvidence("scholarships", 18, "title: funding opportunity wording");
  }
  if (/\b(grant|microgrant|seed funding)\b/i.test(title)) {
    addEvidence("grants", 16, "title: direct funding wording");
  }

  const ranked = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return CATEGORY_PRIORITY.indexOf(a[0]) - CATEGORY_PRIORITY.indexOf(b[0]);
    });

  const [winner, winningScore] = ranked[0] ?? [];
  if (!winner || !winningScore) {
    return {
      canonicalCategory: "other",
      confidence: 0.3,
      reason: "No reliable category signal found.",
      source: "fallback",
      matchedSignals: [],
      needsReview: true,
    };
  }

  const secondScore = ranked[1]?.[1] ?? 0;
  const margin = winningScore - secondScore;
  const confidence = Math.min(
    0.98,
    Math.max(0.42, 0.56 + winningScore / 360 + margin / 220),
  );
  const winningSignals = signals.get(winner) ?? [];
  const winningSignalIsSource = winningSignals.some((signal) =>
    signal.startsWith("source "),
  );

  return {
    canonicalCategory: winner,
    confidence: Number(confidence.toFixed(2)),
    reason: `${winner} selected from ${winningSignals.join("; ")}.`,
    source: winningSignalIsSource ? "source" : "rules",
    matchedSignals: winningSignals,
    needsReview: confidence < 0.78 || margin < 14,
  };
}

export function categorizeOpportunity(
  input: Record<string, unknown>,
): OpportunityCanonicalCategory {
  return classifyOpportunity(input).canonicalCategory;
}
