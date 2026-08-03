/**
 * Send-time text screener for group messages.
 *
 * Deliberately NOT the scraper's scam gate: that one grades metadata which
 * already carries LLM-extracted `red_flags` and cannot screen raw prose. This
 * shares its vocabulary and its two-signal threshold, nothing else.
 *
 * Two independent signals must fire before a message is blocked. One alone is
 * how "Is there an application fee?" gets a legitimate question rejected.
 */
const MONEY_DEMAND =
  /\b(processing|registration|application|admin)\s+fee\b|\bpay(?:ment)?\s+(?:me|us|first|now)\b|\$\s?\d|\bN\d{3,}\b/i;
const URGENCY =
  /\bguarantee(?:d)?\b|\bslot\b|\blimited\b|\bact now\b|\bonly today\b|\bhurry\b/i;
const OFF_PLATFORM =
  /\bwhats\s?app\b|\btelegram\b|\bdm me\b|\bbank (?:details|account)\b|\bbvn\b|\+\d{7,}/i;
const CREDENTIALS =
  /\bpassword\b|\botp\b|\bpin\b|\bbank (?:details|account)\b|\bbvn\b/i;

export function screenMessage(body: string): {
  allowed: boolean;
  reason?: string;
} {
  const text = (body || "").trim();
  if (!text) return { allowed: false, reason: "empty" };

  const signals = [
    MONEY_DEMAND.test(text),
    URGENCY.test(text),
    OFF_PLATFORM.test(text),
    CREDENTIALS.test(text),
  ].filter(Boolean).length;

  if (signals >= 2) {
    return { allowed: false, reason: "scam_pattern" };
  }
  return { allowed: true };
}
