/**
 * Display-layer helpers for opportunity content.
 *
 * Two jobs:
 *  1. Express fit as a TIER, never a raw percentage. A percentage reads as
 *     win-odds, which Edutu cannot honestly claim.
 *  2. Clean scraped strings before they reach a learner: HTML entities,
 *     advert/navigation chrome, repeated calls to action, raw links, and
 *     deadline fragments smuggled into the location column.
 */

export type MatchTier = "strong" | "solid" | "possible" | "stretch";

export const MATCH_TIER_KEY: Record<
  MatchTier,
  { label: string; blurb: string }
> = {
  strong: {
    label: "detail.fit.tiers.strong",
    blurb: "detail.fit.tiers.strongBlurb",
  },
  solid: {
    label: "detail.fit.tiers.solid",
    blurb: "detail.fit.tiers.solidBlurb",
  },
  possible: {
    label: "detail.fit.tiers.possible",
    blurb: "detail.fit.tiers.possibleBlurb",
  },
  stretch: {
    label: "detail.fit.tiers.stretch",
    blurb: "detail.fit.tiers.stretchBlurb",
  },
};

export function getMatchTier(match?: number | null): MatchTier | null {
  if (typeof match !== "number" || !Number.isFinite(match) || match <= 0) {
    return null;
  }
  if (match >= 80) return "strong";
  if (match >= 60) return "solid";
  if (match >= 40) return "possible";
  return "stretch";
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  nbsp: " ",
  lt: "<",
  gt: ">",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

export function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(
      /&([a-zA-Z]+);/g,
      (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match,
    );
}

export function decodeMaybe(text?: string | null): string {
  return typeof text === "string" ? decodeHtmlEntities(text) : "";
}

const TRAILING_LABEL_RE =
  /[\s,;|·–—-]*\(?\b(?:application\s+deadline|deadline|work\s*mode|job\s*type|employment\s*type|duration|salary|stipend)s?\b\s*[:\-–—]?.*$/i;

export function cleanLocation(location?: string | null): string {
  const decoded = decodeMaybe(location);
  if (!decoded) return "";
  const stripped = decoded.replace(TRAILING_LABEL_RE, "");
  return stripped
    .replace(/\s+/g, " ")
    .replace(/[\s,;|·-]+$/, "")
    .trim();
}

const BLOCK_TAG_RE =
  /<\/?(?:article|aside|blockquote|br|div|footer|h[1-6]|header|li|main|nav|ol|p|section|table|tbody|td|th|thead|tr|ul)\b[^>]*>/gi;
const OTHER_TAG_RE = /<[^>]+>/g;
const RAW_URL_RE = /(?:https?:\/\/|www\.)\S+/gi;
const BULLET_PREFIX_RE = /^\s*(?:[-–—•●▪◦*✓✔☑→›»]+|\d+[.)]|[a-z][.)])\s*/i;

const NOISE_LINE_PATTERNS: RegExp[] = [
  /^(?:advertisement|advertorial|sponsored(?:\s+content)?|promoted(?:\s+content)?)\.?$/i,
  /^(?:apply\s*(?:now|here|online)?|click\s+here(?:\s+to\s+apply)?|register\s*(?:now|here)?|start\s+(?:your\s+)?application|visit\s+(?:the\s+)?(?:official\s+)?(?:site|website|portal)|view\s+(?:details|more)|read\s+more|continue\s+reading)\s*[.!»›→-]*$/i,
  /^(?:share(?:\s+this(?:\s+(?:post|article|opportunity))?)?|share\s+on\s+.+|related\s+(?:posts?|articles?|opportunities)|you\s+may\s+also\s+like|leave\s+a\s+comment|comments?)\s*[.!:-]*$/i,
  /^(?:subscribe|sign\s+up)(?:\s+to|\s+for)?\s+(?:our\s+)?(?:newsletter|mailing\s+list|updates?).*$/i,
  /^(?:follow|join)\s+(?:us|our)\s+(?:on\s+)?(?:facebook|instagram|linkedin|x|twitter|tiktok|youtube|whatsapp|telegram)(?:\s+(?:channel|group|community))?.*$/i,
  /^(?:join\s+(?:our\s+)?(?:whatsapp|telegram)(?:\s+(?:channel|group|community))?).*$/i,
  /^(?:home|about(?:\s+us)?|contact(?:\s+us)?|privacy\s+policy|cookie\s+policy|terms(?:\s+(?:and|&)\s+conditions|\s+of\s+(?:use|service))?|sitemap|login|log\s+in|sign\s+in|menu)(?:\s*[|•·/,:-]\s*(?:home|about(?:\s+us)?|contact(?:\s+us)?|privacy\s+policy|terms|sitemap|login|menu))*$/i,
  /^(?:all\s+rights\s+reserved|copyright\s+©?|©)\b.*$/i,
  /^(?:by\s+admin|posted\s+by|written\s+by)(?:\s+.+)?$/i,
  /^(?:source|photo\s+credit|image\s+credit)\s*:\s*(?:https?:\/\/|www\.).+$/i,
  /^(?:https?:\/\/|www\.)\S+$/i,
];

const INLINE_NOISE_PATTERNS: RegExp[] = [
  /\bBy\s+Admin\s+On\s+[A-Z][a-z]+\s+\d{1,2},\s+20\d{2}\b/gi,
  /\b(?:posted|written)\s+by\s+[^.!?\n]{1,80}[.!?]?/gi,
  /\b(?:read\s+more|continue\s+reading|share\s+this(?:\s+(?:post|article))?|related\s+posts?)\b/gi,
  /\b(?:join|follow)\s+(?:our|us\s+on)\s+(?:whatsapp|telegram|facebook|instagram|linkedin|twitter|x)(?:\s+(?:channel|group|community))?[^.!?\n]*[.!?]?/gi,
];

