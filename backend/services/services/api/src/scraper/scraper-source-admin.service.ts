import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isIP } from "node:net";
import { isGlobalUnicastAddress } from "./scraper-egress.service";

export type ScraperSourceConfig = {
  item_selector?: string;
  title_selector?: string;
  link_selector?: string;
  next_page_selector?: string;
  content_selectors?: string[];
  [key: string]: unknown;
};

export type ScraperSourceCreateInput = {
  name: string;
  url?: string;
  description?: string | null;
  category?: string;
  tier?: number;
  priority?: number;
  enabled?: boolean;
  parent_id?: number | null;
  is_group?: boolean;
  config?: ScraperSourceConfig;
  rate_limit_requests?: number;
  rate_limit_delay_ms?: number;
  max_concurrent?: number;
  timeout_ms?: number;
};

export type ScraperSourcePatchInput = Partial<ScraperSourceCreateInput>;

type MutationResult<T = unknown> = {
  success: boolean;
  data?: T;
  duplicate?: boolean;
  error?: string;
};

const SOURCE_NAME_MAX_CHARS = 160;
const SOURCE_DESCRIPTION_MAX_CHARS = 500;
const SOURCE_CATEGORY_MAX_CHARS = 80;
const SOURCE_URL_MAX_CHARS = 2048;
const SELECTOR_MAX_CHARS = 1000;
const MAX_CONTENT_SELECTORS = 12;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
]);

function cleanText(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxChars) : undefined;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function boundedInteger(
  value: unknown,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer between ${min} and ${max}`);
  }
  return parsed;
}

function safeSourceUrl(raw: string): string {
  const cleaned = raw.trim();
  if (!cleaned || cleaned.length > SOURCE_URL_MAX_CHARS) {
    throw new Error("Source URL is invalid");
  }

  let parsed: URL;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new Error("Source URL is invalid");
  }

  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !parsed.hostname
  ) {
    throw new Error("Source URL must be a public HTTP(S) URL");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Source URL must use a public hostname");
  }

  if (isIP(hostname) > 0 && !isGlobalUnicastAddress(hostname)) {
    throw new Error("Source URL must resolve to a public address");
  }

  parsed.hash = "";
  return parsed.toString();
}

function sanitizeSelector(value: unknown): string | undefined {
  return cleanText(value, SELECTOR_MAX_CHARS);
}

function sanitizeConfig(
  config: ScraperSourceConfig | undefined,
): ScraperSourceConfig | undefined {
  if (config === undefined) return undefined;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("Source config must be an object");
  }

  const sanitized: ScraperSourceConfig = {};
  const stringKeys = [
    "item_selector",
    "title_selector",
    "link_selector",
    "next_page_selector",
  ] as const;
  for (const key of stringKeys) {
    const value = sanitizeSelector(config[key]);
    if (value !== undefined) sanitized[key] = value;
  }

  if (config.content_selectors !== undefined) {
    if (!Array.isArray(config.content_selectors)) {
      throw new Error("content_selectors must be an array");
    }
    sanitized.content_selectors = config.content_selectors
      .slice(0, MAX_CONTENT_SELECTORS)
      .map((selector) => sanitizeSelector(selector))
      .filter((selector): selector is string => Boolean(selector));
  }

  // Keep source-specific non-selector settings forward-compatible, but reject
  // values that cannot safely round-trip through JSONB.
  for (const [key, value] of Object.entries(config)) {
    if (key in sanitized || stringKeys.includes(key as (typeof stringKeys)[number])) {
      continue;
    }
    if (key === "content_selectors") continue;
    if (typeof value === "function" || typeof value === "symbol") {
      throw new Error(`Unsupported source config value for ${key}`);
    }
    sanitized[key] = value;
  }

  const encoded = JSON.stringify(sanitized);
  if (encoded.length > 16_000) {
    throw new Error("Source config is too large");
  }
  return sanitized;
}

function normalizeCreateInput(input: ScraperSourceCreateInput) {
  const name = cleanText(input.name, SOURCE_NAME_MAX_CHARS);
  if (!name) throw new Error("Source name is required");

  const isGroup = Boolean(input.is_group);
  const sourceUrl = isGroup
    ? `group://${slug(name) || "source-group"}`
    : safeSourceUrl(input.url ?? "");

  return {
    name,
    url: sourceUrl,
    ...(cleanText(input.description, SOURCE_DESCRIPTION_MAX_CHARS) && {
      description: cleanText(input.description, SOURCE_DESCRIPTION_MAX_CHARS),
    }),
    category:
      cleanText(input.category, SOURCE_CATEGORY_MAX_CHARS) ?? "scholarship",
    tier: boundedInteger(input.tier ?? 2, 1, 3),
    priority: boundedInteger(input.priority ?? 100, 1, 10_000),
    enabled: input.enabled ?? true,
    parent_id: input.parent_id ?? null,
    is_group: isGroup,
    ...(sanitizeConfig(input.config) !== undefined && {
      config: sanitizeConfig(input.config),
    }),
    ...(input.rate_limit_requests !== undefined && {
      rate_limit_requests: boundedInteger(input.rate_limit_requests, 1, 10_000),
    }),
    ...(input.rate_limit_delay_ms !== undefined && {
      rate_limit_delay_ms: boundedInteger(input.rate_limit_delay_ms, 0, 300_000),
    }),
    ...(input.max_concurrent !== undefined && {
      max_concurrent: boundedInteger(input.max_concurrent, 1, 100),
    }),
    ...(input.timeout_ms !== undefined && {
      timeout_ms: boundedInteger(input.timeout_ms, 1_000, 120_000),
    }),
  };
}

