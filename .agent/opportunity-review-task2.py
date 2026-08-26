from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


write(
    "backend/services/services/api/src/opportunities/opportunity-source-evidence.service.ts",
    r'''import { Injectable } from "@nestjs/common";
import { lookup } from "node:dns/promises";
import * as https from "node:https";
import type { IncomingMessage } from "node:http";
import * as cheerio from "cheerio";
import {
  buildPinnedHttpsRequestOptions,
  isGlobalUnicastAddress,
  type ResolvedEgressAddress,
} from "../scraper/scraper-egress.service";

export interface OpportunitySourceEvidence {
  sourceBacked: boolean;
  sourceUrl: string | null;
  sourceDomain: string | null;
  sourceTextLength: number;
  error: string | null;
}

const SOURCE_FETCH_TIMEOUT_MS = 12_000;
const SOURCE_FETCH_MAX_BYTES = 1_500_000;
const SOURCE_FETCH_MAX_REDIRECTS = 3;
const MIN_USEFUL_SOURCE_CHARS = 400;

function sourceError(message: string): Error {
  const error = new Error(message);
  error.name = "OpportunitySourceEvidenceError";
  return error;
}

function parseSafeSourceUrl(rawUrl: string, baseUrl?: URL): URL {
  let parsed: URL;
  try {
    parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
  } catch {
    throw sourceError("The source URL is invalid.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    throw sourceError("The source URL must be a standard HTTPS address.");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost")
  ) {
    throw sourceError("The source host is not publicly reachable.");
  }
  if (/^\d+(?:\.\d+){3}$/.test(hostname) && !isGlobalUnicastAddress(hostname)) {
    throw sourceError("The source host is not publicly reachable.");
  }

  parsed.hash = "";
  return parsed;
}

function responseContentType(response: IncomingMessage): string {
  const value = response.headers["content-type"];
  return (Array.isArray(value) ? value[0] : value || "").toLowerCase();
}

function isHtmlLike(contentType: string): boolean {
  return (
    !contentType ||
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml") ||
    contentType.includes("text/plain")
  );
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}

async function resolvePublicAddress(
  url: URL,
  signal: AbortSignal,
): Promise<ResolvedEgressAddress> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const entries = await lookup(hostname, { all: true, verbatim: true });
  if (signal.aborted) throw sourceError("The source request timed out.");
  if (
    entries.length === 0 ||
    entries.some((entry) => !isGlobalUnicastAddress(entry.address))
  ) {
    throw sourceError("The source host did not resolve to a public address.");
  }

  const selected = entries[0];
  return {
    address: selected.address,
    family: selected.family as 4 | 6,
  };
}

function requestSourcePage(
  url: URL,
  address: ResolvedEgressAddress,
  signal: AbortSignal,
): Promise<{
  status: number;
  contentType: string;
  body: string;
  location: string | null;
}> {
  return new Promise((resolve, reject) => {
    let bytesRead = 0;
    const chunks: Buffer[] = [];
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : sourceError("Source fetch failed."));
    };

    const request = https.request(
      buildPinnedHttpsRequestOptions(url, address, signal),
      (response) => {
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytesRead += buffer.byteLength;
          if (bytesRead > SOURCE_FETCH_MAX_BYTES) {
            response.destroy();
            fail(sourceError("The source page is too large to inspect safely."));
            return;
          }
          chunks.push(buffer);
        });
        response.once("aborted", () => fail(sourceError("Source response aborted.")));
        response.once("error", fail);
        response.once("end", () => {
          if (settled) return;
          settled = true;
          resolve({
            status: response.statusCode ?? 0,
            contentType: responseContentType(response),
            body: Buffer.concat(chunks).toString("utf8"),
            location:
              typeof response.headers.location === "string"
                ? response.headers.location
                : null,
          });
        });
      },
    );

    request.once("error", fail);
    request.end();
  });
}

function extractUsefulSourceText(html: string): string {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header, aside, form, iframe").remove();
  const candidates: string[] = [];
  $(
    "article, main, .entry-content, .post-content, .content, [class*='content'], [class*='article']",
  ).each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim();
    if (text.length >= 120) candidates.push(text);
  });

  return (candidates.length
    ? candidates.sort((left, right) => right.length - left.length).slice(0, 3).join("\n\n")
    : $("body").text()
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12_000);
}

@Injectable()
export class OpportunitySourceEvidenceService {
  async inspect(rawUrl?: string | null): Promise<OpportunitySourceEvidence> {
    if (!rawUrl?.trim()) {
      return {
        sourceBacked: false,
        sourceUrl: null,
        sourceDomain: null,
        sourceTextLength: 0,
        error: "No source URL is available for verification.",
      };
    }

    let initialUrl: URL;
    try {
      initialUrl = parseSafeSourceUrl(rawUrl.trim());
    } catch (error) {
      return {
        sourceBacked: false,
        sourceUrl: rawUrl.trim(),
        sourceDomain: null,
        sourceTextLength: 0,
        error: error instanceof Error ? error.message : "The source URL is invalid.",
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(sourceError("The source request timed out.")),
      SOURCE_FETCH_TIMEOUT_MS,
    );

    try {
      let currentUrl = initialUrl;
      for (let redirects = 0; redirects <= SOURCE_FETCH_MAX_REDIRECTS; redirects += 1) {
        const address = await resolvePublicAddress(currentUrl, controller.signal);
        const response = await requestSourcePage(
          currentUrl,
          address,
          controller.signal,
        );

        if (isRedirect(response.status)) {
          if (!response.location || redirects === SOURCE_FETCH_MAX_REDIRECTS) {
            throw sourceError("The source redirected too many times.");
          }
          currentUrl = parseSafeSourceUrl(response.location, currentUrl);
          continue;
        }

        if (response.status < 200 || response.status >= 300) {
          throw sourceError("The source page could not be reached successfully.");
        }
        if (!isHtmlLike(response.contentType)) {
          throw sourceError("The source did not return a readable web page.");
        }

        const text = extractUsefulSourceText(response.body);
        const sourceBacked = text.length >= MIN_USEFUL_SOURCE_CHARS;
        return {
          sourceBacked,
          sourceUrl: currentUrl.toString(),
          sourceDomain: currentUrl.hostname.replace(/^www\./, "").toLowerCase(),
          sourceTextLength: text.length,
          error: sourceBacked
            ? null
            : "Source page did not contain enough useful text.",
        };
      }
    } catch (error) {
      return {
        sourceBacked: false,
        sourceUrl: initialUrl.toString(),
        sourceDomain: initialUrl.hostname.replace(/^www\./, "").toLowerCase(),
        sourceTextLength: 0,
        error:
          error instanceof Error
            ? error.message
            : "The source page could not be verified.",
      };
    } finally {
      clearTimeout(timeout);
    }

    return {
      sourceBacked: false,
      sourceUrl: initialUrl.toString(),
      sourceDomain: initialUrl.hostname.replace(/^www\./, "").toLowerCase(),
      sourceTextLength: 0,
      error: "The source page could not be verified.",
    };
  }
}
''',
)

