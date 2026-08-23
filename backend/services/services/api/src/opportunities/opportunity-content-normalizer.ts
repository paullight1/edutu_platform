export interface OpportunityContentInput {
  summary?: unknown;
  description?: unknown;
  requirements?: unknown;
  benefits?: unknown;
  applicationProcess?: unknown;
  application_process?: unknown;
}

export interface OpportunityContentOptions {
  /** True only when the enrichment had useful source-page text. */
  sourceBacked?: boolean;
  /** Keep structured lists when no source page was available. Defaults to true. */
  allowUnverifiedLists?: boolean;
}

export interface OpportunityContentDiagnostics {
  removedNoise: number;
  removedDuplicates: number;
  paragraphCount: number;
  sentenceCount: number;
  sourceBacked: boolean;
}

export interface RefinedOpportunityContent {
  summary: string;
  description: string;
  requirements: string[];
  benefits: string[];
  applicationProcess: string[];
  qualityScore: number;
  needsReview: boolean;
  diagnostics: OpportunityContentDiagnostics;
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

const BLOCK_TAG_RE = /<\/?(?:article|aside|blockquote|br|div|footer|h[1-6]|header|li|main|nav|ol|p|section|table|tbody|td|th|thead|tr|ul)\b[^>]*>/gi;
const OTHER_TAG_RE = /<[^>]+>/g;
const CONTROL_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const BULLET_PREFIX_RE = /^\s*(?:[-–—•●▪◦*✓✔☑→›»]+|\d+[.)]|[a-z][.)])\s*/i;
const RAW_URL_RE = /(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_ONLY_RE = /^\s*[\w.+-]+@[\w.-]+\.[a-z]{2,}\s*$/i;

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
  /^https?:\/\/\S+$/i,
  /^www\.\S+$/i,
];

const INLINE_NOISE_PATTERNS: RegExp[] = [
  /\bBy\s+Admin\s+On\s+[A-Z][a-z]+\s+\d{1,2},\s+20\d{2}\b/gi,
  /\b(?:posted|written)\s+by\s+[^.!?\n]{1,80}[.!?]?/gi,
  /\b(?:read\s+more|continue\s+reading|share\s+this(?:\s+(?:post|article))?|related\s+posts?)\b/gi,
  /\b(?:join|follow)\s+(?:our|us\s+on)\s+(?:whatsapp|telegram|facebook|instagram|linkedin|twitter|x)(?:\s+(?:channel|group|community))?[^.!?\n]*[.!?]?/gi,
];

const SECTION_HEADING_RE = /^(?:about(?:\s+the\s+(?:opportunity|programme|program))?|overview|description|eligibility|eligibility\s+criteria|requirements?|who\s+can\s+apply|benefits?|what\s+you(?:'|’)ll\s+gain|application\s+(?:process|procedure|steps?)|how\s+to\s+apply|deadline|important\s+dates?|key\s+information|program(?:me)?\s+details)\s*:?$/i;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      const code = Number.parseInt(decimal, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function flattenUnknown(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenUnknown);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(flattenUnknown);
  }
  return [String(value)];
}

function normaliseWhitespace(value: string): string {
  return value
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/ {2,}/g, " ")
    .trim();
}

function cleanInlineNoise(value: string): { text: string; removed: number } {
  let text = value;
  let removed = 0;

  for (const pattern of INLINE_NOISE_PATTERNS) {
    text = text.replace(pattern, (match) => {
      if (match.trim()) removed += 1;
      return " ";
    });
  }

  text = text.replace(RAW_URL_RE, (match) => {
    removed += 1;
    return " ";
  });

  return { text: normaliseWhitespace(text), removed };
}

function isNoiseLine(value: string): boolean {
  const text = value.trim();
  if (!text || EMAIL_ONLY_RE.test(text) || SECTION_HEADING_RE.test(text)) return true;
  return NOISE_LINE_PATTERNS.some((pattern) => pattern.test(text));
}

function contentKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(?:the|a|an)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(value: string): string[] {
  const normalised = normaliseWhitespace(value);
  if (!normalised) return [];
  const sentences = normalised.split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/u);
  return sentences.map((sentence) => sentence.trim()).filter(Boolean);
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
    const nextLength = currentLength + (current.length > 0 ? 1 : 0) + sentence.length;
    if (current.length >= 2 || (current.length > 0 && nextLength > 320)) flush();
    current.push(sentence);
    currentLength += sentence.length + (current.length > 1 ? 1 : 0);
  }
  flush();
  return paragraphs;
}

function sentenceCount(value: string): number {
  return splitSentences(value.replace(/\n+/g, " ")).length;
}

function truncateWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value.trim();
  const sliced = words.slice(0, maxWords).join(" ").replace(/[,:;\-–—]+$/, "");
  return `${sliced}.`;
}

function cleanNarrativeInternal(value: unknown): {
  text: string;
  removedNoise: number;
  removedDuplicates: number;
} {
  const raw = flattenUnknown(value).join("\n");
  if (!raw.trim()) return { text: "", removedNoise: 0, removedDuplicates: 0 };

  const decoded = decodeHtmlEntities(raw)
    .replace(CONTROL_CHAR_RE, "")
    .replace(BLOCK_TAG_RE, "\n")
    .replace(OTHER_TAG_RE, " ")
    .replace(/\r\n?/g, "\n");

  const sourceUnits = decoded
    .split(/\n+/)
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) return [];
      // Aggregator pages often flatten a navigation run with pipes.
      if (/\s[|·]\s/.test(trimmed) && trimmed.length < 180) {
        return trimmed.split(/\s*[|·]\s*/);
      }
      return [trimmed];
    });

  const seen = new Set<string>();
  const cleanUnits: string[] = [];
  let removedNoise = 0;
  let removedDuplicates = 0;

  for (const unit of sourceUnits) {
    const withoutBullet = unit.replace(BULLET_PREFIX_RE, "");
    if (isNoiseLine(withoutBullet)) {
      removedNoise += 1;
      continue;
    }

    const inline = cleanInlineNoise(withoutBullet);
    removedNoise += inline.removed;
    if (!inline.text || isNoiseLine(inline.text)) {
      if (inline.text) removedNoise += 1;
      continue;
    }

    const key = contentKey(inline.text);
    if (!key) continue;
    if (seen.has(key)) {
      removedDuplicates += 1;
      continue;
    }
    seen.add(key);
    cleanUnits.push(inline.text);
  }

  const paragraphs: string[] = [];
  for (const unit of cleanUnits) {
    const sentences = splitSentences(unit).filter((sentence) => !isNoiseLine(sentence));
    if (sentences.length === 0) continue;
    if (unit.length > 360 || sentences.length > 2) {
      paragraphs.push(...groupSentences(sentences));
    } else {
      paragraphs.push(sentences.join(" "));
    }
  }

  const finalSeen = new Set<string>();
  const finalParagraphs: string[] = [];
  for (const paragraph of paragraphs) {
    const text = normaliseWhitespace(paragraph);
    const key = contentKey(text);
    if (!text || !key) continue;
    if (finalSeen.has(key)) {
      removedDuplicates += 1;
      continue;
    }
    finalSeen.add(key);
    finalParagraphs.push(text);
  }

  return {
    text: finalParagraphs.join("\n\n").slice(0, 6000).trim(),
    removedNoise,
    removedDuplicates,
  };
}

/**
 * Defensive, deterministic cleanup for user-facing opportunity prose. It does
 * not invent content: it only removes page chrome, promotional calls-to-action,
 * raw URLs and duplicates, then restores readable paragraph breaks.
 */
export function cleanOpportunityNarrative(value: unknown): string {
  return cleanNarrativeInternal(value).text;
}

/** Clean a requirements/benefits/application list while preserving facts. */
export function cleanOpportunityList(value: unknown, maxItems = 20): string[] {
  const candidates = flattenUnknown(value).flatMap((entry) =>
    decodeHtmlEntities(entry)
      .replace(CONTROL_CHAR_RE, "")
      .replace(BLOCK_TAG_RE, "\n")
      .replace(OTHER_TAG_RE, " ")
      .split(/\n+|(?<=\.)\s*(?=(?:[-•*]|\d+[.)])\s*)|\s*;\s*/u),
  );

  const result: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const withoutBullet = candidate.replace(BULLET_PREFIX_RE, "");
    if (!withoutBullet.trim() || isNoiseLine(withoutBullet)) continue;
    const inline = cleanInlineNoise(withoutBullet).text;
    const text = normaliseWhitespace(inline).slice(0, 500);
    if (!text || text.length < 3 || isNoiseLine(text)) continue;
    const key = contentKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxItems) break;
  }

  return result;
}

