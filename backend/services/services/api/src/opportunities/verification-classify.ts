/**
 * Pure HTTP-outcome classification for opportunity verification.
 *
 * Credibility rule: the only evidence that an opportunity is gone is a page
 * that is genuinely dead (404/410) or that explicitly says applications are
 * closed. A WAF/anti-bot block (403/429/401), a server error (5xx), or a
 * network failure proves nothing — the listing may be perfectly live behind
 * Cloudflare. Those "inconclusive" outcomes must never close a row or push it
 * out of the public feed; they schedule a retry (and, upstream, a relay fetch).
 */

export type FetchClass =
  | "ok"
  | "dead"
  | "blocked"
  | "server_error"
  | "network_error";

export function classifyHttpStatus(status: number | null): FetchClass {
  if (status === null) return "network_error";
  if (status >= 200 && status < 400) return "ok";
  // Only these two definitively mean the resource no longer exists.
  if (status === 404 || status === 410) return "dead";
  if (status >= 500) return "server_error";
  // Everything else in the 4xx range (403/429/401/451/400/405/…) is a block or
  // a request the origin rejected — inconclusive, retryable, often relay-able.
  return "blocked";
}

/** Inconclusive fetches must not change an opportunity's live/closed status. */
export function isInconclusive(cls: FetchClass): boolean {
  return cls === "blocked" || cls === "server_error" || cls === "network_error";
}

export type HealthDecisionInput = {
  cls: FetchClass;
  currentStatus: string | null;
  currentBrokenCount: number | null;
};

export type HealthDecision = {
  verificationStatus: "verified" | "stale" | "broken_link";
  opportunityStatus: string;
  brokenLinkCount: number;
  recheckHours: number;
};

/**
 * A dead page must strike twice before we demote an opportunity to
 * pending_review — a single 404 from a flaky CDN/edge shouldn't hide a real
 * listing. Blocks/errors never count toward this at all.
 */
const DEAD_STRIKES_TO_DEMOTE = 2;

export function decideHealthOutcome(
  input: HealthDecisionInput,
): HealthDecision {
  const current = Math.max(0, Number(input.currentBrokenCount ?? 0));
  const liveStatus = input.currentStatus || "active";

  if (input.cls === "ok") {
    return {
      verificationStatus: "verified",
      opportunityStatus: "active",
      brokenLinkCount: 0,
      recheckHours: 24 * 7,
    };
  }

  if (input.cls === "dead") {
    const strikes = current + 1;
    const confirmed = strikes >= DEAD_STRIKES_TO_DEMOTE;
    return {
      verificationStatus: confirmed ? "broken_link" : "stale",
      opportunityStatus: confirmed ? "pending_review" : liveStatus,
      brokenLinkCount: strikes,
      recheckHours: confirmed ? 24 * 7 : 24,
    };
  }

  // Inconclusive: blocked / server_error / network_error. Keep the opportunity
  // exactly as-is and retry soon; do not touch the broken-link counter.
  return {
    verificationStatus: "stale",
    opportunityStatus: liveStatus,
    brokenLinkCount: current,
    recheckHours: 12,
  };
}
