import {
  cleanOpportunityList,
  refineOpportunityContent,
  type RefinedOpportunityContent,
} from "./opportunity-content-normalizer";

export type OpportunityRecord = Record<string, any>;

export interface OpportunityContentUpdateResult {
  update: Record<string, any>;
  content: RefinedOpportunityContent;
  sourceBacked: boolean;
  protectedFields: string[];
}

const GENERIC_ORGANIZATION_RE =
  /^(?:unknown|n\/?a|not specified|programme? organizer|program organizer|official organizer|the official organizer)$/i;
const PRESENTATION_NOISE_RE =
  /<[^>]+>|https?:\/\/|\b(?:advertisement|advertorial|sponsored content|share this|privacy policy|cookie policy|apply now|click here|join our whatsapp|subscribe to our newsletter)\b/i;

function metadataOf(record: OpportunityRecord): Record<string, any> {
  const value = record?.metadata;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function firstValue<T = unknown>(
  record: OpportunityRecord,
  keys: string[],
): T | undefined {
  for (const key of keys) {
    if (
      record?.[key] !== undefined &&
      record?.[key] !== null &&
      record?.[key] !== ""
    ) {
      return record[key] as T;
    }
  }
  return undefined;
}

function listFrom(record: OpportunityRecord, keys: string[]): string[] {
  const metadata = metadataOf(record);
  for (const key of keys) {
    for (const value of [record?.[key], metadata?.[key]]) {
      const cleaned = cleanOpportunityList(value);
      if (cleaned.length > 0) return cleaned;
    }
  }
  return [];
}

export function isSourceBackedOpportunity(record: OpportunityRecord): boolean {
  const metadata = metadataOf(record);
  const enrichment = metadata.ai_enrichment;
  const nestedSourceBacked = Boolean(
    enrichment &&
    typeof enrichment === "object" &&
    !Array.isArray(enrichment) &&
    ((enrichment as Record<string, unknown>).source_text_used === true ||
      (enrichment as Record<string, unknown>).sourceTextUsed === true),
  );

  return (
    nestedSourceBacked ||
    metadata.ai_source_text_used === true ||
    metadata.source_text_used === true
  );
}

function chooseProtectedFact(
  original: OpportunityRecord,
  candidate: OpportunityRecord,
  keys: string[],
  sourceBacked: boolean,
): unknown {
  const originalValue = firstValue(original, keys);
  if (originalValue !== undefined) return originalValue;

  const candidateValue = firstValue(candidate, keys);
  if (sourceBacked) return candidateValue;

  // The upstream enhancer may already have written a plausible-looking hard
  // fact before this guard runs. Explicitly clear that value when it was not
  // present before and no useful source text supported it.
  return candidateValue !== undefined ? null : undefined;
}

function chooseOrganization(
  original: OpportunityRecord,
  candidate: OpportunityRecord,
  sourceBacked: boolean,
): string | null | undefined {
  const originalOrganization = String(
    firstValue(original, ["organization"]) ?? "",
  ).trim();
  if (
    originalOrganization &&
    !GENERIC_ORGANIZATION_RE.test(originalOrganization)
  ) {
    return originalOrganization;
  }

  if (sourceBacked) {
    const candidateOrganization = String(
      firstValue(candidate, ["organization"]) ?? "",
    ).trim();
    if (
      candidateOrganization &&
      !GENERIC_ORGANIZATION_RE.test(candidateOrganization)
    ) {
      return candidateOrganization;
    }
  }

  const candidateOrganization = String(
    firstValue(candidate, ["organization"]) ?? "",
  ).trim();
  if (originalOrganization) return originalOrganization;

  // The upstream enhancer may already have persisted an inferred organizer.
  // Clear it unless useful source text supported that new organization.
  return candidateOrganization ? null : undefined;
}

function chooseLists(
  original: OpportunityRecord,
  candidate: OpportunityRecord,
  sourceBacked: boolean,
) {
  const originalRequirements = listFrom(original, ["requirements"]);
  const originalBenefits = listFrom(original, ["benefits"]);
  const originalApplicationProcess = listFrom(original, [
    "applicationProcess",
    "application_process",
  ]);

  if (!sourceBacked) {
    return {
      requirements: originalRequirements,
      benefits: originalBenefits,
      applicationProcess: originalApplicationProcess,
    };
  }

  const candidateRequirements = listFrom(candidate, ["requirements"]);
  const candidateBenefits = listFrom(candidate, ["benefits"]);
  const candidateApplicationProcess = listFrom(candidate, [
    "applicationProcess",
    "application_process",
  ]);

  return {
    requirements:
      candidateRequirements.length > 0
        ? candidateRequirements
        : originalRequirements,
    benefits:
      candidateBenefits.length > 0 ? candidateBenefits : originalBenefits,
    applicationProcess:
      candidateApplicationProcess.length > 0
        ? candidateApplicationProcess
        : originalApplicationProcess,
  };
}

/**
 * Build the full, safe update after an AI/source enrichment pass. Existing hard
 * facts remain authoritative; only editorial copy and source-backed structured
 * sections are allowed to change.
 */
export function buildOpportunityContentUpdate(
  original: OpportunityRecord,
  candidate: OpportunityRecord = original,
): OpportunityContentUpdateResult {
  const sourceBacked = isSourceBackedOpportunity(candidate);
  const selectedLists = chooseLists(original, candidate, sourceBacked);
  const candidateSummary =
    firstValue(candidate, ["summary"]) ?? firstValue(original, ["summary"]);
  const candidateDescription =
    firstValue(candidate, ["description"]) ??
    firstValue(original, ["description"]);

  const content = refineOpportunityContent(
    {
      summary: candidateSummary,
      description: candidateDescription,
      requirements: selectedLists.requirements,
      benefits: selectedLists.benefits,
      applicationProcess: selectedLists.applicationProcess,
    },
    {
      sourceBacked,
      // When source text is unavailable, these lists came from the original
      // stored row rather than from the new model output, so they remain safe.
      allowUnverifiedLists:
        selectedLists.requirements.length > 0 ||
        selectedLists.benefits.length > 0 ||
        selectedLists.applicationProcess.length > 0,
    },
  );

  const eligibility = chooseProtectedFact(
    original,
    candidate,
    ["eligibility"],
    sourceBacked,
  );
  const deadline = chooseProtectedFact(
    original,
    candidate,
    ["close_date", "closeDate", "deadline"],
    sourceBacked,
  );
  const applyUrl = chooseProtectedFact(
    original,
    candidate,
    ["application_url", "apply_url", "applicationUrl", "applyUrl", "link"],
    sourceBacked,
  );
  const sourceUrl = chooseProtectedFact(
    original,
    candidate,
    ["source_url", "sourceUrl"],
    sourceBacked,
  );
  const fundingType = chooseProtectedFact(
    original,
    candidate,
    ["funding_type", "fundingType"],
    sourceBacked,
  );
  const targetRegion = chooseProtectedFact(
    original,
    candidate,
    ["target_region", "targetRegion"],
    sourceBacked,
  );
  const eligibilityCriteria = chooseProtectedFact(
    original,
    candidate,
    ["eligibility_criteria", "eligibilityCriteria"],
    sourceBacked,
  );

  const update: Record<string, any> = {
    // Keep identity/display fields stable during a content-only pass.
    title: original.title,
    category: original.category,
    organization: chooseOrganization(original, candidate, sourceBacked),
    location: firstValue(original, ["location"]),
    isRemote: firstValue(original, ["is_remote", "isRemote"]),
    imageUrl: firstValue(original, ["image_url", "imageUrl"]),
    isFeatured: firstValue(original, ["is_featured", "isFeatured"]),
    status: firstValue(original, ["status"]),
    tags: firstValue(original, ["tags"]),

    summary: content.summary,
    description: content.description,
    requirements: content.requirements,
    benefits: content.benefits,
    applicationProcess: content.applicationProcess,
    skills: sourceBacked
      ? listFrom(candidate, ["skills"])
      : listFrom(original, ["skills"]),

    // Existing hard facts always win. A new hard fact is accepted only when
    // the enhancer actually read useful source-page text.
    deadline,
    applyUrl,
    sourceUrl,
    fundingType,
    targetRegion,
    eligibilityCriteria,
    eligibility,

    qualityScore: content.qualityScore,
    validationStatus: content.needsReview ? "needs_review" : "valid",
  };

  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) delete update[key];
  }

  return {
    update,
    content,
    sourceBacked,
    protectedFields: [
      "deadline",
      "application_url",
      "source_url",
      "funding_type",
      "target_region",
      "eligibility",
      "eligibility_criteria",
      "organization",
      "location",
    ],
  };
}