function buildSummary(summary: unknown, description: string): string {
  const cleanedSummary = cleanOpportunityNarrative(summary).replace(/\n+/g, " ");
  const summaryWords = cleanedSummary.split(/\s+/).filter(Boolean);
  if (summaryWords.length >= 20 && summaryWords.length <= 55) return cleanedSummary;
  if (summaryWords.length > 55) return truncateWords(cleanedSummary, 55);

  const sentences = splitSentences(description.replace(/\n+/g, " "));
  if (sentences.length === 0) return cleanedSummary;

  let candidate = "";
  for (const sentence of sentences) {
    const next = candidate ? `${candidate} ${sentence}` : sentence;
    if (next.split(/\s+/).filter(Boolean).length > 55) break;
    candidate = next;
    if (candidate.split(/\s+/).filter(Boolean).length >= 24) break;
  }

  if (!candidate) candidate = sentences[0];
  return truncateWords(candidate, 55);
}

function scoreContent(
  summary: string,
  description: string,
  requirements: string[],
  benefits: string[],
  applicationProcess: string[],
): number {
  const summaryWords = summary.split(/\s+/).filter(Boolean).length;
  const sentences = sentenceCount(description);
  const paragraphs = description ? description.split(/\n\n+/).filter(Boolean).length : 0;
  let score = 0;

  if (summaryWords >= 20 && summaryWords <= 55) score += 20;
  else if (summaryWords >= 12) score += 10;

  if (description.length >= 240) score += 15;
  else if (description.length >= 120) score += 8;
  if (sentences >= 3) score += 15;
  else if (sentences >= 2) score += 8;
  if (paragraphs >= 2) score += 10;
  else if (description) score += 4;

  if (requirements.length > 0) score += 15;
  if (benefits.length > 0) score += 15;
  if (applicationProcess.length > 0) score += 10;

  const hasPresentationNoise =
    /<[^>]+>|https?:\/\/|\b(?:advertisement|share this|privacy policy|apply now)\b/i.test(
      `${summary}\n${description}`,
    );
  if (!hasPresentationNoise) score += 10;

  return Math.min(score, 100);
}

/**
 * Produce the canonical content payload consumed by the API, scraper and
 * backfill policy. Structured lists can be rejected when AI did not have a
 * real source page, preventing plausible-sounding inferred facts from being
 * promoted to verified requirements or benefits.
 */
export function refineOpportunityContent(
  input: OpportunityContentInput,
  options: OpportunityContentOptions = {},
): RefinedOpportunityContent {
  const sourceBacked = options.sourceBacked === true;
  const allowUnverifiedLists = options.allowUnverifiedLists !== false;
  const narrative = cleanNarrativeInternal(input.description);
  const description = narrative.text;
  const summary = buildSummary(input.summary, description);

  const acceptLists = sourceBacked || allowUnverifiedLists;
  const requirements = acceptLists ? cleanOpportunityList(input.requirements) : [];
  const benefits = acceptLists ? cleanOpportunityList(input.benefits) : [];
  const applicationProcess = acceptLists
    ? cleanOpportunityList(input.applicationProcess ?? input.application_process)
    : [];

  const qualityScore = scoreContent(
    summary,
    description,
    requirements,
    benefits,
    applicationProcess,
  );
  const paragraphs = description
    ? description.split(/\n\n+/).filter(Boolean).length
    : 0;

  return {
    summary,
    description,
    requirements,
    benefits,
    applicationProcess,
    qualityScore,
    needsReview: qualityScore < 65 || (!sourceBacked && !allowUnverifiedLists),
    diagnostics: {
      removedNoise: narrative.removedNoise,
      removedDuplicates: narrative.removedDuplicates,
      paragraphCount: paragraphs,
      sentenceCount: sentenceCount(description),
      sourceBacked,
    },
  };
}
