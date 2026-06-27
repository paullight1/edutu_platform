import type { Opportunity, OpportunityDifficulty } from "../types/opportunity";
import {
  differenceInCalendarDays,
  endOfDay,
  isBefore,
  isValid,
  parseISO,
} from "date-fns";
import { getApiBaseUrl } from "../lib/apiBaseUrl";
import { normalizeExternalUrl } from "../lib/externalUrl";
import { syncOpportunityInventorySnapshot } from "./analyticsAggregator";
import { updateOpportunitiesInN8n } from "./n8nIntegration";
import { productApiRequest } from "./productApi";

let cachedOpportunities: Opportunity[] | null = null;
const SOURCE_BRAND_RE =
  /\b(?:dixcoverhubx|dixcover\s*hubx|opportunities\s*circle|oya\s*opportunities|scholars4dev|global\s*scholar\s*desk|scholarship\s*portal|jobs\.smartyacad\.com)\b/i;
const SCRAPER_ARTIFACT_RE =
  /\b(?:by\s+admin|posted\s+by|written\s+by|read\s+more|continue\s+reading|leave\s+a\s+comment|comments?|share\s+this|related\s+posts?)\b/i;
const PUBLIC_TAG_BLOCKLIST = new Set([
  "scraped",
  "scraper",
  "imported",
  "automation",
  "source",
]);

export const fallbackOpportunities: Opportunity[] = [];

export function getFallbackOpportunities(): Opportunity[] {
  return fallbackOpportunities;
}

export function parseOpportunityDeadline(
  deadline?: string | null,
): Date | null {
  if (!deadline) {
    return null;
  }

  const isoParsed = parseISO(deadline);
  if (isValid(isoParsed)) {
    return isoParsed;
  }

  const fallbackParsed = new Date(deadline);
  return isValid(fallbackParsed) ? fallbackParsed : null;
}

export function getOpportunityDaysLeft(
  deadline?: string | null,
  now: Date = new Date(),
): number | null {
  const parsed = parseOpportunityDeadline(deadline);
  if (!parsed) {
    return null;
  }

  const daysLeft = differenceInCalendarDays(parsed, now);
  return daysLeft >= 0 ? daysLeft : null;
}

export function isOpportunityExpired(
  opportunity: Pick<Opportunity, "deadline">,
  now: Date = new Date(),
): boolean {
  const { deadline } = opportunity;
  if (!deadline) {
    return false;
  }

  const parsed = parseISO(deadline);
  if (!isValid(parsed)) {
    return false;
  }

  return isBefore(endOfDay(parsed), now);
}

interface FetchOptions {
  signal?: AbortSignal;
  force?: boolean;
  userId?: string;
  limit?: number;
  offset?: number;
  status?: string;
  category?: string;
}

export interface FetchOpportunityRecommendationsOptions {
  limit?: number;
  minMatchScore?: number;
  excludeOpportunityIds?: string[];
  message?: string;
}

export interface PersonalizedOpportunity {
  opportunity: Opportunity;
  matchScore: number;
  matchReasons: string[];
  matchRisks: string[];
  aiSummary: string | null;
  aiTags: string[];
}

type BackendOpportunityRow = Record<string, any>;

function normaliseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickStringValue(fallback: string, ...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const trimmed = value.replace(/\s+/g, " ").trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return fallback;
}

function pickOpportunityUrl(...values: unknown[]): string | undefined {
  for (const value of values) {
    const url = normalizeExternalUrl(value);
    if (url) {
      return url;
    }
  }

  return undefined;
}