/** Cheap predicate used by the catalogue backfill before it spends an AI call. */
export function shouldRefineOpportunity(record: OpportunityRecord): boolean {
  const description = String(firstValue(record, ["description"]) ?? "");
  const summary = String(firstValue(record, ["summary"]) ?? "");
  if (PRESENTATION_NOISE_RE.test(`${summary}\n${description}`)) return true;

  const content = refineOpportunityContent(
    {
      summary,
      description,
      requirements: listFrom(record, ["requirements"]),
      benefits: listFrom(record, ["benefits"]),
      applicationProcess: listFrom(record, [
        "applicationProcess",
        "application_process",
      ]),
    },
    { sourceBacked: true },
  );

  return content.qualityScore < 75;
}

export function contentUpdateChanged(
  record: OpportunityRecord,
  update: Record<string, any>,
): boolean {
  const comparisons: Array<[unknown, unknown]> = [
    [record.summary ?? "", update.summary ?? ""],
    [record.description ?? "", update.description ?? ""],
    [listFrom(record, ["requirements"]), update.requirements ?? []],
    [listFrom(record, ["benefits"]), update.benefits ?? []],
    [
      listFrom(record, ["applicationProcess", "application_process"]),
      update.applicationProcess ?? [],
    ],
  ];

  return comparisons.some(
    ([left, right]) => JSON.stringify(left) !== JSON.stringify(right),
  );
}