function normalizeWhitespace(value: string): string {
  return value
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}

function isNoiseLine(value: string): boolean {
  const text = value.trim();
  return !text || NOISE_LINE_PATTERNS.some((pattern) => pattern.test(text));
}

function contentKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(?:the|a|an)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanInlineNoise(value: string): string {
  let text = value;
  for (const pattern of INLINE_NOISE_PATTERNS)
    text = text.replace(pattern, " ");
  return normalizeWhitespace(text.replace(RAW_URL_RE, " "));
}

function splitSentences(value: string): string[] {
  const flat = normalizeWhitespace(value);
  if (!flat) return [];
  return flat
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function groupSentences(sentences: string[]): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  const flush = () => {
    if (current.length > 0) paragraphs.push(current.join(" ").trim());
    current = [];
    currentLength = 0;
  };

  for (const sentence of sentences) {
    const nextLength =
      currentLength + sentence.length + (current.length ? 1 : 0);
    if (current.length >= 2 || (current.length > 0 && nextLength > 320))
      flush();
    current.push(sentence);
    currentLength += sentence.length + (current.length > 1 ? 1 : 0);
  }
  flush();
  return paragraphs;
}

/**
 * Defensive, deterministic display cleanup. The API performs the authoritative
 * content refinement; this protects older cached rows and offline snapshots.
 */
export function cleanOpportunityNarrative(value?: string | null): string {
  const decoded = decodeMaybe(value)
    .replace(BLOCK_TAG_RE, "\n")
    .replace(OTHER_TAG_RE, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/\r\n?/g, "\n");

  if (!decoded.trim()) return "";

  const units = decoded.split(/\n+/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    return /\s[|·]\s/.test(trimmed) && trimmed.length < 180
      ? trimmed.split(/\s*[|·]\s*/)
      : [trimmed];
  });

  const seen = new Set<string>();
  const cleanedUnits: string[] = [];
  for (const unit of units) {
    const withoutBullet = unit.replace(BULLET_PREFIX_RE, "");
    if (isNoiseLine(withoutBullet)) continue;
    const cleaned = cleanInlineNoise(withoutBullet);
    if (!cleaned || isNoiseLine(cleaned)) continue;
    const key = contentKey(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cleanedUnits.push(cleaned);
  }

  const paragraphs = cleanedUnits.flatMap((unit) => {
    const sentences = splitSentences(unit).filter(
      (sentence) => !isNoiseLine(sentence),
    );
    if (sentences.length === 0) return [];
    return unit.length > 360 || sentences.length > 2
      ? groupSentences(sentences)
      : [sentences.join(" ")];
  });

  return paragraphs.join("\n\n").slice(0, 6000).trim();
}

export function cleanOpportunityListForDisplay(
  value?: Array<string | null | undefined> | null,
  maxItems = 20,
): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of value) {
    const decoded = decodeMaybe(raw)
      .replace(BLOCK_TAG_RE, "\n")
      .replace(OTHER_TAG_RE, " ");
    const candidates = decoded.split(/\n+|(?=\s*[•▪◦✓✔☑]\s+)/);
    for (const candidate of candidates) {
      const cleaned = cleanInlineNoise(candidate.replace(BULLET_PREFIX_RE, ""));
      if (!cleaned || isNoiseLine(cleaned)) continue;
      const key = contentKey(cleaned);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(cleaned.slice(0, 500));
      if (result.length >= maxItems) return result;
    }
  }

  return result;
}

export function needsProgressiveDisclosure(
  value: string,
  maxChars = 420,
  maxParagraphs = 2,
): boolean {
  const cleaned = cleanOpportunityNarrative(value);
  if (!cleaned) return false;
  const paragraphs = cleaned.split(/\n{2,}/).filter(Boolean);
  return cleaned.length > maxChars || paragraphs.length > maxParagraphs;
}

function normaliseForComparison(value?: string | null): string {
  return cleanOpportunityNarrative(value)
    .replace(/\s+/g, " ")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Keep the compact summary only when it adds decision context. A summary that
 * repeats the opening description adds reading time without adding hierarchy.
 */
export function shouldShowOpportunitySummary(
  summary?: string | null,
  description?: string | null,
): boolean {
  const cleanSummary = normaliseForComparison(summary);
  if (!cleanSummary) return false;

  const cleanDescription = normaliseForComparison(description);
  if (!cleanDescription) return true;
  if (
    cleanSummary === cleanDescription ||
    cleanDescription.startsWith(cleanSummary) ||
    cleanSummary.startsWith(cleanDescription)
  ) {
    return false;
  }

  const summaryTokens = new Set(
    cleanSummary.split(" ").filter((token) => token.length > 2),
  );
  const descriptionTokens = new Set(
    cleanDescription.split(" ").filter((token) => token.length > 2),
  );
  if (summaryTokens.size === 0) return false;

  let sharedTokens = 0;
  for (const token of summaryTokens) {
    if (descriptionTokens.has(token)) sharedTokens += 1;
  }

  return sharedTokens / summaryTokens.size < 0.78;
}

export function previewText(value: string, maxChars = 140): string {
  const flat = cleanOpportunityNarrative(value).replace(/\s+/g, " ").trim();
  if (flat.length <= maxChars) return flat;
  const cut = flat.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}
