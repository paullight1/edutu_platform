import { createHash } from "crypto";
import { z } from "zod";

type OpportunityRecord = Record<string, any>;

export type EnrichField = "summary" | "benefits" | "eligibility";

export interface ShareEnrichment {
  summary?: string;
  benefits?: string[];
  eligibility?: string[];
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function clean(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\s+/g, " ").trim()
    : "";
}

function cleanList(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  return Array.from(new Set(source.map((v) => clean(v)).filter(Boolean)));
}

/** Trim + drop blanks + cap length; used to sanitize AI arrays. */
const BulletList = z
  .array(z.any())
  .optional()
  .transform((arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((v) => clean(v))
      .filter(Boolean)
      .slice(0, 5),
  );

export const ShareEnrichmentSchema = z
  .object({
    summary: z
      .any()
      .optional()
      .transform((v) => clean(v) || undefined),
    benefits: BulletList,
    eligibility: BulletList,
  })
  .transform((v) => ({
    summary: v.summary,
    benefits: v.benefits && v.benefits.length ? v.benefits : undefined,
    eligibility:
      v.eligibility && v.eligibility.length ? v.eligibility : undefined,
  }));

function hasSummary(opp: OpportunityRecord): boolean {
  const metadata = asRecord(opp.metadata);
  return Boolean(clean(opp.summary || metadata.summary));
}

function hasBenefits(opp: OpportunityRecord): boolean {
  const metadata = asRecord(opp.metadata);
  return cleanList(opp.benefits ?? metadata.benefits).length > 0;
}

function hasEligibility(opp: OpportunityRecord): boolean {
  const metadata = asRecord(opp.metadata);
  if (cleanList(opp.eligibility ?? metadata.eligibility).length > 0) return true;
  const obj = asRecord(opp.eligibility ?? metadata.eligibility);
  if (Array.isArray(obj.countries) && obj.countries.length > 0) return true;
  return Boolean(clean(obj.audience || obj.target_audience));
}

export function missingShareFields(opp: OpportunityRecord): EnrichField[] {
  const missing: EnrichField[] = [];
  if (!hasSummary(opp)) missing.push("summary");
  if (!hasBenefits(opp)) missing.push("benefits");
  if (!hasEligibility(opp)) missing.push("eligibility");
  return missing;
}

export function shareEnrichSourceHash(opp: OpportunityRecord): string {
  return createHash("sha1")
    .update(
      JSON.stringify({
        title: clean(opp.title),
        summary: clean(opp.summary),
        description: clean(opp.description),
        organization: clean(opp.organization),
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

export function buildShareEnrichPrompt(
  opp: OpportunityRecord,
  missing: EnrichField[],
): string {
  const facts = [
    `Title: ${clean(opp.title) || "(none)"}`,
    `Organization: ${clean(opp.organization) || "(none)"}`,
    `Category: ${clean(opp.category) || "(none)"}`,
    `Summary: ${clean(opp.summary) || "(none)"}`,
    `Description: ${clean(opp.description) || "(none)"}`,
  ].join("\n");

  return [
    "You are completing missing fields for an education/career opportunity so it can be shared clearly.",
    "Use ONLY the information provided below. Do NOT invent facts, numbers, dates, or requirements that are not supported by the text.",
    "If a requested field cannot be grounded in the provided text, return an empty array for it (or omit it).",
    "Never output a deadline or date — that is handled separately.",
    "",
    "OPPORTUNITY:",
    facts,
    "",
    `Return STRICT JSON with only these keys: ${missing.join(", ")}.`,
    '- "benefits": 2-4 short phrases of what an applicant gains (each under 15 words).',
    '- "eligibility": 2-4 short phrases describing who can apply (each under 15 words).',
    '- "summary": one plain-language sentence (under 40 words).',
    "Only include the keys that were requested. Output JSON only, no prose.",
  ].join("\n");
}

export function mergeShareEnrichment(
  opp: OpportunityRecord,
  ai: ShareEnrichment,
  hash: string,
  model: string,
): { metadataPatch: Record<string, any> | null; filled: EnrichField[] } {
  const metadata = asRecord(opp.metadata);
  const patch: Record<string, any> = { ...metadata };
  const filled: EnrichField[] = [];

  if (!hasSummary(opp) && ai.summary) {
    patch.summary = ai.summary;
    filled.push("summary");
  }
  if (!hasBenefits(opp) && ai.benefits && ai.benefits.length) {
    patch.benefits = ai.benefits;
    filled.push("benefits");
  }
  if (!hasEligibility(opp) && ai.eligibility && ai.eligibility.length) {
    patch.eligibility = ai.eligibility;
    filled.push("eligibility");
  }

  // Always record the attempt so we don't re-enrich the same content forever,
  // even when the AI had nothing groundable to add.
  patch.ai_enriched = {
    sourceHash: hash,
    model,
    fields: filled,
    createdAt: new Date().toISOString(),
  };

  return { metadataPatch: patch, filled };
}
