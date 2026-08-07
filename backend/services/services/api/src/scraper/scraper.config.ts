import { HttpsProxyAgent } from "https-proxy-agent";

// Fixed key for the scrape advisory lock. Any value works as long as it is
// unique across advisory-lock users in this database.
export const SCRAPE_ADVISORY_LOCK_KEY = 918273645;
export const SCHEDULED_SCRAPE_JOB_NAME = "scheduled-scrape";
export const SCRAPER_CRON_TIMEZONE = process.env.SCRAPER_CRON_TIMEZONE || "UTC";
export const STALE_RUN_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Referer: "https://www.google.com/",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

const scraperProxyUrl = process.env.SCRAPER_PROXY_URL;
const scraperProxyAgent = scraperProxyUrl
  ? new HttpsProxyAgent(scraperProxyUrl)
  : null;

export const HAS_SCRAPER_PROXY = Boolean(scraperProxyAgent);

export const PROXY_AXIOS_CONFIG = scraperProxyAgent
  ? {
      httpAgent: scraperProxyAgent,
      httpsAgent: scraperProxyAgent,
      proxy: false as const,
    }
  : {};

export const SCRAPER_FETCH_RELAY_URL =
  process.env.SCRAPER_FETCH_RELAY_URL ?? "https://r.jina.ai/{url}";
const scraperFetchRelayToken = process.env.SCRAPER_FETCH_RELAY_TOKEN;
export const RELAY_MIN_INTERVAL_MS =
  Number(process.env.SCRAPER_FETCH_RELAY_MIN_INTERVAL_MS) || 3_200;
export const RELAY_TIMEOUT_MS = 45_000;
export const RELAY_HEADERS: Record<string, string> = {
  "X-Return-Format": "html",
  ...(scraperFetchRelayToken
    ? { Authorization: `Bearer ${scraperFetchRelayToken}` }
    : {}),
};

export type FetchRoute = "direct" | "proxy" | "relay";

export const DEFAULT_CONTENT_SELECTORS =
  'article, .entry-content, .post-content, main, [class*="content"], [class*="article"]';
export const DEEP_TEXT_MAX_CHARS = 10_000;
export const DEEP_FETCH_DELAY_MS = 2_000;
export const LIST_PAGE_DELAY_MS = 1_500;
export const MAX_ITEMS_PER_PAGE = 20;
export const MAX_PAGES_CAP = 5;
export const MAX_BACKOFF_ATTEMPTS = 4;
export const ENRICH_CONCURRENCY = 3;
export const DEFAULT_RECHECK_AFTER_DAYS = 3;
export const MIN_DESCRIPTION_CHARS = 240;
export const MIN_PUBLISH_QUALITY_SCORE = 60;

export const CURRENCY_SYMBOLS: Record<string, string> = {
  "€": "EUR",
  "£": "GBP",
  $: "USD",
};

export const MONTH_PATTERN =
  "January|February|March|April|May|June|July|August|September|October|November|December";

export const APPLY_TEXT_RE =
  /\b(apply|application|apply\s+(now|here|online)|register|registration|official\s+(link|website|portal)|programme?\s+portal|submit|start\s+application|get\s+started)\b/i;
export const GENERIC_LINK_TITLE_RE =
  /^(read\s+more|learn\s+more|continue\s+reading|view\s+(details|more)|more|apply(\s+(now|here|online))?|click\s+here|visit\s+site|official\s+link|submit)$/i;
export const ROUNDUP_TITLE_RE =
  /^(top|best)\s+\d+\b|\b(top|best)\s+\d+\s+(scholarships?|grants?|fellowships?|internships?|programs?|programmes?|opportunities?)\b|\b(list|collection|roundup)\s+of\b/i;

export const ALLOWED_OPPORTUNITY_TYPES = new Set([
  "internship",
  "job",
  "course",
  "mentorship",
  "competition",
  "certification",
  "fellowship",
  "scholarship",
  "bootcamp",
]);

export const NON_OPPORTUNITY_URL_RE =
  /\/(category|tag|author|search)(\/|$)|\/(page(\/\d+)?|privacy-policy|terms|about|contact)\/?$/i;
export const NON_APPLY_URL_RE =
  /(facebook|twitter|x\.com|linkedin|instagram|youtube|tiktok|whatsapp|telegram|mailto:|tel:|\/feed\/|\/comments?\/|#respond)/i;
export const SCRAPER_ARTIFACT_RE =
  /\b(?:by\s+admin|posted\s+by|written\s+by|on\s+[a-z]+\s+\d{1,2},\s+20\d{2}|read\s+more|continue\s+reading|leave\s+a\s+comment|comments?|share\s+this|related\s+posts?)\b/i;
export const SOURCE_BRAND_RE =
  /\b(?:dixcoverhubx|dixcover\s*hubx|opportunities\s*circle|oya\s*opportunities|scholars4dev|global\s*scholar\s*desk|scholarship\s*portal|jobs\.smartyacad\.com)\b/i;
export const GENERIC_ORGANIZER_RE =
  /^(?:the\s+)?(?:official\s+)?(?:program|programme)?\s*organi[sz]er$/i;
export const PUBLIC_TAG_BLOCKLIST = new Set([
  "scraped",
  "scraper",
  "imported",
  "automation",
  "source",
]);

const CATEGORY_MAP: Record<string, string[]> = {
  "Computer Science": [
    "computer science",
    "software",
    "programming",
    "coding",
    "data science",
    "ai",
    "machine learning",
  ],
  Engineering: ["engineering", "mechanical", "electrical", "civil", "chemical"],
  Business: [
    "business",
    "mba",
    "entrepreneurship",
    "finance",
    "accounting",
    "economics",
  ],
  Medical: ["medical", "medicine", "health", "nursing", "pharmacy", "biology"],
  Arts: ["art", "design", "music", "film", "creative", "writing", "journalism"],
  Law: ["law", "legal", "jurisprudence", "llm"],
  Science: ["physics", "chemistry", "mathematics", "research"],
  Education: ["education", "teaching", "teacher"],
};

export const CATEGORY_PATTERNS: Array<[string, RegExp]> = Object.entries(
  CATEGORY_MAP,
).map(([category, keywords]) => [
  category,
  new RegExp(
    `\\b(?:${keywords
      .map((keyword) =>
        keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"),
      )
      .join("|")})\\b`,
    "i",
  ),
]);