function cleanOpportunityText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\s+/g, " ")
    .replace(/\bBy\s+Admin\s+On\s+[A-Z][a-z]+\s+\d{1,2},\s+20\d{2}\b/g, " ")
    .replace(/\bBy\s+Admin\b/gi, " ")
    .replace(/\b(?:posted|written)\s+by\s+[^.]{1,60}/gi, " ")
    .replace(SOURCE_BRAND_RE, "the official organizer")
    .replace(SCRAPER_ARTIFACT_RE, " ")
    .replace(/\s*(?:\[\s*(?:\.{3}|…)\s*\]|\(\s*(?:\.{3}|…)\s*\))/gu, "")
    .replace(/\s*(?:\.{3}|…)\s*$/u, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isSourceArtifact(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return SOURCE_BRAND_RE.test(value) || SCRAPER_ARTIFACT_RE.test(value);
}

function pickPublicStringValue(fallback: string, ...values: unknown[]): string {
  for (const value of values) {
    const cleaned = cleanOpportunityText(value);
    if (cleaned && !isSourceArtifact(value)) {
      return cleaned;
    }
  }

  return fallback;
}

function cleanPublicTags(...values: unknown[]): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) => normaliseStringArray(value))
        .filter((tag) => !isSourceArtifact(tag))
        .map(cleanOpportunityText)
        .filter((tag) => tag && !PUBLIC_TAG_BLOCKLIST.has(tag.toLowerCase())),
    ),
  ).slice(0, 8);
}

function cleanPublicStringArray(...values: unknown[]): string[] {
  for (const value of values) {
    const normalised = normaliseStringArray(value)
      .filter((item) => !isSourceArtifact(item))
      .map(cleanOpportunityText)
      .filter(Boolean);
    if (normalised.length > 0) {
      return Array.from(new Set(normalised));
    }
  }

  return [];
}

function pickLongestStringValue(
  fallback: string,
  ...values: unknown[]
): string {
  const candidates = values
    .map(cleanOpportunityText)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  return candidates[0] || fallback;
}

function formatCategoryLabel(value: string): string {
  return (
    value
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map(
        (part) =>
          `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`,
      )
      .join(" ") || "General"
  );
}

function pickCategory(
  row: BackendOpportunityRow,
  metadata: Record<string, any>,
): string {
  const rawCategory = pickStringValue(
    "General",
    row.category,
    row.canonical_category,
    metadata.canonical_category,
  );

  if (rawCategory.toLowerCase() === "general") {
    return formatCategoryLabel(
      pickStringValue(
        rawCategory,
        row.canonical_category,
        metadata.canonical_category,
      ),
    );
  }

  return formatCategoryLabel(rawCategory);
}

function normaliseDifficulty(value: unknown): OpportunityDifficulty {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "easy" || raw === "beginner") {
    return "Easy";
  }
  if (raw === "hard" || raw === "advanced") {
    return "Hard";
  }
  return "Medium";
}