write(
    "backend/services/services/api/src/opportunities/opportunity-enhancement-review.repository.ts",
    r'''import { Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { opportunities } from "../db/schema";

export type OpportunityEnhancementPersistencePayload = Partial<
  typeof opportunities.$inferInsert
>;

@Injectable()
export class OpportunityEnhancementReviewRepository {
  async apply(
    id: string,
    expectedUpdatedAt: string,
    payload: OpportunityEnhancementPersistencePayload,
  ): Promise<boolean> {
    const expectedVersion = new Date(expectedUpdatedAt);
    if (Number.isNaN(expectedVersion.getTime())) return false;

    const updated = await db
      .update(opportunities)
      .set({ ...payload, updatedAt: new Date() })
      .where(
        and(
          eq(opportunities.id, id),
          eq(opportunities.updatedAt, expectedVersion),
        ),
      )
      .returning({ id: opportunities.id })
      .execute();

    return updated.length > 0;
  }
}
''',
)

write(
    "backend/services/services/api/src/opportunities/opportunity-enhancement-review.dto.ts",
    r'''import { z } from "zod";
import { OPPORTUNITY_ENHANCEMENT_FIELD_NAMES } from "./opportunity-enhancement-review";

export const OpportunityEnhancementFieldSchema = z.enum(
  OPPORTUNITY_ENHANCEMENT_FIELD_NAMES,
);

export const ApplyOpportunityEnhancementSchema = z.object({
  previewToken: z.string().min(20).max(200_000),
  selectedFields: z
    .array(OpportunityEnhancementFieldSchema)
    .min(1)
    .max(OPPORTUNITY_ENHANCEMENT_FIELD_NAMES.length),
  edits: z.record(z.string(), z.unknown()).optional(),
});

export type ApplyOpportunityEnhancementDto = z.infer<
  typeof ApplyOpportunityEnhancementSchema
>;
''',
)

