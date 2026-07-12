/**
 * Shared deadline extraction + parsing used by both the scraper (at ingest
 * time) and the verification job (at re-check time). Keeping one parser means
 * a deadline refreshed from a live page goes through exactly the same rules
 * as one captured at scrape time.
 */

const MONTH_PATTERN =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const MONTH_NAME_RE = `${MONTH_PATTERN}|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec`;

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export type DeadlineConfidence = "explicit" | "inferred" | "rolling" | "unknown";

export interface ParsedDeadline {
  /** ISO YYYY-MM-DD, or null when nothing trustworthy was found. */
  date: string | null;
  /**
   * - explicit: the source stated a full date including a year
   * - inferred: the year was projected (title edition year or next occurrence)
   * - rolling: the source says rolling/ongoing/no deadline
   * - unknown: no deadline could be extracted at all
   */
  confidence: DeadlineConfidence;
}

/**
 * Parse a scraped deadline fragment into a trustworthy ISO date.
 *
 * Scraped deadlines arrive as messy fragments ("Deadline: 15th March 2026
 * at 11:59 PM GMT", "March 5"). `new Date(...)` on those either fails
 * (losing a real deadline) or misparses ("March 5" → year 2001). This
 * parser extracts explicit date patterns, infers the next occurrence when
 * the year is omitted, and rejects implausible results — a wrong date is
 * far more confusing to users than no date.
 */
export function parseDeadlineDetailed(
  raw: string | null | undefined,
  contextYear: number | null = null,
): ParsedDeadline {
  if (!raw) return { date: null, confidence: "unknown" };
  const text = String(raw).replace(/\s+/g, " ").trim();
  if (!text) return { date: null, confidence: "unknown" };
  // Legitimate "no fixed deadline" phrasings — not a parse failure.
  if (
    /\b(rolling|ongoing|open\s+until\s+filled|no\s+deadline|continuous|year[-\s]round|always\s+open)\b/i.test(
      text,
    )
  ) {
    return { date: null, confidence: "rolling" };
  }

  const cleaned = text.replace(/(\d{1,2})(?:st|nd|rd|th)\b/gi, "$1");
  const monthIndex = (name: string) => {
    const idx = MONTHS.findIndex((m) =>
      m.startsWith(name.toLowerCase().slice(0, 3)),
    );
    return idx >= 0 ? idx : null;
  };

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;

  const iso = cleaned.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  const dayFirst = cleaned.match(
    new RegExp(
      `\\b(\\d{1,2})\\s+(${MONTH_NAME_RE})\\.?(?:\\s*,?\\s+(20\\d{2}))?`,
      "i",
    ),
  );
  const monthFirst = cleaned.match(
    new RegExp(
      `\\b(${MONTH_NAME_RE})\\.?\\s+(\\d{1,2})(?:\\s*,?\\s+(20\\d{2}))?`,
      "i",
    ),
  );
  const numeric = cleaned.match(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/);

  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]) - 1;
    day = Number(iso[3]);
  } else if (dayFirst) {
    day = Number(dayFirst[1]);
    month = monthIndex(dayFirst[2]);
    year = dayFirst[3] ? Number(dayFirst[3]) : null;
  } else if (monthFirst) {
    month = monthIndex(monthFirst[1]);
    day = Number(monthFirst[2]);
    year = monthFirst[3] ? Number(monthFirst[3]) : null;
  } else if (numeric) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    year = Number(numeric[3]);
    // Disambiguate d/m vs m/d; when both are plausible, day-first — the
    // engine's sources overwhelmingly use international date order.
    if (a > 12) {
      day = a;
      month = b - 1;
    } else if (b > 12) {
      month = a - 1;
      day = b;
    } else {
      day = a;
      month = b - 1;
    }
  }

  if (month === null || day === null || day < 1 || day > 31 || month > 11) {
    return { date: null, confidence: "unknown" };
  }

  const now = new Date();
  let yearInferred = false;
  if (year === null && contextYear && contextYear >= 2000) {
    // The page names its edition year (e.g. in the title) — trust it, but it
    // is still a projection, not a stated date.
    year = contextYear;
    yearInferred = true;
  }
  if (year === null) {
    // No year stated anywhere → the next occurrence of that day/month.
    year = now.getUTCFullYear();
    const candidate = new Date(Date.UTC(year, month, day));
    if (candidate.getTime() < now.getTime() - 24 * 3600 * 1000) {
      year += 1;
    }
    yearInferred = true;
  }

  const parsed = new Date(Date.UTC(year, month, day));
  if (
    isNaN(parsed.getTime()) ||
    parsed.getUTCMonth() !== month || // rejects overflow like 31 February
    parsed.getUTCDate() !== day
  ) {
    return { date: null, confidence: "unknown" };
  }

  // Plausibility window: older than a year or further out than three years
  // is almost certainly a misparse or stale page — drop it.
  const yearMs = 365 * 24 * 3600 * 1000;
  if (
    parsed.getTime() < now.getTime() - yearMs ||
    parsed.getTime() > now.getTime() + 3 * yearMs
  ) {
    return { date: null, confidence: "unknown" };
  }

  return {
    date: parsed.toISOString().split("T")[0],
    confidence: yearInferred ? "inferred" : "explicit",
  };
}

/** Pull the most likely deadline fragment out of free page text. */
export function extractDeadlineText(text: string): string | null {
  if (!text) return null;
  const patterns = [
    /(?:application\s+)?deadline[:\s]*([^\n,]{5,40})/i,
    /(?:applications?\s+)?closes?\s+(?:on\s+)?([^\n,]{5,40})/i,
    /closing\s+date[:\s]*([^\n,]{5,40})/i,
    /apply\s+(?:before|by)\s+([^\n,]{5,40})/i,
    new RegExp(`(${MONTH_PATTERN})\\s+\\d{1,2},?\\s+\\d{4}`, "i"),
    new RegExp(`\\d{1,2}\\s+(${MONTH_PATTERN})\\s+\\d{4}`, "i"),
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0].trim().substring(0, 60);
  }
  return null;
}

/**
 * Signals on a live page that an opportunity has genuinely closed, as
 * opposed to merely having a past date somewhere in the copy.
 */
export function pageSaysClosed(text: string): boolean {
  if (!text) return false;
  return /\b(applications?\s+(?:are\s+)?(?:now\s+)?closed|this\s+(?:opportunity|program|programme|position|call)\s+(?:is|has)\s+(?:now\s+)?closed|no\s+longer\s+accepting|submissions?\s+(?:are\s+)?closed|deadline\s+has\s+passed|applications?\s+have\s+ended)\b/i.test(
    text,
  );
}