function extractOpportunityRows(payload: unknown): BackendOpportunityRow[] {
  if (Array.isArray(payload)) {
    return payload as BackendOpportunityRow[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const source = payload as Record<string, unknown>;
  const data =
    source.data ?? source.opportunities ?? source.items ?? source.results;

  if (Array.isArray(data)) {
    return data as BackendOpportunityRow[];
  }

  return [];
}

function normaliseOpportunity(row: BackendOpportunityRow): Opportunity {
  const metadata = (
    row.metadata && typeof row.metadata === "object" ? row.metadata : {}
  ) as Record<string, any>;
  const rawDifficulty =
    row.difficulty ??
    metadata.difficulty ??
    metadata.difficulty_level ??
    metadata.level;
  const rawMatch =
    row.match ??
    metadata.match_score ??
    metadata.matchScore ??
    row.quality_score ??
    row.qualityScore ??
    0;
  const title = pickStringValue("Untitled opportunity", row.title, row.name);
  const organization = pickPublicStringValue(
    "Program Organizer",
    metadata.public_organization,
    row.organization,
    row.provider,
  );
  const category = pickCategory(row, metadata);
  const summary = pickStringValue(
    "",
    row.refined_summary,
    row.summary,
    metadata.summary,
  );
  const fallbackDescription = `${title} from ${organization}. Review ${category.toLowerCase()} details, deadline, benefits, and the application link on Edutu.`;
  const description = pickLongestStringValue(
    fallbackDescription,
    metadata.full_description,
    metadata.fullDescription,
    metadata.long_description,
    metadata.longDescription,
    metadata.description,
    "",
    row.description,
    row.refined_summary,
    row.summary,
    metadata.summary,
  );

  return {
    id: String(
      row.id ?? row.opportunity_id ?? row.external_id ?? crypto.randomUUID(),
    ),
    title,
    organization,
    category,
    deadline:
      row.close_date ?? row.deadline ?? row.application_deadline ?? null,
    location: pickStringValue(
      row.is_remote ? "Remote" : "Worldwide",
      row.location,
      row.target_region,
      row.is_remote ? "Remote" : "",
    ),
    summary,
    description,
    requirements: cleanPublicStringArray(
      row.requirements,
      metadata.requirements,
      metadata.eligibility,
    ),
    benefits: cleanPublicStringArray(row.benefits, metadata.benefits),
    applicationProcess: cleanPublicStringArray(
      row.application_process,
      metadata.application_process,
      metadata.applicationProcess,
    ),
    image:
      row.image ??
      row.image_url ??
      row.cover_image ??
      row.imageUrl ??
      metadata.image ??
      metadata.image_url ??
      null,
    match: Number.isFinite(Number(rawMatch)) ? Number(rawMatch) : 0,
    difficulty: normaliseDifficulty(rawDifficulty),
    applicants: row.applicants ?? metadata.applicants,
    successRate: row.success_rate ?? metadata.success_rate,
    applyUrl: pickOpportunityUrl(
      row.application_url,
      row.applicationUrl,
      row.applyUrl,
      row.apply_url,
      row.link,
      row.canonical_url,
      row.canonicalUrl,
      row.url,
      metadata.application_url,
      metadata.applicationUrl,
      metadata.applyUrl,
      metadata.apply_url,
      metadata.link,
      metadata.canonical_url,
      metadata.canonicalUrl,
      metadata.url,
    ),
    lastUpdated:
      row.updated_at ??
      row.updatedAt ??
      row.updated ??
      new Date().toISOString(),
    source: row.source,
    externalId: row.external_id,
    tags: cleanPublicTags(
      row.tags,
      metadata.public_tags,
      metadata.tags,
      metadata.aiTags,
    ),
    isRemote: row.is_remote ?? row.isRemote,
    featured: row.is_featured ?? row.featured,
    stipend: row.stipend,
    currency: row.currency,
    eligibility: row.eligibility ?? metadata.eligibility,
    openDate: row.open_date ?? row.openDate ?? null,
    createdAt: row.created_at ?? row.createdAt,
    createdBy: row.created_by ?? row.createdBy,
    viewCount: row.view_count ?? row.viewCount,
    applyCount: row.apply_count ?? row.applyCount,
    bookmarkCount: row.bookmark_count ?? row.bookmarkCount,
  };
}

function buildBackendUrl(path: string, params?: URLSearchParams): string {
  const apiBaseUrl = getApiBaseUrl("Opportunities API");
  const query = params && params.toString() ? `?${params.toString()}` : "";
  return `${apiBaseUrl}${path}${query}`;
}

async function requestStaticOpportunitySnapshot(
  options: FetchOptions = {},
): Promise<Opportunity[]> {
  const response = await fetch("/data/opportunities.json", {
    method: "GET",
    signal: options.signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Opportunity snapshot request failed with ${response.status}`,
    );
  }

  const payload = await response.json().catch(() => null);
  const rows = extractOpportunityRows(payload);

  return rows.map(normaliseOpportunity);
}

async function requestOpportunityList(
  options: FetchOptions = {},
): Promise<Opportunity[]> {
  const params = new URLSearchParams();
  params.set(
    "limit",
    String(Math.min(Math.max(Number(options.limit) || 100, 1), 100)),
  );

  if (
    typeof options.offset === "number" &&
    Number.isFinite(options.offset) &&
    options.offset > 0
  ) {
    params.set("offset", String(Math.floor(options.offset)));
  }

  params.set("status", options.status || "active");

  if (options.category) {
    params.set("category", options.category);
  }

  const response = await fetch(buildBackendUrl("/opportunities", params), {
    method: "GET",
    signal: options.signal,
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const message = `Opportunity API request failed with ${response.status}`;
    throw new Error(message);
  }

  const payload = await response.json().catch(() => null);
  const rows = extractOpportunityRows(payload);

  return rows.map(normaliseOpportunity);
}

export async function fetchOpportunities(
  options: FetchOptions = {},
): Promise<Opportunity[]> {
  const { force } = options;

  if (!force && cachedOpportunities) {
    return cachedOpportunities;
  }

  try {
    const normalised = await requestOpportunityList(options);
    const resolvedOpportunities =
      normalised.length > 0
        ? normalised
        : await requestStaticOpportunitySnapshot(options);
    cachedOpportunities = resolvedOpportunities;

    if (resolvedOpportunities.length > 0) {
      void (async () => {
        try {
          await syncOpportunityInventorySnapshot(resolvedOpportunities);
          if (options.userId) {
            await updateOpportunitiesInN8n(
              resolvedOpportunities,
              options.userId,
            );
          }
        } catch (err) {
          console.error(
            "Failed to sync opportunity analytics or update n8n:",
            err,
          );
        }
      })();
    }

    return resolvedOpportunities;
  } catch (error) {
    console.error("Error fetching opportunities from backend:", error);

    try {
      const snapshotOpportunities =
        await requestStaticOpportunitySnapshot(options);
      cachedOpportunities = snapshotOpportunities;
      return snapshotOpportunities;
    } catch (snapshotError) {
      console.error(
        "Error loading static opportunity snapshot:",
        snapshotError,
      );
    }

    if (cachedOpportunities) {
      return cachedOpportunities;
    }

    throw error;
  }
}

export async function fetchOpportunityRecommendations(
  token: string,
  options: FetchOpportunityRecommendationsOptions = {},
): Promise<PersonalizedOpportunity[]> {
  const body: Record<string, unknown> = {
    limit: Math.min(Math.max(Number(options.limit) || 24, 1), 50),
    minMatchScore: Math.min(
      Math.max(Number(options.minMatchScore) || 0, 0),
      100,
    ),
  };

  if (options.message) {
    body.message = options.message;
  }

  if (options.excludeOpportunityIds?.length) {
    body.excludeOpportunityIds = options.excludeOpportunityIds;
  }

  const payload = await productApiRequest<unknown>(
    "/opportunities/recommendations",
    token,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
  const rows = extractOpportunityRows(payload);

  return rows.map((row) => {
    const rawMatch =
      row.match ??
      row.match_score ??
      row.matchScore ??
      row.metadata?.match_score ??
      row.metadata?.matchScore ??
      0;
    const matchScore = Number.isFinite(Number(rawMatch)) ? Number(rawMatch) : 0;
    const opportunity = normaliseOpportunity({
      ...row,
      match: matchScore,
    });

    return {
      opportunity,
      matchScore: opportunity.match,
      matchReasons: normaliseStringArray(row.match_reasons ?? row.matchReasons),
      matchRisks: normaliseStringArray(row.match_risks ?? row.matchRisks),
      aiSummary:
        typeof row.ai_summary === "string"
          ? row.ai_summary
          : typeof row.aiSummary === "string"
            ? row.aiSummary
            : null,
      aiTags: cleanPublicTags(row.ai_tags, row.aiTags),
    };
  });
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  if (cachedOpportunities) {
    const cached = cachedOpportunities.find(
      (opportunity) => opportunity.id === id,
    );
    if (cached) {
      return cached;
    }
  }

  let response: Response;
  try {
    response = await fetch(
      buildBackendUrl(`/opportunities/${encodeURIComponent(id)}`),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    );
  } catch (networkError) {
    console.error("Network error fetching opportunity:", networkError);
    throw networkError;
  }

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Opportunity request failed with ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  const row =
    extractOpportunityRows(payload)[0] ??
    (Array.isArray(payload) ? payload[0] : payload);
  if (!row || typeof row !== "object") {
    return null;
  }

  const opportunity = normaliseOpportunity(row as BackendOpportunityRow);
  cachedOpportunities = cachedOpportunities
    ? cachedOpportunities.map((item) =>
        item.id === opportunity.id ? opportunity : item,
      )
    : [opportunity];

  return opportunity;
}

export function clearOpportunitiesCache() {
  cachedOpportunities = null;
}