function normalizePatchInput(input: ScraperSourcePatchInput) {
  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = cleanText(input.name, SOURCE_NAME_MAX_CHARS);
    if (!name) throw new Error("Source name is required");
    patch.name = name;
  }
  if (input.url !== undefined) patch.url = safeSourceUrl(input.url);
  if (input.description !== undefined) {
    patch.description = cleanText(input.description, SOURCE_DESCRIPTION_MAX_CHARS) ?? null;
  }
  if (input.category !== undefined) {
    const category = cleanText(input.category, SOURCE_CATEGORY_MAX_CHARS);
    if (!category) throw new Error("Source category is required");
    patch.category = category;
  }
  if (input.tier !== undefined) patch.tier = boundedInteger(input.tier, 1, 3);
  if (input.priority !== undefined) {
    patch.priority = boundedInteger(input.priority, 1, 10_000);
  }
  if (input.enabled !== undefined) patch.enabled = Boolean(input.enabled);
  if (input.parent_id !== undefined) patch.parent_id = input.parent_id;
  if (input.is_group !== undefined) patch.is_group = Boolean(input.is_group);
  if (input.config !== undefined) patch.config = sanitizeConfig(input.config);
  if (input.rate_limit_requests !== undefined) {
    patch.rate_limit_requests = boundedInteger(
      input.rate_limit_requests,
      1,
      10_000,
    );
  }
  if (input.rate_limit_delay_ms !== undefined) {
    patch.rate_limit_delay_ms = boundedInteger(
      input.rate_limit_delay_ms,
      0,
      300_000,
    );
  }
  if (input.max_concurrent !== undefined) {
    patch.max_concurrent = boundedInteger(input.max_concurrent, 1, 100);
  }
  if (input.timeout_ms !== undefined) {
    patch.timeout_ms = boundedInteger(input.timeout_ms, 1_000, 120_000);
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No source fields supplied");
  }
  return patch;
}

export class ScraperSourceAdminService {
  constructor(private readonly supabase: SupabaseClient | null) {}

  static fromEnvironment(): ScraperSourceAdminService {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return new ScraperSourceAdminService(
      url && key ? createClient(url, key) : null,
    );
  }

  async getSources() {
    if (!this.supabase) return [];
    const { data, error } = await this.supabase
      .from("scraping_sources")
      .select("*")
      .order("priority");
    if (error) return [];
    return data ?? [];
  }

  async addSource(
    input: ScraperSourceCreateInput,
  ): Promise<MutationResult<Record<string, unknown>>> {
    if (!this.supabase) {
      return { success: false, error: "No database configured" };
    }

    try {
      const row = normalizeCreateInput(input);
      const { data, error } = await this.supabase
        .from("scraping_sources")
        .insert(row)
        .select()
        .single();
      if (error) {
        const duplicate =
          error.code === "23505" || /duplicate key/i.test(error.message);
        return {
          success: false,
          duplicate,
          error: duplicate
            ? row.is_group
              ? `A group named "${row.name}" already exists`
              : "A source with this URL already exists"
            : error.message,
        };
      }
      return { success: true, data: data as Record<string, unknown> };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Invalid source",
      };
    }
  }

  async updateSource(
    id: number,
    input: ScraperSourcePatchInput,
  ): Promise<MutationResult> {
    if (!this.supabase) {
      return { success: false, error: "No database configured" };
    }

    try {
      const patch = normalizePatchInput(input);
      const { error } = await this.supabase
        .from("scraping_sources")
        .update(patch)
        .eq("id", id);
      return { success: !error, error: error?.message };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Invalid source update",
      };
    }
  }

  async deleteSource(id: number): Promise<MutationResult> {
    if (!this.supabase) {
      return { success: false, error: "No database configured" };
    }
    const { error } = await this.supabase
      .from("scraping_sources")
      .delete()
      .eq("id", id);
    return { success: !error, error: error?.message };
  }
}
