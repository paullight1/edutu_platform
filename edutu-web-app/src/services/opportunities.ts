import type {
  Opportunity,
  OpportunityDifficulty,
  OpportunitySource,
} from "../types/opportunity";
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
import { productApiRequest, isProductApiUnavailableError } from "./productApi";
import { toMatchReasons } from "./serverMatchStore";
import type { MatchReason } from "./personalizedRecommendations";

let cachedOpportunities: Opportunity[] | null = null;
let cachedOpportunitiesAt = 0;
let revalidatePromise: Promise<void> | null = null;

const SNAPSHOT_STORAGE_KEY = "edutu:opportunities:snapshot:v1";
const SNAPSHOT_FRESH_MS = 10 * 60 * 1000;

type OpportunitiesListener = (opportunities: Opportunity[]) => void;
const opportunityListeners = new Set<OpportunitiesListener>();

/**
 * Subscribe to cache updates so hooks can reflect background revalidations
 * (stale-while-revalidate) without refetching themselves.
 */
export function subscribeToOpportunities(
  listener: OpportunitiesListener,
): () => void {
  opportunityListeners.add(listener);
  return () => {
    opportunityListeners.delete(listener);
  };
}

function notifyOpportunityListeners(rows: Opportunity[]) {
  opportunityListeners.forEach((listener) => {
    try {
      listener(rows);
    } catch {
      // A broken listener must not take down the cache pipeline.
    }
  });
}

function persistSnapshot(rows: Opportunity[], savedAt = Date.now()) {
  try {
    window.localStorage.setItem(
      SNAPSHOT_STORAGE_KEY,
      JSON.stringify({ savedAt, rows }),
    );
  } catch {
    // Storage may be full or unavailable (private mode) — cache is optional.
  }
}

function readSnapshot(): { savedAt: number; rows: Opportunity[] } | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.savedAt !== "number" ||
      !Array.isArray(parsed.rows) ||
      parsed.rows.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function setOpportunityCache(rows: Opportunity[], persistedAt = Date.now()) {
  cachedOpportunities = rows;
  cachedOpportunitiesAt = persistedAt;
  persistSnapshot(rows);
  notifyOpportunityListeners(rows);
}

/**
 * Synchronously return the best known opportunity list (memory first, then the
 * localStorage snapshot). Lets screens paint instantly while fresh data loads.
 */
export function getCachedOpportunitiesSync(): Opportunity[] | null {
  if (cachedOpportunities) {
    return cachedOpportunities;
  }

  const snapshot = readSnapshot();
  if (snapshot) {
    cachedOpportunities = snapshot.rows;
    cachedOpportunitiesAt = snapshot.savedAt;
    return snapshot.rows;
  }

  return null;
}

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
  /** Structured reasons from the server engine (kind/label/points). */
  matchReasonDetails?: MatchReason[];
  matchRisks: string[];
  aiSummary: string | null;
  aiTags: string[];
}

type BackendOpportunityRow = Record<string, unknown>;

// The backend row is untrusted JSON, so these narrow a field to the type the
// Opportunity contract promises instead of trusting whatever arrived. JSON
// only carries strings/numbers/booleans/null, so a value of the wrong type
// here means the field was absent or malformed — treat it as missing.
function pickOptionalString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function pickNullableString(...values: unknown[]): string | null {
  return pickOptionalString(...values) ?? null;
}

function pickOptionalBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function pickOptionalNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

// Application fee is persisted as `metadata.application_fee` (snake_case). We
// only ever surface what the data explicitly says: `is_free` when it is a real
// boolean, `amount` when it is a real number. Anything else stays null so the UI
// renders nothing rather than guessing that an opportunity is free (or not).
function pickApplicationFee(
  value: unknown,
): Opportunity["applicationFee"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const fee = value as Record<string, unknown>;
  const isFree = typeof fee.is_free === "boolean" ? fee.is_free : null;
  const amount =
    typeof fee.amount === "number" && Number.isFinite(fee.amount)
      ? fee.amount
      : null;
  const currency =
    typeof fee.currency === "string" && fee.currency.trim()
      ? fee.currency.trim()
      : null;
  if (isFree === null && amount === null) {
    return null;
  }
  return { isFree, amount, currency };
}

function pickRecord(...values: unknown[]): Record<string, unknown> | undefined {
  for (const value of values) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}

function isOpportunitySource(value: unknown): value is OpportunitySource {
  return (
    value === "admin" || value === "n8n" || value === "manual" || value === "import"
  );
}

function normaliseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Reason lists may arrive as plain strings or {kind,label,points} objects —
 * always reduce to display labels so nothing renders "[object Object]".
 */
function coerceReasonLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const label = (item as { label?: unknown }).label;
        if (typeof label === "string") return label.trim();
      }
      return "";
    })
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
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(
      (part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`,
    )
    .join(" ");
}

function pickCategory(
  row: BackendOpportunityRow,
  metadata: Record<string, unknown>,
): string {
  // Returns "" when no real category exists so the UI can omit the chip
  // instead of rendering a generic "General" label. Generic values like
  // "general"/"other" are treated as unknown and replaced by the canonical
  // classification when one exists.
  const rawCategory = pickStringValue(
    "",
    row.category,
    row.canonical_category,
    metadata.canonical_category,
  );

  if (/^(general|other)$/i.test(rawCategory)) {
    const canonical = pickStringValue(
      "",
      row.canonical_category,
      metadata.canonical_category,
    );
    return /^(general|other)$/i.test(canonical)
      ? ""
      : formatCategoryLabel(canonical);
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
  ) as Record<string, unknown>;
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
  // Never fabricate data: when a field is missing we return an empty string
  // and let the UI omit it, rather than rendering generic filler text.
  //
  // NOTE: an org that merely repeats the title is NOT stripped here. It stays
  // on the model because JSON-LD needs it (`hiringOrganization` / `provider`
  // fall back to "Edutu", which would be a false claim). Whether it is worth
  // *showing* beside a title is a view decision — see lib/organizationLabel.
  const organization = pickPublicStringValue(
    "",
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
  const description = pickLongestStringValue(
    "",
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
  const primaryImage = pickNullableString(
    row.image,
    row.image_url,
    row.cover_image,
    row.imageUrl,
    metadata.image,
    metadata.image_url,
    metadata.source_image_url,
    row.source_image_url,
  );
  const shareCard = pickRecord(metadata.share_card, metadata.shareCard);
  const stableImage = pickNullableString(
    row.share_image_url,
    row.shareImageUrl,
    shareCard?.url,
  );

  return {
    id: String(
      row.id ?? row.opportunity_id ?? row.external_id ?? crypto.randomUUID(),
    ),
    title,
    organization,
    category,
    deadline: pickNullableString(
      row.close_date,
      row.deadline,
      row.application_deadline,
    ),
    location: pickStringValue("", row.location, row.target_region),
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
    image: primaryImage ?? stableImage,
    imageFallback: primaryImage ? stableImage : null,
    match: Number.isFinite(Number(rawMatch)) ? Number(rawMatch) : 0,
    difficulty: normaliseDifficulty(rawDifficulty),
    applicants: pickOptionalString(row.applicants, metadata.applicants),
    successRate: pickOptionalString(row.success_rate, metadata.success_rate),
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
      pickOptionalString(row.updated_at, row.updatedAt, row.updated) ??
      new Date().toISOString(),
    source: isOpportunitySource(row.source) ? row.source : undefined,
    externalId: pickOptionalString(row.external_id),
    tags: cleanPublicTags(
      row.tags,
      metadata.public_tags,
      metadata.tags,
      metadata.aiTags,
    ),
    isRemote: pickOptionalBoolean(row.is_remote, row.isRemote),
    featured: pickOptionalBoolean(row.is_featured, row.featured),
    stipend: pickOptionalNumber(row.stipend),
    currency: pickOptionalString(row.currency),
    applicationFee: pickApplicationFee(
      metadata.application_fee ?? metadata.applicationFee,
    ),
    eligibility: pickRecord(row.eligibility, metadata.eligibility),
    openDate: pickNullableString(row.open_date, row.openDate),
    createdAt: pickOptionalString(row.created_at, row.createdAt),
    createdBy: pickOptionalString(row.created_by, row.createdBy),
    viewCount: pickOptionalNumber(row.view_count, row.viewCount),
    applyCount: pickOptionalNumber(row.apply_count, row.applyCount),
    bookmarkCount: pickOptionalNumber(row.bookmark_count, row.bookmarkCount),
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

// The backend public feed caps each page (PUBLIC_FEED_PAGE_SIZE = 60) and caps
// offset depth (PUBLIC_FEED_MAX_OFFSET = 480) as an anti-harvest measure. A
// single request therefore never returns more than 60 rows, so to browse the
// full active catalog we pull the pages until a short/empty page or the cap.
// Must match the backend's page size — a page shorter than this marks the end
// of the catalog and stops the pagination walk.
const PUBLIC_FEED_PAGE_SIZE = 60;
const PUBLIC_FEED_MAX_OFFSET = 2040;
// How many pages to request per parallel batch during the catalog walk. Keeps
// cold loads fast without firing 30+ concurrent requests when the catalog is
// small — each batch stops the walk as soon as it sees a short/empty page.
const PUBLIC_FEED_WALK_BATCH = 8;

async function requestOpportunityPage(
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

async function requestOpportunityList(
  options: FetchOptions = {},
): Promise<Opportunity[]> {
  // Callers that ask for an explicit single page (limit/offset) get exactly
  // that page. The default browse feed pulls every page so the UI shows the
  // whole active catalog instead of just the first capped page.
  if (
    (typeof options.limit === "number" && options.limit > 0) ||
    (typeof options.offset === "number" && options.offset > 0)
  ) {
    return requestOpportunityPage(options);
  }

  const aggregated: Opportunity[] = [];
  const seen = new Set<string>();

  const pushPage = (page: Opportunity[]) => {
    for (const opportunity of page) {
      const key = String(opportunity.id ?? "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      aggregated.push(opportunity);
    }
  };

  // Fetch the first page up front: it both establishes the catalog exists and
  // tells us whether there's more to pull. Failing here fails the whole feed.
  const firstPage = await requestOpportunityPage({ ...options, offset: 0 });
  pushPage(firstPage);

  // A short first page means the catalog fits in one request — no walk needed.
  if (firstPage.length >= PUBLIC_FEED_PAGE_SIZE) {
    // Pull the rest in parallel batches: each batch collapses several
    // round-trips (the cold-start win) while a short/empty page inside a
    // batch ends the walk, so a small catalog never fans out to 30+ requests.
    let offset = PUBLIC_FEED_PAGE_SIZE;
    walk: while (offset <= PUBLIC_FEED_MAX_OFFSET) {
      const offsets: number[] = [];
      for (
        let i = 0;
        i < PUBLIC_FEED_WALK_BATCH && offset <= PUBLIC_FEED_MAX_OFFSET;
        i++, offset += PUBLIC_FEED_PAGE_SIZE
      ) {
        offsets.push(offset);
      }

      const results = await Promise.allSettled(
        offsets.map((pageOffset) =>
          requestOpportunityPage({ ...options, offset: pageOffset }),
        ),
      );

      // Aggregate in offset order and stop at the first short/empty page —
      // that marks the end of the catalog; anything past it is padding.
      for (const result of results) {
        if (result.status === "rejected") {
          // Keep the rows we already have rather than failing the whole feed.
          console.warn("Opportunity page fetch failed:", result.reason);
          break walk;
        }
        pushPage(result.value);
        if (result.value.length < PUBLIC_FEED_PAGE_SIZE) break walk;
      }
    }
  }

  return aggregated;
}

function revalidateOpportunitiesInBackground(options: FetchOptions) {
  if (revalidatePromise) {
    return;
  }

  revalidatePromise = (async () => {
    try {
      const { signal: _signal, ...rest } = options;
      const rows = await requestOpportunityList(rest);
      if (rows.length > 0) {
        setOpportunityCache(rows);
      }
    } catch (error) {
      console.warn("Background opportunity refresh failed:", error);
    } finally {
      revalidatePromise = null;
    }
  })();
}

export async function fetchOpportunities(
  options: FetchOptions = {},
): Promise<Opportunity[]> {
  const { force } = options;

  if (!force) {
    const cached = getCachedOpportunitiesSync();
    if (cached) {
      // Stale-while-revalidate: serve instantly, refresh quietly when stale.
      if (Date.now() - cachedOpportunitiesAt > SNAPSHOT_FRESH_MS) {
        revalidateOpportunitiesInBackground(options);
      }
      return cached;
    }
  }

  try {
    const normalised = await requestOpportunityList(options);
    const resolvedOpportunities =
      normalised.length > 0
        ? normalised
        : await requestStaticOpportunitySnapshot(options);
    if (resolvedOpportunities.length > 0) {
      setOpportunityCache(resolvedOpportunities);
    }

    // An empty response is not proof that the catalog is empty. A transient
    // database/API read must never erase a known-good feed or turn it into a
    // sticky in-memory empty cache. Keep the last usable catalog and let the
    // next refresh try the source again.
    if (resolvedOpportunities.length === 0) {
      const staleCache = getCachedOpportunitiesSync();
      if (staleCache && staleCache.length > 0) {
        console.warn("Empty opportunity response; keeping the last known catalog");
        return staleCache;
      }
    }

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
      if (snapshotOpportunities.length > 0) {
        setOpportunityCache(snapshotOpportunities);
        return snapshotOpportunities;
      }
    } catch (snapshotError) {
      console.error(
        "Error loading static opportunity snapshot:",
        snapshotError,
      );
    }

    // Last resort: any stale local snapshot beats a blank feed.
    const staleCache = getCachedOpportunitiesSync();
    if (staleCache) {
      return staleCache;
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
    const rowMetadata = pickRecord(row.metadata) ?? {};
    const rawMatch =
      row.match ??
      row.match_score ??
      row.matchScore ??
      rowMetadata.match_score ??
      rowMetadata.matchScore ??
      0;
    const matchScore = Number.isFinite(Number(rawMatch)) ? Number(rawMatch) : 0;
    const opportunity = normaliseOpportunity({
      ...row,
      match: matchScore,
    });

    return {
      opportunity,
      matchScore: opportunity.match,
      matchReasons: coerceReasonLabels(row.match_reasons ?? row.matchReasons),
      matchReasonDetails: toMatchReasons(row),
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

export interface OpportunityMatchScore {
  id: string;
  matchScore: number;
  matchReasons: string[];
  matchReasonDetails: MatchReason[];
  matchRisks: string[];
}

const MATCH_SCORES_CHUNK_SIZE = 50;

/**
 * Fetch server-computed match scores for arbitrary opportunity ids
 * (POST /opportunities/match-scores, Clerk-authed). Requests are chunked to
 * the API's 50-id limit and flattened. When the route is missing (older
 * deploys) this degrades silently to whatever was already collected.
 */
export async function fetchOpportunityMatchScores(
  token: string,
  ids: string[],
): Promise<OpportunityMatchScore[]> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const results: OpportunityMatchScore[] = [];

  for (let index = 0; index < uniqueIds.length; index += MATCH_SCORES_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + MATCH_SCORES_CHUNK_SIZE);

    let payload: unknown;
    try {
      payload = await productApiRequest<unknown>(
        "/opportunities/match-scores",
        token,
        {
          method: "POST",
          body: JSON.stringify({ opportunityIds: chunk }),
        },
      );
    } catch (error) {
      if (isProductApiUnavailableError(error)) {
        // Endpoint not deployed yet — badges fall back to local scoring.
        return results;
      }
      throw error;
    }

    const rawScores =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).scores
        : null;
    const scores = Array.isArray(rawScores)
      ? (rawScores as BackendOpportunityRow[])
      : [];

    for (const row of scores) {
      if (!row || row.id === undefined || row.id === null) continue;
      const rawScore = row.match_score ?? row.matchScore ?? row.match ?? 0;
      results.push({
        id: String(row.id),
        matchScore: Number.isFinite(Number(rawScore)) ? Number(rawScore) : 0,
        matchReasons: coerceReasonLabels(row.match_reasons ?? row.matchReasons),
        matchReasonDetails: toMatchReasons(row),
        matchRisks: normaliseStringArray(row.match_risks ?? row.matchRisks),
      });
    }
  }

  return results;
}

/**
 * Synchronous cache lookup for a single opportunity (memory or local
 * snapshot). Used to render detail pages instantly on in-app navigation.
 */
export function getCachedOpportunitySync(id: string): Opportunity | null {
  const cached = getCachedOpportunitiesSync();
  return cached?.find((opportunity) => opportunity.id === id) ?? null;
}

export async function getOpportunity(id: string): Promise<Opportunity | null> {
  const cached = getCachedOpportunitySync(id);
  if (cached) {
    return cached;
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
  const existing = getCachedOpportunitiesSync();
  const merged = existing
    ? existing.some((item) => item.id === opportunity.id)
      ? existing.map((item) =>
          item.id === opportunity.id ? opportunity : item,
        )
      : [opportunity, ...existing]
    : [opportunity];
  // Merge without refreshing the list timestamp — one row isn't a full sync.
  cachedOpportunities = merged;
  persistSnapshot(merged, cachedOpportunitiesAt || Date.now());
  notifyOpportunityListeners(merged);

  return opportunity;
}

export function clearOpportunitiesCache() {
  cachedOpportunities = null;
  cachedOpportunitiesAt = 0;
  try {
    window.localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
  } catch {
    // Storage unavailable — in-memory cache is already cleared.
  }
}
