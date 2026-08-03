/**
 * Send-time text screener for group messages.
 *
 * Deliberately NOT the scraper's scam gate: that one grades metadata which
 * already carries LLM-extracted `red_flags` and cannot screen raw prose. This
 * shares its vocabulary and its two-signal threshold, nothing else.
 *
 * Two independent signals must fire before a message is blocked. One alone is
 * how "Is there an application fee?" gets a legitimate question rejected.
 *
 * INDEPENDENCE IS LOAD-BEARING. The categories below must stay disjoint: no
 * literal alternative may appear in two patterns. Previously "bank details"
 * and "bvn" sat in both OFF_PLATFORM and CREDENTIALS, so a single mention of
 * one concept scored two signals and blocked on its own — exactly the
 * vocabulary an honest question about a stipend's KYC step uses.
 * `message-screen.spec.ts` asserts disjointness; if you add a term, add it to
 * one list only.
 */
const MONEY_DEMAND =
  /\b(?:processing|registration|application|admin)\s+fee\b|\bpay(?:ment)?\s+(?:me|us|first|now)\b|\$\s?\d|₦\s?\d|\bN\d{3,}\b|\b\d[\d,]*(?:\.\d+)?\s*(?:naira|ngn)\b|\b\d[\d,]*\s?k\b/i;
const URGENCY =
  /\bguarantee(?:d|s)?\b|\bslot\b|\blimited\b|\bact now\b|\bonly today\b|\bhurry\b/i;
/** Moving the conversation off Edutu: a handle, an app, a raw phone number. */
const OFF_PLATFORM = /\bwhats\s?app\b|\btelegram\b|\bdm me\b|\+\d{7,}/i;
/** Harvesting secrets or banking identity. Never also an OFF_PLATFORM term. */
const CREDENTIALS =
  /\bpassword\b|\botp\b|\bpin\b|\bbank (?:details|account)\b|\bbvn\b/i;

/**
 * The four disjoint signal categories, exported so the spec can prove they
 * stay disjoint. Order is presentational only; scoring counts, never ranks.
 */
export const SIGNAL_CATEGORIES: ReadonlyArray<{
  name: string;
  pattern: RegExp;
}> = [
  { name: "money_demand", pattern: MONEY_DEMAND },
  { name: "urgency", pattern: URGENCY },
  { name: "off_platform", pattern: OFF_PLATFORM },
  { name: "credentials", pattern: CREDENTIALS },
];

export const SIGNAL_THRESHOLD = 2;

export function screenMessage(body: string): {
  allowed: boolean;
  reason?: string;
} {
  const text = (body || "").trim();
  if (!text) return { allowed: false, reason: "empty" };

  const signals = SIGNAL_CATEGORIES.filter((category) =>
    category.pattern.test(text),
  ).length;

  if (signals >= SIGNAL_THRESHOLD) {
    return { allowed: false, reason: "scam_pattern" };
  }
  return { allowed: true };
}