write(
    "backend/services/services/api/src/opportunities/opportunity-enhancement-review.service.ts",
    r'''import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { OpportunitiesService } from "./opportunities.service";
import { OpportunityEmbeddingService } from "./opportunity-embedding.service";
import { OpportunityShareCardService } from "./opportunity-share-card.service";
import { ScraperService } from "../scraper/scraper.service";
import {
  buildOpportunityContentUpdate,
  type OpportunityRecord,
} from "./opportunity-content-refinement";
import { refineOpportunityContent } from "./opportunity-content-normalizer";
import {
  buildOpportunityEnhancementReview,
  buildSelectedEnhancementUpdate,
  signOpportunityEnhancementPreview,
  verifyOpportunityEnhancementPreviewToken,
  type OpportunityEnhancementFieldName,
  type OpportunityEnhancementPreview,
  type OpportunityEnhancementQuality,
  type OpportunityEnhancementValues,
} from "./opportunity-enhancement-review";
import {
  OpportunityEnhancementReviewRepository,
  type OpportunityEnhancementPersistencePayload,
} from "./opportunity-enhancement-review.repository";
import { OpportunitySourceEvidenceService } from "./opportunity-source-evidence.service";
import type { ApplyOpportunityEnhancementDto } from "./opportunity-enhancement-review.dto";

const REVIEW_TTL_MS = 20 * 60 * 1_000;

function metadataOf(record: OpportunityRecord): Record<string, any> {
  const value = record?.metadata;
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function firstValue(
  record: OpportunityRecord,
  ...keys: string[]
): unknown {
  const metadata = metadataOf(record);
  for (const key of keys) {
    for (const candidate of [record?.[key], metadata?.[key]]) {
      if (candidate !== undefined && candidate !== null && candidate !== "") {
        return candidate;
      }
    }
  }
  return undefined;
}

function stringList(record: OpportunityRecord, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = firstValue(record, key);
    if (!Array.isArray(value)) continue;
    const cleaned = Array.from(
      new Set(
        value
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    );
    if (cleaned.length > 0) return cleaned;
  }
  return [];
}

function toVersion(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function sourceUrlOf(record: OpportunityRecord): string {
  return String(
    firstValue(
      record,
      "source_url",
      "sourceUrl",
      "application_url",
      "applicationUrl",
      "apply_url",
      "applyUrl",
      "canonical_url",
      "canonicalUrl",
    ) || "",
  ).trim();
}

function applicationUrlOf(record: OpportunityRecord): unknown {
  return firstValue(
    record,
    "application_url",
    "applicationUrl",
    "apply_url",
    "applyUrl",
    "canonical_url",
    "canonicalUrl",
  );
}

function valuesFromRecord(record: OpportunityRecord): OpportunityEnhancementValues {
  return {
    summary: firstValue(record, "summary"),
    description: firstValue(record, "description"),
    organization: firstValue(record, "organization"),
    location: firstValue(record, "location"),
    deadline: firstValue(record, "close_date", "closeDate", "deadline"),
    applicationUrl: applicationUrlOf(record),
    sourceUrl: firstValue(record, "source_url", "sourceUrl"),
    fundingType: firstValue(record, "funding_type", "fundingType"),
    targetRegion: firstValue(record, "target_region", "targetRegion"),
    eligibilityCriteria: firstValue(
      record,
      "eligibility_criteria",
      "eligibilityCriteria",
    ),
    eligibility: firstValue(record, "eligibility"),
    requirements: stringList(record, "requirements"),
    benefits: stringList(record, "benefits"),
    applicationProcess: stringList(
      record,
      "application_process",
      "applicationProcess",
    ),
    skills: stringList(record, "skills"),
    tags: stringList(record, "tags"),
  };
}

function missingFieldsFor(record: OpportunityRecord): string[] {
  const values = valuesFromRecord(record);
  return [
    ...(String(values.summary || "").trim().length >= 50 ? [] : ["summary"]),
    ...(String(values.description || "").trim().length >= 240
      ? []
      : ["description"]),
    ...(values.applicationUrl ? [] : ["application_url"]),
    ...(Array.isArray(values.requirements) && values.requirements.length
      ? []
      : ["requirements"]),
    ...(Array.isArray(values.benefits) && values.benefits.length
      ? []
      : ["benefits"]),
    ...(values.deadline ? [] : ["deadline"]),
  ];
}

function qualityFromRecord(record: OpportunityRecord): OpportunityEnhancementQuality {
  const metadata = metadataOf(record);
  const stored = Number(
    record.quality_score ??
      record.qualityScore ??
      metadata.extraction_quality_score ??
      metadata.quality_score,
  );
  if (Number.isFinite(stored) && stored >= 0) {
    return {
      score: Math.min(100, stored),
      missingFields: Array.isArray(metadata.extraction_missing_fields)
        ? metadata.extraction_missing_fields.map(String)
        : missingFieldsFor(record),
    };
  }

  const values = valuesFromRecord(record);
  const content = refineOpportunityContent(
    {
      summary: values.summary,
      description: values.description,
      requirements: values.requirements,
      benefits: values.benefits,
      applicationProcess: values.applicationProcess,
    },
    { sourceBacked: true },
  );
  return {
    score: content.qualityScore,
    missingFields: missingFieldsFor(record),
  };
}

function proposedValues(
  original: OpportunityRecord,
  candidate: OpportunityRecord,
  sourceBacked: boolean,
): OpportunityEnhancementValues {
  const raw = valuesFromRecord(candidate);
  const refinement = buildOpportunityContentUpdate(original, candidate);
  const safe = refinement.update;

  if (!sourceBacked) {
    return {
      ...raw,
      summary: refinement.content.summary,
      description: refinement.content.description,
    };
  }

  return {
    summary: refinement.content.summary,
    description: refinement.content.description,
    organization: safe.organization,
    location: safe.location,
    deadline: safe.deadline,
    applicationUrl: safe.applyUrl,
    sourceUrl: safe.sourceUrl,
    fundingType: safe.fundingType,
    targetRegion: safe.targetRegion,
    eligibilityCriteria: safe.eligibilityCriteria,
    eligibility: safe.eligibility,
    requirements: refinement.content.requirements,
    benefits: refinement.content.benefits,
    applicationProcess: refinement.content.applicationProcess,
    skills: safe.skills,
    tags: safe.tags,
  };
}

function scraperInput(record: OpportunityRecord): Record<string, unknown> {
  const metadata = metadataOf(record);
  return {
    ...record,
    source_url: sourceUrlOf(record),
    sourceUrl: sourceUrlOf(record),
    application_url: applicationUrlOf(record),
    apply_url: applicationUrlOf(record),
    requirements: stringList(record, "requirements"),
    benefits: stringList(record, "benefits"),
    application_process: stringList(
      record,
      "application_process",
      "applicationProcess",
    ),
    eligibility: firstValue(record, "eligibility") || metadata.eligibility || {},
  };
}

function signingSecret(): string {
  return String(
    process.env.OPPORTUNITY_REVIEW_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.CLERK_SECRET_KEY ||
      "",
  ).trim();
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function selectedPayload(
  current: OpportunityRecord,
  preview: OpportunityEnhancementPreview,
  selected: Partial<Record<OpportunityEnhancementFieldName, unknown>>,
): OpportunityEnhancementPersistencePayload {
  const metadata = metadataOf(current);
  const nextMetadata: Record<string, unknown> = { ...metadata };
  const payload: OpportunityEnhancementPersistencePayload = {};

  if (Object.prototype.hasOwnProperty.call(selected, "summary")) {
    payload.summary = String(selected.summary || "");
  }
  if (Object.prototype.hasOwnProperty.call(selected, "description")) {
    payload.description = String(selected.description || "");
  }
  if (Object.prototype.hasOwnProperty.call(selected, "organization")) {
    payload.organization = selected.organization
      ? String(selected.organization)
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "location")) {
    payload.location = selected.location ? String(selected.location) : null;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "deadline")) {
    const deadline = selected.deadline ? String(selected.deadline) : null;
    payload.closeDate = deadline;
    payload.deadline = asDate(deadline);
  }
  if (Object.prototype.hasOwnProperty.call(selected, "applicationUrl")) {
    const url = selected.applicationUrl
      ? String(selected.applicationUrl)
      : null;
    payload.applicationUrl = url;
    payload.applyUrl = url;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "sourceUrl")) {
    payload.sourceUrl = selected.sourceUrl ? String(selected.sourceUrl) : null;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "fundingType")) {
    payload.fundingType = selected.fundingType
      ? String(selected.fundingType)
      : null;
    nextMetadata.funding_type = payload.fundingType;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "targetRegion")) {
    payload.targetRegion = selected.targetRegion
      ? String(selected.targetRegion)
      : null;
    nextMetadata.target_region = payload.targetRegion;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "eligibilityCriteria")) {
    payload.eligibilityCriteria = selected.eligibilityCriteria
      ? String(selected.eligibilityCriteria)
      : null;
    nextMetadata.eligibility_criteria = payload.eligibilityCriteria;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "eligibility")) {
    payload.eligibility =
      selected.eligibility && typeof selected.eligibility === "object"
        ? (selected.eligibility as Record<string, unknown>)
        : null;
    nextMetadata.eligibility = payload.eligibility;
  }
  if (Object.prototype.hasOwnProperty.call(selected, "skills")) {
    payload.skills = Array.isArray(selected.skills)
      ? selected.skills.map(String)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(selected, "tags")) {
    payload.tags = Array.isArray(selected.tags) ? selected.tags.map(String) : [];
  }
  if (Object.prototype.hasOwnProperty.call(selected, "requirements")) {
    nextMetadata.requirements = Array.isArray(selected.requirements)
      ? selected.requirements.map(String)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(selected, "benefits")) {
    nextMetadata.benefits = Array.isArray(selected.benefits)
      ? selected.benefits.map(String)
      : [];
  }
  if (Object.prototype.hasOwnProperty.call(selected, "applicationProcess")) {
    nextMetadata.application_process = Array.isArray(
      selected.applicationProcess,
    )
      ? selected.applicationProcess.map(String)
      : [];
  }

  const mergedRecord: OpportunityRecord = {
    ...current,
    ...payload,
    summary: payload.summary ?? current.summary,
    description: payload.description ?? current.description,
    close_date: payload.closeDate ?? current.close_date,
    application_url: payload.applicationUrl ?? current.application_url,
    metadata: nextMetadata,
  };
  const values = valuesFromRecord(mergedRecord);
  const content = refineOpportunityContent(
    {
      summary: values.summary,
      description: values.description,
      requirements: values.requirements,
      benefits: values.benefits,
      applicationProcess: values.applicationProcess,
    },
    { sourceBacked: preview.sourceBacked, allowUnverifiedLists: true },
  );
  const missingFields = missingFieldsFor(mergedRecord);

  payload.qualityScore = content.qualityScore;
  payload.validationStatus = content.needsReview ? "needs_review" : "valid";
  payload.metadata = {
    ...nextMetadata,
    extraction_quality_score: content.qualityScore,
    extraction_missing_fields: missingFields,
    needs_review: content.needsReview,
    content_refined_at: new Date().toISOString(),
    opportunity_ai_review: {
      version: preview.version,
      reviewed_at: new Date().toISOString(),
      preview_created_at: preview.createdAt,
      source_backed: preview.sourceBacked,
      selected_fields: Object.keys(selected),
    },
  };

  return payload;
}

@Injectable()
export class OpportunityEnhancementReviewService {
  constructor(
    private readonly opportunitiesService: OpportunitiesService,
    private readonly scraperService: ScraperService,
    private readonly evidenceService: OpportunitySourceEvidenceService,
    private readonly repository: OpportunityEnhancementReviewRepository,
    private readonly embeddingService: OpportunityEmbeddingService,
    private readonly shareCardService: OpportunityShareCardService,
  ) {}

  async createPreview(id: string) {
    const original = (await this.opportunitiesService.findOne(
      id,
    )) as OpportunityRecord | null;
    if (!original) throw new NotFoundException("Opportunity not found");

    const secret = signingSecret();
    if (!secret) {
      throw new ServiceUnavailableException(
        "Opportunity AI review is not configured safely.",
      );
    }

    const evidence = await this.evidenceService.inspect(sourceUrlOf(original));
    let candidate = original;
    let aiError: string | null = null;
    let previewResult: any = null;

    try {
      previewResult = await this.scraperService.enhancePreviewOpportunity(
        scraperInput(original),
      );
      if (!previewResult?.success || !previewResult?.opportunity) {
        aiError = String(
          previewResult?.error || "The AI provider did not return a proposal.",
        );
      } else {
        candidate = previewResult.opportunity as OpportunityRecord;
      }
    } catch (error) {
      aiError = error instanceof Error ? error.message : String(error);
    }

    candidate = {
      ...candidate,
      metadata: {
        ...metadataOf(candidate),
        ai_source_text_used: evidence.sourceBacked,
      },
    };

    const createdAt = new Date();
    const beforeQuality = qualityFromRecord(original);
    const afterQuality: OpportunityEnhancementQuality = {
      score: Number(
        previewResult?.completeness?.score ?? qualityFromRecord(candidate).score,
      ),
      missingFields: Array.isArray(
        previewResult?.completeness?.missingFields,
      )
        ? previewResult.completeness.missingFields.map(String)
        : missingFieldsFor(candidate),
    };
    const baseUpdatedAt = toVersion(
      original.updated_at ?? original.updatedAt ?? original.created_at,
    );
    if (!baseUpdatedAt) {
      throw new ConflictException(
        "This opportunity has no stable edit version. Refresh it and try again.",
      );
    }

    const preview = buildOpportunityEnhancementReview({
      opportunityId: id,
      baseUpdatedAt,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + REVIEW_TTL_MS).toISOString(),
      sourceBacked: evidence.sourceBacked,
      before: valuesFromRecord(original),
      proposed: proposedValues(original, candidate, evidence.sourceBacked),
      beforeQuality,
      afterQuality,
      diagnostics: {
        aiAttempted: true,
        aiFallback: Boolean(aiError || !evidence.sourceBacked),
        aiError,
        sourceBacked: evidence.sourceBacked,
        evidenceError: evidence.error,
        sourceUrl: evidence.sourceUrl || sourceUrlOf(original) || null,
        sourceDomain: evidence.sourceDomain,
        sourceTextLength: evidence.sourceTextLength,
      },
    });

    return {
      success: true,
      preview,
      previewToken: signOpportunityEnhancementPreview(preview, secret),
    };
  }

  async applyPreview(id: string, body: ApplyOpportunityEnhancementDto) {
    const secret = signingSecret();
    if (!secret) {
      throw new ServiceUnavailableException(
        "Opportunity AI review is not configured safely.",
      );
    }

    let preview: OpportunityEnhancementPreview;
    try {
      preview = verifyOpportunityEnhancementPreviewToken(
        body.previewToken,
        secret,
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid enhancement preview.",
      );
    }

    if (preview.opportunityId !== id) {
      throw new BadRequestException(
        "This preview was issued for a different opportunity id.",
      );
    }

    const current = (await this.opportunitiesService.findOne(
      id,
    )) as OpportunityRecord | null;
    if (!current) throw new NotFoundException("Opportunity not found");

    const currentVersion = toVersion(
      current.updated_at ?? current.updatedAt ?? current.created_at,
    );
    if (!currentVersion || currentVersion !== preview.baseUpdatedAt) {
      throw new ConflictException(
        "This opportunity changed after the AI preview was created. Reopen AI Improve to review the latest version.",
      );
    }

    let selected: Partial<
      Record<OpportunityEnhancementFieldName, unknown>
    >;
    try {
      selected = buildSelectedEnhancementUpdate(preview, {
        selectedFields: body.selectedFields,
        edits: body.edits,
      });
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid selected changes.",
      );
    }

    const payload = selectedPayload(current, preview, selected);
    const applied = await this.repository.apply(
      id,
      preview.baseUpdatedAt,
      payload,
    );
    if (!applied) {
      throw new ConflictException(
        "This opportunity changed while the review was being applied. Reopen AI Improve and try again.",
      );
    }

    await this.opportunitiesService.invalidateCatalogCache();
    const opportunity = (await this.opportunitiesService.findOne(
      id,
    )) as OpportunityRecord | null;
    if (!opportunity) throw new NotFoundException("Opportunity not found");

    void this.embeddingService.embedOpportunity(id);
    await this.shareCardService.ensureShareCardForOpportunity(opportunity, {
      force: true,
    });

    return {
      success: true,
      opportunity,
      appliedFields: Object.keys(selected) as OpportunityEnhancementFieldName[],
    };
  }
}
''',
)

