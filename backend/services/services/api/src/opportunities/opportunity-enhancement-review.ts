import { createHmac, timingSafeEqual } from "crypto";

export const OPPORTUNITY_ENHANCEMENT_REVIEW_VERSION =
  "opportunity-enhancement-review-v1" as const;

export const OPPORTUNITY_ENHANCEMENT_FIELD_NAMES = [
  "summary",
  "description",
  "organization",
  "location",
  "deadline",
  "applicationUrl",
  "sourceUrl",
  "fundingType",
  "targetRegion",
  "eligibilityCriteria",
  "eligibility",
  "requirements",
  "benefits",
  "applicationProcess",
  "skills",
  "tags",
] as const;

export type OpportunityEnhancementFieldName =
  (typeof OPPORTUNITY_ENHANCEMENT_FIELD_NAMES)[number];

export type OpportunityEnhancementFieldStatus =
  | "source_backed"
  | "editorial"
  | "existing_verified"
  | "unresolved"
  | "unsupported"
  | "unchanged";

export interface OpportunityEnhancementQuality {
  score: number;
  missingFields: string[];
}

export interface OpportunityEnhancementDiagnostics {
  aiAttempted?: boolean;
  aiFallback?: boolean;
  aiError?: string | null;
  sourceUrl?: string | null;
  sourceDomain?: string | null;
  sourceTextLength?: number;
  [key: string]: unknown;
}

export interface OpportunityEnhancementReviewField {
  name: OpportunityEnhancementFieldName;
  before: unknown;
  after: unknown;
  status: OpportunityEnhancementFieldStatus;
  selectable: boolean;
  selectedByDefault: boolean;
  editable: boolean;
  reason: string;
}

export type OpportunityEnhancementValues = Record<
  OpportunityEnhancementFieldName,
  unknown
>;

export interface OpportunityEnhancementPreview {
  version: typeof OPPORTUNITY_ENHANCEMENT_REVIEW_VERSION;
  opportunityId: string;
  baseUpdatedAt: string;
  createdAt: string;
  expiresAt: string;
  sourceBacked: boolean;
  before: OpportunityEnhancementValues;
  proposed: OpportunityEnhancementValues;
  beforeQuality: OpportunityEnhancementQuality;
  afterQuality: OpportunityEnhancementQuality;
  diagnostics: OpportunityEnhancementDiagnostics;
  fields: OpportunityEnhancementReviewField[];
  defaultSelectedFields: OpportunityEnhancementFieldName[];
}

export interface BuildOpportunityEnhancementReviewInput {
  opportunityId: string;
  baseUpdatedAt: string;
  createdAt: string;
  expiresAt: string;
  sourceBacked: boolean;
  before: Partial<Record<OpportunityEnhancementFieldName, unknown>>;
  proposed: Partial<Record<OpportunityEnhancementFieldName, unknown>>;
  beforeQuality: OpportunityEnhancementQuality;
  afterQuality: OpportunityEnhancementQuality;
  diagnostics?: OpportunityEnhancementDiagnostics;
}

export interface VerifyOpportunityEnhancementPreviewOptions {
  now?: Date;
}

export interface BuildSelectedEnhancementUpdateInput {
  selectedFields: OpportunityEnhancementFieldName[];
  edits?: Partial<Record<OpportunityEnhancementFieldName, unknown>>;
}

const EDITORIAL_FIELDS = new Set<OpportunityEnhancementFieldName>([
  "summary",
  "description",
]);

const EDITABLE_LIST_FIELDS = new Set<OpportunityEnhancementFieldName>([
  "requirements",
  "benefits",
  "applicationProcess",
  "skills",
  "tags",
]);

const LIST_FIELDS = new Set<OpportunityEnhancementFieldName>([
  ...EDITABLE_LIST_FIELDS,
]);

const HARD_FACT_FIELDS = new Set<OpportunityEnhancementFieldName>([
  "organization",
  "location",
  "deadline",
  "applicationUrl",
  "sourceUrl",
  "fundingType",
  "targetRegion",
  "eligibilityCriteria",
  "eligibility",
]);

const EDITABLE_FIELDS = new Set<OpportunityEnhancementFieldName>([
  ...EDITORIAL_FIELDS,
  ...EDITABLE_LIST_FIELDS,
]);

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return value == null ? null : String(value);
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized || null;
}

