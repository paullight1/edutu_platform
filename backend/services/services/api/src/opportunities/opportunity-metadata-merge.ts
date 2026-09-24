export type OpportunityMetadata = Record<string, unknown>;
export type OpportunityMetadataInput = Record<string, unknown>;

function hasOwn(record: OpportunityMetadataInput, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function firstOwn(
  record: OpportunityMetadataInput,
  keys: string[],
): { present: boolean; value: unknown } {
  for (const key of keys) {
    if (hasOwn(record, key)) return { present: true, value: record[key] };
  }
  return { present: false, value: undefined };
}

function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function cleanTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    ),
  );
}

function isPlainObject(value: unknown): value is OpportunityMetadata {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype,
  );
}

export function mergeOpportunityMetadata(
  existing: OpportunityMetadata | null | undefined,
  patch: OpportunityMetadata | null | undefined,
): OpportunityMetadata {
  const base = isPlainObject(existing) ? existing : {};
  const next = isPlainObject(patch) ? patch : {};
  const merged: OpportunityMetadata = { ...base };

  for (const [key, value] of Object.entries(next)) {
    const previous = merged[key];
    merged[key] =
      isPlainObject(previous) && isPlainObject(value)
        ? mergeOpportunityMetadata(previous, value)
        : value;
  }

  return merged;
}

export function buildOpportunityMetadataPatch(
  input: OpportunityMetadataInput,
): OpportunityMetadata {
  const patch: OpportunityMetadata = {};

  const summary = firstOwn(input, ["summary"]);
  if (summary.present) patch.summary = cleanText(summary.value);

  const organization = firstOwn(input, ["organization"]);
  if (organization.present) patch.organization = cleanText(organization.value);

  const eligibilityCriteria = firstOwn(input, [
    "eligibilityCriteria",
    "eligibility_criteria",
  ]);
  if (eligibilityCriteria.present) {
    patch.eligibility_criteria = cleanText(eligibilityCriteria.value);
  }

  const fundingType = firstOwn(input, ["fundingType", "funding_type"]);
  if (fundingType.present) patch.funding_type = cleanText(fundingType.value);

  const targetRegion = firstOwn(input, ["targetRegion", "target_region"]);
  if (targetRegion.present) patch.target_region = cleanText(targetRegion.value);

  const eligibility = firstOwn(input, ["eligibility"]);
  if (eligibility.present) {
    patch.eligibility = isPlainObject(eligibility.value)
      ? eligibility.value
      : eligibility.value === null
        ? null
        : {};
  }

  const requirements = firstOwn(input, ["requirements"]);
  if (requirements.present) {
    patch.requirements = cleanTextList(requirements.value);
  }

  const benefits = firstOwn(input, ["benefits"]);
  if (benefits.present) patch.benefits = cleanTextList(benefits.value);

  const applicationProcess = firstOwn(input, [
    "applicationProcess",
    "application_process",
  ]);
  if (applicationProcess.present) {
    patch.application_process = cleanTextList(applicationProcess.value);
  }

  const qualityScore = firstOwn(input, ["qualityScore", "quality_score"]);
  if (qualityScore.present) patch.quality_score = qualityScore.value ?? null;

  const validationStatus = firstOwn(input, [
    "validationStatus",
    "validation_status",
  ]);
  if (validationStatus.present) {
    patch.validation_status = cleanText(validationStatus.value);
  }

  return patch;
}