write(
    "backend/services/services/api/src/opportunities/opportunity-enhancement-review.controller.ts",
    r'''import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../auth";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  ApplyOpportunityEnhancementSchema,
  type ApplyOpportunityEnhancementDto,
} from "./opportunity-enhancement-review.dto";
import { OpportunityEnhancementReviewService } from "./opportunity-enhancement-review.service";

@Controller("opportunities/admin")
@UseGuards(AdminGuard)
export class OpportunityEnhancementReviewController {
  constructor(
    private readonly reviewService: OpportunityEnhancementReviewService,
  ) {}

  @Post(":id/enhance-preview")
  createPreview(@Param("id") id: string) {
    return this.reviewService.createPreview(id);
  }

  @Post(":id/apply-enhancement")
  applyPreview(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ApplyOpportunityEnhancementSchema))
    body: ApplyOpportunityEnhancementDto,
  ) {
    return this.reviewService.applyPreview(id, body);
  }
}
''',
)

write(
    "backend/services/services/api/src/scraper/scraper.module.ts",
    r'''import { Module, type OnModuleDestroy } from "@nestjs/common";
import { AiModule } from "../ai";
import { OpportunityEnhancementReviewController } from "../opportunities/opportunity-enhancement-review.controller";
import { OpportunityEnhancementReviewRepository } from "../opportunities/opportunity-enhancement-review.repository";
import { OpportunityEnhancementReviewService } from "../opportunities/opportunity-enhancement-review.service";
import { OpportunitySourceEvidenceService } from "../opportunities/opportunity-source-evidence.service";
import { OpportunitiesModule } from "../opportunities/opportunities.module";
import { OpportunityDedupService } from "./opportunity-dedup.service";
import { RobotsChecker } from "./robots-checker";
import { installSafeImageAxiosBridge } from "./safe-image-axios-bridge";
import { ScraperAlertsService } from "./scraper-alerts.service";
import { ScraperController } from "./scraper.controller";
import { loadScraperEgressConfig } from "./scraper-egress.config";
import { ScraperEgressController } from "./scraper-egress.controller";
import { ScraperEgressLimiter } from "./scraper-egress.limiter";
import { ScraperEgressService } from "./scraper-egress.service";
import { installScraperRuntimePolicy } from "./scraper-runtime-policy";
import { ScraperService } from "./scraper.service";
import { ScraperSourceAdminService } from "./scraper-source-admin.service";

@Module({
  imports: [AiModule, OpportunitiesModule],
  controllers: [
    ScraperController,
    ScraperEgressController,
    OpportunityEnhancementReviewController,
  ],
  providers: [
    { provide: "SCRAPER_EGRESS_CONFIG", useFactory: loadScraperEgressConfig },
    {
      provide: ScraperEgressLimiter,
      useFactory: (config: ReturnType<typeof loadScraperEgressConfig>) =>
        new ScraperEgressLimiter({
          limit: config.enabled ? config.rateLimitPerMinute : 1,
        }),
      inject: ["SCRAPER_EGRESS_CONFIG"],
    },
    {
      provide: ScraperEgressService,
      useFactory: (
        config: ReturnType<typeof loadScraperEgressConfig>,
        limiter: ScraperEgressLimiter,
      ) => new ScraperEgressService(config, { limiter }),
      inject: ["SCRAPER_EGRESS_CONFIG", ScraperEgressLimiter],
    },
    {
      provide: ScraperSourceAdminService,
      useValue: ScraperSourceAdminService.fromEnvironment(),
    },
    ScraperService,
    ScraperAlertsService,
    RobotsChecker,
    OpportunityDedupService,
    OpportunitySourceEvidenceService,
    OpportunityEnhancementReviewRepository,
    OpportunityEnhancementReviewService,
  ],
  exports: [
    ScraperService,
    ScraperSourceAdminService,
    ScraperAlertsService,
    RobotsChecker,
    OpportunityDedupService,
    OpportunityEnhancementReviewService,
  ],
})
export class ScraperModule implements OnModuleDestroy {
  private readonly restoreSafeImageBridge = installSafeImageAxiosBridge();
  private readonly restoreRuntimePolicy: () => void;

  constructor(scraperService: ScraperService) {
    this.restoreRuntimePolicy = installScraperRuntimePolicy(scraperService);
  }

  onModuleDestroy(): void {
    this.restoreRuntimePolicy();
    this.restoreSafeImageBridge();
  }
}
''',
)