function normalizeList(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value];
  return Array.from(
    new Set(
      entries
        .map((entry) => normalizeString(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  );
}

function normalizeObject(value: unknown): unknown {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeObject(entry));
  }
  if (typeof value !== "object") {
    return typeof value === "string" ? normalizeString(value) : value;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, normalizeObject(nested)] as const)
    .filter(([, nested]) => nested !== undefined);

  return entries.length ? Object.fromEntries(entries) : null;
}

function normalizeFieldValue(
  field: OpportunityEnhancementFieldName,
  value: unknown,
): unknown {
  if (LIST_FIELDS.has(field)) return normalizeList(value);
  if (field === "eligibility") return normalizeObject(value);
  if (typeof value === "string" || value == null) return normalizeString(value);
  return normalizeObject(value);
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeValues(
  input: Partial<Record<OpportunityEnhancementFieldName, unknown>>,
): OpportunityEnhancementValues {
  return Object.fromEntries(
    OPPORTUNITY_ENHANCEMENT_FIELD_NAMES.map((field) => [
      field,
      normalizeFieldValue(field, input[field]),
    ]),
  ) as OpportunityEnhancementValues;
}

function classifyField(
  name: OpportunityEnhancementFieldName,
  before: unknown,
  after: unknown,
  sourceBacked: boolean,
): Omit<OpportunityEnhancementReviewField, "name" | "before" | "after"> {
  const beforePresent = hasMeaningfulValue(before);
  const afterPresent = hasMeaningfulValue(after);
  const changed = !valuesEqual(before, after);
  const editable = EDITABLE_FIELDS.has(name);

  if (!changed) {
    if (!beforePresent && !afterPresent) {
      return {
        status: "unresolved",
        selectable: false,
        selectedByDefault: false,
        editable,
        reason: "No reliable value is available for this field.",
      };
    }

    if (HARD_FACT_FIELDS.has(name) && beforePresent) {
      return {
        status: "existing_verified",
        selectable: false,
        selectedByDefault: false,
        editable: false,
        reason: "The existing factual value is retained unchanged.",
      };
    }

    return {
      status: "unchanged",
      selectable: false,
      selectedByDefault: false,
      editable,
      reason: "The proposed value is the same as the stored value.",
    };
  }

  if (!afterPresent) {
    return {
      status: "unresolved",
      selectable: false,
      selectedByDefault: false,
      editable,
      reason: "The proposal did not produce a reliable replacement value.",
    };
  }

  if (EDITORIAL_FIELDS.has(name)) {
    return {
      status: "editorial",
      selectable: true,
      selectedByDefault: true,
      editable: true,
      reason:
        "The wording changed without granting authority to a new hard fact.",
    };
  }

  if (!sourceBacked) {
    return {
      status: "unsupported",
      selectable: false,
      selectedByDefault: false,
      editable,
      reason:
        "The new factual value is not supported by useful source-page text.",
    };
  }

  return {
    status: "source_backed",
    selectable: true,
    selectedByDefault: true,
    editable,
    reason: "The changed value is supported by useful source-page text.",
  };
}

function normalizeQuality(
  value: OpportunityEnhancementQuality,
): OpportunityEnhancementQuality {
  return {
    score: Math.max(0, Math.min(100, Number(value?.score) || 0)),
    missingFields: Array.from(
      new Set(
        (Array.isArray(value?.missingFields) ? value.missingFields : [])
          .map((field) => String(field).trim())
          .filter(Boolean),
      ),
    ),
  };
}

export function buildOpportunityEnhancementReview(
  input: BuildOpportunityEnhancementReviewInput,
): OpportunityEnhancementPreview {
  if (!input.opportunityId?.trim()) {
    throw new Error("Opportunity id is required for an enhancement review.");
  }
  if (!input.baseUpdatedAt?.trim()) {
    throw new Error("A base opportunity version is required for review.");
  }

  const before = normalizeValues(input.before || {});
  const proposed = normalizeValues(input.proposed || {});
  const fields = OPPORTUNITY_ENHANCEMENT_FIELD_NAMES.map((name) => ({
    name,
    before: before[name],
    after: proposed[name],
    ...classifyField(name, before[name], proposed[name], input.sourceBacked),
  }));

  return {
    version: OPPORTUNITY_ENHANCEMENT_REVIEW_VERSION,
    opportunityId: input.opportunityId.trim(),
    baseUpdatedAt: input.baseUpdatedAt,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
    sourceBacked: Boolean(input.sourceBacked),
    before,
    proposed,
    beforeQuality: normalizeQuality(input.beforeQuality),
    afterQuality: normalizeQuality(input.afterQuality),
    diagnostics: { ...(input.diagnostics || {}) },
    fields,
    defaultSelectedFields: fields
      .filter((field) => field.selectable && field.selectedByDefault)
      .map((field) => field.name),
  };
}

function requireSigningSecret(secret: string): string {
  const normalized = String(secret || "").trim();
  if (!normalized) {
    throw new Error("An opportunity review signing secret is required.");
  }
  return normalized;
}

function previewSignature(payload: string, secret: string): Buffer {
  return createHmac("sha256", requireSigningSecret(secret))
    .update(payload)
    .digest();
}

export function signOpportunityEnhancementPreview(
  preview: OpportunityEnhancementPreview,
  secret: string,
): string {
  const payload = Buffer.from(JSON.stringify(preview), "utf8").toString(
    "base64url",
  );
  const signature = previewSignature(payload, secret).toString("base64url");
  return `${payload}.${signature}`;
}

function assertPreviewShape(value: unknown): OpportunityEnhancementPreview {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid opportunity enhancement preview token.");
  }

  const candidate = value as Partial<OpportunityEnhancementPreview>;
  if (
    candidate.version !== OPPORTUNITY_ENHANCEMENT_REVIEW_VERSION ||
    typeof candidate.opportunityId !== "string" ||
    typeof candidate.baseUpdatedAt !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.expiresAt !== "string" ||
    !Array.isArray(candidate.fields) ||
    !candidate.proposed ||
    typeof candidate.proposed !== "object"
  ) {
    throw new Error("Invalid opportunity enhancement preview token.");
  }

  return candidate as OpportunityEnhancementPreview;
}

