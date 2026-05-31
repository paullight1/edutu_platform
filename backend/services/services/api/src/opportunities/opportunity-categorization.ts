export type OpportunityCanonicalCategory =
  | "scholarships"
  | "internships"
  | "programs"
  | "fellowships"
  | "grants"
  | "jobs"
  | "competitions"
  | "other";

export type OpportunityClassificationSource =
  | "stored"
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

type Rule = {
  category: Exclude<OpportunityCanonicalCategory, "other">;
  label: string;
  weight: number;
  pattern: RegExp;
};

const CATEGORY_ALIASES: Record<string, OpportunityCanonicalCategory> = {
  scholarship: "scholarships",
  scholarships: "scholarships",
  education: "scholarships",
  bursary: "scholarships",
  bursaries: "scholarships",
  internship: "internships",
  internships: "internships",
  intern: "internships",
  careers: "internships",
  career: "internships",
  fellowship: "fellowships",
  fellowships: "fellowships",
  leadership: "fellowships",
  program: "programs",
  programs: "programs",
  programme: "programs",
  programmes: "programs",
  global_programs: "programs",
  global_program: "programs",
  grant: "grants",
  grants: "grants",
  job: "jobs",
  jobs: "jobs",
  competition: "competitions",
  competitions: "competitions",
  challenge: "competitions",
  challenges: "competitions",
  other: "other",
  general: "other",
};

const RULES: Rule[] = [
  {
    category: "scholarships",
    label: "scholarship/bursary/tuition funding",
    weight: 45,
    pattern:
      /\b(scholarship|scholarships|bursary|bursaries|studentship|tuition|financial aid|study grant|fully funded|partially funded)\b/i,
  },
  {
    category: "internships",
    label: "internship/trainee/apprenticeship",
    weight: 44,
    pattern:
      /\b(internship|internships|intern\b|trainee|graduate trainee|apprentice|apprenticeship|industrial attachment|work placement)\b/i,
  },
  {
    category: "fellowships",
    label: "fellowship/residency",
    weight: 43,
    pattern:
      /\b(fellowship|fellowships|fellow\b|research fellow|visiting fellow|resident|residency)\b/i,
  },
  {
    category: "grants",
    label: "direct grant/project funding",
    weight: 39,
    pattern:
      /\b(grant|grants|seed funding|project funding|research grant|innovation fund|microgrant|prize funding)\b/i,
  },
  {
    category: "programs",
    label: "event/summit/forum/delegate program",
    weight: 56,
    pattern:
      /\b(one young world|summit|summits|conference|conferences|forum|forums|delegate|delegates|youth ambassador|global ambassador)\b/i,
  },
  {
    category: "programs",
    label: "summit/forum/conference/delegate program",
    weight: 35,
    pattern:
      /\b(one young world|summit|summits|conference|conferences|forum|forums|delegate|delegates|youth ambassador|global ambassador|leadership program|leadership programme|exchange program|exchange programme|training program|training programme|mentorship program|mentorship programme|bootcamp|accelerator|incubator|global program|global programme)\b/i,
  },
  {
    category: "competitions",
    label: "competition/challenge/hackathon",
    weight: 34,
    pattern:
      /\b(competition|competitions|challenge|challenges|contest|hackathon|case competition|pitch competition)\b/i,
  },
  {
    category: "jobs",
    label: "job/employment role",
    weight: 33,
    pattern:
      /\b(job|jobs|employment|vacancy|vacancies|role|roles|hiring|full-time|part-time)\b/i,
  },
];

const BLOCKERS: Partial<
  Record<OpportunityCanonicalCategory, OpportunityCanonicalCategory[]>
> = {
  programs: ["internships", "fellowships", "grants"],
  grants: ["scholarships"],
  jobs: ["internships", "fellowships"],
};

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

function normalizeCategory(value: unknown): OpportunityCanonicalCategory | null {
  const key = normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z_]/g, "");
  return CATEGORY_ALIASES[key] ?? null;
}

function buildClassificationText(input: Record<string, unknown>): string {
  return [
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
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");
}

export function classifyOpportunity(
  input: Record<string, unknown>,
): OpportunityClassificationResult {
  const stored = normalizeCategory(
    input.canonicalCategory || input.canonical_category,
  );

  if (stored && stored !== "other") {
    return {
      canonicalCategory: stored,
      confidence: 0.99,
      reason: `Existing canonical category preserved: ${stored}.`,
      source: "stored",
      matchedSignals: ["stored_canonical_category"],
      needsReview: false,
    };
  }

  const text = buildClassificationText(input);
  const scores = new Map<OpportunityCanonicalCategory, number>();
  const signals = new Map<OpportunityCanonicalCategory, string[]>();

  for (const rule of RULES) {
    if (!rule.pattern.test(text)) continue;
    scores.set(rule.category, (scores.get(rule.category) ?? 0) + rule.weight);
    signals.set(rule.category, [
      ...(signals.get(rule.category) ?? []),
      rule.label,
    ]);
  }

  for (const [category, blockedBy] of Object.entries(BLOCKERS) as Array<
    [OpportunityCanonicalCategory, OpportunityCanonicalCategory[]]
  >) {
    const categoryScore = scores.get(category) ?? 0;
    if (!categoryScore) continue;

    const blockerScore = blockedBy.reduce(
      (total, blocker) => total + (scores.get(blocker) ?? 0),
      0,
    );

    if (blockerScore > 0) {
      scores.set(category, Math.max(0, categoryScore - blockerScore - 8));
      signals.set(category, [
        ...(signals.get(category) ?? []),
        `Downranked because ${blockedBy.join(", ")} signal was stronger.`,
      ]);
    }
  }

  const ranked = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  const [winner, winningScore] = ranked[0] ?? [];
  if (!winner || !winningScore) {
    const sourceCategory = normalizeCategory(input.category || input.type);
    if (sourceCategory && sourceCategory !== "other") {
      return {
        canonicalCategory: sourceCategory,
        confidence: 0.66,
        reason: `No strong text signal; used source/category hint: ${sourceCategory}.`,
        source: "fallback",
        matchedSignals: ["source_category_hint"],
        needsReview: true,
      };
    }

    return {
      canonicalCategory: "other",
      confidence: 0.35,
      reason: "No reliable category signal found.",
      source: "fallback",
      matchedSignals: [],
      needsReview: true,
    };
  }

  const secondScore = ranked[1]?.[1] ?? 0;
  const margin = winningScore - secondScore;
  const confidence = Math.min(0.97, 0.58 + winningScore / 100 + margin / 160);

  return {
    canonicalCategory: winner,
    confidence: Number(confidence.toFixed(2)),
    reason: `${winner} selected from ${signals.get(winner)?.join("; ")}.`,
    source: "rules",
    matchedSignals: signals.get(winner) ?? [],
    needsReview: confidence < 0.75 || margin < 10,
  };
}

export function categorizeOpportunity(
  input: Record<string, unknown>,
): OpportunityCanonicalCategory {
  return classifyOpportunity(input).canonicalCategory;
}