export function verifyOpportunityEnhancementPreviewToken(
  token: string,
  secret: string,
  options: VerifyOpportunityEnhancementPreviewOptions = {},
): OpportunityEnhancementPreview {
  requireSigningSecret(secret);
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("Invalid opportunity enhancement preview token.");
  }

  const [payload, encodedSignature] = parts;
  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    throw new Error("Invalid opportunity enhancement preview signature.");
  }

  const expectedSignature = previewSignature(payload, secret);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new Error("Invalid opportunity enhancement preview signature.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid opportunity enhancement preview token.");
  }

  const preview = assertPreviewShape(parsed);
  const expiry = new Date(preview.expiresAt);
  const now = options.now ?? new Date();
  if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= now.getTime()) {
    throw new Error("The opportunity enhancement preview has expired.");
  }

  return preview;
}

function normalizeEditableValue(
  field: OpportunityEnhancementFieldName,
  value: unknown,
): unknown {
  if (EDITORIAL_FIELDS.has(field)) {
    if (typeof value !== "string") {
      throw new Error(`${field} edits must be text.`);
    }
    return normalizeString(value) ?? "";
  }

  if (EDITABLE_LIST_FIELDS.has(field)) {
    if (!Array.isArray(value)) {
      throw new Error(`${field} edits must be a list of text values.`);
    }
    return normalizeList(value);
  }

  throw new Error(`${field} is not an editable review field.`);
}

export function buildSelectedEnhancementUpdate(
  preview: OpportunityEnhancementPreview,
  input: BuildSelectedEnhancementUpdateInput,
): Partial<Record<OpportunityEnhancementFieldName, unknown>> {
  const selected = Array.from(new Set(input.selectedFields || []));
  const selectedSet = new Set(selected);
  const fields = new Map(preview.fields.map((field) => [field.name, field]));
  const edits = input.edits || {};

  for (const key of Object.keys(edits) as OpportunityEnhancementFieldName[]) {
    const field = fields.get(key);
    if (!field) throw new Error(`Unknown opportunity review field: ${key}.`);
    if (!selectedSet.has(key)) {
      throw new Error(`${key} must be selected before it can be edited.`);
    }
    if (!field.editable || !EDITABLE_FIELDS.has(key)) {
      throw new Error(`${key} is not an editable review field.`);
    }
  }

  const update: Partial<Record<OpportunityEnhancementFieldName, unknown>> = {};
  for (const name of selected) {
    const field = fields.get(name);
    if (!field) throw new Error(`Unknown opportunity review field: ${name}.`);
    if (!field.selectable) {
      throw new Error(
        `${name} is not selectable because its review status is ${field.status}.`,
      );
    }

    const hasEdit = Object.prototype.hasOwnProperty.call(edits, name);
    update[name] = hasEdit
      ? normalizeEditableValue(name, edits[name])
      : preview.proposed[name];
  }

  return update;
}
